// Realm of AdAstra — GameStateManager yöntemleri: Kolezyum 1v1 maçı (hazır rakiplere karşı)
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js). Gerçek rakiplere karşı eşleşme
// ayrı çalışır: server/arena.js + js/economy/pvp.js.
import { GAME_CONFIG } from '../config.js';
import { treasury } from '../treasury.js';
import { globalPool } from '../globalPool.js';
import { createUnit, simulateBattle } from '../combat.js';
import { getDungeonEntry } from '../bestiary.js';
import { PVP_RULES } from '../economy/pvp.js';
import { cleanName } from './ortak.js';

// Lig kademesine göre kalibre edilmiş hazır rakip: [saldırı, can, simge]
const RAKIP_TABLOSU = {
  champion: { atk: 180, hp: 900, icon: '👑' },
  diamond: { atk: 120, hp: 600, icon: '💎' },
  gold: { atk: 75, hp: 350, icon: '🥇' },
  silver: { atk: 45, hp: 200, icon: '🥈' },
  bronze: { atk: 25, hp: 100, icon: '🥉' }
};

export const kolezyumYontemleri = {
  // Giriş ücreti (ASTRA, oyun içi fiyat çarpanıyla)
  getColosseumEntryFee() {
    return this.adaPrice(GAME_CONFIG.COLOSSEUM.ENTRY_FEE_ASTRA || 0);
  },

  // Ücreti dağıtır: arena payı doğrudan arena kasasına (ödüller buradan çıkar), kalanı her harcama gibi (yakım, yapımcı payı, temel
  // gelir, öteki kasalar). Bakiyeden düşme çağıranın işidir (Gerçek rakip sırasında ücret maç bulunana kadar emanette bekler).
  settleColosseumFee(ucret) {
    const miktar = Number(ucret) || 0;
    if (miktar <= 0) return;
    const pay = Math.max(0, Math.min(1, GAME_CONFIG.COLOSSEUM.ENTRY_ARENA_SHARE ?? 0.7));
    this._onAdaSpent(miktar);
    if (pay > 0 && treasury.depositTo) treasury.depositTo('arena', miktar * pay);
    globalPool.recordTokenSpend(miktar * (1 - pay));
  },

  // Giriş koşulları (ekranda maç öncesi gösterilir; kurallar executeColosseum1v1Match ile aynı)
  getColosseumEntryStatus() {
    const cfg = GAME_CONFIG.COLOSSEUM;
    const kullanilan = this.getDailyCounters().arenaMatches || 0;
    const ucret = this.getColosseumEntryFee();
    const bakiye = this.state.adAstraBalance || 0;
    const stamina = Math.floor(this.state.stamina || 0);

    let engel = '';
    if (kullanilan >= cfg.DAILY_MATCH_CAP) engel = `Günlük maç hakkın doldu (${cfg.DAILY_MATCH_CAP}/${cfg.DAILY_MATCH_CAP})`;
    else if (bakiye < ucret) engel = `${Math.round(ucret * 100) / 100} ASTRA giriş ücreti gerekli`;
    else if (stamina < cfg.ENTRY_STAMINA_COST) engel = `${cfg.ENTRY_STAMINA_COST} ⚡ stamina gerekli`;
    return {
      used: kullanilan, cap: cfg.DAILY_MATCH_CAP,
      fee: ucret, balance: bakiye,
      stamina, staminaCost: cfg.ENTRY_STAMINA_COST,
      // Günlük ASTRA ödül tavanı (kişi başı): arayüz "bugünkü tavan X / Y" göstersin (denetim 2. tur)
      rewardCap: cfg.DAILY_REWARD_CAP_ASTRA ?? null,
      rewardUsed: Number(this.getDailyCounters().arenaAda) || 0,
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
    const ucret = this.getColosseumEntryFee();
    if ((this.state.adAstraBalance || 0) < ucret) {
      return { success: false, message: `💰 Arenaya çıkmak için ${Math.round(ucret * 100) / 100} ASTRA giriş ücreti gerekir!` };
    }
    if ((this.state.stamina || 0) < cfg.ENTRY_STAMINA_COST) {
      return { success: false, message: `⚡ Yetersiz stamina! (${cfg.ENTRY_STAMINA_COST} gerekli)` };
    }

    this.state.adAstraBalance -= ucret;
    this.settleColosseumFee(ucret);
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
    // Rakip puanı oyuncunun puanının ±RATING_SPREAD'i kadar (13 Ekim 2026 EK-06): eskiden kademenin tabanı + 0-150 idi, oyuncu
    // 1000'deyken rakip 0-150 çıkıyor, beklenen sonuç %99 olduğu için zaferle puan hiç artmıyordu.
    const yayilim = cfg.RATING_SPREAD ?? 100;
    const rakipPuani = Math.max(0, Math.round(puan + (Math.random() * 2 - 1) * yayilim));
    const rakip = { name: `${kademe.name} Rakibi`, icon: taslak.icon, atk: rakipAtk, hp: rakipHp, rating: rakipPuani };

    const muttefik = createUnit({
      uid: 'player_champ',
      name: sampiyon.name,
      icon: sampiyon.icon || '⚔️',
      maxHp: oyuncuMaxHp,
      hp: this.getSoldierBattleStart(championIndex).hp,   // kayıtlı can oranı toplam cana uygulanır
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
    const savasSonuCani = Math.max(1, muttefik.hp);
    this.setSoldierHpFromBattle(championIndex, savasSonuCani);
    const alinanHasar = oyuncuMaxHp - savasSonuCani;

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
    let kisiKisti = false;
    if (zafer) {
      stats.wins += 1;
      stats.score += 3;

      // Ödül arena kasasından gerçekten çekilir (basılmaz); kademenin çarpanıyla
      // Ödül ASTRA olarak SABİTTİR (KARARLAR_KESIN B: fiyat çarpanı yalnız bedellere uygulanır; eskiden adaPrice ile çarpılıyordu),
      // lig çarpanıyla artar, günlük kişi tavanını (DAILY_REWARD_CAP_ASTRA) ve haftalık kişi payını aşamaz.
      const kasa = treasury.getPool('arena');
      const taban = Math.min(cfg.WIN_REWARD_ASTRA, Math.round(kasa * cfg.WIN_REWARD_POOL_SHARE));
      const gunlukKalan = Math.max(0, (cfg.DAILY_REWARD_CAP_ASTRA ?? Infinity) - (Number(sayaclar.arenaAda) || 0));
      const istenen = Math.min(Math.round(taban * kademe.rewardMult), Math.floor(gunlukKalan));
      const cekim = istenen > 0 ? this._kasaCekKisiTam('arena', istenen) : { granted: 0, budgetFull: false };
      odul = cekim.granted || 0;
      if (odul > 0) sayaclar.arenaAda = (Number(sayaclar.arenaAda) || 0) + odul;
      butceDoldu = !!cekim.budgetFull;
      kisiKisti = !!cekim.personCapped;
      this.state.adAstraBalance = (this.state.adAstraBalance || 0) + odul;
      this._onAdaEarned(odul);
      stats.totalAdaWon = (stats.totalAdaWon || 0) + odul;
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
      personCapped: kisiKisti,
      ratingDelta: puanFarki,
      newRating: stats.rating,
      combatLog: savas.log.map(l => l.text || `${l.actor} -> ${l.target} (${l.amount || ''} hasar)`).filter(Boolean),
      colosseumStats: this.state.colosseumStats,
      tier: kademe
    };
  },

  // ── Gerçek rakipler (PvP): oyuncunun kendi kısmı; eşleşme ve maç sunucuda (server/arena.js) ──
  isSoldierPvpLocked(idx) {
    const kuyruk = this.state.pvpQueue;
    return !!(kuyruk && Array.isArray(kuyruk.indices) && kuyruk.indices.includes(Number(idx)));
  },

  // Maça çıkacak takımın görüntüsü (tam canla; maç askerin canını azaltmaz)
  buildPvpTeam(mode, selectedIndices) {
    const kural = PVP_RULES.modes[mode];
    if (!kural) return { success: false, message: 'Geçersiz maç türü.' };
    if (this.state.pvpQueue) return { success: false, message: 'Zaten maç arıyorsun.' };
    if (this.isArmyStakedInWorldBoss()) return { success: false, message: '🔒 Ordun World Boss savaşına kilitli. Önce kilidi aç.' };
    const askerler = this.state.soldierUnits || [];
    const sira = [...new Set((Array.isArray(selectedIndices) ? selectedIndices : []).map(Number))].filter((i) => Number.isInteger(i) && askerler[i]);
    if (sira.length !== kural.size) return { success: false, message: `${mode} maçı için ${kural.size} asker seçmelisin.` };
    const birimler = this.buildDungeonBattleUnits(getDungeonEntry(1), sira).allies.map((u) => ({ ...u, hp: u.maxHp, name: cleanName(u.name) || 'Asker' }));
    return { success: true, mode, indices: sira, units: JSON.parse(JSON.stringify(birimler)), name: cleanName(askerler[sira[0]].name) || 'Asker' };
  },

  // Giriş bedeli: hazır rakip maçıyla aynı (ASTRA ücreti + stamina + günlük hak). Ücret bakiyeden düşer ama maç bulunana kadar EMANETTE
  // bekler (dağıtım settleColosseumFee ile maç bulununca yapılır); sıradan çıkılırsa tamamı iade edilir.
  payPvpEntry() {
    const durum = this.getColosseumEntryStatus();
    if (durum.blockReason) return { success: false, message: '⛔ ' + durum.blockReason };
    const cfg = GAME_CONFIG.COLOSSEUM;
    this.state.adAstraBalance -= durum.fee;
    this.state.stamina -= cfg.ENTRY_STAMINA_COST;
    this.getDailyCounters().arenaMatches += 1;
    return { success: true, fee: durum.fee };
  },

  // Sıradan çıkınca bedel iade edilir (sıraya ücretle girmiş oyuncuya ASTRA; eski kayıtta anahtarla girmiş olana 1 anahtar)
  refundPvpEntry() {
    const cfg = GAME_CONFIG.COLOSSEUM;
    const kuyruk = this.state.pvpQueue;
    if (kuyruk && kuyruk.fee != null) {
      this.state.adAstraBalance = (this.state.adAstraBalance || 0) + (Number(kuyruk.fee) || 0);
    } else {
      this.state.arenaKeys = (this.state.arenaKeys || 0) + 1;
      this.burnItem('keys', -1);
    }
    this.state.stamina = Math.min(this.getMaxStamina(), (this.state.stamina || 0) + cfg.ENTRY_STAMINA_COST);
    const sayac = this.getDailyCounters();
    sayac.arenaMatches = Math.max(0, (sayac.arenaMatches || 0) - 1);
  }
};
