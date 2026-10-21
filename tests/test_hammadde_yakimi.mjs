// Hammadde yakımı: stamina doldurma, alet onarımı, silo yükseltme ve asker iyileştirmede harcanan hammadde
// oyuncunun yakım sayacına ve dünya havuzunun yakım sayacına yazılır. 21 Ekim 2026: yakım haftalık çıkarma kotasını DÜŞÜRMEZ
// (kota yalnız enflasyon aracıdır; bir oyuncunun harcaması herkesin üretimini kapatmasın).
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
const { globalPool, GlobalResourceManager } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

const yeni = () => {
  depo.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  return new GameStateManager();
};
const arz = (k) => globalPool.state.resources[k].totalCap;
const yak = (k) => globalPool.state.resources[k].burned || 0;

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
  assert.equal(arz('wheat'), once, 'haftalık çıkarma kotası yakımla küçülmez');
  assert.equal(yak('wheat'), r.wheatUsed, 'haftalık yakım istatistiği artar');
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
  assert.equal(arz('wood'), odun, 'odun kotası küçülmez');
  assert.equal(arz('iron'), demir, 'demir kotası küçülmez');
  assert.equal(yak('wood'), maliyet.woodCost);
  assert.equal(yak('iron'), maliyet.ironCost);
}
console.log('✅ alet onarımı odun ve demir yakar');

// 3) Silo yükseltme bütün gerekli hammaddeleri yakar
{
  const gs = yeni();
  const s = gs.state;
  const anahtarlar = Object.keys(globalPool.state.resources);
  const once = Object.fromEntries(anahtarlar.map((k) => [k, arz(k)]));
  s.level = 10; s.warehouseLevel = 1;   // silo hesap seviyesini geçemez (19 Ekim 2026)
  for (const k of anahtarlar) s.inventory[k] = 50000;
  s.adAstraBalance = 100000;
  const maliyet = gs.getWarehouseUpgradeCost(1);
  for (const k of maliyet.keys) assert.ok(maliyet.costs[k] > 0, `${k} bedeli pozitif`);
  const r = gs.upgradeWarehouse();
  assert.equal(r.success, true, r.message);
  for (const k of maliyet.keys) {
    assert.equal(s.burnedResources[k], maliyet.costs[k], `${k} yakımı kaydedilmeli`);
    assert.equal(arz(k), once[k], `${k} kotası küçülmez`);
    assert.equal(yak(k), maliyet.costs[k], `${k} haftalık yakım istatistiği`);
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
  assert.equal(arz('herb'), once, 'şifalı ot kotası küçülmez');
  assert.equal(yak('herb'), bilgi.herbsNeeded);
}
console.log('✅ asker iyileştirme şifalı otu yakar');

// 5) Çok büyük yakım hiçbir hammaddenin haftalık çıkarma kotasını kapatmaz (21 Ekim 2026: tek oyuncu dünyayı kilitlemişti)
{
  yeni();
  for (const k of Object.keys(globalPool.state.resources)) {
    const kota = arz(k);
    const bugun = globalPool.getAvailableToday(k);
    globalPool.recordResourceBurn(k, kota * 100);
    assert.equal(arz(k), kota, `${k}: 100 katı yakım kotayı küçültmez`);
    assert.equal(globalPool.state.resources[k].depleted, false, `${k}: kota tükenmiş sayılmaz`);
    assert.equal(globalPool.getAvailableToday(k), bugun, `${k}: bugün alınabilir miktar değişmez`);
    assert.ok(globalPool.harvest(k, 1) > 0, `${k}: çıkarma hâlâ çalışır`);
  }
}
console.log('✅ aşırı yakım kotayı kapatmaz');

// 6) Eski kayıt onarımı: yakımla küçülmüş (tükenmiş) kota yüklemede tam açılır, çıkarılan korunur
{
  yeni();
  const r = globalPool.state.resources.wood;
  r.harvested = 7; r.totalCap = 10; r.remaining = 0; r.depleted = true;   // eski sürümde yakımın bıraktığı durum
  globalPool.saveState();
  const yuklenen = new GlobalResourceManager();
  const w = yuklenen.state.resources.wood;
  assert.equal(w.totalCap, yuklenen.computeWeekCapacity('wood'), 'kota tam açılır');
  assert.ok(w.totalCap > 100, 'kota küçük kalmadı');
  assert.equal(w.harvested, 7, 'çıkarılan korunur');
  assert.equal(w.remaining, w.totalCap - 7);
  assert.equal(w.depleted, false);
}
console.log('✅ eski tükenmiş kota yüklemede onarılır');

console.log('\n6/6 hammadde yakımı bloğu geçti.');
