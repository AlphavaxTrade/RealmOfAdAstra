// AdAstra: Genesis Realm - Gelişmiş Karakter Seviyesi, Ordu, Taverna & Otomasyon Yöneticisi
// Çekirdek sınıf burada (kurucu, kayıt/yükleme, bildirimler); yöntemler alan bazlı karışımlar olarak js/gameState/*.js içindedir
// (kurumsal A3.11, 8 Ekim 2026: 7994 satırlık dosyadan AYNEN bölündü).
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
import { karnavalYontemleri } from './gameState/karnaval.js';
import { kesifYontemleri } from './gameState/kesif.js';
import { gelistiriciYontemleri } from './gameState/gelistirici.js';
import { ozetYontemleri } from './gameState/ozet.js';
import { topluYontemleri } from './gameState/toplu.js';
import { zindanYontemleri } from './gameState/zindan.js';
import { kolezyumYontemleri } from './gameState/kolezyum.js';
import { dunyaBossuYontemleri } from './gameState/dunyaBossu.js';
import { p2pYontemleri } from './gameState/p2p.js';
import { askerGelisimYontemleri } from './gameState/askerGelisim.js';
import { rehberYontemleri } from './gameState/rehber.js';
import { pazarYontemleri } from './gameState/pazar.js';

// Oyuncunun yazdığı isimler için temizleyici dışarı da açıktır (sunucu ve testler kullanır)
export { cleanName } from './gameState/ortak.js';

export class GameStateManager {
  constructor() {
    this.storageKey = 'adastra_player_save_v6';
    this._simNow = null;       // Simülasyon saati (çevrimdışı telafi / ileri sarma sırasında dolu)
    this._lastSaveAt = 0;      // Kare döngüsünden gelen kayıtları seyreltmek için
    this.state = this.loadState();
    this.listeners = [];
    // Piyango: ilk açılışta mevcut haftayı "çekilişi yapılmış" say (yeni hesap geçmiş haftayı çekemez)
    if (this.state.lastLotteryDrawEpoch == null && globalPool && globalPool.state) {
      this.state.lastLotteryDrawEpoch = globalPool.state.epochId || 1;
    }
    // 🛡️ Amorti İade Havuzu Düzeltmesi: Bilet alınmışsa ve amorti kasası 0 kalmışsa %2 payını anında aktar
    if (this.state.lotteryTickets > 0 && (!this.state.lotteryAmortiPool || this.state.lotteryAmortiPool === 0)) {
      const ticketCost = (GAME_CONFIG.CARNIVAL?.LOTTERY?.TICKET_COST_ADA || 100);
      const amortiRate = (GAME_CONFIG.CARNIVAL?.LOTTERY?.AMORTI_SHARE ?? 0.02);
      this.state.lotteryAmortiPool = Math.round(this.state.lotteryTickets * ticketCost * amortiRate);
      this.saveState();
    }
    if (typeof ammMarket !== 'undefined' && ammMarket && ammMarket.subscribe) {
      ammMarket.subscribe(() => {
        this.tickUpgradeCostBot(0);
        this.notifyListeners();
      });
    }
  }

  // ⏱️ Oyun saati: normalde gerçek saat; çevrimdışı telafi ve ileri sarmada simülasyon saati.
  // Bot süresi, sefer başlangıcı ve güçlendirme süreleri hep bu saate göre hesaplanır; böylece
  // "oyun 25 saat kapalı kaldı" gibi durumlarda bot, süresi dolduğu ana kadar doğru çalışır.
  _now() {
    return this._simNow != null ? this._simNow : Date.now();
  }

  // Kare döngüsünden gelen küçük değişiklikler (stamina, iyileşme, sefer ilerlemesi) için seyreltilmiş kayıt.
  // Oyuncu eylemleri saveState() ile hemen kaydedilmeye devam eder.
  requestSave(minIntervalMs = 2000) {
    const t = Date.now();
    if (this._isFastForwarding) return;
    if (t - (this._lastSaveAt || 0) >= minIntervalMs) {
      this.saveState();
    }
  }

  subscribe(fn) {
    if (typeof fn === 'function') {
      this.listeners.push(fn);
    }
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  notifyListeners() {
    if (!this.listeners) return;
    this.listeners.forEach(fn => {
      try { fn(this.state); } catch (e) { console.error('Listener error:', e); }
    });
  }

  loadState() {
    // Bozuk kayıt son sağlam yedekten açılır (bkz. storage.js)
    const parsed = readJSON(this.storageKey).data || {};
    delete parsed.dailyQuests;
    if (parsed.characterXp != null) {
      parsed.currentXp = (Number(parsed.currentXp) || 0) + Number(parsed.characterXp);
      delete parsed.characterXp;
    }
    return {
      ...GAME_CONFIG.STARTING_PROFILE,
      ...parsed,
      currentXp: parsed.currentXp != null ? Number(parsed.currentXp) : (GAME_CONFIG.STARTING_PROFILE.currentXp || 0),
      inventory: { ...GAME_CONFIG.STARTING_PROFILE.inventory, ...(parsed.inventory || {}) },
      tools: this.mergeTools(parsed.tools),
      army: { ...GAME_CONFIG.STARTING_PROFILE.army, ...(parsed.army || {}) },
      warehouseLevel: parsed.warehouseLevel || 1,
      activeBuffs: parsed.activeBuffs || {},
      activeExpeditions: parsed.activeExpeditions || {},
      lockedBoxes: parsed.lockedBoxes || 0,
      arenaKeys: parsed.arenaKeys || 0,
      genesisNftMinted: parsed.genesisNftMinted || false,
      uretim: parsed.uretim || null,   // v2: Üretim Hakkı kullanımı (hafta, kullanılan, aktif günler)
      rocketReady: !!parsed.rocketReady,
      rocketBuiltAt: parsed.rocketBuiltAt || 0,
      grants: Array.isArray(parsed.grants) ? parsed.grants : [],
      equipment: {
        weapon: null,
        helmet: null,
        armor: null,
        legs: null,
        boots: null,
        ...(parsed.equipment || {})
      },
      armoryInventory: Array.isArray(parsed.armoryInventory) ? parsed.armoryInventory : [],
      collectionArtifacts: this.mergeCollectionArtifacts(parsed.collectionArtifacts),
      soldierUnits: this.mergeSoldierUnits(parsed.soldierUnits),
      combatPresets: this.mergeCombatPresets(parsed.combatPresets),
      dungeonMonsterCurrentHp: parsed.dungeonMonsterCurrentHp || {},
      lotteryTickets: parsed.lotteryTickets || 0,
      // v1.25: Piyango kasası artık her yüklemede tohuma tamamlanmıyor (sonsuz para açığıydı).
      // Kayıtlı bakiye neyse o; yalnızca hiç kayıt yoksa tohum ile başlar.
      // v2 düzeltmesi (E-planı S10, 8 Ekim 2026): yedek değer eskiden 20M'di (R3'te 12M'ye indi); tek kaynak SEED_POOL_ADA.
      lotteryPool: (parsed.lotteryPool != null && isFinite(parsed.lotteryPool) && parsed.lotteryPool >= 0)
        ? parsed.lotteryPool
        : (GAME_CONFIG.CARNIVAL?.LOTTERY?.SEED_POOL_ADA || 12000000),
      lotteryPendingPayout: Number(parsed.lotteryPendingPayout) || 0,
      lastLotteryDrawEpoch: parsed.lastLotteryDrawEpoch ?? null,
      lastLotteryResult: parsed.lastLotteryResult || null,
      onboarding: (parsed.onboarding && typeof parsed.onboarding === 'object') ? parsed.onboarding : {},
      botTrialUsed: !!parsed.botTrialUsed,
      pendingNotices: Array.isArray(parsed.pendingNotices) ? parsed.pendingNotices.slice(-20) : [],
      offlineReport: parsed.offlineReport || null,
      lastSeenAt: parsed.lastSeenAt || 0,
      lotteryAmortiPool: (parsed.lotteryAmortiPool != null && parsed.lotteryAmortiPool > 0)
        ? parsed.lotteryAmortiPool
        : Math.round((parsed.lotteryTickets || 0) * (GAME_CONFIG.CARNIVAL?.LOTTERY?.TICKET_COST_ADA || 100) * (GAME_CONFIG.CARNIVAL?.LOTTERY?.AMORTI_SHARE ?? 0.02)),
      wheelTicketShards: parsed.wheelTicketShards || 0,
      botSiloAutoUpgrade: parsed.botSiloAutoUpgrade !== undefined ? parsed.botSiloAutoUpgrade : true,
      botAutoRenew24h: parsed.botAutoRenew24h !== undefined ? parsed.botAutoRenew24h : false,
      botActiveUntil: parsed.botActiveUntil || 0,
      redeemCodes: Array.isArray(parsed.redeemCodes) ? parsed.redeemCodes : [],
      burnedResources: { ...zeroRes(), ...(parsed.burnedResources || {}) },
      carnivalBurnedResources: { ...zeroRes(), ...(parsed.carnivalBurnedResources || {}) },
      // v2 (R5): köy
      village: { ...(GAME_CONFIG.STARTING_PROFILE.village || { houses: 1, villagers: 10, labor: 0, lastGrowthAt: 0, starvingSince: 0 }), ...(parsed.village || {}) },
      // Kilitli bakiye eski kayıtlarda yoktu: mevcut bakiye serbest sayılır
      lockedAda: Math.max(0, Number(parsed.lockedAda) || 0),
      lockUnlock: parsed.lockUnlock || null,
      contribution: parsed.contribution || null,
      adaPriceMultiplier: Number(parsed.adaPriceMultiplier) > 0 ? Number(parsed.adaPriceMultiplier) : (GAME_CONFIG.ADA_PRICE_MULTIPLIER?.DEFAULT ?? 1),
      adaPriceMultiplierTarget: parsed.adaPriceMultiplierTarget ?? null,
      adaPriceMultiplierEpoch: parsed.adaPriceMultiplierEpoch ?? null
    };
  }

  // 🛡️ 3 Adet Taktiksel Savaş Preseti (Frontline / Backline Mevzileri)
  mergeCombatPresets(saved) {
    const defaultPresets = {
      activePresetId: 1,
      presets: {
        1: { id: 1, name: 'Taktik 1: Dengeli', positions: {} },
        2: { id: 2, name: 'Taktik 2: Savunma Hattı', positions: {} },
        3: { id: 3, name: 'Taktik 3: Arka Saf Baskını', positions: {} }
      }
    };
    if (!saved || typeof saved !== 'object') return defaultPresets;
    const activePresetId = (saved.activePresetId && [1, 2, 3].includes(Number(saved.activePresetId)))
      ? Number(saved.activePresetId)
      : 1;
    const presets = {};
    [1, 2, 3].forEach(id => {
      const p = saved.presets?.[id];
      presets[id] = {
        id,
        name: p?.name || defaultPresets.presets[id].name,
        positions: (p?.positions && typeof p.positions === 'object') ? { ...p.positions } : {}
      };
    });
    return { activePresetId, presets };
  }

  // 18 Koleksiyon Eserinin Kayıtlı Keşif Durumunu GAME_CONFIG Listesiyle Birleştirir
  mergeCollectionArtifacts(saved) {
    const savedMap = new Map((Array.isArray(saved) ? saved : []).map(a => [a.id, a]));
    return GAME_CONFIG.COLLECTION_ARTIFACTS.map(cfg => {
      const existing = savedMap.get(cfg.id);
      return {
        id: cfg.id,
        discovered: existing ? !!existing.discovered : false,
        discoveredAt: existing ? (existing.discoveredAt || null) : null
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ASKER BİRİMİ — TEK TİP ASKER + SKILL LOADOUT & TAKTİKSEL MEVZİ
  // ═══════════════════════════════════════════════════════════════════════
  // Askerler sınıf kısıtı olmaksızın eşit Whitepaper stat eğrisini ($100 + 25*(L-1)$ HP,
  // $25 + 6*(L-1)$ ATK) takip eder. Taktiksel farklılaşma, her askerin taşıdığı
  // bağımsız Skill Loadout (1-3 aktif + pasif yetenek) ve Ön/Arka Saf (row) konumundan gelir.

  createSoldierUnit(index) {
    const level = 1;
    const maxHp = GAME_CONFIG.SOLDIER_MAX_HP || 100;
    const baseAtk = GAME_CONFIG.SOLDIER_BASE_ATK || 25;

    // İlk askere Kalkan Duvarı, 2. askere Şok Dalgası, 3. askere Sahra Merhemi vb. dengeli dağılım
    const initialSkills = (index === 1) ? ['shieldWall']
      : (index === 2) ? ['shockwave']
      : (index === 3) ? ['fieldMedic']
      : (index === 4) ? ['armorBreaker']
      : ['shieldWall'];

    return {
      id: `soldier_${Date.now()}_${index}`,
      name: `AdAstra Şampiyonu #${index}`,
      class: 'adastra_champion',
      classId: 'adastra_champion',
      className: 'AdAstra Şampiyonu',
      icon: '⚔️',
      avatar: soldierPortraitFor(index),
      row: index <= 2 ? 'front' : 'back',
      skills: initialSkills,
      level,
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
      equipment: { weapon: null, helmet: null, armor: null, legs: null, boots: null }
    };
  }

  mergeTools(saved) {
    // v2: 6 alet (config.TOOLS); eski kayıtta olmayan alet tam dayanıklılıkla eklenir
    const defaults = Object.fromEntries(Object.keys(GAME_CONFIG.TOOLS || { axe: 1, pickaxe: 1, sickle: 1 }).map(k => [k, { durability: (GAME_CONFIG.TOOLS?.[k]?.maxDurability) || 4320, totalGathered: 0 }]));
    if (!saved) return defaults;
    const merged = { ...defaults, ...saved };
    Object.keys(merged).forEach(k => {
      if (merged[k]) {
        if (merged[k].durability != null && merged[k].durability <= 100) {
          merged[k].durability = Math.round((merged[k].durability / 100) * 4320);
        } else if (merged[k].durability == null) {
          merged[k].durability = 4320;
        }
      }
    });
    return merged;
  }

  mergeSoldierUnits(saved) {
    if (!Array.isArray(saved) || saved.length === 0) {
      return [];
    }
    return saved.map((s, i) => {
      const level = Math.max(1, s.level || 1);
      const maxHp = 100 + (level - 1) * (GAME_CONFIG.SOLDIER_HP_PER_LEVEL || 25);
      const baseAtk = 25 + (level - 1) * (GAME_CONFIG.SOLDIER_ATK_PER_LEVEL || 6);

      // Geriye dönük uyumlu yetenek yükleme
      const skills = s.skills && Array.isArray(s.skills) && s.skills.length > 0
        ? [...s.skills]
        : (i === 0 ? ['shieldWall'] : i === 1 ? ['shockwave'] : ['armorBreaker']);

      return {
        id: s.id || `soldier_${i + 1}`,
        // v1.25: Oyuncunun verdiği isim korunur (eskiden her yüklemede varsayılana dönüyordu)
        name: (typeof s.name === 'string' && s.name.trim()) ? s.name : `AdAstra Şampiyonu #${i + 1}`,
        class: 'adastra_champion',
        className: 'AdAstra Şampiyonu',
        icon: '⚔️',
        avatar: (s.avatar && s.avatar !== 'assets/soldier_avatar.jpg') ? s.avatar : soldierPortraitFor(i + 1),
        row: s.row || (i < 2 ? 'front' : 'back'),
        skills,
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
        equipment: {
          weapon: null, helmet: null, armor: null, legs: null, boots: null,
          ...(s.equipment || {})
        }
      };
    });
  }

  saveState() {
    this.enforceWarehouseLimits();
    if (this._isFastForwarding) {
      // 🚀 Simülasyon sırasında diske senkron yazma ve listener tetikleme, sadece bellek içi state güncelle
      return;
    }
    this.state.lastSeenAt = Date.now();
    this._lastSaveAt = this.state.lastSeenAt;
    writeJSON(this.storageKey, this.state);
    this.notifyListeners();
  }

  // 📣 Oyuncuya gösterilecek bildirimler (arayüz her karede toplayıp kısa mesaj olarak gösterir)
  pushNotice(message, type = 'info') {
    if (!message) return;
    if (!Array.isArray(this.state.pendingNotices)) this.state.pendingNotices = [];
    this.state.pendingNotices.push({ message, type, at: this._now() });
    if (this.state.pendingNotices.length > 20) this.state.pendingNotices.splice(0, this.state.pendingNotices.length - 20);
  }

  consumeNotices() {
    const list = Array.isArray(this.state.pendingNotices) ? this.state.pendingNotices : [];
    this.state.pendingNotices = [];
    return list;
  }
}

// Alan bazlı yöntem karışımları (js/gameState/*.js). Sıra önemli değil: hiçbir yöntem adı iki yerde tanımlı değil.
Object.assign(GameStateManager.prototype, ekonomiYontemleri);
Object.assign(GameStateManager.prototype, orduYontemleri);
Object.assign(GameStateManager.prototype, seferYontemleri);
Object.assign(GameStateManager.prototype, botYontemleri);
Object.assign(GameStateManager.prototype, hasatYontemleri);
Object.assign(GameStateManager.prototype, gelisimYontemleri);
Object.assign(GameStateManager.prototype, techizatYontemleri);
Object.assign(GameStateManager.prototype, botPaketiYontemleri);
Object.assign(GameStateManager.prototype, karnavalYontemleri);
Object.assign(GameStateManager.prototype, kesifYontemleri);
Object.assign(GameStateManager.prototype, gelistiriciYontemleri);
Object.assign(GameStateManager.prototype, ozetYontemleri);
Object.assign(GameStateManager.prototype, topluYontemleri);
Object.assign(GameStateManager.prototype, zindanYontemleri);
Object.assign(GameStateManager.prototype, kolezyumYontemleri);
Object.assign(GameStateManager.prototype, dunyaBossuYontemleri);
Object.assign(GameStateManager.prototype, p2pYontemleri);
Object.assign(GameStateManager.prototype, askerGelisimYontemleri);
Object.assign(GameStateManager.prototype, rehberYontemleri);
Object.assign(GameStateManager.prototype, pazarYontemleri);

// v2 (R5/R6/R2): Köy Evleri, Şifahane, Demirhane geri dönüşümü, roket görevi, Konsey katkıları, Genesis hakkı (js/v2/koyVeKonsey.js)
Object.assign(GameStateManager.prototype, gameStateV2);
Object.assign(GameStateManager.prototype, gameStateV2Depot);   // Yük İskelesi: Hazırlık Deposu + Universe hazırlık yüzdesi
if (typeof globalThis !== 'undefined' && !globalThis.ammMarket) globalThis.ammMarket = ammMarket;
export const gameState = new GameStateManager();

