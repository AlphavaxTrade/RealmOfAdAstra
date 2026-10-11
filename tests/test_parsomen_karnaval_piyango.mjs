// Parşömenler, karnaval çarkının ödeme ve ödül muhasebesi, piyango kuralları, Pandora kutusu ve pazar yakımı.
// 11 Ekim 2026'da test_carnival_wheel_and_scrolls.mjs, test_carnival_treasury_buyback_and_amorti.mjs ve
// test_new_mechanics_v106.mjs'in karnaval bölümlerinden baştan yazıldı (rastgelelik sabitlenir; "50 deneme" yok).
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

const yeni = () => {
  depo.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  return new GameStateManager();
};
const gercekRastgele = Math.random;
const yakin = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// 1) Parşömenler: iyileştirme +10 can (dolu canda harcanmaz, kimliğe göre hedeflenir), stamina +100 (sınırlı), onarım parşömeni kaldırıldı
{
  const gs = yeni();
  const s = gs.state;
  const asker = gs.createSoldierUnit(1);
  asker.hp = 50;
  s.soldierUnits = [asker];
  s.inventory.scroll_heal = 2;
  assert.equal(gs.useScroll('scroll_heal').success, true);
  assert.equal(asker.hp, 60);
  assert.equal(s.inventory.scroll_heal, 1);
  asker.hp = asker.maxHp;
  assert.equal(gs.useScroll('scroll_heal').success, false, 'dolu canda harcanmaz');
  assert.equal(s.inventory.scroll_heal, 1);

  s.soldierUnits = [{ id: 'sol_101', name: 'Piyade', hp: 30, maxHp: 100 }, { id: 'sol_102', name: 'Okçu', hp: 40, maxHp: 100 }];
  assert.equal(gs.useScroll('scroll_heal', 'sol_102').success, true);
  assert.equal(s.soldierUnits[1].hp, 50);
  assert.equal(s.soldierUnits[0].hp, 30, 'hedeflenmeyen asker etkilenmez');

  s.level = 10;
  const enCok = gs.getMaxStamina();
  s.stamina = 50;
  s.inventory.scroll_stamina = 2;
  assert.equal(gs.useScroll('scroll_stamina').success, true);
  assert.equal(s.stamina, 150);
  s.stamina = enCok - 25;
  assert.equal(gs.useScroll('scroll_stamina').success, true);
  assert.equal(s.stamina, enCok, 'stamina üst sınırla kesilir');
  assert.equal(gs.useScroll('scroll_stamina').success, false, 'parşömen bitince reddedilir');

  s.inventory.scroll_repair = 1;
  const onarim = gs.useScroll('scroll_repair');
  assert.equal(onarim.success, false);
  assert.ok(onarim.message.includes('Demirci'), 'onarım parşömeni oyuncuyu Demirciye yönlendirir');

  // zindan zaferinde parşömen düşebilir (rastgelelik sabit: en şanslı sonuç)
  Math.random = () => 0;
  try {
    const dusen = gs.addDungeonXpAndDrops(1, true);
    assert.ok(dusen && dusen.scrollGained, 'şans sabitlenince boss zaferinde parşömen düşer');
  } finally { Math.random = gercekRastgele; }
}
console.log('✅ parşömenler');

// 2) Çark: hammaddeyle ödeme (yarısı yakılır, yarısı satılıp karnaval kasasına), amorti parçaları, ASTRA ödülü kasadan
{
  const gs = yeni();
  const s = gs.state;
  s.warehouseLevel = 18;
  for (const res of ['wood', 'iron', 'wheat']) {
    s.inventory[res] = 5000;
    const fiyat = ammMarket.getPrice(res) || 1;
    const bedel = Math.ceil(gs.getWheelCostAda() / fiyat);
    const yakilan = (s.burnedResources && s.burnedResources[res]) || 0;
    const r = gs.spinCarnivalWheel(res);
    assert.equal(r.success, true, `${res} ile çevirme`);
    const bi = r.burnedInfo;
    assert.ok(bi && bi.resource === res);
    assert.equal(bi.amount + bi.soldQty, bedel, 'yakılan + satılan = ödenen');
    assert.equal(bi.soldQty, Math.floor(bedel / 2), 'yarısı pazarda satılır');
    assert.ok(bi.carnivalIn > 0, 'satıştan gelen ASTRA karnaval kasasına girer');
    assert.equal(s.burnedResources[res] - yakilan, bi.amount, 'kalan yarı yakılır');
  }
}
{
  const gercekDilimler = GAME_CONFIG.CARNIVAL.WHEEL_REWARDS;
  const dilimle = (dilim) => { GAME_CONFIG.CARNIVAL.WHEEL_REWARDS = [dilim]; };
  try {
    // 3 bilet parçası = 1 bilet
    const gs = yeni();
    treasury.state.pools.carnival = 5000000;
    gs.state.adAstraBalance = 1000;
    gs.state.wheelTicketShards = 0;
    gs.state.lotteryTickets = 0;
    dilimle({ id: 'wheel_ticket_shard', name: 'Amorti Çark Bileti (3 Adet = 1 Çevirme)', icon: '🎟️', type: 'ticket_shard', amount: 1 });
    gs.spinCarnivalWheel('ada'); gs.spinCarnivalWheel('ada');
    assert.equal(gs.state.wheelTicketShards, 2);
    assert.equal(gs.state.lotteryTickets, 0);
    const ucuncu = gs.spinCarnivalWheel('ada');
    assert.equal(gs.state.wheelTicketShards, 0, 'üç parça bir bilete döner');
    assert.equal(gs.state.lotteryTickets, 1);
    assert.ok(ucuncu.rewardSummaryText.includes('+1 Çark Çevirme / Piyango Bileti'));

    // ASTRA ödülü havadan basılmaz: kasadan çıkar
    const once = gs.state.adAstraBalance;
    dilimle({ id: 'ada_200', name: '200 ASTRA', icon: '🟣', type: 'ada', amount: 200, valAda: 200 });
    const ada = gs.spinCarnivalWheel('ada');
    assert.ok(treasury.state.outflow.carnival >= 200, 'ödül karnaval kasasından çıkış sayılır');
    assert.equal(gs.state.adAstraBalance, once - gs.getWheelCostAda() + 200);
    assert.ok(ada.rewardSummaryText.includes('Karnaval Hazinesinden Karşılandı'));

    // hammadde ödülü: kasa pazardan satın alıp verir, fiyat yükselir
    const cikis = treasury.state.outflow.carnival;
    const rezerv = ammMarket.pools.wood.resourceReserve;
    const fiyat = ammMarket.getPrice('wood');
    const odun = gs.state.inventory.wood || 0;
    dilimle({ id: 'raw_5_wood', name: '5 ASTRA Değerinde Odun', icon: '🌲', type: 'amm_raw', key: 'wood', adaVal: 5, valAda: 5 });
    const hammadde = gs.spinCarnivalWheel('ada');
    assert.ok(hammadde.buybackInfo);
    assert.equal(treasury.state.outflow.carnival, cikis + hammadde.buybackInfo.adaSpent);
    assert.ok(Math.abs(ammMarket.pools.wood.resourceReserve - (rezerv - hammadde.buybackInfo.amount * 1.02)) < 1e-3, 'havuzdan miktar + %2 yakım çıkar');
    assert.equal(gs.state.inventory.wood, odun + hammadde.buybackInfo.amount);
    assert.ok(hammadde.buybackInfo.newPrice > fiyat, 'fiyat yükselir');

    // anahtar ödülü
    const anahtar = gs.state.arenaKeys || 0;
    const anahtarFiyat = ammMarket.getPrice('keys');
    dilimle({ id: 'box_key', name: '1 Pandora Kutusu Anahtarı', icon: '🔑', type: 'key', amount: 1, valAda: 1000 });
    const k = gs.spinCarnivalWheel('ada');
    assert.equal(gs.state.arenaKeys, anahtar + 1);
    assert.ok(k.buybackInfo.newPrice > anahtarFiyat);
  } finally {
    GAME_CONFIG.CARNIVAL.WHEEL_REWARDS = gercekDilimler;
  }
}
console.log('✅ çark ödeme ve ödül muhasebesi');

// 3) Piyango: haftada en çok 100 bilet, kazanmadan çekim reddedilir, kazanç bir kez ödenir, elle amorti kapalı
{
  const gs = yeni();
  const s = gs.state;
  s.adAstraBalance = 50000;
  assert.equal(gs.buyLotteryTickets(105).success, false, '100 biletten fazlası alınamaz');
  assert.equal(gs.buyLotteryTickets(50).success, true);
  assert.equal(s.lotteryTickets, 50);
  assert.equal(gs.buyLotteryTickets(51).success, false, 'toplam 101 olacağı için reddedilir');

  // tohum kasası + 5 bilet; amorti payı ayrılır
  const t = yeni();
  t.state.adAstraBalance = 50000;
  t.state.lotteryTickets = 0;
  t.state.lotteryPool = GAME_CONFIG.CARNIVAL.LOTTERY.SEED_POOL_ADA;
  assert.equal(t.buyLotteryTickets(5).success, true);
  const L = GAME_CONFIG.CARNIVAL.LOTTERY;
  assert.ok(yakin(t.state.lotteryPool + (t.state.lotteryAmortiPool || 0), L.SEED_POOL_ADA + 5 * L.TICKET_COST_ADA));
  assert.ok(yakin(t.state.lotteryAmortiPool, 5 * L.TICKET_COST_ADA * L.AMORTI_SHARE));
  const cekilis = t.drawWeeklyLottery();
  assert.equal(cekilis.drawn, true);
  assert.ok(cekilis.rolloverPool > 0, 'kasa sonraki haftaya devreder');
  const elle = t.burnLotteryTicketsForAmorti(1);
  assert.ok(!elle.success && elle.message.includes('çark'), 'elle amorti kapalı, çarka yönlendirir');

  // kazanmadan "2 katını çek" reddedilir; kazanınca bekleyen ödül bir kez çekilir
  const g = yeni();
  g.state.lotteryTickets = 10;
  g.state.lotteryPool = 20000000;
  g.state.lotteryPendingPayout = 0;
  const bakiye = g.state.adAstraBalance;
  assert.equal(g.claimWinnerLotteryPayout().success, false);
  assert.equal(g.state.adAstraBalance, bakiye);
  assert.equal(g.state.lotteryTickets, 10);
  const odul = 10 * g.getLotteryRules().ticketPrice * 2;
  Math.random = () => 0;
  let cek;
  try { cek = g.drawWeeklyLottery(); } finally { Math.random = gercekRastgele; }
  assert.equal(cek.userWon, true);
  assert.equal(cek.wonAmount, odul);
  assert.equal(g.state.lotteryPendingPayout, odul);
  assert.equal(g.state.lotteryTickets, 0);
  assert.equal(g.state.adAstraBalance, bakiye, 'çekilene kadar bakiyeye eklenmez');
  const al = g.claimWinnerLotteryPayout();
  assert.equal(al.success, true);
  assert.equal(al.payoutAda, odul);
  assert.equal(g.state.adAstraBalance, bakiye + odul);
  assert.equal(g.claimWinnerLotteryPayout().success, false, 'aynı kazanç ikinci kez çekilemez');
}
console.log('✅ piyango');

// 4) Pandora kutusu anahtar ister; pazar fiyatları koridor içinde; pazar işlemlerinde %2 hammadde yakımı; hazine dağılımı
{
  const gs = yeni();
  const s = gs.state;
  s.lockedBoxes = 2;
  s.arenaKeys = 0;
  const anahtarsiz = gs.unboxMysteryBox();
  assert.equal(anahtarsiz.success, false);
  assert.ok(anahtarsiz.message.includes('Anahtar'));
  s.arenaKeys = 1;
  assert.equal(gs.unboxMysteryBox().success, true);
  assert.equal(s.lockedBoxes, 1);
  assert.equal(s.arenaKeys, 0);
  const C = GAME_CONFIG.AMM_CORRIDORS;
  for (const k of ['boxes', 'keys']) {
    const f = ammMarket.getPrice(k);
    assert.ok(f >= C[k].minPriceAda && f <= C[k].maxPriceAda, `${k} fiyatı koridor içinde: ${f}`);
  }

  assert.equal(GAME_CONFIG.AMM_FEE_RATE, 0.02);
  assert.ok(ammMarket.pools.scroll_heal && ammMarket.pools.scroll_stamina, 'iki parşömen havuzu var');
  assert.ok(!ammMarket.pools.scroll_repair, 'onarım parşömeni havuzu kaldırıldı');
  const once = ammMarket.getBurnedResources();
  const sat = ammMarket.executeSell('wood', 1000);
  assert.equal(sat.success, true);
  assert.equal(sat.resourceBurnFee, 20, '1000 odun satışında 20 odun yakılır');
  const al = ammMarket.executeBuyAmount('iron', 500);
  assert.equal(al.success, true);
  assert.equal(al.resourceBurnFee, 10, '500 demir alımında 10 demir yakılır');
  const sonra = ammMarket.getBurnedResources();
  assert.equal(Math.round(sonra.wood), Math.round(once.wood + 20));
  assert.equal(Math.round(sonra.iron), Math.round(once.iron + 10));
  assert.equal(Math.round(gs.getEconomyAndPoolsSummary().ammBurnedResources.wood), Math.round(sonra.wood));

  const ozet = gs.getEconomyAndPoolsSummary();
  assert.equal(ozet.burnRatePct, 5);
  assert.equal(ozet.ubiRatePct, 6);
  assert.equal(ozet.creatorRatePct, 3);
  assert.equal(ozet.treasuryRatePct, 86);
  const pay = ozet.allocations;
  assert.deepEqual(
    [pay.dungeon, pay.arena, pay.worldBoss, pay.ammBuyback, pay.quest, pay.carnival, pay.fatih, pay.konsey],
    [0.27, 0.14, 0.12, 0.15, 0.18, 0.04, 0.05, 0.05],
    'kasa payları (R3 kararı)'
  );
  assert.ok(Math.abs(Object.values(pay).reduce((a, v) => a + v, 0) - 1) < 1e-9, 'kasa payları toplamı 1');
  assert.equal(ozet.pools.length, Object.keys(GAME_CONFIG.TREASURY_SEED).length, 'bütün kasalar listelenir');
  const toplamYuzde = ozet.burnRatePct + ozet.ubiRatePct + ozet.creatorRatePct + ozet.pools.reduce((a, p) => a + p.sharePct, 0);
  assert.ok(Math.abs(toplamYuzde - 100) < 0.2, `dağılım toplamı %100: ${toplamYuzde}`);
}
console.log('✅ Pandora kutusu, pazar yakımı, hazine dağılımı');

console.log('\n4/4 parşömen, karnaval ve piyango bloğu geçti.');
