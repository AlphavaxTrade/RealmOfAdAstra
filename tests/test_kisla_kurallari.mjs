// Kışla'nın saf kuralları: yuva adayları, öneri dağıtımı, asker listesi süzme/sıralama, cephanelik süzgeci.
import assert from 'node:assert/strict';
import { YUVALAR, guc, kullanilabilir, dayaniklilik, canTonu, fark, adaylar, tumEsyalar, esyaAnahtari, oneriler, askerListesi, sayilar, cephanelikListesi } from '../js/ui/kisla-kurallari.js';

const esya = (slot, atk, hp, ek = {}) => ({ slot, name: `${slot}-${atk}`, atkBonus: atk, hpBonus: hp, durability: 10, maxDurability: 13, ...ek });

// 1) Güç, dayanıklılık ve ton kuralları
assert.equal(guc(esya('weapon', 10, 6)), 36);
assert.equal(guc(null), 0);
assert.equal(kullanilabilir(esya('weapon', 1, 1, { durability: 0 })), false, 'dayanıklılığı bitmiş eşya güç vermez');
assert.equal(kullanilabilir(esya('weapon', 1, 1)), true);
assert.equal(kullanilabilir(undefined), false);
assert.deepEqual(dayaniklilik(esya('weapon', 1, 1, { durability: 3 })), { cur: 3, max: 13, pct: 23, ton: 'kotu' });
assert.equal(dayaniklilik(esya('weapon', 1, 1, { durability: 7 })).ton, 'uyari');
assert.equal(dayaniklilik({ atkBonus: 1 }).cur, 13, 'dayanıklılık alanı yoksa tam sayılır');
assert.equal(canTonu(20), 'kotu');
assert.equal(canTonu(50), 'uyari');
assert.equal(canTonu(90), 'iyi');
assert.deepEqual(fark(esya('weapon', 12, 4), esya('weapon', 10, 6)), { saldiri: 2, can: -2 });
assert.deepEqual(fark(esya('weapon', 5, 0), undefined), { saldiri: 5, can: 0 });
console.log('✅ güç, dayanıklılık, fark');

// 2) Adaylar: krallık yuvası ve cephanelik, güçlüden zayıfa; yuvaya uymayan girmez
const durum = {
  equipment: { weapon: esya('weapon', 5, 0), helmet: null },
  armoryInventory: [esya('weapon', 20, 0), esya('helmet', 1, 9), esya('weapon', 8, 0), null],
  soldierUnits: [
    { name: 'A', row: 'front', equipment: { weapon: esya('weapon', 2, 0) } },
    { name: 'B', row: 'back', equipment: {} },
    { name: 'C', row: 'front', equipment: { weapon: esya('weapon', 30, 0), armor: esya('armor', 3, 3, { durability: 0 }) } }
  ]
};
{
  const a = adaylar(durum, 'weapon');
  assert.deepEqual(a.map((x) => x.item.atkBonus), [20, 8, 5]);
  assert.deepEqual(a.map((x) => x.source), ['armory', 'armory', 'kingdom']);
  assert.equal(a[0].armoryIndex, 0);
  assert.equal(adaylar(durum, 'boots').length, 0);
  const hepsi = tumEsyalar(durum);
  assert.equal(hepsi.length, 1 + 3 + 3, 'krallık 1 + cephanelik 3 + asker 3');
  assert.equal(hepsi.filter((e) => e.source === 'soldier').length, 3);
  assert.equal(new Set(hepsi.map(esyaAnahtari)).size, hepsi.length, 'anahtarlar benzersiz');
}
console.log('✅ adaylar ve tüm eşyalar');

// 3) Öneriler: en güçlü boştaki eşya en zayıf askere; her asker yuvası yalnız bir kez
{
  const hepsi = tumEsyalar(durum);
  const o = oneriler(hepsi, durum.soldierUnits);
  const sil20 = hepsi.find((e) => e.source === 'armory' && e.item.atkBonus === 20);
  const sil8 = hepsi.find((e) => e.source === 'armory' && e.item.atkBonus === 8);
  const sil5 = hepsi.find((e) => e.source === 'kingdom');
  // silah yuvası: B boş (-1), A 6 güç, C 90 güç → 20'lik B'ye, 8'lik A'ya (A 6 < 24); 5'lik yetmez (A artık dolu hedef)
  assert.equal(o.get(esyaAnahtari(sil20)).idx, 1);
  assert.equal(o.get(esyaAnahtari(sil8)).idx, 0);
  assert.equal(o.has(esyaAnahtari(sil5)), false, 'yeterince güçlü olmayan eşya önerilmez');
  const hedefler = [...o.values()].map((h) => `${h.idx}`);
  assert.equal(new Set(hedefler.filter((_, i) => i < 2)).size, 2, 'aynı asker iki kez önerilmez');
  // dayanıklılığı biten zırh "boş" sayılır: C'nin zırhı için gelen eşya C'ye önerilebilir
  const yeni = { ...durum, armoryInventory: [esya('armor', 1, 1)] };
  const o2 = oneriler(tumEsyalar(yeni), yeni.soldierUnits);
  const zirh = tumEsyalar(yeni).find((e) => e.source === 'armory');
  assert.ok([0, 1, 2].includes(o2.get(esyaAnahtari(zirh)).idx));
}
console.log('✅ öneri dağıtımı');

// 4) Asker listesi: arama (ad ve numara), süzgeçler, sıralama, sayılar
{
  const gs = {
    state: durum,
    getSoldierHealInfo: (i) => ({ hp: 10, maxHp: 10, hpPct: [100, 40, 100][i], isFull: i !== 1 }),
    getSoldierFullStats: (i) => ({ totalAtk: [10, 5, 99][i], totalMaxHp: 100 })
  };
  assert.equal(askerListesi(gs).length, 3);
  assert.deepEqual(askerListesi(gs, { q: 'b' }).map((r) => r.s.name), ['B']);
  assert.deepEqual(askerListesi(gs, { q: '3' }).map((r) => r.s.name), ['C'], 'numarayla arama');
  assert.deepEqual(askerListesi(gs, { filtre: 'yarali' }).map((r) => r.s.name), ['B']);
  assert.deepEqual(askerListesi(gs, { filtre: 'arka' }).map((r) => r.s.name), ['B']);
  assert.deepEqual(askerListesi(gs, { filtre: 'on' }).map((r) => r.s.name), ['A', 'C']);
  assert.equal(askerListesi(gs, { filtre: 'eksik' }).length, 3, 'hiçbirinin beş yuvası dolu değil');
  assert.deepEqual(askerListesi(gs, { sirala: 'guc' }).map((r) => r.s.name), ['C', 'A', 'B']);
  assert.deepEqual(askerListesi(gs, { sirala: 'can' }).map((r) => r.s.name)[0], 'B');
  assert.deepEqual(sayilar(gs), { hepsi: 3, yarali: 1, eksik: 3, on: 2, arka: 1 });
  assert.equal(askerListesi({ ...gs, state: { soldierUnits: [] } }).length, 0);
}
console.log('✅ asker listesi');

// 5) Cephanelik süzgeci: konum ve yuva
{
  const hepsi = tumEsyalar(durum);
  assert.equal(cephanelikListesi(hepsi, { nerede: 'bosta' }).length, 4, 'boşta: krallık 1 + cephanelik 3');
  assert.equal(cephanelikListesi(hepsi, { nerede: 'askerde' }).length, 3);
  assert.equal(cephanelikListesi(hepsi, { nerede: 'hepsi' }).length, 7);
  assert.equal(cephanelikListesi(hepsi, { yuva: 'weapon', nerede: 'hepsi' }).length, 5);
  const guclu = cephanelikListesi(hepsi, { yuva: 'weapon', nerede: 'hepsi', sirala: 'guc' });
  assert.deepEqual(guclu.map((e) => e.item.atkBonus), [30, 20, 8, 5, 2]);
  const yipranan = cephanelikListesi(hepsi, { nerede: 'hepsi', sirala: 'yipranmis' });
  assert.equal(yipranan[0].item.durability, 0);
  assert.deepEqual(YUVALAR, ['weapon', 'helmet', 'armor', 'legs', 'boots']);
}
console.log('✅ cephanelik süzgeci');

console.log('\n5/5 Kışla kuralı testi geçti.');
