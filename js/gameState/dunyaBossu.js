// Realm of AdAstra — GameStateManager yöntemleri: Dünya Bossu: bilgi, ordu kilitleme, savaş, ödül
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { sound } from '../audio.js';
import { treasury } from '../treasury.js';

export const dunyaBossuYontemleri = {
  // =========================================================================
  // SAVAŞ ALANI: HAFTALIK WORLD BOSS ORDU STAKE & OTOMATİK SAVAŞ (PAZAR 18:00 TSİ)
  // =========================================================================
  getWorldBossInfo() {
    if (!this.state.worldBoss) {
      this.state.worldBoss = {
        name: 'Kadim Kıyamet Behemoth\'u (WORLD BOSS)',
        icon: '🌋',
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
      };
    } else {
      if (typeof treasury !== 'undefined' && treasury.getPool) {
        this.state.worldBoss.weeklyAdaPool = Math.round(treasury.getPool('worldBoss')) || 8000000;
      }
      if (!this.state.worldBoss.userStaked) {
        this.state.worldBoss.stakedArmyCount = 0;
        this.state.worldBoss.totalStakedAtk = 0;
        this.state.worldBoss.totalStakedHp = 0;
      }
      if (this.state.worldBoss.claimableRewardAda == null) {
        this.state.worldBoss.claimableRewardAda = 0;
      }
    }
    return this.state.worldBoss;
  },

  // Erken çekilme cezası oranı: taban (%18) + biten Konsey projelerinin etkisi. Savunma Duvarı projesi bitince 6 puan düşer (%12).
  // Bonus ortak dünya durumundan (globalPool) okunur: projeyi bitiren herkes için geçerlidir, sunucuda da aynı yöntem çalışır.
  getWorldBossEarlyUnstakeRate() {
    const taban = GAME_CONFIG.WORLD_BOSS.EARLY_UNSTAKE_PENALTY ?? 0.18;
    const bonus = (typeof globalPool !== 'undefined' && globalPool && globalPool.getProjectBonus) ? globalPool.getProjectBonus('bossPenaltyPoints') : 0;
    return Math.max(0, Math.round((taban + bonus) * 10000) / 10000);   // 0,18 − 0,06 = 0,12 tam çıksın (kayan nokta)
  },

  // Kullanıcının ordusunun Pazar 18:00 TSİ savaşındaki hasar gücünü hesaplar:
  // Her 1 ATK = 1:1 rasyo, Her 1 HP = 1:0.25 rasyo + Yetenek Çeşitliliği Bonusu (max +%50)
  calculateUserWorldBossPower() {
    const boss = this.getWorldBossInfo();
    const atk = boss.userStakedAtk || 0;
    const hp = boss.userStakedHp || 0;
    const baseDamage = Math.floor((atk * 1.0) + (hp * 0.25));

    // Rol / Yetenek Çeşitliliği Bonusu
    const diversity = this.calculateSquadSkillDiversity();
    const calculatedDamage = Math.floor(baseDamage * diversity.diversityMultiplier);
    const estimatedAda = Math.floor((calculatedDamage * boss.weeklyAdaPool) / boss.maxBossHp);
    return {
      atk,
      hp,
      atkContribution: Math.floor(atk * 1.0),
      hpContribution: Math.floor(hp * 0.25),
      baseDamage,
      calculatedDamage,
      estimatedAda,
      earlyUnstakePenaltyRate: this.getWorldBossEarlyUnstakeRate(),
      diversityMultiplier: diversity.diversityMultiplier,
      uniqueRoles: diversity.uniqueRoles,
      rolesFound: diversity.rolesFound
    };
  },

  stakeArmyForWorldBoss() {
    const soldiers = this.state.soldierUnits || [];
    if (soldiers.length === 0) {
      return { success: false, message: 'World Boss savaşına kilitlemek için ordunuzda asker bulunmalıdır!' };
    }
    if (this.state.pvpQueue) {
      return { success: false, message: '🔒 Askerlerinden biri Kolezyumda maç arıyor. Önce sıradan çık.' };
    }

    let userAtk = 0;
    let userHp = 0;
    for (let i = 0; i < soldiers.length; i++) {
      const stats = this.getSoldierFullStats(i);
      userAtk += stats.totalAtk;
      userHp += stats.totalMaxHp;
    }

    const boss = this.getWorldBossInfo();
    if (boss.userStaked) {
      boss.stakedArmyCount = Math.max(0, (boss.stakedArmyCount || 0) - (boss.userStakedSoldiersCount || 0));
      boss.totalStakedAtk = Math.max(0, (boss.totalStakedAtk || 0) - (boss.userStakedAtk || 0));
      boss.totalStakedHp = Math.max(0, (boss.totalStakedHp || 0) - (boss.userStakedHp || 0));
    }
    boss.userStaked = true;
    boss.userStakedSoldiersCount = soldiers.length;
    boss.userStakedAtk = userAtk;
    boss.userStakedHp = userHp;
    boss.stakedArmyCount = (boss.stakedArmyCount || 0) + soldiers.length;
    boss.totalStakedAtk = (boss.totalStakedAtk || 0) + userAtk;
    boss.totalStakedHp = (boss.totalStakedHp || 0) + userHp;

    const power = this.calculateUserWorldBossPower();

    sound.playLevelUp();
    this.saveState();

    return {
      success: true,
      message: `🛡️ ${soldiers.length} kişilik ordun (${userAtk} ATK + ${userHp} HP ➔ ${power.calculatedDamage.toLocaleString()} Hasar Gücü) Pazar 18:00 TSİ otomatik World Boss savaşı için başarıyla kilitlendi!`,
      boss,
      power
    };
  },

  // Bu haftanın savaş zamanı (Pazar 15:00 UTC = 18:00 TSİ) geldi mi?
  getWorldBossSchedule(now = Date.now()) {
    const cfg = GAME_CONFIG.WORLD_BOSS;
    const d = new Date(now);
    const day = d.getUTCDay();
    // Bu haftanın Pazar 15:00 UTC anı
    const thisSunday = new Date(d);
    thisSunday.setUTCDate(d.getUTCDate() - day + cfg.BATTLE_DAY_UTC);
    thisSunday.setUTCHours(cfg.BATTLE_HOUR_UTC, 0, 0, 0);
    let battleTime = thisSunday.getTime();
    if (battleTime > now) battleTime -= 7 * 24 * 3600 * 1000; // en son geçen savaş anı
    const nextBattle = battleTime + 7 * 24 * 3600 * 1000;
    return { lastBattleTime: battleTime, nextBattleTime: nextBattle, msUntilNext: nextBattle - now };
  },

  // Her Pazar TSİ 18:00'da TEK SEFERLİK otomatik savaş.
  //
  // ═══════════════════════════════════════════════════════════════════════
  // v1'DEKİ EN AĞIR AÇIK (F-03)
  // ═══════════════════════════════════════════════════════════════════════
  // Whitepaper savaşın "her Pazar 18:00'da tek seferlik ve otomatik" olduğunu
  // söylüyordu ama kodda ZAMANLAYICI YOKTU. Bunun yerine savaş alanı modalına,
  // geliştirici paneline değil OYUNCUNUN GÖRDÜĞÜ EKRANA, bir "[Test] Pazar
  // Savaşını Şimdi Simüle Et" butonu konmuştu. Her tıklama hasarı ve
  // toplanabilir ödülü artırıyordu; sınır yoktu. Tam donanımlı 18 askerle
  // tıklama başına ~901 ASTRA, saniyede birkaç tıklama.
  //
  // v2'de savaş gerçek takvime bağlıdır ve haftada bir kez çalışır.
  executeSundayAutoWorldBossBattle({ force = false } = {}) {
    const boss = this.getWorldBossInfo();
    if (!boss.userStaked) {
      return { success: false, message: 'Kilitli ordunuz bulunmadığı için bu haftaki savaşa dahil olunamadı.' };
    }

    const sched = this.getWorldBossSchedule();
    if (!force && (boss.lastBattleTimestamp || 0) >= sched.lastBattleTime) {
      const hrs = Math.floor(sched.msUntilNext / 3600000);
      const mins = Math.floor((sched.msUntilNext % 3600000) / 60000);
      return {
        success: false,
        alreadyFought: true,
        message: `⏳ Bu haftanın World Boss savaşı çoktan gerçekleşti. Sonraki savaşa ${hrs} saat ${mins} dakika kaldı (Pazar 18:00 TSİ).`
      };
    }

    const power = this.calculateUserWorldBossPower();
    const damageDealt = power.calculatedDamage;

    boss.userDamage = damageDealt; // haftalık — birikmez
    boss.bossHp = Math.max(0, boss.bossHp - damageDealt);

    // YASA 1: ödül hazinenin worldBoss havuzundan çekilir, basılmaz.
    const request = Math.max(1, Math.floor((damageDealt * boss.weeklyAdaPool) / boss.maxBossHp));
    const draw = globalPool.withdrawReward('worldBoss', request);
    const rewardAda = draw.granted;

    boss.claimableRewardAda = (boss.claimableRewardAda || 0) + rewardAda;
    boss.lastBattleTimestamp = Date.now();

    // Ordu kilidi savaştan sonra açılır
    boss.userStaked = false;

    sound.playLevelUp();
    this.saveState();

    return {
      success: true,
      damageDealt,
      rewardAda,
      requested: request,
      scaled: draw.scaleFactor < 0.999,
      budgetFull: !!draw.budgetFull,
      claimableRewardAda: boss.claimableRewardAda,
      message: `💥 Pazar 18:00 TSİ World Boss savaşı tamamlandı! Ordun ${damageDealt.toLocaleString()} hasar vurdu ve ${rewardAda.toLocaleString()} ASTRA kazandı.${draw.budgetFull ? ` ⏳ ${GAME_CONFIG.TREASURY_WEEKLY_BUDGET.FULL_MESSAGE}` : (draw.scaleFactor < 0.999 ? ' (Havuz doluluğu nedeniyle ödül oranlandı.)' : '')}`
    };
  },

  isArmyStakedInWorldBoss() {
    return !!(this.state.worldBoss && this.state.worldBoss.userStaked);
  },

  // Kullanıcının World Boss ekranına düşen ASTRA ödülünü cüzdanına çekmesi (Claim)
  claimWorldBossReward() {
    const boss = this.getWorldBossInfo();
    const claimable = boss.claimableRewardAda || 0;
    const soldiersCount = boss.userStakedSoldiersCount || 0;

    if (claimable <= 0 && !boss.userStaked) {
      return { success: false, message: 'Toplanacak World Boss ödülü bulunmuyor!' };
    }

    this.state.adAstraBalance += claimable;
    this._onAdaEarned(claimable);
    boss.totalClaimedAda = (boss.totalClaimedAda || 0) + claimable;
    boss.claimableRewardAda = 0;

    // Savaştan sonra ordu serbest bırakılır
    boss.stakedArmyCount = Math.max(0, (boss.stakedArmyCount || 0) - soldiersCount);
    boss.totalStakedAtk = Math.max(0, (boss.totalStakedAtk || 0) - (boss.userStakedAtk || 0));
    boss.totalStakedHp = Math.max(0, (boss.totalStakedHp || 0) - (boss.userStakedHp || 0));
    boss.userStaked = false;
    boss.userStakedSoldiersCount = 0;
    boss.userStakedAtk = 0;
    boss.userStakedHp = 0;

    sound.playLevelUp();
    this.saveState();

    return {
      success: true,
      claimedAda: claimable,
      unlockedSoldiersCount: soldiersCount,
      newBalance: this.state.adAstraBalance,
      message: claimable > 0
        ? `🎁 ${claimable.toLocaleString()} ASTRA World Boss ödülü cüzdanına aktarıldı ve ordun serbest bırakıldı!`
        : `🛡️ ${soldiersCount} kişilik ordun serbest bırakıldı!`
    };
  },

  // Erken Çekilme (Emergency Unstake):
  // Pazar günü etkinlik tamamlanmadan önce ordu çekilirse, ordunun vereceği hasar üzerinden kazanacağı anlık tahmini
  // ASTRA miktarının %18'i (Savunma Duvarı bitince %12'si) ceza olarak ödenir ve ordu serbest bırakılır.
  emergencyUnstakeWorldBossArmy() {
    const boss = this.getWorldBossInfo();
    if (!boss.userStaked) {
      return { success: false, message: 'Kilitlenmiş bir ordunuz bulunmuyor!' };
    }

    const power = this.calculateUserWorldBossPower();
    const estimatedAda = power.estimatedAda || 0;
    const rate = this.getWorldBossEarlyUnstakeRate();
    const pct = Math.round(rate * 100);
    const penaltyAda = Math.max(1, Math.round(estimatedAda * rate));

    if (this.state.adAstraBalance < penaltyAda) {
      return {
        success: false,
        penaltyRequired: penaltyAda,
        message: `❌ Yetersiz bakiye! Ordunu erken çekmek için tahmini kazancının (%${pct}) cezası olan ${penaltyAda.toLocaleString()} ASTRA gerekiyor (Mevcut Bakiye: ${this.state.adAstraBalance.toLocaleString()} ASTRA).`
      };
    }

    // Cezayı tahsil et (harcama bölünüşü: yakım + UBI + telif + hazine)
    this.state.adAstraBalance -= penaltyAda;
    this._onAdaSpent(penaltyAda);
    globalPool.recordTokenSpend(penaltyAda);

    const soldiersCount = boss.userStakedSoldiersCount || 0;
    boss.stakedArmyCount = Math.max(0, (boss.stakedArmyCount || 0) - soldiersCount);
    boss.totalStakedAtk = Math.max(0, (boss.totalStakedAtk || 0) - (boss.userStakedAtk || 0));
    boss.totalStakedHp = Math.max(0, (boss.totalStakedHp || 0) - (boss.userStakedHp || 0));
    boss.userStaked = false;
    boss.userStakedSoldiersCount = 0;
    boss.userStakedAtk = 0;
    boss.userStakedHp = 0;
    boss.claimableRewardAda = 0;

    sound.playPickaxe();
    this.saveState();

    return {
      success: true,
      penaltyPaid: penaltyAda,
      unlockedSoldiersCount: soldiersCount,
      newBalance: this.state.adAstraBalance,
      message: `🔓 %${pct} Ceza (${penaltyAda.toLocaleString()} ASTRA) ödendi. ${soldiersCount} kişilik ordunun kilidi başarıyla açıldı!`
    };
  },
};
