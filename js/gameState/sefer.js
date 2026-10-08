// Realm of AdAstra — GameStateManager yöntemleri: Stamina, seferler, zaman ilerlemesi, çevrimdışı ilerleme
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { sound } from '../audio.js';
import { RES_KEYS } from './ortak.js';

export const seferYontemleri = {
  // Karakter Seviyesine Göre Sefer Süresi (Lv 1: 18 dakika / 0.3 saat / 1080 saniye, Lv 81: 72 saat / 4320 dakika / 259200 saniye)
  // Formül: DurationMinutes(level) = Math.round(18 + (level - 1) * 53.775)
  getExpeditionDurationMinutes(level = this.state.level) {
    const lvl = Math.max(GAME_CONFIG.EXPEDITION_MIN_LEVEL, Math.min(GAME_CONFIG.EXPEDITION_MAX_LEVEL, level));
    const slope = (GAME_CONFIG.EXPEDITION_MAX_DURATION_MINUTES - GAME_CONFIG.EXPEDITION_MIN_DURATION_MINUTES) / (GAME_CONFIG.EXPEDITION_MAX_LEVEL - GAME_CONFIG.EXPEDITION_MIN_LEVEL);
    // v2: Nehir Köprüsü projesi bitince sefer süreleri %2 kısalır
    const projMult = 1 + ((typeof globalPool !== 'undefined' && globalPool && globalPool.getProjectBonus) ? globalPool.getProjectBonus('expeditionTime') : 0);
    return Math.max(1, Math.round((GAME_CONFIG.EXPEDITION_MIN_DURATION_MINUTES + slope * (lvl - GAME_CONFIG.EXPEDITION_MIN_LEVEL)) * projMult));
  },

  // Formül: DurationSeconds(level) = Math.round((18 + (level - 1) * 53.775) * 60)
  getExpeditionDurationSeconds(level = this.state.level) {
    const lvl = Math.max(GAME_CONFIG.EXPEDITION_MIN_LEVEL, Math.min(GAME_CONFIG.EXPEDITION_MAX_LEVEL, level));
    const slope = (GAME_CONFIG.EXPEDITION_MAX_DURATION_MINUTES - GAME_CONFIG.EXPEDITION_MIN_DURATION_MINUTES) / (GAME_CONFIG.EXPEDITION_MAX_LEVEL - GAME_CONFIG.EXPEDITION_MIN_LEVEL);
    const projMult = 1 + ((typeof globalPool !== 'undefined' && globalPool && globalPool.getProjectBonus) ? globalPool.getProjectBonus('expeditionTime') : 0);
    return Math.max(60, Math.round((GAME_CONFIG.EXPEDITION_MIN_DURATION_MINUTES + slope * (lvl - GAME_CONFIG.EXPEDITION_MIN_LEVEL)) * 60 * projMult));
  },

  // Formül: DurationHours(level) = parseFloat(((18 + (level - 1) * 53.775) / 60).toFixed(2))
  getExpeditionDurationHours(level = this.state.level) {
    return parseFloat((this.getExpeditionDurationMinutes(level) / 60).toFixed(2));
  },

  // Max Stamina — v2: 100 + 25·(L-1)
  // v1'de max 100+20(L-1), sefer maliyeti 25+12(L-1) idi. Üç düğümü paralel
  // işletmek Seviye 3'ten itibaren MATEMATİKSEL OLARAK İMKANSIZ hâle geliyordu
  // (3×49 = 147 > 140). Oyunun temel döngüsü ikinci seviye atlamasında ölüyordu.
  // v2'de 3·maliyet ≤ max eşitsizliği her seviyede korunur (F-14).
  // En yüksek stamina: eski taban (100 + 50·(L-1)) ya da 3 alanı aynı anda başlatmaya yetecek kadar (3,5 sefer bedeli)
  getMaxStamina(level = this.state.level) {
    const L = Math.max(1, Number(level) || 1);
    const base = GAME_CONFIG.MAX_STAMINA + (L - 1) * GAME_CONFIG.STAMINA_MAX_PER_LEVEL;
    const room = Math.ceil((GAME_CONFIG.STAMINA_MAX_HEADROOM ?? 3.5) * this.getExpeditionStaminaCost(L) / 10) * 10;
    return Math.max(base, room);
  },

  // Sefer bedeli (5 Ekim 2026): süreyle ve üretimle orantılı; her seviye buğday verimini yalnız %1 iyileştirir.
  // Böylece 1.000 hammadde başına yakılan buğday 1. seviyede 194, 10. seviyede 177, 81. seviyede 87 olur.
  getExpeditionStaminaCost(level = this.state.level) {
    const L = Math.max(GAME_CONFIG.EXPEDITION_MIN_LEVEL || 1, Math.min(GAME_CONFIG.EXPEDITION_MAX_LEVEL || 81, Number(level) || 1));
    const dur1 = this.getExpeditionDurationMinutes(1) || 18;
    const eff = Math.pow(1 - (GAME_CONFIG.STAMINA_EFFICIENCY_PER_LEVEL ?? 0.01), L - 1);
    return Math.max(1, Math.round((GAME_CONFIG.STAMINA_COST_PER_EXPEDITION || 20) * (this.getExpeditionDurationMinutes(L) / dur1) * this.getLevelProductionMultiplier(L) * eff));
  },

  // ⚔️ Zindan Savaşı Stamina Maliyeti Hesabı
  // Formül: Asker Sayısı × (BASE_PER_SOLDIER + Zindan Seviyesi)
  // Dengeli RPG Modeli: Asker Başına 5 Stamina + Canavar Seviyesi Başına 1 Stamina
  getDungeonStaminaCost(monsterLevel = 1, soldierCount = 1) {
    const numSoldiers = Number(soldierCount);
    if (isNaN(numSoldiers) || numSoldiers <= 0) return 0;
    const cfg = GAME_CONFIG.DUNGEON_STAMINA_COST_PER_SOLDIER;
    const perSoldierCost = (cfg[monsterLevel] != null)
      ? cfg[monsterLevel]
      : ((cfg.BASE_PER_SOLDIER || 5) + (Number(monsterLevel) || 1));
    return Math.round(numSoldiers * perSoldierCost);
  },

  // Zindan savaşına girmek için stamina yeterli mi kontrol et
  canEnterDungeonBattle(monsterLevel = 1, soldierCount = 1) {
    const cost = this.getDungeonStaminaCost(monsterLevel, soldierCount);
    const curStamina = Math.floor(this.state.stamina || 0);
    const shortfall = Math.max(0, cost - curStamina);
    return {
      canEnter: curStamina >= cost,
      cost,
      current: curStamina,
      currentStamina: curStamina,
      shortfall,
      missing: shortfall
    };
  },

  canEnterDungeon(monsterLevel = 1, soldierCount = 1) {
    return this.canEnterDungeonBattle(monsterLevel, soldierCount);
  },

  // Zindan savaşı başladığında staminayı tahsil et
  deductDungeonStamina(monsterLevel = 1, soldierCount = 1) {
    const check = this.canEnterDungeonBattle(monsterLevel, soldierCount);
    if (!check.canEnter) {
      return {
        success: false,
        cost: check.cost,
        currentStamina: check.currentStamina,
        shortfall: check.shortfall,
        missing: check.shortfall,
        message: `⚠️ Yetersiz Stamina! Bu savaşa ${soldierCount} askerle girmek için ${check.cost} ⚡ Stamina gerekiyor (Mevcut: ${check.currentStamina} ⚡).`
      };
    }

    this.state.stamina = Math.max(0, (this.state.stamina || 0) - check.cost);
    this.saveState();

    return {
      success: true,
      cost: check.cost,
      remainingStamina: Math.floor(this.state.stamina),
      message: `⚡ -${check.cost} Stamina harcandı. (Kalan: ${Math.floor(this.state.stamina)}/${this.getMaxStamina()} ⚡)`
    };
  },

  getFragmentDropRate(level = this.state.level) {
    const clampedLevel = Math.max(1, Math.min(81, level));
    const range = (GAME_CONFIG.FRAGMENT_DROP_MAX || 0.18) - (GAME_CONFIG.FRAGMENT_DROP_MIN || 0.0018);
    return (GAME_CONFIG.FRAGMENT_DROP_MIN || 0.0018) + (clampedLevel - 1) * (range / 80);
  },

  getBoxDropRate(level = this.state.level) {
    const clampedLevel = Math.max(1, Math.min(81, level));
    const range = (GAME_CONFIG.BOX_DROP_MAX || 0.0018) - (GAME_CONFIG.BOX_DROP_MIN || 0.000018);
    return (GAME_CONFIG.BOX_DROP_MIN || 0.000018) + (clampedLevel - 1) * (range / 80);
  },

  formatDropChance(rate) {
    const pct = rate * 100;
    if (pct >= 1) return `%${pct.toFixed(2)}`;
    if (pct >= 0.01) {
      const str3 = pct.toFixed(3);
      if (str3.endsWith('0')) return `%${pct.toFixed(2)}`;
      return `%${str3}`;
    }
    const str4 = pct.toFixed(4);
    if (str4.endsWith('0')) return `%${pct.toFixed(3)}`;
    return `%${str4}`;
  },

  // Doğal Stamina Yenilenmesi (Maksimum Stamina Sınırına Göre)
  regenerateStamina(deltaSeconds) {
    const maxStamina = this.getMaxStamina();
    if (this.state.stamina < maxStamina && deltaSeconds > 0) {
      const regenAmount = (deltaSeconds / GAME_CONFIG.STAMINA_NATURAL_REGEN_INTERVAL);
      this.state.stamina = Math.min(maxStamina, this.state.stamina + regenAmount);
      // v1.25: Eskiden her karede (saniyede 60 kez) tüm kayıt diske yazılıyordu.
      this.requestSave();
    }
  },

  // 1. Depodan Buğday Harcayarak Stamina Doldurma (+20 Stamina = 63 Buğday)
  // Kural: 1 Stamina doldurmak için dakika başı çıkartılan buğdayın (15) %21'i (3.15 Buğday) gerekir.
  refillStaminaWithWheat(staminaToGain = 20) {
    const inv = this.state.inventory;
    const maxStam = this.getMaxStamina();
    const curStam = this.state.stamina;
    if (curStam >= maxStam) {
      return { success: false, message: 'Stamina zaten tamamen dolu!' };
    }

    const wheatPerStamina = GAME_CONFIG.WHEAT_PER_STAMINA || 3.15; // 3.15 Buğday / 1 Stamina
    const actualGain = Math.min(staminaToGain, maxStam - curStam);
    const requiredWheat = Math.ceil(actualGain * wheatPerStamina);

    if ((Number(inv.wheat) || 0) < requiredWheat) {
      return { success: false, message: `Yetersiz Buğday! +${Math.round(actualGain)} Stamina için ${requiredWheat} Buğday gerekli.` };
    }

    inv.wheat = Math.max(0, inv.wheat - requiredWheat);
    this.burnResource('wheat', requiredWheat);
    this.state.stamina = Math.min(maxStam, curStam + actualGain);
    sound.playStaminaRefill();
    this.saveState();
    return {
      success: true,
      message: `🍞 ${requiredWheat} Buğday tüketildi! +${Math.round(actualGain)} Stamina yenilendi (${Math.floor(this.state.stamina)}/${maxStam})`
    };
  },

  // 1.5 Depodaki Buğday ile İhtiyaç Kadar Stamina Doldurma
  // Kural: 1 Stamina doldurmak için dakika başı çıkartılan buğdayın (15) %21'i (3.15 Buğday) gerekir.
  refillStaminaExact(staminaNeeded) {
    if (!staminaNeeded || staminaNeeded <= 0) return { success: true, wheatUsed: 0, gainedStamina: 0 };
    const inv = this.state.inventory;
    const maxStam = this.getMaxStamina();
    const curStam = this.state.stamina || 0;
    const actualNeeded = Math.min(staminaNeeded, Math.max(0, maxStam - curStam));

    if (actualNeeded <= 0) {
      return { success: true, wheatUsed: 0, gainedStamina: 0, message: 'Stamina zaten yeterli.' };
    }

    const availableWheat = Math.floor(Number(inv.wheat) || 0);
    if (availableWheat <= 0) {
      return { success: false, message: 'Yetersiz Buğday! Depoda hiç buğday yok.' };
    }

    const wheatPerStamina = GAME_CONFIG.WHEAT_PER_STAMINA || 3.15; // 3.15 Buğday / 1 Stamina
    const exactWheatNeeded = Math.ceil(actualNeeded * wheatPerStamina);
    const wheatToUse = Math.min(availableWheat, exactWheatNeeded);

    if (wheatToUse <= 0) {
      return { success: false, message: 'Stamina doldurmak için yeterli buğday yok.' };
    }

    const gainedStamina = wheatToUse / wheatPerStamina;
    inv.wheat = Math.max(0, inv.wheat - wheatToUse);
    this.burnResource('wheat', wheatToUse);
    this.state.stamina = Math.min(maxStam, curStam + gainedStamina);
    sound.playStaminaRefill();
    this.saveState();

    return {
      success: true,
      wheatUsed: wheatToUse,
      gainedStamina,
      message: `⚡ ${wheatToUse} Buğday tüketildi! +${Math.round(gainedStamina)} Stamina yenilendi (${Math.floor(this.state.stamina)}/${maxStam} ⚡)`
    };
  },

  // Depodaki Buğday ile Staminayı Tek Seferde Tamamen Doldurma
  refillStaminaToMaxWithWheat() {
    const maxStam = this.getMaxStamina();
    const curStam = this.state.stamina || 0;
    const needed = maxStam - curStam;
    if (needed <= 0) {
      return { success: false, message: 'Stamina zaten tamamen dolu!' };
    }
    return this.refillStaminaExact(needed);
  },

  // 2. Tavernadan AdAstra Karşılığında Staminayı Fullleme (DEVRE DIŞI - Stamina sadece Buğday ile doldurulabilir)
  instantRefillStamina() {
    return { success: false, message: 'Stamina ASTRA ile doldurulamaz! Sadece buğday ile doldurulabilir.' };
  },

  // =========================================================================
  // 1. SEFER BAŞLATMA & TOPLAMA (Süre Seviyeye Göre Uzun Sürer)
  // =========================================================================
  startExpedition(nodeId) {
    const nodeConfig = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId];
    if (!nodeConfig) return { success: false, message: 'Geçersiz kaynak alanı!' };

    if (this.state.activeExpeditions[nodeId]) {
      return { success: false, message: 'Bu alanda zaten aktif bir sefer devam ediyor!' };
    }

    const staminaCost = this.getExpeditionStaminaCost();
    const rName = this.getResourceNameTr(nodeId) || (nodeConfig && nodeConfig.name) || nodeId;

    if (this.state.stamina < staminaCost) {
      return {
        success: false,
        isInsufficientStamina: true,
        nodeId,
        staminaCost,
        currentStamina: Math.floor(this.state.stamina),
        message: `⚠️ ${rName} seferini başlatmak için yeteri kadar staminanız bulunmamaktadır.`
      };
    }

    const toolId = nodeConfig.requiredTool;
    const tool = this.state.tools[toolId];
    if (!tool || tool.durability <= 0) {
      sound.playBreakWarning();
      return { success: false, message: `Gereken alet (${GAME_CONFIG.TOOLS[toolId].name}) kırık! Önce tamir etmelisin.` };
    }

    // Seviye Bazlı Süre (Lv 1: 18 dk / 1080 sn, Lv 81: 72 saat / 4320 dk / 259200 sn)
    const minutes = this.getExpeditionDurationMinutes();
    const hours = this.getExpeditionDurationHours();
    let baseDurationSec = this.getExpeditionDurationSeconds();

    // Taverna 1.5x Hız Güçlendirmesi Aktif mi?
    const speedBuffKey = `speed_${nodeId}`;
    if (this.isBuffActive(speedBuffKey)) {
      baseDurationSec = Math.floor(baseDurationSec / 1.5);
    }

    const now = this._now();
    this.state.stamina -= staminaCost;
    this.state.activeExpeditions[nodeId] = {
      nodeId,
      durationMinutes: minutes,
      durationHours: hours,
      durationSeconds: baseDurationSec,
      ratePerMinute: this.getResourceRatePerMinute(nodeId),
      elapsedSeconds: 0,
      startedAt: now,
      lastTickAt: now,
      isCompleted: false
    };

    if (toolId === 'axe') sound.playChop();
    else if (toolId === 'pickaxe') sound.playPickaxe();
    else sound.playHarvest();

    this.saveState();
    return { success: true, message: `${hours} Saatlik ${nodeConfig.name} görevi başlatıldı! (-${staminaCost} ⚡)` };
  },

  getExpeditionSpeedMultiplier() {
    return 1.0;
  },

  // =========================================================================
  // ⏳ ZAMAN SİMÜLASYON MOTORU (Çevrimdışı telafi + Test menüsü ileri sarma)
  // =========================================================================
  // [startMs, startMs + seconds] aralığını olay olay işletir:
  //  • Bot o anda aktifse (süresi dolmamış ve duraklatılmamışsa) hasat → tamir → stamina → silo → yeni sefer
  //  • Bot süresi aralığın içinde dolarsa oto-yenileme o anda denenir; yenilenemezse bot durur
  //  • Seferler, doğal stamina yenilenmesi ve askerlerin pasif iyileşmesi ilerler
  // Eski sürümde çevrimdışı telafi bot o an aktif değilse hiç çalışmıyordu (25 saat kapalı kalan
  // oyuncunun bütün günlük işi kayboluyordu), en fazla 24 saat ve 80 döngüyle sınırlıydı.
  simulateTimePassage(totalSeconds, { startMs = Date.now() } = {}) {
    const report = {
      seconds: Math.max(0, totalSeconds),
      expeditionsClaimed: 0,
      botRenewals: 0,
      botWorkedSeconds: 0,
      botStoppedReason: null,
      before: this._snapshotEconomy(),
      after: null
    };
    if (!(totalSeconds > 0)) { report.after = report.before; return report; }

    const nodes = RES_KEYS();
    const prevSim = this._simNow;
    const wasFF = this._isFastForwarding;
    this._isFastForwarding = true;
    const endMs = startMs + totalSeconds * 1000;
    let t = startMs;
    let guard = 20000;
    const countClaims = (actions) => {
      for (const a of (actions || [])) if (typeof a === 'string' && a.includes('toplandı')) report.expeditionsClaimed++;
    };

    try {
      while (t < endMs && guard-- > 0) {
        this._simNow = t;
        const renewCountBefore = this.state.botRenewCount || 0;

        // Süresi dolmuş bot: oto-yenileme açıksa tam bu anda yenilemeyi dene
        if (!this.hasPurchasedBot() && this.state.botAutoRenew24h &&
            (this.state.botActiveUntil || this.state.tavernaBotExpiresAt || (this.state.activeBuffs && this.state.activeBuffs.auto_collector))) {
          this.updateBotPauseState();
        }

        // Duraklatılmış bot simülasyon boyunca kendi kendine uyanmaz (süresi donuk kalır);
        // oyuncu döndüğünde eksik kaynak tamamlanınca canlı döngüde devam eder.
        if (this.hasPurchasedBot() && !this.isBotPaused()) {
          const res = this.runTavernaAutomationCycle();
          countClaims(res && res.actions);
        }
        report.botRenewals += Math.max(0, (this.state.botRenewCount || 0) - renewCountBefore);

        const botActive = this.hasPurchasedBot() && !this.isBotPaused();

        // Bir sonraki olay: en yakın sefer bitişi, bot süresinin dolması veya aralığın sonu
        let nextSec = (endMs - t) / 1000;
        let anyRunning = false;
        for (const nodeId of nodes) {
          const exp = this.state.activeExpeditions ? this.state.activeExpeditions[nodeId] : null;
          if (exp && !exp.isCompleted) {
            anyRunning = true;
            const need = Math.max(1, exp.durationSeconds - (exp.elapsedSeconds || 0));
            if (need < nextSec) nextSec = need;
          }
        }
        if (botActive) {
          const expiry = this.getAutoCollectorExpiry();
          const toExpiry = (expiry - t) / 1000;
          if (toExpiry > 0 && toExpiry < nextSec) nextSec = Math.max(1, toExpiry);
          // Bot açık ama stamina yetmediği için sefer başlatamadıysa, stamina dolana kadar küçük adımlarla bekle
          if (!anyRunning) nextSec = Math.min(nextSec, 600);
        }
        if (!(nextSec > 0)) nextSec = Math.min(60, (endMs - t) / 1000);

        // Zamanı ilerlet
        for (const nodeId of nodes) {
          const exp = this.state.activeExpeditions ? this.state.activeExpeditions[nodeId] : null;
          if (exp && !exp.isCompleted) {
            exp.elapsedSeconds = Math.min(exp.durationSeconds, (exp.elapsedSeconds || 0) + nextSec);
            exp.lastTickAt = t + nextSec * 1000;
            if (exp.elapsedSeconds >= exp.durationSeconds) exp.isCompleted = true;
          }
        }
        this.regenerateStamina(nextSec);
        this.processSoldierPassiveHealing(nextSec);
        { const vr = this.processVillage(nextSec);   // köy olayları rapora (Sen yokken olanlar)
          if (vr) { const rv = report.village || (report.village = { eaten: 0, grew: 0, lost: 0, villagers: 0 }); rv.eaten += vr.eaten; rv.grew += vr.grew; rv.lost += vr.lost; rv.villagers = vr.villagers; } }
        if (botActive) report.botWorkedSeconds += nextSec;
        t += nextSec * 1000;
      }

      // Aralığın sonunda son bir döngü: biten seferleri topla, aletleri onar
      this._simNow = endMs;
      if (this.hasPurchasedBot() && !this.isBotPaused()) {
        const res = this.runTavernaAutomationCycle();
        countClaims(res && res.actions);
      }
      if (this.hasPurchasedBot() && this.isBotPaused()) {
        report.botStoppedReason = this.checkBotPrerequisites().missingText || 'Kaynak eksik';
      } else if (!this.hasPurchasedBot() && report.botWorkedSeconds > 0) {
        report.botStoppedReason = 'Bot süresi doldu';
      }
    } finally {
      this._simNow = prevSim;
      this._isFastForwarding = wasFF;
    }

    report.after = this._snapshotEconomy();
    return report;
  },

  _snapshotEconomy() {
    const inv = this.state.inventory || {};
    const snap = {
      ada: Number(this.state.adAstraBalance) || 0,
      warehouseLevel: Number(this.state.warehouseLevel) || 1,
      xp: Number(this.state.currentXp) || 0
    };
    for (const k of RES_KEYS()) snap[k] = Number(inv[k]) || 0;
    return snap;
  },

  // 🌙 Oyun kapalıyken (veya sekme arka plandayken) geçen süreyi bir kez işler ve
  // oyuncuya gösterilecek "Sen yokken olanlar" raporunu hazırlar.
  processOfflineProgress(gapSeconds, fromMs) {
    const maxH = (GAME_CONFIG.TAVERNA_BOT && GAME_CONFIG.TAVERNA_BOT.MAX_OFFLINE_CATCHUP_HOURS) || 168;
    const seconds = Math.min(gapSeconds, maxH * 3600);
    const skipped = Math.max(0, gapSeconds - seconds);
    const report = this.simulateTimePassage(seconds, { startMs: fromMs + skipped * 1000 });
    const now = Date.now();
    for (const nodeId of Object.keys(this.state.activeExpeditions || {})) {
      const exp = this.state.activeExpeditions[nodeId];
      if (exp) exp.lastTickAt = now;
    }
    if (seconds >= 15 * 60 && (report.expeditionsClaimed > 0 || report.botWorkedSeconds > 0 || (report.village && (report.village.lost > 0 || report.village.grew >= 1)))) {
      this.state.offlineReport = { ...report, at: now, skippedSeconds: skipped };
    }
    this.saveState();
    return report;
  },

  updateExpeditions(deltaSeconds) {
    let hasChanges = false;
    const now = Date.now();
    const speedMult = this.getExpeditionSpeedMultiplier();
    const isBot = this.isAutoCollectorActive() || this.hasPurchasedBot();

    // 1. Çevrimdışı / arka plan boşluğunu bul: son kare (oturum içi) ya da son kayıt (oturumlar arası)
    if (!this._isFastForwarding) {
      let lastSeen = this._lastFrameAt || this.state.lastSeenAt || 0;
      // Eski kayıtlar için yedek: sefer zaman damgaları
      if (!lastSeen) {
        for (const nodeId of Object.keys(this.state.activeExpeditions || {})) {
          const exp = this.state.activeExpeditions[nodeId];
          if (exp && !exp.isCompleted && exp.lastTickAt > 0) lastSeen = lastSeen ? Math.min(lastSeen, exp.lastTickAt) : exp.lastTickAt;
        }
      }
      const gapSec = lastSeen ? (now - lastSeen) / 1000 : 0;
      this._lastFrameAt = now;
      this.state.lastSeenAt = now;
      if (gapSec > 90) {
        this.processOfflineProgress(gapSec, lastSeen);
        return;
      }
    }

    // Normal Frame Akışı (Realtime 60fps)
    for (const nodeId of Object.keys(this.state.activeExpeditions || {})) {
      const exp = this.state.activeExpeditions[nodeId];
      if (exp && !exp.isCompleted) {
        let step = deltaSeconds || 0;
        if (exp.lastTickAt && exp.lastTickAt > 0) {
          const realDiff = (now - exp.lastTickAt) / 1000;
          if (realDiff > 0) {
            step = Math.max(step, Math.min(realDiff, 86400));
          }
        }
        exp.lastTickAt = now;
        if (!exp.startedAt) exp.startedAt = now - (exp.elapsedSeconds * 1000);

        exp.elapsedSeconds = Math.min(exp.durationSeconds, (exp.elapsedSeconds || 0) + (step * speedMult));
        hasChanges = true;

        if (exp.elapsedSeconds >= exp.durationSeconds) {
          exp.elapsedSeconds = exp.durationSeconds;
          exp.isCompleted = true;

          if (isBot) {
            this.runTavernaAutomationCycle();
          }
        }
      }
    }

    if (hasChanges) {
      this._expSaveThrottle = (this._expSaveThrottle || 0) + 1;
      if (this._expSaveThrottle >= 60) {
        this._expSaveThrottle = 0;
        this.saveState();
      }
    }
  },
};
