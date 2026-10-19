// Gelişim bedelleri x5 (19 Ekim 2026, kullanıcı kararı): tek seferlik gelişim bedelleri ~5 kat; ilk basamaklar eskisi gibi (yeni oyuncu ilk siloya sığar);
// hiçbir bedel en büyük siloyu (tavan: 18. silo x %80) aşmaz; tekrar eden bedeller (onarım) değişmez.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG: C, URETIM_CARPANI: U } = await import('../js/config.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const yeni = () => { depo.clear(); return new GameStateManager(); };
const gs = yeni();

// 1) Asker ASTRA bedeli x5: 1. asker 250, 18. asker 90.000
{
  assert.equal(gs.getSoldierCost(1), gs.adaPrice(250), '1. asker 250 ASTRA (eskiden 50)');
  assert.equal(gs.getSoldierCost(18), gs.adaPrice(90000), '18. asker 90.000 ASTRA (eskiden 18.000)');
  ok('asker bedeli x5 (1. asker 250, 18. asker 90.000)');
}

// 2) Teçhizat yükseltmesi: ilk basamak eski ölçekte (ilk siloya sığar), 1→10 toplamı ~x4-6; onarım ölçeği değişmedi
{
  const taban = { slot: 'weapon', level: 1, baseAtk: 25, baseHp: 0, durability: 13, maxDurability: 13, name: 'Referans' };
  const ilk = gs.calculateEquipmentUpgradeCost(taban);
  const siloBir = gs.getWarehouseCapacity(1);
  assert.ok(ilk.ironCost <= siloBir.iron && ilk.woodCost <= siloBir.wood, `ilk yükseltme basamağı 1. siloya sığar (demir ${ilk.ironCost}/${siloBir.iron}, odun ${ilk.woodCost}/${siloBir.wood})`);
  let yeniToplam = 0, eskiToplam = 0;
  for (let l = 1; l < C.EQUIPMENT_MAX_LEVEL; l++) {
    const u = gs.calculateEquipmentUpgradeCost({ ...taban, level: l });
    yeniToplam += u.woodCost + u.ironCost;
    eskiToplam += Math.round((u.woodCost + u.ironCost) / (1.55 ** (l - 1)) * (1.18 ** l) / 1.18);   // aynı basamağın eski (1,18 üstel) karşılığı
  }
  const oran = yeniToplam / eskiToplam;
  assert.ok(oran >= 4 && oran <= 6, `yükseltme toplamı eskinin ~5 katı (x${oran.toFixed(2)})`);
  // parça: ilk 3 yükseltme eskisi gibi (2, 4, 8), 4. basamaktan itibaren x2
  assert.deepEqual([1, 2, 3, 4, 5].map((l) => gs.calculateEquipmentUpgradeCost({ ...taban, level: l }).fragmentCost), [2, 4, 8, 32, 64]);
  assert.equal(gs.calculateEquipmentCraftCost('weapon').fragments, 1, 'dövme parçası değişmedi (ilk takım)');
  // onarım bedeli eski ölçekte (tekrar eden bakım): cumulative eski büyüme
  const eski = gs.getCumulativeEquipmentResourceCost({ ...taban, level: 5 });
  const gercek = gs.getCumulativeEquipmentResourceCost({ ...taban, level: 5 }, { gercek: true });
  assert.ok(gercek.totalIron > eski.totalIron * 1.5, 'gerçek harcama (geri dönüşüm) yeni ölçekte, onarım eski ölçekte');
  ok(`teçhizat yükseltmesi toplamı x${oran.toFixed(1)}; ilk basamak 1. siloya sığar; onarım eski ölçekte`);
}

// 3) Köy evi: 11 evin toplamı ~x4-5; hiçbir ev bedeli, yapılabildiği hesap seviyesindeki (2 x (n-1)) silonun %90'ını aşmaz
{
  let yeniT = 0, eskiT = 0;
  for (let h = 2; h <= 12; h++) {
    const c = gs.getHouseCost(h);
    const mult = 1.2 ** (h - 2);
    yeniT += c.wood;
    eskiT += Math.round(400 * U * mult);
    const kapH = gs.getWarehouseCapacity(Math.min(gs.getWarehouseMaxLevel(), 2 * (h - 1)));
    for (const k of Object.keys(c)) assert.ok(c[k] <= Math.floor(kapH[k] * 0.9), `${h}. ev ${k} bedeli silo tavanını aşmaz`);
  }
  // 19 Ekim 2026: evler talep ölçeğine tırmanır (ev 2: arz ölçeği, ev 12: x10 ve üstel artış)
  assert.ok(yeniT / eskiT >= 20 && yeniT / eskiT <= 80, `ev bedelleri arz ölçeğindeki üstel artışın 20-80 katı (x${(yeniT / eskiT).toFixed(2)})`);
  assert.equal(gs.getHouseCost(2).wood, 400 * U, '2. ev (ilk) eski bedelde (x50 adet)');
  ok(`köy evleri x${(yeniT / eskiT).toFixed(1)}; 2. ev eski bedelde; hiçbiri siloyu aşmaz`);
}

// 4) Hesap seviye bedeli: o seviyedeki silonun kapasitesinin payı (0,45 → 0,9); silo hesabı geçemediği için hep siloya sığar
{
  assert.equal(gs._seviyeSiloPayi(1), 0.45);
  assert.ok(Math.abs(gs._seviyeSiloPayi(4) - 0.6) < 1e-9);
  assert.equal(gs._seviyeSiloPayi(10), 0.9);
  assert.equal(gs._seviyeSiloPayi(60), 0.9);
  for (const L of [1, 2, 5, 12, 30, 49, 80]) {
    gs.state.level = L;
    const r = gs.getNextLevelRequirement();
    const kap = gs.getWarehouseCapacity(Math.min(L, gs.getWarehouseMaxLevel()));
    for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) assert.equal(r.costs[k], Math.floor(kap[k] * gs._seviyeSiloPayi(L)), `Sv.${L} ${k} bedeli = silo(${L}) x pay`);
  }
  gs.state.level = 1;
  ok('hesap seviye bedeli = o seviyedeki silonun yüzde 45-90 payı');
}

// 5) Silo yükseltme bedeli: %70 (eskiden %50) ve şart %70 dolu
{
  const u = gs.getWarehouseUpgradeCost(5);
  assert.equal(u.fillShare, 0.7);
  assert.equal(u.costs.wood, Math.floor(gs.getWarehouseCapacity(5).wood * 0.7));
  ok('silo yükseltme: bedel ve doluluk şartı %70');
}

console.log(`\n${n} gelişim maliyeti kontrolü geçti.`);
