// Realm of AdAstra — GameStateManager yöntemleri: Test menüsü (yalnız deneme), ileri sarma, vanilla sıfırlama, hile işlemleri
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { treasury } from '../treasury.js';
import { removeJSON } from '../storage.js';
import { zeroRes } from './ortak.js';

export const gelistiriciYontemleri = {
  // =========================================================================
  // 🧪 GELİŞTİRİCİ & HIZLI TEST METOTLARI (DEV CHEAT ENGINE)
  // =========================================================================
  // 🧪 Deneme menüsü: Sirius Konseyi projelerini SIRAYLA bitirir (count kadar; 10 üst sınır). Normal oyunda her proje 6 M birim hammadde +
  // 50.000 emek ister, bu yüzden bonuslar (ör. Savunma Duvarı) elle test edilemezdi. Gerçek işlem listesinde YOK: yalnız deneme kipinde (DEV_ACTIONS).
  devFinishCouncilProjects(count = 1) {
    let finished = 0;
    const n = Math.max(0, Math.min(10, Math.floor(Number(count)) || 0));
    for (let i = 0; i < n; i++) {
      const s = globalPool.getProjectStatus();
      if (!s.active) break;
      const r = globalPool.contributeProject({ stone: s.need.stone, iron: s.need.iron, wood: s.need.wood }, s.active.labor);
      if (!r.completed) break;
      finished++;
    }
    this.saveState();
    const kalan = globalPool.getProjectStatus().active;
    return { success: true, finished, message: finished > 0 ? `🏛️ ${finished} Konsey projesi bitti.${kalan ? ' Sıradaki: ' + kalan.name + '.' : ' Bütün projeler tamam.'}` : 'Bitirilecek açık Konsey projesi yok.' };
  },

  // 🧪 Deneme menüsü: Konsey projelerini başa alır (yapılanlar silinir, katkı ilerlemesi sıfırlanır). Konsey projeleri dünya geneli olduğundan,
  // projeleri bitirip deneyen biri bunu geri alabilsin diye (dünya ve hesapları sıfırlayan 'vanilla sıfırla'ya gerek kalmasın).
  devResetCouncilProjects() {
    const k = globalPool._konsey && globalPool._konsey();
    if (!k) return { success: false, reset: 0, message: 'Konsey durumu bulunamadı.' };
    const reset = k.projects.done.length;
    k.projects = { activeIndex: 0, progress: {}, labor: 0, done: [] };
    globalPool.saveState();
    this.saveState();
    return { success: true, reset, message: `🏛️ Konsey projeleri başa alındı (${reset} bitmiş proje silindi).` };
  },

  addDevResource(resourceKey, amount) {
    if (!this.state.inventory) this.state.inventory = {};
    this.state.inventory[resourceKey] = Math.max(0, (this.state.inventory[resourceKey] || 0) + amount);
    this.saveState();
    return this.state.inventory[resourceKey];
  },

  setDevResource(resourceKey, exactAmount) {
    if (!this.state.inventory) this.state.inventory = {};
    this.state.inventory[resourceKey] = Math.max(0, exactAmount);
    this.saveState();
    return this.state.inventory[resourceKey];
  },

  addDevAdAstra(amount) {
    this.state.adAstraBalance = Math.max(0, (this.state.adAstraBalance || 0) + amount);
    this.state.lockedAda = Math.min(Number(this.state.lockedAda) || 0, this.state.adAstraBalance);
    this.saveState();
    return this.state.adAstraBalance;
  },

  setDevAdAstra(exactAmount) {
    this.state.adAstraBalance = Math.max(0, exactAmount);
    this.state.lockedAda = Math.min(Number(this.state.lockedAda) || 0, this.state.adAstraBalance);
    this.saveState();
    return this.state.adAstraBalance;
  },

  activateTavernBuff(buffId, durationDays = 1) {
    const buffConfig = GAME_CONFIG.TAVERN_BUFFS[buffId] || { name: buffId, durationSeconds: durationDays * 86400 };
    const now = this._now();
    const durSec = (buffConfig.durationSeconds || durationDays * 86400);
    this.state.activeBuffs[buffId] = {
      id: buffId,
      name: buffConfig.name,
      expiresAt: now + durSec * 1000
    };
    this.saveState();
  },

  // ⏩ TEST MENÜSÜ: ZAMANI İLERİ SAR
  // v1.25: Artık çevrimdışı telafiyle aynı simülasyon motorunu kullanır. Bot süresi simülasyon saatine
  // göre dolar, oto-yenileme tam o anda denenir, doğal stamina yenilenir. Simülasyon bitince oyunun
  // tüm mutlak zaman damgaları (bot bitişi, güçlendirmeler, sefer başlangıçları) geçen süre kadar geri
  // alınır; böylece gerçek saatle "o kadar süre geçmiş" hali birebir aynı olur.
  fastForwardTime(hours) {
    const totalSeconds = Math.max(0, Number(hours) || 0) * 3600;
    const now = Date.now();
    const shiftMs = totalSeconds * 1000;
    const hadBot = this.hasPurchasedBot();
    const wasPaused = this.isBotPaused();
    const before = this._snapshotEconomy();

    const report = this.simulateTimePassage(totalSeconds, { startMs: now });

    // Simülasyon geleceğe doğru ilerledi: tüm mutlak zaman damgalarını geçen süre kadar geri al
    const shift = (v) => (v && v > 0 ? v - shiftMs : v);
    this.state.botActiveUntil = shift(this.state.botActiveUntil);
    this.state.tavernaBotExpiresAt = shift(this.state.tavernaBotExpiresAt);
    this.state.botPausedAt = shift(this.state.botPausedAt);
    this.state.lastAutoWarehouseUpgradeTime = shift(this.state.lastAutoWarehouseUpgradeTime);
    for (const id of Object.keys(this.state.activeBuffs || {})) {
      const b = this.state.activeBuffs[id];
      if (b && b.expiresAt) b.expiresAt -= shiftMs;
      if (b && b.expiresAt && b.expiresAt <= now && id.startsWith('auto_collector')) delete this.state.activeBuffs[id];
    }
    for (const nodeId of Object.keys(this.state.activeExpeditions || {})) {
      const exp = this.state.activeExpeditions[nodeId];
      if (!exp) continue;
      if (exp.startedAt) exp.startedAt -= shiftMs;
      exp.lastTickAt = now;
    }
    if (this.state.botActiveUntil && this.state.botActiveUntil <= now && !this.state.botPaused) this.state.botActiveUntil = 0;
    if (this.state.tavernaBotExpiresAt && this.state.tavernaBotExpiresAt <= now && !this.state.botPaused) {
      this.state.tavernaBotExpiresAt = 0;
      this.state.tavernaBotActive = false;
    }
    this._lastFrameAt = now;
    this.state.lastSeenAt = now;

    // Günlük hazine geri alımı: geçen her tam gün için bir kez (en fazla 7)
    if (hours >= 24) {
      const daysPassed = Math.floor(hours / 24);
      for (let d = 0; d < Math.min(daysPassed, 7); d++) {
        this.executeAmmTreasuryBuyback(0.15);
      }
      this.state.lastAmmBuybackDate = new Date(this._calendarNow()).toISOString().slice(0, 10);
    }

    this.saveState();
    if (typeof globalPool !== 'undefined' && globalPool && typeof globalPool.saveState === 'function') globalPool.saveState();
    if (typeof ammMarket !== 'undefined' && ammMarket && typeof ammMarket.savePools === 'function') ammMarket.savePools();

    const after = this._snapshotEconomy();
    let botExecutionStatus = 'inactive';
    if (hadBot && wasPaused) botExecutionStatus = 'paused';
    else if (hadBot) {
      if (this.isBotPaused()) botExecutionStatus = 'paused';
      else if (!this.hasPurchasedBot()) botExecutionStatus = 'expired';
      else botExecutionStatus = 'ran';
    }

    let botRemainingText = 'Kapalı / Yok';
    if (this.hasPurchasedBot()) {
      const rem = this.isBotPaused() ? (this.state.botPausedRemainingMs || 0) : Math.max(0, this.getAutoCollectorExpiry() - Date.now());
      const h = Math.floor(rem / 3600000);
      const m = Math.floor((rem % 3600000) / 60000);
      botRemainingText = `${h} saat ${m} dakika${this.isBotPaused() ? ' (Donduruldu)' : ''}`;
    }

    return {
      hours,
      hasBot: hadBot,
      botExecutionStatus,
      isPaused: this.isBotPaused(),
      missingText: this.checkBotPrerequisites().missingText,
      totalExpeditionsClaimed: report.expeditionsClaimed,
      botRenewals: report.botRenewals,
      woodGain: Math.max(0, after.wood - before.wood),
      ironGain: Math.max(0, after.iron - before.iron),
      wheatGain: Math.max(0, after.wheat - before.wheat),
      adaDiff: after.ada - before.ada,
      warehouseUpgraded: after.warehouseLevel > before.warehouseLevel,
      currentWarehouseLevel: after.warehouseLevel,
      botRemainingText,
      xpGain: Math.max(0, after.xp - before.xp)
    };
  },

  completeAllExpeditionsNow() {
    for (const nodeId of Object.keys(this.state.activeExpeditions || {})) {
      const exp = this.state.activeExpeditions[nodeId];
      if (exp) {
        exp.elapsedSeconds = exp.durationSeconds;
        exp.isCompleted = true;
      }
    }
    this.saveState();
  },

  claimAllCompletedExpeditions() {
    const results = [];
    for (const nodeId of Object.keys(this.state.activeExpeditions || {})) {
      const exp = this.state.activeExpeditions[nodeId];
      if (exp && exp.isCompleted) {
        const res = this.claimExpedition(nodeId);
        results.push(res);
      }
    }
    return results;
  },

  refillDevStamina() {
    this.state.stamina = this.getMaxStamina();
    this.saveState();
  },

  setDevLevel(targetLevel) {
    this.state.level = Math.max(1, Math.min(GAME_CONFIG.MAX_PLAYER_LEVEL, targetLevel));
    this.saveState();
  },

  healAllDevSoldiers() {
    if (Array.isArray(this.state.soldierUnits)) {
      this.state.soldierUnits.forEach(s => {
        s.hp = s.maxHp || 100;
      });
    }
    this.saveState();
  },

  repairAllDevTools() {
    Object.keys(this.state.tools || {}).forEach(t => {
      if (this.state.tools[t]) {
        this.state.tools[t].durability = 4320;
      }
    });
    // Silah & Zırhları da Tamir Et
    if (Array.isArray(this.state.soldierUnits)) {
      this.state.soldierUnits.forEach(u => {
        if (u.weapon) { u.weapon.durability = 100; u.weapon.repairsLeft = 18; }
        if (u.armor) { u.armor.durability = 100; u.armor.repairsLeft = 18; }
      });
    }
    this.saveState();
  },

  unlockAllDevArtifacts() {
    if (Array.isArray(this.state.collectionArtifacts)) {
      this.state.collectionArtifacts.forEach(a => {
        a.discovered = true;
        a.discoveredAt = Date.now();
      });
    }
    this.saveState();
  },

  setDungeonProgress(level) {
    this.state.dungeonProgress = Math.max(1, Math.min(18, level));
    this.saveState();
  },

  // 🍦 VANILLA HESAP & 100M ASTRA İLK DAĞITIM TOHUM HAVUZLARI VE TÜM HAZİNELERİ SIFIRLAMA:
  // 1. Oyuncunun kişisel hesabını başlangıç profiline döndürür.
  // 2. Haftalık kaynak çıkartma limitlerini tam kapasiteye (%100) sıfırlar.
  // 3. AMM DEX Pazar Havuzlarını tam 40M ASTRA ilk tohum rezervlerine sıfırlar.
  // 4. Krallık Hazinesi Kasalarını (Zindan 14M, Arena 8M, World Boss 8M, AMM Buyback 6M, Karnaval 4M) tam 40M ASTRA ilk tohum rezervlerine sıfırlar.
  // 5. Krallık Piyango Havuzunu tam 20M ASTRA tohumuna sıfırlar.
  // 6. World Boss'u tam 1.000.000 Can ve 8M ASTRA ödül havuzuyla ilk haline sıfırlar.
  // 7. Kolezyum Gladyatör Arenasını, ELO derecesini, günlük maç haklarını ve liderlik tablosunu sıfırlar.
  // 8. Zindan katlarını ve canavar canlarını Seviye 1'e ve %100 tam cana sıfırlar.
  // Toplam 100 Milyon ASTRA başlangıç fonu ilk anki oranlarıyla oyuna yeniden dağıtılır!
  vanillaReset() {
    removeJSON(this.storageKey);
    if (typeof globalPool !== 'undefined' && globalPool) {
      if (typeof globalPool.vanillaReset === 'function') {
        globalPool.vanillaReset();
      } else if (globalPool.resetEpoch) {
        globalPool.resetEpoch();
      }
    }
    if (typeof ammMarket !== 'undefined' && ammMarket && ammMarket.resetPools) {
      ammMarket.resetPools();
    }
    if (typeof treasury !== 'undefined' && treasury && treasury.resetToSeed) {
      treasury.resetToSeed();
    } else if (typeof treasury !== 'undefined' && treasury && treasury.reset) {
      treasury.reset();
    }
    this.state = {
      name: 'AlphAvax Gezgini',
      level: 1,
      currentXp: 0,
      stamina: 100,
      // v2: başlangıç bakiyesi, envanter ve aletler tek yerden (STARTING_PROFILE)
      adAstraBalance: Number(GAME_CONFIG.STARTING_PROFILE?.adAstraBalance ?? 2.5),
      inventory: { ...zeroRes(), fragments: 0, ...JSON.parse(JSON.stringify(GAME_CONFIG.STARTING_PROFILE?.inventory || { wood: 60, iron: 40, wheat: 80 })) },
      tools: this.mergeTools(JSON.parse(JSON.stringify(GAME_CONFIG.STARTING_PROFILE?.tools || {}))),
      army: {
        infantry: 2,
        archer: 1,
        knight: 0
      },
      equipment: {
        weapon: null,
        helmet: null,
        armor: null,
        legs: null,
        boots: null
      },
      warehouseLevel: 1,
      lockedBoxes: 0,
      arenaKeys: 0,
      genesisNftMinted: false,
      uretim: null,
      rocketReady: false,
      rocketBuiltAt: 0,
      grants: [],
      activeBuffs: {},
      activeExpeditions: {},
      dungeonProgress: 1,
      collectionArtifacts: this.mergeCollectionArtifacts([]),
      soldierUnits: this.mergeSoldierUnits([]),
      combatPresets: this.mergeCombatPresets(null),
      armoryInventory: [],
      dungeonMonsterCurrentHp: {},
      lotteryTickets: 0,
      lotteryPool: (GAME_CONFIG.CARNIVAL && GAME_CONFIG.CARNIVAL.LOTTERY && GAME_CONFIG.CARNIVAL.LOTTERY.SEED_POOL_ADA) || 20000000,
      lotteryAmortiPool: 0,
      lotteryPendingPayout: 0,
      lastLotteryDrawEpoch: (globalPool && globalPool.state && globalPool.state.epochId) || 1,
      lastLotteryResult: null,
      onboarding: {},
      botTrialUsed: false,
      botRenewCount: 0,
      pendingNotices: [],
      offlineReport: null,
      lastSeenAt: Date.now(),
      wheelTicketShards: 0,
      botSiloAutoUpgrade: true,
      botAutoRenew24h: false,
      botActiveUntil: 0,
      tavernaBotActive: false,
      redeemCodes: [],
      burnedResources: zeroRes(),
      village: { ...(GAME_CONFIG.STARTING_PROFILE.village || { houses: 1, villagers: 10, labor: 0, lastGrowthAt: 0, starvingSince: 0 }) },
      lockedAda: 0,
      lockUnlock: null,
      contribution: null,
      adaPriceMultiplier: GAME_CONFIG.ADA_PRICE_MULTIPLIER?.DEFAULT ?? 1,
      adaPriceMultiplierTarget: null,
      adaPriceMultiplierEpoch: (globalPool && globalPool.state && globalPool.state.epochId) || 1,
      lastClaimedUbiEpoch: 0,
      totalUbiEarned: 0,
      lastAutoWarehouseUpgradeTime: 0,
      lastBotActions: [],
      lastBotSiloAction: null,
      // 🏟️ KOLEZYUM GLADYATÖR ARENASI İLK DAĞITIM VE DURUM SIFIRLAMA
      colosseumStats: {
        wins: 0,
        losses: 0,
        score: 0,
        rank: 11,
        totalAdaWon: 0,
        rating: (GAME_CONFIG.COLOSSEUM && GAME_CONFIG.COLOSSEUM.STARTING_RATING) || 1000
      },
      colosseumLeaderboard: [
        { rank: 1, name: 'Kraliyet Gladyatörü Leonidas', score: 48, wins: 48, losses: 2, icon: '🦁', title: 'Arena Şampiyonu', rewardKeys: 5, rewardAda: 15000 },
        { rank: 2, name: 'Valkyrie Selin', score: 42, wins: 42, losses: 5, icon: '⚔️', title: 'Yenilmez Gladyatör', rewardKeys: 3, rewardAda: 8000 },
        { rank: 3, name: 'Gölge Şövalyesi Eren', score: 38, wins: 38, losses: 7, icon: '🗡️', title: 'Arenanın Fatihi', rewardKeys: 1, rewardAda: 2500 },
        { rank: 4, name: 'Titan Barok', score: 35, wins: 35, losses: 8, icon: '🗿', title: 'Taş Muhafız', rewardKeys: 1, rewardAda: 2500 },
        { rank: 5, name: 'Büyücü Zafira', score: 31, wins: 31, losses: 9, icon: '🧙‍♀️', title: 'Kadim Elementalist', rewardKeys: 1, rewardAda: 2500 },
        { rank: 6, name: 'Gece Avcısı Kaan', score: 28, wins: 28, losses: 10, icon: '🏹', title: 'Usta Nişancı', rewardKeys: 1, rewardAda: 2500 },
        { rank: 7, name: 'Korsan Kaptan Drake', score: 25, wins: 25, losses: 12, icon: '🏴‍☠️', title: 'Denizler Fatihi', rewardKeys: 1, rewardAda: 2500 },
        { rank: 8, name: 'Ejderha Süvarisi Alperen', score: 22, wins: 22, losses: 13, icon: '🐉', title: 'Ateş Lordu', rewardKeys: 1, rewardAda: 2500 },
        { rank: 9, name: 'Kutsal Şövalye Galahad', score: 19, wins: 19, losses: 14, icon: '🛡️', title: 'Işık Muhafızı', rewardKeys: 1, rewardAda: 2500 },
        { rank: 10, name: 'Fırtına Savaşçısı Zephyr', score: 16, wins: 16, losses: 15, icon: '⚡', title: 'Fırtına Getiren', rewardKeys: 1, rewardAda: 2500 },
      ],
      dailyCounters: {
        date: new Date().toISOString().slice(0, 10),
        arenaMatches: 0,
        dungeonRuns: 0
      },
      // 🌋 DÜNYA BOSSU (WORLD BOSS) İLK DAĞITIM VE CAN SIFIRLAMA
      worldBoss: {
        name: 'Kadim Kıyamet Behemoth\'u (WORLD BOSS)',
        icon: '🌋',
        totalVaultPool: (typeof treasury !== 'undefined' && treasury.getPool) ? Math.round(treasury.getPool('worldBoss')) : 8000000,
        weeklyDistributionRate: (GAME_CONFIG.WORLD_BOSS && GAME_CONFIG.WORLD_BOSS.WEEKLY_DISTRIBUTION_RATE) || 0.10,
        weeklyDistributionPool: Math.round(((typeof treasury !== 'undefined' && treasury.getPool) ? Math.round(treasury.getPool('worldBoss')) : 8000000) * 0.10),
        weeklyAdaPool: (typeof treasury !== 'undefined' && treasury.getPool) ? Math.round(treasury.getPool('worldBoss')) : 8000000,
        bossHp: GAME_CONFIG.WORLD_BOSS.BASE_HP,
        maxBossHp: GAME_CONFIG.WORLD_BOSS.BASE_HP,
        bossAtk: 500000,
        stakedArmyCount: 0,
        totalStakedAtk: 0,
        totalStakedHp: 0,
        userStaked: false,
        userDamage: 0,
        userStakedSoldiersCount: 0,
        userStakedAtk: 0,
        userStakedHp: 0,
        claimableRewardAda: 0,
        totalClaimedAda: 0,
        lastBattleTimestamp: null
      }
    };
    this.saveState();
  },

  // =========================================================================
  // 🧪 GELİŞTİRİCİ & HİLE (DEV CHEAT) TEST FONKSİYONLARI
  // =========================================================================
  cheatAddResources(wood = 0, iron = 0, wheat = 0, fragments = 0, adAstra = 0, boxes = 0, keys = 0) {
    const inv = this.state.inventory;
    inv.wood = (inv.wood || 0) + wood;
    inv.iron = (inv.iron || 0) + iron;
    inv.wheat = (inv.wheat || 0) + wheat;
    inv.fragments = (inv.fragments || 0) + fragments;
    this.state.adAstraBalance += adAstra;
    this.state.lockedBoxes = (this.state.lockedBoxes || 0) + boxes;
    this.state.arenaKeys = (this.state.arenaKeys || 0) + keys;
    this.saveState();
    return { success: true, message: '⚡ Test Kaynakları Hesaba Eklendi!' };
  },

  cheatRefillStamina() {
    this.state.stamina = this.getMaxStamina();
    this.saveState();
    return { success: true, message: '⚡ Stamina %100 Dolduruldu!' };
  },

  cheatUnlockAllArtifacts() {
    (this.state.collectionArtifacts || []).forEach(a => {
      a.discovered = true;
      a.discoveredAt = Date.now();
    });
    this.saveState();
    return { success: true, message: '👑 Tüm 18 Koleksiyon Eseri Açıldı!' };
  },

  cheatSetDungeonProgress(level) {
    this.state.dungeonProgress = Math.max(1, Math.min(18, level));
    this.saveState();
    return { success: true, message: `💀 Zindan İlerlemesi Seviye ${level} Olarak Ayarlandı!` };
  },

  cheatLevelUpPlayer() {
    this.state.level = (this.state.level || 1) + 1;
    this.state.currentXp = 0;
    this.state.stamina = this.getMaxStamina();
    this.saveState();
    return { success: true, message: `👑 Gezgin Seviye ${this.state.level}'e Yükseltildi!` };
  },

  cheatMaxEquipAllSoldiers() {
    const soldiers = this.state.soldierUnits || [];
    const slots = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
    for (let i = 0; i < soldiers.length; i++) {
      if (!soldiers[i].equipment) soldiers[i].equipment = {};
      for (const slot of slots) {
        const recipe = GAME_CONFIG.EQUIPMENT_RECIPES[slot];
        soldiers[i].equipment[slot] = {
          id: `${recipe.id}_cheat_${i}`,
          slot: recipe.slot,
          name: recipe.name,
          icon: recipe.icon,
          level: 10,
          baseAtk: recipe.baseAtk,
          baseHp: recipe.baseHp,
          atkBonus: Math.round(recipe.baseAtk * (1 + 9 * 0.35)),
          hpBonus: Math.round(recipe.baseHp * (1 + 9 * 0.35)),
          durability: 13,
          maxDurability: 13,
          craftedAt: Date.now()
        };
      }
      soldiers[i].hp = soldiers[i].maxHp || 100;
    }
    this.saveState();
    return { success: true, message: '⚔️ Tüm Askerlere Lv.10 Master Zırh ve Silah Donatıldı!' };
  },

  cheatFinishAllExpeditions() {
    const active = this.state.activeExpeditions;
    for (const key of Object.keys(active)) {
      if (active[key]) {
        active[key].elapsedSeconds = active[key].durationSeconds || 1080;
        active[key].isCompleted = true;
      }
    }
    this.saveState();
    return { success: true, message: '⚡ Tüm Seferler Anında Tamamlandı!' };
  },
};
