// Realm of AdAstra — GameStateManager yöntemleri: Dünya Bossu (bilgi, ordu kilitleme, haftalık savaş, ödül)
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
//
// Akış: oyuncu ordusunu kilitler (stake) → Pazar 18:00 TSİ'de tek seferlik otomatik savaş hasarı ve payı hesaplar
// → ödül hazinenin worldBoss kasasından çekilir (basılmaz) ve talep edilebilir bakiyeye yazılır → oyuncu talep eder.
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { sound } from '../audio.js';
import { treasury } from '../treasury.js';

const HAFTA_MS = 7 * 24 * 3600 * 1000;
const KASA_YEDEK = 8000000;   // kasa okunamazsa gösterim için varsayılan haftalık havuz

// Oyuncunun kilitlediği orduyu dünya toplamından düşer ve oyuncunun kilit alanlarını sıfırlar
function kilidiBirak(boss) {
  const asker = boss.userStakedSoldiersCount || 0;
  boss.stakedArmyCount = Math.max(0, (boss.stakedArmyCount || 0) - asker);
  boss.totalStakedAtk = Math.max(0, (boss.totalStakedAtk || 0) - (boss.userStakedAtk || 0));
  boss.totalStakedHp = Math.max(0, (boss.totalStakedHp || 0) - (boss.userStakedHp || 0));
  boss.userStaked = false;
  boss.userStakedSoldiersCount = 0;
  boss.userStakedAtk = 0;
  boss.userStakedHp = 0;
  return asker;
}

export const dunyaBossuYontemleri = {
  getWorldBossInfo() {
    if (!this.state.worldBoss) {
      this.state.worldBoss = {
        name: 'Kadim Kıyamet Behemoth\'u (WORLD BOSS)',
        icon: '🌋',
        weeklyAdaPool: Math.round(treasury.getPool('worldBoss')),
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
      const boss = this.state.worldBoss;
      boss.weeklyAdaPool = Math.round(treasury.getPool('worldBoss')) || KASA_YEDEK;
      if (!boss.userStaked) {
        boss.stakedArmyCount = 0;
        boss.totalStakedAtk = 0;
        boss.totalStakedHp = 0;
      }
      if (boss.claimableRewardAda == null) boss.claimableRewardAda = 0;
    }
    return this.state.worldBoss;
  },

  // Erken çekilme cezası oranı: taban (%18) + biten Konsey projelerinin etkisi (Savunma Duvarı bitince %12).
  // Bonus ortak dünya durumundan okunur: projeyi bitiren herkes için geçerlidir, sunucuda da aynı çalışır.
  getWorldBossEarlyUnstakeRate() {
    const taban = GAME_CONFIG.WORLD_BOSS.EARLY_UNSTAKE_PENALTY ?? 0.18;
    const bonus = globalPool.getProjectBonus ? globalPool.getProjectBonus('bossPenaltyPoints') : 0;
    return Math.max(0, Math.round((taban + bonus) * 10000) / 10000);   // 0,18 − 0,06 tam 0,12 çıksın (kayan nokta)
  },

  // Kilitli ordunun savaştaki hasar gücü: 1 ATK = 1, 1 HP = 0,25; yetenek çeşitliliği bonusuyla (en fazla +%50)
  calculateUserWorldBossPower() {
    const boss = this.getWorldBossInfo();
    const atk = boss.userStakedAtk || 0;
    const hp = boss.userStakedHp || 0;
    const tabanHasar = Math.floor((atk * 1.0) + (hp * 0.25));

    const cesitlilik = this.calculateSquadSkillDiversity();
    const hasar = Math.floor(tabanHasar * cesitlilik.diversityMultiplier);
    return {
      atk,
      hp,
      atkContribution: Math.floor(atk * 1.0),
      hpContribution: Math.floor(hp * 0.25),
      baseDamage: tabanHasar,
      calculatedDamage: hasar,
      estimatedAda: Math.floor((hasar * boss.weeklyAdaPool) / boss.maxBossHp),
      earlyUnstakePenaltyRate: this.getWorldBossEarlyUnstakeRate(),
      diversityMultiplier: cesitlilik.diversityMultiplier,
      uniqueRoles: cesitlilik.uniqueRoles,
      rolesFound: cesitlilik.rolesFound
    };
  },

  isArmyStakedInWorldBoss() {
    return !!(this.state.worldBoss && this.state.worldBoss.userStaked);
  },

  // Bütün ordu savaşa kilitlenir; daha önce kilitliyse eski kilidin payı dünya toplamından düşülüp yeniden eklenir
  stakeArmyForWorldBoss() {
    const asker = this.state.soldierUnits || [];
    if (asker.length === 0) {
      return { success: false, message: 'World Boss savaşına kilitlemek için ordunuzda asker bulunmalıdır!' };
    }
    if (this.state.pvpQueue) {
      return { success: false, message: '🔒 Askerlerinden biri Kolezyumda maç arıyor. Önce sıradan çık.' };
    }

    let atk = 0;
    let hp = 0;
    for (let i = 0; i < asker.length; i++) {
      const istatistik = this.getSoldierFullStats(i);
      atk += istatistik.totalAtk;
      hp += istatistik.totalMaxHp;
    }

    const boss = this.getWorldBossInfo();
    if (boss.userStaked) kilidiBirak(boss);
    boss.userStaked = true;
    boss.userStakedSoldiersCount = asker.length;
    boss.userStakedAtk = atk;
    boss.userStakedHp = hp;
    boss.stakedArmyCount = (boss.stakedArmyCount || 0) + asker.length;
    boss.totalStakedAtk = (boss.totalStakedAtk || 0) + atk;
    boss.totalStakedHp = (boss.totalStakedHp || 0) + hp;

    const guc = this.calculateUserWorldBossPower();
    sound.playLevelUp();
    this.saveState();

    return {
      success: true,
      message: `🛡️ ${asker.length} kişilik ordun (${atk} ATK + ${hp} HP ➔ ${guc.calculatedDamage.toLocaleString()} Hasar Gücü) Pazar 18:00 TSİ otomatik World Boss savaşı için başarıyla kilitlendi!`,
      boss,
      power: guc
    };
  },

  // Savaş takvimi: her Pazar 15:00 UTC (= 18:00 TSİ). En son geçen ve bir sonraki savaş anı.
  getWorldBossSchedule(simdi = Date.now()) {
    const cfg = GAME_CONFIG.WORLD_BOSS;
    const d = new Date(simdi);
    const buPazar = new Date(d);
    buPazar.setUTCDate(d.getUTCDate() - d.getUTCDay() + cfg.BATTLE_DAY_UTC);
    buPazar.setUTCHours(cfg.BATTLE_HOUR_UTC, 0, 0, 0);
    let sonSavas = buPazar.getTime();
    if (sonSavas > simdi) sonSavas -= HAFTA_MS;
    const sonraki = sonSavas + HAFTA_MS;
    return { lastBattleTime: sonSavas, nextBattleTime: sonraki, msUntilNext: sonraki - simdi };
  },

  // Her Pazar 18:00 TSİ'de TEK SEFERLİK otomatik savaş; haftada bir kez çalışır (force yalnız sunucu zamanlayıcısı için).
  // Ödül hazinenin worldBoss kasasından çekilir: YASA 1, ödül basılmaz.
  executeSundayAutoWorldBossBattle({ force = false } = {}) {
    const boss = this.getWorldBossInfo();
    if (!boss.userStaked) {
      return { success: false, message: 'Kilitli ordunuz bulunmadığı için bu haftaki savaşa dahil olunamadı.' };
    }

    const takvim = this.getWorldBossSchedule();
    if (!force && (boss.lastBattleTimestamp || 0) >= takvim.lastBattleTime) {
      const saat = Math.floor(takvim.msUntilNext / 3600000);
      const dakika = Math.floor((takvim.msUntilNext % 3600000) / 60000);
      return {
        success: false,
        alreadyFought: true,
        message: `⏳ Bu haftanın World Boss savaşı çoktan gerçekleşti. Sonraki savaşa ${saat} saat ${dakika} dakika kaldı (Pazar 18:00 TSİ).`
      };
    }

    const hasar = this.calculateUserWorldBossPower().calculatedDamage;
    boss.userDamage = hasar;   // haftalık, birikmez
    boss.bossHp = Math.max(0, boss.bossHp - hasar);

    const istenen = Math.max(1, Math.floor((hasar * boss.weeklyAdaPool) / boss.maxBossHp));
    const cekim = globalPool.withdrawReward('worldBoss', istenen);
    const odul = cekim.granted;

    boss.claimableRewardAda = (boss.claimableRewardAda || 0) + odul;
    boss.lastBattleTimestamp = Date.now();
    boss.userStaked = false;   // ordu kilidi savaştan sonra açılır

    sound.playLevelUp();
    this.saveState();

    const oranlandi = cekim.scaleFactor < 0.999;
    const dipnot = cekim.budgetFull
      ? ` ⏳ ${GAME_CONFIG.TREASURY_WEEKLY_BUDGET.FULL_MESSAGE}`
      : (oranlandi ? ' (Havuz doluluğu nedeniyle ödül oranlandı.)' : '');
    return {
      success: true,
      damageDealt: hasar,
      rewardAda: odul,
      requested: istenen,
      scaled: oranlandi,
      budgetFull: !!cekim.budgetFull,
      claimableRewardAda: boss.claimableRewardAda,
      message: `💥 Pazar 18:00 TSİ World Boss savaşı tamamlandı! Ordun ${hasar.toLocaleString()} hasar vurdu ve ${odul.toLocaleString()} ASTRA kazandı.${dipnot}`
    };
  },

  // Savaş ödülünü bakiyeye alır ve orduyu serbest bırakır
  claimWorldBossReward() {
    const boss = this.getWorldBossInfo();
    const talepEdilebilir = boss.claimableRewardAda || 0;
    if (talepEdilebilir <= 0 && !boss.userStaked) {
      return { success: false, message: 'Toplanacak World Boss ödülü bulunmuyor!' };
    }

    this.state.adAstraBalance += talepEdilebilir;
    this._onAdaEarned(talepEdilebilir);
    boss.totalClaimedAda = (boss.totalClaimedAda || 0) + talepEdilebilir;
    boss.claimableRewardAda = 0;
    const serbest = kilidiBirak(boss);

    sound.playLevelUp();
    this.saveState();

    return {
      success: true,
      claimedAda: talepEdilebilir,
      unlockedSoldiersCount: serbest,
      newBalance: this.state.adAstraBalance,
      message: talepEdilebilir > 0
        ? `🎁 ${talepEdilebilir.toLocaleString()} ASTRA World Boss ödülü cüzdanına aktarıldı ve ordun serbest bırakıldı!`
        : `🛡️ ${serbest} kişilik ordun serbest bırakıldı!`
    };
  },

  // Erken çekilme: Pazar savaşından önce ordu geri alınırsa tahmini kazancın %18'i (Savunma Duvarı bitince %12'si)
  // ceza olarak ödenir ve ordu serbest bırakılır.
  emergencyUnstakeWorldBossArmy() {
    const boss = this.getWorldBossInfo();
    if (!boss.userStaked) {
      return { success: false, message: 'Kilitlenmiş bir ordunuz bulunmuyor!' };
    }

    const tahmin = this.calculateUserWorldBossPower().estimatedAda || 0;
    const oran = this.getWorldBossEarlyUnstakeRate();
    const yuzde = Math.round(oran * 100);
    const ceza = Math.max(1, Math.round(tahmin * oran));

    if (this.state.adAstraBalance < ceza) {
      return {
        success: false,
        penaltyRequired: ceza,
        message: `❌ Yetersiz bakiye! Ordunu erken çekmek için tahmini kazancının (%${yuzde}) cezası olan ${ceza.toLocaleString()} ASTRA gerekiyor (Mevcut Bakiye: ${this.state.adAstraBalance.toLocaleString()} ASTRA).`
      };
    }

    // Ceza harcama gibi bölünür: yakım + UBI + telif + hazine
    this.state.adAstraBalance -= ceza;
    this._onAdaSpent(ceza);
    globalPool.recordTokenSpend(ceza);

    // Önceki savaştan kalan talep edilebilir ödüle dokunulmaz: o ASTRA kasadan çoktan çekildi, oyuncunundur
    const serbest = kilidiBirak(boss);

    sound.playPickaxe();
    this.saveState();

    return {
      success: true,
      penaltyPaid: ceza,
      unlockedSoldiersCount: serbest,
      newBalance: this.state.adAstraBalance,
      message: `🔓 %${yuzde} Ceza (${ceza.toLocaleString()} ASTRA) ödendi. ${serbest} kişilik ordunun kilidi başarıyla açıldı!`
    };
  }
};
