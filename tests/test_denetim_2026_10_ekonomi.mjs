// 13 Ekim 2026 denetimi: oyun kuralları ve ekonomi bulgularının (EK-01 ... EK-12) gerileme testleri.
// Her blok, eski kodda DÜŞER, yeni kodda geçer. Sayıların gerekçeleri js/config.js yorumlarında ve
// docs/v2/TARAMA_2026-10.md "13 Ekim denetim kararları" bölümündedir.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { weightOf, distribute, FAUCET_DEFAULTS } = await import('../js/economy/faucet.js');
const { runDraw } = await import('../js/economy/lottery.js');
const { runwayPoolTotal, lotteryTicketPrice, nextMultiplier } = await import('../server/economy.js');

const K = GAME_CONFIG.RESOURCE_KEYS;
let gecen = 0;
const ok = (ad) => { gecen++; console.log(`✅ ${ad}`); };
const yeni = () => {
  depo.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  const gs = new GameStateManager();
  return gs;
};
const asker = (gs, n = 1, seviye = 8) => {
  gs.state.soldierUnits = [];
  for (let i = 1; i <= n; i++) {
    const u = gs.createSoldierUnit(i);
    u.level = seviye; u.maxHp = 100 + 25 * (seviye - 1); u.hp = u.maxHp; u.baseAtk = 25 + 6 * (seviye - 1);
    const mk = (slot, a, h) => ({ id: slot + i, slot, name: slot, level: 2, baseAtk: a, baseHp: h, atkBonus: Math.round(a * 1.35), hpBonus: Math.round(h * 1.35), durability: 13, maxDurability: 13 });
    u.equipment = { weapon: mk('weapon', 25, 0), helmet: mk('helmet', 10, 30), armor: mk('armor', 0, 60), legs: mk('legs', 5, 40), boots: mk('boots', 8, 20) };
    gs.state.soldierUnits.push(u);
  }
};

// ═══ EK-01: seviye bedeli ulaşılabilir silonun kapasitesini aşamaz; her seviye gerçekten atlanabilir ═══
{
  const gs = yeni();
  for (const evren of [0, 3]) {                     // 0: Universe öncesi (silo tavanı 12), 3: Universe açık (silo tavanı 18)
    GAME_CONFIG.UNIVERSE_STAGE = evren;
    const enUst = gs.getWarehouseMaxLevel();
    assert.equal(enUst, evren === 3 ? 18 : 12);
    const kap = gs.getWarehouseCapacity(enUst);
    const oran = GAME_CONFIG.LEVEL_UP_SILO_SHARE;
    // değişmez: hiçbir kalemin bedeli ulaşılabilir en büyük silonun kapasitesini aşamaz (eski kodda Sv.11→12'de düşer)
    for (let L = 1; L < GAME_CONFIG.MAX_PLAYER_LEVEL; L++) {
      gs.state.level = L;
      const r = gs.getNextLevelRequirement();
      for (const k of K) assert.ok(r.costs[k] <= kap[k], `evren ${evren} Sv.${L}→${L + 1}: ${k} bedeli ${r.costs[k]} > silo kapasitesi ${kap[k]}`);
    }
    // ayar: bedel kapasitenin LEVEL_UP_SILO_SHARE'ini aşmaz ve tutan bir silo seviyesi bildirilir
    assert.equal(oran, 0.8);
    for (let L = 1; L < GAME_CONFIG.MAX_PLAYER_LEVEL; L++) {
      gs.state.level = L;
      const r = gs.getNextLevelRequirement();
      for (const k of K) assert.ok(r.costs[k] <= Math.floor(kap[k] * oran) + 1e-9, `${k} bedeli kapasitenin %${oran * 100}'ini aşıyor`);
      assert.ok(r.siloLevelNeeded >= 1 && r.siloLevelNeeded <= enUst, `Sv.${L}: tutan bir silo seviyesi var (${r.siloLevelNeeded})`);
    }
  }
  GAME_CONFIG.UNIVERSE_STAGE = 0;
  ok('EK-01: her L ≤ 80 için seviye bedeli ≤ ulaşılabilir silo kapasitesi × 0,8 (Universe öncesi ve sonrası)');
}
{
  // Gerçek atlama: en üst silo (12) ve bedeli kadar kaynakla, 81. seviyeye kadar her adım başarılı
  const gs = yeni();
  gs.state.warehouseLevel = gs.getWarehouseMaxLevel();
  gs.state.adAstraBalance = 1e9;
  let atlayan = 0;
  for (let L = 1; L < GAME_CONFIG.MAX_PLAYER_LEVEL; L++) {
    gs.state.level = L;
    const r = gs.getNextLevelRequirement();
    for (const k of K) gs.state.inventory[k] = r.costs[k];
    gs.state.currentXp = r.xp;
    const s = gs.levelUp();
    assert.equal(s.success, true, `Sv.${L}→${L + 1} atlanamadı: ${s.message}`);
    atlayan++;
  }
  assert.equal(atlayan, 80);
  ok('EK-01: silo 12 ile Sv.1\'den Sv.81\'e 80 atlamanın hepsi yapılabiliyor (eskiden Sv.11→12\'de takılıyordu)');
}
{
  // Silo küçükse: "yetersiz" yerine "silon tutamıyor, önce siloyu büyüt" denir ve gereken seviye verilir (EK-12 ipucu verisi)
  const gs = yeni();
  gs.state.level = 2;
  gs.state.warehouseLevel = 1;
  gs.state.adAstraBalance = 1e6;
  const r = gs.getNextLevelRequirement();
  assert.equal(r.costs.wheat, 972, 'Sv.2→3 buğday bedeli');
  assert.ok(gs.getWarehouseCapacity(1).wheat < 972, 'silo-1 bu bedeli tutamaz');
  assert.equal(gs.getWarehouseCapacity(r.siloLevelNeeded - 1).wheat < 972 || r.siloLevelNeeded === 1, true);
  assert.ok(gs.getWarehouseCapacity(r.siloLevelNeeded).wheat >= 972, 'ipucundaki silo bedeli tutar');
  gs.state.currentXp = r.xp;
  const red = gs.levelUp();
  assert.equal(red.success, false);
  assert.equal(red.siloTooSmall, true);
  assert.equal(red.siloLevelNeeded, r.siloLevelNeeded);
  assert.match(red.message, /Silon .* tutamıyor/);
  // silo yetecek kadar büyükse sıradan "yetersiz" mesajı
  gs.state.warehouseLevel = r.siloLevelNeeded;
  const red2 = gs.levelUp();
  assert.equal(red2.success, false);
  assert.ok(!red2.siloTooSmall, 'silo yetiyorsa silo uyarısı yok');
  assert.match(red2.message, /Yetersiz/);
  ok(`EK-12: Sv.2→3 buğday 972 > silo-1 540: levelUp "önce siloyu büyüt" der, gereken silo seviyesi ${r.siloLevelNeeded} veri olarak döner`);
}

// ═══ EK-04: pazardan alıp geri satmakla kilit açılamaz ═══
{
  const gs = yeni();
  gs.state.warehouseLevel = 18;
  gs.state.adAstraBalance = 10000;
  gs.state.lockedAda = 10000;
  const serbest = () => gs.state.adAstraBalance - gs.state.lockedAda;
  const bakiye0 = gs.state.adAstraBalance;
  for (let i = 0; i < 12; i++) {
    const al = gs.marketBuy('wood', 20000);
    assert.equal(al.success, true, al.message);
    const sat = gs.marketSell('wood', gs.state.inventory.wood);
    assert.equal(sat.success, true, sat.message);
  }
  const kayip = bakiye0 - gs.state.adAstraBalance;
  assert.ok(kayip > 400, `12 turun kaybı ~481 olmalı: ${kayip}`);
  // Eski kuralda serbest bakiye 0 → 2.401 (kayıp 481: %20 maliyetle kilit açılıyordu). Yenide açılan yalnız komisyon+yakım payı.
  assert.ok(serbest() < 0.12 * kayip + 1, `al-sat kilidi açmamalı: serbest ${serbest().toFixed(1)}, kayıp ${kayip.toFixed(1)}`);
  assert.ok(serbest() < 100, `serbest ${serbest().toFixed(1)} < 100 (eski: 2.401)`);
  ok(`EK-04: 12 tur al-sat: kayıp ${kayip.toFixed(0)}, açılan serbest ${serbest().toFixed(1)} (eski: 2.401)`);
}
{
  // Serbest ASTRA ile alıp geri satan (olağan ticaret) eskisi gibi %80 kilitli döner; kilitli ASTRA'yla alınan tamamen kilitli döner
  const gs = yeni();
  gs.state.warehouseLevel = 18;
  gs.state.adAstraBalance = 5000; gs.state.lockedAda = 0;
  const al = gs.marketBuy('wood', 20000);
  assert.equal(al.success, true);
  const lockCredit = (gs.state.contribution && gs.state.contribution.lockCredit && gs.state.contribution.lockCredit.wood) || 0;
  assert.equal(lockCredit, 0, 'serbestle alınanda kilit kredisi yok');
  const sat = gs.marketSell('wood', gs.state.inventory.wood);
  assert.ok(Math.abs(gs.state.lockedAda - sat.adAstraReceived * 0.8) < 0.01, 'serbestle alınan hammaddenin satışı olağan %80 kilitli');
  ok('EK-04: serbest ASTRA ile alım-satım olağan %80 kilitli kuralıyla işler (cezalandırılmaz)');
}
{
  // Kasa kaynaklı harcama (engine.js withPlayer: kasa bakiyeye eklenir, sonra çıkarılır): kilit, "kazanılmış önce, kasa sonra"
  // idealinden FAZLA açılmaz (doğrulama: 1,2× iddiası yok). 400 rastgele dizi.
  let tohum = 12345; const rnd = () => { tohum = (tohum * 1664525 + 1013904223) >>> 0; return tohum / 4294967296; };
  const yg = (B, L) => { const g = new GameStateManager(); g.state.adAstraBalance = B; g.state.lockedAda = L; g.state.sponsorAda = 0; return g; };
  let enKotu = 0;
  for (let n = 0; n < 400; n++) {
    const B = Math.floor(rnd() * 2000), L = Math.floor(rnd() * B), Kasa = Math.floor(rnd() * 3000);
    const olay = []; for (let i = 0, m = 1 + Math.floor(rnd() * 6); i < m; i++) olay.push([rnd() < 0.6 ? 'h' : 'k', Math.floor(rnd() * 1500)]);
    const g = yg(B, L); g.state.adAstraBalance += Kasa;
    for (const [t, v] of olay) { if (t === 'h') { if (g.state.adAstraBalance >= v) { g.state.adAstraBalance -= v; g._onAdaSpent(v); } } else { g.state.adAstraBalance += v; g._onAdaEarned(v); } }
    { const toplam = g.state.adAstraBalance; g.state.adAstraBalance = Math.max(0, toplam - Kasa); g.state.lockedAda = Math.min(g.state.lockedAda, g.state.adAstraBalance); }
    const q = yg(B, L); let Kk = Kasa;
    for (const [t, v] of olay) {
      if (t === 'h') { if (q.state.adAstraBalance + Kk < v) continue; const own = Math.min(v, q.state.adAstraBalance); q.state.adAstraBalance -= own; if (own > 0) q._onAdaSpent(own); Kk -= v - own; }
      else { q.state.adAstraBalance += v; q._onAdaEarned(v); }
    }
    enKotu = Math.max(enKotu, (g.state.adAstraBalance - g.state.lockedAda) - (q.state.adAstraBalance - q.state.lockedAda));
  }
  assert.ok(enKotu < 1e-6, `kasa harcaması kilidi fazla açıyor: en kötü fark ${enKotu}`);
  ok('EK-04b: kasa kaynaklı harcama kilidi "kazanılmış önce, kasa sonra" idealinden fazla açmıyor (400 rastgele dizi, fark 0)');
}

// ═══ EK-03: ücretsiz havuz ağırlığı katkı tavanıyla sınırlı ═══
{
  const FP = { ...FAUCET_DEFAULTS, ...GAME_CONFIG.FREE_PLAYER_POOL };
  const HAVUZ = 120000;
  const pay = (honN, honC, atkK, atkC, rules) => {
    const w = [];
    for (let i = 0; i < honN; i++) w.push(weightOf({ contribution: honC, streakWeeks: 4 }, rules));
    for (let i = 0; i < atkK; i++) w.push(weightOf({ contribution: atkC, streakWeeks: 1 }, rules));
    const out = distribute(HAVUZ, w, w.map(() => Infinity));
    const hon = out.slice(0, honN).reduce((a, b) => a + b, 0), at = out.slice(honN).reduce((a, b) => a + b, 0);
    return { atkShare: at / (hon + at), honestEach: honN ? hon / honN : 0 };
  };
  assert.ok(FP.WEIGHT_CAP_CONTRIBUTION >= FP.FULL_CONTRIBUTION, 'tavan tam tavandan küçük olamaz');
  const yeniR = pay(60, 50, 1, 500, FP);
  const eskiR = pay(60, 50, 1, 500, { ...FP, WEIGHT_CAP_CONTRIBUTION: 0 });       // 0 = tavansız (eski kural)
  const temel = pay(60, 50, 0, 0, FP);
  assert.ok(eskiR.atkShare > 0.25, `eski kuralda tek hesap c=500 havuzun >%25'i: ${eskiR.atkShare}`);
  assert.ok(yeniR.atkShare < 0.05, `tek hesap c=500 payı %5'in altında olmalı: ${yeniR.atkShare}`);
  assert.ok(yeniR.honestEach > 0.95 * temel.honestEach, `dürüst kişi başı payı korunmalı: ${yeniR.honestEach} / ${temel.honestEach}`);
  // yan hesap koruması bozulmadı: 40 hesap × c10 payı %7'yi geçmez (üs 1,5 korunuyor; tavan = FULL olsaydı %34 olurdu)
  const sybil = pay(60, 50, 40, 10, FP);
  assert.ok(sybil.atkShare < 0.07, `40 yan hesap × c10 payı: ${sybil.atkShare}`);
  // tavanın altında katkı ağırlığı orantısız (üs) artar, üstünde sabit
  assert.ok(weightOf({ contribution: 50 }, FP) > 2 * weightOf({ contribution: 25 }, FP));
  assert.equal(weightOf({ contribution: 500 }, FP), weightOf({ contribution: 100 }, FP));
  ok(`EK-03: tek hesap c=500 payı %${(eskiR.atkShare * 100).toFixed(1)} → %${(yeniR.atkShare * 100).toFixed(1)}; dürüst kişi başı ${eskiR.honestEach.toFixed(0)} → ${yeniR.honestEach.toFixed(0)} (taban ${temel.honestEach.toFixed(0)})`);
}

// ═══ EK-05: zindan günlük kişi tavanı ═══
{
  const gs = yeni();
  gs.state.dungeonProgress = 10;                         // 9. kat (boss, ödül 24,3) temizlendi
  const taban = GAME_CONFIG.DUNGEON.DAILY_RUNS * 24.3;
  assert.equal(gs.getDungeonDailyCap(), taban, 'ordu harcaması yokken tavan = 5 ödüllü girişin değeri');
  let toplam = 0;
  for (let i = 0; i < 12; i++) { const g = gs.addDungeonXpAndDrops(9, true, { rewarded: true }); toplam += g.adAstraGained; }
  assert.ok(Math.abs(toplam - taban) < 0.01, `günlük toplam tavanı aşmamalı: ${toplam} / ${taban}`);
  // tavan dolduktan sonra harç alınmaz (ödül yok), giriş antrenmandır
  gs.getDailyCounters().dungeonRuns = 5;                 // harçsız haklar bitti
  const kosul = gs.getDungeonEntryTerms(9, true, 1);
  assert.equal(kosul.nextNeedsFee, true);
  assert.equal(kosul.fee, 0, 'ödeme tavanı doluyken harç alınmaz');
  const giris = gs.beginDungeonEntry(9, true, { payGateFee: true, soldierCount: 1 });
  assert.equal(giris.rewarded, false);
  ok(`EK-05: harcanan = 0 iken günlük zindan geliri ${toplam.toFixed(1)} (40 giriş eski: ~777); dolunca harç alınmıyor`);
}
{
  // Ordu harcamasıyla orantılı tavan: harcanan × 0,70 ÷ 93 (10 askerlik ordu ~20.720 ASTRA → 156)
  const gs = yeni();
  gs.state.dungeonProgress = 10;
  gs.state.fatih = { harcanan: 20720, kazanilan: 0, alindi: false, odul: 0, at: 0 };
  const beklenen = Math.round(20720 * GAME_CONFIG.DUNGEON.RETURN_SHARE / GAME_CONFIG.DUNGEON.PAYBACK_DAYS * 1000) / 1000;
  assert.equal(gs.getDungeonDailyCap(), beklenen);
  assert.ok(beklenen > 5 * 24.3, 'ordu büyüdükçe tavan tabanı geçer');
  let toplam = 0;
  for (let i = 0; i < 20; i++) toplam += gs.addDungeonXpAndDrops(9, true, { rewarded: true }).adAstraGained;
  assert.ok(Math.abs(toplam - beklenen) < 0.01);
  // Tam ordu (18 asker ≈ 115.873): günde ~872 → 93 günde yol payı %70
  gs.state.fatih.harcanan = 115873;
  assert.ok(gs.getDungeonDailyCap() > 800 && gs.getDungeonDailyCap() < 900);
  ok(`EK-05: tavan orduya harcananla orantılı (10 asker ${beklenen}/gün, 18 asker ~${gs.getDungeonDailyCap().toFixed(0)}/gün)`);
}
{
  // Haftalık kişi payı: bütçe × 3 ÷ aktif vatandaş. İlk gelen bütçeyi süpüremez, geç gelen de alır.
  const a = yeni();
  treasury.openWeekBudgets({ aktif: 10 });
  treasury.state.weekBudget.dungeon = 100;                // kişi başı tavan = 100 × 3 ÷ 10 = 30
  assert.equal(treasury.getPersonWeekCap('dungeon'), 30);
  a.state.dungeonProgress = 10;
  const a1 = a._kasaCekKisi('dungeon', 24.3);
  const a2 = a._kasaCekKisi('dungeon', 24.3);
  const a3 = a._kasaCekKisi('dungeon', 24.3);
  assert.equal(a1.granted, 24.3);
  assert.ok(Math.abs(a2.granted - 5.7) < 1e-9, `ikinci çekim kalan 5,7: ${a2.granted}`);
  assert.equal(a3.granted, 0);
  assert.equal(a3.personCapped, true);
  depo.clear();                                           // başka bir oyuncu (yeni kayıt), aynı dünya kasası
  const b = new GameStateManager();
  const b1 = b._kasaCekKisi('dungeon', 24.3);
  assert.equal(b1.granted, 24.3, 'geç gelen de payını alır');
  // aktif sayı bilinmiyorsa (sunucunun ilk açılışı) payda tabana (PERSON_CAP_MIN_ACTIVE = 10) iner: tavan bütçenin %30'u.
  // 14 Ekim 2026 ikinci tur: eskiden burada tavan hiç uygulanmıyordu (Infinity) ve ilk hafta bir oyuncu bütçeyi süpürebiliyordu.
  treasury.openWeekBudgets({});
  treasury.state.weekBudget.dungeon = 100;
  assert.equal(treasury.getPersonWeekCap('dungeon'), 30, 'aktif bilinmiyor: bütçe × 3 ÷ 10');
  ok('EK-05: haftalık kişi payı tavanı (bütçe × 3 ÷ aktif vatandaş): ilk gelen süpüremiyor, geç gelen payını alıyor');
}

// ═══ EK-06: kolezyum puanı yükselir, ödül sabit ve günlük tavanlı ═══
{
  const gs = yeni();
  asker(gs, 1, 12);
  gs.state.adAstraBalance = 1e6; gs.state.stamina = 1e6; gs.state.maxStamina = 1e6;   // giriş ücreti ASTRA'dır (anahtar değil)
  gs.state.adaPriceMultiplier = 0.5;                     // bedel çarpanı: ödül bundan ETKİLENMEMELİ
  const sonuclar = [];
  for (let i = 0; i < 10; i++) {
    gs.state.soldierUnits[0].hp = gs.state.soldierUnits[0].maxHp;
    sonuclar.push(gs.executeColosseum1v1Match(0));
  }
  const kazanc = sonuclar.filter(s => s.isVictory);
  assert.ok(kazanc.length >= 8, `güçlü asker çoğu maçı kazanır: ${kazanc.length}`);
  assert.ok(sonuclar[sonuclar.length - 1].newRating > 1100, `10 maç sonra puan 1000'in üstünde: ${sonuclar[sonuclar.length - 1].newRating}`);
  assert.ok(kazanc[0].rewardAda >= 25, `ilk ödül sabit 25 (çarpandan bağımsız): ${kazanc[0].rewardAda}`);
  const toplam = sonuclar.reduce((t, s) => t + (s.rewardAda || 0), 0);
  assert.ok(toplam <= GAME_CONFIG.COLOSSEUM.DAILY_REWARD_CAP_ASTRA, `günlük ödül tavanı: ${toplam}`);
  assert.ok(toplam >= GAME_CONFIG.COLOSSEUM.DAILY_REWARD_CAP_ASTRA - 2, `tavan doluyor: ${toplam}`);
  // rakip puanı oyuncunun ±RATING_SPREAD'i içinde
  const puan = sonuclar[0].newRating - sonuclar[0].ratingDelta;
  assert.ok(Math.abs(puan - 1000) < 1);
  ok(`EK-06: 10 galibiyette puan 1000 → ${sonuclar[sonuclar.length - 1].newRating}, ödül ${toplam}/gün (tavan ${GAME_CONFIG.COLOSSEUM.DAILY_REWARD_CAP_ASTRA}), fiyat çarpanından bağımsız`);
}

// ═══ EK-07: dünya bossu hasarı savaş anında güncel güce göre ═══
{
  const kur = () => {
    const g = yeni();
    asker(g, 2, 10);
    return g;
  };
  const kontrol = kur();
  assert.equal(kontrol.stakeArmyForWorldBoss().success, true);
  const tam = kontrol.executeSundayAutoWorldBossBattle({ force: true }).damageDealt;
  assert.ok(tam > 0);

  const g = kur();
  g.stakeArmyForWorldBoss();
  const kilitHasar = g.calculateUserWorldBossPower().calculatedDamage;
  assert.equal(kilitHasar, tam);
  // kilitten sonra tüm teçhizat askerden çıkarılır (ilan pazarına konup başka hesaba gidebilen durum)
  for (const i of [0, 1]) for (const slot of ['weapon', 'helmet', 'armor', 'legs', 'boots']) g.unequipSoldierToArmory(i, slot);
  const sonra = g.executeSundayAutoWorldBossBattle({ force: true }).damageDealt;
  assert.ok(sonra < tam * 0.8, `teçhizatsız ordunun savaş hasarı düşmeli: ${sonra} < ${tam}`);

  // sonradan alınan asker kilitli güce eklenmez
  const h = kur();
  h.stakeArmyForWorldBoss();
  const u = h.createSoldierUnit(3);
  u.level = 30; u.maxHp = 1000; u.hp = 1000; u.baseAtk = 500;
  h.state.soldierUnits.push(u);
  const eklenen = h.executeSundayAutoWorldBossBattle({ force: true }).damageDealt;
  assert.equal(eklenen, tam, 'kilitten sonra eklenen asker hasara girmez');
  // dünya toplamı aynı farkla düşer, negatif olmaz
  const boss = g.getWorldBossInfo();
  assert.ok(boss.totalStakedAtk >= 0 && boss.totalStakedHp >= 0);
  ok(`EK-07: kilitten sonra teçhizat çıkarılırsa savaş hasarı ${tam} → ${sonra}; sonradan alınan asker eklenmez`);
}

// ═══ EK-08: devreden bilet yaşlanması, ücretsiz bilet, bilet fiyatı yuvarlaması ═══
{
  const rules = { ticketPrice: 1, winnerMultiplier: 2, amortiShare: 0.02 };
  const tohum = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // tek çekiliş: kazanamayanların ödenen değeri düşer, tabana kadar; ücretsiz bilet (paid 0) 0 kalır
  const d = runDraw({ pool: 1e6, amortiPool: 0, holders: [{ id: 'a', tickets: 100, paid: 100 }, { id: 'b', tickets: 100, paid: 100 }, { id: 'c', tickets: 3, paid: 0 }] }, () => 0.0001, rules);
  const b = d.holders.find(h => h.id === 'b'), c = d.holders.find(h => h.id === 'c');
  assert.equal(d.winnerId, 'a');
  assert.ok(Math.abs(b.paid - 95) < 1e-9, `kaybeden biletin ödenen değeri %5 düşer: ${b.paid}`);
  assert.equal(b.tickets, 100, 'bilet sayısı yanmaz (devreder)');
  assert.equal(c.paid, 0, 'ücretsiz biletin değeri 0 kalır');
  let h = { id: 'x', tickets: 10, paid: 10 };
  for (let i = 0; i < 80; i++) h = runDraw({ pool: 1e6, amortiPool: 0, holders: [{ id: 'w', tickets: 1000, paid: 1000 }, h] }, () => 0.0001, rules).holders.find(z => z.id === 'x');
  assert.ok(Math.abs(h.paid - 10 * 0.5) < 1e-6, `yaşlanma tabanı bilet fiyatının yarısı: ${h.paid}`);
  // 520 hafta, 100 hesap × 100 bilet/hafta: kasa bilet gelirinin ~%89'unu ödüyor (eski: %175)
  const rng = tohum(1);
  let pool = 12e6, amorti = 0, odenen = 0, kazanilan = 0;
  const holders = Array.from({ length: 100 }, (_, i) => ({ id: 'a' + i, tickets: 0, paid: 0 }));
  for (let w = 0; w < 520; w++) {
    for (const x of holders) { x.tickets += 100; x.paid += 100; pool += 98; amorti += 2; odenen += 100; }
    const r = runDraw({ pool, amortiPool: amorti, holders }, rng, rules);
    if (r.drawn) { pool = r.pool; amorti = r.amortiPool; for (const nh of r.holders) { const o = holders.find(z => z.id === nh.id); o.tickets = nh.tickets; o.paid = nh.paid; } kazanilan += r.payouts.filter(p => p.kind === 'prize').reduce((s, p) => s + p.amount, 0); }
  }
  const oran = kazanilan / odenen;
  assert.ok(oran < 1.0, `ödeme / bilet geliri 1'in altında olmalı: ${oran.toFixed(3)}`);
  assert.ok(pool > 12e6 * 0.9, `520 haftada piyango kasası erimemeli: ${(pool / 1e6).toFixed(2)} M`);
  ok(`EK-08: devreden bilet yaşlanıyor (taban 0,5×); 520 hafta × 100 hesap: ödeme/gelir ${oran.toFixed(2)} (eski 1,75), kasa ${(pool / 1e6).toFixed(1)} M (eski 8,0 M)`);
}
{
  // çark parça bileti ücretsizdir: ödenen tutar artmaz (eskiden bilet fiyatına eşitleniyordu)
  const gs = yeni();
  gs.state.lotteryTickets = 2;
  gs.state.lotteryTicketsPaid = null;                    // henüz bilet satın alınmamış kayıt
  gs.state.wheelTicketShards = 2;
  treasury.state.pools.carnival = 5e6;
  gs._carkOduluSec = () => ({ type: 'ticket_shard', name: '🎟️ Bilet parçası', icon: '🎟️', weight: 1, valAda: 0 });
  gs.state.adAstraBalance = 100;
  const r = gs.spinCarnivalWheel('ada');
  assert.equal(r.success, true, r.message);
  assert.equal(gs.state.lotteryTickets, 3, 'üç parça bir bilet verdi');
  const fiyat = gs.getLotteryRules().ticketPrice;
  assert.equal(gs.state.lotteryTicketsPaid, 2 * fiyat, 'ödenen tutar yalnız satın alınan 2 bilet');
  assert.equal(lotteryTicketPrice(1, 0.4), 0.4, 'sunucu bilet fiyatı 1 × 0,4 → 0,4 (eski: Math.round → 0)');
  assert.ok(lotteryTicketPrice(1, 0.0001) > 0);
  ok('EK-08: çark parça bileti ödenmiş sayılmıyor; sunucu bilet fiyatı 1 × 0,4 çarpanda 0 olmuyor');
}

// ═══ EK-10: kasa ömrü yalnız oyuncuya ödeme yapan kasalarla ═══
{
  const havuzlar = { dungeon: 10e6, arena: 4e6, worldBoss: 6e6, ammBuyback: 7e6, quest: 8e6, carnival: 3e6, fatih: 20e6, konsey: 10e6, universe: 20e6 };
  const hepsi = runwayPoolTotal(havuzlar);
  const odeyen = runwayPoolTotal(havuzlar, GAME_CONFIG.TREASURY_RUNWAY_POOLS);
  assert.equal(hepsi, 88e6);
  assert.equal(odeyen, 31e6, 'yalnız dungeon + arena + worldBoss + quest + carnival');
  const aylik = 120000 * 4.33;
  const esitle = (ay) => { let m = 1; for (let i = 0; i < 40; i++) m = nextMultiplier({ current: m, priceUsd: 2e-7, launchPriceUsd: 2e-7, runwayMonths: ay }); return m; };
  const eski = esitle(hepsi / aylik);          // haftada ≤ %5 adımla 40 hafta sonra oturduğu değer
  const yeniM = esitle(odeyen / aylik);
  assert.ok(hepsi / aylik > 60, 'eski hesap: >60 ay → %20 ek indirim');
  assert.ok(odeyen / aylik < 60 && odeyen / aylik > 36, 'yeni hesap 36-60 ay arası → %10');
  assert.ok(eski < yeniM, `çarpan hedefi eskiden daha düşüktü: ${eski} < ${yeniM}`);
  assert.ok(Math.abs(eski - 0.8) < 1e-6 && Math.abs(yeniM - 0.9) < 1e-6);
  ok(`EK-10: kasa ömrü ${(hepsi / aylik).toFixed(0)} ay → ${(odeyen / aylik).toFixed(0)} ay; kalıcı fiyat çarpanı ${eski} → ${yeniM}`);
}

// ═══ EK-09: model betikleri oyun yapılandırmasından okur ve hedefleri tutturur ═══
{
  for (const f of ['scripts/model/denge_modeli.mjs', 'scripts/model/astra_fiyat_yolu.mjs']) {
    const kaynak = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.match(kaynak, /js\/config\.js/, `${f} GAME_CONFIG'ten okumalı`);
  }
  const denge = fs.readFileSync(new URL('../scripts/model/denge_modeli.mjs', import.meta.url), 'utf8');
  assert.ok(!/otoriteAstraBirim: 0\.05/.test(denge) && !/TABAN = \{ bugday: 1800/.test(denge), 'v1 sabitleri kalmamalı');
  const r = spawnSync(process.execPath, ['scripts/model/denge_modeli.mjs', 'N=100'], { cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  const son = JSON.parse(r.stdout.trim().split('\n').pop().replace(/^SONUÇ /, ''));
  assert.equal(son.P.pazar, GAME_CONFIG.AMM_SEED_ASTRA.raw, 'pazar tohumu config\'ten');
  assert.equal(son.passed, 5, `denge modeli 5/5 hedef: ${JSON.stringify(son.checks)}`);
  ok('EK-09: denge modeli GAME_CONFIG\'ten okuyor ve N=100\'de 5/5 hedefi tutturuyor');
}

console.log(`\n${gecen} denetim ekonomi bloğu geçti.`);
