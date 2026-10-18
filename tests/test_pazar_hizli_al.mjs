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

// Geliştirme planı (Demirhane "Eksikleri al ve geliştir"): eşyanın bedelindeki her eksik (demir, odun, kömür, taş, parça) pazardan alınır
{
  const liste = gs.getAllArmoryEquipmentList();
  assert.ok(liste.length >= 1, 'önkoşul: dövülen eşya listede');
  const esya = liste[0].item;
  const bedel = gs.calculateEquipmentUpgradeCost(esya);
  assert.equal(bedel.isMaxLevel, false);
  s.adAstraBalance = 1e6;
  for (const k of ['iron', 'wood', 'coal', 'stone', 'fragments']) s.inventory[k] = 0;
  const plan = gs.getQuickBuyPlan('upgrade:0');
  const kalem = Object.fromEntries(plan.items.map((i) => [i.res, i.qty]));
  assert.equal(kalem.iron, bedel.ironCost, 'plan demiri alır');
  assert.equal(kalem.wood, bedel.woodCost, 'plan oduncu alır');
  assert.equal(kalem.fragments, bedel.fragCost, 'plan parçayı alır');
  if (bedel.coalCost > 0) assert.equal(kalem.coal, bedel.coalCost, 'plan kömürü alır');
  if (bedel.stoneCost > 0) assert.equal(kalem.stone, bedel.stoneCost, 'plan taşı alır');
  assert.equal(plan.extraAda, bedel.adaCost, 'geliştirmenin kendi ASTRA bedeli plana yazılır');
  assert.equal(plan.ok, true, plan.reason);

  // Eksikler alınır ve eşya gerçekten geliştirilir (konumla, sıra değişse de aynı eşya)
  for (const i of plan.items) assert.equal(gs.marketBuy(i.res, i.qty).success, true, `${i.res} alındı`);
  const seviye0 = esya.level || 1;
  const r = gs.upgradeAnyEquipment({ source: liste[0].source, slotKey: liste[0].slotKey, armoryIndex: liste[0].armoryIndex ?? null, soldierIndex: liste[0].soldierIndex ?? null });
  assert.equal(r.success, true, r.message);
  assert.equal(esya.level, seviye0 + 1, 'planla alınan malzemeyle geliştirildi');

  // ASTRA yetmiyorsa plan kapalıdır ve nedeni söyler; geçersiz sıra ve en yüksek seviye
  for (const k of ['iron', 'wood', 'coal', 'stone', 'fragments']) s.inventory[k] = 0;
  s.adAstraBalance = 0;
  const siloOnce = s.warehouseLevel;
  s.warehouseLevel = 18;   // siloya sığmama nedeni araya girmesin
  const yoksul = gs.getQuickBuyPlan('upgrade:0');
  assert.equal(yoksul.ok, false);
  assert.match(yoksul.reason, /ASTRA/);
  s.adAstraBalance = 1e6;
  assert.equal(gs.getQuickBuyPlan('upgrade:999').ok, false, 'olmayan eşya');
  esya.level = GAME_CONFIG.EQUIPMENT_MAX_LEVEL || 10;
  const enUst = gs.getQuickBuyPlan('upgrade:0');
  assert.equal(enUst.ok, false);
  assert.match(enUst.reason, /en yüksek/);
  s.warehouseLevel = siloOnce;
}

// Toplu geliştirme planı (Demirhane "Eksikleri al ve geliştir", hepsi / tür / tür+seviye): kümenin toplam bedeli, silo kapasitesine bakılmadan hesaplanır
{
  const siloOnce = s.warehouseLevel;
  s.warehouseLevel = 18; s.adAstraBalance = 1e7;
  for (const k of ['iron', 'wood', 'coal', 'stone', 'fragments']) s.inventory[k] = 5000;
  assert.equal(gs.craftEquipment('helmet').success, true);
  assert.equal(gs.craftEquipment('armor').success, true);
  const kume = gs.getUpgradeSetItems(null, null);
  assert.ok(kume.length >= 2, 'önkoşul: en az iki geliştirilebilir eşya');
  assert.ok(kume.every((k) => (k.item.level || 1) < (GAME_CONFIG.EQUIPMENT_MAX_LEVEL || 10)), 'en yüksek seviyedekiler kümeye girmez');
  const toplam = gs.getUpgradeSetCost(null, null);
  assert.equal(toplam.count, kume.length);
  assert.equal(toplam.ironCost, kume.reduce((t, k) => t + gs.calculateEquipmentUpgradeCost(k.item).ironCost, 0), 'toplam demir her eşyanın bedelinin toplamı');
  assert.equal(gs.getUpgradeSetItems('helmet', null).length, kume.filter((k) => k.item.slot === 'helmet').length, 'tür süzgeci');
  assert.equal(gs.getUpgradeSetItems(null, 999).length, 0, 'olmayan seviye');

  for (const k of ['iron', 'wood', 'coal', 'stone', 'fragments']) s.inventory[k] = 0;
  const plan = gs.getQuickBuyPlan('upgradeset:all:-');
  assert.equal(plan.ok, true, plan.reason);
  const kalem = Object.fromEntries(plan.items.map((i) => [i.res, i.qty]));
  assert.equal(kalem.iron, toplam.ironCost, 'plan toplam demiri alır');
  assert.equal(kalem.wood, toplam.woodCost);
  assert.equal(plan.capBlocked, false, 'toplam bedel siloya sığmasa da tahmin kırpılmaz');
  assert.ok(Math.abs(plan.extraAda - toplam.adaCost) < 1e-9, 'geliştirme ASTRA bedeli plana yazılır');
  assert.equal(gs.getQuickBuyPlan('upgradeset:helmet:-').ok, true);
  assert.equal(gs.getQuickBuyPlan('upgradeset:all:99').ok, false, 'uygun eşya yoksa plan yok');
  s.warehouseLevel = siloOnce;
}

// Hızlı iyileştirme planı (Zindan, Kışla, Şifahane "Hızlı iyileştir"): hemen iyileştirmenin tek yolu şifalı ot; eksik ot pazardan alınır, sonra iyileşir
{
  s.soldierUnits = [];
  assert.equal(gs.getQuickBuyPlan('heal').ok, false, 'asker yokken plan yok');
  assert.match(gs.getQuickBuyPlan('heal').reason, /Yaralı/);
  s.adAstraBalance = 1e6;
  gs.buySoldierUnit();
  gs.buySoldierUnit();
  s.adAstraBalance = 1e6;
  assert.equal(gs.getQuickBuyPlan('heal').ok, false, 'hepsi tam canken plan yok');
  s.soldierUnits.forEach((a) => { a.hp = Math.round((a.maxHp || 100) * 0.4); });
  s.inventory.herb = 0;
  s.inventory.wheat = 123;
  const maliyet = gs.getAllHealCost();
  assert.equal(maliyet.count, 2);
  const plan = gs.getQuickBuyPlan('heal');
  assert.equal(plan.ok, true, plan.reason);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].res, 'herb', 'buğday değil şifalı ot alınır');
  assert.equal(plan.items[0].qty, maliyet.totalHerbs, 'eksik otun tamamı alınır');
  assert.equal(maliyet.totalHerbs, s.soldierUnits.reduce((t, a) => t + Math.ceil(Math.ceil((a.maxHp || 100) * 0.6) / GAME_CONFIG.SIFAHANE.HP_PER_HERB), 0), 'ot bedeli eksik can / HP_PER_HERB');
  assert.ok(Math.abs(plan.extraAda - maliyet.totalAda) < 1e-9, 'iyileştirme ASTRA bedeli plana yazılır');
  assert.equal(gs.getQuickBuyPlan('heal:0').items[0].qty, Math.ceil(Math.ceil((s.soldierUnits[0].maxHp || 100) * 0.6) / GAME_CONFIG.SIFAHANE.HP_PER_HERB), 'tek asker planı');
  assert.equal(gs.getQuickBuyPlan('heal:99').ok, false, 'olmayan asker');
  // asker asker uygula: ot alınır, iyileştirilir
  for (let i = 0; i < 2; i++) {
    const adim = gs.getQuickBuyPlan(`heal:${i}`);
    for (const it of adim.items) assert.equal(gs.marketBuy(it.res, it.qty).success, true, `${it.res} alındı`);
    const r = gs.healSoldierWithHerb(i);
    assert.equal(r.success, true, r.message);
  }
  assert.ok(s.soldierUnits.every((a) => a.hp >= (a.maxHp || 100)), 'hepsi tam can');
  assert.equal(s.inventory.wheat, 123, 'buğday harcanmadı');
  assert.equal(gs.getQuickBuyPlan('heal').ok, false, 'iyileşince plan yok');
  s.soldierUnits = [];
}

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
