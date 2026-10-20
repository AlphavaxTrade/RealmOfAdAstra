// Realm of AdAstra — GameStateManager yöntemleri: ZİNDAN.
// Bölümler: (1) ödül ve kapı harcı, (2) günlük haklar ve kasa bütçesi, (3) savaş (giriş → savaş → sonuç tek adımda),
// (4) ganimet, (5) kalıcı canavar canı, (6) harita için salt okunur özetler.
// Günlük sayaçlar js/gameState/gunluk.js, stamina bedeli sefer.js, savaş kurulumu toplu.js, Fatih Ödülü fatih.js içindedir.
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { treasury } from '../treasury.js';
import { globalPool } from '../globalPool.js';
import { simulateBattle } from '../combat.js';
import { getDungeonEntry } from '../bestiary.js';
import { round3 } from './ortak.js';
import { ammMarket } from '../ammMarket.js';
import { askerHakki } from '../economy/ordu-hakki.js';

const UST_SEVIYE = 18;
const EN_COK_ASKER = 25;            // sunucu tek savaşa en çok bu kadar asker kabul eder (server/actions.js idxArr); Cehennem modunda hak 25'e çıkar
const HEDEF_KAZANMA_SANSI = 80;     // "yeterli asker" ölçütü (%)
const OZET_ONBELLEK_SINIRI = 48;

const buyukBossMu = (kayit, seviye) => !!(kayit.isBoss || seviye === 9 || seviye === 18);
const seviyeSinirla = (v) => Math.max(1, Math.min(UST_SEVIYE, Math.floor(Number(v) || 1)));

// Zindan modu (js/config.js ZINDAN_MODLARI): 0 Normal, 1 Zor, 2 Uzman, 3 Cehennem. Bozuk/eksik değer Normal sayılır.
const modTablosu = () => GAME_CONFIG.ZINDAN_MODLARI || [];
const modSinirla = (v) => Math.max(0, Math.min(modTablosu().length - 1, Math.floor(Number(v) || 0)));
const modAyar = (mod) => modTablosu()[modSinirla(mod)] || { odulCarpani: 1, dusmeCarpani: 1, gecis: null };

export const zindanYontemleri = {
  // ── 1. Ödül ve kapı harcı ────────────────────────────────────────────────
  // Ödüller ASTRA olarak sabit (fiyat çarpanı yalnız bedellere); küçük ölçekte tam sayıya yuvarlanmaz
  // mod: zindan modu (varsayılan: oyuncunun şu anki modu). ASTRA ödülü mod çarpanıyla büyür; XP büyümez (hesap seviyesi tempo eğrisi bozulmasın)
  getDungeonBaseReward(level, isBoss = false, mod = this.state.dungeonMode) {
    const seviye = seviyeSinirla(level);
    const buyuk = isBoss || seviye === 9 || seviye === 18;
    const { REWARD_ADA_PER_LEVEL, REWARD_XP_PER_LEVEL, MAJOR_BOSS_REWARD_MULT } = GAME_CONFIG.DUNGEON;
    const carpan = buyuk ? MAJOR_BOSS_REWARD_MULT : 1;
    return { ada: round3(REWARD_ADA_PER_LEVEL * seviye * carpan * modAyar(mod).odulCarpani), xp: Math.floor(REWARD_XP_PER_LEVEL * seviye * carpan), isMajorBoss: buyuk };
  },

  getDungeonGateFee(level, isBoss = false) {
    const oran = GAME_CONFIG.DUNGEON?.GATE_FEE_RATE ?? 0.2;
    return Math.max(0.01, round3(this.getDungeonBaseReward(level, isBoss).ada * oran));
  },

  // Günlük kişi ASTRA tavanı (13 Ekim 2026 denetimi EK-05, ayrıntı config DUNGEON.RETURN_SHARE): orduya harcananın
  // RETURN_SHARE'inin PAYBACK_DAYS güne yayılmış hâli; en az, ulaşılmış en değerli katta DAILY_RUNS ödüllü girişin değeri.
  getDungeonDailyCap() {
    const cfg = GAME_CONFIG.DUNGEON || {};
    const harcanan = Number(this.state.fatih && this.state.fatih.harcanan) || 0;
    const yol = harcanan * (cfg.RETURN_SHARE ?? 0.7) / Math.max(1, cfg.PAYBACK_DAYS ?? 93);
    const acik = Math.min(UST_SEVIYE, Math.max(1, Math.floor(Number(this.state.dungeonProgress) || 1)));
    let enIyi = 0;
    for (let k = 1; k <= acik; k++) enIyi = Math.max(enIyi, this.getDungeonBaseReward(k, buyukBossMu(getDungeonEntry(k), k)).ada);
    return round3(Math.max((cfg.DAILY_RUNS || 5) * enIyi, yol));
  },

  // ── 2. Günlük haklar ve kasa bütçesi ─────────────────────────────────────
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
    // Günlük ödeme bütçesi: kasanın günlük payı ile kişi tavanından küçüğü
    const kisiTavani = this.getDungeonDailyCap();
    const butce = Math.min(sayac.dungeonBudget, kisiTavani);
    return {
      personalCap: kisiTavani,
      freeTotal: odulluToplam,
      freeUsed: odulluKullanilan,
      freeLeft: Math.max(0, odulluToplam - odulluKullanilan),
      paidEntries: sayac.dungeonPaidEntries || 0,
      entriesToday: bugunGiris,
      nextEntryNumber: bugunGiris + 1,
      nextIsFirstEntry: ilkGiris,
      nextWeaponWear: !(cfg.FIRST_ENTRY_NO_WEAR !== false && ilkGiris),
      nextNeedsFee: odulluKullanilan >= odulluToplam,
      budget: butce,
      budgetLeft: Math.max(0, butce - (sayac.dungeonPaid || 0))
    };
  },

  // Bir sonraki girişin koşulları: stamina bedeli (her girişte), silah aşınması, harç
  getDungeonEntryTerms(level, isBoss = false, soldierCount = 1) {
    const gun = this.getDungeonDayStatus();
    const zCfg = GAME_CONFIG.DUNGEON || {};
    const odemesiz = !!gun.nextNeedsFee && !(gun.budgetLeft > 0);
    const ekCarpan = zCfg.ZERO_REWARD_FEE_MULT ?? 2;
    const ekEnFazla = zCfg.ZERO_REWARD_MAX_PER_DAY ?? 15;
    const ekKullanilan = (this.getDailyCounters().dungeonZeroEntries) || 0;
    const ekDoldu = odemesiz && ekKullanilan >= ekEnFazla;
    const staminaBedeli = this.getDungeonStaminaCost(level, soldierCount);
    const simdiki = Math.floor(this.state.stamina || 0);
    return {
      ...gun,
      staminaCost: staminaBedeli,
      staminaOk: simdiki >= staminaBedeli,
      staminaShortfall: Math.max(0, staminaBedeli - simdiki),
      // Ödeme payı (günlük kişi tavanı ya da kasa bütçesi) dolduktan sonra da harçlı giriş sürer (19 Ekim 2026): ASTRA kazanılmaz
      // (rewardless), deneyim ve ganimet sürer, harç ZERO_REWARD_FEE_MULT katıdır (harç kasalara girer; silah aşınır, stamina harcanır).
      // Günde en çok ZERO_REWARD_MAX_PER_DAY ek giriş: dolunca giriş engellenir (budgetBlocked, fee 0).
      fee: gun.nextNeedsFee ? (ekDoldu ? 0 : round3(this.getDungeonGateFee(level, isBoss) * (odemesiz ? ekCarpan : 1))) : 0,
      rewardless: odemesiz,
      extraEntriesLeft: odemesiz ? Math.max(0, ekEnFazla - ekKullanilan) : null,
      budgetBlocked: ekDoldu
    };
  },

  // Savaş başlarken çağrılır: staminayı tahsil eder, girişi sayar, harcı alır
  beginDungeonEntry(level, isBoss = false, { payGateFee = false, soldierCount = 1 } = {}) {
    const kosul = this.getDungeonEntryTerms(level, isBoss, soldierCount);
    const sayac = this.state.dailyCounters;
    // Antrenman girişi YOKTUR (18 Ekim 2026): günlük harçsız haklar bitince girmenin tek yolu kapı harcıdır. Ödeme payı dolduktan sonra da
    // harçlı giriş sürer (ASTRA kazanılmaz); yalnız günlük ek giriş sınırı dolunca giriş reddedilir (stamina düşmez, giriş sayılmaz).
    if (kosul.nextNeedsFee && kosul.budgetBlocked) {
      const sinir = (GAME_CONFIG.DUNGEON || {}).ZERO_REWARD_MAX_PER_DAY ?? 15;
      return { success: false, rewarded: false, fee: 0, budgetBlocked: true, message: `🏦 Bugünkü zindan ödeme payını doldurdun ve ASTRA vermeyen ${sinir} ek girişin de bitti (bu sınırlar yalnız senin hesabın için, diğer oyuncuları etkilemez): bugün yeni giriş yapılamaz. Haklar her gece 00:00'da (TSİ) yenilenir.` };
    }
    if (kosul.nextNeedsFee && !payGateFee) {
      return { success: false, rewarded: false, fee: kosul.fee, needsFee: true, message: `Günlük harçsız girişlerin bitti: girmek için kapı harcı (${kosul.fee} ASTRA) ödemelisin.` };
    }
    const harcOdenecek = kosul.nextNeedsFee;
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
        message: `🎟️ Ödüllü giriş (${sayac.dungeonRuns}/${kosul.freeTotal})${kosul.nextWeaponWear ? '' : ' · eşyaların aşınmaz'}`
      };
    }
    {
      this.state.adAstraBalance -= kosul.fee;
      this._onAdaSpent(kosul.fee);
      // Harcın oranı kadarı doğrudan zindan kasasına, kalanı her harcama gibi dağıtılır (oran RealmRates'ten; varsayılan %100)
      const kasaPayi = Math.max(0, Math.min(1, GAME_CONFIG.DUNGEON_GATE_POOL_SHARE ?? 1));
      if (kasaPayi > 0 && treasury && treasury.depositDirect) treasury.depositDirect('dungeon', kosul.fee * kasaPayi);   // %4 UOA tohumu önce ayrılır
      if (kasaPayi < 1) globalPool.recordTokenSpend(kosul.fee * (1 - kasaPayi));
      sayac.dungeonPaidEntries = (sayac.dungeonPaidEntries || 0) + 1;
      if (kosul.rewardless) sayac.dungeonZeroEntries = (sayac.dungeonZeroEntries || 0) + 1;
      this.saveState();
      return {
        ...ortak, rewarded: true, rewardless: !!kosul.rewardless, fee: kosul.fee,
        message: kosul.rewardless
          ? `🚪 Kapı harcı ödendi (-${kosul.fee} ASTRA, kasalara). Ödeme payın dolu: bu zaferden ASTRA gelmez; deneyim ve ganimet sürer.`
          : `🚪 Kapı harcı ödendi (-${kosul.fee} ASTRA, zindan kasasına)`
      };
    }
  },

  // ── 3. Savaş ─────────────────────────────────────────────────────────────
  // Tek adım: giriş (stamina, günlük hak, kapı harcı) → savaş (combat.js) → sonuç. Canavar yalnız seviyeden, oyunun
  // kendi tablosundan kurulur; oyuncunun gönderdiği can/saldırı kullanılmaz. Sunucu modunda bu işlem sunucuda çalışır,
  // tarayıcı yalnız dönen savaş kaydını canlandırır. Sonuç savaş BAŞLARKEN işlenip kaydedilir (yenilgide sayfa
  // yenilenirse can kaybı, aşınma ve canavarın kalan canı kaybolmasın).
  fightDungeon(level, selectedIndices, { payGateFee = false } = {}) {
    const seviye = seviyeSinirla(level);
    const acik = this.state.dungeonProgress || 1;
    if (seviye > acik) {
      return { success: false, message: `🔒 Şu an Seviye ${acik}'desiniz! Seviye ${seviye} için önce önceki bölümleri tamamlamalısınız.` };
    }
    const askerler = this.state.soldierUnits || [];
    const sira = [...new Set((Array.isArray(selectedIndices) ? selectedIndices : []).map(Number))]
      .filter((i) => Number.isInteger(i) && askerler[i]);
    if (!sira.length) return { success: false, message: 'Savaşa katılacak geçerli bir asker bulunamadı!' };
    const dusenler = sira.filter((i) => this.isSoldierFallen(i));
    if (dusenler.length) {
      return { success: false, fallen: dusenler, message: `💀 ${dusenler.map((i) => askerler[i].name).join(', ')} düştü (canı sıfır). İyileştirmeden savaşa katılamaz: önce iyileştir ya da başka asker seç.` };
    }
    if (sira.some((i) => this.isSoldierPvpLocked(i))) {
      return { success: false, message: '🔒 Seçtiğin askerlerden biri Kolezyumda maç arıyor. Önce sıradan çık ya da başka asker seç.' };
    }

    const canavar = getDungeonEntry(seviye, modSinirla(this.state.dungeonMode));
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
      if (askerler[u.sourceIndex]) this.setSoldierHpFromBattle(u.sourceIndex, u.hp, { dusebilir: true });   // savaş ölçeğinden kayıtlı tabana (ordu.js); canı biten düşer
    }
    const asinan = entry.weaponWear ? this.applyDungeonWeaponWear(muttefikler.map((u) => u.sourceIndex), { level: monster.level, mod: this.state.dungeonMode }) : [];
    const boss = buyukBossMu(monster, monster.level);
    const sonuc = { victory: !!sim.victory, weaponsWorn: asinan, adaReward: 0, scrollGained: null, levelUps: [], remainingEnemyHp: 0 };

    if (sonuc.victory) {
      this.clearMonsterHp(monster.level);
      const ganimet = this.addDungeonXpAndDrops(monster.level, boss);
      sonuc.adaReward = ganimet.adAstraGained || 0;
      this._zindanKazanciYaz(sonuc.adaReward);   // Fatih Ödülü hesabında yol boyu geri kazanım
      if (monster.level === UST_SEVIYE) sonuc.fatihOdulu = this._fatihOduluVer();   // ilk 18. kat zaferinde ödenir (hesap başına bir kez: yüksek modlarda yeniden ödenmez)
      sonuc.budgetFull = !!ganimet.budgetFull;
      sonuc.personCapped = !!ganimet.personCapped;
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

  // Bir savaşta HER askerin ortalama kaç eşyası aşınır (config DUNGEON.ASINMA): kat ve zindan moduyla artar, büyük bosslarda +BOSS_EKI.
  // Kesirli değer, uygulanırken zarla tam sayıya çevrilir. level verilmezse yalnız TABAN (eski kural: asker başına 1).
  getDungeonWearPerSoldier(level = null, mod = this.state.dungeonMode) {
    const c = (GAME_CONFIG.DUNGEON || {}).ASINMA || { TABAN: 1, KAT_BASINA: 0, MOD_BASINA: 0, BOSS_EKI: 0, EN_FAZLA: 5 };
    if (level == null) return c.TABAN;
    const seviye = seviyeSinirla(level);
    const kat = Math.ceil(seviye / 3);
    const deger = c.TABAN + c.KAT_BASINA * (kat - 1) + c.MOD_BASINA * modSinirla(mod) + (buyukBossMu({}, seviye) ? c.BOSS_EKI : 0);
    return Math.round(Math.min(c.EN_FAZLA, deger) * 1000) / 1000;
  },

  // Savaş bitince savaşa giren her askerin TAKILI eşyalarından RASTGELE bazılarının dayanıklılığını 1'er düşürür (günün ilk
  // girişinde çağrılmaz). Kaç eşya: getDungeonWearPerSoldier (kat ve moda göre). Silah, miğfer, zırh, pantolon ve çizme aynı şansla
  // seçilir, aynı eşya bir savaşta bir kez aşınır; sağlam parça varken kırık parça seçilmez. Hiç eşyası olmayan asker için eski
  // kural: krallık kılıcı. { level, mod } verilmezse asker başına 1 eşya.
  applyDungeonWeaponWear(selectedIndices = [], { level = null, mod = this.state.dungeonMode } = {}) {
    const beklenen = this.getDungeonWearPerSoldier(level, mod);
    const askerler = this.state.soldierUnits || [];
    const asinan = [];
    for (const idx of selectedIndices) {
      const asker = askerler[idx];
      if (!asker) continue;
      const takili = ['weapon', 'helmet', 'armor', 'legs', 'boots']
        .map((yuva) => ({ yuva, esya: asker.equipment && asker.equipment[yuva] }))
        .filter((x) => x.esya);
      if (!takili.length) {
        const kilic = this.state.equipment && this.state.equipment.weapon;
        if (!kilic) continue;
        const enFazlaK = kilic.maxDurability || 13;
        kilic.durability = Math.max(0, (kilic.durability != null ? kilic.durability : enFazlaK) - 1);
        asinan.push(`Krallık Kılıcı (${kilic.durability}/${enFazlaK})`);
        continue;
      }
      const saglam = takili.filter((x) => x.esya.durability == null || x.esya.durability > 0);
      const adaylar = [...(saglam.length ? saglam : takili)];
      // kaç eşya: tam kısım kesin, kesirli kısım zarla; aday sayısını aşamaz
      const tamKisim = Math.floor(beklenen);
      const adet = Math.min(adaylar.length, tamKisim + (Math.random() < beklenen - tamKisim ? 1 : 0));
      for (let n = 0; n < adet; n++) {
        const secilen = adaylar.splice(Math.min(adaylar.length - 1, Math.floor(Math.random() * adaylar.length)), 1)[0];
        const esya = secilen.esya;
        const enFazla = esya.maxDurability || 13;
        esya.durability = Math.max(0, (esya.durability != null ? esya.durability : enFazla) - 1);
        asinan.push(`${asker.name} · ${esya.name || 'eşya'} (${esya.durability}/${enFazla})`);
      }
    }
    return asinan;
  },

  // ── 4. Ganimet ───────────────────────────────────────────────────────────
  // Zindan canavarı yenildiğinde deneyim, ASTRA (zindan kasasından) ve şansa bağlı ganimet dağıtır.
  // Her giriş ödüllüdür (antrenman girişi 18 Ekim 2026'da kaldırıldı). Zar atma sırası (parça, kutu, eser, parşömen) sabittir.
  addDungeonXpAndDrops(level, isBoss = false) {
    const seviye = seviyeSinirla(level);
    const taban = this.getDungeonBaseReward(seviye, isBoss);
    const buyukBoss = taban.isMajorBoss;
    // Yalnız kat 3 (Sv.9) ve kat 6 (Sv.18) bosslarında düşme şansları çarpılır
    const bossCarpani = buyukBoss ? (GAME_CONFIG.BOSS_DROP_MULTIPLIER || 2.0) : 1.0;
    const dusme = modAyar(this.state.dungeonMode).dusmeCarpani;   // mod çarpanı: parça, kutu, eser ve parşömen şansı (üst sınırlar korunur)

    this.addXp(taban.xp);

    // Kasa bir günde en fazla bakiyesinin %1'ini öder; çekilen tam miktar oyuncuya gider (yuvarlama yok)
    const gun = this.getDungeonDayStatus();
    const hedef = Math.min(taban.ada, gun.budgetLeft);
    let kazanilanAstra = 0;
    let butceDoldu = false;
    let kisiKisti = false;   // haftalık KİŞİ payı ödülü kıstı (treasury.getPersonWeekCap): arayüz nedenini söyleyebilsin
    if (hedef > 0) {
      const cekim = treasury && treasury.withdraw ? this._kasaCekKisi('dungeon', hedef) : { granted: hedef };
      kazanilanAstra = Math.max(0, cekim.granted != null ? cekim.granted : hedef);
      butceDoldu = !!cekim.budgetFull;
      kisiKisti = !!cekim.personCapped;
      this.state.dailyCounters.dungeonPaid = (this.state.dailyCounters.dungeonPaid || 0) + kazanilanAstra;
    }
    const butceKisti = kazanilanAstra < taban.ada;
    this.state.adAstraBalance += kazanilanAstra;
    this._onAdaEarned(kazanilanAstra);

    const hesapSeviyesi = this.state.level || 1;

    let parca = 0;
    if (Math.random() < Math.min(0.95, this.getFragmentDropRate(hesapSeviyesi) * bossCarpani * dusme)) {
      parca = buyukBoss ? 3 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 2);
      this.state.inventory.fragments = (this.state.inventory.fragments || 0) + parca;
    }

    let kutu = 0;
    if (Math.random() < Math.min(0.5, this.getBoxDropRate(hesapSeviyesi) * bossCarpani * dusme)) {
      kutu = 1;
      this.state.lockedBoxes = (this.state.lockedBoxes || 0) + 1;
    }

    let eser = null;
    if (buyukBoss && Math.random() < Math.min(1, GAME_CONFIG.ARTIFACT_BASE_RATE * seviye * 6 * dusme)) {
      eser = this.discoverArtifact(seviye);
    }

    // Parşömen: boss %40, normal canavar %7; %60 iyileştirme, %40 stamina
    let parsomen = null;
    if (Math.random() < Math.min(0.95, (buyukBoss ? 0.40 : 0.07) * dusme)) {
      const iyilestirme = Math.random() < 0.60;
      const tur = iyilestirme ? 'scroll_heal' : 'scroll_stamina';
      this.state.inventory[tur] = (this.state.inventory[tur] || 0) + 1;
      parsomen = {
        type: tur,
        name: iyilestirme ? 'Ordu İyileştirme Parşömeni' : '100 Stamina Doldurma Parşömeni',
        icon: iyilestirme ? '📜' : '⚡',
        image: iyilestirme ? 'assets/scroll_heal.jpg' : 'assets/scroll_stamina.jpg'
      };
    }

    this.saveState();
    return {
      xpGained: taban.xp, adAstraGained: kazanilanAstra, fragmentsGained: parca, boxGained: kutu, artifactDiscovered: eser,
      scrollGained: parsomen, isBoss: buyukBoss, budgetCapped: butceKisti, budgetFull: butceDoldu, personCapped: kisiKisti, baseAda: taban.ada
    };
  },

  // ── 5. Kalıcı canavar canı: yenilince canavar kalan canıyla bekler, ölünce kayıt silinir ──────────
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

  // ── 6b. Zindan modları (js/config.js ZINDAN_MODLARI): Normal → Zor → Uzman → Cehennem ────────────────────
  // Mod geçişi için verilen hammadde katkıları. Hedef mod kayıtlıdır: eski katkı yeni moda sızmaz. Katkı yakılır (burnResources).
  _dungeonGate() {
    const s = this.state;
    const hedef = modSinirla(s.dungeonMode) + 1;
    if (!s.dungeonGate || typeof s.dungeonGate !== 'object' || s.dungeonGate.hedef !== hedef || typeof s.dungeonGate.verilen !== 'object') s.dungeonGate = { hedef, verilen: {} };
    return s.dungeonGate;
  },

  // Oyuncunun modu, çarpanları ve bir üst moda geçiş durumu (salt okunur; arayüz gösterir). bitti: bu modun son canavarı (Sv.18) yenildi.
  getDungeonModeInfo() {
    const mod = modSinirla(this.state.dungeonMode), tablo = modTablosu();
    const simdiki = tablo[mod] || modAyar(0), sonraki = tablo[mod + 1] || null;
    const bitti = (this.state.dungeonProgress || 1) > UST_SEVIYE;
    const bilgi = { mod, id: simdiki.id, ad: simdiki.ad, simge: simdiki.simge, odulCarpani: simdiki.odulCarpani, dusmeCarpani: simdiki.dusmeCarpani, enYuksekMod: !sonraki, bitti, gecis: null };
    if (!sonraki || !sonraki.gecis) return bilgi;
    const g = this._dungeonGate(), gec = sonraki.gecis;
    const gerek = {}, verilen = {}, kalan = {};
    for (const [k, n] of Object.entries(gec.hammadde)) {
      gerek[k] = n;
      verilen[k] = Math.min(n, Math.max(0, Math.floor(Number(g.verilen[k]) || 0)));
      kalan[k] = n - verilen[k];
    }
    const astra = this.adaPrice(gec.astra);
    const hammaddeTamam = Object.values(kalan).every((v) => v <= 0);
    const astraYeter = (this.state.adAstraBalance || 0) >= astra;
    bilgi.gecis = {
      hedefMod: mod + 1, hedefAd: sonraki.ad, hedefSimge: sonraki.simge, hedefOdulCarpani: sonraki.odulCarpani, hedefDusmeCarpani: sonraki.dusmeCarpani,
      gerek, verilen, kalan, astra, hammaddeTamam, astraYeter, yapilabilir: bitti && hammaddeTamam && astraYeter,
      yeniAskerHakki: askerHakki({ ilerleme: 1, mod: mod + 1 })
    };
    return bilgi;
  },

  // Bir üst moda geçiş için hammadde katkısı: envanterden düşer ve YAKILIR; bu hammaddenin kalan ihtiyacını aşamaz. Son boss yenilmeden verilmez.
  contributeToDungeonGate(amounts) {
    const bilgi = this.getDungeonModeInfo();
    if (!bilgi.gecis) return { success: false, message: '⚫ Zaten en yüksek moddasın.' };
    if (!bilgi.bitti) return { success: false, message: `🔒 ${bilgi.gecis.hedefAd} moda geçiş için önce ${bilgi.ad} modun son canavarını (Sv.${UST_SEVIYE}) yenmelisin.` };
    const env = this.state.inventory || {};
    const kabul = {};
    for (const [k, n] of Object.entries(amounts || {})) {
      if (!Object.hasOwn(bilgi.gecis.gerek, k)) continue;
      const q = Math.min(Math.max(0, Math.floor(Number(n) || 0)), Math.floor(Number(env[k]) || 0), bilgi.gecis.kalan[k]);
      if (q > 0) kabul[k] = q;
    }
    if (!Object.keys(kabul).length) return { success: false, message: 'Verilecek hammadde yok ya da bu hammaddelerin katkısı tamamlandı.' };
    const g = this._dungeonGate();
    for (const [k, q] of Object.entries(kabul)) { env[k] = (Number(env[k]) || 0) - q; g.verilen[k] = (Number(g.verilen[k]) || 0) + q; }
    this.burnResources(kabul);
    const deger = ammMarket.calculateResourcesCostAdAstra(kabul).totalAda;
    if (deger > 0 && this._addContribution) this._addContribution(round3(deger));
    this.saveState();
    const parca = Object.entries(kabul).map(([k, q]) => `${q} ${k}`).join(', ');
    return { success: true, given: kabul, message: `🔥 ${bilgi.gecis.hedefAd} moda geçiş için yakıldı: ${parca}.` };
  },

  // Bir üst moda geç: zindan sıfırlanır (ilerleme 1), canavarlar güçlenir, ödül ve düşme çarpanı artar, asker hakkı birikir.
  // Önkoşul: son boss (Sv.18) bu modda yenildi + hammadde katkıları tamam + ASTRA yeter. ASTRA oyunun harcama bölüşümüne girer.
  advanceDungeonMode() {
    const bilgi = this.getDungeonModeInfo();
    const gec = bilgi.gecis;
    if (!gec) return { success: false, message: '⚫ Zaten en yüksek moddasın.' };
    if (!bilgi.bitti) return { success: false, message: `🔒 Önce ${bilgi.ad} modun son canavarını (Sv.${UST_SEVIYE}) yenmelisin.` };
    if (!gec.hammaddeTamam) {
      const eksik = Object.entries(gec.kalan).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ');
      return { success: false, message: `🔥 Hammadde katkısı tamamlanmadı. Eksik: ${eksik}.` };
    }
    if (!gec.astraYeter) return { success: false, message: `Geçiş için ${gec.astra} ASTRA gerekli.` };
    this.state.adAstraBalance -= gec.astra;
    this._onAdaSpent(gec.astra);
    globalPool.recordTokenSpend(gec.astra);
    this.state.dungeonMode = gec.hedefMod;
    this.state.dungeonProgress = 1;
    this.state.dungeonMonsterCurrentHp = {};
    this.state.dungeonGate = { hedef: gec.hedefMod + 1, verilen: {} };
    if (this._zindanOzetOnbellek) this._zindanOzetOnbellek.clear();
    this.saveState();
    return {
      success: true, mod: gec.hedefMod, hak: gec.yeniAskerHakki,
      message: `${gec.hedefSimge} ${gec.hedefAd} moda geçtin! Zindan baştan başlıyor, canavarlar çok daha güçlü. ASTRA ödülü ×${String(gec.hedefOdulCarpani).replace('.', ',')}, eşya düşme şansı ×${String(gec.hedefDusmeCarpani).replace('.', ',')}; asker hakkın ${gec.yeniAskerHakki}'e çıktı.`
    };
  },

  // ── 6. Harita için salt okunur özetler (oyun durumunu değiştirmez) ────────
  // Savaşa gönderilebilecek askerler, en güçlüden başlayarak: Kolezyum sırasındakiler ve World Boss'a kilitli ordu hariç
  getZindanTakimi() {
    if (this.isArmyStakedInWorldBoss()) return [];
    const askerler = this.state.soldierUnits || [];
    return askerler.map((_, i) => i)
      .filter((i) => !this.isSoldierPvpLocked(i) && !this.isSoldierFallen(i))
      .map((i) => {
        const f = this.getSoldierFullStats(i) || { totalAtk: 0, totalMaxHp: 0 };
        return { i, guc: f.totalAtk * 3 + f.totalMaxHp };
      })
      .sort((a, b) => b.guc - a.guc)
      .slice(0, EN_COK_ASKER)
      .map((x) => x.i);
  },

  // Haritadaki ordu şeridi: kaç asker, kaçı yaralı, stamina ve bugünkü ödüllü giriş hakkı
  getZindanOrduDurumu() {
    const askerler = this.state.soldierUnits || [];
    let yarali = 0;
    const dusmus = askerler.filter((_, i) => this.isSoldierFallen(i)).length;
    askerler.forEach((a) => {
      const enFazla = a.maxHp || 0;   // kayıtlı can taban ölçeğinde tutulur (ordu.js getSoldierBattleStart)
      if (a.hp != null && enFazla > 0 && a.hp < enFazla - 0.5) yarali++;
    });
    const gun = this.getDungeonDayStatus();
    return {
      asker: askerler.length,
      yarali,
      dusmus,
      kilitli: this.isArmyStakedInWorldBoss(),
      stamina: Math.floor(this.state.stamina || 0),
      enFazlaStamina: this.getMaxStamina(),
      odulluKalan: gun.freeLeft,
      odulluToplam: gun.freeTotal,
      harcGerekli: gun.nextNeedsFee,
      butceKalan: gun.budgetLeft
    };
  },

  // Bir odanın durumu ve ordunun kazanma şansı. Şans, tüm uygun ordunun (en çok 18 asker) savaşın kendi motoruyla yapılan
  // Monte Carlo tahminidir; "enAz", %80 şansa ulaşmak için gereken en küçük asker sayısıdır (ulaşılamıyorsa null).
  // Sonuç, ordu ve canavar canı değişmedikçe önbellekten gelir (aynı ekranda sayı oynamasın).
  getZindanOdaOzeti(level) {
    const seviye = seviyeSinirla(level);
    const canavar = getDungeonEntry(seviye, modSinirla(this.state.dungeonMode));
    const ilerleme = this.state.dungeonProgress || 1;
    const durum = ilerleme < seviye ? 'kilitli' : (ilerleme > seviye ? 'yenildi' : 'siradaki');
    const kalanCan = this.getMonsterCurrentHp(seviye, canavar.hp);
    const ozet = { level: seviye, canavar, durum, kalanCan, yaralanmis: kalanCan < canavar.hp, sans: null, enAz: null, takim: 0 };
    if (durum === 'kilitli') return ozet;

    const takim = this.getZindanTakimi();
    ozet.takim = takim.length;
    if (!takim.length) return ozet;

    const anahtar = [seviye, kalanCan, takim.map((i) => {
      const f = this.getSoldierFullStats(i) || {};
      const a = this.state.soldierUnits[i];
      return `${i}:${Math.round(f.totalAtk || 0)}:${Math.round(f.totalMaxHp || 0)}:${Math.round(a.hp != null ? a.hp : 0)}`;
    }).join(',')].join('|');
    if (!this._zindanOzetOnbellek) this._zindanOzetOnbellek = new Map();
    const eski = this._zindanOzetOnbellek.get(anahtar);
    if (eski) return { ...ozet, ...eski };

    const sansOlc = (n, ornek) => this.predictDungeonBattle(canavar, takim.slice(0, n), ornek).winChance || 0;
    const tumu = sansOlc(takim.length, 60);
    let enAz = null;
    if (tumu >= HEDEF_KAZANMA_SANSI) {
      let alt = 1;
      let ust = takim.length;
      while (alt < ust) {
        const orta = Math.floor((alt + ust) / 2);
        if (sansOlc(orta, 40) >= HEDEF_KAZANMA_SANSI) ust = orta; else alt = orta + 1;
      }
      enAz = alt;
    }
    const sonuc = { sans: Math.round(tumu), enAz };
    if (this._zindanOzetOnbellek.size >= OZET_ONBELLEK_SINIRI) this._zindanOzetOnbellek.clear();
    this._zindanOzetOnbellek.set(anahtar, sonuc);
    return { ...ozet, ...sonuc };
  }
};
