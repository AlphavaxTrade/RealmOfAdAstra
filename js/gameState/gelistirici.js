// Realm of AdAstra — GameStateManager yöntemleri: test laboratuvarı araçları (yalnız deneme / geliştirme sürümünde
// kullanılır; sunucuda yalnız TEST_MODE'da, bkz. server/actions.js DEV_ACTIONS), ileri sarma ve ilk güne döndürme.
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { treasury } from '../treasury.js';
import { removeJSON } from '../storage.js';
import { isoWeekKey } from './ozet.js';

const SAAT_MS = 3600000;
const DAKIKA_MS = 60000;

export const gelistiriciYontemleri = {
  // ── Sirius Konseyi projeleri ────────────────────────────────────────────
  // Sıradaki projeleri bitirir (count kadar, en çok 10). Normalde her proje 6 M birim hammadde + 50.000 emek ister;
  // bonuslar (ör. Savunma Duvarı) elle denenemezdi.
  devFinishCouncilProjects(count = 1) {
    let biten = 0;
    const adet = Math.max(0, Math.min(10, Math.floor(Number(count)) || 0));
    for (let i = 0; i < adet; i++) {
      const durum = globalPool.getProjectStatus();
      if (!durum.active) break;
      const r = globalPool.contributeProject({ stone: durum.need.stone, iron: durum.need.iron, wood: durum.need.wood }, durum.active.labor);
      if (!r.completed) break;
      biten++;
    }
    this.saveState();
    const kalan = globalPool.getProjectStatus().active;
    return {
      success: true,
      finished: biten,
      message: biten > 0
        ? `🏛️ ${biten} Konsey projesi bitti.${kalan ? ' Sıradaki: ' + kalan.name + '.' : ' Bütün projeler tamam.'}`
        : 'Bitirilecek açık Konsey projesi yok.'
    };
  },

  // Konsey projelerini başa alır (dünya geneli olduğundan, deneyen kişi geri alabilsin diye)
  devResetCouncilProjects() {
    const konsey = globalPool._konsey && globalPool._konsey();
    if (!konsey) return { success: false, reset: 0, message: 'Konsey durumu bulunamadı.' };
    const silinen = konsey.projects.done.length;
    konsey.projects = { activeIndex: 0, progress: {}, labor: 0, done: [] };
    globalPool.saveState();
    this.saveState();
    return { success: true, reset: silinen, message: `🏛️ Konsey projeleri başa alındı (${silinen} bitmiş proje silindi).` };
  },

  // ── Kaynak, bakiye, seviye ──────────────────────────────────────────────
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

  refillDevStamina() {
    this.state.stamina = this.getMaxStamina();
    this.saveState();
  },

  setDevLevel(targetLevel) {
    this.state.level = Math.max(1, Math.min(GAME_CONFIG.MAX_PLAYER_LEVEL, targetLevel));
    this.saveState();
  },

  setDungeonProgress(level) {
    this.state.dungeonProgress = Math.max(1, Math.min(18, level));
    this.saveState();
  },

  // Eski hile işlemi (test sunucusu akışı ve testler bunu dener)
  cheatAddResources(wood = 0, iron = 0, wheat = 0, fragments = 0, adAstra = 0, boxes = 0, keys = 0) {
    const envanter = this.state.inventory;
    envanter.wood = (envanter.wood || 0) + wood;
    envanter.iron = (envanter.iron || 0) + iron;
    envanter.wheat = (envanter.wheat || 0) + wheat;
    envanter.fragments = (envanter.fragments || 0) + fragments;
    this.state.adAstraBalance += adAstra;
    this.state.lockedBoxes = (this.state.lockedBoxes || 0) + boxes;
    this.state.arenaKeys = (this.state.arenaKeys || 0) + keys;
    this.saveState();
    return { success: true, message: '⚡ Test Kaynakları Hesaba Eklendi!' };
  },

  // ── Sefer, ordu, alet, koleksiyon ───────────────────────────────────────
  completeAllExpeditionsNow() {
    for (const alan of Object.keys(this.state.activeExpeditions || {})) {
      const sefer = this.state.activeExpeditions[alan];
      if (!sefer) continue;
      sefer.elapsedSeconds = sefer.durationSeconds;
      sefer.isCompleted = true;
    }
    this.saveState();
  },

  claimAllCompletedExpeditions() {
    const sonuclar = [];
    for (const alan of Object.keys(this.state.activeExpeditions || {})) {
      const sefer = this.state.activeExpeditions[alan];
      if (sefer && sefer.isCompleted) sonuclar.push(this.claimExpedition(alan));
    }
    return sonuclar;
  },

  healAllDevSoldiers() {
    for (const asker of (Array.isArray(this.state.soldierUnits) ? this.state.soldierUnits : [])) asker.hp = asker.maxHp || 100;
    this.saveState();
  },

  repairAllDevTools() {
    for (const kimlik of Object.keys(this.state.tools || {})) {
      if (this.state.tools[kimlik]) this.state.tools[kimlik].durability = 4320;
    }
    // Silah ve zırhlar da onarılır
    for (const asker of (Array.isArray(this.state.soldierUnits) ? this.state.soldierUnits : [])) {
      if (asker.weapon) { asker.weapon.durability = 100; asker.weapon.repairsLeft = 18; }
      if (asker.armor) { asker.armor.durability = 100; asker.armor.repairsLeft = 18; }
    }
    this.saveState();
  },

  unlockAllDevArtifacts() {
    for (const eser of (Array.isArray(this.state.collectionArtifacts) ? this.state.collectionArtifacts : [])) {
      eser.discovered = true;
      eser.discoveredAt = Date.now();
    }
    this.saveState();
  },

  // ── Zamanı ileri sar ────────────────────────────────────────────────────
  // Çevrimdışı telafiyle aynı simülasyon motorunu kullanır: bot süresi simülasyon saatine göre dolar, oto-yenileme tam o
  // anda denenir, doğal stamina yenilenir. Simülasyon bitince oyunun mutlak zaman damgaları (bot bitişi, güçlendirmeler,
  // sefer başlangıçları) geçen süre kadar geri alınır; gerçek saatle "o kadar süre geçmiş" hali birebir elde edilir.
  fastForwardTime(hours) {
    const saniye = Math.max(0, Number(hours) || 0) * 3600;
    const simdi = Date.now();
    const kayma = saniye * 1000;
    const botVardi = this.hasPurchasedBot();
    const duraklatilmisti = this.isBotPaused();
    const once = this._snapshotEconomy();

    const rapor = this.simulateTimePassage(saniye, { startMs: simdi });

    const geriAl = (v) => (v && v > 0 ? v - kayma : v);
    this.state.botActiveUntil = geriAl(this.state.botActiveUntil);
    this.state.tavernaBotExpiresAt = geriAl(this.state.tavernaBotExpiresAt);
    this.state.botPausedAt = geriAl(this.state.botPausedAt);
    this.state.lastAutoWarehouseUpgradeTime = geriAl(this.state.lastAutoWarehouseUpgradeTime);
    for (const kimlik of Object.keys(this.state.activeBuffs || {})) {
      const guc = this.state.activeBuffs[kimlik];
      if (guc && guc.expiresAt) guc.expiresAt -= kayma;
      if (guc && guc.expiresAt && guc.expiresAt <= simdi && kimlik.startsWith('auto_collector')) delete this.state.activeBuffs[kimlik];
    }
    for (const alan of Object.keys(this.state.activeExpeditions || {})) {
      const sefer = this.state.activeExpeditions[alan];
      if (!sefer) continue;
      if (sefer.startedAt) sefer.startedAt -= kayma;
      sefer.lastTickAt = simdi;
    }
    if (this.state.botActiveUntil && this.state.botActiveUntil <= simdi && !this.state.botPaused) this.state.botActiveUntil = 0;
    if (this.state.tavernaBotExpiresAt && this.state.tavernaBotExpiresAt <= simdi && !this.state.botPaused) {
      this.state.tavernaBotExpiresAt = 0;
      this.state.tavernaBotActive = false;
    }
    this._lastFrameAt = simdi;
    this.state.lastSeenAt = simdi;

    // Haftalık hazine geri alımı: geçen her tam hafta için bir kez (en fazla 4; oran GAME_CONFIG.AMM_BUYBACK.WEEKLY_RATE)
    if (hours >= 24 * 7) {
      const hafta = Math.floor(hours / (24 * 7));
      for (let i = 0; i < Math.min(hafta, 4); i++) this.executeAmmTreasuryBuyback();
    }
    this.state.lastAmmBuybackWeek = isoWeekKey(this._calendarNow());

    this.saveState();
    if (globalPool && typeof globalPool.saveState === 'function') globalPool.saveState();
    if (ammMarket && typeof ammMarket.savePools === 'function') ammMarket.savePools();

    const sonra = this._snapshotEconomy();
    let botDurumu = 'inactive';
    if (botVardi && duraklatilmisti) botDurumu = 'paused';
    else if (botVardi) {
      if (this.isBotPaused()) botDurumu = 'paused';
      else if (!this.hasPurchasedBot()) botDurumu = 'expired';
      else botDurumu = 'ran';
    }

    let botKalan = 'Kapalı / Yok';
    if (this.hasPurchasedBot()) {
      const kalanMs = this.isBotPaused() ? (this.state.botPausedRemainingMs || 0) : Math.max(0, this.getAutoCollectorExpiry() - Date.now());
      botKalan = `${Math.floor(kalanMs / SAAT_MS)} saat ${Math.floor((kalanMs % SAAT_MS) / DAKIKA_MS)} dakika${this.isBotPaused() ? ' (Donduruldu)' : ''}`;
    }

    return {
      hours,
      hasBot: botVardi,
      botExecutionStatus: botDurumu,
      isPaused: this.isBotPaused(),
      missingText: this.checkBotPrerequisites().missingText,
      totalExpeditionsClaimed: rapor.expeditionsClaimed,
      botRenewals: rapor.botRenewals,
      woodGain: Math.max(0, sonra.wood - once.wood),
      ironGain: Math.max(0, sonra.iron - once.iron),
      wheatGain: Math.max(0, sonra.wheat - once.wheat),
      adaDiff: sonra.ada - once.ada,
      warehouseUpgraded: sonra.warehouseLevel > once.warehouseLevel,
      currentWarehouseLevel: sonra.warehouseLevel,
      botRemainingText: botKalan,
      xpGain: Math.max(0, sonra.xp - once.xp)
    };
  },

  // ── İlk güne döndür ─────────────────────────────────────────────────────
  // Hesabı başlangıç profiline, dünyayı (küresel havuz, pazar havuzları, kasalar, piyango tohumu) ilk dağıtıma döndürür.
  vanillaReset() {
    removeJSON(this.storageKey);
    if (globalPool) {
      if (typeof globalPool.vanillaReset === 'function') globalPool.vanillaReset();
      else if (globalPool.resetEpoch) globalPool.resetEpoch();
    }
    if (ammMarket && ammMarket.resetPools) ammMarket.resetPools();
    if (treasury && treasury.resetToSeed) treasury.resetToSeed();
    else if (treasury && treasury.reset) treasury.reset();

    // Boş kayıttan kurulan başlangıç durumu + ilk günde açıkça yazılı alanlar (testler ve ekranlar okur)
    const donem = (globalPool && globalPool.state && globalPool.state.epochId) || 1;
    const bossHavuzu = treasury && treasury.getPool ? Math.round(treasury.getPool('worldBoss')) : 8000000;
    const bossAyar = GAME_CONFIG.WORLD_BOSS || {};
    this.state = {
      ...this.loadState(),
      dungeonProgress: 1,
      botRenewCount: 0,
      tavernaBotActive: false,
      adaPriceMultiplierEpoch: donem,
      lastClaimedUbiEpoch: 0,
      totalUbiEarned: 0,
      lastAutoWarehouseUpgradeTime: 0,
      lastBotActions: [],
      lastBotSiloAction: null,
      lastSeenAt: Date.now(),
      lastLotteryDrawEpoch: donem,
      colosseumStats: {
        wins: 0, losses: 0, score: 0, rank: 11, totalAdaWon: 0,
        rating: (GAME_CONFIG.COLOSSEUM && GAME_CONFIG.COLOSSEUM.STARTING_RATING) || 1000
      },
      dailyCounters: { date: new Date().toISOString().slice(0, 10), arenaMatches: 0, dungeonRuns: 0 },
      worldBoss: {
        name: "Kadim Kıyamet Behemoth'u (WORLD BOSS)",
        icon: '🌋',
        totalVaultPool: bossHavuzu,
        weeklyDistributionRate: bossAyar.WEEKLY_DISTRIBUTION_RATE || 0.10,
        weeklyDistributionPool: Math.round(bossHavuzu * 0.10),
        weeklyAdaPool: bossHavuzu,
        bossHp: bossAyar.BASE_HP,
        maxBossHp: bossAyar.BASE_HP,
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
  }
};
