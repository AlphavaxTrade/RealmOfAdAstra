// server/metrik.js: Prometheus metin biçimi (kurumsal A7.7): sayaç, birikimli histogram, ölçü (gauge), etiket kaçışı,
// bozuk ölçüm kaynağı tüm taramayı bozmaz, etiket sayısı sınırlı (bellek şişmez).
import assert from 'node:assert/strict';
import { createMetrik } from '../server/metrik.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const satirlar = m => m.metin().split('\n');
const deger = (m, onEk) => { const s = satirlar(m).find(l => l.startsWith(onEk)); return s ? Number(s.slice(onEk.length).trim()) : undefined; };

// 1) İstek sayacı ve birikimli histogram
{
  const m = createMetrik();
  m.istek('GET /api/state', 200, 0.004);
  m.istek('GET /api/state', 200, 0.2);
  m.istek('GET /api/state', 500, 12);
  m.istek('POST /api/action', 429, 0.001);
  assert.equal(deger(m, 'realm_http_istek_toplam{rota="GET /api/state",sinif="2xx"} '), 2);
  assert.equal(deger(m, 'realm_http_istek_toplam{rota="GET /api/state",sinif="5xx"} '), 1);
  assert.equal(deger(m, 'realm_http_istek_toplam{rota="POST /api/action",sinif="4xx"} '), 1);
  // birikimli: le=0.005 → 1; le=0.25 → 2; le=+Inf → 3
  assert.equal(deger(m, 'realm_http_sure_saniye_bucket{rota="GET /api/state",le="0.005"} '), 1);
  assert.equal(deger(m, 'realm_http_sure_saniye_bucket{rota="GET /api/state",le="0.25"} '), 2);
  assert.equal(deger(m, 'realm_http_sure_saniye_bucket{rota="GET /api/state",le="+Inf"} '), 3);
  assert.equal(deger(m, 'realm_http_sure_saniye_count{rota="GET /api/state"} '), 3);
  assert.ok(Math.abs(deger(m, 'realm_http_sure_saniye_sum{rota="GET /api/state"} ') - 12.204) < 1e-9);
  assert.ok(m.metin().includes('# TYPE realm_http_sure_saniye histogram'));
  assert.ok(m.metin().includes('# TYPE realm_http_istek_toplam counter'));
  ok('istek sayacı (durum sınıfına göre) ve birikimli histogram doğru');
}

// 2) Ölçüler: sayı, etiketli dizi, bozuk kaynak taramayı bozmaz
{
  const m = createMetrik();
  m.gauge('realm_test_sayi', 'Deneme sayısı', () => 42);
  m.gauge('realm_test_etiketli', 'Etiketli', () => [{ etiket: { durum: 'bekleyen' }, deger: 3 }, { etiket: { durum: 'hata' }, deger: 1 }]);
  m.gauge('realm_test_bozuk', 'Hata atan', () => { throw new Error('kaynak yok'); });
  m.gauge('realm_test_nan', 'Sayı değil', () => NaN);
  assert.equal(deger(m, 'realm_test_sayi '), 42);
  assert.equal(deger(m, 'realm_test_etiketli{durum="bekleyen"} '), 3);
  assert.equal(deger(m, 'realm_test_etiketli{durum="hata"} '), 1);
  assert.ok(!m.metin().includes('realm_test_bozuk '), 'bozuk kaynak satırı atlanır');
  assert.ok(!/realm_test_nan [^\n]*NaN/.test(m.metin()), 'sayı olmayan değer yazılmaz');
  assert.ok(m.metin().includes('# HELP realm_test_sayi Deneme sayısı'));
  assert.ok(m.metin().endsWith('\n'), 'metin satır sonuyla biter (Prometheus şartı)');
  ok('ölçüler (tek değer, etiketli dizi); bozuk kaynak ve NaN taramayı bozmaz');
}

// 3) Etiket kaçışı ve sınırlı etiket sayısı
{
  const m = createMetrik({ enFazlaRota: 5 });
  m.istek('GET /a"b\\c\nd', 200, 0.01);
  assert.ok(m.metin().includes('rota="GET /a\\"b\\\\c\\nd"'), 'tırnak, ters bölü ve satır sonu kaçışlı');
  for (let i = 0; i < 50; i++) m.istek('GET /x' + i, 200, 0.01);
  const rotalar = new Set([...m.metin().matchAll(/realm_http_istek_toplam\{rota="([^"]*)"/g)].map(x => x[1]));
  assert.ok(rotalar.size <= 6, 'rota sayısı sınırlı (+ "diger"): ' + rotalar.size);
  assert.ok(rotalar.has('diger'), 'sınırı aşanlar "diger" altında toplanır');
  assert.equal(deger(m, 'realm_http_istek_toplam{rota="diger",sinif="2xx"} '), 46);
  ok('etiket değerleri kaçışlı; rota çeşidi sınırlı (bellek şişmez)');
}

// 4) Süreç ölçümleri hazır gelir
{
  const m = createMetrik();
  for (const ad of ['realm_surec_rss_bayt', 'realm_surec_heap_kullanilan_bayt', 'realm_surec_calisma_saniye', 'realm_olay_dongusu_gecikme_saniye']) assert.ok(m.metin().includes(ad), ad + ' var');
  assert.ok(deger(m, 'realm_surec_rss_bayt ') > 1e7);
  m.durdur();
  ok('süreç (bellek, çalışma süresi) ve olay döngüsü gecikmesi ölçüleri hazır');
}

console.log(`\n${passed}/4 metrik testi geçti`);
