// Realm of AdAstra — GameStateManager yöntemleri: Kral Danışmanı, XP ve seviye atlama, Taverna güçlendirmeleri,
// alet tamiri, silo kapasitesi ve yükseltmesi.
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { levelWeight as ubiLevelWeight } from '../economy/ubi.js';
import { RES_KEYS, round3, kaynakAdi, kaynakSimgesi } from './ortak.js';

// Seviye eğrisi hedeften türetilir: "Seviye 81 yaklaşık 1.100 günde ulaşılabilir olsun"; günlük XP arzı ≈ 3 düğüm x 35 XP/saat x 24
const GUNLUK_XP_ARZI = 2520;
const HEDEF_GUN = 1100;

export const gelisimYontemleri = {
  // ── Kral Danışmanı: tek cümlelik yönlendirme ────────────────────────────
  getRoyalAdvisorAdvice() {
    const envanter = this.state.inventory || {};
    const askerler = this.state.soldierUnits || [];
    const seferler = this.state.activeExpeditions || {};
    const zindanSeviyesi = this.state.dungeonProgress || 1;

    const hazir = RES_KEYS().filter(k => seferler[k] && seferler[k].isCompleted).length;
    if (hazir > 0) {
      return {
        icon: '🌾',
        title: 'Mahsuller Hazır!',
        advice: `Tarlada ve madenlerde ${hazir} işçin seferden döndü! Yukarıdaki **"TÜM MAHSULÜ TOPLA"** butonuna basarak ambarları doldurabilirsin.`,
        action: 'sweep_harvest',
        actionLabel: '✨ Topla'
      };
    }

    const yarali = askerler.find(s => (s.hp || 100) < (s.maxHp || 100));
    if (yarali && (envanter.wheat || 0) >= 10) {
      return {
        icon: '❤️',
        title: 'Askerler Dinlenmek İstiyor',
        advice: 'Orduda yaralı askerlerin var. Kışlaya gidip **"Tek Dokunuşla Ordumu Hazırla"** ile onları şifalı otla iyileştirebilirsin!',
        action: 'open_barracks',
        actionLabel: '⚔️ Kışlaya Git'
      };
    }

    if (RES_KEYS().some(k => !seferler[k])) {
      return {
        icon: '⛏️',
        title: 'İşçiler Boşta Bekliyor',
        advice: 'Madenler ve tarlalar şu an boşta duruyor. Çiftliğe veya Madene tıklayıp işçilerini sefere göndererek hammadde toplat!',
        action: 'open_dashboard',
        actionLabel: '🏰 Krallık Merkezi'
      };
    }

    if ((envanter.iron || 0) >= 60 && (envanter.wood || 0) >= 40) {
      return {
        icon: '🔥',
        title: 'Demirci Ocağı Yanıyor',
        advice: 'Ambarında yeterli demir ve odun var. Demircide yeni bir kılıç veya zırh döverek askerlerini zırhlandırabilirsin!',
        action: 'open_blacksmith',
        actionLabel: '⚒️ Demirciye Git'
      };
    }

    return {
      icon: '💀',
      title: 'Zindan Seni Bekliyor',
      advice: `Ordun hazır durumda! Zindan ${zindanSeviyesi}. Kat Muhafızını yenerek hazineleri krallığına kazandırabilirsin.`,
      action: 'open_dungeon',
      actionLabel: '🗺️ Zindana İn'
    };
  },

  // ── XP ve seviye ────────────────────────────────────────────────────────
  // XP tankı dolunca fazlası tankı aşamaz (örn. 2000/2000 bekler); seviye atlama otomatik değil, oyuncunun eylemidir
  addXp(amount) {
    if (!amount || amount <= 0) return null;
    const gereken = this.getNextLevelRequirement();
    const tavan = gereken && gereken.xp ? gereken.xp : Infinity;
    const mevcut = Number(this.state.currentXp) || 0;
    if (mevcut >= tavan) {
      this.state.currentXp = tavan;
      return { capped: true, added: 0, currentXp: tavan };
    }
    const yeni = Math.min(tavan, mevcut + amount);
    this.state.currentXp = yeni;
    return { capped: yeni >= tavan, added: yeni - mevcut, currentXp: yeni };
  },

  getCumulativeXpForLevel(level) {
    const seviye = Math.max(1, Math.min(GAME_CONFIG.MAX_PLAYER_LEVEL, level));
    const gun = HEDEF_GUN * Math.pow((seviye - 1) / (GAME_CONFIG.MAX_PLAYER_LEVEL - 1), 2.2);
    return Math.round(GUNLUK_XP_ARZI * gun);
  },

  // Bir sonraki seviyenin XP'si ve bedeli: bedel, XP'yi toplamaya yetecek sefer döngülerinde ALTI alanda kazanılan hammaddenin
  // yarısıdır (her hammaddenin kendi üretim hızına göre); ASTRA bedeli bu hammaddelerin anlık pazar değeridir.
  // Eskiden yalnız odun, demir ve buğday sayılıyordu (üç alanlı dönemden kalma); artık altı hammadde de bedele girer.
  // 19 Ekim 2026 (hesap seviyesi her şeyin anahtarı, config HESAP_BAGI): seviye bedeli, o seviyedeki silonun kapasitesinin payıdır. Silo seviyesi hesap
  // seviyesini geçemediği için bu bedel her zaman siloya sığar; silo büyüdükçe bedel de büyür. Pay seviyeyle artar (0,45 → 0,9).
  _seviyeSiloPayi(seviye) {
    const P = (GAME_CONFIG.HESAP_BAGI || {}).SEVIYE_BEDELI_PAYI || { BASLANGIC: 0.45, ARTIS: 0.05, SON: 0.9 };
    return Math.min(P.SON, P.BASLANGIC + P.ARTIS * Math.max(0, (Number(seviye) || 1) - 1));
  },

  // En üst silodan sonraki seviyelerde hammadde bedeli düz kalır; ASTRA payı her seviye büyür
  _seviyeAstraAsimi(seviye) {
    const asim = (GAME_CONFIG.HESAP_BAGI || {}).SEVIYE_ASTRA_ASIM ?? 1;
    return Math.pow(asim, Math.max(0, (Number(seviye) || 1) - this.getWarehouseMaxLevel()));
  },

  getNextLevelRequirement() {
    const enUst = GAME_CONFIG.MAX_PLAYER_LEVEL || 81;
    const simdiki = this.state.level || 1;
    const sonSeviyedeMi = simdiki >= enUst;
    const sonraki = sonSeviyedeMi ? enUst : simdiki + 1;
    const xp = Math.max(60, this.getCumulativeXpForLevel(sonraki) - this.getCumulativeXpForLevel(simdiki));

    const sure = this.getExpeditionDurationMinutes(simdiki);
    const seferXp = Math.max(5, Math.floor(35 * (sure / 60)));
    const alanlar = RES_KEYS();
    const donguXp = alanlar.length * seferXp;                  // bir döngü: altı alanda birer sefer
    const dongu = Math.max(1, Math.ceil(xp / Math.max(1, donguXp)));

    const uretim = GAME_CONFIG.BASE_PRODUCTION || {};
    const kazanilan = {};
    const costs = {};
    const tavan = this.getLevelUpCostCeiling();
    const siloyaSigdirilan = {};                       // artık hiç kırpma yok (bedel zaten siloya sığar); eski alan, arayüz okur
    for (const k of alanlar) {
      kazanilan[k] = dongu * sure * (uretim[k] || 0);
      costs[k] = tavan[k] != null ? tavan[k] : Math.round(kazanilan[k] / 2);
    }
    const { wood, iron, wheat } = costs;
    const siloGerek = this.getSiloLevelToHold(costs);

    const deger = ammMarket.calculateResourcesCostAdAstra(costs);
    deger.totalAda = round3(deger.totalAda * this._seviyeAstraAsimi(simdiki));

    const bugunParca = this.getFragmentDropRate(simdiki);
    const sonrakiParca = this.getFragmentDropRate(sonraki);
    const bugunKutu = this.getBoxDropRate(simdiki);
    const sonrakiKutu = this.getBoxDropRate(sonraki);

    return {
      level: sonraki,
      xp,
      cycles: dongu,
      durMin: sure,
      costs,                                   // her hammaddenin bedeli (altısı da; silo tavanını aşmaz)
      uncappedCosts: siloyaSigdirilan,         // silo tavanına kırpılanların ham bedeli (boşsa kırpma yok)
      siloLevelNeeded: siloGerek,              // bu bedeli TUTABİLECEK en küçük silo seviyesi (arayüz ipucu verisi)
      earned: kazanilan,
      totalWoodEarned: kazanilan.wood,
      totalIronEarned: kazanilan.iron,
      totalWheatEarned: kazanilan.wheat,
      wood,
      iron,
      wheat,
      adAstra: deger.totalAda,
      ammBreakdown: deger.breakdown,
      curFragRate: bugunParca,
      nextFragRate: sonrakiParca,
      curBoxRate: bugunKutu,
      nextBoxRate: sonrakiKutu,
      curFragRateFormatted: this.formatDropChance(bugunParca),
      nextFragRateFormatted: this.formatDropChance(sonrakiParca),
      curBoxRateFormatted: this.formatDropChance(bugunKutu),
      nextBoxRateFormatted: this.formatDropChance(sonrakiKutu),
      durationHours: this.getExpeditionDurationHours(sonraki),
      isMaxLevel: sonSeviyedeMi
    };
  },

  // Seviye bedeli (hammadde başına): hesabın şu anki seviyesindeki silonun kapasitesi x _seviyeSiloPayi (silo hesabı geçemez, bedel siloya sığar).
  // Silo kapasitesi Büyük Ambar projesiyle de büyür; bedel de onunla kayar. Kapasitesiz kalem (null) tavansızdır.
  getLevelUpCostCeiling(level = this.state.level) {
    const pay = this._seviyeSiloPayi(level);
    const kap = this.getWarehouseCapacity(Math.max(1, Math.min(this.getWarehouseMaxLevel(), Number(level) || 1)));
    const tavan = {};
    for (const k of RES_KEYS()) tavan[k] = kap[k] != null ? Math.floor(kap[k] * pay) : null;
    return tavan;
  },

  // Verilen bedelin her kaleminin sığdığı en küçük silo seviyesi (en üst silo bile yetmezse null).
  getSiloLevelToHold(costs) {
    const enUst = this.getWarehouseMaxLevel();
    for (let s = 1; s <= enUst; s++) {
      const kap = this.getWarehouseCapacity(s);
      if (RES_KEYS().every(k => kap[k] == null || (costs[k] || 0) <= kap[k])) return s;
    }
    return null;
  },

  levelUp() {
    const enUst = GAME_CONFIG.MAX_PLAYER_LEVEL || 81;
    if ((this.state.level || 1) >= enUst) {
      return { success: false, message: `🏆 Tebrikler! Maksimum seviyeye (Lv.${enUst}) zaten ulaştın!` };
    }

    const gerek = this.getNextLevelRequirement();
    const envanter = this.state.inventory;
    if (this.state.currentXp < gerek.xp) return { success: false, message: `Yetersiz XP! (${this.state.currentXp}/${gerek.xp} XP)` };
    const siloKap = this.getWarehouseCapacity();
    for (const k of RES_KEYS()) {
      const gereken = gerek.costs[k] || 0;
      if ((envanter[k] || 0) < gereken) {
        // Bedel silodan büyükse "yetersiz" demek yanıltır: oyuncu ne kadar toplasa silo tutmaz. Önce siloyu büyütmesi söylenir.
        if (siloKap[k] != null && gereken > siloKap[k]) {
          const hedef = gerek.siloLevelNeeded;
          return { success: false, siloTooSmall: true, siloLevelNeeded: hedef,
            message: `Silon ${kaynakAdi(k)} bedelini (${gereken}) tutamıyor (kapasite ${siloKap[k]}). Önce siloyu${hedef ? ` en az ${hedef}. seviyeye` : ''} yükselt.` };
        }
        return { success: false, message: `Yetersiz ${kaynakAdi(k)}! (${gereken} ${kaynakAdi(k)} gerekli)` };
      }
    }
    if (this.state.adAstraBalance < gerek.adAstra) return { success: false, message: `Yetersiz ASTRA! (${gerek.adAstra} ASTRA gerekli)` };

    for (const k of RES_KEYS()) envanter[k] -= gerek.costs[k] || 0;
    this.burnResources(gerek.costs);
    this.state.adAstraBalance -= gerek.adAstra;
    this._onAdaSpent(gerek.adAstra);
    globalPool.recordTokenSpend(gerek.adAstra);

    this.state.currentXp -= gerek.xp;
    this.state.level += 1;
    // Hesap seviyesi arttı: tavana takılıp birikmiş asker XP'si seviyeye döner (config ORDU_SINIRI)
    (this.state.soldierUnits || []).forEach((_, i) => this.addSoldierXp(i, 0));
    this.state.maxStamina = this.getMaxStamina(this.state.level);
    this.state.stamina = this.state.maxStamina;
    this.saveState();

    const yeniSure = this.getExpeditionDurationHours();
    return {
      success: true,
      message: `🎉 TEBRİKLER! Seviye ${this.state.level}'e ulaştın! (Maksimum Stamina: ${this.state.maxStamina} ⚡, Sefer Süresi: ${yeniSure} Saat)`,
      newLevel: this.state.level,
      newDuration: yeniSure,
      maxStamina: this.state.maxStamina
    };
  },

  // ── Seviyenin kalıcı faydaları ──────────────────────────────────────────
  // Üretim çarpanı: seviye başına sabit bir artış (Lv.1 = 1,00)
  getLevelProductionMultiplier(level = this.state.level) {
    const seviye = Math.max(1, Math.min(GAME_CONFIG.MAX_PLAYER_LEVEL || 81, Number(level) || 1));
    const artis = GAME_CONFIG.LEVEL_PRODUCTION_BONUS_PER_LEVEL || 0;
    return 1 + artis * (seviye - 1);
  },

  // Seviyenin somut faydaları: ekranda "şimdiki → sonraki seviye" olarak gösterilir
  getLevelBenefits(level = this.state.level) {
    const L = Math.max(1, Math.min(GAME_CONFIG.MAX_PLAYER_LEVEL || 81, Number(level) || 1));
    const seferDakika = this.getExpeditionDurationMinutes(L);
    const seferStamina = this.getExpeditionStaminaCost(L);
    // Altı alan birden çalışırken saatte harcanan stamina ve bunun buğday karşılığı
    const alanSayisi = Math.max(1, RES_KEYS().length);
    const saatlikStamina = (alanSayisi * seferStamina) / Math.max(1e-9, seferDakika / 60);
    const saatlikBugday = saatlikStamina * (GAME_CONFIG.WHEAT_PER_STAMINA || 3.15);
    // 1.000 hammadde (odun) başına stamina için yakılan buğday: seviye başına yalnız %1 iner
    const saatlikOdun = this.getResourceRatePerMinute('wood', L) * 60;
    const bugdayBin = saatlikOdun > 0 ? (saatlikBugday / alanSayisi) / saatlikOdun * 1000 : 0;
    const ubiAlt = (GAME_CONFIG.UBI_CONFIG && GAME_CONFIG.UBI_CONFIG.MIN_LEVEL) || 3;
    return {
      level: L,
      productionBonusPct: Math.round((this.getLevelProductionMultiplier(L) - 1) * 1000) / 10,
      woodPerMinute: Math.round(this.getResourceRatePerMinute('wood', L) * 100) / 100,
      expeditionHours: Math.round((seferDakika / 60) * 100) / 100,
      staminaPerHour: Math.round(saatlikStamina * 10) / 10,
      wheatPerHour: Math.round(saatlikBugday),
      wheatPer1000: Math.round(bugdayBin * 10) / 10,
      maxStamina: this.getMaxStamina(L),
      fragmentRate: this.getFragmentDropRate(L),
      boxRate: this.getBoxDropRate(L),
      ubiEligible: L >= ubiAlt,
      ubiWeight: Math.round(ubiLevelWeight(L, { minLevel: ubiAlt, weight: (x) => 1 + Math.sqrt(Math.max(1, x) - 1) * 0.75 }) * 100) / 100
    };
  },

  // ── Taverna güçlendirmeleri ─────────────────────────────────────────────
  isBuffActive(buffId) {
    const guc = this.state.activeBuffs ? this.state.activeBuffs[buffId] : null;
    return !!guc && this._now() < guc.expiresAt;
  },

  buyTavernBuff(buffId) {
    // Otomasyon botu yalnız Taverna'dan güncel (kâr ortaklığı) fiyatıyla alınır; eski sabit fiyatlı paketler kapalı
    if (String(buffId || '').startsWith('auto_collector')) {
      return { success: false, message: "Otomasyon botu yalnızca Taverna'dan güncel fiyatıyla alınabilir." };
    }
    const guc = GAME_CONFIG.TAVERN_BUFFS[buffId];
    if (!guc) return { success: false, message: 'Geçersiz güçlendirme!' };

    const bedel = this.adaPrice(guc.costAdAstra);
    if (this.state.adAstraBalance < bedel) return { success: false, message: `Yetersiz ASTRA! (${bedel} ASTRA gerekli)` };

    this.state.adAstraBalance -= bedel;
    this._onAdaSpent(bedel);
    globalPool.recordTokenSpend(bedel);

    // Süren güçlendirmeye eklenir (süre üst üste biner)
    const simdi = this._now();
    const mevcut = this.state.activeBuffs[buffId];
    const baslangic = (mevcut && mevcut.expiresAt > simdi) ? mevcut.expiresAt : simdi;
    this.state.activeBuffs[buffId] = { id: buffId, name: guc.name, expiresAt: baslangic + guc.durationSeconds * 1000 };
    this.saveState();
    return { success: true, message: `✨ ${guc.name} 24 saatliğine aktif edildi!` };
  },

  // ── Alet tamiri ─────────────────────────────────────────────────────────
  // Kural: dakika başına üretilen odun ve demirin %25'i alet sayısına (altı) paylaştırılır; ASTRA bedeli bu hammaddelerin pazar
  // değerinin TOOL_REPAIR_ADA_SHARE (%30) kadarı. (Eskiden üçe bölünüyordu: altı alete geçince toplam onarım yükü sessizce
  // %50'ye çıkmıştı; bot ücreti hesabı ve belgeler hep %25 diyordu. 13 Ekim 2026'da düzeltildi.)
  calculateRepairCost(toolId) {
    const cfg = GAME_CONFIG.TOOLS[toolId];
    const alet = this.state.tools ? this.state.tools[toolId] : null;
    if (!cfg || !alet) return null;

    const enFazla = alet.maxDurability != null ? alet.maxDurability : (cfg.maxDurability || 4320);
    const simdiki = Math.min(enFazla, Math.max(0, alet.durability != null ? alet.durability : enFazla));
    const eksik = enFazla - simdiki;   // eksilen dakika

    const aletSayisi = Math.max(1, RES_KEYS().length);
    const odunDakika = (this.getResourceRatePerMinute('wood') * 0.25) / aletSayisi;
    const demirDakika = (this.getResourceRatePerMinute('iron') * 0.25) / aletSayisi;
    const yuvarla = (v) => parseFloat(v.toFixed(2));

    if (eksik <= 0) {
      return {
        missingDurability: 0, woodCost: 0, ironCost: 0, wheatCost: 0, adAstraCost: 0,
        toolName: cfg.name, maxDurability: enFazla, currentDurability: simdiki,
        woodCostPerMin: yuvarla(odunDakika), ironCostPerMin: yuvarla(demirDakika), adAstraCostPerMin: 0
      };
    }

    const woodCost = Math.ceil(eksik * odunDakika);
    const ironCost = Math.ceil(eksik * demirDakika);
    const pay = Number(GAME_CONFIG.TOOL_REPAIR_ADA_SHARE ?? 0.3);
    const deger = ammMarket.calculateResourcesCostAdAstra({ wood: woodCost, iron: ironCost });
    const adAstraCost = Math.max(0.001, round3(deger.totalAda * pay));

    return {
      toolName: cfg.name,
      woodCost,
      ironCost,
      wheatCost: 0,
      adAstraCost,
      ammBreakdown: deger.breakdown,
      missingDurability: eksik,
      maxDurability: enFazla,
      currentDurability: simdiki,
      woodCostPerMin: yuvarla(odunDakika),
      ironCostPerMin: yuvarla(demirDakika),
      adAstraCostPerMin: parseFloat((adAstraCost / eksik).toFixed(5))
    };
  },

  repairTool(toolId) {
    const bedel = this.calculateRepairCost(toolId);
    if (!bedel) return { success: false, message: 'Geçersiz alet!' };
    if (bedel.missingDurability === 0) return { success: false, message: 'Alet zaten tamamen sağlam!' };

    const envanter = this.state.inventory;
    if ((envanter.wood || 0) < bedel.woodCost) {
      return { success: false, message: `Yetersiz Odun! (${bedel.woodCost} Odun gerekli, ambarında: ${Math.floor(envanter.wood || 0)})` };
    }
    if ((envanter.iron || 0) < bedel.ironCost) {
      return { success: false, message: `Yetersiz Demir! (${bedel.ironCost} Demir gerekli, ambarında: ${Math.floor(envanter.iron || 0)})` };
    }
    // ASTRA yetmiyorsa bot, eldeki kaynaklardan eşit miktarda satarak açığı kapatır
    if (this.state.adAstraBalance < bedel.adAstraCost && this.hasPurchasedBot()) {
      this.autoFundBotAdaDeficit(bedel.adAstraCost, { wood: bedel.woodCost, iron: bedel.ironCost });
    }
    if (this.state.adAstraBalance < bedel.adAstraCost) {
      return { success: false, message: `Yetersiz ASTRA! (${bedel.adAstraCost} ASTRA gerekli, sende: ${Number(this.state.adAstraBalance || 0).toFixed(2)} ASTRA)` };
    }

    envanter.wood -= bedel.woodCost;
    envanter.iron -= bedel.ironCost;
    this.burnResources({ wood: bedel.woodCost, iron: bedel.ironCost });
    this.state.adAstraBalance -= bedel.adAstraCost;
    this._onAdaSpent(bedel.adAstraCost);
    globalPool.recordTokenSpend(bedel.adAstraCost);

    const alet = this.state.tools[toolId];
    const enFazla = (alet?.maxDurability != null) ? alet.maxDurability : (GAME_CONFIG.TOOLS[toolId]?.maxDurability || 4320);
    alet.durability = enFazla;
    this.saveState();
    return {
      success: true,
      message: `🔧 ${bedel.toolName} tamamen onarıldı (${enFazla}/${enFazla} dk)! (-${bedel.woodCost} Odun, -${bedel.ironCost} Demir, -${bedel.adAstraCost} ASTRA)`
    };
  },

  // ── Silo ────────────────────────────────────────────────────────────────
  // 49 seviye (19 Ekim 2026): en üst seviye config WAREHOUSE.maxLevel / universeGateLevel
  getWarehouseMaxLevel() {
    const W = GAME_CONFIG.WAREHOUSE || {};
    const enUst = W.maxLevel || W.baseLevels || 18;
    const kapi = (GAME_CONFIG.UNIVERSE_STAGE || 0) >= 3 ? enUst : (W.universeGateLevel || enUst);
    return Math.min(enUst, kapi);
  },

  // Kapasite seviye 1'de initialCapacities, son seviyede maxCapacities; arası üstel. Büyük Ambar projesi herkesin silosunu büyütür
  getWarehouseCapacity(level = this.state.warehouseLevel) {
    const W = GAME_CONFIG.WAREHOUSE;
    const { baseLevels: enUst, initialCapacities: min, maxCapacities: max, fragmentsPerLevel } = W;
    // En üst seviye 49 (maxLevel); kapasite eğrisi 18. seviyeye (enUst) kadar eski üssel eğridir, sonrası her seviye postAnchorGrowth katıdır
    const seviye = Math.max(1, Math.min(W.maxLevel || enUst, level));
    const egri = Math.min(seviye, enUst);
    const asim = seviye > enUst ? Math.pow(W.postAnchorGrowth ?? 1.08, seviye - enUst) : 1;
    const adim = egri - 1;
    const buyut = (k) => (egri === enUst ? max[k] : Math.round(min[k] * Math.pow(Math.pow(max[k] / min[k], 1 / (enUst - 1)), adim)));
    const proje = 1 + ((globalPool && globalPool.getProjectBonus) ? globalPool.getProjectBonus('warehouse') : 0);
    const kapasite = {};
    for (const k of RES_KEYS()) kapasite[k] = min[k] != null && max[k] != null ? Math.round(buyut(k) * asim * proje) : null;
    kapasite.fragments = Math.round((egri === enUst ? max.fragments : min.fragments + adim * fragmentsPerLevel) * asim);
    return kapasite;
  },

  // Yükseltme: her hammaddede mevcut kapasitenin yarısı + bunların pazar değeri kadar ASTRA; ön koşul tüm depoların %80 dolu olması
  getWarehouseUpgradeCost(currentLevel = this.state.warehouseLevel) {
    const enUst = this.getWarehouseMaxLevel();
    if (currentLevel >= enUst) return null;
    // Silo seviyesi hesap seviyesini geçemez (19 Ekim 2026): hesap yetmiyorsa yükseltme kapalı, bedel yine gösterilir
    const hesapYetmiyor = currentLevel + 1 > Math.max(1, Number(this.state.level) || 1);

    const simdiki = this.getWarehouseCapacity(currentLevel);
    const sonraki = this.getWarehouseCapacity(currentLevel + 1);
    const keys = RES_KEYS().filter(k => simdiki[k] != null);

    const costs = {};
    const pay = (GAME_CONFIG.WAREHOUSE || {}).upgradeCostShare ?? 0.5;   // x5 kararı: kapasitenin %70'i (eskiden %50)
    for (const k of keys) costs[k] = Math.floor(simdiki[k] * pay);
    const deger = ammMarket.calculateResourcesCostAdAstra(costs);

    const envanter = this.state.inventory || {};
    const fills = {};
    const fillOk = {};
    const doluluk = (GAME_CONFIG.WAREHOUSE || {}).upgradeFillShare ?? 0.8;   // 19 Ekim 2026: %70
    for (const k of keys) {
      fills[k] = Math.round(simdiki[k] * doluluk);
      fillOk[k] = (envanter[k] || 0) >= fills[k];
    }
    const yuzde80Dolu = keys.every(k => fillOk[k]);
    const karsilanabilir = keys.every(k => (envanter[k] || 0) >= costs[k]) && (this.state.adAstraBalance || 0) >= deger.totalAda;

    return {
      currentLevel,
      nextLevel: currentLevel + 1,
      maxLevel: enUst,
      currentCap: simdiki,
      nextCap: sonraki,
      keys,
      costs,
      fills,
      fillOk,
      // eski alan adları (testler okur)
      wood: costs.wood || 0, iron: costs.iron || 0, wheat: costs.wheat || 0,
      adAstra: deger.totalAda,
      ammBreakdown: deger.breakdown,
      is80PercentFull: yuzde80Dolu,   // eski ad (testler ve arayüz okur); anlamı: doluluk şartı sağlandı (fillShare)
      fillShare: doluluk,
      canAffordCost: karsilanabilir,
      accountLevelNeeded: currentLevel + 1,
      accountLevelBlocked: hesapYetmiyor,
      canUpgrade: yuzde80Dolu && karsilanabilir && !hesapYetmiyor
    };
  },

  upgradeWarehouse() {
    const bedel = this.getWarehouseUpgradeCost();
    if (!bedel) {
      return { success: false, message: 'Deponuz zaten maksimum seviyede!' };
    }

    const envanter = this.state.inventory || {};
    if (bedel.accountLevelBlocked) {
      return { success: false, accountLevelBlocked: true, message: `⚠️ Silo seviyesi hesap seviyeni geçemez: ${bedel.nextLevel}. silo için hesabın en az ${bedel.accountLevelNeeded}. seviye olmalı. Önce hesabını yükselt.` };
    }
    if (!bedel.is80PercentFull) {
      const eksikler = bedel.keys.filter(k => !bedel.fillOk[k])
        .map(k => `${kaynakSimgesi(k)} ${kaynakAdi(k)} (${Math.floor(envanter[k] || 0)}/${bedel.fills[k]})`);
      return { success: false, message: `⚠️ Silo yükseltilemez! Tüm depolar en az %${Math.round((bedel.fillShare ?? 0.8) * 100)} dolu olmalıdır. Yetersiz olanlar: ${eksikler.join(', ')}` };
    }
    for (const k of bedel.keys) {
      if ((envanter[k] || 0) < bedel.costs[k]) return { success: false, message: `Yetersiz ${kaynakAdi(k)}! (${bedel.costs[k]} ${kaynakAdi(k)} gerekli)` };
    }
    if ((this.state.adAstraBalance || 0) < bedel.adAstra) return { success: false, message: `Yetersiz ASTRA! (${bedel.adAstra} ASTRA gerekli)` };

    for (const k of bedel.keys) envanter[k] -= bedel.costs[k];
    this.burnResources(bedel.costs);
    this.state.adAstraBalance -= bedel.adAstra;
    this._onAdaSpent(bedel.adAstra);
    globalPool.recordTokenSpend(bedel.adAstra);
    this.state.warehouseLevel += 1;
    this.saveState();

    const yeni = this.getWarehouseCapacity(this.state.warehouseLevel);
    return {
      success: true,
      message: `🏰 Silo Seviye ${this.state.warehouseLevel}'e yükseltildi! Yeni kapasiteler: ${bedel.keys.map(k => `${kaynakSimgesi(k)} ${yeni[k]}`).join(' · ')}.`
    };
  }
};
