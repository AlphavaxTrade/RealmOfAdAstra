// Realm of AdAstra — Küresel Havuz: haftalık kota, ASTRA harcama muhasebesi, UBI
// ============================================================================
// Dünyanın ortak durumu (tarayıcıda tek oyunculu, sunucuda herkes için tek):
//   • Haftalık hammadde kotası (Üretim Hakkı): kişi başı kota termostatı, Otorite, gün gün açılma
//   • Harcanan her ASTRA'nın dağılımı: %5 yakım, %3 telif, %6 UBI, %86 hazine kasaları
//   • Evrensel Temel Gelir (UBI): haftalık kasa, seviyeye göre pay
//   • Konsey ortak kasası ve yakılan hammadde / eşya sayaçları
// v2 ekleri (Köy Evleri, Konsey projeleri, Hazırlık Deposu) js/v2/koyVeKonsey.js içinden karışır.
// ============================================================================

import { GAME_CONFIG } from './config.js';
import { treasury } from './treasury.js';
import { openWeek, shareOf, isEligible, levelWeight, DEFAULT_UBI_RULES } from './economy/ubi.js';
import { readJSON, writeJSON, removeJSON } from './storage.js';
import { yeniHavuzCarpani } from './economy/uretimDagitimi.js';
import { globalPoolV2, globalPoolV2Depot } from './v2/koyVeKonsey.js';

const GUN_MS = 24 * 3600 * 1000;
const HAMMADDELER = GAME_CONFIG.RESOURCE_KEYS;
const sifirHammadde = () => Object.fromEntries(HAMMADDELER.map(k => [k, 0]));
const kotaAnahtarlari = () => Object.keys(GAME_CONFIG.GLOBAL_RESOURCE_CAPS);

const UBI_KURALLARI = {
  ...DEFAULT_UBI_RULES,
  minLevel: (GAME_CONFIG.UBI_CONFIG && GAME_CONFIG.UBI_CONFIG.MIN_LEVEL) || 3,
  maxSingleShare: (GAME_CONFIG.UBI_CONFIG && GAME_CONFIG.UBI_CONFIG.MAX_SINGLE_CLAIM_SHARE) || 0
};

export const MAX_SUPPLY = 10000000000;

// Oyunun gösterim amaçlı kontrat adresi. Gerçek token kontratı değildir; gerçek adres belli olunca değiştirilmeli.
export const CONTRACT_ADDRESS = '0xCA29d740502F4bA1Fa8e9DcAfBD85137b4CeBeB0';

// Dolaşımdaki arz tahmini: deflasyon anlatısı MAX_SUPPLY üzerinden değil dolaşım üzerinden kurulur
export const CIRCULATING_SUPPLY_ESTIMATE = 1200000000;

const YAPIMCI_CUZDAN_YEDEK = '0x58DBCF66bdd7BfA9da98aDba1965b3794321087C';

export class GlobalResourceManager {
  constructor() {
    this.storageKey = 'adastra_global_network_pool_v3';
    this.serverTimeOffset = 0;
    this.trustedTimeReady = false;
    this.state = this.loadState();
    this.initNetworkTimeSync();
  }

  // ── Zaman ──────────────────────────────────────────────────────────────
  // Güvenilir zaman: sunucudan öğrenilen ofset varsa uygulanır, yoksa yerel saat
  getTrustedTime() {
    return Date.now() + this.serverTimeOffset;
  }

  // Tarayıcıda sayfanın HTTP yanıtındaki Date başlığından gerçek UTC zamanını alır;
  // oyuncu bilgisayar saatini ileri alsa bile hafta sınırı sunucuya göre hesaplanır.
  async initNetworkTimeSync() {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    try {
      const res = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
      const baslik = res.headers.get('date');
      const sunucuZamani = baslik ? new Date(baslik).getTime() : NaN;
      if (!isNaN(sunucuZamani) && sunucuZamani > 0) {
        this.serverTimeOffset = sunucuZamani - Date.now();
        this.trustedTimeReady = true;
        this.checkEpochExpiration();
      }
    } catch (_) {
      // Çevrimdışı: yerel saatle devam edilir
    }
  }

  // Bir sonraki Pazartesi 00:01 TSİ (UTC+3 = Pazar 21:01 UTC) anı
  getNextWeeklyResetTRT(fromTimestamp = null) {
    const baz = fromTimestamp !== null ? fromTimestamp : this.getTrustedTime();
    const TSI_FARKI_MS = 3 * 60 * 60 * 1000;
    const tsi = new Date(baz + TSI_FARKI_MS);

    const gun = tsi.getUTCDay();   // 0 = Pazar, 1 = Pazartesi
    let pazartesiyeKalan = (1 - gun + 7) % 7;
    // Bugün Pazartesi ve 00:01 geçtiyse bir sonraki haftanın Pazartesisi
    if (pazartesiyeKalan === 0 && (tsi.getUTCHours() > 0 || tsi.getUTCMinutes() >= 1)) pazartesiyeKalan = 7;

    const hedef = new Date(tsi);
    hedef.setUTCDate(tsi.getUTCDate() + pazartesiyeKalan);
    hedef.setUTCHours(0, 1, 0, 0);
    return hedef.getTime() - TSI_FARKI_MS;
  }

  // Hafta sınırı geçtiyse yeni haftayı (epoch) başlatır
  checkEpochExpiration() {
    const simdi = this.getTrustedTime();
    if (this.state && this.state.epochEndTime && simdi > this.state.epochEndTime) {
      this.createNewEpoch(this.state);
      this.saveState();
    }
  }

  // ── Kayıt ──────────────────────────────────────────────────────────────
  loadState() {
    if (typeof localStorage === 'undefined') return this.createNewEpoch();
    const { data: kayit } = readJSON(this.storageKey);
    if (!kayit) return this.createNewEpoch();

    try {
      const simdi = this.getTrustedTime();
      if (kayit.lastSavedTime && simdi < kayit.lastSavedTime - 60000) {
        console.warn('[Küresel havuz] Sistem saatinin geri alındığı görüldü.');
      }
      // Süresi dolduysa yeni haftalık epoch
      if (simdi > (kayit.epochEndTime || 0)) return this.createNewEpoch(kayit);

      if (!kayit.resources) kayit.resources = {};
      if (!kayit.uretim || !kayit.uretim.qpp) kayit.uretim = this.nextUretim(kayit.uretim || null);
      if (!kayit.konsey || !kayit.konsey.stock) kayit.konsey = { stock: sifirHammadde() };
      if (!kayit.hazirlikDepo) kayit.hazirlikDepo = { totalValue: 0 };

      // Kota sınırlarını config ile hizala. 21 Ekim 2026 (sahip kararı): yakım haftalık çıkarma kotasını DÜŞÜRMEZ; kota yalnız yeni
      // hammaddenin dünyaya girişini sınırlar (enflasyon aracı). Hafta içi yakılan yalnız istatistiktir (r.burned). Eskiden yakım
      // kotadan düşüyordu (yakılan = baseCap − totalCap): eski kayıtlar burada bir kez onarılır, kota tam açılır.
      const params = this.uretimParams(kayit.uretim);
      for (const key of kotaAnahtarlari()) {
        const configKota = this.computeWeekCapacity(key, params);
        const r = kayit.resources[key];
        if (!r) {
          kayit.resources[key] = { remaining: configKota, totalCap: configKota, baseCap: configKota, depleted: false };
          continue;
        }
        const tabanKota = r.baseCap ?? configKota;   // eski kayıtlar: haftanın tabanı config sayılır
        const eskiYakilan = Math.max(0, tabanKota - (r.totalCap ?? tabanKota));
        const cikarilan = r.harvested != null
          ? r.harvested
          : Math.max(0, (r.baseCap ?? configKota) - (r.remaining ?? configKota) - eskiYakilan);
        const kalan = Math.max(0, configKota - cikarilan);
        kayit.resources[key] = { remaining: kalan, totalCap: configKota, baseCap: configKota, harvested: cikarilan, burned: r.burned != null ? r.burned : eskiYakilan, depleted: kalan <= 0 };
      }

      // UBI haftalık kasa modeli (eski "tohum ÷ 12 hafta" modelinden geçiş; tohum dağıtılmaz)
      if (!kayit.ubiV2) {
        kayit.ubiV2 = true;
        kayit.ubiWeekAccrued = 0;
        kayit.ubiClaimPot = 0;
        kayit.ubiClaimPotAtOpen = 0;
        kayit.ubiPool = 0;
      }
      if (kayit.creatorRoyaltyTotal === undefined) kayit.creatorRoyaltyTotal = 0;
      if (!kayit.creatorWallet) kayit.creatorWallet = GAME_CONFIG.CREATOR_WALLET_ADDRESS;
      if (!kayit.totalBurnedResources) kayit.totalBurnedResources = sifirHammadde();
      return kayit;
    } catch (e) {
      console.error('Küresel havuz kaydı okunamadı, sıfırdan kuruluyor:', e);
      return this.createNewEpoch();
    }
  }

  saveState() {
    if (typeof localStorage === 'undefined') return;
    if (typeof gameState !== 'undefined' && gameState._isFastForwarding) return;
    if (this.state) this.state.lastSavedTime = this.getTrustedTime();
    writeJSON(this.storageKey, this.state);
  }

  // Yeni haftalık epoch. Üretim Hakkı parametreleri (termostat uygulanmış), Konsey kasası, Hazırlık Deposu
  // ve ömür boyu sayaçlar haftadan haftaya taşınır; kota baştan açılır.
  createNewEpoch(onceki = null) {
    const uretim = this.nextUretim(onceki && onceki.uretim);
    const params = this.uretimParams(uretim);
    const konsey = (onceki && onceki.konsey && onceki.konsey.stock) ? onceki.konsey : { stock: sifirHammadde() };
    const hazirlikDepo = (onceki && onceki.hazirlikDepo) ? onceki.hazirlikDepo : { totalValue: 0 };

    const kaynaklar = {};
    for (const key of kotaAnahtarlari()) {
      const kota = this.computeWeekCapacity(key, params);
      kaynaklar[key] = { remaining: kota, totalCap: kota, baseCap: kota, harvested: 0, depleted: false };
    }

    // UBI: geçen haftanın %6 birikimi + çekilmeyen pay bu haftanın dağıtım kasası olur
    const ubiKasasi = onceki && onceki.ubiV2
      ? openWeek({ accruedLastWeek: onceki.ubiWeekAccrued || 0, unclaimedCarry: onceki.ubiClaimPot || 0 })
      : 0;

    const hazineKopyasi = {
      dungeon: 14000000, ammBuyback: 6000000, arena: 8000000, worldBoss: 8000000, carnival: 4000000
    };

    const state = {
      epochId: onceki ? (onceki.epochId || 1) + 1 : 1,
      epochStartTime: Date.now(),
      epochEndTime: this.getNextWeeklyResetTRT(),
      resources: kaynaklar,
      uretim,
      konsey,
      hazirlikDepo,

      // ASTRA muhasebesi
      maxSupply: MAX_SUPPLY,
      contractAddress: CONTRACT_ADDRESS,
      totalSpent: onceki ? (onceki.totalSpent || 0) : 0,
      totalBurned: onceki ? (onceki.totalBurned || 0) : 0,
      creatorRoyaltyTotal: onceki ? (onceki.creatorRoyaltyTotal || 0) : 0,
      creatorWallet: GAME_CONFIG.CREATOR_WALLET_ADDRESS || YAPIMCI_CUZDAN_YEDEK,
      // UBI: bu hafta birikenler + bu hafta dağıtılan kasa
      ubiV2: true,
      ubiWeekAccrued: 0,
      ubiClaimPot: ubiKasasi,
      ubiClaimPotAtOpen: ubiKasasi,
      ubiPool: ubiKasasi,
      ubiWeeklyDistributed: onceki ? onceki.ubiWeeklyDistributed || 0 : 0,
      // Eski ekonomi panosunun gösterim kopyaları (asıl kayıt treasury defterindedir)
      totalTreasury: onceki ? onceki.totalTreasury || 40000000 : 40000000,
      treasury: onceki ? onceki.treasury || hazineKopyasi : hazineKopyasi,
      totalActiveMiners: 342,
      buybackFromBroadcasting: onceki ? (onceki.buybackFromBroadcasting || 0) : 0,
      totalBurnedResources: onceki ? (onceki.totalBurnedResources || sifirHammadde()) : sifirHammadde(),
      totalBurnedItems: onceki ? (onceki.totalBurnedItems || {}) : {}
    };

    this.state = state;
    this.saveState();
    return state;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ÜRETİM HAKKI: Sirius çıkarma kapasitesi
  //  • Haftalık kapasite (kaynak başına) = Σ aktif oyuncu ağırlığı × taban (dk) × çalışma dakikası
  //                                        × kişi başı kota × Otorite çarpanı × yönetici çarpanı
  //  • Kişi başı kota (qpp): başlangıç 0,40; her hafta fiyat/açılış oranına göre ±%10; 0,05-1,0
  //  • Otorite seviyesi: kapasite +%5/sv, çalışma 20→24 saat, 6→7 gün
  // ═══════════════════════════════════════════════════════════════════════
  uretimParams(u = (this.state && this.state.uretim) || {}) {
    const U = GAME_CONFIG.URETIM_HAKKI || {};
    const kaynak = u && typeof u === 'object' ? u : {};
    const qpp = {};
    for (const k of kotaAnahtarlari()) {
      const v = Number(kaynak.qpp && kaynak.qpp[k]);
      qpp[k] = isFinite(v) && v > 0 ? v : (U.QPP_START ?? 0.4);
    }
    return {
      qpp,
      adminMult: Number(kaynak.adminMult) > 0 ? Number(kaynak.adminMult) : (U.ADMIN_MULT ?? 1),
      otoriteLevel: Math.max(0, Number(kaynak.otoriteLevel) || 0),
      sumWeight: Number(kaynak.sumWeight) > 0 ? Number(kaynak.sumWeight) : 1,
      priceRatio: (kaynak.priceRatio && typeof kaynak.priceRatio === 'object') ? kaynak.priceRatio : {},
      botRatio: Number(kaynak.botRatio) > 0 ? Number(kaynak.botRatio) : 1,
      pay: (kaynak.pay && typeof kaynak.pay === 'object') ? kaynak.pay : {}   // kaynak -> { A (null = sınırsız), phi, total }: sunucu saatte bir dağıtımı yazar
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
  // Bir birim ağırlık için KİŞİSEL haftalık limit (birim): sabit KISISEL_QPP ile (19 Ekim 2026; eskiden termostatlı qpp)
  weeklyRightPerWeight(key, params = this.uretimParams()) {
    const U = GAME_CONFIG.URETIM_HAKKI || {};
    const hiz = (GAME_CONFIG.BASE_PRODUCTION || {})[key] || 0;
    const calisma = this.otoriteWork(params.otoriteLevel);
    return hiz * calisma.minutes * (U.KISISEL_QPP ?? U.QPP_START ?? 0.4) * calisma.mult * params.adminMult;
  }

  // Global haftalık havuz G (kaynak başına): oyuncu sayısından bağımsız; qpp havuz çarpanıdır (fiyat ve bot girişiyle ayarlanır)
  globalHavuz(key, params = this.uretimParams()) {
    const U = GAME_CONFIG.URETIM_HAKKI || {};
    const hiz = (GAME_CONFIG.BASE_PRODUCTION || {})[key] || 0;
    const calisma = this.otoriteWork(params.otoriteLevel);
    return hiz * calisma.minutes * (params.qpp[key] || 0) * calisma.mult * params.adminMult * (U.REFERANS_AGIRLIK ?? 120);
  }

  // Dünya haftalık kapasitesi: sunucu dağıtımı yazdıysa dağıtılan toplam; yoksa (tek oyuncu / ilk saat) havuzla herkesin limitleri toplamının küçüğü
  computeWeekCapacity(key, params = this.uretimParams()) {
    const yazilan = params.pay && params.pay[key] ? params.pay[key].total : null;
    if (yazilan != null && isFinite(Number(yazilan)) && Number(yazilan) >= 0) return Math.floor(Number(yazilan) + 1e-6);
    return Math.floor(Math.min(this.globalHavuz(key, params), this.weeklyRightPerWeight(key, params) * params.sumWeight) + 1e-6);
  }

  // Sunucu saatte bir: global havuzun oyunculara dağıtımı (kaynak -> { A, phi, total }) ve bot ASTRA giriş oranı
  setUretimPay(pay, botRatio) {
    if (!this.state) return;
    this._uretimiHazirla();
    this.state.uretim.pay = pay && typeof pay === 'object' ? pay : {};
    if (Number(botRatio) > 0) this.state.uretim.botRatio = Number(botRatio);
    this.recomputeWeekCapacity();
  }

  // ACİL DURUM: bir hammaddenin fiyatı açılışın ACIL_ESIK katına çıkmışsa (oyun oynanmaz olmasın) havuz haftayı beklemeden ACIL_ARTIS kadar açılır (günde en çok 1 kez)
  uretimAcilDurum(zaman = this.getTrustedTime()) {
    if (!this.state) return {};
    this._uretimiHazirla();
    const U = GAME_CONFIG.URETIM_HAKKI || {};
    const u = this.state.uretim;
    const sonuc = {};
    for (const k of kotaAnahtarlari()) {
      const oran = Number((u.priceRatio || {})[k]);
      if (!(oran >= (U.ACIL_ESIK ?? 3))) continue;
      if (zaman - (Number((u.acilSon || {})[k]) || 0) < 24 * 3600 * 1000) continue;
      const eski = Number(u.qpp[k]) || (U.QPP_START ?? 0.4);
      const yeni = Math.min(U.QPP_MAX ?? 1.2, Math.round(eski * (U.ACIL_ARTIS ?? 1.25) * 1000) / 1000);
      if (yeni <= eski) continue;
      u.qpp[k] = yeni;
      u.acilSon = { ...(u.acilSon || {}), [k]: zaman };
      sonuc[k] = { from: eski, to: yeni, priceRatio: oran };
    }
    if (Object.keys(sonuc).length) { this.recomputeWeekCapacity(); this.saveState(); }
    return sonuc;
  }

  // Yeni haftanın parametreleri: termostat (fiyat/açılış oranı) kotayı ±%10 oynatır
  nextUretim(oncekiU) {
    const U = GAME_CONFIG.URETIM_HAKKI || {};
    const p = this.uretimParams(oncekiU || {});
    const qpp = { ...p.qpp };
    const uygulanan = {};
    // 19 Ekim 2026: havuz çarpanı fiyat bandına ve bot ASTRA girişine göre ayarlanır (js/economy/uretimDagitimi.js)
    for (const k of Object.keys(qpp)) {
      const oran = Number((p.priceRatio || {})[k]);
      const bot = Number(p.botRatio) > 0 ? Number(p.botRatio) : 1;
      if (!(isFinite(oran) && oran > 0) && bot === 1) continue;
      const yeni = yeniHavuzCarpani(qpp[k], isFinite(oran) && oran > 0 ? oran : 1, bot, U);
      uygulanan[k] = { from: qpp[k], to: yeni, priceRatio: oran, botRatio: bot };
      qpp[k] = yeni;
    }
    return { qpp, adminMult: p.adminMult, otoriteLevel: p.otoriteLevel, sumWeight: p.sumWeight, priceRatio: {}, priceAt: 0, botRatio: 1, pay: p.pay, acilSon: {}, lastTermostat: uygulanan };
  }

  _uretimiHazirla() {
    if (!this.state.uretim || !this.state.uretim.qpp) this.state.uretim = this.nextUretim(this.state.uretim || null);
  }

  // Adalet tavanı: dünyadaki en düşük aktif ağırlığın FAIRNESS_CAP katı.
  // server/world/uretim.js saatte bir yazar; js/gameState/ekonomi.js getUretimWeight() uygular.
  setFairnessCapWeight(v) {
    if (!this.state) return;
    this._uretimiHazirla();
    this.state.uretim.fairnessCapWeight = Math.max(0, Number(v) || 0);
    this.saveState();
  }

  recordPriceRatios(oranlar, zaman = this.getTrustedTime()) {
    if (!this.state) return;
    this._uretimiHazirla();
    this.state.uretim.priceRatio = { ...(oranlar || {}) };
    this.state.uretim.priceAt = zaman;
    this.saveState();
  }

  // Aktif oyuncu ağırlıkları toplamı değişince (yeni oyuncu, hafta başı) kapasite yeniden hesaplanır;
  // çıkarılan ve yakılan korunur
  setSumWeight(toplam) {
    if (!this.state) return;
    this._uretimiHazirla();
    this.state.uretim.sumWeight = Math.max(0.001, Number(toplam) || 1);
    this.recomputeWeekCapacity();
  }

  recomputeWeekCapacity() {
    if (!this.state || !this.state.resources) return;
    const params = this.uretimParams();
    for (const key of kotaAnahtarlari()) {
      const r = this.state.resources[key];
      const kota = this.computeWeekCapacity(key, params);
      if (!r) {
        this.state.resources[key] = { remaining: kota, totalCap: kota, baseCap: kota, harvested: 0, depleted: false };
        continue;
      }
      const cikarilan = Math.max(0, Number(r.harvested) || 0);
      r.baseCap = kota;
      r.totalCap = kota;   // yakım kotayı düşürmez (21 Ekim 2026)
      r.remaining = Math.max(0, r.totalCap - cikarilan);
      r.depleted = r.remaining <= 0;
    }
    this.saveState();
  }

  // ── Konsey ortak kasası: çıkarılan her hammaddenin %5'i kaynak olarak burada birikir ──
  addKonseyStock(key, miktar) {
    const q = Math.max(0, Number(miktar) || 0);
    if (!q || !this.state) return 0;
    if (!this.state.konsey || !this.state.konsey.stock) this.state.konsey = { stock: sifirHammadde() };
    this.state.konsey.stock[key] = (Number(this.state.konsey.stock[key]) || 0) + q;
    this.saveState();
    return q;
  }

  // Ortak kasa payı dünya kapasitesinden çıkarılır (oyuncu hasadı sayılmaz, harvest() kancalarına takılmaz)
  takeForKonsey(key, miktar) {
    const r = this.state && this.state.resources && this.state.resources[key];
    const q = Math.max(0, Number(miktar) || 0);
    if (!r || !q) return 0;
    const gercek = Math.max(0, Math.min(q, this.getAvailableToday(key)));
    if (gercek <= 0) return 0;
    r.remaining -= gercek;
    r.harvested = (r.harvested || 0) + gercek;
    if (r.remaining <= 0) { r.remaining = 0; r.depleted = true; }
    this.addKonseyStock(key, gercek);
    return gercek;
  }

  getKonseyStock() {
    return { ...sifirHammadde(), ...((this.state && this.state.konsey && this.state.konsey.stock) || {}) };
  }

  // ── Kalıcı yakım ───────────────────────────────────────────────────────
  // Harcanan hammadde bu yöntemle yakılır: ömür boyu ve haftalık yakım sayaçlarına yazılır. 21 Ekim 2026 (sahip kararı): yakım
  // haftalık çıkarma kotasını (totalCap, remaining) DÜŞÜRMEZ. Kota yalnız enflasyon aracıdır; bir oyuncunun harcaması (hesap/silo/teçhizat,
  // pazardan alıp yakmak) herkesin üretimini kapatmamalı (29 Eylül denetimi E2). Fiyat tarafı termostatla ayarlanır.
  recordResourceBurn(key, miktar) {
    const q = Number(miktar) || 0;
    if (q <= 0) return { burned: 0 };

    if (!this.state.totalBurnedResources) this.state.totalBurnedResources = sifirHammadde();
    this.state.totalBurnedResources[key] = (this.state.totalBurnedResources[key] || 0) + q;

    const r = this.state.resources && this.state.resources[key];
    if (r) r.burned = (r.burned || 0) + q;   // haftalık yakım istatistiği (hafta dönünce yeni kayıtla sıfırlanır)

    this.saveState();
    return { resourceKey: key, amount: q, remainingCap: r ? r.totalCap : 0, remaining: r ? r.remaining : 0 };
  }

  // Kullanılınca oyundan çıkan eşyalar (parça, anahtar, kutu, parşömen): yalnız kayıt.
  // Hammadde gibi haftalık kotayı etkilemez, katkı puanı vermez.
  recordItemBurn(tur, miktar) {
    const q = Number(miktar) || 0;
    if (!q || !tur) return 0;
    if (!this.state.totalBurnedItems) this.state.totalBurnedItems = {};
    this.state.totalBurnedItems[tur] = Math.max(0, (this.state.totalBurnedItems[tur] || 0) + q);
    this.saveState();
    return q;
  }

  // ── Kota gün gün açılır: haftalık kotanın her gün 1/7'si; açılan ama çıkarılmayan hafta içinde birikir ──
  getEpochDayIndex(simdi = this.getTrustedTime()) {
    const baslangic = (this.state.epochEndTime || simdi) - 7 * GUN_MS;
    return Math.max(0, Math.min(6, Math.floor((simdi - baslangic) / GUN_MS)));
  }

  getReleasedCap(key, simdi = this.getTrustedTime()) {
    const r = this.state.resources[key];
    if (!r) return 0;
    const taban = r.baseCap ?? r.totalCap ?? 0;
    return Math.floor(taban * (this.getEpochDayIndex(simdi) + 1) / 7);
  }

  getAvailableToday(key, simdi = this.getTrustedTime()) {
    const r = this.state.resources[key];
    if (!r) return 0;
    return Math.max(0, Math.min(r.remaining, this.getReleasedCap(key, simdi) - (r.harvested || 0)));
  }

  getNextReleaseTime(simdi = this.getTrustedTime()) {
    const baslangic = (this.state.epochEndTime || simdi) - 7 * GUN_MS;
    return baslangic + (this.getEpochDayIndex(simdi) + 1) * GUN_MS;
  }

  // Oyuncu kaynak topladığında dünya kotasından düşer; gerçekten verilen miktarı döndürür
  harvest(key, miktar) {
    const r = this.state.resources[key];
    if (!r) return 0;

    const gercek = Math.max(0, Math.min(miktar, this.getAvailableToday(key)));
    r.remaining -= gercek;
    r.harvested = (r.harvested || 0) + gercek;
    if (r.remaining <= 0) {
      r.remaining = 0;
      r.depleted = true;
    }
    this.saveState();
    return gercek;
  }

  // ── ASTRA harcama muhasebesi ───────────────────────────────────────────
  // Harcanan her ASTRA: %5 kalıcı yakım + %3 yapımcı telifi + %6 UBI + %86 hazine kasaları = %100
  recordTokenSpend(astra) {
    if (isNaN(astra) || astra <= 0) return { burned: 0, creatorRoyalty: 0, ubiShare: 0, treasuryShare: 0 };

    const yakimOrani = GAME_CONFIG.TOKEN_BURN_RATE ?? 0.05;
    const telifOrani = GAME_CONFIG.CREATOR_ROYALTY_RATE ?? 0.03;
    const ubiOrani = GAME_CONFIG.UBI_POOL_RATE ?? 0.06;
    const hazineOrani = GAME_CONFIG.TOKEN_REWARD_POOL_RATE ?? 0.86;

    const s = this.state;
    s.totalSpent = (s.totalSpent || 0) + astra;

    const burned = astra * yakimOrani;
    s.totalBurned = (s.totalBurned || 0) + burned;

    const creatorRoyalty = astra * telifOrani;
    s.creatorRoyaltyTotal = (s.creatorRoyaltyTotal || 0) + creatorRoyalty;
    s.creatorWallet = GAME_CONFIG.CREATOR_WALLET_ADDRESS;

    const ubiShare = astra * ubiOrani;
    s.ubiWeekAccrued = (s.ubiWeekAccrued || 0) + ubiShare;
    s.ubiPool = (s.ubiClaimPot || 0) + s.ubiWeekAccrued;

    const treasuryShare = astra * hazineOrani;
    s.totalTreasury = (s.totalTreasury || 0) + treasuryShare;

    // Hazine defterine gerçek giriş
    const dagilim = treasury.deposit(treasuryShare);
    treasury.recordBurn(burned);

    // Eski panonun gösterim kopyası
    s.treasury = Object.fromEntries(Object.keys(GAME_CONFIG.TREASURY_SEED || {}).map(k => [k, treasury.getPool(k)]));

    this.saveState();
    return { burned, creatorRoyalty, ubiShare, treasuryShare, allocations: dagilim.allocations };
  }

  // Ödül çekimi için tek geçit: hiçbir modül bakiyeye doğrudan ASTRA eklemez. Tam sayı verilir,
  // kesirli artık kasada kalır.
  withdrawReward(kasa, miktar) {
    return treasury.withdrawWhole(kasa, miktar);
  }

  // ── Evrensel Temel Gelir (UBI) ─────────────────────────────────────────
  // Bu haftanın hak sahiplerinin ağırlık toplamı. Tarayıcıda dünya tek oyunculu (+ ayarlardaki temsili
  // diğer oyuncular); sunucuda server/engine.js bunu gerçek hak sahiplerinin toplamıyla değiştirir.
  getUbiTotalWeight(playerLevel = 1) {
    const digerleri = (GAME_CONFIG.UBI_CONFIG && GAME_CONFIG.UBI_CONFIG.LOCAL_OTHER_PLAYERS_WEIGHT) || 0;
    return levelWeight(playerLevel, UBI_KURALLARI) + digerleri;
  }

  getUbiPoolInfo(playerLevel = 1, lastClaimedEpoch = 0) {
    const seviye = Math.max(1, Math.min(81, playerLevel || 1));
    const kasa = this.state.ubiClaimPotAtOpen || 0;
    const paySeviyesi = L => shareOf({ pot: kasa, playerLevel: L, totalWeight: this.getUbiTotalWeight(L), rules: UBI_KURALLARI });
    const payout = paySeviyesi(seviye);
    // Bu hafta birikenin gelecek Pazartesi açıldığında senin payın (19 Ekim 2026: oyuncu "havuzda ASTRA var ama payım 0" diye karışıyordu)
    const birikenPay = shareOf({ pot: this.state.ubiWeekAccrued || 0, playerLevel: seviye, totalWeight: this.getUbiTotalWeight(seviye), rules: UBI_KURALLARI });
    const sonraki = Math.min(81, seviye + 1);
    const w = levelWeight(seviye, UBI_KURALLARI);
    const wSonraki = levelWeight(sonraki, UBI_KURALLARI);
    return {
      totalPool: Math.round((this.state.ubiClaimPot || 0) + (this.state.ubiWeekAccrued || 0)),
      weeklyBudget: Math.round(kasa),
      claimRemaining: Math.round(this.state.ubiClaimPot || 0),
      accruingThisWeek: Math.round(this.state.ubiWeekAccrued || 0),
      epochId: this.state.epochId,
      alreadyClaimedThisWeek: lastClaimedEpoch === this.state.epochId,
      eligible: isEligible(seviye, UBI_KURALLARI),
      minLevel: UBI_KURALLARI.minLevel,
      nextResetTimestamp: this.getNextWeeklyResetTRT(),
      playerLevel: seviye,
      playerWeight: Math.round(w * 100) / 100,
      nextLevelWeight: Math.round(wSonraki * 100) / 100,
      payout,
      nextWeekPayout: birikenPay,
      nextLevelPayout: paySeviyesi(sonraki),
      increasePct: w > 0 ? Math.round(((wSonraki - w) / w) * 100) : 0
    };
  }

  claimWeeklyUbi(playerLevel = 1, currentBalance = 0, lastClaimedEpoch = 0) {
    if (lastClaimedEpoch === this.state.epochId) {
      return {
        success: false,
        message: 'Bu haftaki Evrensel Temel Gelir (UBI) ödülünüzü zaten talep ettiniz. Sonraki dağıtım Pazar ➜ Pazartesi 00:01 TRT döngüsünde açılacaktır.'
      };
    }

    const bilgi = this.getUbiPoolInfo(playerLevel, lastClaimedEpoch);
    if (!bilgi.eligible) {
      return { success: false, message: `Haftalık temel gelir ${bilgi.minLevel}. seviyeden itibaren alınabilir.` };
    }
    const miktar = Math.min(bilgi.payout, this.state.ubiClaimPot || 0);
    if (miktar <= 0) {
      return {
        success: false,
        message: 'Bu haftanın temel gelir kasası boş. Kasa, oyunda harcanan her ASTRA\'nın %6\'sıyla dolar ve Pazartesi 00:01 (TSİ) açılır.'
      };
    }

    this.state.ubiClaimPot = Math.max(0, (this.state.ubiClaimPot || 0) - miktar);
    this.state.ubiPool = this.state.ubiClaimPot + (this.state.ubiWeekAccrued || 0);
    this.state.ubiWeeklyDistributed = (this.state.ubiWeeklyDistributed || 0) + miktar;
    this.saveState();

    return {
      success: true,
      amount: miktar,
      playerLevel,
      epochId: this.state.epochId,
      message: `🏛️ Seviye ${playerLevel} Evrensel Temel Geliriniz (+${miktar.toLocaleString('tr-TR')} 🟣 ASTRA) bakiyene eklendi!`
    };
  }

  // ── Canlı ekonomik sağlık göstergeleri ─────────────────────────────────
  // Ölçülen şey ÖDEME GÜCÜ: hazineden çıkanın girene oranı. En ağır eşik önce denetlenir.
  getEconomicHealthMetrics() {
    const t = treasury.getSummary();

    // > 1 → dağıtım girişten fazla (kasalar eriyor), < 1 → birikim var
    const odemeOrani = t.lifetimeDeposited > 0 ? t.lifetimeWithdrawn / t.lifetimeDeposited : 0;
    const E_net = odemeOrani - 1;

    // Kaynak denge katsayısı: tüketim oranı ÷ haftanın geçen payı (gerçek havuz tüketiminden)
    const sigmaOf = key => {
      const r = this.state.resources[key];
      if (!r || !r.totalCap) return 1;
      const tuketilen = 1 - (r.remaining / r.totalCap);
      const gecen = Math.max(1, Date.now() - (this.state.epochStartTime || Date.now()));
      const uzunluk = Math.max(1, (this.state.epochEndTime || Date.now()) - (this.state.epochStartTime || Date.now()));
      const beklenen = Math.min(1, gecen / uzunluk);
      return beklenen > 0 ? +(tuketilen / beklenen).toFixed(3) : 1;
    };

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

    const yakilan = this.state.totalBurned || 0;
    return {
      E_net: parseFloat(E_net.toFixed(4)),
      payoutRatio: parseFloat(odemeOrani.toFixed(4)),
      treasuryHealth: parseFloat(t.avgHealth.toFixed(3)),
      sigmaWheat: sigmaOf('wheat'),
      sigmaIron: sigmaOf('iron'),
      sigmaWood: sigmaOf('wood'),
      healthStatus,
      statusText,
      statusBadgeColor,
      totalBurned: yakilan,
      // Deflasyon dolaşımdaki arz üzerinden raporlanır, azami arz üzerinden değil
      circulatingEstimate: Math.max(0, CIRCULATING_SUPPLY_ESTIMATE - yakilan),
      burnedPctOfCirculating: parseFloat(((yakilan / CIRCULATING_SUPPLY_ESTIMATE) * 100).toFixed(4)),
      treasuryPools: t.pools
    };
  }

  // Test menüsündeki makro ekonomi projeksiyonu (1-365 gün). Sabitleri eski v1 oranlarıdır (%18 yakım / %82 hazine).
  simulateMacroEconomy(oyuncuSayisi = 500, gun = 30) {
    const projeksiyon = [];
    let yakilan = this.state.totalBurned;
    let hazine = this.state.totalTreasury;

    for (let d = 1; d <= gun; d++) {
      const aktif = Math.floor(oyuncuSayisi * (0.65 + Math.random() * 0.25));
      const kisiBasiHarcama = 85 + Math.random() * 45;
      const gunlukHarcama = aktif * kisiBasiHarcama;

      const gunlukYakim = gunlukHarcama * 0.18;
      const gunlukHazine = gunlukHarcama * 0.82;
      const yayinDestegi = (1200 + Math.random() * 800) * 0.35;

      yakilan += gunlukYakim + (yayinDestegi * 0.5);
      hazine += gunlukHazine + (yayinDestegi * 0.5);

      projeksiyon.push({
        day: d,
        activePlayers: aktif,
        dailySpend: Math.floor(gunlukHarcama),
        dailyBurn: Math.floor(gunlukYakim),
        cumulativeBurned: Math.floor(yakilan),
        circulatingSupply: Math.floor(MAX_SUPPLY - yakilan),
        dungeonVault: Math.floor(hazine * 0.35),
        ammBuybackVault: Math.floor(hazine * 0.30),
        arenaVault: Math.floor(hazine * 0.25),
        stakingVault: Math.floor(hazine * 0.10)
      });
    }
    return projeksiyon;
  }

  // ── Bilgi ──────────────────────────────────────────────────────────────
  getResourceInfo(key) {
    const config = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[key];
    const guncel = this.state.resources[key] || { remaining: 0, totalCap: config.totalCap, depleted: true };
    const yuzde = Math.max(0, Math.min(100, (guncel.remaining / guncel.totalCap) * 100));
    return {
      ...config,
      remaining: Math.floor(guncel.remaining),
      percent: yuzde.toFixed(1),
      isDepleted: guncel.remaining <= 0,
      baseCap: guncel.baseCap ?? config.totalCap,
      currentCap: guncel.totalCap,
      availableToday: Math.floor(this.getAvailableToday(key)),
      releasedCap: this.getReleasedCap(key),
      harvestedThisWeek: Math.floor(guncel.harvested || 0),
      dayIndex: this.getEpochDayIndex(),
      nextReleaseAt: this.getNextReleaseTime()
    };
  }

  // ── Sıfırlama ──────────────────────────────────────────────────────────
  resetEpoch() {
    this.state = this.createNewEpoch();
    this.saveState();
    return this.state;
  }

  // Tüm tokenomik sayaçları (yakım, harcama, telif) sıfırlar
  vanillaReset() {
    removeJSON(this.storageKey);
    this.state = this.createNewEpoch(null);
    this.state.totalSpent = 0;
    this.state.totalBurned = 0;
    this.state.creatorRoyaltyTotal = 0;
    this.state.buybackFromBroadcasting = 0;
    this.state.totalBurnedResources = sifirHammadde();
    this.saveState();
    return this.state;
  }
}

// v2: Sirius Konseyi (ortak kasa, Madencilik Otoritesi inşaatı, Konsey projeleri) ve Hazırlık Deposu
Object.assign(GlobalResourceManager.prototype, globalPoolV2);
Object.assign(GlobalResourceManager.prototype, globalPoolV2Depot);
export const globalPool = new GlobalResourceManager();
