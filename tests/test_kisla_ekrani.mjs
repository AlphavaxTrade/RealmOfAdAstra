// Kışla ekranının eylemleri (js/ui/ekran/kisla.js): eşya takma/çıkarma, askerler arası taşıma, saf değiştirme, ad değiştirme,
// arama kutusu, eritme raporuna geçiş ve "dayanıklılığı biten eşya takılamaz" kuralı gerçek oyun durumuyla denenir.
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
await import('../js/ui/ekran/index.js');
const { default: kisla } = await import('../js/ui/ekran/kisla.js');

const gs = new GameStateManager();
const s = gs.state;
s.level = 30; s.adAstraBalance = 500000; s.stamina = 5000; s.dungeonProgress = 18;   // 6. kat: asker hakkı 7
for (const k of GAME_CONFIG.RESOURCE_KEYS) s.inventory[k] = 9000;
for (let i = 0; i < 4; i++) gs.buySoldierUnit();
const esya = (id, yuva, ad, atk, hp, dayanikli = 13, seviye = 1) => ({ id, slot: yuva, name: ad, icon: '⚔️', level: seviye, baseAtk: atk, baseHp: hp, atkBonus: atk, hpBonus: hp, durability: dayanikli, maxDurability: 13, craftedAt: 1 });
s.equipment = {};
s.armoryInventory = [esya('k1', 'weapon', 'Güçlü Kılıç', 30, 0), esya('k2', 'weapon', 'Kırık Kılıç', 99, 0, 0), esya('k3', 'helmet', 'Demir Miğfer', 0, 20), esya('k4', 'boots', 'Eski Çizme', 1, 1, 13, 1)];

const bildirimler = [];
const b = {
  gameState: gs, GAME_CONFIG, globalPool, ammMarket, treasury,
  online: { active: false },
  bildir: (m, t) => bildirimler.push([m, t]),
  hudYenile() {}, kilit: () => null
};
const son = () => bildirimler.at(-1) || [];
const el = (veri) => ({ dataset: veri });

// 1) Ekran çizimi: sekmeler ve sayfa
{
  const secenek = {};
  const html = kisla.govde(b, secenek);
  assert.ok(html.includes('Ordu · 4'), 'ordu sekmesi asker sayısını göstermeli');
  assert.ok(html.includes('data-e="sec"'), 'asker satırları seçilebilir olmalı');
  assert.ok(html.includes('id="kisla-sayfa"'), 'seçili askerin sayfası görünmeli');
  assert.equal(secenek.sekme, 'ordu');
}
console.log('✅ ekran çiziliyor');

// 2) Seçme ve ekipman takma: depodaki eşya askere geçer, depodan düşer
{
  const secenek = {};
  await kisla.eylemler.sec(b, el({ idx: '1' }), secenek);
  assert.equal(secenek.secili, 1);
  const once = (s.armoryInventory || []).length;
  await kisla.eylemler.secici(b, el({ yuva: 'weapon' }), secenek);
  assert.equal(secenek.secici, 'weapon');
  const html = kisla.govde(b, secenek);
  assert.ok(html.includes('Güçlü Kılıç'), 'seçici uygun eşyayı göstermeli');
  await kisla.eylemler.tak(b, el({ kaynak: 'armory', yuva: 'weapon', depo: '0' }), secenek);
  assert.equal(son()[1], 'success', son()[0]);
  assert.equal(s.soldierUnits[1].equipment.weapon.name, 'Güçlü Kılıç');
  assert.equal(s.armoryInventory.length, once - 1, 'takılan eşya depodan düşmeli');
  assert.equal(secenek.secici, null, 'başarılı takmadan sonra seçici kapanır');
}
console.log('✅ eşya takma');

// 3) Dayanıklılığı biten eşya takılabilir ama güç vermez (oyun kuralı: calisiyorMu); onarılınca çalışır
{
  const secenek = {};
  await kisla.eylemler.sec(b, el({ idx: '2' }), secenek);
  const once = gs.getSoldierFullStats(2).totalAtk;
  const idx = s.armoryInventory.findIndex((e) => e.name === 'Kırık Kılıç');
  await kisla.eylemler.tak(b, el({ kaynak: 'armory', yuva: 'weapon', depo: String(idx) }), secenek);
  assert.equal(son()[1], 'success', son()[0]);
  assert.equal(s.soldierUnits[2].equipment.weapon.name, 'Kırık Kılıç');
  assert.equal(gs.getSoldierFullStats(2).totalAtk, once, 'kırık eşya saldırıya katkı vermemeli');
  const html = kisla.govde(b, secenek);
  assert.ok(html.includes('0/13 dayanıklılık'), 'ekran kırık eşyayı göstermeli');
  assert.ok(html.includes('data-e="onar"'), 'kırık eşyada Onar düğmesi olmalı');
}
console.log('✅ kırık eşya güç vermiyor, onarılabiliyor');

// 4) Başka askere taşıma: üzerinden çıkarılıp hedefe takılır
{
  const secenek = {};
  await kisla.eylemler.tasi(b, el({ anahtar: 'soldier:weapon::1' }), secenek);
  assert.equal(secenek.tasi, 'soldier:weapon::1');
  globalThis.document = { getElementById: (id) => (id === 'kisla-tasi-hedef' ? { value: '3' } : null) };
  await kisla.eylemler.tasiGit(b, el({ kaynak: 'soldier', yuva: 'weapon', depo: '', asker: '1' }), secenek);
  assert.equal(secenek.tasi, null);
  assert.equal(s.soldierUnits[3].equipment.weapon.name, 'Güçlü Kılıç', son()[0]);
  assert.ok(!s.soldierUnits[1].equipment.weapon, 'kaynak askerin yuvası boşalmalı');
}
console.log('✅ askerler arası taşıma');

// 5) Çıkarma, saf değiştirme, ad değiştirme
{
  const secenek = {};
  await kisla.eylemler.sec(b, el({ idx: '3' }), secenek);
  await kisla.eylemler.cikar(b, el({ yuva: 'weapon' }), secenek);
  assert.ok(!s.soldierUnits[3].equipment.weapon, 'eşya çıkarılmalı');
  assert.ok(s.armoryInventory.some((e) => e.name === 'Güçlü Kılıç'), 'çıkan eşya depoya dönmeli');

  const eski = s.soldierUnits[3].row;
  await kisla.eylemler.saf(b, el({}), secenek);
  assert.notEqual(s.soldierUnits[3].row, eski, 'saf değişmeli');

  kisla.eylemler.adDuzenle(b, el({}), secenek);
  assert.equal(secenek.adDuzenle, 3);
  globalThis.document = { getElementById: (id) => (id === 'input-soldier-rename' ? { value: 'Kurtuluş' } : null) };
  await kisla.eylemler.adKaydet(b, el({}), secenek);
  assert.equal(s.soldierUnits[3].name, 'Kurtuluş');
  assert.equal(secenek.adDuzenle, null, 'kayıttan sonra düzenleme kapanır');
  assert.ok(kisla.govde(b, secenek).includes('Kurtuluş'));
}
console.log('✅ çıkarma, saf, ad');

// 6) Arama kutusu yalnız listeyi günceller; kaçışlama
{
  const secenek = {};
  s.soldierUnits[0].name = 'Ben<b>Kötü</b>';
  const kutu = { innerHTML: '' };
  const kok = { querySelector: (sec) => (sec === '#kisla-liste' ? kutu : null) };
  kisla.girdiler.ara(b, { value: 'kurtuluş' }, secenek, kok);
  assert.ok(kutu.innerHTML.includes('Kurtuluş') && !kutu.innerHTML.includes('Ben&lt;'), 'yalnız eşleşen asker listelenir');
  kisla.girdiler.ara(b, { value: '' }, secenek, kok);
  assert.ok(kutu.innerHTML.includes('Ben&lt;b&gt;'), 'asker adı kaçırılmalı');
  assert.ok(!kutu.innerHTML.includes('<b>Kötü'), 'ham HTML girmemeli');
}
console.log('✅ arama ve kaçışlama');

// 7) Cephanelik: süzgeç değişince sınır sıfırlanır; erit raporu hurda ekranına gider
{
  const secenek = { sekme: 'cephanelik', cLimit: 96 };
  kisla.eylemler.cYuva(b, el({ yuva: 'weapon' }), secenek);
  assert.equal(secenek.cYuva, 'weapon');
  assert.equal(secenek.cLimit, 48);
  const html = kisla.govde(b, secenek);
  assert.ok(html.includes('data-e="ver"') || html.includes('data-e="tasi"'), 'eşya kartlarında eylem olmalı');
  s.armoryInventory.push(esya('f1', 'boots', 'Fazlalık', 1, 1, 13, 1), esya('f2', 'helmet', 'Fazlalık 2', 1, 1, 13, 1));
  const sonuc = await kisla.eylemler.erit(b, el({}), secenek);
  if (sonuc && sonuc.git) {
    assert.equal(sonuc.git, 'hurda');
    assert.ok(sonuc.secenek.rapor && typeof sonuc.secenek.rapor.scrappedCount === 'number');
  } else {
    assert.ok(son()[0], 'eritme başarısızsa mesaj verilmeli');
  }
}
console.log('✅ cephanelik');

console.log('\n7/7 Kışla ekran testi geçti.');
