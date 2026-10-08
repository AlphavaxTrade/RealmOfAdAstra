// server/kapanis.js: düzgün kapanış (kurumsal A7.5): yeni bağlantı kabul edilmez, yarıdaki istek TAMAMLANIR, zamanlayıcılar durur,
// bekleyen işler beklenir, süre dolarsa zorla kapatılır, veritabanı EN SON ve bir kez kapanır, ikinci çağrı zararsız.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createKapanis } from '../server/kapanis.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const bekle = ms => new Promise(r => setTimeout(r, ms));
const sessiz = { info() {}, warn() {}, error() {}, log() {} };
const dinle = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const istek = (port, yol = '/') => new Promise((res, rej) => {
  const r = http.get({ host: '127.0.0.1', port, path: yol, agent: false }, x => { let g = ''; x.on('data', d => { g += d; }); x.on('end', () => res({ durum: x.statusCode, govde: g })); });
  r.on('error', rej);
});

// 1) Yarıdaki istek tamamlanır; sonra yeni bağlantı reddedilir; db en son bir kez kapanır
{
  const olaylar = [];
  const srv = http.createServer((q, s) => { setTimeout(() => { olaylar.push('yanit'); s.end('tamam'); }, 300); });
  const port = await dinle(srv);
  let durdu = 0;
  const db = { close: () => olaylar.push('db') };
  const kapat = createKapanis({ server: srv, db, log: sessiz, durdur: [() => { durdu++; olaylar.push('durdur'); }], beklemeMs: 3000 }).kapat;
  const yarida = istek(port);
  await bekle(60);
  const sonuc = await kapat('test');
  const yanit = await yarida;
  assert.equal(yanit.govde, 'tamam', 'yarıdaki istek yanıtını aldı');
  assert.deepEqual(olaylar, ['durdur', 'yanit', 'db'], 'sıra: zamanlayıcılar → bitmemiş istek → veritabanı');
  assert.equal(sonuc.temiz, true);
  await assert.rejects(istek(port), 'kapandıktan sonra yeni bağlantı kurulamaz');
  assert.equal(durdu, 1);
  ok('yarıdaki istek tamamlanır, zamanlayıcılar durur, veritabanı en son kapanır, yeni bağlantı reddedilir');
}

// 2) İkinci çağrı aynı sözü döndürür (SIGTERM + SIGINT birlikte gelse de db iki kez kapanmaz)
{
  const srv = http.createServer((q, s) => s.end('x'));
  await dinle(srv);
  let dbKapanis = 0;
  const { kapat } = createKapanis({ server: srv, db: { close: () => { dbKapanis++; } }, log: sessiz });
  const [a, b] = await Promise.all([kapat('SIGTERM'), kapat('SIGINT')]);
  assert.equal(dbKapanis, 1);
  assert.deepEqual(a, b);
  ok('ikinci kapanış çağrısı zararsız (veritabanı bir kez kapanır)');
}

// 3) Takılan istek: süre dolunca zorla kapatılır, yine de db kapanır; temiz=false
{
  const srv = http.createServer(() => { /* hiç yanıt vermez */ });
  const port = await dinle(srv);
  let dbKapandi = false;
  const { kapat } = createKapanis({ server: srv, db: { close: () => { dbKapandi = true; } }, log: sessiz, beklemeMs: 250 });
  const takili = istek(port).catch(e => e);
  await bekle(60);
  const t0 = Date.now();
  const s = await kapat('test');
  assert.ok(Date.now() - t0 < 2000, 'sonsuza kadar beklemez');
  assert.equal(s.temiz, false);
  assert.ok(dbKapandi);
  assert.ok((await takili) instanceof Error, 'takılan istemcinin bağlantısı kesildi');
  ok('takılan istek süre dolunca zorla kapatılır; veritabanı yine de kapanır');
}

// 4) Bekleyen işler (ör. zamanlayıcı turu) beklenir; başarısız olan kapanışı engellemez
{
  const srv = http.createServer((q, s) => s.end('x'));
  await dinle(srv);
  const olaylar = [];
  const is1 = bekle(200).then(() => olaylar.push('tur-bitti'));
  const is2 = Promise.reject(new Error('tur hatası'));
  const { kapat } = createKapanis({ server: srv, db: { close: () => olaylar.push('db') }, log: sessiz, bekleyenler: () => [is1, is2, null], beklemeMs: 3000 });
  const s = await kapat('test');
  assert.deepEqual(olaylar, ['tur-bitti', 'db']);
  assert.equal(s.temiz, true);
  ok('bekleyen işler tamamlanır; hatalı olan kapanışı engellemez');
}

// 5) db.close hata verse de çökmez ve sonuç bildirilir
{
  const srv = http.createServer((q, s) => s.end('x'));
  await dinle(srv);
  const kayit = [];
  const { kapat } = createKapanis({ server: srv, db: { close: () => { throw new Error('kilitli'); } }, log: { ...sessiz, error: (...a) => kayit.push(a.join(' ')) } });
  const s = await kapat('test');
  assert.equal(s.temiz, false);
  assert.ok(kayit.some(k => k.includes('Veritabanı')), 'hata günlüğe yazıldı: ' + kayit);
  ok('veritabanı kapatma hatası günlüğe yazılır, kapanış sürer');
}

console.log(`\n${passed}/5 kapanış testi geçti`);
