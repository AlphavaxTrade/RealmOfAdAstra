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

// v2 (R3): kasalar ve tohumlar config'ten (zindan, kolezyum, boss, geri alım, karnaval, görev, Fatih, Konsey, Universe rezervi)
const SEEDS = GAME_CONFIG.TREASURY_SEED || { dungeon: 14000000, arena: 8000000, worldBoss: 8000000, ammBuyback: 6000000, carnival: 4000000, quest: 8000000 };
const POOL_IDS = Object.keys(SEEDS);
const LOCKED = new Set(GAME_CONFIG.TREASURY_LOCKED_POOLS || []);
const zeroPools = () => Object.fromEntries(POOL_IDS.map(id => [id, 0]));

export class TreasuryLedger {
  constructor() {
    // v4: v2 kasaları (yeni tohumlar; eski kayıtlar yeniden tohumlanır — deneme aşaması)
    this.storageKey = 'adastra_treasury_ledger_v4';
    this.state = this.load();
  }

  load() {
    const seed = () => ({
      pools: { ...SEEDS },
      lifetimeDeposited: 0,
      lifetimeWithdrawn: 0,
      lifetimeBurned: 0,
      // Havuz bazında toplam giriş/çıkış — çözünürlük oranı (solvency) için
      inflow: zeroPools(),
      outflow: zeroPools(),
      // Ödül ölçekleme geçmişi (panelde gösterilir)
      lastScaleFactor: 1,
      // E-planı Faz 2 (KARAR 1, 8 Ekim): bu hafta kasalardan vatandaşlara GERÇEKTEN ödenen toplam (geri alım hariç;
      // ammBuyback bir ödül değil, piyasa savunması). server/kapi.js recordWeek() her hafta okur ve sıfırlar.
      weekGrantedToCitizens: 0
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

    // v2: 8 kasa (zindan, kolezyum, boss, geri alım, görev, karnaval, Fatih, Konsey); Universe rezervi pay almaz
    const alloc = GAME_CONFIG.TREASURY_ALLOCATION;
    const allocations = {};
    for (const id of POOL_IDS) {
      const cut = amount * (alloc[id] || 0);
      if (!(cut > 0)) continue;
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
    if (!POOL_IDS.includes(poolId) || LOCKED.has(poolId) || !isFinite(want) || want <= 0) {
      return { granted: 0, requested: Math.max(0, want || 0), scaleFactor: 0, depleted: true, locked: LOCKED.has(poolId) };
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
    // ammBuyback vatandaşa ödenmez (fiyat savunması); diğer her kasa bir oyuncunun bakiyesine gider.
    if (poolId !== 'ammBuyback') this.state.weekGrantedToCitizens = (Number(this.state.weekGrantedToCitizens) || 0) + granted;
    this.save();

    return {
      granted,
      requested: want,
      scaleFactor: granted / want,
      depleted: false,
      poolRemaining: this.state.pools[poolId]
    };
  }

  // Çekilen miktarın bir kısmını kasaya geri koyar (withdraw()'ın kayıtlarını AYNEN geri alır: çıkış, yaşam boyu çıkış,
  // bu haftanın vatandaşa dağıtılanı). Ödülü yuvarlayan her yolda (bkz. withdrawWhole) kesirli artık kasada kalsın,
  // ASTRA ortadan kaybolmasın / yoktan oluşmasın (yerel simülasyonda bulundu: görev ödülünde kayıt başına ≈0,5 ASTRA yok oluyordu).
  refund(poolId, amount) {
    const v = Number(amount);
    if (!POOL_IDS.includes(poolId) || !isFinite(v) || v <= 0) return 0;
    this.state.pools[poolId] = (this.state.pools[poolId] || 0) + v;
    this.state.outflow[poolId] = Math.max(0, (this.state.outflow[poolId] || 0) - v);
    this.state.lifetimeWithdrawn = Math.max(0, this.state.lifetimeWithdrawn - v);
    if (poolId !== 'ammBuyback') this.state.weekGrantedToCitizens = Math.max(0, (Number(this.state.weekGrantedToCitizens) || 0) - v);
    this.save();
    return v;
  }

  // Tam sayı ASTRA ödülü: withdraw() ile aynı ama oyuncuya verilen miktar tam sayıya İNDİRİLİR, kesirli artık kasaya iade edilir.
  withdrawWhole(poolId, requested) {
    const r = this.withdraw(poolId, requested);
    if (!(r.granted > 0)) return r;
    const whole = Math.floor(r.granted + 1e-9);
    const rest = r.granted - whole;
    if (rest > 1e-12) this.refund(poolId, rest);
    return { ...r, granted: whole, scaleFactor: r.requested > 0 ? whole / r.requested : 0 };
  }

  // Bu haftanın vatandaşa-dağıtılan toplamını okur ve sıfırlar (haftalık hesaplaşmada bir kez çağrılır).
  drainWeekGrantedToCitizens() {
    const v = Number(this.state.weekGrantedToCitizens) || 0;
    this.state.weekGrantedToCitizens = 0;
    this.save();
    return v;
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
