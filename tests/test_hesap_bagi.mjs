// Hesap seviyesi her şeyin anahtarı (19 Ekim 2026, kullanıcı kararı): silo, ev ve teçhizat seviyesi hesap seviyesini geçemez; hesap seviyesi oyundaki en pahalı kalemdir.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GAME_CONFIG: C } = await import('../js/config.js');
const { GameStateManager } = await import('../js/gameState.js');
const { AMMMarketEngine } = await import('../js/ammMarket.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const HAM = ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb'];
const yeni = () => { depo.clear(); return new GameStateManager(); };

// 1) Teçhizat seviyesi hesap seviyesine bağlı: tavan = min(10, 2 + seviye/2)
{
  const gs = yeni();
  const cap = (l) => { gs.state.level = l; return gs.getEquipmentLevelCap(); };
  assert.equal(cap(1), 2);
  assert.equal(cap(3), 3);
  assert.equal(cap(10), 7);
  assert.equal(cap(16), 10);
  assert.equal(cap(80), 10, 'en çok 10');
  gs.state.level = 3;
  gs.state.inventory.fragments = 1000; gs.state.inventory.iron = 1e6; gs.state.inventory.wood = 1e6; gs.state.inventory.coal = 1e6; gs.state.inventory.stone = 1e6;
  gs.state.adAstraBalance = 1e9;
  gs.state.equipment = { weapon: { id: 'w', slot: 'weapon', name: 'K', icon: 'K', level: 3, baseAtk: 25, baseHp: 0, atkBonus: 25, hpBonus: 0, durability: 13, maxDurability: 13 } };
  const bedel = gs.calculateEquipmentUpgradeCost('weapon');
  assert.equal(bedel.accountLevelBlocked, true, 'hesap 3 iken 4. seviye teçhizat kapalı');
  assert.equal(bedel.accountLevelNeeded, 4, '4. seviye için hesap 4');
  const r = gs.upgradeEquipment('weapon');
  assert.equal(r.success, false);
  assert.equal(r.accountLevelBlocked, true);
  assert.match(r.message, /hesabın en az 4/);
  gs.state.level = 4;
  assert.equal(gs.upgradeEquipment('weapon').success, true, 'hesap 4 olunca açılır');
  ok('teçhizat seviyesi hesap seviyesine bağlı (tavan 2 + seviye/2, en çok 10)');
}

// 2) Ev sayısı hesap seviyesine bağlı: n. ev için hesap seviyesi en az 2 x (n-1)
{
  const gs = yeni();
  const e = (l) => { gs.state.level = l; return gs.getVillageInfo(); };
  assert.equal(e(1).maxHouses, 1);
  assert.equal(e(2).maxHouses, 2);
  assert.equal(e(11).maxHouses, 6);
  assert.equal(e(80).maxHouses, C.KOY.MAX_HOUSES);
  const v = e(3);
  assert.equal(v.canBuildHouse, v.houses < 2);
  gs.state.level = 1;
  const k = gs.getVillageInfo();
  if (!k.canBuildHouse) assert.match(k.houseLimitReason, /hesap seviyesi/);
  ok('ev sayısı hesap seviyesine bağlı (n. ev için hesap seviyesi 2 x (n-1))');
}

// 3) Hesap seviyesi bedeli en pahalı kalem: toplam hammadde + ASTRA değeri, silo yükseltmesinin ve teçhizatın üstünde; seviye başına bedel hiç düşmez
{
  const gs = yeni();
  const m = new AMMMarketEngine();
  const deger = (c) => HAM.reduce((t, k) => t + Number(c[k] || 0) * m.getPrice(k), 0);
  let hesapHam = 0, hesapAstra = 0, onceki = 0;
  for (let L = 1; L < C.MAX_PLAYER_LEVEL; L++) {
    gs.state.level = L;
    const r = gs.getNextLevelRequirement();
    const toplam = deger(r.costs) + r.adAstra;
    assert.ok(toplam >= onceki, `Sv.${L}: seviye bedeli bir öncekinden düşük olamaz (${toplam} < ${onceki})`);
    onceki = toplam;
    hesapHam += deger(r.costs); hesapAstra += r.adAstra;
  }
  let siloHam = 0, siloAstra = 0;
  for (let L = 1; L < gs.getWarehouseMaxLevel(); L++) { const u = gs.getWarehouseUpgradeCost(L); siloHam += deger(u.costs); siloAstra += u.adAstra; }
  const hesap = hesapHam + hesapAstra, silo = siloHam + siloAstra;
  assert.ok(hesap > silo * 3, `hesap seviyesi (${Math.round(hesap)}) silodan (${Math.round(silo)}) çok pahalı`);
  assert.ok(hesapAstra > siloAstra * 3, 'ASTRA payı da hesap seviyesinde daha büyük');
  // aynı seviyede tek basamak: hesap yükseltmesi silo yükseltmesinden pahalı (hammadde + ASTRA)
  for (const L of [8, 10, 25, 48]) {   // ilk 6 seviyede pay 0,45-0,70 (yeni oyuncu takılmasın); 7. seviyeden itibaren hesap payı silonun 0,7 payını geçer
    gs.state.level = L;
    const r = gs.getNextLevelRequirement();
    const u = gs.getWarehouseUpgradeCost(L);
    assert.ok(deger(r.costs) + r.adAstra > deger(u.costs) + u.adAstra, `Sv.${L}: hesap yükseltmesi silo yükseltmesinden pahalı`);
  }
  ok(`hesap seviyesi toplamda en pahalı kalem (${(hesap / 6e6).toFixed(1)} $ >> silo ${(silo / 6e6).toFixed(1)} $); her basamak silo basamağından pahalı`);
}

// 4) En üst silodan sonra (Sv.50-80) hammadde bedeli düz, ASTRA bedeli her seviye x1,05
{
  const gs = yeni();
  gs.state.level = 49; const a = gs.getNextLevelRequirement();
  gs.state.level = 60; const b = gs.getNextLevelRequirement();
  gs.state.level = 80; const c = gs.getNextLevelRequirement();
  assert.deepEqual(a.costs, b.costs, 'hammadde bedeli en üst siloda düz');
  assert.deepEqual(b.costs, c.costs);
  assert.ok(Math.abs(c.adAstra / b.adAstra - Math.pow(1.05, 20)) < 0.001 * Math.pow(1.05, 20), 'ASTRA payı her seviye x1,05');
  ok('Sv.49 sonrası hammadde düz, ASTRA x1,05 / seviye');
}

console.log(`\n${n} hesap bağı kontrolü geçti.`);
