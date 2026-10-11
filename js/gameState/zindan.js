// Realm of AdAstra — GameStateManager yöntemleri: günlük sayaçlar, zindan hakları / kapı harcı / kasa bütçesi, zindan savaşı
// (giriş → savaş → sonuç tek adımda) ve Kolezyum gerçek rakip maçı için oyuncu tarafı yardımcıları.
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { treasury } from '../treasury.js';
import { simulateBattle } from '../combat.js';
import { getDungeonEntry } from '../bestiary.js';
import { PVP_RULES } from '../economy/pvp.js';
import { cleanName, round3 } from './ortak.js';

const UST_SEVIYE = 18;
const buyukBossMu = (kayit, seviye) => !!(kayit.isBoss || seviye === 9 || seviye === 18);

export const zindanYontemleri = {
  // ── Günlük sayaçlar ─────────────────────────────────────────────────────
  // Takvim saati: bilgisayar saati yerine sunucunun HTTP Date başlığıyla düzeltilmiş saat (globalPool); bilgisayar
  // saatini ileri almak günlük hakları yenilemez.
  _calendarNow() {
    return (globalPool && typeof globalPool.getTrustedTime === 'function') ? globalPool.getTrustedTime() : Date.now();
  },

  // Günler Türkiye saatiyle (UTC+3) gece yarısı yenilenir
  getDailyCounters() {
    const bugun = new Date(this._calendarNow() + 3 * 3600 * 1000).toISOString().slice(0, 10);
    if (!this.state.dailyCounters || this.state.dailyCounters.date !== bugun) {
      this.state.dailyCounters = { date: bugun, arenaMatches: 0, dungeonEntries: 0, dungeonRuns: 0, dungeonPaidEntries: 0, dungeonBudget: null, dungeonPaid: 0 };
    }
    return this.state.dailyCounters;
  },

  // ── Zindan günlük hakları, kapı harcı ve kasa bütçesi ───────────────────
  // Ödüller ASTRA olarak sabit (fiyat çarpanı yalnız bedellere); küçük ölçekte tam sayıya yuvarlanmaz
  getDungeonBaseReward(level, isBoss = false) {
    const seviye = Math.max(1, Math.min(UST_SEVIYE, Number(level) || 1));
    const buyuk = isBoss || seviye === 9 || seviye === 18;
    const { REWARD_ADA_PER_LEVEL, REWARD_XP_PER_LEVEL, MAJOR_BOSS_REWARD_MULT } = GAME_CONFIG.DUNGEON;
    const carpan = buyuk ? MAJOR_BOSS_REWARD_MULT : 1;
    return { ada: round3(REWARD_ADA_PER_LEVEL * seviye * carpan), xp: Math.floor(REWARD_XP_PER_LEVEL * seviye * carpan), isMajorBoss: buyuk };
  },

  getDungeonGateFee(level, isBoss = false) {
    const oran = GAME_CONFIG.DUNGEON?.GATE_FEE_RATE ?? 0.2;
    return Math.max(0.01, round3(this.getDungeonBaseReward(level, isBoss).ada * oran));
  },

  // Bugünkü haklar: ödüllü giriş sayısı, toplam giriş, silah aşınması, kasanın günlük ödeme bütçesi
  getDungeonDayStatus() {
    const sayac = this.getDailyCounters();
    const cfg = GAME_CONFIG.DUNGEON || {};
    if (sayac.dungeonBudget == null) {
      const havuz = (treasury && treasury.getPool) ? treasury.getPool('dungeon') : 0;
      sayac.dungeonBudget = Math.floor(havuz * (cfg.DAILY_BUDGET_RATE ?? 0.01));
      sayac.dungeonPaid = 0;
    }
    const odulluToplam = cfg.DAILY_RUNS || 5;
    const odulluKullanilan = sayac.dungeonRuns || 0;
    // Eski kayıtlarda toplam giriş sayacı yoktu: ödüllü + harçlı girişlerden türetilir
    const bugunGiris = sayac.dungeonEntries != null ? sayac.dungeonEntries : odulluKullanilan + (sayac.dungeonPaidEntries || 0);
    const ilkGiris = bugunGiris === 0;
    return {
      freeTotal: odulluToplam,
      freeUsed: odulluKullanilan,
      freeLeft: Math.max(0, odulluToplam - odulluKullanilan),
      paidEntries: sayac.dungeonPaidEntries || 0,
      entriesToday: bugunGiris,
      nextEntryNumber: bugunGiris + 1,
      nextIsFirstEntry: ilkGiris,
      nextWeaponWear: !(cfg.FIRST_ENTRY_NO_WEAR !== false && ilkGiris),
      nextNeedsFee: odulluKullanilan >= odulluToplam,
      budget: sayac.dungeonBudget,
      budgetLeft: Math.max(0, sayac.dungeonBudget - (sayac.dungeonPaid || 0))
    };
  },

  // Bir sonraki girişin koşulları: stamina bedeli (her girişte), silah aşınması, harç
  getDungeonEntryTerms(level, isBoss = false, soldierCount = 1) {
    const gun = this.getDungeonDayStatus();
    const staminaBedeli = this.getDungeonStaminaCost(level, soldierCount);
    const simdiki = Math.floor(this.state.stamina || 0);
    return {
      ...gun,
      staminaCost: staminaBedeli,
      staminaOk: simdiki >= staminaBedeli,
      staminaShortfall: Math.max(0, staminaBedeli - simdiki),
      fee: gun.nextNeedsFee ? this.getDungeonGateFee(level, isBoss) : 0
    };
  },

  // Savaş başlarken çağrılır: staminayı tahsil eder, girişi sayar, harcı alır
  beginDungeonEntry(level, isBoss = false, { payGateFee = false, soldierCount = 1 } = {}) {
    const kosul = this.getDungeonEntryTerms(level, isBoss, soldierCount);
    const sayac = this.state.dailyCounters;
    const harcOdenecek = kosul.nextNeedsFee && payGateFee;
    if (harcOdenecek && (this.state.adAstraBalance || 0) < kosul.fee) {
      return { success: false, rewarded: false, fee: kosul.fee, message: `Kapı harcı için ${kosul.fee} ASTRA gerekli.` };
    }
    const stamina = this.deductDungeonStamina(level, soldierCount);
    if (!stamina.success) return { success: false, rewarded: false, fee: 0, message: stamina.message };

    sayac.dungeonEntries = kosul.entriesToday + 1;
    const ortak = { success: true, entryNumber: sayac.dungeonEntries, firstEntry: kosul.nextIsFirstEntry, weaponWear: kosul.nextWeaponWear, staminaCost: kosul.staminaCost };

    if (!kosul.nextNeedsFee) {
      sayac.dungeonRuns = (sayac.dungeonRuns || 0) + 1;
      this.saveState();
      return {
        ...ortak, rewarded: true, fee: 0,
        message: `🎟️ Ödüllü giriş (${sayac.dungeonRuns}/${kosul.freeTotal})${kosul.nextWeaponWear ? '' : ' · silahların aşınmaz'}`
      };
    }
    if (harcOdenecek) {
      this.state.adAstraBalance -= kosul.fee;
      this._onAdaSpent(kosul.fee);
      // Harcın oranı kadarı doğrudan zindan kasasına, kalanı her harcama gibi dağıtılır (oran RealmRates'ten; varsayılan %100)
      const kasaPayi = Math.max(0, Math.min(1, GAME_CONFIG.DUNGEON_GATE_POOL_SHARE ?? 1));
      if (kasaPayi > 0 && treasury && treasury.depositTo) treasury.depositTo('dungeon', kosul.fee * kasaPayi);
      if (kasaPayi < 1) globalPool.recordTokenSpend(kosul.fee * (1 - kasaPayi));
      sayac.dungeonPaidEntries = (sayac.dungeonPaidEntries || 0) + 1;
      this.saveState();
      return { ...ortak, rewarded: true, fee: kosul.fee, message: `🚪 Kapı harcı ödendi (-${kosul.fee} ASTRA, zindan kasasına)` };
    }
    this.saveState();
    return { ...ortak, rewarded: false, fee: 0, message: '🏋️ Antrenman girişi: yalnızca deneyim kazanılır' };
  },

  // ── Zindan savaşı ───────────────────────────────────────────────────────
  // Tek adım: giriş (stamina, günlük hak, kapı harcı) → savaş (combat.js) → sonuç. Canavar yalnız seviyeden, oyunun
  // kendi tablosundan kurulur; oyuncunun gönderdiği can/saldırı kullanılmaz. Sunucu modunda bu işlem sunucuda çalışır,
  // tarayıcı yalnız dönen savaş kaydını canlandırır. Sonuç savaş BAŞLARKEN işlenip kaydedilir (yenilgide sayfa
  // yenilenirse can kaybı, aşınma ve canavarın kalan canı kaybolmasın).
  fightDungeon(level, selectedIndices, { payGateFee = false } = {}) {
    const seviye = Math.max(1, Math.min(UST_SEVIYE, Math.floor(Number(level) || 1)));
    const acik = this.state.dungeonProgress || 1;
    if (seviye > acik) {
      return { success: false, message: `🔒 Şu an Seviye ${acik}'desiniz! Seviye ${seviye} için önce önceki bölümleri tamamlamalısınız.` };
    }
    const askerler = this.state.soldierUnits || [];
    const sira = [...new Set((Array.isArray(selectedIndices) ? selectedIndices : []).map(Number))]
      .filter(i => Number.isInteger(i) && askerler[i]);
    if (!sira.length) return { success: false, message: 'Savaşa katılacak geçerli bir asker bulunamadı!' };
    if (sira.some(i => this.isSoldierPvpLocked(i))) {
      return { success: false, message: '🔒 Seçtiğin askerlerden biri Kolezyumda maç arıyor. Önce sıradan çık ya da başka asker seç.' };
    }

    const canavar = getDungeonEntry(seviye);
    const entry = this.beginDungeonEntry(seviye, buyukBossMu(canavar, seviye), { payGateFee: !!payGateFee, soldierCount: sira.length });
    if (!entry.success) return { ...entry, success: false };

    const kurulum = this.buildDungeonBattleUnits(canavar, sira);
    const seed = (Math.floor(Math.random() * 0xffffffff) ^ Math.imul(seviye, 2654435761)) >>> 0;
    const sim = simulateBattle({ allies: kurulum.allies, enemies: kurulum.enemies, seed, bossPhases: kurulum.bossPhases });
    this.state.lastBattle = { seed, monsterLevel: seviye, victory: !!sim.victory, rounds: sim.roundCount, at: Date.now() };
    const outcome = this.settleDungeonBattle(canavar, sira, sim, entry);
    return { success: true, level: seviye, monster: canavar, selectedIndices: sira, entry, sim, seed, outcome };
  },

  // Savaş sonucunu işler: askerlerin canı, silah aşınması, ödül/deneyim (zafer) ya da canavarın kalan canı (yenilgi)
  settleDungeonBattle(monster, selectedIndices, sim, entry) {
    const askerler = this.state.soldierUnits || [];
    const muttefikler = Array.isArray(sim.allies) ? sim.allies : [];
    for (const u of muttefikler) {
      if (askerler[u.sourceIndex]) askerler[u.sourceIndex].hp = Math.max(1, Math.round(u.hp));
    }
    const asinan = entry.weaponWear ? this.applyDungeonWeaponWear(muttefikler.map(u => u.sourceIndex)) : [];
    const boss = buyukBossMu(monster, monster.level);
    const sonuc = { victory: !!sim.victory, weaponsWorn: asinan, adaReward: 0, scrollGained: null, levelUps: [], remainingEnemyHp: 0 };

    if (sonuc.victory) {
      this.clearMonsterHp(monster.level);
      const ganimet = this.addDungeonXpAndDrops(monster.level, boss, { rewarded: entry.rewarded });
      sonuc.adaReward = ganimet.adAstraGained || 0;
      sonuc.budgetFull = !!ganimet.budgetFull;
      sonuc.budgetCapped = !!ganimet.budgetCapped;
      sonuc.scrollGained = ganimet.scrollGained || null;
      // Sonuç ekranı için ganimetin kalanı (yalnız gösterim; durum addDungeonXpAndDrops içinde işlendi)
      sonuc.xpGained = ganimet.xpGained || 0;
      sonuc.fragmentsGained = ganimet.fragmentsGained || 0;
      sonuc.boxGained = ganimet.boxGained || 0;
      sonuc.artifactDiscovered = ganimet.artifactDiscovered || null;
      for (const idx of selectedIndices) {
        const xp = this.addSoldierXp(idx, monster.rewardXp);
        if (!(xp && xp.leveledUp)) continue;
        sonuc.levelUps.push(`Asker #${idx + 1} Lv.${xp.newLevel}'e Yükseldi!`);
        if (xp.unlockedSkills && xp.unlockedSkills.length) sonuc.levelUps.push(`✨ Yeni Yetenek Açıldı: ${xp.unlockedSkills.join(', ')}!`);
      }
      this.state.dungeonProgress = Math.max(this.state.dungeonProgress || 1, monster.level + 1);
    } else {
      const dusman = (sim.enemies || [])[0];
      sonuc.remainingEnemyHp = dusman ? Math.max(1, Math.round(dusman.hp)) : 50;
      this.recordMonsterHp(monster.level, sonuc.remainingEnemyHp);
    }
    this.saveState();
    return sonuc;
  },

  // Savaş bitince silahların dayanıklılığını 1 düşürür (günün ilk girişinde çağrılmaz)
  applyDungeonWeaponWear(selectedIndices = []) {
    const askerler = this.state.soldierUnits || [];
    const asinan = [];
    for (const idx of selectedIndices) {
      const asker = askerler[idx];
      if (!asker) continue;
      const kendi = asker.equipment && asker.equipment.weapon;
      const silah = kendi || (this.state.equipment && this.state.equipment.weapon);
      if (!silah) continue;
      const enFazla = silah.maxDurability || 13;
      silah.durability = Math.max(0, (silah.durability != null ? silah.durability : enFazla) - 1);
      asinan.push(`${kendi ? `${asker.name} silahı` : 'Krallık Kılıcı'} (${silah.durability}/${enFazla})`);
    }
    return asinan;
  },

  // ── Kalıcı canavar canı: yenilince canavar kalan canıyla bekler, ölünce kayıt silinir ───────────
  getMonsterCurrentHp(floorLevel, baseHp) {
    const kayitli = (this.state.dungeonMonsterCurrentHp || {})[floorLevel];
    return (kayitli != null && kayitli > 0) ? kayitli : baseHp;
  },

  recordMonsterHp(floorLevel, hp) {
    if (!this.state.dungeonMonsterCurrentHp) this.state.dungeonMonsterCurrentHp = {};
    if (hp <= 0) delete this.state.dungeonMonsterCurrentHp[floorLevel];
    else this.state.dungeonMonsterCurrentHp[floorLevel] = Math.round(hp);
    this.saveState();
  },

  clearMonsterHp(floorLevel) {
    if (!this.state.dungeonMonsterCurrentHp) return;
    delete this.state.dungeonMonsterCurrentHp[floorLevel];
    this.saveState();
  },

  // ── Kolezyum gerçek rakipler (PvP): oyuncunun kendi kısmı; eşleşme ve maç sunucuda (server/arena.js) ──
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
    const sira = [...new Set((Array.isArray(selectedIndices) ? selectedIndices : []).map(Number))].filter(i => Number.isInteger(i) && askerler[i]);
    if (sira.length !== kural.size) return { success: false, message: `${mode} maçı için ${kural.size} asker seçmelisin.` };
    const birimler = this.buildDungeonBattleUnits(getDungeonEntry(1), sira).allies.map(u => ({ ...u, hp: u.maxHp, name: cleanName(u.name) || 'Asker' }));
    return { success: true, mode, indices: sira, units: JSON.parse(JSON.stringify(birimler)), name: cleanName(askerler[sira[0]].name) || 'Asker' };
  },

  // Giriş bedeli: hazır rakip maçıyla aynı (anahtar + stamina + günlük hak)
  payPvpEntry() {
    const durum = this.getColosseumEntryStatus();
    if (durum.blockReason) return { success: false, message: '⛔ ' + durum.blockReason };
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
    const sayac = this.getDailyCounters();
    sayac.arenaMatches = Math.max(0, (sayac.arenaMatches || 0) - 1);
  }
};
