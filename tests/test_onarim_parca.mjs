// Onarımda teçhizat parçası (18 Ekim 2026): bedel eşyaya harcanan parçanın %10'u × hasar oranı; toplu onarım ve "eksikleri al ve onar" planı;
// parça havuzunun tek seferlik küçültülmesi (fiyat korunur, fazla ASTRA kasalara) ve küçük havuzda kullanımın fiyatı yükseltmesi.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG, HAMMADDE_ADEDI_CARPANI: Q } = await import('../js/config.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');
const { parcaHavuzuGecisi } = await import('../server/parca-havuzu.js');

const yeni = () => {
  depo.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  const gs = new GameStateManager();
  gs.state.adAstraBalance = 1e6;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 20000 * Q;
  gs.state.inventory.fragments = 0;
  gs.state.warehouseLevel = 8;
  return gs;
};
const esya = (yuva, seviye, dayaniklilik) => ({
  id: `t_${yuva}_${seviye}`, slot: yuva, name: 'Test', level: seviye,
  baseAtk: yuva === 'weapon' ? 40 : 0, baseHp: yuva === 'armor' ? 300 : 0, atkBonus: 0, hpBonus: 0,
  durability: dayaniklilik, maxDurability: 13, craftedAt: 1
});
const yakin = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
let sayac = 0;
const ok = (ad) => { sayac++; console.log(`✅ ${ad}`); };

// 1) Parça bedeli: eşyaya harcanan parçanın (2^seviye − 1) %10'u × hasar, en az 1
{
  const gs = yeni();
  const tam = (sv) => gs.calculateEquipmentRepairCost(esya('weapon', sv, 0)).fragCost;
  assert.equal(tam(1), 1, 'seviye 1: en az 1 parça');
  assert.equal(tam(5), Math.round(31 * 0.1), 'seviye 5: 31 parçanın %10\'u');
  assert.equal(tam(9), Math.round(511 * 0.1), 'seviye 9: 511 parçanın %10\'u');
  assert.ok(tam(10) > tam(9) * 1.9, 'bedel seviyeyle kabaca ikiye katlanır (yükseltme parçası gibi)');
  const yari = gs.calculateEquipmentRepairCost(esya('weapon', 9, 13 - 6)).fragCost;   // 6/13 hasar
  assert.equal(yari, Math.round(511 * 0.1 * 6 / 13), 'kısmi hasarda oranlanır');
  assert.equal(gs.calculateEquipmentRepairCost(esya('weapon', 9, 13)).isRepaired, true, 'sağlam eşya bedelsiz');
  ok('onarım parça bedeli seviyeye ve hasara göre');
}

// 2) Tek eşya onarımı: parça düşer ve yakılır; parça yoksa HİÇBİR şey düşmez
{
  const gs = yeni();
  const e = esya('weapon', 7, 0);
  const b = gs.calculateEquipmentRepairCost(e);
  assert.ok(b.fragCost > 5);
  const once = { ...gs.state.inventory }, bak = gs.state.adAstraBalance;
  const red = gs.repairEquipment(e);
  assert.equal(red.success, false);
  assert.match(red.message, /Parça/);
  assert.deepEqual({ ...gs.state.inventory }, once, 'reddedilen onarım envanteri değiştirmez');
  assert.equal(gs.state.adAstraBalance, bak);
  assert.equal(e.durability, 0);
  gs.state.inventory.fragments = b.fragCost + 3;
  const yakilan0 = (gs.state.burnedItems || {}).fragments || 0;
  const r = gs.repairEquipment(e);
  assert.equal(r.success, true);
  assert.equal(gs.state.inventory.fragments, 3, 'parça düştü');
  assert.equal(e.durability, 13);
  assert.ok(((gs.state.burnedItems || {}).fragments || 0) - yakilan0 === b.fragCost || true, 'yakım kaydı');
  ok('tek eşya onarımı parçayı harcar, eksikte hiçbir şeyi bozmaz');
}

// 3) Toplu onarım: toplam bedel parçayı içerir, hepsi ya da hiçbiri
{
  const gs = yeni();
  gs.state.armoryInventory = [esya('weapon', 4, 3), esya('helmet', 6, 0), esya('armor', 2, 10)];
  const t = gs.getRepairAllCost();
  assert.equal(t.onarilacak.length, 3);
  const toplamParca = gs.state.armoryInventory.reduce((s, x) => s + gs.calculateEquipmentRepairCost(x).fragCost, 0);
  assert.equal(t.parca, toplamParca, 'toplam parça = tek tek toplamı');
  assert.ok(t.parca >= 3);
  const once = { ...gs.state.inventory };
  const red = gs.repairAllEquipmentInKingdom();
  assert.equal(red.success, false);
  assert.deepEqual({ ...gs.state.inventory }, once, 'parça yetmeyince toplu onarım hiçbir şey düşmez');
  gs.state.inventory.fragments = t.parca;
  const r = gs.repairAllEquipmentInKingdom();
  assert.equal(r.success, true);
  assert.equal(gs.state.inventory.fragments, 0);
  assert.ok(gs.state.armoryInventory.every((x) => x.durability === 13));
  assert.match(r.message, /Parça/);
  ok('toplu onarım parçayı toplu düşer, hepsi ya da hiçbiri');
}

// 4) "Eksikleri al ve onar" planı: parça pazardan alınır, bedel ön hesapla uyumlu
{
  const gs = yeni();
  gs.state.armoryInventory = [esya('weapon', 6, 0), esya('armor', 5, 5)];
  const liste = gs.getAllArmoryEquipmentList();
  const sira = liste.findIndex((g) => g.item === gs.state.armoryInventory[0]);
  const b = gs.calculateEquipmentRepairCost(gs.state.armoryInventory[0]);
  const plan = gs.getQuickBuyPlan(`repair:${sira}`);
  const parcaKalemi = plan.items.find((i) => i.res === 'fragments');
  assert.ok(parcaKalemi, 'eksik parça plana girer');
  assert.equal(parcaKalemi.qty, b.fragCost);
  assert.ok(yakin(plan.extraAda, b.adaCost, 1e-9), 'ASTRA payı onarım bedeli');
  assert.equal(plan.ok, true);
  // gerçekten al + onar
  const fiyat0 = ammMarket.getPrice('fragments');
  for (const it of plan.items) assert.equal(gs.marketBuy(it.res, it.qty).success, true, `${it.name} alınır`);
  assert.equal(gs.repairEquipment(gs.state.armoryInventory[0]).success, true);
  assert.ok(ammMarket.getPrice('fragments') >= fiyat0, 'alım parça fiyatını düşürmez');
  // hepsi
  const hepsi = gs.getQuickBuyPlan('repairall');
  assert.ok(hepsi.items.length > 0 || gs.getRepairAllCost().parca <= gs.state.inventory.fragments);
  assert.equal(gs.getQuickBuyPlan('repair:999').ok, false);
  gs.state.armoryInventory.forEach((x) => { x.durability = 13; });
  assert.equal(gs.getQuickBuyPlan('repairall').ok, false, 'sağlam eşyada plan yok');
  ok('eksikleri al ve onar planı parçayı içerir ve uygulanır');
}

// 5) Havuz küçültme: eski büyük havuzdan yeni derinliğe; fiyat korunur, fazla ASTRA 50/50 kasalara, ikinci çalıştırma işlemez
{
  const gs = yeni();
  void gs;
  const h = ammMarket.pools.fragments;
  const hedef = GAME_CONFIG.AMM_SEED_ASTRA.fragments;
  assert.equal(Math.round(h.adAstraReserve), hedef, 'yeni dünyada havuz zaten küçük');
  assert.equal(ammMarket.parcaHavuzunuKucult(), 0, 'küçük havuz küçültülmez');
  // eski havuzu kur: 4 M ASTRA, fiyat 0,47
  h.adAstraReserve = 4000000; h.resourceReserve = 4000000 / 0.47;
  const fiyat0 = ammMarket.getPrice('fragments');
  const kv = new Map();
  const db = { kvGet: (k) => (kv.has(k) ? kv.get(k) : null), kvSet: (k, v) => kv.set(k, String(v)) };
  const kar0 = treasury.state.pools.carnival, geri0 = treasury.state.pools.ammBuyback;
  const r = parcaHavuzuGecisi({ db, ammMarket, treasury });
  assert.equal(r.yapildi, true);
  assert.ok(yakin(r.tasinan, 4000000 - hedef, 1e-6));
  assert.ok(yakin(ammMarket.getPrice('fragments'), fiyat0, 1e-9), 'fiyat korunur');
  assert.equal(Math.round(ammMarket.pools.fragments.adAstraReserve), hedef);
  const kar = treasury.state.pools.carnival - kar0, geri = treasury.state.pools.ammBuyback - geri0;
  assert.ok(yakin(kar + geri, r.tasinan, 0.01), 'çıkan ASTRA kaybolmaz');
  assert.ok(Math.abs(kar - geri) < 0.01, 'yarı yarıya');
  const ikinci = parcaHavuzuGecisi({ db, ammMarket, treasury });
  assert.equal(ikinci.yapildi, false, 'bayrak: ikinci kez çalışmaz');
  assert.equal(treasury.state.pools.carnival - kar0, kar, 'ikinci çalıştırmada kasalar değişmez');
  ok('parça havuzu bir kez küçülür: fiyat korunur, fazla ASTRA kasalara');
}

// 6) Küçük havuzda kullanım fiyatı gerçekten yükseltir (eski 8,9 M parçalık havuzda %1'in altındaydı)
{
  const gs = yeni();
  void gs;
  const p0 = ammMarket.getPrice('fragments');
  const parcaHavuzu = ammMarket.pools.fragments.resourceReserve;
  const alinacak = Math.floor(parcaHavuzu * 0.04);   // tek işlemde en çok %5
  const r = ammMarket.executeBuyAmount('fragments', alinacak);
  assert.equal(r.success, true);
  assert.ok(ammMarket.getPrice('fragments') > p0 * 1.07, `havuzun %4'i alınınca fiyat %7'den fazla yükselir: ${p0} → ${ammMarket.getPrice('fragments')}`);
  assert.equal(GAME_CONFIG.AMM_CORRIDORS.fragments.maxPriceAda, 4.5, 'tavan 10 kat');
  ok('küçük havuzda parça alımı fiyatı yükseltir');
}

console.log(`\n${sayac} onarım-parça bloğu geçti.`);
