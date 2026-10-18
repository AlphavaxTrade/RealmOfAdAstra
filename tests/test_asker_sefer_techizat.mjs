// Asker, sefer ve teçhizat kuralları: yeni asker değerleri, iyileşme bedelleri (pasif ve hızlı), erken hasat toplama,
// zindanda kalıcı canavar canı, teçhizat dövme / onarım / yükseltme (13 dayanıklılık, ilk silo sınırı).
// 11 Ekim 2026'da test_new_mechanics_v106.mjs'in ilk dört bölümünden baştan yazıldı.
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
  const gs = new GameStateManager();
  gs.state.adAstraBalance = 5000000;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 1000000;
  gs.state.inventory.fragments = 1000;
  return gs;
};
const yakin = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// 1) Yeni asker: tek tip şampiyon; iyileşme bedelleri yapılandırmadaki oranlardan
{
  const gs = yeni();
  const asker = gs.createSoldierUnit(0);
  assert.equal(asker.classId, 'adastra_champion');
  assert.equal(asker.className, 'AdAstra Şampiyonu');
  assert.ok(asker.name.startsWith('AdAstra Şampiyonu'));
  assert.equal(asker.hp, 100);
  assert.equal(asker.maxHp, 100);
  assert.equal(asker.atk, 25);

  asker.hp = 50;
  gs.state.soldierUnits = [asker];
  const bilgi = gs.getSoldierHealInfo(0);
  const PH = GAME_CONFIG.SOLDIER_PASSIVE_HEAL;
  const SF = GAME_CONFIG.SIFAHANE;
  assert.equal(bilgi.missingHp, 50);
  assert.equal(bilgi.passiveWheatNeeded, 15, 'pasif: HP başına 0,30 buğday');
  assert.ok(yakin(bilgi.passiveAdaCost, 50 * PH.adaPerHp), 'pasif ASTRA bedeli yapılandırmadan');
  assert.equal(bilgi.wheatCost, undefined, 'buğdayla anında iyileştirme kalktı: hızlı bedelde buğday yok');
  assert.equal(bilgi.adAstraCost, undefined, 'ASTRA payı artık getHerbHealInfo içinde');
  const ot = gs.getHerbHealInfo(0);
  assert.equal(ot.herbsNeeded, 50 / SF.HP_PER_HERB, 'ot bedeli: eksik can / HP_PER_HERB (teçhizatsız askerde savaş ölçeği = taban)');
  assert.ok(yakin(ot.herbAdaCost, 50 * SF.ADA_PER_HP), 'ASTRA payı: eksik can × ADA_PER_HP');

  gs.state.inventory.wheat = 100;
  gs.state.adAstraBalance = 100;
  const once = asker.hp;
  gs.processSoldierPassiveHealing(3600);
  assert.ok(asker.hp > once, 'bir saatlik pasif iyileşme can kazandırır');

  asker.hp = 50;
  gs.state.inventory.wheat = 100;   // silo tavanının altında: kayıt buğdayı kırpmasın
  gs.state.inventory.herb = 30;
  gs.state.adAstraBalance = 50000;
  assert.equal(gs.healSoldierInstantly, undefined, 'buğdayla anında iyileştirme yöntemi kaldırıldı');
  const bugdayOnce = gs.state.inventory.wheat;
  assert.equal(gs.healSoldierWithHerb(0).success, true);
  assert.equal(asker.hp, 100, 'şifalı otla iyileştirme tam cana getirir');
  assert.equal(gs.state.inventory.wheat, bugdayOnce, 'buğday harcanmaz');
}
console.log('✅ asker değerleri ve iyileşme bedelleri');

// 2) Bitmemiş seferden biriken mahsul tek dokunuşla toplanır
{
  const gs = yeni();
  const s = gs.state;
  s.inventory.wood = 0;
  s.stamina = 100;
  assert.equal(gs.startExpedition('wood').success, true);
  const sefer = s.activeExpeditions.wood;
  sefer.elapsedSeconds = sefer.durationSeconds * 0.5;
  const biriken = gs.getAccruedExpeditionHarvest('wood');
  assert.ok(biriken.accruedAmount > 0);
  assert.equal(biriken.pct, 50);
  const once = s.inventory.wood;
  const r = gs.claimAndRestartAllExpeditions();
  assert.ok(r.partialClaimed > 0 || r.claimed > 0);
  assert.ok(s.inventory.wood > once, 'biriken odun envantere eklenir');
}
console.log('✅ erken hasat toplama');

// 3) Zindanda canavarın canı kaybedilen savaştan sonra yenilenmez; zaferde kayıt silinir
{
  const gs = yeni();
  assert.equal(gs.getMonsterCurrentHp(3, 500), 500);
  gs.recordMonsterHp(3, 280);
  assert.equal(gs.getMonsterCurrentHp(3, 500), 280);
  assert.equal(gs.getMonsterCurrentHp(3, 500), 280, 'tekrar girişte yenilenmez');
  gs.clearMonsterHp(3);
  assert.equal(gs.getMonsterCurrentHp(3, 500), 500);
}
console.log('✅ kalıcı canavar canı');

// 4) Teçhizat: ilk silo en pahalı eşyayı alır; dövme 13/13; onarım; yükseltme
{
  const gs = yeni();
  const s = gs.state;
  const kap = GAME_CONFIG.WAREHOUSE.initialCapacities;
  for (const [yuva, tarif] of Object.entries(GAME_CONFIG.EQUIPMENT_RECIPES)) {
    const c = gs.calculateEquipmentCraftCost(yuva);
    assert.ok(c.ironCost <= kap.iron && c.woodCost <= kap.wood && (c.coal || 0) <= kap.coal, `${tarif.name}: bedel ilk siloya sığmalı`);
  }
  const silah = gs.calculateEquipmentCraftCost('weapon');
  assert.ok(silah.ironCost > 0 && silah.woodCost > 0 && silah.adaCost > 0);
  assert.equal(silah.fragCost, 1, 'seviye 1 üretim 1 parça ister');

  s.warehouseLevel = 18;
  s.adAstraBalance = 5000000;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) s.inventory[k] = 500000;
  s.inventory.fragments = 5000;
  assert.equal(gs.craftEquipment('weapon').success, true);
  const kilic = s.equipment.weapon;
  assert.equal(kilic.durability, 13);
  assert.equal(kilic.maxDurability, 13);

  kilic.durability = 3;
  const onarim = gs.calculateEquipmentRepairCost('weapon', null);
  assert.equal(onarim.missingDurability, 10);
  assert.ok(onarim.ironCost > 0 && onarim.woodCost > 0 && onarim.adaCost > 0);
  assert.equal(gs.repairEquipment('weapon', null).success, true);
  assert.equal(kilic.durability, 13);

  const yukselt = gs.calculateEquipmentUpgradeCost('weapon', null);
  assert.equal(yukselt.fragmentCost, 2, 'seviye 2 yükseltmesi 2 parça ister');
  assert.ok(yukselt.nextAtk > kilic.baseAtk);
  assert.equal(gs.upgradeEquipment('weapon', null).success, true);
  assert.equal(kilic.level, 2);
  assert.equal(kilic.durability, 13, 'yükseltme dayanıklılığı doldurur');
}
console.log('✅ teçhizat dövme, onarım, yükseltme');

console.log('\n4/4 asker, sefer ve teçhizat bloğu geçti.');
