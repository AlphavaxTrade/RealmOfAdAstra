// Hammadde yakımı: stamina doldurma, alet onarımı, silo yükseltme ve asker iyileştirmede harcanan hammadde
// oyuncunun yakım sayacına yazılır ve dünya havuzunun toplam arzından düşer.
// 11 Ekim 2026'da test_universal_resource_burn.mjs'ten baştan yazıldı.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { URETIM_CARPANI } = await import('../js/config.js');
const { GameStateManager } = await import('../js/gameState.js');
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
const arz = (k) => globalPool.state.resources[k].totalCap;

// 1) Buğdayla stamina doldurma
{
  const gs = yeni();
  const s = gs.state;
  const once = arz('wheat');
  const yakilmis = s.burnedResources.wheat || 0;
  s.stamina = 50;
  s.inventory.wheat = 1000;
  const r = gs.refillStaminaExact(20);
  assert.equal(r.success, true);
  assert.ok(r.wheatUsed > 0);
  assert.equal(s.burnedResources.wheat, yakilmis + r.wheatUsed, 'oyuncunun yakım sayacı artar');
  assert.equal(arz('wheat'), once - r.wheatUsed, 'dünya toplam arzı azalır');
  assert.equal(globalPool.state.totalBurnedResources.wheat, r.wheatUsed, 'küresel yakım sayacı artar');
}
console.log('✅ stamina buğdayı yakılır');

// 2) Alet onarımı odun ve demir yakar
{
  const gs = yeni();
  const s = gs.state;
  const odun = arz('wood');
  const demir = arz('iron');
  s.tools.axe.durability = 4000;
  s.inventory.wood = 5000; s.inventory.iron = 5000;
  s.adAstraBalance = 100000;
  const maliyet = gs.calculateRepairCost('axe');
  assert.ok(maliyet.woodCost > 0 && maliyet.ironCost > 0);
  assert.equal(gs.repairTool('axe').success, true);
  assert.equal(s.burnedResources.wood, maliyet.woodCost);
  assert.equal(s.burnedResources.iron, maliyet.ironCost);
  assert.equal(arz('wood'), odun - maliyet.woodCost);
  assert.equal(arz('iron'), demir - maliyet.ironCost);
}
console.log('✅ alet onarımı odun ve demir yakar');

// 3) Silo yükseltme bütün gerekli hammaddeleri yakar
{
  const gs = yeni();
  const s = gs.state;
  const anahtarlar = Object.keys(globalPool.state.resources);
  const once = Object.fromEntries(anahtarlar.map((k) => [k, arz(k)]));
  s.warehouseLevel = 1;
  for (const k of anahtarlar) s.inventory[k] = 50000;
  s.adAstraBalance = 100000;
  const maliyet = gs.getWarehouseUpgradeCost(1);
  for (const k of maliyet.keys) assert.ok(maliyet.costs[k] > 0, `${k} bedeli pozitif`);
  const r = gs.upgradeWarehouse();
  assert.equal(r.success, true, r.message);
  for (const k of maliyet.keys) {
    assert.equal(s.burnedResources[k], maliyet.costs[k], `${k} yakımı kaydedilmeli`);
    assert.equal(arz(k), once[k] - maliyet.costs[k], `${k} arzdan düşmeli`);
  }
}
console.log('✅ silo yükseltme hammaddeleri yakar');

// 4) Askeri şifalı otla iyileştirme otu yakar (buğdayla anında iyileştirme kalktı)
{
  const gs = yeni();
  const s = gs.state;
  const once = arz('herb');
  const asker = gs.createSoldierUnit(1);
  asker.hp = 10;
  asker.maxHp = 100;
  s.soldierUnits = [asker];
  s.inventory.herb = 500 * URETIM_CARPANI;
  s.adAstraBalance = 5000;
  const bilgi = gs.getHerbHealInfo(0);
  assert.ok(bilgi.herbsNeeded > 0);
  assert.equal(gs.healSoldierWithHerb(0).success, true);
  assert.equal(s.burnedResources.herb, bilgi.herbsNeeded);
  assert.equal(arz('herb'), once - bilgi.herbsNeeded);
}
console.log('✅ asker iyileştirme şifalı otu yakar');

console.log('\n4/4 hammadde yakımı bloğu geçti.');
