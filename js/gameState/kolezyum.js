// Realm of AdAstra — GameStateManager yöntemleri: Kolezyum 1v1 maçı (hazır rakiplere karşı)
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js). Gerçek rakiplere karşı eşleşme
// ayrı çalışır: server/arena.js + js/economy/pvp.js.
import { GAME_CONFIG } from '../config.js';
import { treasury } from '../treasury.js';
import { createUnit, simulateBattle } from '../combat.js';

// Lig kademesine göre kalibre edilmiş hazır rakip: [saldırı, can, simge]
const RAKIP_TABLOSU = {
  champion: { atk: 180, hp: 900, icon: '👑' },
  diamond: { atk: 120, hp: 600, icon: '💎' },
  gold: { atk: 75, hp: 350, icon: '🥇' },
  silver: { atk: 45, hp: 200, icon: '🥈' },
  bronze: { atk: 25, hp: 100, icon: '🥉' }
};

export const kolezyumYontemleri = {
  // Giriş koşulları (ekranda maç öncesi gösterilir; kurallar executeColosseum1v1Match ile aynı)
  getColosseumEntryStatus() {
    const cfg = GAME_CONFIG.COLOSSEUM;
    const kullanilan = this.getDailyCounters().arenaMatches || 0;
    const anahtar = this.state.arenaKeys || 0;
    const stamina = Math.floor(this.state.stamina || 0);

    let engel = '';
    if (kullanilan >= cfg.DAILY_MATCH_CAP) engel = `Günlük maç hakkın doldu (${cfg.DAILY_MATCH_CAP}/${cfg.DAILY_MATCH_CAP})`;
    else if (anahtar < cfg.ENTRY_KEY_COST) engel = `${cfg.ENTRY_KEY_COST} Arena Anahtarı gerekli`;
    else if (stamina < cfg.ENTRY_STAMINA_COST) engel = `${cfg.ENTRY_STAMINA_COST} ⚡ stamina gerekli`;
    return {
      used: kullanilan, cap: cfg.DAILY_MATCH_CAP,
      keys: anahtar, keyCost: cfg.ENTRY_KEY_COST,
      stamina, staminaCost: cfg.ENTRY_STAMINA_COST,
      blockReason: engel
    };
  },

  // Seçilen askerle, puanına uygun kademeden hazır bir rakibe karşı tek maç.
  // Asker ölmez (en az 1 can kalır); ELO puanı değişir; zaferde ödül arena kasasından çekilir.
  executeColosseum1v1Match(championIndex = 0) {
    if (this.isArmyStakedInWorldBoss()) {
      return { success: false, message: '🔒 Ordun World Boss savaşına kilitlendiği için Kolezyum arenasına çıkamaz! Önce Savaş Alanından ordunun kilidini açmalısın.' };
    }

    const sampiyon = (this.state.soldierUnits || [])[championIndex];
    if (!sampiyon) {
      return { success: false, message: 'Kolezyum arenasına çıkacak geçerli bir şampiyon askerin yok!' };
    }
    if (this.isSoldierPvpLocked(championIndex)) {
      return { success: false, message: '🔒 Bu asker gerçek rakiplere karşı maç arıyor. Önce sıradan çık.' };
    }
    if ((sampiyon.hp || 0) <= 15) {
      return { success: false, message: `⚠️ ${sampiyon.name} ağır yaralı (Can: ${sampiyon.hp}/${sampiyon.maxHp}). Kolezyuma çıkmadan önce buğdayla iyileştirilmelidir!` };
    }

    const cfg = GAME_CONFIG.COLOSSEUM;
    const sayaclar = this.getDailyCounters();
    if (sayaclar.arenaMatches >= cfg.DAILY_MATCH_CAP) {
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
    sayaclar.arenaMatches += 1;

    const istatistik = this.getSoldierFullStats(championIndex);
    const oyuncuAtk = istatistik.totalAtk;
    const oyuncuMaxHp = istatistik.totalMaxHp;

    // Rakip: oyuncunun lig kademesine göre, ±%15 oynayan değerlerle
    const puan = this.state.colosseumStats?.rating || cfg.STARTING_RATING;
    const kademe = this.getColosseumTier(puan);
    const taslak = RAKIP_TABLOSU[kademe.id] || RAKIP_TABLOSU.bronze;
    const rakipAtk = Math.max(15, Math.floor(taslak.atk * (0.85 + Math.random() * 0.3)));
    const rakipHp = Math.max(80, Math.floor(taslak.hp * (0.85 + Math.random() * 0.3)));
    const rakipPuani = Math.round(kademe.minRating + Math.random() * 150);
    const rakip = { name: `${kademe.name} Rakibi`, icon: taslak.icon, atk: rakipAtk, hp: rakipHp, rating: rakipPuani };

    const muttefik = createUnit({
      uid: 'player_champ',
      name: sampiyon.name,
      icon: sampiyon.icon || '⚔️',
      maxHp: oyuncuMaxHp,
      hp: sampiyon.hp || oyuncuMaxHp,
      atk: oyuncuAtk,
      skills: sampiyon.skills || ['shieldWall'],
      row: sampiyon.row || 'front'
    });
    const dusman = createUnit({
      uid: 'opp_champ',
      name: rakip.name,
      icon: rakip.icon,
      maxHp: rakipHp,
      hp: rakipHp,
      atk: rakipAtk,
      skills: ['shieldWall', 'shockwave'],   // düşman tarafı canavar yeteneği (abilities) kullanır; bu liste etkisizdir
      row: 'front',
      side: 'enemy'
    });

    const baslangicHp = muttefik.hp;
    const savas = simulateBattle({ allies: [muttefik], enemies: [dusman], seed: Date.now() });
    const zafer = !!(savas.victory || savas.winner === 'ally');

    // Asker kolezyumda ölmez: en az 1 canla kalır
    sampiyon.hp = Math.max(1, muttefik.hp);
    const alinanHasar = oyuncuMaxHp - sampiyon.hp;

    if (!this.state.colosseumStats) {
      this.state.colosseumStats = { wins: 0, losses: 0, score: 0, rank: 11, rating: cfg.STARTING_RATING };
    }
    const stats = this.state.colosseumStats;
    if (stats.rating == null) stats.rating = cfg.STARTING_RATING;

    // ELO: beklenen sonuç rakip puanına göre
    const beklenen = 1 / (1 + Math.pow(10, (rakipPuani - stats.rating) / 400));
    const puanFarki = Math.round(cfg.K_FACTOR * ((zafer ? 1 : 0) - beklenen));
    stats.rating = Math.max(0, stats.rating + puanFarki);

    let odul = 0;
    let butceDoldu = false;
    let odulAnahtar = 0;
    if (zafer) {
      stats.wins += 1;
      stats.score += 3;

      // Ödül arena kasasından gerçekten çekilir (basılmaz); kademenin çarpanıyla
      const kasa = treasury.getPool('arena');
      const taban = Math.min(this.adaPrice(2500), Math.round(kasa * 0.0002));
      const cekim = treasury.withdrawWhole('arena', Math.round(taban * kademe.rewardMult));
      odul = cekim.granted || 0;
      butceDoldu = !!cekim.budgetFull;
      this.state.adAstraBalance = (this.state.adAstraBalance || 0) + odul;
      this._onAdaEarned(odul);
      stats.totalAdaWon = (stats.totalAdaWon || 0) + odul;

      if (Math.random() < 0.25) {
        odulAnahtar = 1;
        this.state.arenaKeys = (this.state.arenaKeys || 0) + 1;
      }
    } else {
      stats.losses += 1;
      stats.score = Math.max(0, stats.score - 1);
    }

    this.saveState();

    return {
      success: true,
      isVictory: zafer,
      championName: sampiyon.name,
      opponentName: rakip.name,
      opponentIcon: rakip.icon,
      opponentAtk: rakip.atk,
      opponentHp: rakip.hp,
      damageTaken: alinanHasar,
      currentHp: sampiyon.hp,
      maxHp: sampiyon.maxHp,
      // Arena gerçek savaşı oynatsın: ekrandaki sonuç ödül ve puanla çelişmesin
      replay: savas,
      championStartHp: baslangicHp,
      championMaxHp: oyuncuMaxHp,
      allyUid: 'player_champ',
      enemyUid: 'opp_champ',
      rewardAda: odul,
      budgetFull: butceDoldu,
      rewardKeys: odulAnahtar,
      ratingDelta: puanFarki,
      newRating: stats.rating,
      combatLog: savas.log.map(l => l.text || `${l.actor} -> ${l.target} (${l.amount || ''} hasar)`).filter(Boolean),
      colosseumStats: this.state.colosseumStats,
      tier: kademe
    };
  }
};
