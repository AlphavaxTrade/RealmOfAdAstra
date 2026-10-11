// Pazar: hızlı al planı (levelup / warehouse / craft), depoyu doldur, sat/al kuralları.
import assert from 'node:assert/strict';

globalThis.window = { dispatchEvent() {}, addEventListener() {} };
const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { GAME_CONFIG } = await import('../js/config.js');

ammMarket.resetPools();
const gs = new GameStateManager();
const s = gs.state;
s.adAstraBalance = 1e6;

// Dövme planı kömürü de içerir (dövme kömür ister; eskiden plan kömürü atlıyordu)
{
  s.inventory.iron = 0; s.inventory.wood = 0; s.inventory.coal = 0; s.inventory.fragments = 0;
  const yuva = Object.keys(GAME_CONFIG.EQUIPMENT_RECIPES)[0];
  const bedel = gs.calculateEquipmentCraftCost(yuva);
  assert.ok(bedel.coalCost > 0, 'bu tarif kömür istemeli');
  const plan = gs.getQuickBuyPlan('craft:' + yuva);
  const kalem = Object.fromEntries(plan.items.map((i) => [i.res, i.qty]));
  assert.equal(kalem.coal, bedel.coalCost, 'plan kömürü alır');
  assert.equal(kalem.iron, bedel.ironCost);
  assert.equal(kalem.wood, bedel.woodCost);
  assert.equal(kalem.fragments, bedel.fragCost);
  assert.equal(plan.ok, true, plan.reason);

  // Planı uygula: kalemler alınır ve dövme gerçekten yapılır
  for (const i of plan.items) assert.equal(gs.marketBuy(i.res, i.qty).success, true, `${i.res} alındı`);
  assert.equal(gs.craftEquipment(yuva).success, true, 'planla alınan malzemeyle dövüldü');
}

// Geçersiz tür
assert.equal(gs.getQuickBuyPlan('olmayan').ok, false);
assert.equal(gs.getQuickBuyPlan('craft:yok').ok, false);

// Silo planı: hem yükseltme bedeli hem %80 dolu şartı karşılanır
{
  for (const k of GAME_CONFIG.RESOURCE_KEYS) s.inventory[k] = 0;
  const plan = gs.getQuickBuyPlan('warehouse');
  const bedel = gs.getWarehouseUpgradeCost();
  for (const k of bedel.keys) {
    const hedef = Math.max(bedel.costs[k] || 0, bedel.fills[k] || 0);
    const kalem = plan.items.find((i) => i.res === k);
    if (hedef > 0) assert.equal(kalem && kalem.qty, hedef, `${k} hedefi`);
  }
}

// Depoyu doldur: bakiye yeterliyse boş yerin tamamı, yetmezse bütçeye sığan en büyük miktar
{
  s.inventory.wood = 0;
  s.adAstraBalance = 1e6;
  const tam = gs.getFillWarehouseQty('wood');
  assert.equal(tam.limitedByAda, false);
  assert.equal(tam.qty, tam.room);

  s.adAstraBalance = tam.cost / 4;
  const kisitli = gs.getFillWarehouseQty('wood');
  assert.equal(kisitli.limitedByAda, true);
  assert.ok(kisitli.qty > 0 && kisitli.qty < kisitli.room);
  assert.ok(kisitli.cost <= s.adAstraBalance, 'bütçeyi aşmaz');
  assert.ok(ammMarket.getEstimatedCostForBuy('wood', kisitli.qty + 1) > s.adAstraBalance, 'bir fazlası sığmaz');
}

// Sat / al
{
  s.adAstraBalance = 1000;
  s.inventory.iron = 100;
  assert.equal(gs.marketSell('iron', 0).success, false);
  assert.equal(gs.marketSell('iron', 101).success, false, 'elindekinden fazlası satılmaz');
  const once = s.adAstraBalance;
  const sat = gs.marketSell('iron', 40);
  assert.equal(sat.success, true);
  assert.equal(s.inventory.iron, 60);
  assert.ok(s.adAstraBalance > once);

  s.adAstraBalance = 0;
  assert.equal(gs.marketBuy('iron', 10).success, false, 'parasızken alınmaz');
  s.adAstraBalance = 1e6;
  const kap = gs.getWarehouseCapacity().iron;
  assert.equal(gs.marketBuy('iron', kap + 1).success, false, 'silo kapasitesi aşılmaz');
  const al = gs.marketBuy('iron', 5);
  assert.equal(al.success, true);
  assert.equal(s.inventory.iron, 65);
}
console.log('✅ pazar hızlı al planı, depoyu doldur, sat/al');
