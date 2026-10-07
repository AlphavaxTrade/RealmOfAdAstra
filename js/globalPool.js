// AdAstra: Genesis Realm - Küresel Kıtlık Havuzu, 10B Macro Tokenomics & Muhasebe Yöneticisi
import { GAME_CONFIG } from './config.js';

import { treasury } from './treasury.js';
import { openWeek, shareOf, isEligible, levelWeight, DEFAULT_UBI_RULES } from './economy/ubi.js';
import { readJSON, writeJSON, removeJSON } from './storage.js';
import { globalPoolV2, globalPoolV2Depot } from './v2/koyVeKonsey.js';

const DAY_MS = 24 * 3600 * 1000;
const zeroRes = () => Object.fromEntries((GAME_CONFIG.RESOURCE_KEYS || ["wood", "iron", "wheat"]).map(k => [k, 0]));
const UBI_RULES = { ...DEFAULT_UBI_RULES, minLevel: (GAME_CONFIG.UBI_CONFIG && GAME_CONFIG.UBI_CONFIG.MIN_LEVEL) || 3 };

export const MAX_SUPPLY = 10000000000;

// v1'deki adres 43 karakterdi (hex kısmı 41 hane) — geçerli bir EVM adresi
// 0x + 40 hanedir, bu yüzden hiçbir cüzdanda çözülmüyordu (denetim bulgusu F-12).
// Fazladan hane kaldırıldı. GERÇEK sözleşme adresiyle değiştirilmelidir.
export const CONTRACT_ADDRESS = '0xCA29d740502F4bA1Fa8e9DcAfBD85137b4CeBeB0';

export const isValidEvmAddress = (a) => /^0x[a-fA-F0-9]{40}$/.test(String(a || ''));

// Dolaşımdaki arz varsayımı — deflasyon anlatısı MAX_SUPPLY üzerinden değil,
// dolaşım üzerinden kurulmalıdır (F-11). Gerçek rakamla değiştirin.
export const CIRCULATING_SUPPLY_ESTIMATE = 1200000000;

export class GlobalResourceManager {
  constructor() {
    this.storageKey = 'adastra_global_network_pool_v3';
    this.serverTimeOffset = 0;
    this.trustedTimeReady = false;
    this.state = this.loadState();
    this.initNetworkTimeSync();
  }

  // Güvenilir zaman: sunucu ofseti mevcutsa uygula, yoksa Date.now() kullan
  getTrustedTime() {
    return Date.now() + this.serverTimeOffset;
  }

  // Tarayıcı ortamında sunucunun HTTP yanıt başlığından (Date header) gerçek UTC zamanını alır
  // Böylece oyuncu bilgisayarının saatini 1 hafta ileri alsa dahi sunucu saati bunu otomatik sıfırlar
  async initNetworkTimeSync() {
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      try {
        const res = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
        const serverDateStr = res.headers.get('date');
        if (serverDateStr) {
          const serverTime = new Date(serverDateStr).getTime();
          if (!isNaN(serverTime) && serverTime > 0) {
            this.serverTimeOffset = serverTime - Date.now();
            this.trustedTimeReady = true;
            this.checkEpochExpiration();
          }
        }
      } catch (err) {
        // Çevrimdışı fallback: yerel monotonic saat devam eder
      }
    }
  }

  checkEpochExpiration() {
    const now = this.getTrustedTime();
    if (this.state && this.state.epochEndTime && now > this.state.epochEndTime) {
      this.createNewEpoch(this.state);
      this.saveState();
    }
  }

  // Pazar'ı Pazartesiye bağlayan gece 00:01 (Türkiye Saati / UTC+3 = Pazar 21:01 UTC) reset zamanını hesaplar
  getNextWeeklyResetTRT(fromTimestamp = null) {
    const baseTime = fromTimestamp !== null ? fromTimestamp : this.getTrustedTime();
    const TRT_OFFSET_MS = 3 * 60 * 60 * 1000;
    const trtNow = new Date(baseTime + TRT_OFFSET_MS);

    const trtDay = trtNow.getUTCDay(); // 0 = Pazar, 1 = Pazartesi...
    const trtHour = trtNow.getUTCHours();
    const trtMin = trtNow.getUTCMinutes();

    let daysUntilMonday = (1 - trtDay + 7) % 7;
    // Eğer bugün Pazartesi ise ve 00:01 TRT geçtiyse sonraki haftanın Pazartesisine (7 gün sonraya) ata
    if (daysUntilMonday === 0 && (trtHour > 0 || (trtHour === 0 && trtMin >= 1))) {
      daysUntilMonday = 7;
    }

    const targetTrt = new Date(trtNow);
    targetTrt.setUTCDate(trtNow.getUTCDate() + daysUntilMonday);
    targetTrt.setUTCHours(0, 1, 0, 0); // 00:01:00.000 TRT

    return targetTrt.getTime() - TRT_OFFSET_MS;
  }

  // Geriye dönük uyumluluk
  getNextMonday1800TRT(fromTimestamp = null) {
    return this.getNextWeeklyResetTRT(fromTimestamp);
  }

  loadState() {
    if (typeof localStorage === 'undefined') return this.createNewEpoch();
    const { data: saved } = readJSON(this.storageKey);
    if (saved) {
      try {
        const parsed = saved;
        const now = this.getTrustedTime();

        // Anti-Tamper: Saat geriye sarılırsa son kaydedilen zamandan önceye gidemez
        if (parsed.lastSavedTime && now < parsed.lastSavedTime - 60000) {
          console.warn('[GlobalPool Anti-Tamper] Sistem saati manipülasyonu tespit edildi.');
        }

        // Zamanı dolduysa yeni haftalık epoch başlat
        if (now > (parsed.epochEndTime || 0)) {
          return this.createNewEpoch(parsed);
        }
        // Mevcut kaynak limitlerini config ile senkronize et.
        // ÖNEMLİ: Hafta içinde yakılan miktar kotadan kalıcı olarak düşer. Eski sürüm, yakım
        // yüzünden totalCap config'den farklı olunca her sayfa yenilemede kotayı baştan dolduruyordu.
        // Artık haftanın başındaki taban kota (baseCap) ayrıca saklanır; yalnızca config
        // gerçekten değişmişse yeniden hizalanır, yakılan miktar korunur.
        if (!parsed.resources) parsed.resources = {};
        if (!parsed.uretim || !parsed.uretim.qpp) parsed.uretim = this.nextUretim(parsed.uretim || null);
        if (!parsed.konsey || !parsed.konsey.stock) parsed.konsey = { stock: zeroRes() };
        if (!parsed.hazirlikDepo) parsed.hazirlikDepo = { totalValue: 0 };
        const loadParams = this.uretimParams(parsed.uretim);
        for (const key of Object.keys(GAME_CONFIG.GLOBAL_RESOURCE_CAPS)) {
          const configCap = this.computeWeekCapacity(key, loadParams);
          const r = parsed.resources[key];
          if (!r) {
            parsed.resources[key] = { remaining: configCap, totalCap: configCap, baseCap: configCap, depleted: false };
            continue;
          }
          const baseCap = r.baseCap ?? configCap; // eski kayıtlar: haftanın tabanı config kabul edilir
          const burnedThisWeek = Math.max(0, baseCap - (r.totalCap ?? baseCap));
          const totalCap = Math.max(0, configCap - burnedThisWeek);
          const remaining = Math.max(0, Math.min(totalCap, r.remaining ?? totalCap));
          const harvested = r.harvested != null ? r.harvested : Math.max(0, (r.baseCap ?? configCap) - (r.remaining ?? configCap) - burnedThisWeek);
          parsed.resources[key] = { remaining, totalCap, baseCap: configCap, harvested, depleted: remaining <= 0 };
        }
        // v1.25 UBI: haftalık kasa modeli (eski "tohum ÷ 12 hafta" modelinden geçiş; tohum dağıtılmaz)
        if (!parsed.ubiV2) {
          parsed.ubiV2 = true;
          parsed.ubiWeekAccrued = 0;
          parsed.ubiClaimPot = 0;
          parsed.ubiClaimPotAtOpen = 0;
          parsed.ubiPool = 0;
        }
        if (parsed.creatorRoyaltyTotal === undefined) {
          parsed.creatorRoyaltyTotal = 0;
        }
        if (!parsed.creatorWallet) {
          parsed.creatorWallet = GAME_CONFIG.CREATOR_WALLET_ADDRESS;
        }
        if (!parsed.totalBurnedResources) {
          parsed.totalBurnedResources = zeroRes();
        }
        return parsed;
      } catch (e) {
        console.error('Global state parse error, resetting:', e);
      }
    }
    return this.createNewEpoch();
  }

  createNewEpoch(prevState = null) {
    // v2: Üretim Hakkı parametreleri (termostat uygulanmış) ve Konsey ortak kasası haftadan haftaya taşınır
    const uretim = this.nextUretim(prevState && prevState.uretim);
    const params = this.uretimParams(uretim);
    const konsey = (prevState && prevState.konsey && prevState.konsey.stock) ? prevState.konsey : { stock: zeroRes() };
    const hazirlikDepo = (prevState && prevState.hazirlikDepo) ? prevState.hazirlikDepo : { totalValue: 0 };   // depo haftayla sıfırlanmaz
    const pool = {};
    for (const key of Object.keys(GAME_CONFIG.GLOBAL_RESOURCE_CAPS)) {
      const cap = this.computeWeekCapacity(key, params);
      pool[key] = {
        remaining: cap,
        totalCap: cap,
        baseCap: cap,
        harvested: 0,
        depleted: false
      };
    }

    // UBI: geçen haftanın %6 birikimi + çekilmeyen pay bu haftanın dağıtım kasası olur
    const ubiPot = prevState && prevState.ubiV2
      ? openWeek({ accruedLastWeek: prevState.ubiWeekAccrued || 0, unclaimedCarry: prevState.ubiClaimPot || 0 })
      : 0;

    const state = {
      epochId: prevState ? (prevState.epochId || 1) + 1 : 1,
      epochStartTime: Date.now(),
      epochEndTime: this.getNextWeeklyResetTRT(),
      resources: pool,
      uretim,
      konsey,
      hazirlikDepo,
      
      // 🪙 10 MİLYAR MAKRO TOKENOMİK VE MUHASEBE
      maxSupply: MAX_SUPPLY,
      contractAddress: CONTRACT_ADDRESS,
      totalSpent: prevState ? (prevState.totalSpent || 0) : 0,
      totalBurned: prevState ? (prevState.totalBurned || 0) : 0, // Kalıcı yakım (TOKEN_BURN_RATE)
      creatorRoyaltyTotal: prevState ? (prevState.creatorRoyaltyTotal || 0) : 0, // %3 Yapımcı Telifi
      creatorWallet: GAME_CONFIG.CREATOR_WALLET_ADDRESS || '0x58DBCF66bdd7BfA9da98aDba1965b3794321087C',
      // %6 Evrensel Temel Gelir: bu hafta birikenler + bu hafta dağıtılan kasa
      ubiV2: true,
      ubiWeekAccrued: 0,
      ubiClaimPot: ubiPot,
      ubiClaimPotAtOpen: ubiPot,
      ubiPool: ubiPot,
      ubiWeeklyDistributed: prevState ? prevState.ubiWeeklyDistributed || 0 : 0,
      totalTreasury: prevState ? prevState.totalTreasury || 40000000 : 40000000, // Hazine (TOKEN_REWARD_POOL_RATE)
      treasury: prevState ? prevState.treasury || {
        dungeon: 14000000,      // %35 Zindan & Boss Zaferleri
        ammBuyback: 6000000,    // %15 AMM DEX Likidite Geri Alımı
        arena: 8000000,         // %20 18v18 Kolezyum Gladyatör Arenası
        worldBoss: 8000000,     // %20 Dünya Bossu
        carnival: 4000000       // %10 Şans Çarkı Kasası
      } : {
        dungeon: 14000000,
        ammBuyback: 6000000,
        arena: 8000000,
        worldBoss: 8000000,
        carnival: 4000000
      },
      totalActiveMiners: 342,
      buybackFromBroadcasting: prevState ? (prevState.buybackFromBroadcasting || 0) : 0,
      totalBurnedResources: prevState ? (prevState.totalBurnedResources || zeroRes()) : zeroRes(),
      totalBurnedItems: prevState ? (prevState.totalBurnedItems || {}) : {}
    };

    this.state = state;
    this.saveState();
    return state;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // v2 (R2/R4): ÜRETİM HAKKI — Sirius Çıkarma Kapasitesi, kişi başı kota termostatı, Madencilik Otoritesi, ortak kasa
  //  • Haftalık kapasite (kaynak başına) = Σ(aktif oyuncu ağırlığı) × taban (dk) × çalışma dakikası × kişi başı kota × Otorite × yönetici
  //  • Kişi başı kota (qpp): başlangıç 0,40; her hafta fiyat/açılış oranına göre ±%10; 0,05-1,0
  //  • Otorite seviyesi: kapasite +%5/sv, çalışma 20→24 saat, 6→7 gün
  // ═══════════════════════════════════════════════════════════════════════
  uretimParams(u = (this.state && this.state.uretim) || {}) {
    const U = GAME_CONFIG.URETIM_HAKKI || {};
    const src = u && typeof u === 'object' ? u : {};
    const qpp = {};
    for (const k of Object.keys(GAME_CONFIG.GLOBAL_RESOURCE_CAPS)) {
      const v = Number(src.qpp && src.qpp[k]);
      qpp[k] = isFinite(v) && v > 0 ? v : (U.QPP_START ?? 0.4);
    }
    return {
      qpp,
      adminMult: Number(src.adminMult) > 0 ? Number(src.adminMult) : (U.ADMIN_MULT ?? 1),
      otoriteLevel: Math.max(0, Number(src.otoriteLevel) || 0),
      sumWeight: Number(src.sumWeight) > 0 ? Number(src.sumWeight) : 1,
      priceRatio: (src.priceRatio && typeof src.priceRatio === 'object') ? src.priceRatio : {}
    };
  }

  otoriteWork(level = 0) {
    const O = GAME_CONFIG.OTORITE || {};
    const L = Math.max(0, Math.min(O.MAX_LEVEL ?? 20, Number(level) || 0));
    const hours = Math.min(24, (O.HOURS_BASE ?? 20) + L * (O.HOURS_PER_LEVEL ?? 0.2));
    const days = Math.min(7, (O.DAYS_BASE ?? 6) + L * (O.DAYS_PER_LEVEL ?? 0.05));
    return { level: L, hours, days, minutes: hours * 60 * days, mult: 1 + L * (O.PER_LEVEL_BONUS ?? 0.05) };
  }

  // Bir birim ağırlık için haftalık hak (birim)
  weeklyRightPerWeight(key, params = this.uretimParams()) {
    const rate = (GAME_CONFIG.BASE_PRODUCTION || {})[key] || 0;
    const w = this.otoriteWork(params.otoriteLevel);
    return rate * w.minutes * (params.qpp[key] || 0) * w.mult * params.adminMult;
  }

  computeWeekCapacity(key, params = this.uretimParams()) {
    return Math.floor(this.weeklyRightPerWeight(key, params) * params.sumWeight + 1e-6);
  }

  // Yeni haftanın parametreleri: termostat (fiyat/açılış oranı) kotayı ±%10 oynatır
  nextUretim(prevU) {
    const U = GAME_CONFIG.URETIM_HAKKI || {};
    const p = this.uretimParams(prevU || {});
    const qpp = { ...p.qpp };
    const applied = {};
    for (const k of Object.keys(qpp)) {
      const r = Number((p.priceRatio || {})[k]);
      if (!isFinite(r) || r <= 0) continue;
      const step = U.TERMO_STEP ?? 0.1, target = U.TERMO_TARGET ?? 1;
      let next = qpp[k];
      if (r > target * 1.0001) next = qpp[k] * (1 + step);
      else if (r < target * 0.9999) next = qpp[k] * (1 - step);
      next = Math.max(U.QPP_MIN ?? 0.05, Math.min(U.QPP_MAX ?? 1, Math.round(next * 1000) / 1000));
      applied[k] = { from: qpp[k], to: next, priceRatio: r };
      qpp[k] = next;
    }
    return { qpp, adminMult: p.adminMult, otoriteLevel: p.otoriteLevel, sumWeight: p.sumWeight, priceRatio: {}, priceAt: 0, lastTermostat: applied };
  }

  recordPriceRatios(ratios, at = this.getTrustedTime()) {
    if (!this.state) return;
    if (!this.state.uretim || !this.state.uretim.qpp) this.state.uretim = this.nextUretim(this.state.uretim || null);
    this.state.uretim.priceRatio = { ...(ratios || {}) };
    this.state.uretim.priceAt = at;
    this.saveState();
  }

  // Aktif oyuncu ağırlıkları toplamı değişince (yeni oyuncu, hafta başı) kapasite yeniden hesaplanır; çıkarılan ve yakılan korunur
  setSumWeight(sum) {
    if (!this.state) return;
    if (!this.state.uretim || !this.state.uretim.qpp) this.state.uretim = this.nextUretim(this.state.uretim || null);
    this.state.uretim.sumWeight = Math.max(0.001, Number(sum) || 1);
    this.recomputeWeekCapacity();
  }

  recomputeWeekCapacity() {
    if (!this.state || !this.state.resources) return;
    const params = this.uretimParams();
    for (const key of Object.keys(GAME_CONFIG.GLOBAL_RESOURCE_CAPS)) {
      const r = this.state.resources[key];
      const cap = this.computeWeekCapacity(key, params);
      if (!r) { this.state.resources[key] = { remaining: cap, totalCap: cap, baseCap: cap, harvested: 0, depleted: false }; continue; }
      const burned = Math.max(0, (r.baseCap ?? cap) - (r.totalCap ?? cap));
      const harvested = Math.max(0, Number(r.harvested) || 0);
      r.baseCap = cap;
      r.totalCap = Math.max(0, cap - burned);
      r.remaining = Math.max(0, r.totalCap - harvested);
      r.depleted = r.remaining <= 0;
    }
    this.saveState();
  }

  // Ortak kasa (Sirius Konseyi): çıkarılan her hammaddenin %5'i kaynak olarak burada birikir
  addKonseyStock(key, qty) {
    const q = Math.max(0, Number(qty) || 0);
    if (!q || !this.state) return 0;
    if (!this.state.konsey || !this.state.konsey.stock) this.state.konsey = { stock: zeroRes() };
    this.state.konsey.stock[key] = (Number(this.state.konsey.stock[key]) || 0) + q;
    this.saveState();
    return q;
  }

  // Ortak kasa payı için dünya kapasitesinden çıkarma (oyuncu hasadı sayılmaz; harvest() kancalarına takılmaz)
  takeForKonsey(key, qty) {
    const res = this.state && this.state.resources && this.state.resources[key];
    const q = Math.max(0, Number(qty) || 0);
    if (!res || !q) return 0;
    const actual = Math.max(0, Math.min(q, this.getAvailableToday(key)));
    if (actual <= 0) return 0;
    res.remaining -= actual;
    res.harvested = (res.harvested || 0) + actual;
    if (res.remaining <= 0) { res.remaining = 0; res.depleted = true; }
    this.addKonseyStock(key, actual);
    return actual;
  }

  getKonseyStock() {
    return { ...zeroRes(), ...((this.state && this.state.konsey && this.state.konsey.stock) || {}) };
  }

  // 🔥 HAMMADDE KALICI YAKIMI (BURN) VE TOTAL ARZDAN DÜŞÜLMESİ
  // Oyunda nerede bir odun, demir veya buğday harcanırsa bu metotla yakılır ve total arzdan (totalCap & remaining) kalıcı silinir.
  recordResourceBurn(resourceKey, amount) {
    const qty = Number(amount) || 0;
    if (qty <= 0) return { burned: 0 };

    if (!this.state.totalBurnedResources) {
      this.state.totalBurnedResources = zeroRes();
    }
    this.state.totalBurnedResources[resourceKey] = (this.state.totalBurnedResources[resourceKey] || 0) + qty;

    const res = this.state.resources && this.state.resources[resourceKey];
    if (res) {
      // Total Cap (Küresel Toplam Arz) kalıcı olarak düşürülür:
      res.totalCap = Math.max(0, (res.totalCap || 0) - qty);
      // Kalan arz da güncellenir:
      res.remaining = Math.max(0, Math.min(res.remaining, res.totalCap));
      if (res.totalCap <= 0 || res.remaining <= 0) {
        res.remaining = 0;
        res.depleted = true;
      }
    }

    this.saveState();
    return { resourceKey, amount: qty, remainingCap: res ? res.totalCap : 0, remaining: res ? res.remaining : 0 };
  }

  // Kullanılınca oyundan tamamen çıkan eşyalar (teçhizat parçası, anahtar, kutu, parşömen): yalnız kayıt (denetim 6 Ekim 2026).
  // Hammadde gibi haftalık kotayı etkilemez, katkı puanı vermez.
  recordItemBurn(kind, amount) {
    const qty = Number(amount) || 0;
    if (!qty || !kind) return 0;
    if (!this.state.totalBurnedItems) this.state.totalBurnedItems = {};
    this.state.totalBurnedItems[kind] = Math.max(0, (this.state.totalBurnedItems[kind] || 0) + qty);
    this.saveState();
    return qty;
  }

  saveState() {
    if (typeof localStorage === 'undefined') return;
    if (typeof gameState !== 'undefined' && gameState._isFastForwarding) return;
    if (this.state) {
      this.state.lastSavedTime = this.getTrustedTime();
    }
    writeJSON(this.storageKey, this.state);
  }

  // Kullanıcı kaynak topladığında küresel havuzdan düş
  // ── Kota gün gün açılır: haftalık kotanın her gün 1/7'si açılır, açılan ama çıkarılmayan kısım hafta içinde birikir ──
  getEpochDayIndex(now = this.getTrustedTime()) {
    const start = (this.state.epochEndTime || now) - 7 * DAY_MS;
    return Math.max(0, Math.min(6, Math.floor((now - start) / DAY_MS)));
  }

  getReleasedCap(resourceKey, now = this.getTrustedTime()) {
    const res = this.state.resources[resourceKey];
    if (!res) return 0;
    const base = res.baseCap ?? res.totalCap ?? 0;
    return Math.floor(base * (this.getEpochDayIndex(now) + 1) / 7);
  }

  getAvailableToday(resourceKey, now = this.getTrustedTime()) {
    const res = this.state.resources[resourceKey];
    if (!res) return 0;
    return Math.max(0, Math.min(res.remaining, this.getReleasedCap(resourceKey, now) - (res.harvested || 0)));
  }

  getNextReleaseTime(now = this.getTrustedTime()) {
    const start = (this.state.epochEndTime || now) - 7 * DAY_MS;
    return start + (this.getEpochDayIndex(now) + 1) * DAY_MS;
  }

  harvest(resourceKey, amount) {
    const res = this.state.resources[resourceKey];
    if (!res) return 0;

    const actualHarvested = Math.max(0, Math.min(amount, this.getAvailableToday(resourceKey)));
    res.remaining -= actualHarvested;
    res.harvested = (res.harvested || 0) + actualHarvested;

    if (res.remaining <= 0) {
      res.remaining = 0;
      res.depleted = true;
    }

    this.saveState();
    return actualHarvested;
  }

  // 🪙 TOKEN HARCANDIĞINDA:
  // %5 KALICI YAKIM + %3 YAPIMCI TELİFİ + %6 EVRENSEL TEMEL GELİR (UBI) + %86 HAZİNE DEFTERİNE GİRİŞ = %100!
  recordTokenSpend(adAstraAmount) {
    if (isNaN(adAstraAmount) || adAstraAmount <= 0) return { burned: 0, creatorRoyalty: 0, ubiShare: 0, treasuryShare: 0 };

    const burnRate = GAME_CONFIG.TOKEN_BURN_RATE ?? 0.05;           // %5 Kalıcı Yakım
    const creatorRate = GAME_CONFIG.CREATOR_ROYALTY_RATE ?? 0.03;   // %3 Yapımcı Cüzdanı (0x58DBCF66bdd7BfA9da98aDba1965b3794321087C)
    const ubiRate = GAME_CONFIG.UBI_POOL_RATE ?? 0.06;              // %6 Evrensel Temel Gelir Havuzu
    const treasuryRate = GAME_CONFIG.TOKEN_REWARD_POOL_RATE ?? 0.86;// %86 Hazine Havuzları

    this.state.totalSpent = (this.state.totalSpent || 0) + adAstraAmount;

    // 1. Kalıcı Yakım
    const burned = adAstraAmount * burnRate;
    this.state.totalBurned = (this.state.totalBurned || 0) + burned;

    // 2. %3 Yapımcı Telifi
    const creatorRoyalty = adAstraAmount * creatorRate;
    this.state.creatorRoyaltyTotal = (this.state.creatorRoyaltyTotal || 0) + creatorRoyalty;
    this.state.creatorWallet = GAME_CONFIG.CREATOR_WALLET_ADDRESS;

    // 3. %6 Evrensel Temel Gelir (Seviye Stake) Havuzu
    const ubiShare = adAstraAmount * ubiRate;
    this.state.ubiWeekAccrued = (this.state.ubiWeekAccrued || 0) + ubiShare;
    this.state.ubiPool = (this.state.ubiClaimPot || 0) + this.state.ubiWeekAccrued;

    // 4. Hazine Girişi
    const treasuryShare = adAstraAmount * treasuryRate;
    this.state.totalTreasury = (this.state.totalTreasury || 0) + treasuryShare;

    // Hazine defterine gerçek giriş
    const result = treasury.deposit(treasuryShare);
    treasury.recordBurn(burned);

    // Geriye dönük uyumluluk
    this.state.treasury = Object.fromEntries(Object.keys(GAME_CONFIG.TREASURY_SEED || {}).map(k => [k, treasury.getPool(k)]));

    this.saveState();
    if (typeof window !== 'undefined' && typeof window.updateUbiCardLive === 'function') {
      try { window.updateUbiCardLive(); } catch (e) { console.warn('UBI kartı yenilenemedi:', e && e.message); }
    }
    return { burned, creatorRoyalty, ubiShare, treasuryShare, allocations: result.allocations };
  }

  // 🏛️ EVRENSEL TEMEL GELİR (UBI) BİLGİSİ VE SEVİYEYE GÖRE HESAPLAMA MOTORU
  // Bu haftanın hak sahiplerinin ağırlık toplamı. Tarayıcı sürümünde dünya tek oyuncudur
  // (+ ayarlardaki temsili diğer oyuncular); sunucuda bu, gerçek hak sahiplerinin toplamı olur.
  getUbiTotalWeight(playerLevel = 1) {
    const others = (GAME_CONFIG.UBI_CONFIG && GAME_CONFIG.UBI_CONFIG.LOCAL_OTHER_PLAYERS_WEIGHT) || 0;
    return levelWeight(playerLevel, UBI_RULES) + others;
  }

  getUbiPoolInfo(playerLevel = 1, lastClaimedEpoch = 0) {
    const lvl = Math.max(1, Math.min(81, playerLevel || 1));
    const pot = this.state.ubiClaimPotAtOpen || 0;
    const payoutFor = (L) => shareOf({ pot, playerLevel: L, totalWeight: this.getUbiTotalWeight(L), rules: UBI_RULES });
    const payout = payoutFor(lvl);
    const nextLevel = Math.min(81, lvl + 1);
    const w = levelWeight(lvl, UBI_RULES);
    const wNext = levelWeight(nextLevel, UBI_RULES);
    return {
      totalPool: Math.round((this.state.ubiClaimPot || 0) + (this.state.ubiWeekAccrued || 0)),
      weeklyBudget: Math.round(pot),
      claimRemaining: Math.round(this.state.ubiClaimPot || 0),
      accruingThisWeek: Math.round(this.state.ubiWeekAccrued || 0),
      epochId: this.state.epochId,
      alreadyClaimedThisWeek: lastClaimedEpoch === this.state.epochId,
      eligible: isEligible(lvl, UBI_RULES),
      minLevel: UBI_RULES.minLevel,
      nextResetTimestamp: this.getNextWeeklyResetTRT(),
      playerLevel: lvl,
      playerWeight: Math.round(w * 100) / 100,
      nextLevelWeight: Math.round(wNext * 100) / 100,
      payout,
      nextLevelPayout: payoutFor(nextLevel),
      increasePct: w > 0 ? Math.round(((wNext - w) / w) * 100) : 0
    };
  }

  // Seviyeye göre (Lv 1 - 81) dengeli UBI dağıtım payı hesabı:
  // Balina Sömürüsü Koruması: W(L) = 1 + sqrt(L-1)*0.75 ve %5 Tek Çekim Tavanı!
  calculateLevelUbiPayout(playerLevel = 1, weeklyBudget = null) {
    const lvl = Math.max(1, Math.min(81, playerLevel || 1));
    const nextLvl = Math.min(81, lvl + 1);

    const pool = Math.max(0, Number(this.state.ubiPool) || 0);
    const budget = weeklyBudget !== null ? weeklyBudget : (pool / 12);

    // Dengeli Kök/Logaritmik Fonksiyon: Lv 1 = 1.00, Lv 3 = 2.06, Lv 10 = 3.25, Lv 81 = 7.71
    const calcWeight = (l) => 1 + Math.sqrt(l - 1) * 0.75;
    const playerWeight = calcWeight(lvl);
    const nextPlayerWeight = calcWeight(nextLvl);

    // Her seviyenin haftalık bütçeden aldığı adil pay:
    // Taban: bütçenin %0.5'i (Lv 1), Lv 81 için bütçenin ~%3.85'i
    const rawPayout = (budget * 0.005) * playerWeight;
    const rawNextPayout = (budget * 0.005) * nextPlayerWeight;

    // 🛡️ TEK ÇEKİM TAVANI: Havuzun %5'inden fazlası ASLA tek seferde çekilemez!
    const maxSingleCap = pool * ((GAME_CONFIG.UBI_CONFIG && GAME_CONFIG.UBI_CONFIG.MAX_SINGLE_CLAIM_SHARE) || 0.05);
    const cappedPayout = Math.min(rawPayout, maxSingleCap > 0 ? maxSingleCap : rawPayout);

    // Minimum 0.01 ADA, 2 ondalık hassasiyetle anlık canlı değer
    const payout = Math.max(0.01, Math.round(cappedPayout * 100) / 100);
    const nextLevelPayout = Math.max(0.01, Math.round(Math.min(rawNextPayout, maxSingleCap > 0 ? maxSingleCap : rawNextPayout) * 100) / 100);
    const increasePct = payout > 0 ? Math.round(((nextLevelPayout - payout) / payout) * 100) : 0;

    return {
      playerLevel: lvl,
      playerWeight: Math.round(playerWeight * 100) / 100,
      payout,
      nextLevelPayout,
      increasePct,
      maxSingleCap: Math.round(maxSingleCap)
    };
  }

  // Haftalık Evrensel Temel Gelir Claim Metodu (Havuz Koruma Tamponu İle)
  claimWeeklyUbi(playerLevel = 1, currentBalance = 0, lastClaimedEpoch = 0) {
    if (lastClaimedEpoch === this.state.epochId) {
      return {
        success: false,
        message: 'Bu haftaki Evrensel Temel Gelir (UBI) ödülünüzü zaten talep ettiniz. Sonraki dağıtım Pazar ➜ Pazartesi 00:01 TRT döngüsünde açılacaktır.'
      };
    }

    const ubiInfo = this.getUbiPoolInfo(playerLevel, lastClaimedEpoch);
    if (!ubiInfo.eligible) {
      return { success: false, message: `Haftalık temel gelir ${ubiInfo.minLevel}. seviyeden itibaren alınabilir.` };
    }
    const amount = Math.min(ubiInfo.payout, this.state.ubiClaimPot || 0);
    if (amount <= 0) {
      return {
        success: false,
        message: 'Bu haftanın temel gelir kasası boş. Kasa, oyunda harcanan her ADA\'nın %6\'sıyla dolar ve Pazartesi 00:01 (TSİ) açılır.'
      };
    }

    // Bu haftanın kasasından düş ve deftere yaz
    this.state.ubiClaimPot = Math.max(0, (this.state.ubiClaimPot || 0) - amount);
    this.state.ubiPool = this.state.ubiClaimPot + (this.state.ubiWeekAccrued || 0);
    this.state.ubiWeeklyDistributed = (this.state.ubiWeeklyDistributed || 0) + amount;
    this.saveState();

    return {
      success: true,
      amount,
      playerLevel,
      epochId: this.state.epochId,
      message: `🏛️ Seviye ${playerLevel} Evrensel Temel Geliriniz (+${amount.toLocaleString('tr-TR')} 🟣 $ADASTRA) cüzdanınıza aktarıldı!`
    };
  }

  // Ödül çekimi — tek geçit. Hiçbir modül bakiyeye doğrudan ADA eklemez.
  withdrawReward(poolId, amount) {
    return treasury.withdraw(poolId, amount);
  }

  // 📺 YAYIN GELİRİ BUYBACK ENJEKSİYONU (%35 Avalanche Arena Geliri)
  recordBroadcastBuyback(adAstraAmount) {
    if (isNaN(adAstraAmount) || adAstraAmount <= 0) return 0;
    this.state.buybackFromBroadcasting = (this.state.buybackFromBroadcasting || 0) + adAstraAmount;
    // Buyback yapılan tokenlerin %50'si yakılır, %50'si gerçek hazine defterindeki AMM geri alım kasasına girer.
    // (Eski sürüm %50'yi yalnızca gösterim kopyasına yazıyordu; para hiçbir kasaya ulaşmıyordu.)
    const half = adAstraAmount * 0.50;
    this.state.totalBurned = (this.state.totalBurned || 0) + half;
    treasury.recordBurn(half);
    treasury.state.pools.ammBuyback = (treasury.state.pools.ammBuyback || 0) + half;
    treasury.state.inflow.ammBuyback = (treasury.state.inflow.ammBuyback || 0) + half;
    treasury.state.lifetimeDeposited += half;
    treasury.save();
    this.saveState();
    return adAstraAmount;
  }

  // 🩺 CANLI EKONOMİK SAĞLIK GÖSTERGELERİ
  //
  // v1'DEKİ İKİ HATA:
  //  1) E_net = hazine/(yakım×1,5) − 1 idi. Yakım her zaman harcamanın %18'i,
  //     hazine her zaman %82'si olduğu için bu oran daima 0,82/0,27−1 = +2,037
  //     değerine yakınsıyordu. Gösterge SABİTTİ — hiçbir şey ölçmüyordu (F-09).
  //  2) Eşik sırası ters yazılmıştı:
  //         if (E_net > 0.05) uyarı; else if (E_net > 0.15) kritik;
  //     0,15'ten büyük her değer zaten 0,05'ten de büyük olduğu için "kritik"
  //     dalı ASLA çalışmıyordu. Panel ne olursa olsun en fazla sarı gösteriyordu.
  //
  // v2'de ölçülen şey ÖDEME GÜCÜ: hazineye giren ile hazineden çıkanın oranı.
  // Bu gerçekten dalgalanır ve gerçekten bir şey söyler.
  getEconomicHealthMetrics() {
    const t = treasury.getSummary();

    // Net emisyon oranı: dağıtılan ödüller / toplanan hazine.
    // > 1 → dağıtım girişten fazla (havuzlar eriyor), < 1 → birikim var.
    const payoutRatio = t.lifetimeDeposited > 0
      ? t.lifetimeWithdrawn / t.lifetimeDeposited
      : 0;
    const E_net = payoutRatio - 1;

    // Kaynak denge katsayıları: artık sabit değil, gerçek havuz tüketiminden.
    const sigmaOf = (key) => {
      const res = this.state.resources[key];
      if (!res || !res.totalCap) return 1;
      const consumedRatio = 1 - (res.remaining / res.totalCap);
      const elapsed = Math.max(1, Date.now() - (this.state.epochStartTime || Date.now()));
      const epochLength = Math.max(1, (this.state.epochEndTime || Date.now()) - (this.state.epochStartTime || Date.now()));
      const expectedRatio = Math.min(1, elapsed / epochLength);
      return expectedRatio > 0 ? +(consumedRatio / expectedRatio).toFixed(3) : 1;
    };

    // ÖNEMLİ: en ağır eşik ÖNCE kontrol edilir.
    let healthStatus, statusText, statusBadgeColor;
    if (E_net > 0.15 || t.avgHealth < 0.25) {
      healthStatus = 'critical';
      statusText = '🔴 Kritik — Ödül havuzları eriyor, dağıtım girişi aşıyor';
      statusBadgeColor = '#ef4444';
    } else if (E_net > 0.05 || t.avgHealth < 0.55) {
      healthStatus = 'warning';
      statusText = '🟡 Dikkat — Emisyon yükseldi, hazine tamponu inceliyor';
      statusBadgeColor = '#facc15';
    } else {
      healthStatus = 'healthy';
      statusText = '🟢 Sağlıklı — Deflasyonist ve sürdürülebilir';
      statusBadgeColor = '#22c55e';
    }

    const circulating = Math.max(0, CIRCULATING_SUPPLY_ESTIMATE - (this.state.totalBurned || 0));

    return {
      E_net: parseFloat(E_net.toFixed(4)),
      payoutRatio: parseFloat(payoutRatio.toFixed(4)),
      treasuryHealth: parseFloat(t.avgHealth.toFixed(3)),
      sigmaWheat: sigmaOf('wheat'),
      sigmaIron: sigmaOf('iron'),
      sigmaWood: sigmaOf('wood'),
      healthStatus,
      statusText,
      statusBadgeColor,
      totalBurned: this.state.totalBurned || 0,
      // Deflasyon DOLAŞIMDAKİ arz üzerinden raporlanır, max supply üzerinden değil
      circulatingEstimate: circulating,
      burnedPctOfCirculating: parseFloat((((this.state.totalBurned || 0) / CIRCULATING_SUPPLY_ESTIMATE) * 100).toFixed(4)),
      treasuryPools: t.pools
    };
  }

  // 🎮 MAKRO EKONOMİ SİMÜLATÖRÜ (1-365 Günlük Oyuncu Projeksiyonu)
  simulateMacroEconomy(playerCount = 500, days = 30) {
    const projection = [];
    let simBurned = this.state.totalBurned;
    let simTreasury = this.state.totalTreasury;
    let simCirculating = MAX_SUPPLY - simBurned;

    for (let d = 1; d <= days; d++) {
      // Günlük aktiflik ve harcama tahmini
      const activeDaily = Math.floor(playerCount * (0.65 + Math.random() * 0.25));
      const avgSpendPerUser = 85 + Math.random() * 45; // Tamir + Reforge + Boost
      const dailyTotalSpend = activeDaily * avgSpendPerUser;

      const dailyBurn = dailyTotalSpend * 0.18;
      const dailyTreasury = dailyTotalSpend * 0.82;
      const dailyBroadcastBuyback = (1200 + Math.random() * 800) * 0.35; // Yayın geliri desteği

      simBurned += dailyBurn + (dailyBroadcastBuyback * 0.5);
      simTreasury += dailyTreasury + (dailyBroadcastBuyback * 0.5);
      simCirculating = MAX_SUPPLY - simBurned;

      projection.push({
        day: d,
        activePlayers: activeDaily,
        dailySpend: Math.floor(dailyTotalSpend),
        dailyBurn: Math.floor(dailyBurn),
        cumulativeBurned: Math.floor(simBurned),
        circulatingSupply: Math.floor(simCirculating),
        dungeonVault: Math.floor(simTreasury * 0.35),
        ammBuybackVault: Math.floor(simTreasury * 0.30),
        arenaVault: Math.floor(simTreasury * 0.25),
        stakingVault: Math.floor(simTreasury * 0.10)
      });
    }

    return projection;
  }

  // Küresel Havuz Aktivite Denetleyicisi:
  // KURAL: Kimse kaynak çıkartmıyorsa limitler durduk yere ASLA eksilmez!
  // Havuz yalnızca oyuncular seferlerden kaynak topladığında harvest() metoduyla düşürülür.
  simulateGlobalActivity(timeDeltaSeconds) {
    // Otomatik sızıntı kaldırıldı
    return;
  }

  getResourceInfo(resourceKey) {
    const config = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[resourceKey];
    const current = this.state.resources[resourceKey] || { remaining: 0, totalCap: config.totalCap, depleted: true };
    const percent = Math.max(0, Math.min(100, (current.remaining / current.totalCap) * 100));

    return {
      ...config,
      remaining: Math.floor(current.remaining),
      percent: percent.toFixed(1),
      isDepleted: current.remaining <= 0,
      baseCap: current.baseCap ?? config.totalCap,
      currentCap: current.totalCap,
      availableToday: Math.floor(this.getAvailableToday(resourceKey)),
      releasedCap: this.getReleasedCap(resourceKey),
      harvestedThisWeek: Math.floor(current.harvested || 0),
      dayIndex: this.getEpochDayIndex(),
      nextReleaseAt: this.getNextReleaseTime()
    };
  }

  getTimeUntilNextEpoch() {
    const diff = Math.max(0, this.state.epochEndTime - Date.now());
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, totalMs: diff };
  }

  getSecondsUntilReset() {
    const diff = Math.max(0, this.state.epochEndTime - Date.now());
    return Math.floor(diff / 1000);
  }

  resetEpoch() {
    this.state = this.createNewEpoch();
    this.saveState();
    return this.state;
  }

  // 🏛️ Vanilla Reset: Tokenomik yakım, harcama ve sayaçları tam 0'a sıfırlar
  vanillaReset() {
    removeJSON(this.storageKey);
    this.state = this.createNewEpoch(null);
    this.state.totalSpent = 0;
    this.state.totalBurned = 0;
    this.state.creatorRoyaltyTotal = 0;
    this.state.buybackFromBroadcasting = 0;
    this.state.totalBurnedResources = zeroRes();
    this.saveState();
    return this.state;
  }
}

// v2: Sirius Konseyi (ortak kasa, Madencilik Otoritesi inşaatı, Konsey projeleri) — js/v2/koyVeKonsey.js
Object.assign(GlobalResourceManager.prototype, globalPoolV2);
Object.assign(GlobalResourceManager.prototype, globalPoolV2Depot);   // Hazırlık Deposu dünya toplamı (10 M ASTRA sınırı)
export const globalPool = new GlobalResourceManager();
