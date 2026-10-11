// Bot ASTRA açığını kapatırken hangi malzemeden kaç birim satacağını planlayan saf kural.
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { esitSatisPlani } = await import('../js/gameState/bot.js');
const { GAME_CONFIG } = await import('../js/config.js');

const K = GAME_CONFIG.RESOURCE_KEYS;
const hepsi = (deger) => Object.fromEntries(K.map(k => [k, deger]));
const topla = (plan) => K.reduce((t, k) => t + plan[k], 0);

// Her malzemede yeterli stok: hepsinden AYNI miktar satılır
{
  const plan = esitSatisPlani(K, hepsi(1000), hepsi(0.5), 6);   // 6 kaynak x 0,5 = 3 ASTRA/birim → 2 birim
  for (const k of K) assert.equal(plan[k], 2, `${k} eşit miktar`);
}
// En az 1 birim satılır (hedef çok küçük olsa bile)
{
  const plan = esitSatisPlani(K, hepsi(1000), hepsi(10), 0.01);
  for (const k of K) assert.equal(plan[k], 1);
}
// Bir malzeme az: ortak en düşük stok kadar eşit, kalan açık stoğu artanlardan eşit paylaştırılır
{
  const stok = hepsi(100);
  stok.wood = 3;
  const plan = esitSatisPlani(K, stok, hepsi(1), 60);           // 6 ASTRA/birim: 3 birimle 18, kalan 42 → artanlardan +9
  assert.equal(plan.wood, 3, 'az stoklu malzeme kendi stoğunu geçmez');
  for (const k of K.filter(x => x !== 'wood')) assert.equal(plan[k], 12, `${k} = 3 + 9`);
  for (const k of K) assert.ok(plan[k] <= stok[k], `${k} stoğu aşılmadı`);
}
// Bir malzemenin stoğu hiç yok: stoğu olanlar arasında eşit satılır, yoksa hiçbir şey satılmaz
{
  const stok = hepsi(50);
  stok.iron = 0;
  const plan = esitSatisPlani(K, stok, hepsi(1), 10);
  assert.equal(plan.iron, 0);
  for (const k of K.filter(x => x !== 'iron')) assert.equal(plan[k], 2, `${k} eşit`);   // 10 / 5 kaynak
  assert.equal(topla(esitSatisPlani(K, hepsi(0), hepsi(1), 10)), 0, 'stok yoksa satış yok');
}
// Hiçbir plan stoktan fazlasını satmaz
{
  for (const hedef of [1, 7, 33, 500, 90000]) {
    const stok = Object.fromEntries(K.map((k, i) => [k, i * 7]));
    const plan = esitSatisPlani(K, stok, hepsi(0.8), hedef);
    for (const k of K) assert.ok(plan[k] <= stok[k] + 1e-9, `hedef ${hedef}: ${k}`);
  }
}
console.log('✅ bot eşit satış planı');
