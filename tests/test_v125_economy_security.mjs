// v1.25 — Ekonomi güvenliği ve denetim bulgularının kalıcı testleri
// Her bölüm, 29 Eylül 2026 denetiminde bulunan bir açığın bir daha geri gelmediğini doğrular.
import assert from 'node:assert/strict';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const { GameStateManager } = await import('../js/gameState.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool, GlobalResourceManager } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');
const { GAME_CONFIG } = await import('../js/config.js');

const fresh = () => {
  localStorage.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  return new GameStateManager();
};
const botOn = (gs, hours = 24) => {
  const t = Date.now() + hours * 3600e3;
  gs.state.botActiveUntil = t; gs.state.tavernaBotActive = true; gs.state.tavernaBotExpiresAt = t;
};
let passed = 0;
const ok = (name) => { passed++; console.log(`✅ ${name}`); };

// 1) Piyango: kazanmadan "2 katını çek" çalışmaz, kasa yüklemede kendiliğinden dolmaz
{
  const gs = fresh();
  gs.state.adAstraBalance = 10000;
  for (let i = 0; i < 10; i++) { gs.buyLotteryTickets(100); gs.claimWinnerLotteryPayout(); }
  assert.ok(gs.state.adAstraBalance <= 10000, `Kazanmadan para çıkmamalı (bakiye ${gs.state.adAstraBalance})`);
  gs.state.lotteryPool = 1234;
  gs.saveState();
  const gs2 = new GameStateManager();
  assert.equal(gs2.state.lotteryPool, 1234, 'Piyango kasası yüklemede 20M\'a tamamlanmamalı');
  // Takvimli çekiliş: aynı hafta içinde ikinci kez çekiliş olmaz
  const before = gs2.state.lastLotteryDrawEpoch;
  assert.equal(gs2.processScheduledLottery(), null, 'Aynı haftada çekiliş tetiklenmemeli');
  assert.equal(gs2.state.lastLotteryDrawEpoch, before);
  ok('Piyango: kazanmadan ödeme yok, kasa kendiliğinden dolmuyor, çekiliş takvimli');
}

// 2) Çark: beklenen geri dönüş %100'ün altında; kasa yetersizse çark kapalı
{
  const rewards = GAME_CONFIG.CARNIVAL.WHEEL_REWARDS;
  const tw = rewards.reduce((s, r) => s + r.weight, 0);
  const ev = rewards.reduce((s, r) => s + (r.valAda || 0) * r.weight, 0) / tw;
  assert.ok(ev < (GAME_CONFIG.CARNIVAL.WHEEL_COST_ADA || 100), `Çarkın ortalama değeri (${ev.toFixed(1)}) çevirme bedelinin altında olmalı`);
  const gs = fresh();
  treasury.state.pools.carnival = 100;
  gs.state.adAstraBalance = 1000;
  const r = gs.spinCarnivalWheel('ada');
  assert.equal(r.success, false, 'Kasa yetersizken çark çevrilmemeli');
  assert.equal(gs.state.adAstraBalance, 1000, 'Kapalı çark para almamalı');
  // Kasa varken ASTRA ödülü kasadan düşer
  treasury.state.pools.carnival = 1e6;
  const orig = Math.random; Math.random = () => 0.5;
  const saved = GAME_CONFIG.CARNIVAL.WHEEL_REWARDS;
  GAME_CONFIG.CARNIVAL.WHEEL_REWARDS = [{ id: 'ada_200', name: '200', icon: '🟣', type: 'ada', amount: 200, valAda: 200, weight: 1 }];
  const poolBefore = treasury.getPool('carnival');
  const spin = gs.spinCarnivalWheel('ada');
  GAME_CONFIG.CARNIVAL.WHEEL_REWARDS = saved; Math.random = orig;
  assert.ok(spin.success);
  assert.ok(Math.abs(poolBefore - treasury.getPool('carnival') - 200) < 1e-6 || treasury.getPool('carnival') < poolBefore,
    'ADA ödülü karnaval kasasından düşmeli');
  ok(`Çark: ortalama geri dönüş %${ev.toFixed(1)}, boş kasada kapalı, ödül kasadan`);
}

// 3) Kolezyum: zafer ödülü arena kasasından çekilir
{
  const gs = fresh();
  gs.state.adAstraBalance = 1e6;
  gs.buySoldierUnit();
  gs.state.soldierUnits[0].level = 60; gs.state.soldierUnits[0].maxHp = 5000; gs.state.soldierUnits[0].hp = 5000; gs.state.soldierUnits[0].baseAtk = 900;
  gs.state.stamina = 500;
  const arenaBefore = treasury.getPool('arena');
  const adaBefore = gs.state.adAstraBalance;
  const ucret = gs.getColosseumEntryFee();
  const pay = GAME_CONFIG.COLOSSEUM.ENTRY_ARENA_SHARE;
  const res = gs.executeColosseum1v1Match(0);
  const won = gs.state.adAstraBalance - adaBefore + ucret;   // ücret düştükten sonra kazanılan ödül
  // Giriş ücretinin arena payı kasaya girer; ödül kasadan çekilir (kasa değişimi = ücret payı + dağılımdan gelen küçük pay − ödül)
  if (res && res.isVictory !== false && won > 0) {
    const fark = treasury.getPool('arena') - arenaBefore;
    assert.ok(fark >= ucret * pay - won - 1e-6 && fark <= ucret - won + 1e-6, 'Kazanılan ASTRA arena kasasından düşmeli, ücretin arena payı kasaya girmeli');
  }
  assert.ok(treasury.getPool('arena') <= arenaBefore + ucret + 1e-6, 'Arena kasası ücretten fazla artmamalı');
  ok('Kolezyum: ödül arena kasasından çekiliyor');
}

// 4) Asker ismi sayfa yenilenince korunur
{
  const gs = fresh(); gs.state.adAstraBalance = 10000; gs.buySoldierUnit();
  gs.renameSoldierUnit(0, 'Kara Şövalye');
  const gs2 = new GameStateManager();
  assert.equal(gs2.state.soldierUnits[0].name, 'Kara Şövalye');
  ok('Asker ismi yenilemede korunuyor');
}

// 5) Depodaki tek eşya bütün askerlere güç vermez
{
  const gs = fresh(); gs.state.adAstraBalance = 1e7;
  gs.state.dungeonProgress = 7;   // 3. kat: asker hakkı 4 (js/economy/ordu-hakki.js)
  for (let i = 0; i < 3; i++) gs.buySoldierUnit();
  gs.state.equipment.weapon = { name: 'Test Kılıcı', slot: 'weapon', level: 5, atkBonus: 53, hpBonus: 0, durability: 13 };
  const atk = [0, 1, 2].map(i => gs.getSoldierFullStats(i).totalAtk);
  assert.deepEqual(atk, [25, 25, 25], 'Kuşanılmamış eşya kimseye bonus vermemeli');
  ok('Depo eşyası kopyalanmıyor');
}

// 6) Pazar taban fiyatı + gerçek %2 yakım
{
  fresh();
  const floor = GAME_CONFIG.AMM_CORRIDORS.wood.minPriceAda;
  const r = ammMarket.executeSell('wood', ammMarket.getMaxSellBeforeFloor('wood') + 5000);
  assert.equal(r.success, false, 'Tabanı delen satış reddedilmeli');
  assert.ok(r.maxSellable > 0);
  const ok2 = ammMarket.executeSell('wood', r.maxSellable);
  assert.ok(ok2.success, 'İzin verilen en büyük satış yapılabilmeli');
  assert.ok(ammMarket.getPrice('wood') >= floor - 1e-9, 'Fiyat tabanın altına inmemeli');
  const p = ammMarket.pools.iron; const before = p.resourceReserve;
  const s = ammMarket.executeSell('iron', 1000);
  assert.ok(Math.abs((p.resourceReserve - before) - 980) < 1e-9, '1.000 demirin 980\'i havuza girmeli (20\'si yakılır)');
  assert.equal(s.resourceBurnFee, 20);
  const b0 = p.resourceReserve;
  const buy = ammMarket.executeBuyAmount('iron', 1000);
  assert.ok(buy.success);
  assert.ok(Math.abs((b0 - p.resourceReserve) - 1020) < 1e-9, 'Alımda havuzdan 1.020 demir çıkmalı (20\'si yakılır)');
  assert.equal(buy.resourceReceived, 1000);
  ok('Pazar: taban fiyat korunuyor, %2 yakım gerçek');
}

// 7) Haftalık kota: yakım yenilemede geri gelmez
{
  fresh();
  globalPool.recordResourceBurn('wood', 50000);
  const capAfterBurn = globalPool.state.resources.wood.totalCap;
  const reloaded = new GlobalResourceManager();
  assert.equal(reloaded.state.resources.wood.totalCap, capAfterBurn, 'Yakılan kota sayfa yenilemede geri gelmemeli');
  ok('Kota: yakım yenilemede kalıcı');
}

// 8) Bot 25 saat kapalı kalınca işi kaybolmaz (bot süresi dolana kadar çalışır)
{
  const gs = fresh();
  // Haftanın hangi günü koşulduğuna bağlı olmasın: Üretim Hakkı haftaya yayılarak açılır (Pazartesi 1/7, Pazar 7/7);
  // bu senaryo çevrimdışı telafiyi sınar, haftalık açılımı değil. Hafta bitmek üzere (7/7 açık) kabul edilir.
  globalPool.state.epochEndTime = Date.now() + 3600e3;
  gs.state.warehouseLevel = 6;
  const c6 = gs.getWarehouseCapacity(6);
  gs.state.inventory = { ...Object.fromEntries(GAME_CONFIG.RESOURCE_KEYS.map(k => [k, Math.floor(c6[k] * 0.6)])), fragments: 0 };
  gs.state.adAstraBalance = 20000;
  gs.state.botSiloAutoUpgrade = false;
  const start = Date.now() - 25 * 3600e3;
  const t = start + 24 * 3600e3;
  gs.state.botActiveUntil = t; gs.state.tavernaBotActive = true; gs.state.tavernaBotExpiresAt = t;
  const rep = gs.processOfflineProgress(25 * 3600, start);
  assert.ok(rep.expeditionsClaimed >= 200, `24 saatlik bot işi telafi edilmeli (toplanan ${rep.expeditionsClaimed})`);
  assert.ok(rep.botWorkedSeconds >= 23.5 * 3600 && rep.botWorkedSeconds <= 24.5 * 3600, `Bot yalnızca kendi süresi kadar çalışmalı (${(rep.botWorkedSeconds / 3600).toFixed(1)} sa)`);
  ok(`Çevrimdışı telafi: 25 saatte ${rep.expeditionsClaimed} sefer, bot ${(rep.botWorkedSeconds / 3600).toFixed(1)} sa çalıştı`);
}

// 9) Bot parası yetmediğinde yoktan alım yapmaz
{
  const gs = fresh(); botOn(gs);
  const FLOOR = GAME_CONFIG.TAVERNA_BOT.REQUIRED_PREREQUISITES.adAstra;   // v2: 0,5 ASTRA
  gs.state.adAstraBalance = FLOOR + 0.02; gs.state.inventory = { wood: 0, iron: 0, wheat: 0, fragments: 0 };
  gs.autoBuyBotResourceDeficit(50);
  const inv = gs.state.inventory;
  const boughtValue = inv.wood * ammMarket.getPrice('wood') + inv.iron * ammMarket.getPrice('iron') + inv.wheat * ammMarket.getPrice('wheat');
  assert.ok(gs.state.adAstraBalance >= FLOOR - 1e-9, 'Bot ASTRA önkoşulunu harcamamalı');
  assert.ok(boughtValue <= 0.02 + 1e-6, `Harcanabilir 0,02 ASTRA'dan fazlası alınmamalı (alınan değer ${boughtValue.toFixed(3)})`);
  ok('Bot: parası yetmeden alım yok');
}

// 10) Az para + az malzemede sat-al kısır döngüsü yok
{
  const gs = fresh(); botOn(gs);
  gs.state.adAstraBalance = 0.4; gs.state.warehouseLevel = 6; gs.state.inventory = { wood: 30, iron: 700, wheat: 1500, fragments: 0 };   // v2: ASTRA da önkoşulun altında
  let sells = 0, buys = 0, woodSold = 0;
  const s0 = ammMarket.executeSell.bind(ammMarket), b0 = ammMarket.executeBuyAmount.bind(ammMarket);
  ammMarket.executeSell = (k, a) => { sells++; if (k === 'wood') woodSold += a; return s0(k, a); };
  ammMarket.executeBuyAmount = (k, a) => { buys++; return b0(k, a); };
  for (let i = 0; i < 600; i++) gs.updateBotPauseState();
  ammMarket.executeSell = s0; ammMarket.executeBuyAmount = b0;
  assert.equal(woodSold, 0, 'Eksik olan odun satılmamalı');
  assert.ok(sells + buys <= 6, `600 karede en fazla birkaç işlem olmalı (satış ${sells}, alış ${buys})`);
  assert.ok(gs.state.inventory.wood >= 50 && gs.state.adAstraBalance >= GAME_CONFIG.TAVERNA_BOT.REQUIRED_PREREQUISITES.adAstra, 'Eksikler kalıcı olarak tamamlanmalı');
  ok(`Bot: sat-al döngüsü yok (satış ${sells}, alış ${buys})`);
}

// 11) Bot silo yükseltirken güvenlik payı bırakır
{
  const gs = fresh(); botOn(gs);
  gs.state.botSiloAutoUpgrade = true;
  const c1 = gs.getWarehouseCapacity(1);
  gs.state.inventory = { ...Object.fromEntries(GAME_CONFIG.RESOURCE_KEYS.map(k => [k, c1[k]])), fragments: 0 };
  gs.state.adAstraBalance = gs.getWarehouseUpgradeCost().adAstra + 2;   // bedel var, güvenlik payı yok: fazlalık satılmalı
  gs.tryAutoUpgradeWarehouseWithAdaFinancing();
  assert.ok(gs.state.adAstraBalance >= gs.getBotAdaReserve() - 1e-6, `Yükseltme sonrası kasada güvenlik payı kalmalı (${gs.state.adAstraBalance.toFixed(0)})`);
  ok('Bot: silo yükseltmede güvenlik payı korunuyor');
}

// 12) Eski ucuz bot paketleri satın alınamaz; seviye üretim bonusu çalışır
{
  const gs = fresh(); gs.state.adAstraBalance = 1e6;
  assert.equal(gs.buyTavernBuff('auto_collector').success, false);
  assert.equal(gs.buyTavernBuff('auto_collector_monthly').success, false);
  assert.ok(Math.abs(gs.getLevelProductionMultiplier(10) - 1.09) < 1e-9);   // 5 Ekim 2026: seviye başına %1
  gs.state.level = 10;
  assert.ok(Math.abs(gs.getResourceRatePerMinute('wood') - GAME_CONFIG.BASE_PRODUCTION.wood * 1.09 * gs.getVillageProductionMultiplier('wood')) < 1e-9);   // v2: köylü bonusu dahil
  ok('Eski bot paketleri kapalı, seviye bonusu +%1/seviye');
}

// 13) Yeni oyuncu rehberi ödülü Görev kasasından çekilir, bir kez alınır
{
  const gs = fresh();
  gs.startExpedition('wood');
  gs.checkOnboardingProgress();
  const questBefore = treasury.getPool('quest');
  const adaBefore = gs.state.adAstraBalance;
  const r1 = gs.claimOnboardingReward('first_expedition');
  assert.ok(r1.success && r1.granted > 0);
  assert.equal(gs.state.adAstraBalance - adaBefore, r1.granted);
  assert.ok(Math.abs((questBefore - treasury.getPool('quest')) - r1.granted) < 1e-6, 'Ödül görev kasasından düşmeli');
  assert.equal(gs.claimOnboardingReward('first_expedition').success, false, 'Ödül ikinci kez alınamamalı');
  ok('Rehber: ödül hazineden, tek sefer');
}

// 14) 3 günlük bot defteri: havadan kaynak ya da ASTRA üretilmez
{
  const gs = fresh();
  gs.state.warehouseLevel = 4;
  const c4 = gs.getWarehouseCapacity(4);
  gs.state.inventory = { ...Object.fromEntries(GAME_CONFIG.RESOURCE_KEYS.map(k => [k, Math.floor(c4[k] * 0.7)])), fragments: 0 };
  gs.state.adAstraBalance = 60000;
  gs.setBotSiloOption(false);
  gs.setBotAutoRenew24h(true);
  const R = GAME_CONFIG.RESOURCE_KEYS;   // v2: 6 hammaddenin tamamı defterde
  const L = { h: {}, b: {}, s: {}, burn: {}, adaSell: 0, adaBuy: 0, adaSpent: 0, adaTreasury: 0 };
  R.forEach(r => { L.h[r] = 0; L.b[r] = 0; L.s[r] = 0; L.burn[r] = 0; });
  const oH = globalPool.harvest.bind(globalPool); globalPool.harvest = (k, a) => { const g = oH(k, a); L.h[k] += g; return g; };
  let inAmm = false;
  const oS = ammMarket.executeSell.bind(ammMarket); ammMarket.executeSell = (k, a) => { inAmm = true; const r = oS(k, a); inAmm = false; if (r.success && R.includes(k)) { L.s[k] += a; L.adaSell += r.adAstraReceived; } return r; };
  const oB = ammMarket.executeBuyAmount.bind(ammMarket); ammMarket.executeBuyAmount = (k, a) => { inAmm = true; const r = oB(k, a); inAmm = false; if (r.success && R.includes(k)) { L.b[k] += r.resourceReceived; L.adaBuy += r.cost; } return r; };
  const oT = globalPool.recordTokenSpend.bind(globalPool); globalPool.recordTokenSpend = (a) => { if (!inAmm) L.adaSpent += a; return oT(a); };
  const oBurn = gs.burnResource.bind(gs); gs.burnResource = (k, a) => { if (R.includes(k)) L.burn[k] += Number(a) || 0; return oBurn(k, a); };
  const oW = treasury.withdraw.bind(treasury); treasury.withdraw = (id, a) => { const r = oW(id, a); L.adaTreasury += r.granted || 0; return r; };
  const start = { inv: { ...gs.state.inventory }, ada: gs.state.adAstraBalance };
  gs.buyTavernaAutomationBot(false);
  for (let d = 0; d < 3; d++) gs.fastForwardTime(24);
  globalPool.harvest = oH; ammMarket.executeSell = oS; ammMarket.executeBuyAmount = oB; globalPool.recordTokenSpend = oT; gs.burnResource = oBurn; treasury.withdraw = oW;
  for (const r of R) {
    const expected = start.inv[r] + L.h[r] + L.b[r] - L.s[r] - L.burn[r];
    assert.ok(Math.abs(gs.state.inventory[r] - expected) < 1e-6, `${r}: defter tutmalı (beklenen ${expected.toFixed(2)}, gerçek ${gs.state.inventory[r].toFixed(2)})`);
  }
  const expAda = start.ada + L.adaSell - L.adaBuy - L.adaSpent + L.adaTreasury;
  assert.ok(Math.abs(gs.state.adAstraBalance - expAda) < 1e-6, `ADA defteri tutmalı (beklenen ${expAda.toFixed(2)}, gerçek ${gs.state.adAstraBalance.toFixed(2)})`);
  ok('3 günlük bot defteri: havadan kaynak/ADA yok');
}

console.log(`\n🎉 v1.25 ekonomi güvenliği: ${passed} bölüm geçti.`);
