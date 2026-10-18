// Zindan dengesi ölçüm aracının (scripts/model/zindan_denge.mjs) kendi doğruluğu (18 Ekim 2026): sabit tohum, mantıklı tekdüzelik,
// bilinen noktalar ve teçhizat formülünün GERÇEK yükseltme koduyla aynı olması. (Denge eğrisinin kendisi: tests/test_zindan_egri.mjs.)
import assert from 'node:assert/strict';
import { ordu, kazanmaSansi, gerekenAsker, gerekenTakimSeviyesi, esyaOlustur, takimMaliyeti, katOf, HAK_KURALLARI, DUNGEON_LEVELS, YUVALAR, GAME_CONFIG } from '../scripts/model/zindan_denge.mjs';

const ok = ad => console.log(`✅ ${ad}`);
const canavar = lv => DUNGEON_LEVELS.find(c => c.level === lv);

// 1) tekrarlanabilir: aynı soru iki kez aynı cevap (sabit tohum)
{
  const a = kazanmaSansi(ordu(3, 5, 2), canavar(6), 3), b = kazanmaSansi(ordu(3, 5, 2), canavar(6), 3);
  assert.equal(a, b);
  ok('aynı soru iki kez aynı sonucu veriyor (sabit tohum)');
}

// 2) bilinen noktalar: 1. canavar çıplak sv.1 askerle 1 asker yetmez, 2 asker yeter; seviye 20 askerle 1 asker yeter
{
  assert.ok(kazanmaSansi(ordu(1, 1, 0), canavar(1), 1) < 80);
  assert.ok(kazanmaSansi(ordu(2, 1, 0), canavar(1), 2) >= 80);
  assert.equal(gerekenAsker(canavar(1), 1), 2);
  assert.equal(gerekenAsker(canavar(1), 20), 1);
  ok('bilinen noktalar: 1. canavar sv.1 çıplak askerle 2 asker ister, sv.20 askerle 1 yeter');
}

// 3) tekdüzelik: daha çok asker, daha yüksek takım, daha yüksek asker seviyesi kazanma ihtimalini AZALTMAZ (örnekleme gürültüsü payı 6)
{
  const c = canavar(8), pay = 6;
  const sans = (n, s, t) => kazanmaSansi(ordu(n, s, t), c, n);
  for (let n = 1; n < 6; n++) assert.ok(sans(n + 1, 5, 1) >= sans(n, 5, 1) - pay, `asker ${n}→${n + 1}`);
  for (let t = 0; t < 8; t++) assert.ok(sans(4, 5, t + 1) >= sans(4, 5, t) - pay, `takım ${t}→${t + 1}`);
  for (const s of [1, 5, 10, 20]) assert.ok(sans(4, s * 2, 2) >= sans(4, s, 2) - pay, `asker seviyesi ${s}→${s * 2}`);
  ok('daha çok asker, daha yüksek takım ve asker seviyesi kazanma şansını azaltmıyor');
}

// 4) takım seviyesi araması: bulunan seviye gerçekten eşiği geçiyor, bir altı geçmiyor
{
  const c = canavar(3), n = 2, s = 5;
  const t = gerekenTakimSeviyesi(c, n, s);
  assert.ok(t > 0 && t <= 10, 'bu durumda takım gerekir');
  assert.ok(kazanmaSansi(ordu(n, s, t), c, n) >= 80);
  assert.ok(kazanmaSansi(ordu(n, s, t - 1), c, n) < 80);
  ok('gereken takım seviyesi tam eşiği veriyor (bir altı yetmiyor)');
}

// 5) teçhizat formülü gerçek yükseltme koduyla aynı: aracın k+1. seviye bonusu = oyunun hesapladığı nextAtk/nextHp
{
  const gs = ordu(1, 1, 0);
  for (const y of YUVALAR) for (let k = 1; k < GAME_CONFIG.EQUIPMENT_MAX_LEVEL; k++) {
    const maliyet = gs.calculateEquipmentUpgradeCost(esyaOlustur(y, k));
    const sonraki = esyaOlustur(y, k + 1);
    assert.equal(maliyet.nextAtk, sonraki.atkBonus, `${y} sv.${k + 1} saldırı`);
    assert.equal(maliyet.nextHp, sonraki.hpBonus, `${y} sv.${k + 1} can`);
  }
  ok('araçtaki teçhizat gücü formülü oyunun gerçek yükseltme hesabıyla birebir aynı (5 yuva, seviye 1-10)');
}

// 6) maliyet birikimli artıyor; kat ve hak yardımcıları
{
  let onceki = 0;
  for (let t = 1; t <= 10; t++) { const m = takimMaliyeti(t); assert.ok(m.astra > onceki && m.odun > 0 && m.demir > 0); onceki = m.astra; }
  assert.deepEqual([1, 3, 4, 9, 10, 18].map(katOf), [1, 1, 2, 3, 4, 6]);
  assert.equal(HAK_KURALLARI['kat+1'](canavar(1)), 2); assert.equal(HAK_KURALLARI['kat+1'](canavar(18)), 7);
  assert.equal(HAK_KURALLARI.seviye(canavar(9)), 9); assert.equal(HAK_KURALLARI.kat(canavar(9)), 3);
  ok('takım maliyeti seviyeyle artıyor; kat ve hak yardımcıları doğru');
}

console.log('\n6/6 zindan denge aracı testi geçti');
