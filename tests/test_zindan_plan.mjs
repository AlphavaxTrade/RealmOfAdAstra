// Zindan planı: 6 kat × 3 oda = 18 seviye; kat ve oda durumları, kilit mesajı, yetenek sözlüğü, kütük ve resim dosyaları.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KATLAR, KAT_SAYISI, ODA_SAYISI, EN_UST_SEVIYE, katSeviyeleri, katCanavarlari, baslangicKati, odaDurumu, katDurumu,
  kilitMesaji, sansTonu, sansYorumu, YETENEKLER, yetenekBilgisi, bossKatiMi
} from '../js/ui/zindan/plan.js';
import { kutukHtml, HIKAYE } from '../js/ui/zindan/kutuk.js';
import { DUNGEON_LEVELS } from '../js/bestiary.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 1) 6 kat, her katta 3 canavar, 18 seviye tam ve tekil; resimler var; geçit yalnız son kat dışında
assert.equal(KATLAR.length, KAT_SAYISI);
assert.equal(EN_UST_SEVIYE, 18);
const gorulen = [];
KATLAR.forEach((k, i) => {
  assert.equal(k.kat, i + 1);
  const canavarlar = katCanavarlari(k.kat);
  assert.equal(canavarlar.length, ODA_SAYISI, `${k.kat}. katın 3 canavarı`);
  canavarlar.forEach((m) => { gorulen.push(m.level); assert.ok(m.name && m.hp > 0 && m.atk > 0, `${m.name} alanları`); });
  assert.deepEqual(katSeviyeleri(k.kat), canavarlar.map((m) => m.level), `${k.kat}. kat seviyeleri bestiary ile aynı`);
  assert.ok(fs.existsSync(path.join(kok, 'public', k.resim)), `${k.resim} dosyası var`);
  assert.ok(k.rozet && k.ad && k.alt, 'ad, alt başlık ve rozet adı');
  if (k.kat < KAT_SAYISI) {
    const g = k.gecit;
    assert.ok(g && g.sol >= 0 && g.ust >= 0 && g.sol + g.en <= 100.01 && g.ust + g.boy <= 100.01, `${k.kat}. kat geçidi resmin içinde`);
  } else {
    assert.equal(k.gecit, null, 'son katta geçit yok');
  }
});
assert.deepEqual([...gorulen].sort((a, b) => a - b), Array.from({ length: EN_UST_SEVIYE }, (_, i) => i + 1), '18 seviye tam ve tekil');
assert.deepEqual(KATLAR.filter((k) => bossKatiMi(k.kat)).map((k) => k.kat), [3, 6]);
console.log('✅ plan: 6 kat, 18 seviye, resimler ve geçitler');

// 2) Oyuncu hangi kattan başlar
assert.equal(baslangicKati(1), 1);
assert.equal(baslangicKati(3), 1);
assert.equal(baslangicKati(4), 2);
assert.equal(baslangicKati(10), 4);
assert.equal(baslangicKati(18), 6);
assert.equal(baslangicKati(19), 6, 'zindan bitince son kat');
assert.equal(baslangicKati(undefined), 1);
console.log('✅ başlangıç katı');

// 3) Oda ve kat durumları
assert.deepEqual(odaDurumu(3, 3), { kilitli: false, yenildi: false, siradaki: true });
assert.deepEqual(odaDurumu(2, 5), { kilitli: false, yenildi: true, siradaki: false });
assert.deepEqual(odaDurumu(7, 5), { kilitli: true, yenildi: false, siradaki: false });
assert.deepEqual(katDurumu(1, 1), { temizlenen: 0, tamam: false, acik: true });
assert.deepEqual(katDurumu(1, 3), { temizlenen: 2, tamam: false, acik: true });
assert.deepEqual(katDurumu(1, 4), { temizlenen: 3, tamam: true, acik: true });
assert.deepEqual(katDurumu(2, 4), { temizlenen: 0, tamam: false, acik: true });
assert.deepEqual(katDurumu(3, 4), { temizlenen: 0, tamam: false, acik: false });
assert.deepEqual(katDurumu(6, 19), { temizlenen: 3, tamam: true, acik: true });
console.log('✅ oda ve kat durumları');

// 4) Metinler Türkçe ve "Chamber" yok
const m = { level: 9, name: 'Kadim Taş Golyat' };
assert.match(kilitMesaji(3, m), /Seviye 3'desiniz.*\[Seviye 9\] Kadim Taş Golyat/);
assert.equal(sansTonu(null), 'yok');
assert.equal(sansTonu(80), 'iyi');
assert.equal(sansTonu(60), 'uyari');
assert.equal(sansTonu(20), 'kotu');
assert.match(sansYorumu(null), /asker yok/);
for (const k of KATLAR) assert.ok(!/Chamber|Floor/.test(`${k.ad} ${k.alt}`), 'İngilizce başlık yok');
console.log('✅ metinler Türkçe, şans tonları');

// 5) Bestiary'deki her yeteneğin oyuncuya açıklaması var; her canavarın hikâyesi var
const yetenekler = new Set(DUNGEON_LEVELS.flatMap((x) => x.abilities || []));
for (const y of yetenekler) assert.ok(YETENEKLER[y] && YETENEKLER[y].metin, `${y} yeteneğinin açıklaması`);
assert.equal(yetenekBilgisi('bilinmeyen').ad, 'bilinmeyen');
for (const x of DUNGEON_LEVELS) assert.ok(HIKAYE[x.level], `${x.level}. seviyenin hikâyesi`);
console.log('✅ yetenek sözlüğü ve hikâyeler eksiksiz');

// 6) Kütük: karşılaşılmayan canavar "???"
{
  const yeni = kutukHtml(1);
  assert.equal(yeni.gorulen, 1);
  assert.equal(yeni.toplam, 18);
  assert.equal((yeni.html.match(/is-kapali/g) || []).length, 17, '17 canavar kapalı');
  assert.ok(!yeni.html.includes('Kadim Taş Golyat'), 'bilinmeyen canavarın adı sızmaz');
  const hepsi = kutukHtml(19);
  assert.equal(hepsi.gorulen, 18);
  assert.ok(hepsi.html.includes('Kıyamet Ejderhası IGNIS') && !hepsi.html.includes('is-kapali'));
}
console.log('✅ canavar kütüğü');
