// 20 Ekim 2026 oyuncu geri bildirimleri:
//  1) "Hızlı al" seviye atlama / silo yükseltme için alınan şifalı ot, yaralı askerlerin pasif iyileşmesi yüzünden arada erip 1 adet eksik kalıyordu
//  2) Seviye atlamak ya da hesap yükseltmek askerin canını yenilememeli
//  3) Zindanda canı sıfırlanan asker iyileştirilmeden savaşa giremez (eskiden 1 canla girip kendini toparlıyordu)
//  4) Silo ve hesap yükseltmede ASTRA bedeli = harcanan hammaddenin TAMAMININ anlık pazar değeri
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { globalPool } = await import('../js/globalPool.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { treasury } = await import('../js/treasury.js');

function yeni() {
  depo.clear();
  ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const g = new GameStateManager();
  g.state.adAstraBalance = 5e6;
  return g;
}
const yaraliAsker = (g, can = 10) => {
  g.state.warehouseLevel = Math.max(g.state.warehouseLevel || 1, 3);
  const r = g.buySoldierUnit();
  assert.ok(r.success, r.message);
  const a = g.state.soldierUnits[g.state.soldierUnits.length - 1];
  a.hp = can;
  return a;
};

// 1) Hızlı al + yaralı asker: arada pasif iyileşme otu yakar; seviye atlama yine de başarılı olmalı
{
  const g = yeni();
  g.state.level = 5; g.state.warehouseLevel = 6;
  yaraliAsker(g);
  const gerek = g.getNextLevelRequirement();
  g.state.currentXp = gerek.xp + 5;
  for (const k of Object.keys(gerek.costs)) g.state.inventory[k] = 0;   // hepsi eksik: plan hepsini tam sayıyla alır
  const plan = g.getQuickBuyPlan('levelup');
  assert.ok(plan.ok, plan.reason);
  const ot = plan.items.find((i) => i.res === 'herb');
  assert.ok(ot && ot.qty >= gerek.costs.herb + 1, `yaralı asker varken otta 1 adetlik pay: ${ot && ot.qty} / ${gerek.costs.herb}`);
  for (const it of plan.items) assert.ok(g.marketBuy(it.res, it.qty).success, `${it.res} alınamadı`);
  g.processSoldierPassiveHealing(120);   // alımla seviye atla düğmesi arasında geçen süre: pasif iyileşme ot yakar
  const r = g.levelUp();
  assert.ok(r.success, `Hızlı al sonrası seviye atlanmalı (tek seferde): ${r.message}`);
}
console.log('✅ hızlı al: seviye atlama tek seferde (pasif iyileşme otu yakarken)');

// 1b) Silo yükseltme aynı şekilde
{
  const g = yeni();
  g.state.level = 6; g.state.warehouseLevel = 3;
  yaraliAsker(g);
  const plan = g.getQuickBuyPlan('warehouse');
  assert.ok(plan.ok, plan.reason);
  for (const it of plan.items) assert.ok(g.marketBuy(it.res, it.qty).success, `${it.res} alınamadı`);
  g.processSoldierPassiveHealing(120);
  const r = g.upgradeWarehouse();
  assert.ok(r.success, `Hızlı al sonrası silo yükselmeli (tek seferde): ${r.message}`);
}
console.log('✅ hızlı al: silo yükseltme tek seferde');

// 1c) Yaralı yokken ot payı eklenmez (gereksiz alım yok)
{
  const g = yeni();
  g.state.level = 5; g.state.warehouseLevel = 6;
  const gerek = g.getNextLevelRequirement();
  g.state.currentXp = gerek.xp + 5;
  for (const k of Object.keys(gerek.costs)) g.state.inventory[k] = 0;
  const ot = g.getQuickBuyPlan('levelup').items.find((i) => i.res === 'herb');
  assert.equal(ot.qty, Math.ceil(gerek.costs.herb), 'yaralı yoksa tam gereken kadar');
}
console.log('✅ yaralı yokken ek pay yok');

// 1d) Anında biten işler (dövme, geliştirme, onarım, ev, alet tamiri): alım ile iş arasında bekleme yok, tek hızlı alımda tamamlanmalı
{
  const g = yeni();
  g.state.level = 12; g.state.warehouseLevel = 8;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) g.state.inventory[k] = 0;
  g.state.inventory.fragments = 5;
  for (const yuva of ['weapon', 'boots']) {
    const plan = g.getQuickBuyPlan('craft:' + yuva);
    assert.ok(plan.ok, `${yuva}: ${plan.reason}`);
    for (const it of plan.items) assert.ok(g.marketBuy(it.res, it.qty).success);
    const r = g.craftEquipment(yuva);
    assert.ok(r.success, `${yuva} dövme tek hızlı alımda: ${r.message}`);
  }
  // Alet tamiri
  const aletId = Object.keys(g.state.tools || {})[0];
  if (aletId) {
    g.state.tools[aletId].durability = 1;
    const plan = g.getQuickBuyPlan('tool:' + aletId);
    if (plan.items.length) {
      assert.ok(plan.ok, plan.reason);
      for (const it of plan.items) assert.ok(g.marketBuy(it.res, it.qty).success);
    }
    assert.ok(g.repairTool(aletId).success, 'alet tamiri tek hızlı alımda');
  }
}
console.log('✅ hızlı al: dövme ve alet tamiri tek seferde');

// 2) Seviye atlamak canı yenilemez: hesap seviyesi ve asker seviyesi
{
  const g = yeni();
  g.state.level = 5; g.state.warehouseLevel = 6;
  const a = yaraliAsker(g, 20);
  const maxOnce = a.maxHp;
  g.addSoldierXp(0, 150);   // 1. seviyeden atlar (gereken 100)
  assert.ok(a.level >= 2, 'asker seviye atladı');
  assert.ok(a.maxHp > maxOnce, 'azami can büyüdü');
  assert.equal(a.hp, 20, 'seviye atlamak canı yenilemez, kayıtlı can aynı kalır');
  // Hesap seviyesi atlayınca da
  const gerek = g.getNextLevelRequirement();
  g.state.currentXp = gerek.xp + 1;
  for (const k of Object.keys(gerek.costs)) g.state.inventory[k] = gerek.costs[k] + 1;
  a.xp = 9999;   // hesap seviyesi artınca birikmiş asker XP'si seviyeye döner
  const hpOnce = a.hp;
  assert.ok(g.levelUp().success);
  assert.equal(a.hp, hpOnce, 'hesap seviyesi atlamak askerin canını yenilemez');
  // Düşmüş asker seviye atlayınca da düşmüş kalır
  a.hp = 0; a.xp = 99999; g.addSoldierXp(0, 0);
  assert.equal(a.hp, 0, 'düşmüş asker seviye atlayınca iyileşmez');
}
console.log('✅ seviye atlamak (asker ve hesap) canı yenilemez');

// 3) Canı biten asker düşer ve iyileşmeden zindan savaşına giremez
{
  const g = yeni();
  g.state.level = 12; g.state.warehouseLevel = 6;
  yaraliAsker(g, 100);
  g.state.soldierUnits[0].hp = 100;
  g.state.dungeonProgress = 1;
  // setSoldierHpFromBattle: zindan (dusebilir) can 0'da bırakır; Kolezyum eskisi gibi en az 1
  g.setSoldierHpFromBattle(0, 0, { dusebilir: true });
  assert.equal(g.state.soldierUnits[0].hp, 0);
  assert.ok(g.isSoldierFallen(0), 'canı sıfır asker düşmüş sayılır');
  g.state.soldierUnits[0].hp = 100;
  g.setSoldierHpFromBattle(0, 0);
  assert.equal(g.state.soldierUnits[0].hp, 1, 'kolezyum düellosu eskisi gibi en az 1 can bırakır');
  assert.ok(!g.isSoldierFallen(0));

  g.state.soldierUnits[0].hp = 100;
  g.setSoldierHpFromBattle(0, 0, { dusebilir: true });
  assert.deepEqual(g.getZindanTakimi(), [], 'düşmüş asker zindan takımına alınmaz');
  // Pasif iyileşme canı artırmaya başlasa da asker TAM iyileşene kadar düşmüş kalır (kendini toparlayıp savaşa giremez)
  g.state.adAstraBalance = 1e6; g.state.inventory.herb = 1e6;
  g.processSoldierPassiveHealing(600);
  assert.ok(g.state.soldierUnits[0].hp > 0 && g.state.soldierUnits[0].hp < g.state.soldierUnits[0].maxHp, 'pasif iyileşme canı artırdı');
  assert.ok(g.isSoldierFallen(0), 'can > 0 ama tam değil: hâlâ düşmüş');
  assert.equal(g.fightDungeon(1, [0]).success, false, 'yarı iyileşmiş düşmüş asker savaşa giremez');
  const r = g.fightDungeon(1, [0]);
  assert.equal(r.success, false);
  assert.deepEqual(r.fallen, [0]);
  assert.match(r.message, /düştü/);
  assert.equal(g.buildDungeonBattleUnits(g.getDungeonEntry ? g.getDungeonEntry(1) : { level: 1, hp: 100, atk: 10, name: 'x' }, [0]).allies.length, 0, 'savaş kurulumunda da düşmüş asker yok');
  assert.equal(g.getZindanOrduDurumu().dusmus, 1);

  // Tam iyileşince savaşabilir (bayrak kalkar)
  g.state.soldierUnits[0].hp = g.state.soldierUnits[0].maxHp;
  assert.ok(!g.isSoldierFallen(0));
  assert.deepEqual(g.getZindanTakimi(), [0]);
}
console.log('✅ düşmüş asker iyileşmeden zindana giremez');

// 4) ASTRA bedeli: harcanan hammaddenin tamamının anlık pazar değeri (ARZ çarpanına bölünmeden)
{
  const g = yeni();
  for (const sv of [1, 5, 9]) {
    g.state.level = sv; g.state.warehouseLevel = Math.min(sv, 8);
    const L = g.getNextLevelRequirement();
    const deger = ammMarket.calculateResourcesAdAstraValue(L.costs).totalAda;
    assert.ok(Math.abs(L.adAstra - deger * g._seviyeAstraAsimi(sv)) < 0.01, `hesap Sv.${sv}: ${L.adAstra} ≈ pazar değeri ${deger}`);
    const spot = Object.entries(L.costs).reduce((t, [k, q]) => t + q * ammMarket.getPrice(k), 0);
    assert.ok(L.adAstra > spot * 0.9 && L.adAstra < spot * 1.1, `hesap Sv.${sv}: bedel anlık fiyatlı toplama yakın (${L.adAstra} / ${spot.toFixed(1)})`);
    const S = g.getWarehouseUpgradeCost();
    if (S) {
      const dS = ammMarket.calculateResourcesAdAstraValue(S.costs).totalAda;
      assert.ok(Math.abs(S.adAstra - dS) < 0.01, `silo: ${S.adAstra} ≈ ${dS}`);
      assert.equal(Object.keys(S.costs).length, 6, 'altı hammaddenin hepsi sayılır');
    }
  }
}
console.log('✅ silo ve hesap yükseltme ASTRA bedeli = hammaddelerin anlık pazar değeri');
console.log('\n5 kontrol bloğu geçti.');
