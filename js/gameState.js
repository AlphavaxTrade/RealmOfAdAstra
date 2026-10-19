// Realm of AdAstra — Oyuncu durumu yöneticisi (GameStateManager)
// ============================================================================
// Çekirdek sınıf burada: kurucu, kayıt / yükleme, bildirimler, asker ve alet kayıtlarının
// birleştirilmesi. Oyun kuralları alan bazlı karışımlar olarak js/gameState/*.js içindedir
// (her biri `Object.assign(GameStateManager.prototype, ...)` ile eklenir).
//
// Aynı sınıf tarayıcıda da sunucuda da çalışır (server/engine.js): kayıt localStorage'a,
// sunucuda localStorage taklidi üzerinden sqlite'a yazılır.
// ============================================================================

import { GAME_CONFIG } from './config.js';
import { globalPool } from './globalPool.js';
import { ammMarket } from './ammMarket.js';
import { readJSON, writeJSON } from './storage.js';
import { soldierPortraitFor, zeroRes } from './gameState/ortak.js';
import { gameStateV2, gameStateV2Depot } from './v2/koyVeKonsey.js';
import { ekonomiYontemleri } from './gameState/ekonomi.js';
import { orduYontemleri } from './gameState/ordu.js';
import { seferYontemleri } from './gameState/sefer.js';
import { botYontemleri } from './gameState/bot.js';
import { hasatYontemleri } from './gameState/hasat.js';
import { gelisimYontemleri } from './gameState/gelisim.js';
import { techizatYontemleri } from './gameState/techizat.js';
import { botPaketiYontemleri } from './gameState/botPaketi.js';
import { botSiloYontemleri } from './gameState/botSilo.js';
import { karnavalYontemleri } from './gameState/karnaval.js';
import { piyangoYontemleri } from './gameState/piyango.js';
import { promoYontemleri } from './gameState/promo.js';
import { parsomenYontemleri } from './gameState/parsomen.js';
import { kesifYontemleri } from './gameState/kesif.js';
import { gelistiriciYontemleri } from './gameState/gelistirici.js';
import { ozetYontemleri } from './gameState/ozet.js';
import { topluYontemleri } from './gameState/toplu.js';
import { gunlukYontemleri } from './gameState/gunluk.js';
import { zindanYontemleri } from './gameState/zindan.js';
import { telemetriKur } from './gameState/telemetri.js';
import { kolezyumYontemleri } from './gameState/kolezyum.js';
import { dunyaBossuYontemleri } from './gameState/dunyaBossu.js';
import { askerGelisimYontemleri } from './gameState/askerGelisim.js';
import { rehberYontemleri } from './gameState/rehber.js';
import { pazarYontemleri } from './gameState/pazar.js';
import { katilimYontemleri } from './gameState/katilim.js';
import { fatihYontemleri } from './gameState/fatih.js';
import { genesisYontemleri } from './gameState/genesis.js';
import { ogreticiYontemleri, ogreticiIsaretleriKur } from './gameState/ogretici.js';

// Oyuncunun yazdığı isimler için temizleyici dışarı da açıktır (sunucu ve testler kullanır)
export { cleanName } from './gameState/ortak.js';

const DONANIM_YUVALARI = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
const bosDonanim = () => Object.fromEntries(DONANIM_YUVALARI.map(y => [y, null]));
const SAVAS_ON_AYARLARI = [1, 2, 3];
const ALET_TAM_DAYANIKLILIK = 4320;   // dakika: 72 saatlik kullanım

// Yeni askerlerin başlangıç yetenekleri: ilk dört asker farklı rol alır
const ILK_YETENEKLER = ['shieldWall', 'shockwave', 'fieldMedic', 'armorBreaker'];

const piyangoKonfigi = () => (GAME_CONFIG.CARNIVAL && GAME_CONFIG.CARNIVAL.LOTTERY) || {};
const biletBedeli = () => piyangoKonfigi().TICKET_COST_ADA || 100;
const amortiPayi = () => piyangoKonfigi().AMORTI_SHARE ?? 0.02;

export class GameStateManager {
  constructor() {
    this.storageKey = 'adastra_player_save_v6';
    this._simNow = null;       // simülasyon saati: çevrimdışı telafi / ileri sarma sırasında dolu
    this._lastSaveAt = 0;      // kare döngüsünden gelen kayıtları seyreltmek için
    this.state = this.loadState();
    this.listeners = [];

    // Piyango: ilk açılışta mevcut haftayı "çekilişi yapılmış" say (yeni hesap geçmiş haftayı çekemez)
    if (this.state.lastLotteryDrawEpoch == null && globalPool && globalPool.state) {
      this.state.lastLotteryDrawEpoch = globalPool.state.epochId || 1;
    }
    // Bileti olup amorti kasası boş kalan kayıtta amorti payı hemen tamamlanır
    if (this.state.lotteryTickets > 0 && !this.state.lotteryAmortiPool) {
      this.state.lotteryAmortiPool = Math.round(this.state.lotteryTickets * biletBedeli() * amortiPayi());
      this.saveState();
    }
    // Pazar fiyatı değişince arayüz haberdar olur
    if (ammMarket && ammMarket.subscribe) ammMarket.subscribe(() => this.notifyListeners());
  }

  // ── Zaman ──────────────────────────────────────────────────────────────
  // Oyun saati: normalde gerçek saat; çevrimdışı telafi ve ileri sarmada simülasyon saati.
  // Bot süresi, sefer başlangıcı ve güçlendirme süreleri hep bu saate göre hesaplanır.
  _now() {
    return this._simNow != null ? this._simNow : Date.now();
  }

  // ── Kayıt ──────────────────────────────────────────────────────────────
  // Kare döngüsünden gelen küçük değişiklikler (stamina, iyileşme, sefer ilerlemesi) için seyreltilmiş
  // kayıt. Oyuncu eylemleri saveState() ile hemen kaydedilir.
  requestSave(minAralikMs = 2000) {
    if (this._isFastForwarding) return;
    if (Date.now() - (this._lastSaveAt || 0) >= minAralikMs) this.saveState();
  }

  saveState() {
    this.enforceWarehouseLimits();
    if (this._isFastForwarding) return;   // simülasyonda diske yazma ve dinleyici tetikleme yok
    this.state.lastSeenAt = Date.now();
    this._lastSaveAt = this.state.lastSeenAt;
    writeJSON(this.storageKey, this.state);
    this.notifyListeners();
  }

  subscribe(fn) {
    if (typeof fn === 'function') this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  notifyListeners() {
    if (!this.listeners) return;
    for (const fn of this.listeners) {
      try { fn(this.state); } catch (e) { console.error('Durum dinleyicisi hata verdi:', e); }
    }
  }

  // Kayıt üzerine başlangıç profili ve eski kayıt onarımları uygulanır. Bozuk kayıt son sağlam
  // yedekten açılır (bkz. storage.js).
  loadState() {
    const kayit = readJSON(this.storageKey).data || {};
    const baslangic = GAME_CONFIG.STARTING_PROFILE;

    // Eski alanlar: günlük görevler kalktı; karakter XP'si tek sayaçta birleşti
    delete kayit.dailyQuests;
    if (kayit.characterXp != null) {
      kayit.currentXp = (Number(kayit.currentXp) || 0) + Number(kayit.characterXp);
      delete kayit.characterXp;
    }

    const piyango = piyangoKonfigi();
    const piyangoKasasi = (kayit.lotteryPool != null && isFinite(kayit.lotteryPool) && kayit.lotteryPool >= 0)
      ? kayit.lotteryPool
      : (piyango.SEED_POOL_ADA || 4000000);   // yalnız hiç kayıt yoksa tohumla başlar (her yüklemede tamamlanmaz)
    const amortiKasasi = (kayit.lotteryAmortiPool != null && kayit.lotteryAmortiPool > 0)
      ? kayit.lotteryAmortiPool
      : Math.round((kayit.lotteryTickets || 0) * biletBedeli() * amortiPayi());
    const fiyatCarpani = GAME_CONFIG.ADA_PRICE_MULTIPLIER;

    const durum = {
      ...baslangic,
      ...kayit,
      currentXp: kayit.currentXp != null ? Number(kayit.currentXp) : (baslangic.currentXp || 0),
      inventory: { ...baslangic.inventory, ...(kayit.inventory || {}) },
      tools: this.mergeTools(kayit.tools),
      army: { ...baslangic.army, ...(kayit.army || {}) },
      warehouseLevel: kayit.warehouseLevel || 1,
      activeBuffs: kayit.activeBuffs || {},
      activeExpeditions: kayit.activeExpeditions || {},
      lockedBoxes: kayit.lockedBoxes || 0,
      arenaKeys: kayit.arenaKeys || 0,
      genesisNftMinted: kayit.genesisNftMinted || false,
      uretim: kayit.uretim || null,   // Üretim Hakkı kullanımı (hafta, kullanılan, aktif günler)
      rocketReady: !!kayit.rocketReady,
      rocketBuiltAt: kayit.rocketBuiltAt || 0,
      rocketLevel: Math.max(0, Math.min(5, Number(kayit.rocketLevel) || (kayit.rocketReady ? 1 : 0))),   // 0 = yok, 1-5 roket seviyesi (config UZAY_LIMANI.ROCKET_LEVELS)
      grants: Array.isArray(kayit.grants) ? kayit.grants : [],
      equipment: { ...bosDonanim(), ...(kayit.equipment || {}) },
      armoryInventory: Array.isArray(kayit.armoryInventory) ? kayit.armoryInventory : [],
      collectionArtifacts: this.mergeCollectionArtifacts(kayit.collectionArtifacts),
      soldierUnits: this.mergeSoldierUnits(kayit.soldierUnits),
      combatPresets: this.mergeCombatPresets(kayit.combatPresets),
      dungeonMonsterCurrentHp: kayit.dungeonMonsterCurrentHp || {},
      lotteryTickets: kayit.lotteryTickets || 0,
      lotteryPool: piyangoKasasi,
      lotteryPendingPayout: Number(kayit.lotteryPendingPayout) || 0,
      lastLotteryDrawEpoch: kayit.lastLotteryDrawEpoch ?? null,
      lastLotteryResult: kayit.lastLotteryResult || null,
      lotteryAmortiPool: amortiKasasi,
      onboarding: (kayit.onboarding && typeof kayit.onboarding === 'object') ? kayit.onboarding : {},
      botTrialUsed: !!kayit.botTrialUsed,
      pendingNotices: Array.isArray(kayit.pendingNotices) ? kayit.pendingNotices.slice(-20) : [],
      offlineReport: kayit.offlineReport || null,
      lastSeenAt: kayit.lastSeenAt || 0,
      wheelTicketShards: kayit.wheelTicketShards || 0,
      wheelPity: kayit.wheelPity || 0,
      botSiloAutoUpgrade: kayit.botSiloAutoUpgrade !== undefined ? kayit.botSiloAutoUpgrade : true,
      botAutoRenew24h: kayit.botAutoRenew24h !== undefined ? kayit.botAutoRenew24h : false,
      botActiveUntil: kayit.botActiveUntil || 0,
      redeemCodes: Array.isArray(kayit.redeemCodes) ? kayit.redeemCodes : [],
      burnedResources: { ...zeroRes(), ...(kayit.burnedResources || {}) },
      carnivalBurnedResources: { ...zeroRes(), ...(kayit.carnivalBurnedResources || {}) },
      village: {
        ...(baslangic.village || { houses: 1, villagers: 10, labor: 0, lastGrowthAt: 0, starvingSince: 0 }),
        ...(kayit.village || {})
      },
      // Kilitli bakiye eski kayıtlarda yoktu: mevcut bakiye serbest sayılır
      lockedAda: Math.max(0, Number(kayit.lockedAda) || 0),
      sponsorAda: Math.max(0, Number(kayit.sponsorAda) || 0),
      lockUnlock: kayit.lockUnlock || null,
      contribution: kayit.contribution || null,
      adaPriceMultiplier: Number(kayit.adaPriceMultiplier) > 0 ? Number(kayit.adaPriceMultiplier) : (fiyatCarpani?.DEFAULT ?? 1),
      adaPriceMultiplierTarget: kayit.adaPriceMultiplierTarget ?? null,
      adaPriceMultiplierEpoch: kayit.adaPriceMultiplierEpoch ?? null
    };

    // Elle bozulmuş ya da hasarlı kayıtta sayı alanları geçersizse (null, "x", NaN) başlangıç değerine döner:
    // aksi halde ekranlar "NaN" yazar ve stamina NaN kalınca sefer hiç başlatılamaz
    const sayisalAlan = (alan, taban, yedek) => {
      const v = durum[alan];
      const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
      durum[alan] = Number.isFinite(n) ? Math.max(taban, n) : yedek;
    };
    sayisalAlan('level', 1, baslangic.level || 1);
    sayisalAlan('stamina', 0, baslangic.stamina || 0);
    sayisalAlan('adAstraBalance', 0, baslangic.adAstraBalance || 0);
    sayisalAlan('currentXp', 0, baslangic.currentXp || 0);
    return durum;
  }

  // ── Kayıt birleştirme yardımcıları ─────────────────────────────────────
  // 3 savaş tertibi (ön saf / arka saf mevzileri)
  mergeCombatPresets(kayitli) {
    const varsayilan = {
      1: 'Taktik 1: Dengeli',
      2: 'Taktik 2: Savunma Hattı',
      3: 'Taktik 3: Arka Saf Baskını'
    };
    if (!kayitli || typeof kayitli !== 'object') {
      return {
        activePresetId: 1,
        presets: Object.fromEntries(SAVAS_ON_AYARLARI.map(id => [id, { id, name: varsayilan[id], positions: {} }]))
      };
    }
    const aktif = (kayitli.activePresetId && SAVAS_ON_AYARLARI.includes(Number(kayitli.activePresetId)))
      ? Number(kayitli.activePresetId)
      : 1;
    const presets = {};
    for (const id of SAVAS_ON_AYARLARI) {
      const p = kayitli.presets?.[id];
      presets[id] = {
        id,
        name: p?.name || varsayilan[id],
        positions: (p?.positions && typeof p.positions === 'object') ? { ...p.positions } : {}
      };
    }
    return { activePresetId: aktif, presets };
  }

  // 18 koleksiyon eserinin kayıtlı keşif durumu config listesiyle birleştirilir
  mergeCollectionArtifacts(kayitli) {
    const harita = new Map((Array.isArray(kayitli) ? kayitli : []).map(a => [a.id, a]));
    return GAME_CONFIG.COLLECTION_ARTIFACTS.map(cfg => {
      const eski = harita.get(cfg.id);
      // count (kaç kopya), uyandi / uyandiAt (Genesis uyandırması) eskiden burada düşüyordu: kayıt her yüklenince silinirdi (19 Ekim 2026)
      const kayit = { id: cfg.id, discovered: eski ? !!eski.discovered : false, discoveredAt: eski ? (eski.discoveredAt || null) : null };
      if (eski && Number(eski.count) > 0) kayit.count = Math.floor(Number(eski.count));
      if (eski && eski.uyandi) { kayit.uyandi = true; kayit.uyandiAt = Number(eski.uyandiAt) || null; }
      return kayit;
    });
  }

  // 6 alet (config.TOOLS); eski kayıtta olmayan alet tam dayanıklılıkla eklenir.
  mergeTools(kayitli) {
    const aletler = GAME_CONFIG.TOOLS || { axe: 1, pickaxe: 1, sickle: 1 };
    const varsayilan = Object.fromEntries(Object.keys(aletler).map(k => [
      k, { durability: (GAME_CONFIG.TOOLS?.[k]?.maxDurability) || ALET_TAM_DAYANIKLILIK, totalGathered: 0 }
    ]));
    if (!kayitli) return varsayilan;

    // Dayanıklılık dakika cinsindendir; eksik kayıt tam sayılır. (Eski sürümde 100 ve altı değerler "yüzde"
    // sanılıp 43,2 ile çarpılıyordu: neredeyse kırık alet her yüklemede bedavaya yenileniyordu.)
    const birlesik = { ...varsayilan, ...kayitli };
    for (const alet of Object.values(birlesik)) {
      if (alet && alet.durability == null) alet.durability = ALET_TAM_DAYANIKLILIK;
    }
    return birlesik;
  }

  // ── Askerler ───────────────────────────────────────────────────────────
  // Tek tip asker + yetenek yükü: sınıf yoktur, farklılık yeteneklerden ve ön/arka saf konumundan gelir.
  // HP = 100 + 25·(sv−1), ATK = 25 + 6·(sv−1).
  createSoldierUnit(sira) {
    const maxHp = GAME_CONFIG.SOLDIER_MAX_HP || 100;
    const baseAtk = GAME_CONFIG.SOLDIER_BASE_ATK || 25;
    return {
      id: `soldier_${Date.now()}_${sira}`,
      name: `AdAstra Şampiyonu #${sira}`,
      class: 'adastra_champion',
      classId: 'adastra_champion',
      className: 'AdAstra Şampiyonu',
      icon: '⚔️',
      avatar: soldierPortraitFor(sira),
      row: sira <= 2 ? 'front' : 'back',
      skills: [ILK_YETENEKLER[sira - 1] || 'shieldWall'],
      level: 1,
      xp: 0,
      maxHp,
      hp: maxHp,
      baseAtk,
      atk: baseAtk,
      baseArmor: 10,
      baseSpeed: 10,
      baseCrit: 0.05,
      basePen: 5,
      woundedUntil: 0,
      equipment: bosDonanim()
    };
  }

  mergeSoldierUnits(kayitli) {
    if (!Array.isArray(kayitli) || kayitli.length === 0) return [];
    // Kurcalanmış/bozuk kayıttaki nesne olmayan öğeler (null, sayı...) atlanır; yoksa oyun hiç açılmaz (denetim QA-13)
    return kayitli.filter((s) => s && typeof s === 'object').map((s, i) => {
      const level = Math.max(1, s.level || 1);
      const maxHp = 100 + (level - 1) * (GAME_CONFIG.SOLDIER_HP_PER_LEVEL || 25);
      const baseAtk = 25 + (level - 1) * (GAME_CONFIG.SOLDIER_ATK_PER_LEVEL || 6);
      const varsayilanYetenek = i === 0 ? ['shieldWall'] : i === 1 ? ['shockwave'] : ['armorBreaker'];

      return {
        id: s.id || `soldier_${i + 1}`,
        // Oyuncunun verdiği isim korunur
        name: (typeof s.name === 'string' && s.name.trim()) ? s.name : `AdAstra Şampiyonu #${i + 1}`,
        class: 'adastra_champion',
        className: 'AdAstra Şampiyonu',
        icon: '⚔️',
        avatar: (s.avatar && s.avatar !== 'assets/soldier_avatar.jpg') ? s.avatar : soldierPortraitFor(i + 1),
        row: s.row || (i < 2 ? 'front' : 'back'),
        skills: Array.isArray(s.skills) && s.skills.length > 0 ? [...s.skills] : varsayilanYetenek,
        level,
        xp: s.xp || 0,
        maxHp: s.maxHp || maxHp,
        hp: s.hp != null ? Math.min(s.hp, s.maxHp || maxHp) : maxHp,
        baseAtk: s.baseAtk || baseAtk,
        baseArmor: 10,
        baseSpeed: 10,
        baseCrit: 0.05,
        basePen: 5,
        woundedUntil: s.woundedUntil || 0,
        equipment: { ...bosDonanim(), ...(s.equipment || {}) }
      };
    });
  }

  // ── Bildirimler ────────────────────────────────────────────────────────
  // Oyuncuya gösterilecek kısa mesajlar; arayüz her karede toplayıp gösterir (en fazla 20 bekler)
  pushNotice(message, type = 'info') {
    if (!message) return;
    if (!Array.isArray(this.state.pendingNotices)) this.state.pendingNotices = [];
    const liste = this.state.pendingNotices;
    liste.push({ message, type, at: this._now() });
    if (liste.length > 20) liste.splice(0, liste.length - 20);
  }

  consumeNotices() {
    const liste = Array.isArray(this.state.pendingNotices) ? this.state.pendingNotices : [];
    this.state.pendingNotices = [];
    return liste;
  }
}

// Alan bazlı yöntem karışımları (js/gameState/*.js). Hiçbir yöntem adı iki yerde tanımlı olmamalı.
for (const karisim of [
  ekonomiYontemleri, orduYontemleri, seferYontemleri, botYontemleri, hasatYontemleri, gelisimYontemleri,
  techizatYontemleri, botPaketiYontemleri, botSiloYontemleri, karnavalYontemleri, piyangoYontemleri, promoYontemleri, parsomenYontemleri, kesifYontemleri, gelistiriciYontemleri,
  ozetYontemleri, topluYontemleri, gunlukYontemleri, zindanYontemleri, kolezyumYontemleri, dunyaBossuYontemleri,
  askerGelisimYontemleri, rehberYontemleri, pazarYontemleri, katilimYontemleri, fatihYontemleri, genesisYontemleri,
  // Köy Evleri, Şifahane, geri dönüşüm, roket, Konsey katkıları, Hazırlık Deposu (js/v2/koyVeKonsey.js)
  gameStateV2, gameStateV2Depot,
  // Krallık Yolu: bölüm ödülleri ve "ilk kez yapıldı" işaretleri (tüm karışımlardan SONRA)
  ogreticiYontemleri
]) {
  Object.assign(GameStateManager.prototype, karisim);
}
ogreticiIsaretleriKur(GameStateManager.prototype);
telemetriKur(GameStateManager.prototype);   // Denge İzleme kancası (yalnız sunucuda tanımlıdır; tarayıcıda işlemi aynen çalıştırır)

if (typeof globalThis !== 'undefined' && !globalThis.ammMarket) globalThis.ammMarket = ammMarket;
export const gameState = new GameStateManager();
