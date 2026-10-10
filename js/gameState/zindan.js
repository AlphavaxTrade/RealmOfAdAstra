// Realm of AdAstra — GameStateManager yöntemleri: Günlük sayaçlar, zindan girişi/savaşı/yıpranma, PvP giriş bedeli
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { treasury } from '../treasury.js';
import { simulateBattle } from '../combat.js';
import { getDungeonEntry } from '../bestiary.js';
import { PVP_RULES } from '../economy/pvp.js';
import { cleanName, round3 } from './ortak.js';

export const zindanYontemleri = {
  // =========================================================================
  // KOLEZYUM ARENA LİGİ & HAFTALIK LİDERLİK TABLOSU (ASENKRON BOT LİGİ)
  // =========================================================================
  getColosseumLeaderboard() {
    if (!this.state.colosseumLeaderboard) {
      this.state.colosseumLeaderboard = [
        { rank: 1, name: 'Gladyatör Botu #1 (Leonidas)', score: 48, wins: 48, losses: 2, icon: '🦁', title: 'Şampiyon Bot', rewardKeys: 5, rewardAda: 15000, isBot: true },
        { rank: 2, name: 'Gladyatör Botu #2 (Selin)', score: 42, wins: 42, losses: 5, icon: '⚔️', title: 'Elmas Bot', rewardKeys: 3, rewardAda: 8000, isBot: true },
        { rank: 3, name: 'Gladyatör Botu #3 (Eren)', score: 38, wins: 38, losses: 7, icon: '🗡️', title: 'Altın Bot', rewardKeys: 1, rewardAda: 2500, isBot: true },
        { rank: 4, name: 'Gladyatör Botu #4 (Barok)', score: 35, wins: 35, losses: 8, icon: '🗿', title: 'Taş Muhafız', rewardKeys: 1, rewardAda: 2500, isBot: true },
        { rank: 5, name: 'Gladyatör Botu #5 (Zafira)', score: 31, wins: 31, losses: 9, icon: '🧙‍♀️', title: 'Gümüş Bot', rewardKeys: 1, rewardAda: 2500, isBot: true },
        { rank: 6, name: 'Gladyatör Botu #6 (Kaan)', score: 28, wins: 28, losses: 10, icon: '🏹', title: 'Gümüş Bot', rewardKeys: 1, rewardAda: 2500, isBot: true },
        { rank: 7, name: 'Gladyatör Botu #7 (Drake)', score: 25, wins: 25, losses: 12, icon: '🏴‍☠️', title: 'Bronz Bot', rewardKeys: 1, rewardAda: 2500, isBot: true },
        { rank: 8, name: 'Gladyatör Botu #8 (Alperen)', score: 22, wins: 22, losses: 13, icon: '🐉', title: 'Bronz Bot', rewardKeys: 1, rewardAda: 2500, isBot: true },
        { rank: 9, name: 'Gladyatör Botu #9 (Galahad)', score: 19, wins: 19, losses: 14, icon: '🛡️', title: 'Acemi Bot', rewardKeys: 1, rewardAda: 2500, isBot: true },
        { rank: 10, name: 'Gladyatör Botu #10 (Zephyr)', score: 16, wins: 16, losses: 15, icon: '⚡', title: 'Acemi Bot', rewardKeys: 1, rewardAda: 2500, isBot: true },
      ];
    }
    return this.state.colosseumLeaderboard;
  },

  // Takvim saati: bilgisayar saati yerine sunucunun HTTP Date başlığıyla düzeltilmiş saat (globalPool).
  // Bilgisayar saatini ileri almak artık günlük hakları yenilemez. Not: bu da istemci tarafında bir
  // önlemdir; üretimde günlük haklar sunucuda tutulmalıdır (bkz. docs/GELISTIRME_ONERILERI.md §7).
  _calendarNow() {
    return (globalPool && typeof globalPool.getTrustedTime === 'function') ? globalPool.getTrustedTime() : Date.now();
  },

  // Günlük sayaçlar (arena maçı, zindan koşusu) — gün değişince sıfırlanır
  getDailyCounters() {
    // Günler Türkiye saatiyle (UTC+3) gece yarısı yenilenir
    const today = new Date(this._calendarNow() + 3 * 3600 * 1000).toISOString().slice(0, 10);
    if (!this.state.dailyCounters || this.state.dailyCounters.date !== today) {
      this.state.dailyCounters = { date: today, arenaMatches: 0, dungeonEntries: 0, dungeonRuns: 0, dungeonPaidEntries: 0, dungeonBudget: null, dungeonPaid: 0 };
    }
    return this.state.dailyCounters;
  },

  // ── Zindan günlük hakları, kapı harcı ve kasa bütçesi ─────────────────────
  getDungeonBaseReward(level, isBoss = false) {
    const lvl = Math.max(1, Math.min(18, Number(level) || 1));
    const major = isBoss || lvl === 9 || lvl === 18;
    const { REWARD_ADA_PER_LEVEL, REWARD_XP_PER_LEVEL, MAJOR_BOSS_REWARD_MULT } = GAME_CONFIG.DUNGEON;
    const mult = major ? MAJOR_BOSS_REWARD_MULT : 1;
    // v2: ödüller ASTRA olarak sabit (fiyat çarpanı yalnız bedellere); küçük ölçekte tam sayıya yuvarlanmaz
    return { ada: round3(REWARD_ADA_PER_LEVEL * lvl * mult), xp: Math.floor(REWARD_XP_PER_LEVEL * lvl * mult), isMajorBoss: major };
  },

  getDungeonGateFee(level, isBoss = false) {
    const rate = GAME_CONFIG.DUNGEON?.GATE_FEE_RATE ?? 0.2;
    return Math.max(0.01, round3(this.getDungeonBaseReward(level, isBoss).ada * rate));
  },

  getDungeonDayStatus() {
    const c = this.getDailyCounters();
    const cfg = GAME_CONFIG.DUNGEON || {};
    if (c.dungeonBudget == null) {
      const pool = (treasury && treasury.getPool) ? treasury.getPool('dungeon') : 0;
      c.dungeonBudget = Math.floor(pool * (cfg.DAILY_BUDGET_RATE ?? 0.01));
      c.dungeonPaid = 0;
    }
    const freeTotal = cfg.DAILY_RUNS || 5;
    const freeUsed = c.dungeonRuns || 0;
    // Eski kayıtlarda toplam giriş sayacı yoktu: ödüllü + harçlı girişlerden türet
    const entriesToday = c.dungeonEntries != null ? c.dungeonEntries : freeUsed + (c.dungeonPaidEntries || 0);
    const nextIsFirstEntry = entriesToday === 0;
    const nextWeaponWear = !(cfg.FIRST_ENTRY_NO_WEAR !== false && nextIsFirstEntry);
    return {
      freeTotal,
      freeUsed,
      freeLeft: Math.max(0, freeTotal - freeUsed),
      paidEntries: c.dungeonPaidEntries || 0,
      entriesToday,
      nextEntryNumber: entriesToday + 1,
      nextIsFirstEntry,
      nextWeaponWear,
      nextNeedsFee: freeUsed >= freeTotal,
      budget: c.dungeonBudget,
      budgetLeft: Math.max(0, c.dungeonBudget - (c.dungeonPaid || 0))
    };
  },

  // Bir sonraki girişin koşulları: stamina bedeli (her girişte), silah aşınması, harç
  getDungeonEntryTerms(level, isBoss = false, soldierCount = 1) {
    const st = this.getDungeonDayStatus();
    const staminaCost = this.getDungeonStaminaCost(level, soldierCount);
    const curStamina = Math.floor(this.state.stamina || 0);
    return {
      ...st,
      staminaCost,
      staminaOk: curStamina >= staminaCost,
      staminaShortfall: Math.max(0, staminaCost - curStamina),
      fee: st.nextNeedsFee ? this.getDungeonGateFee(level, isBoss) : 0
    };
  },

  // Savaş başlarken çağrılır: staminayı tahsil eder, girişi sayar, harcı alır.
  beginDungeonEntry(level, isBoss = false, { payGateFee = false, soldierCount = 1 } = {}) {
    const terms = this.getDungeonEntryTerms(level, isBoss, soldierCount);
    const c = this.state.dailyCounters;
    const payFee = terms.nextNeedsFee && payGateFee;
    if (payFee && (this.state.adAstraBalance || 0) < terms.fee) {
      return { success: false, rewarded: false, fee: terms.fee, message: `Kapı harcı için ${terms.fee} ASTRA gerekli.` };
    }
    const paid = this.deductDungeonStamina(level, soldierCount);
    if (!paid.success) return { success: false, rewarded: false, fee: 0, message: paid.message };

    c.dungeonEntries = terms.entriesToday + 1;
    const base = { success: true, entryNumber: c.dungeonEntries, firstEntry: terms.nextIsFirstEntry, weaponWear: terms.nextWeaponWear, staminaCost: terms.staminaCost };
    if (!terms.nextNeedsFee) {
      c.dungeonRuns = (c.dungeonRuns || 0) + 1;
      this.saveState();
      return {
        ...base, rewarded: true, fee: 0,
        message: `🎟️ Ödüllü giriş (${c.dungeonRuns}/${terms.freeTotal})${terms.nextWeaponWear ? '' : ' · silahların aşınmaz'}`
      };
    }
    if (payFee) {
      this.state.adAstraBalance -= terms.fee;
      this._onAdaSpent(terms.fee);
      // Kapı harcının oranı kadarı doğrudan zindan kasasına, kalanı her harcama gibi dağıtılır (oran: RealmRates, varsayılan %100)
      const gateShare = Math.max(0, Math.min(1, GAME_CONFIG.DUNGEON_GATE_POOL_SHARE ?? 1));
      if (gateShare > 0 && treasury && treasury.depositTo) treasury.depositTo('dungeon', terms.fee * gateShare);
      if (gateShare < 1) globalPool.recordTokenSpend(terms.fee * (1 - gateShare));
      c.dungeonPaidEntries = (c.dungeonPaidEntries || 0) + 1;
      this.saveState();
      return { ...base, rewarded: true, fee: terms.fee, message: `🚪 Kapı harcı ödendi (-${terms.fee} ASTRA, zindan kasasına)` };
    }
    this.saveState();
    return { ...base, rewarded: false, fee: 0, message: '🏋️ Antrenman girişi: yalnızca deneyim kazanılır' };
  },

  // Zindan savaşının sonucunu savaş BAŞLARKEN tek seferde işler ve kaydeder: askerlerin canı, silah
  // aşınması, ödül ve deneyim ya da canavarın kalan canı. Arena yalnızca bu sonucu oynatır.
  // Önceden sonuç animasyon bittikten sonra işleniyordu; yenilgi sırasında sayfa yenilenirse
  // can kaybı, aşınma ve canavarın kalan canı hiç yazılmıyordu.
  // ⚔️ KOLEZYUM — GERÇEK RAKİPLER (PvP). Eşleşme ve maç sunucuda (server/arena.js); burada oyuncunun kendi kısmı.
  isSoldierPvpLocked(idx) {
    const q = this.state.pvpQueue;
    return !!(q && Array.isArray(q.indices) && q.indices.includes(Number(idx)));
  },

  // Maça çıkacak takımın görüntüsü (tam canla; maç askerin canını azaltmaz)
  buildPvpTeam(mode, selectedIndices) {
    const rule = PVP_RULES.modes[mode];
    if (!rule) return { success: false, message: 'Geçersiz maç türü.' };
    if (this.state.pvpQueue) return { success: false, message: 'Zaten maç arıyorsun.' };
    if (this.isArmyStakedInWorldBoss()) return { success: false, message: '🔒 Ordun World Boss savaşına kilitli. Önce kilidi aç.' };
    const soldiers = this.state.soldierUnits || [];
    const indices = [...new Set((Array.isArray(selectedIndices) ? selectedIndices : []).map(Number))].filter(i => Number.isInteger(i) && soldiers[i]);
    if (indices.length !== rule.size) return { success: false, message: `${mode} maçı için ${rule.size} asker seçmelisin.` };
    const units = this.buildDungeonBattleUnits(getDungeonEntry(1), indices).allies.map(u => ({ ...u, hp: u.maxHp, name: cleanName(u.name) || 'Asker' }));
    return { success: true, mode, indices, units: JSON.parse(JSON.stringify(units)), name: cleanName(soldiers[indices[0]].name) || 'Asker' };
  },

  // Giriş bedeli: bot maçıyla aynı (anahtar + stamina + günlük hak)
  payPvpEntry() {
    const st = this.getColosseumEntryStatus();
    if (st.blockReason) return { success: false, message: '⛔ ' + st.blockReason };
    const cfg = GAME_CONFIG.COLOSSEUM;
    this.state.arenaKeys -= cfg.ENTRY_KEY_COST;
    this.burnItem('keys', cfg.ENTRY_KEY_COST);
    this.state.stamina -= cfg.ENTRY_STAMINA_COST;
    this.getDailyCounters().arenaMatches += 1;
    return { success: true };
  },

  // Sıradan çıkınca bedel iade edilir
  refundPvpEntry() {
    const cfg = GAME_CONFIG.COLOSSEUM;
    this.state.arenaKeys = (this.state.arenaKeys || 0) + cfg.ENTRY_KEY_COST;
    this.burnItem('keys', -cfg.ENTRY_KEY_COST);
    this.state.stamina = Math.min(this.getMaxStamina(), (this.state.stamina || 0) + cfg.ENTRY_STAMINA_COST);
    const c = this.getDailyCounters();
    c.arenaMatches = Math.max(0, (c.arenaMatches || 0) - 1);
  },

  // ⚔️ Zindan savaşı tek adımda: giriş (stamina, günlük hak, kapı harcı) → savaş (combat.js) → sonuç.
  // Canavar yalnız seviyeden, oyunun kendi tablosundan kurulur; oyuncunun gönderdiği can/saldırı kullanılmaz.
  // Sunucu modunda bu işlem sunucuda çalışır, tarayıcı yalnız dönen savaş kaydını canlandırır.
  fightDungeon(level, selectedIndices, { payGateFee = false } = {}) {
    const lvl = Math.max(1, Math.min(18, Math.floor(Number(level) || 1)));
    const currentLevel = this.state.dungeonProgress || 1;
    if (lvl > currentLevel) {
      return { success: false, message: `🔒 Şu an Seviye ${currentLevel}'desiniz! Seviye ${lvl} için önce önceki bölümleri tamamlamalısınız.` };
    }
    const soldiers = this.state.soldierUnits || [];
    const indices = [...new Set((Array.isArray(selectedIndices) ? selectedIndices : []).map(Number))]
      .filter(i => Number.isInteger(i) && soldiers[i]);
    if (!indices.length) return { success: false, message: 'Savaşa katılacak geçerli bir asker bulunamadı!' };
    if (indices.some(i => this.isSoldierPvpLocked(i))) {
      return { success: false, message: '🔒 Seçtiğin askerlerden biri Kolezyumda maç arıyor. Önce sıradan çık ya da başka asker seç.' };
    }
    const monster = getDungeonEntry(lvl);
    const isBoss = !!(monster.isBoss || lvl === 9 || lvl === 18);
    const entry = this.beginDungeonEntry(lvl, isBoss, { payGateFee: !!payGateFee, soldierCount: indices.length });
    if (!entry.success) return { ...entry, success: false };
    const setup = this.buildDungeonBattleUnits(monster, indices);
    const seed = (Math.floor(Math.random() * 0xffffffff) ^ Math.imul(lvl, 2654435761)) >>> 0;
    const sim = simulateBattle({ allies: setup.allies, enemies: setup.enemies, seed, bossPhases: setup.bossPhases });
    this.state.lastBattle = { seed, monsterLevel: lvl, victory: !!sim.victory, rounds: sim.roundCount, at: Date.now() };
    const outcome = this.settleDungeonBattle(monster, indices, sim, entry);
    return { success: true, level: lvl, monster, selectedIndices: indices, entry, sim, seed, outcome };
  },

  settleDungeonBattle(monster, selectedIndices, sim, entry) {
    const soldiers = this.state.soldierUnits || [];
    const allies = Array.isArray(sim.allies) ? sim.allies : [];
    for (const u of allies) {
      if (soldiers[u.sourceIndex]) soldiers[u.sourceIndex].hp = Math.max(1, Math.round(u.hp));
    }
    const weaponsWorn = entry.weaponWear ? this.applyDungeonWeaponWear(allies.map(u => u.sourceIndex)) : [];
    const isBoss = !!(monster.isBoss || monster.level === 9 || monster.level === 18);
    const outcome = { victory: !!sim.victory, weaponsWorn, adaReward: 0, scrollGained: null, levelUps: [], remainingEnemyHp: 0 };

    if (outcome.victory) {
      this.clearMonsterHp(monster.level);
      const drop = this.addDungeonXpAndDrops(monster.level, isBoss, { rewarded: entry.rewarded });
      outcome.adaReward = drop.adAstraGained || 0;
      outcome.budgetFull = !!drop.budgetFull;
      outcome.scrollGained = drop.scrollGained || null;
      for (const idx of selectedIndices) {
        const sRes = this.addSoldierXp(idx, monster.rewardXp);
        if (sRes && sRes.leveledUp) {
          outcome.levelUps.push(`Asker #${idx + 1} Lv.${sRes.newLevel}'e Yükseldi!`);
          if (sRes.unlockedSkills && sRes.unlockedSkills.length) {
            outcome.levelUps.push(`✨ Yeni Yetenek Açıldı: ${sRes.unlockedSkills.join(', ')}!`);
          }
        }
      }
      this.state.dungeonProgress = Math.max(this.state.dungeonProgress || 1, monster.level + 1);
    } else {
      const enemy = (sim.enemies || [])[0];
      outcome.remainingEnemyHp = enemy ? Math.max(1, Math.round(enemy.hp)) : 50;
      this.recordMonsterHp(monster.level, outcome.remainingEnemyHp);
    }
    this.saveState();
    return outcome;
  },

  // Savaş bitince silahların dayanıklılığını 1 düşürür (günün ilk girişinde çağrılmaz)
  applyDungeonWeaponWear(selectedIndices = []) {
    const soldiers = this.state.soldierUnits || [];
    const worn = [];
    for (const idx of selectedIndices) {
      const sol = soldiers[idx];
      if (!sol) continue;
      const own = sol.equipment && sol.equipment.weapon;
      const w = own || (this.state.equipment && this.state.equipment.weapon);
      if (!w) continue;
      const maxD = w.maxDurability || 13;
      w.durability = Math.max(0, (w.durability != null ? w.durability : maxD) - 1);
      worn.push(`${own ? `${sol.name} silahı` : 'Krallık Kılıcı'} (${w.durability}/${maxD})`);
    }
    return worn;
  },
};
