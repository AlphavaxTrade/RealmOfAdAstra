// Realm of AdAstra — GameStateManager yöntemleri: Kolezyum 1v1 maçı
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { treasury } from '../treasury.js';
import { createUnit, simulateBattle } from '../combat.js';

export const kolezyumYontemleri = {
  // Kolezyum giriş koşulları (ekranda maç öncesi gösterilir; kurallar executeColosseum1v1Match ile aynı)
  getColosseumEntryStatus() {
    const cfg = GAME_CONFIG.COLOSSEUM;
    const counters = this.getDailyCounters();
    const used = counters.arenaMatches || 0;
    const keys = this.state.arenaKeys || 0;
    const stamina = Math.floor(this.state.stamina || 0);
    let blockReason = '';
    if (used >= cfg.DAILY_MATCH_CAP) blockReason = `Günlük maç hakkın doldu (${cfg.DAILY_MATCH_CAP}/${cfg.DAILY_MATCH_CAP})`;
    else if (keys < cfg.ENTRY_KEY_COST) blockReason = `${cfg.ENTRY_KEY_COST} Arena Anahtarı gerekli`;
    else if (stamina < cfg.ENTRY_STAMINA_COST) blockReason = `${cfg.ENTRY_STAMINA_COST} ⚡ stamina gerekli`;
    return { used, cap: cfg.DAILY_MATCH_CAP, keys, keyCost: cfg.ENTRY_KEY_COST, stamina, staminaCost: cfg.ENTRY_STAMINA_COST, blockReason };
  },

  executeColosseum1v1Match(championIndex = 0) {
    if (this.isArmyStakedInWorldBoss()) {
      return { success: false, message: '🔒 Ordun World Boss savaşına kilitlendiği için Kolezyum arenasına çıkamaz! Önce Savaş Alanından ordunun kilidini açmalısın.' };
    }

    const soldiers = this.state.soldierUnits || [];
    const champion = soldiers[championIndex];
    if (!champion) {
      return { success: false, message: 'Kolezyum arenasına çıkacak geçerli bir şampiyon askerin yok!' };
    }
    if (this.isSoldierPvpLocked(championIndex)) {
      return { success: false, message: '🔒 Bu asker gerçek rakiplere karşı maç arıyor. Önce sıradan çık.' };
    }

    if ((champion.hp || 0) <= 15) {
      return { success: false, message: `⚠️ ${champion.name} ağır yaralı (Can: ${champion.hp}/${champion.maxHp}). Kolezyuma çıkmadan önce buğdayla iyileştirilmelidir!` };
    }

    const cfg = GAME_CONFIG.COLOSSEUM;
    const counters = this.getDailyCounters();
    if (counters.arenaMatches >= cfg.DAILY_MATCH_CAP) {
      return { success: false, message: `⏳ Günlük arena hakkın doldu (${cfg.DAILY_MATCH_CAP}/${cfg.DAILY_MATCH_CAP}). Yarın tekrar gel.` };
    }
    if ((this.state.arenaKeys || 0) < cfg.ENTRY_KEY_COST) {
      return { success: false, message: `🔑 Arenaya çıkmak için ${cfg.ENTRY_KEY_COST} Arena Anahtarı gerekir! (Zindan boss'larından veya pazardan edinebilirsin.)` };
    }
    if ((this.state.stamina || 0) < cfg.ENTRY_STAMINA_COST) {
      return { success: false, message: `⚡ Yetersiz stamina! (${cfg.ENTRY_STAMINA_COST} gerekli)` };
    }

    this.state.arenaKeys -= cfg.ENTRY_KEY_COST;
    this.burnItem('keys', cfg.ENTRY_KEY_COST);
    this.state.stamina -= cfg.ENTRY_STAMINA_COST;
    counters.arenaMatches += 1;

    const stats = this.getSoldierFullStats(championIndex);
    const playerAtk = stats.totalAtk;
    const playerMaxHp = stats.totalMaxHp;

    const playerRating = this.state.colosseumStats?.rating || GAME_CONFIG.COLOSSEUM.STARTING_RATING;
    const tier = this.getColosseumTier(playerRating);

    // Sabit Lig Kademelerine Göre Kalibre Edilmiş Düşman Şampiyonu
    const oppBaseAtk = tier.id === 'champion' ? 180 : tier.id === 'diamond' ? 120 : tier.id === 'gold' ? 75 : tier.id === 'silver' ? 45 : 25;
    const oppBaseHp = tier.id === 'champion' ? 900 : tier.id === 'diamond' ? 600 : tier.id === 'gold' ? 350 : tier.id === 'silver' ? 200 : 100;

    const oppAtk = Math.max(15, Math.floor(oppBaseAtk * (0.85 + Math.random() * 0.3)));
    const oppMaxHp = Math.max(80, Math.floor(oppBaseHp * (0.85 + Math.random() * 0.3)));
    const oppRating = Math.round(tier.minRating + Math.random() * 150);

    const opponent = {
      name: `${tier.name} Rakibi`,
      icon: tier.id === 'champion' ? '👑' : tier.id === 'diamond' ? '💎' : tier.id === 'gold' ? '🥇' : tier.id === 'silver' ? '🥈' : '🥉',
      atk: oppAtk,
      hp: oppMaxHp,
      rating: oppRating
    };

    // combat.js createUnit ve simulateBattle simülasyonu
    const allyUnit = createUnit({
      uid: 'player_champ',
      name: champion.name,
      icon: champion.icon || '⚔️',
      maxHp: playerMaxHp,
      hp: champion.hp || playerMaxHp,
      atk: playerAtk,
      skills: champion.skills || ['shieldWall'],
      row: champion.row || 'front'
    });

    const enemyUnit = createUnit({
      uid: 'opp_champ',
      name: opponent.name,
      icon: opponent.icon,
      maxHp: oppMaxHp,
      hp: oppMaxHp,
      atk: oppAtk,
      skills: ['shieldWall', 'shockwave'],
      row: 'front',
      side: 'enemy'
    });

    const championStartHp = allyUnit.hp;
    const simRes = simulateBattle({
      allies: [allyUnit],
      enemies: [enemyUnit],
      seed: Date.now()
    });

    const isVictory = !!(simRes.victory || simRes.winner === 'ally');
    const finalPlayerHp = allyUnit.hp;
    // 🛡️ Askeri Koruma Kuralı (No Permadeath): Kolezyumda asker asla ölmez, 1 HP'de hayatta kalır
    champion.hp = Math.max(1, finalPlayerHp);
    const damageTaken = playerMaxHp - champion.hp;

    if (!this.state.colosseumStats) {
      this.state.colosseumStats = { wins: 0, losses: 0, score: 0, rank: 11, rating: GAME_CONFIG.COLOSSEUM.STARTING_RATING };
    }

    let rewardAda = 0;
    let budgetFull = false;
    let rewardKeys = 0;

    // 🏆 Gerçek ELO Formülü
    if (this.state.colosseumStats.rating == null) {
      this.state.colosseumStats.rating = GAME_CONFIG.COLOSSEUM.STARTING_RATING;
    }
    const expected = 1 / (1 + Math.pow(10, (oppRating - this.state.colosseumStats.rating) / 400));
    const ratingDelta = Math.round(GAME_CONFIG.COLOSSEUM.K_FACTOR * ((isVictory ? 1 : 0) - expected));
    this.state.colosseumStats.rating = Math.max(0, this.state.colosseumStats.rating + ratingDelta);

    if (isVictory) {
      this.state.colosseumStats.wins += 1;
      this.state.colosseumStats.score += 3;

      // Hazine Arena Kasasından Ödül — v1.25: ödül kasadan gerçekten çekilir (eskiden kasadan düşülmeden
      // bakiyeye ekleniyordu; kolezyum her zaferde yoktan ASTRA basıyordu)
      const arenaPool = (typeof treasury !== 'undefined' && treasury.getPool) ? treasury.getPool('arena') : 0;
      const baseReward = Math.min(this.adaPrice(2500), Math.round(arenaPool * 0.0002));
      const requested = Math.round(baseReward * tier.rewardMult);
      const draw = (typeof treasury !== 'undefined' && treasury.withdraw) ? treasury.withdrawWhole('arena', requested) : { granted: 0 };
      rewardAda = draw.granted || 0;
      budgetFull = !!draw.budgetFull;
      this.state.adAstraBalance = (this.state.adAstraBalance || 0) + rewardAda;
      this._onAdaEarned(rewardAda);
      if (this.state.colosseumStats) this.state.colosseumStats.totalAdaWon = (this.state.colosseumStats.totalAdaWon || 0) + rewardAda;

      if (Math.random() < 0.25) {
        rewardKeys = 1;
        this.state.arenaKeys = (this.state.arenaKeys || 0) + 1;
      }
    } else {
      this.state.colosseumStats.losses += 1;
      this.state.colosseumStats.score = Math.max(0, this.state.colosseumStats.score - 1);
    }

    this.saveState();

    const combatLog = simRes.log.map(l => l.text || `${l.actor} -> ${l.target} (${l.amount || ''} hasar)`).filter(Boolean);

    return {
      success: true,
      isVictory,
      championName: champion.name,
      opponentName: opponent.name,
      opponentIcon: opponent.icon,
      opponentAtk: opponent.atk,
      opponentHp: opponent.hp,
      damageTaken,
      currentHp: champion.hp,
      maxHp: champion.maxHp,
      // Arena gerçek savaşı oynatsın diye: kayıt ve birim kimlikleri (önceden arena kendi rastgele savaşını
      // oynatıyordu; ekrandaki sonuç ödül ve ELO ile çelişebiliyor, şampiyonun canını da eziyordu)
      replay: simRes,
      championStartHp,
      championMaxHp: playerMaxHp,
      allyUid: 'player_champ',
      enemyUid: 'opp_champ',
      rewardAda,
      budgetFull,
      rewardKeys,
      ratingDelta,
      newRating: this.state.colosseumStats.rating,
      combatLog,
      colosseumStats: this.state.colosseumStats,
      tier
    };
  },
};
