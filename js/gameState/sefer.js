// Realm of AdAstra — GameStateManager yöntemleri: sefer süresi, stamina, sefer başlatma, zaman ilerlemesi ve çevrimdışı telafi.
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { RES_KEYS, kaynakAdi } from './ortak.js';

// Sefer süresi doğrusal: 1. seviyede EXPEDITION_MIN_DURATION_MINUTES, son seviyede EXPEDITION_MAX_DURATION_MINUTES.
// Nehir Köprüsü projesi bitince süreler kısalır (globalPool 'expeditionTime' bonusu).
function seferTabani(level) {
  const enAz = GAME_CONFIG.EXPEDITION_MIN_LEVEL;
  const enCok = GAME_CONFIG.EXPEDITION_MAX_LEVEL;
  const seviye = Math.max(enAz, Math.min(enCok, level));
  const egim = (GAME_CONFIG.EXPEDITION_MAX_DURATION_MINUTES - GAME_CONFIG.EXPEDITION_MIN_DURATION_MINUTES) / (enCok - enAz);
  const proje = 1 + ((globalPool && globalPool.getProjectBonus) ? globalPool.getProjectBonus('expeditionTime') : 0);
  return { taban: GAME_CONFIG.EXPEDITION_MIN_DURATION_MINUTES + egim * (seviye - enAz), proje };
}

// Düşme oranı: seviye 1'de MIN, seviye 81'de MAX, aradaki doğrusal
function dusmeOrani(level, min, max) {
  const seviye = Math.max(1, Math.min(81, level));
  return min + (seviye - 1) * ((max - min) / 80);
}

export const seferYontemleri = {
  getExpeditionDurationMinutes(level = this.state.level) {
    const { taban, proje } = seferTabani(level);
    return Math.max(1, Math.round(taban * proje));
  },

  getExpeditionDurationSeconds(level = this.state.level) {
    const { taban, proje } = seferTabani(level);
    return Math.max(60, Math.round(taban * 60 * proje));
  },

  getExpeditionDurationHours(level = this.state.level) {
    return parseFloat((this.getExpeditionDurationMinutes(level) / 60).toFixed(2));
  },

  // En yüksek stamina: taban (MAX_STAMINA + seviye başına artış) ya da üç alanı aynı anda başlatmaya yetecek kadar
  // (STAMINA_MAX_HEADROOM x sefer bedeli, 10'a yukarı yuvarlı)
  getMaxStamina(level = this.state.level) {
    const seviye = Math.max(1, Number(level) || 1);
    const taban = GAME_CONFIG.MAX_STAMINA + (seviye - 1) * GAME_CONFIG.STAMINA_MAX_PER_LEVEL;
    const alan = Math.ceil((GAME_CONFIG.STAMINA_MAX_HEADROOM ?? 3.5) * this.getExpeditionStaminaCost(seviye) / 10) * 10;
    return Math.max(taban, alan);
  },

  // Sefer bedeli süreyle ve üretimle orantılıdır; her seviye buğday verimini yalnız %1 iyileştirir
  getExpeditionStaminaCost(level = this.state.level) {
    const seviye = Math.max(GAME_CONFIG.EXPEDITION_MIN_LEVEL || 1, Math.min(GAME_CONFIG.EXPEDITION_MAX_LEVEL || 81, Number(level) || 1));
    const ilkSure = this.getExpeditionDurationMinutes(1) || 18;
    const verim = Math.pow(1 - (GAME_CONFIG.STAMINA_EFFICIENCY_PER_LEVEL ?? 0.01), seviye - 1);
    return Math.max(1, Math.round((GAME_CONFIG.STAMINA_COST_PER_EXPEDITION || 20) * (this.getExpeditionDurationMinutes(seviye) / ilkSure) * this.getLevelProductionMultiplier(seviye) * verim));
  },

  // ── Zindan stamina bedeli ───────────────────────────────────────────────
  // Asker sayısı x (katın özel bedeli ya da BASE_PER_SOLDIER + canavar seviyesi)
  getDungeonStaminaCost(monsterLevel = 1, soldierCount = 1) {
    const asker = Number(soldierCount);
    if (isNaN(asker) || asker <= 0) return 0;
    const tablo = GAME_CONFIG.DUNGEON_STAMINA_COST_PER_SOLDIER;
    const kisiBasi = (tablo[monsterLevel] != null) ? tablo[monsterLevel] : ((tablo.BASE_PER_SOLDIER || 5) + (Number(monsterLevel) || 1));
    return Math.round(asker * kisiBasi);
  },

  canEnterDungeon(monsterLevel = 1, soldierCount = 1) {
    const bedel = this.getDungeonStaminaCost(monsterLevel, soldierCount);
    const simdiki = Math.floor(this.state.stamina || 0);
    const eksik = Math.max(0, bedel - simdiki);
    return { canEnter: simdiki >= bedel, cost: bedel, current: simdiki, currentStamina: simdiki, shortfall: eksik, missing: eksik };
  },

  // Zindan savaşı başlarken staminayı tahsil eder
  deductDungeonStamina(monsterLevel = 1, soldierCount = 1) {
    const kontrol = this.canEnterDungeon(monsterLevel, soldierCount);
    if (!kontrol.canEnter) {
      return {
        success: false,
        cost: kontrol.cost,
        currentStamina: kontrol.currentStamina,
        shortfall: kontrol.shortfall,
        missing: kontrol.shortfall,
        message: `⚠️ Yetersiz Stamina! Bu savaşa ${soldierCount} askerle girmek için ${kontrol.cost} ⚡ Stamina gerekiyor (Mevcut: ${kontrol.currentStamina} ⚡).`
      };
    }
    this.state.stamina = Math.max(0, (this.state.stamina || 0) - kontrol.cost);
    this.saveState();
    return {
      success: true,
      cost: kontrol.cost,
      remainingStamina: Math.floor(this.state.stamina),
      message: `⚡ -${kontrol.cost} Stamina harcandı. (Kalan: ${Math.floor(this.state.stamina)}/${this.getMaxStamina()} ⚡)`
    };
  },

  getFragmentDropRate(level = this.state.level) {
    return dusmeOrani(level, GAME_CONFIG.FRAGMENT_DROP_MIN || 0.0018, GAME_CONFIG.FRAGMENT_DROP_MAX || 0.18);
  },

  getBoxDropRate(level = this.state.level) {
    return dusmeOrani(level, GAME_CONFIG.BOX_DROP_MIN || 0.000018, GAME_CONFIG.BOX_DROP_MAX || 0.0018);
  },

  // 0,018 → "%0,018" gibi: sondaki sıfır atılır, en çok 4 ondalık
  formatDropChance(rate) {
    const yuzde = rate * 100;
    if (yuzde >= 1) return `%${yuzde.toFixed(2)}`;
    if (yuzde >= 0.01) {
      const uc = yuzde.toFixed(3);
      return uc.endsWith('0') ? `%${yuzde.toFixed(2)}` : `%${uc}`;
    }
    const dort = yuzde.toFixed(4);
    return dort.endsWith('0') ? `%${yuzde.toFixed(3)}` : `%${dort}`;
  },

  // ── Stamina yenileme ────────────────────────────────────────────────────
  regenerateStamina(deltaSeconds) {
    const enFazla = this.getMaxStamina();
    if (this.state.stamina < enFazla && deltaSeconds > 0) {
      this.state.stamina = Math.min(enFazla, this.state.stamina + deltaSeconds / GAME_CONFIG.STAMINA_NATURAL_REGEN_INTERVAL);
      this.requestSave();   // her karede tüm kayıt diske yazılmasın
    }
  },

  // Buğdayla stamina: 1 stamina = WHEAT_PER_STAMINA (3,15) buğday. Stamina yalnız buğdayla doldurulur (ASTRA ile değil).
  refillStaminaWithWheat(staminaToGain = 20) {
    const envanter = this.state.inventory;
    const enFazla = this.getMaxStamina();
    const simdiki = this.state.stamina;
    if (simdiki >= enFazla) return { success: false, message: 'Stamina zaten tamamen dolu!' };

    const bugdayBasi = GAME_CONFIG.WHEAT_PER_STAMINA || 3.15;
    const kazanc = Math.min(staminaToGain, enFazla - simdiki);
    const gereken = Math.ceil(kazanc * bugdayBasi);
    if ((Number(envanter.wheat) || 0) < gereken) {
      return { success: false, message: `Yetersiz Buğday! +${Math.round(kazanc)} Stamina için ${gereken} Buğday gerekli.` };
    }

    envanter.wheat = Math.max(0, envanter.wheat - gereken);
    this.burnResource('wheat', gereken);
    this.state.stamina = Math.min(enFazla, simdiki + kazanc);
    this.saveState();
    return { success: true, message: `🍞 ${gereken} Buğday tüketildi! +${Math.round(kazanc)} Stamina yenilendi (${Math.floor(this.state.stamina)}/${enFazla})` };
  },

  // İhtiyaç kadar stamina: eldeki buğday yetmezse eldeki kadarıyla kısmen doldurur
  refillStaminaExact(staminaNeeded) {
    if (!staminaNeeded || staminaNeeded <= 0) return { success: true, wheatUsed: 0, gainedStamina: 0 };
    const envanter = this.state.inventory;
    const enFazla = this.getMaxStamina();
    const simdiki = this.state.stamina || 0;
    const gereken = Math.min(staminaNeeded, Math.max(0, enFazla - simdiki));
    if (gereken <= 0) return { success: true, wheatUsed: 0, gainedStamina: 0, message: 'Stamina zaten yeterli.' };

    const eldeki = Math.floor(Number(envanter.wheat) || 0);
    if (eldeki <= 0) return { success: false, message: 'Yetersiz Buğday! Depoda hiç buğday yok.' };

    const bugdayBasi = GAME_CONFIG.WHEAT_PER_STAMINA || 3.15;
    const kullanilan = Math.min(eldeki, Math.ceil(gereken * bugdayBasi));
    if (kullanilan <= 0) return { success: false, message: 'Stamina doldurmak için yeterli buğday yok.' };

    const kazanilan = kullanilan / bugdayBasi;
    envanter.wheat = Math.max(0, envanter.wheat - kullanilan);
    this.burnResource('wheat', kullanilan);
    this.state.stamina = Math.min(enFazla, simdiki + kazanilan);
    this.saveState();
    return {
      success: true,
      wheatUsed: kullanilan,
      gainedStamina: kazanilan,
      message: `⚡ ${kullanilan} Buğday tüketildi! +${Math.round(kazanilan)} Stamina yenilendi (${Math.floor(this.state.stamina)}/${enFazla} ⚡)`
    };
  },

  refillStaminaToMaxWithWheat() {
    const eksik = this.getMaxStamina() - (this.state.stamina || 0);
    if (eksik <= 0) return { success: false, message: 'Stamina zaten tamamen dolu!' };
    return this.refillStaminaExact(eksik);
  },

  // ── Sefer başlatma ──────────────────────────────────────────────────────
  startExpedition(nodeId) {
    const alan = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId];
    if (!alan) return { success: false, message: 'Geçersiz kaynak alanı!' };
    if (this.state.activeExpeditions[nodeId]) return { success: false, message: 'Bu alanda zaten aktif bir sefer devam ediyor!' };

    const staminaBedeli = this.getExpeditionStaminaCost();
    const ad = kaynakAdi(nodeId) || (alan && alan.name) || nodeId;
    if (this.state.stamina < staminaBedeli) {
      return {
        success: false,
        isInsufficientStamina: true,
        nodeId,
        staminaCost: staminaBedeli,
        currentStamina: Math.floor(this.state.stamina),
        message: `⚠️ ${ad} seferini başlatmak için yeteri kadar staminanız bulunmamaktadır.`
      };
    }

    const aletKimligi = alan.requiredTool;
    const alet = this.state.tools[aletKimligi];
    if (!alet || alet.durability <= 0) {
      return { success: false, message: `Gereken alet (${GAME_CONFIG.TOOLS[aletKimligi].name}) kırık! Önce tamir etmelisin.` };
    }

    const dakika = this.getExpeditionDurationMinutes();
    const saat = this.getExpeditionDurationHours();
    const saniye = this.getExpeditionDurationSeconds();

    const simdi = this._now();
    this.state.stamina -= staminaBedeli;
    this.state.activeExpeditions[nodeId] = {
      nodeId,
      durationMinutes: dakika,
      durationHours: saat,
      durationSeconds: saniye,
      ratePerMinute: this.getResourceRatePerMinute(nodeId),
      elapsedSeconds: 0,
      startedAt: simdi,
      lastTickAt: simdi,
      isCompleted: false
    };

    this.saveState();
    return { success: true, message: `${saat} Saatlik ${alan.name} görevi başlatıldı! (-${staminaBedeli} ⚡)` };
  },

  // ── Zaman simülasyon motoru (çevrimdışı telafi + test laboratuvarı ileri sarma) ──
  // [startMs, startMs + seconds] aralığını olay olay işletir:
  //  • bot o anda aktifse (süresi dolmamış, duraklatılmamış) hasat → tamir → stamina → silo → yeni sefer
  //  • bot süresi aralık içinde dolarsa oto-yenileme o anda denenir; yenilenemezse bot durur
  //  • seferler, doğal stamina yenilenmesi, askerlerin pasif iyileşmesi ve köy ilerler
  simulateTimePassage(totalSeconds, { startMs = Date.now() } = {}) {
    const rapor = {
      seconds: Math.max(0, totalSeconds),
      expeditionsClaimed: 0,
      botRenewals: 0,
      botWorkedSeconds: 0,
      botStoppedReason: null,
      before: this._snapshotEconomy(),
      after: null
    };
    if (!(totalSeconds > 0)) { rapor.after = rapor.before; return rapor; }

    const alanlar = RES_KEYS();
    const oncekiSimZamani = this._simNow;
    const oncekiHizliSarma = this._isFastForwarding;
    this._isFastForwarding = true;
    const bitisMs = startMs + totalSeconds * 1000;
    let t = startMs;
    let emniyet = 20000;
    const toplananlariSay = (eylemler) => {
      for (const e of (eylemler || [])) if (typeof e === 'string' && e.includes('toplandı')) rapor.expeditionsClaimed++;
    };
    const calisanSefer = (alan) => {
      const s = this.state.activeExpeditions ? this.state.activeExpeditions[alan] : null;
      return s && !s.isCompleted ? s : null;
    };

    try {
      while (t < bitisMs && emniyet-- > 0) {
        this._simNow = t;
        const yenilemeOncesi = this.state.botRenewCount || 0;

        // Süresi dolmuş bot: oto-yenileme açıksa tam bu anda yenilemeyi dene
        if (!this.hasPurchasedBot() && this.state.botAutoRenew24h &&
            (this.state.botActiveUntil || this.state.tavernaBotExpiresAt || (this.state.activeBuffs && this.state.activeBuffs.auto_collector))) {
          this.updateBotPauseState();
        }

        // Duraklatılmış bot simülasyon boyunca kendi kendine uyanmaz (süresi donuk kalır)
        if (this.hasPurchasedBot() && !this.isBotPaused()) {
          const r = this.runTavernaAutomationCycle();
          toplananlariSay(r && r.actions);
        }
        rapor.botRenewals += Math.max(0, (this.state.botRenewCount || 0) - yenilemeOncesi);

        const botAktif = this.hasPurchasedBot() && !this.isBotPaused();

        // Bir sonraki olay: en yakın sefer bitişi, bot süresinin dolması ya da aralığın sonu
        let sonrakiSn = (bitisMs - t) / 1000;
        let birSeferVar = false;
        for (const alan of alanlar) {
          const sefer = calisanSefer(alan);
          if (!sefer) continue;
          birSeferVar = true;
          const kalan = Math.max(1, sefer.durationSeconds - (sefer.elapsedSeconds || 0));
          if (kalan < sonrakiSn) sonrakiSn = kalan;
        }
        if (botAktif) {
          const sonaErme = (this.getAutoCollectorExpiry() - t) / 1000;
          if (sonaErme > 0 && sonaErme < sonrakiSn) sonrakiSn = Math.max(1, sonaErme);
          // Bot açık ama stamina yetmediği için sefer başlatamadıysa, stamina dolana kadar küçük adımlarla bekle
          if (!birSeferVar) sonrakiSn = Math.min(sonrakiSn, 600);
        }
        if (!(sonrakiSn > 0)) sonrakiSn = Math.min(60, (bitisMs - t) / 1000);

        // Zamanı ilerlet
        for (const alan of alanlar) {
          const sefer = calisanSefer(alan);
          if (!sefer) continue;
          sefer.elapsedSeconds = Math.min(sefer.durationSeconds, (sefer.elapsedSeconds || 0) + sonrakiSn);
          sefer.lastTickAt = t + sonrakiSn * 1000;
          if (sefer.elapsedSeconds >= sefer.durationSeconds) sefer.isCompleted = true;
        }
        this.regenerateStamina(sonrakiSn);
        this.processSoldierPassiveHealing(sonrakiSn);
        const koy = this.processVillage(sonrakiSn);   // köy olayları rapora ("Sen yokken olanlar")
        if (koy) {
          const k = rapor.village || (rapor.village = { eaten: 0, grew: 0, lost: 0, villagers: 0 });
          k.eaten += koy.eaten; k.grew += koy.grew; k.lost += koy.lost; k.villagers = koy.villagers;
        }
        if (botAktif) rapor.botWorkedSeconds += sonrakiSn;
        t += sonrakiSn * 1000;
      }

      // Aralığın sonunda son bir döngü: biten seferleri topla, aletleri onar
      this._simNow = bitisMs;
      if (this.hasPurchasedBot() && !this.isBotPaused()) {
        const r = this.runTavernaAutomationCycle();
        toplananlariSay(r && r.actions);
      }
      if (this.hasPurchasedBot() && this.isBotPaused()) {
        rapor.botStoppedReason = this.checkBotPrerequisites().missingText || 'Kaynak eksik';
      } else if (!this.hasPurchasedBot() && rapor.botWorkedSeconds > 0) {
        rapor.botStoppedReason = 'Bot süresi doldu';
      }
    } finally {
      this._simNow = oncekiSimZamani;
      this._isFastForwarding = oncekiHizliSarma;
    }

    rapor.after = this._snapshotEconomy();
    return rapor;
  },

  // Rapor için kısa ekonomi özeti: bakiye, silo seviyesi, XP ve hammaddeler
  _snapshotEconomy() {
    const envanter = this.state.inventory || {};
    const ozet = {
      ada: Number(this.state.adAstraBalance) || 0,
      warehouseLevel: Number(this.state.warehouseLevel) || 1,
      xp: Number(this.state.currentXp) || 0
    };
    for (const k of RES_KEYS()) ozet[k] = Number(envanter[k]) || 0;
    return ozet;
  },

  // Oyun kapalıyken (ya da sekme arka plandayken) geçen süreyi bir kez işler ve "Sen yokken olanlar" raporunu hazırlar
  processOfflineProgress(gapSeconds, fromMs) {
    const enFazlaSaat = (GAME_CONFIG.TAVERNA_BOT && GAME_CONFIG.TAVERNA_BOT.MAX_OFFLINE_CATCHUP_HOURS) || 168;
    const saniye = Math.min(gapSeconds, enFazlaSaat * 3600);
    const atlanan = Math.max(0, gapSeconds - saniye);
    const rapor = this.simulateTimePassage(saniye, { startMs: fromMs + atlanan * 1000 });
    const simdi = Date.now();
    for (const alan of Object.keys(this.state.activeExpeditions || {})) {
      const sefer = this.state.activeExpeditions[alan];
      if (sefer) sefer.lastTickAt = simdi;
    }
    const gosterilecek = rapor.expeditionsClaimed > 0 || rapor.botWorkedSeconds > 0 || (rapor.village && (rapor.village.lost > 0 || rapor.village.grew >= 1));
    if (saniye >= 15 * 60 && gosterilecek) {
      this.state.offlineReport = { ...rapor, at: simdi, skippedSeconds: atlanan };
    }
    this.saveState();
    return rapor;
  },

  // Her karede çağrılır: sefer süreleri ilerler; 90 sn'den uzun boşluk çevrimdışı telafi sayılır
  updateExpeditions(deltaSeconds) {
    let degisti = false;
    const simdi = Date.now();
    const botVar = this.isAutoCollectorActive() || this.hasPurchasedBot();

    // Çevrimdışı / arka plan boşluğu: son kare (oturum içi) ya da son kayıt (oturumlar arası)
    if (!this._isFastForwarding) {
      let sonGorulme = this._lastFrameAt || this.state.lastSeenAt || 0;
      if (!sonGorulme) {   // eski kayıtlar için yedek: sefer zaman damgaları
        for (const alan of Object.keys(this.state.activeExpeditions || {})) {
          const sefer = this.state.activeExpeditions[alan];
          if (sefer && !sefer.isCompleted && sefer.lastTickAt > 0) sonGorulme = sonGorulme ? Math.min(sonGorulme, sefer.lastTickAt) : sefer.lastTickAt;
        }
      }
      const bosluk = sonGorulme ? (simdi - sonGorulme) / 1000 : 0;
      this._lastFrameAt = simdi;
      this.state.lastSeenAt = simdi;
      if (bosluk > 90) {
        this.processOfflineProgress(bosluk, sonGorulme);
        return;
      }
    }

    // Normal kare akışı
    for (const alan of Object.keys(this.state.activeExpeditions || {})) {
      const sefer = this.state.activeExpeditions[alan];
      if (!sefer || sefer.isCompleted) continue;
      let adim = deltaSeconds || 0;
      if (sefer.lastTickAt && sefer.lastTickAt > 0) {
        const gercek = (simdi - sefer.lastTickAt) / 1000;
        if (gercek > 0) adim = Math.max(adim, Math.min(gercek, 86400));
      }
      sefer.lastTickAt = simdi;
      if (!sefer.startedAt) sefer.startedAt = simdi - (sefer.elapsedSeconds * 1000);

      sefer.elapsedSeconds = Math.min(sefer.durationSeconds, (sefer.elapsedSeconds || 0) + adim);
      degisti = true;
      if (sefer.elapsedSeconds >= sefer.durationSeconds) {
        sefer.elapsedSeconds = sefer.durationSeconds;
        sefer.isCompleted = true;
        if (botVar) this.runTavernaAutomationCycle();
      }
    }

    if (degisti) {
      this._expSaveThrottle = (this._expSaveThrottle || 0) + 1;
      if (this._expSaveThrottle >= 60) {
        this._expSaveThrottle = 0;
        this.saveState();
      }
    }
  }
};
