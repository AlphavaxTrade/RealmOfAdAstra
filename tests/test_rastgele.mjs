// server/rastgele.js: güvenli rastgelelik. Aralık ve dağılım sağlaması, Math.random değişimi, sunucuda kalan Math.random yok.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rastgele, tamsayi, guvenliRastgeleKur, guvenliMi } from '../server/rastgele.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const yerlesik = Math.random;   // bu dosya yüklendiğinde henüz hiçbir şey değiştirmedi

// 1) rastgele(): [0,1) aralığı, ortalama ve eşit dağılım (gevşek sağlama; kesin istatistik testi değil)
{
  const N = 40000, kova = new Array(10).fill(0);
  let toplam = 0;
  for (let i = 0; i < N; i++) {
    const x = rastgele();
    assert.ok(x >= 0 && x < 1, 'aralık dışı: ' + x);
    toplam += x; kova[Math.floor(x * 10)]++;
  }
  assert.ok(Math.abs(toplam / N - 0.5) < 0.01, 'ortalama ~0,5: ' + toplam / N);
  for (const k of kova) assert.ok(k > N / 10 * 0.9 && k < N / 10 * 1.1, 'kova dengesiz: ' + kova.join(','));
  const farkli = new Set(Array.from({ length: 1000 }, rastgele)).size;
  assert.ok(farkli > 995, 'tekrarlayan değerler çok');
  ok('rastgele(): aralık [0,1), ortalama ve 10 kovalı dağılım makul');
}

// 2) tamsayi(n): sınırlar, tüm değerler çıkar, geçersiz n reddedilir
{
  const gorulen = new Set();
  for (let i = 0; i < 2000; i++) { const v = tamsayi(6); assert.ok(Number.isInteger(v) && v >= 0 && v < 6); gorulen.add(v); }
  assert.equal(gorulen.size, 6, 'zar gibi 6 değerin hepsi çıkmalı');
  assert.equal(tamsayi(1), 0);
  for (const kotu of [0, -3, NaN, 2 ** 49]) assert.throws(() => tamsayi(kotu), RangeError, String(kotu));
  ok('tamsayi(n): doğru aralık, hepsi çıkar, geçersiz n RangeError');
}

// 3) guvenliRastgeleKur(): yerleşik Math.random'u değiştirir, tekrar çağrı zararsız, sahte sürüme dokunmaz
{
  assert.equal(guvenliMi(), false, 'başlangıçta yerleşik');
  assert.equal(guvenliRastgeleKur(), true, 'değiştirildi');
  assert.equal(guvenliMi(), true);
  assert.equal(guvenliRastgeleKur(), false, 'ikinci çağrı bir şey yapmaz');
  const x = Math.random();
  assert.ok(x >= 0 && x < 1);

  Math.random = yerlesik;                      // yerleşiğe geri dön
  const sahte = () => 0.123;
  Math.random = sahte;                         // bir test sahte sürüm koymuş
  assert.equal(guvenliRastgeleKur(), false, 'sahte sürüme dokunulmaz');
  assert.equal(Math.random, sahte);
  Math.random = yerlesik;
  ok('Math.random yalnız yerleşikse değiştirilir; testlerin sahte sürümü korunur');
}

// 4) Sunucu kodunda doğrudan Math.random kalmadı (rastgele.js hariç)
{
  const dizin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server');
  const kalan = [];
  for (const f of fs.readdirSync(dizin).filter(f => f.endsWith('.js') && f !== 'rastgele.js')) {
    fs.readFileSync(path.join(dizin, f), 'utf8').split(/\r?\n/).forEach((s, i) => { if (s.replace(/\/\/.*$/, '').includes('Math.random')) kalan.push(`${f}:${i + 1}`); });   // yorum satırları sayılmaz
  }
  assert.deepEqual(kalan, [], 'sunucuda Math.random kullanımı kaldı: ' + kalan.join(', '));
  ok('server/*.js içinde Math.random kalmadı');
}

// 5) Sunucu motoru kurulunca oyun kodunun Math.random'u güvenli sürüme geçer
{
  const { openDb } = await import('../server/db.js');
  const { createEngine } = await import('../server/engine.js');
  Math.random = yerlesik;
  const db = openDb(':memory:');
  await createEngine(db, { testMode: true });
  assert.equal(guvenliMi(), true, 'createEngine güvenli rastgeleliği kurmalı');
  db.close();
  Math.random = yerlesik;
  ok('createEngine oyun kodunun Math.random\'unu güvenli sürümle değiştirir');
}

console.log(`\n${passed}/5 rastgelelik testi geçti`);
