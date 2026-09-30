// AdAstra: Genesis Realm v2 — Hazine Defteri (Treasury Ledger)
// ============================================================================
// EKONOMİK ANAYASA — YASA 1: "Ödül basılmaz, transfer edilir."
//
// Hiçbir modül `state.adAstraBalance += x` yazmaz. Her ödül bu defterden
// withdraw() ile çekilir. Havuzda para yoksa ödül otomatik olarak küçülür.
// Bu, oyunun sonsuz para basma yollarını (zindan farmı, kolezyum, world boss)
// yapısal olarak imkânsız kılar: dağıtılan toplam, biriken toplamı aşamaz.
// ============================================================================

import { GAME_CONFIG } from './config.js';
import { readJSON, writeJSON, removeJSON } from './storage.js';

const POOL_IDS = ['dungeon', 'arena', 'worldBoss', 'ammBuyback', 'carnival', 'quest'];

export class TreasuryLedger {
  constructor() {
    this.storageKey = 'adastra_treasury_ledger_v3';
    this.state = this.load();
  }

  load() {
    const seed = () => ({
      // Görev kasası 30 Eylül 2026'da eklendi (görev ödülleri + ücretsiz oyuncu havuzu); eski kayıtlara tohumuyla eklenir
      pools: { dungeon: 14000000, arena: 8000000, worldBoss: 8000000, ammBuyback: 6000000, carnival: 4000000, quest: 8000000 },
      lifetimeDeposited: 0,
      lifetimeWithdrawn: 0,
      lifetimeBurned: 0,
      // Havuz bazında toplam giriş/çıkış — çözünürlük oranı (solvency) için
      inflow: { dungeon: 0, arena: 0, worldBoss: 0, ammBuyback: 0, carnival: 0, quest: 0 },
      outflow: { dungeon: 0, arena: 0, worldBoss: 0, ammBuyback: 0, carnival: 0, quest: 0 },
      // Ödül ölçekleme geçmişi (panelde gösterilir)
      lastScaleFactor: 1
    });

    if (typeof localStorage === 'undefined') return seed();
    const { data: parsed } = readJSON(this.storageKey);
    if (!parsed) return seed();
    try {
      const base = seed();
      return {
        ...base,
        ...parsed,
        pools: { ...base.pools, ...(parsed.pools || {}) },
        inflow: { ...base.inflow, ...(parsed.inflow || {}) },
        outflow: { ...base.outflow, ...(parsed.outflow || {}) }
      };
    } catch (e) {
      console.error('Treasury ledger parse error, reseeding:', e);
      return seed();
    }
  }

  save() {
    if (typeof localStorage === 'undefined') return;
    writeJSON(this.storageKey, this.state);
  }

  // ---------------------------------------------------------------------
  // GİRİŞ: Oyuncu harcamasının hazine payı (yakım, UBI ve telif dışındaki kısım) kasalara bölünür
  // ---------------------------------------------------------------------
  deposit(treasuryShare) {
    const amount = Number(treasuryShare);
    if (!isFinite(amount) || amount <= 0) return { allocations: {} };

    const alloc = GAME_CONFIG.TREASURY_ALLOCATION;
    const allocations = {};
    for (const id of POOL_IDS) {
      const cut = amount * (alloc[id] || 0);
      this.state.pools[id] = (this.state.pools[id] || 0) + cut;
      this.state.inflow[id] = (this.state.inflow[id] || 0) + cut;
      allocations[id] = cut;
    }
    this.state.lifetimeDeposited += amount;
    this.save();
    return { allocations };
  }

  // Belirli bir kasaya doğrudan giriş (ör. zindan kapı harcının tamamı zindan kasasına)
  depositTo(poolId, amount) {
    const v = Number(amount);
    if (!POOL_IDS.includes(poolId) || !isFinite(v) || v <= 0) return 0;
    this.state.pools[poolId] = (this.state.pools[poolId] || 0) + v;
    this.state.inflow[poolId] = (this.state.inflow[poolId] || 0) + v;
    this.state.lifetimeDeposited += v;
    this.save();
    return v;
  }

  recordBurn(amount) {
    if (!isFinite(amount) || amount <= 0) return;
    this.state.lifetimeBurned += amount;
    this.save();
  }

  // ---------------------------------------------------------------------
  // ÇIKIŞ: Ödül talebi. Havuz yetersizse ORANTILI olarak küçültülür.
  // Dönen değer, oyuncunun gerçekten alacağı miktardır.
  // ---------------------------------------------------------------------
  withdraw(poolId, requested) {
    const want = Number(requested);
    if (!POOL_IDS.includes(poolId) || !isFinite(want) || want <= 0) {
      return { granted: 0, requested: Math.max(0, want || 0), scaleFactor: 0, depleted: true };
    }

    const available = this.state.pools[poolId] || 0;
    const floorRatio = GAME_CONFIG.TREASURY_MIN_PAYOUT_RATIO;

    // Bir tek ödül havuzun tamamını süpüremez: tek seferde en fazla %2'si.
    const singleDrawCap = available * GAME_CONFIG.TREASURY_SINGLE_DRAW_CAP;
    let granted = Math.min(want, singleDrawCap);

    // Havuz kritik seviyeye düşerse ödüller kademeli küçülür (yumuşak iniş)
    const health = this.getPoolHealth(poolId);
    if (health < 1) {
      granted *= Math.max(floorRatio, health);
    }

    granted = Math.max(0, Math.min(granted, available));
    if (granted <= 0) {
      return { granted: 0, requested: want, scaleFactor: 0, depleted: true };
    }

    this.state.pools[poolId] = available - granted;
    this.state.outflow[poolId] = (this.state.outflow[poolId] || 0) + granted;
    this.state.lifetimeWithdrawn += granted;
    this.state.lastScaleFactor = granted / want;
    this.save();

    return {
      granted,
      requested: want,
      scaleFactor: granted / want,
      depleted: false,
      poolRemaining: this.state.pools[poolId]
    };
  }

  // Havuz sağlığı: hedef rezervin ne kadarı duruyor? (1 = tam, 0 = boş)
  getPoolHealth(poolId) {
    const target = GAME_CONFIG.TREASURY_TARGET_RESERVE[poolId] || 1;
    return Math.max(0, Math.min(1, (this.state.pools[poolId] || 0) / target));
  }

  getPool(poolId) {
    return this.state.pools[poolId] || 0;
  }

  // AMM fiyat desteği için buyback bütçesi çekilir
  drawBuyback(amount) {
    const available = this.state.pools.ammBuyback || 0;
    const granted = Math.max(0, Math.min(Number(amount) || 0, available));
    if (granted <= 0) return 0;
    this.state.pools.ammBuyback = available - granted;
    this.state.outflow.ammBuyback += granted;
    this.save();
    return granted;
  }

  getSummary() {
    const pools = POOL_IDS.map(id => ({
      id,
      name: GAME_CONFIG.TREASURY_POOL_NAMES[id] || id,
      balance: this.state.pools[id] || 0,
      target: GAME_CONFIG.TREASURY_TARGET_RESERVE[id] || 0,
      health: this.getPoolHealth(id),
      inflow: this.state.inflow[id] || 0,
      outflow: this.state.outflow[id] || 0
    }));

    const totalBalance = pools.reduce((s, p) => s + p.balance, 0);
    const avgHealth = pools.reduce((s, p) => s + p.health, 0) / pools.length;

    return {
      pools,
      totalBalance,
      avgHealth,
      lifetimeDeposited: this.state.lifetimeDeposited,
      lifetimeWithdrawn: this.state.lifetimeWithdrawn,
      lifetimeBurned: this.state.lifetimeBurned,
      // Ödeme gücü: girenin ne kadarı hâlâ dağıtılabilir durumda
      solvency: this.state.lifetimeDeposited > 0
        ? 1 - (this.state.lifetimeWithdrawn / this.state.lifetimeDeposited)
        : 1
    };
  }

  reset() {
    if (typeof localStorage !== 'undefined') removeJSON(this.storageKey);
    this.state = this.load();
    this.save();
  }

  // 🏛️ Krallık Hazinesi Kasalarını İlk 40M $ADASTRA Tohum Dağıtımına Sıfırla
  resetToSeed() {
    this.reset();
  }
}

export const treasury = new TreasuryLedger();
