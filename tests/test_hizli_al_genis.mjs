// ⚡ Hızlı al planının yeni türleri (18 Ekim 2026): köy evi ('house'), roket ('rocket'), alet tamiri ('tool:<alet>'),
// zindan modu geçişinin kalan hammaddesi ('modgate'). Plan eksikleri doğru hesaplar; planla alınan malzemeyle işin kendisi yapılır.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: (k) => { depo.delete(k); } };
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

let sayac = 0;
const ok = (ad) => { sayac++; console.log(`✅ ${ad}`); };
const yeni = () => {
  depo.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  gs.state.adAstraBalance = 1e6;
  gs.state.warehouseLevel = 12;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 0;
  gs.state.inventory.fragments = 0;
  return gs;
};
const kalem = (plan) => Object.fromEntries(plan.items.map((i) => [i.res, i.qty]));
const planla = (gs, plan) => { for (const i of plan.items) assert.equal(gs.marketBuy(i.res, i.qty).success, true, `${i.res} alındı`); };

// 1) Köy evi: bedelin eksiği alınır, sonra ev yapılır; ev sınırında plan reddeder
{
  const gs = yeni();
  gs.state.level = 10;
  const bedel = gs.getVillageInfo().nextHouseCost;
  gs.state.inventory.wood = 100;   // kısmen var
  const plan = gs.getQuickBuyPlan('house');
  const k = kalem(plan);
  assert.equal(k.wood, bedel.wood - 100, 'eldeki odun düşülür');
  assert.equal(k.stone, bedel.stone); assert.equal(k.iron, bedel.iron);
  assert.equal(plan.ok, true, plan.reason);
  const evOnce = gs.getVillageInfo().houses;
  planla(gs, plan);
  assert.equal(gs.buildHouse().success, true, 'planla alınan malzemeyle ev yapıldı');
  assert.equal(gs.getVillageInfo().houses, evOnce + 1);
  gs.state.level = 1;   // ev sayısı hesap seviyesini geçemez
  const red = gs.getQuickBuyPlan('house');
  assert.equal(red.ok, false); assert.equal(red.items.length, 0);
  ok('köy evi planı eksikleri hesaplar, ev yapılır, seviye sınırında reddeder');
}

// 2) Roket: hammaddeler pazardan, 'adAstra' parçası işin kendi bedeli olarak eklenir
{
  const gs = yeni();
  gs.state.level = 5;
  const P = GAME_CONFIG.UZAY_LIMANI.ROCKET_PARTS;
  gs.state.warehouseLevel = 14;
  const plan = gs.getQuickBuyPlan('rocket');
  const k = kalem(plan);
  for (const [res, n] of Object.entries(P)) if (res !== 'adAstra') assert.equal(k[res], n, `${res} eksiği`);
  assert.equal(plan.extraAda, P.adAstra, 'ASTRA parçası işin bedeli');
  assert.ok(!('adAstra' in k), 'ASTRA pazardan alınmaz');
  if (!plan.ok) assert.ok(plan.reason, 'yapılamıyorsa nedeni yazılı (silo vb.)');
  else { planla(gs, plan); assert.equal(gs.buildRocket().success, true, 'planla alınan malzemeyle roket yapıldı'); assert.equal(gs.getQuickBuyPlan('rocket').ok, false, 'roket hazır: yeni plan yok'); }
  gs.state.level = 1;
  assert.equal(yeni().getQuickBuyPlan('rocket').ok, false, 'seviye yetmezse plan reddeder');
  ok('roket planı hammaddeyi ve ASTRA parçasını ayırır, seviye şartını sorar');
}

// 3) Alet tamiri: odun + demir eksiği, ASTRA işin bedeli
{
  const gs = yeni();
  const alet = Object.keys(GAME_CONFIG.TOOLS)[0];
  assert.equal(gs.getQuickBuyPlan(`tool:${alet}`).ok, false, 'sağlam alet için plan yok');
  gs.state.tools[alet].durability = 0;
  const bedel = gs.calculateRepairCost(alet);
  const plan = gs.getQuickBuyPlan(`tool:${alet}`);
  const k = kalem(plan);
  assert.equal(k.wood || 0, bedel.woodCost); assert.equal(k.iron || 0, bedel.ironCost);
  assert.equal(plan.extraAda, bedel.adAstraCost);
  assert.equal(plan.ok, true, plan.reason);
  planla(gs, plan);
  assert.equal(gs.repairTool(alet).success, true, 'planla alınan malzemeyle alet onarıldı');
  assert.equal(gs.getQuickBuyPlan('tool:yok').ok, false, 'bilinmeyen alet');
  ok('alet tamiri planı odun ve demiri alır, alet onarılır');
}

// 4) Zindan modu geçişi: kalan hammadde (verilenler düşülür) + son adımdaki ASTRA
{
  const gs = yeni();
  assert.equal(gs.getQuickBuyPlan('modgate').ok, false, 'son boss yenilmeden plan yok');
  gs.state.dungeonMode = 0; gs.state.dungeonProgress = 19;   // Normal mod bitti
  const g0 = gs.getDungeonModeInfo().gecis;
  assert.ok(g0 && Object.keys(g0.kalan).length, 'önkoşul: geçiş bedeli var');
  const plan = gs.getQuickBuyPlan('modgate');
  const k = kalem(plan);
  for (const [res, n] of Object.entries(g0.kalan)) if (n > 0) assert.equal(k[res], n, `${res} kalanı`);
  assert.equal(plan.extraAda, g0.astra, 'ASTRA bedeli işin payı');
  // Silo hepsini birden tutmayabilir: plan kapasiteye takılmaz (katkı tur tur verilir)
  assert.equal(plan.capBlocked, false);
  // Kısmi katkı verilince plan küçülür
  const ilk = Object.keys(g0.kalan)[0];
  gs.state.inventory[ilk] = 10;
  assert.equal(gs.contributeToDungeonGate({ [ilk]: 10 }).success, true);
  const plan2 = gs.getQuickBuyPlan('modgate');
  assert.equal(kalem(plan2)[ilk], g0.kalan[ilk] - 10, 'verilen katkı düşülür');
  ok('mod geçişi planı kalan hammaddeyi ve ASTRA bedelini verir, katkıyla küçülür');
}

console.log(`\n${sayac} hızlı al (yeni türler) testi geçti`);
