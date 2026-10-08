// Gözlemlenebilirlik uçları (kurumsal A7.3, A7.6, A7.7): istek kimliği (X-Request-Id), istek günlüğü, 500'de kimlik,
// /api/ready (veritabanı + zamanlayıcı nabzı), /metrics (yönetici ya da yalnız yerel adres; vekil arkasında kapalı).
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';
import { createLogger } from '../server/log.js';

let passed = 0;
const ok = name => { passed++; console.log(`✅ ${name}`); };
const sessiz = { log() {}, info() {}, warn() {}, error() {} };
const YONETICI = 'yonetici-test-anahtari-uzun-1234567890';
// Düşük düzey istek: Node'un http istemcisi (fetch başlıkları kısıtlar; X-Forwarded-For gibi başlıkları da burada serbestçe gönderiyoruz)
const iste = (base, yol, basliklar = {}) => new Promise((res, rej) => {
  const u = new URL(base + yol);
  const r = http.get({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: basliklar, agent: false }, x => {
    let g = ''; x.on('data', d => { g += d; }); x.on('end', () => res({ durum: x.statusCode, basliklar: x.headers, govde: g }));
  });
  r.on('error', rej);
});

async function baslat({ seviye = 'debug', worldEk = null, cfgEk = {} } = {}) {
  const satirlar = [];
  const log = createLogger({ seviye, cikti: s => satirlar.push(JSON.parse(s)) });
  const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: YONETICI, serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000, testMode: true, ...cfgEk };
  const db = openDb(':memory:');
  const engine = await createEngine(db, { testMode: true });
  const mailer = createMailer({ db, cfg, log: sessiz });
  const accounts = createAccounts({ db, cfg, mailer, verifyMessage: () => '0x0' });
  let world = createWorld({ db, engine, chain: null, accounts, mailer, cfg, log: sessiz });
  if (worldEk) world = { ...world, ...worldEk(world) };
  const app = createApp({ db, engine, world, accounts, chain: null, cfg, log });
  const server = app.server().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  return { server, db, app, satirlar, base: `http://127.0.0.1:${server.address().port}`, kapat: () => { server.close(); server.closeAllConnections(); app.metrik?.durdur(); } };
}

// 1) Her yanıtta X-Request-Id; geçerli gelen kimlik korunur, zararlı olan değiştirilir
{
  const s = await baslat();
  const a = await iste(s.base, '/api/health');
  assert.match(a.basliklar['x-request-id'], /^[A-Za-z0-9._-]{8,64}$/, 'API yanıtında kimlik');
  const b = await iste(s.base, '/api/yok');
  assert.equal(b.durum, 404); assert.ok(b.basliklar['x-request-id'], '404 yanıtında da kimlik');
  const c = await iste(s.base, '/', { 'X-Request-Id': 'vekil-uretti-12345' });
  assert.equal(c.basliklar['x-request-id'], 'vekil-uretti-12345', 'vekilin (Caddy) ürettiği kimlik korunur');
  const d = await iste(s.base, '/api/health', { 'X-Request-Id': 'kotu"} {"sev":"error"' });
  assert.notEqual(d.basliklar['x-request-id'], 'kotu"} {"sev":"error"', 'günlüğü bozabilecek kimlik kabul edilmez');
  assert.match(d.basliklar['x-request-id'], /^[A-Za-z0-9._-]{8,64}$/);
  assert.notEqual(a.basliklar['x-request-id'], d.basliklar['x-request-id'], 'her istek ayrı kimlik');
  s.kapat();
  ok('her yanıtta X-Request-Id; geçerli gelen korunur, zararlı olan yenisiyle değişir');
}

// 2) İstek günlüğü: yöntem, rota anahtarı (ham adres değil), durum, ms, kimlik; gürültü debug seviyesinde
{
  const s = await baslat({ seviye: 'info' });
  const r = await iste(s.base, '/api/rates');         // dünya kapalıysa 404 ya da veri; her hâlde "bilinen rota"
  await iste(s.base, '/api/health');                  // sağlık ucu info'da yazılmaz
  await iste(s.base, '/api/bilinmeyen/123456');       // bilinmeyen rota: etiket "bilinmeyen" (ham adres günlüğe/metriğe girmez)
  const istekler = s.satirlar.filter(x => x.ileti === 'istek');
  const rates = istekler.find(x => x.rota === 'GET /api/rates');
  assert.ok(rates, 'bilinen rota anahtarıyla yazılır: ' + JSON.stringify(istekler));
  assert.equal(rates.yontem, 'GET'); assert.equal(typeof rates.ms, 'number'); assert.equal(rates.durum, r.durum);
  assert.equal(rates.istek, r.basliklar['x-request-id'], 'günlükteki kimlik başlıktakiyle aynı');
  assert.ok(!istekler.some(x => x.rota === 'GET /api/health'), 'sağlık ucu info seviyesinde yazılmaz');
  const bil = istekler.find(x => x.durum === 404);
  assert.equal(bil.rota, 'bilinmeyen'); assert.ok(!JSON.stringify(bil).includes('123456'));
  s.kapat();
  const d = await baslat({ seviye: 'debug' });
  await iste(d.base, '/api/health');
  assert.ok(d.satirlar.some(x => x.ileti === 'istek' && x.rota === 'GET /api/health'), 'debug seviyesinde sağlık ucu da yazılır');
  d.kapat();
  ok('istek günlüğü: rota anahtarı, durum, süre, kimlik; sağlık ucu yalnız debug; ham adres sızmaz');
}

// 3) 500 yanıtı kimliği taşır ve iç ayrıntı sızdırmaz; günlükteki hata satırı aynı kimliği taşır
{
  const s = await baslat({ worldEk: () => ({ ratesStatus: () => { throw new Error('gizli iç ayrıntı: /srv/veri/realm.db'); } }) });
  const r = await iste(s.base, '/api/rates');
  assert.equal(r.durum, 500);
  const govde = JSON.parse(r.govde);
  assert.equal(govde.error, 'Sunucu hatası');
  assert.equal(govde.istekKimligi, r.basliklar['x-request-id'], 'kullanıcıya gösterilen kimlik günlükte aranabilir');
  assert.ok(!r.govde.includes('realm.db'), 'iç ayrıntı yanıta girmez');
  const hata = s.satirlar.find(x => x.sev === 'error' && /İstek hatası/.test(x.ileti));
  assert.ok(hata, 'hata günlüğe yazıldı');
  assert.equal(hata.istek, govde.istekKimligi, 'hata satırı aynı kimliği taşır (bağlam kendiliğinden eklendi)');
  assert.ok(hata.hata && hata.hata.mesaj.includes('gizli iç ayrıntı'), 'ayrıntı yalnız günlükte');
  s.kapat();
  ok('500: kullanıcıya yalnız kimlik, ayrıntı yalnız günlükte; ikisi aynı kimlikle eşleşir');
}

// 4) /api/ready: veritabanı + zamanlayıcı nabzı
{
  let yas = 1000;
  const s = await baslat({ worldEk: () => ({ tickDurumu: () => ({ yasMs: yas, calisiyor: false, tur: 3, hataSayisi: 0 }) }) });
  const a = await iste(s.base, '/api/ready');
  assert.equal(a.durum, 200); assert.equal(JSON.parse(a.govde).hazir, true);
  yas = 5 * 60000;                                           // zamanlayıcı 5 dakikadır tur bitirmedi → takılmış
  const b = await iste(s.base, '/api/ready');
  assert.equal(b.durum, 503);
  const bj = JSON.parse(b.govde);
  assert.equal(bj.hazir, false); assert.equal(bj.kontroller.zamanlayici, false); assert.equal(bj.kontroller.veritabani, true);
  yas = 1000;
  s.db.raw.close();                                           // veritabanı erişilemez
  const c = await iste(s.base, '/api/ready');
  assert.equal(c.durum, 503); assert.equal(JSON.parse(c.govde).kontroller.veritabani, false);
  assert.ok(!c.govde.includes('SQLITE') && !/Error/.test(c.govde), 'ham hata yanıta girmez');
  s.kapat();
  ok('/api/ready: sağlıklıyken 200; zamanlayıcı takılırsa 503; veritabanı yoksa 503; ham hata sızmaz');
}

// 5) /metrics erişimi: yönetici ya da yalnız yerel adres (vekil başlığı yoksa); içerik doğru
{
  const s = await baslat();
  await iste(s.base, '/api/health'); await iste(s.base, '/api/rates');
  const yerel = await iste(s.base, '/metrics');
  assert.equal(yerel.durum, 200, 'yerel adresten (vekilsiz) açık');
  assert.match(yerel.basliklar['content-type'], /^text\/plain; version=0\.0\.4/);
  assert.equal(yerel.basliklar['cache-control'], 'no-store');
  for (const ad of ['realm_http_istek_toplam{rota="GET /api/health",sinif="2xx"}', 'realm_http_sure_saniye_bucket', 'realm_surec_rss_bayt', 'realm_db_dosya_bayt', 'realm_odeme_bekleyen', 'realm_zamanlayici_tur_toplam', 'realm_zamanlayici_hata_toplam', 'realm_zamanlayici_son_bitis_yas_saniye']) assert.ok(yerel.govde.includes(ad), ad + ' yok');
  const vekilli = await iste(s.base, '/metrics', { 'X-Forwarded-For': '203.0.113.9' });
  assert.equal(vekilli.durum, 401, 'dışarıdan (vekil başlığıyla) gelen yönetici şifresiz giremez');
  const yanlis = await iste(s.base, '/metrics', { 'X-Forwarded-For': '203.0.113.9', Authorization: 'Bearer yanlis-sifre-yanlis-sifre-yanlis' });
  assert.equal(yanlis.durum, 401);
  const dogru = await iste(s.base, '/metrics', { 'X-Forwarded-For': '203.0.113.9', Authorization: 'Bearer ' + YONETICI });
  assert.equal(dogru.durum, 200, 'yönetici şifresiyle dışarıdan da açılır');
  s.kapat();
  ok('/metrics: yerel adres ya da yönetici şifresiyle açık, vekil arkasında şifresiz kapalı; beklenen ölçüler var');
}

// 6) Ölçüm değerleri gerçekle uyumlu: bekleyen ödeme sayısı ve veritabanı boyutu
{
  const s = await baslat();
  s.db.raw.prepare("INSERT INTO payouts (epoch, kind, address, amount, status, created_at) VALUES (1,'w','0xa',1,'pending',1),(1,'w','0xb',1,'pending',1),(1,'w','0xc',1,'sent',1)").run();
  const m = (await iste(s.base, '/metrics')).govde;
  assert.match(m, /^realm_odeme_bekleyen 2$/m, 'yalnız bekleyen ödemeler sayılır');
  s.kapat();
  ok('ölçüler gerçekle uyumlu (bekleyen ödeme sayısı)');
}

// 7) Zamanlayıcı nabzı (world.tickDurumu): tur sayısı, süre, hata sayacı, takılan tur yaşlanır
{
  let simdi = 1_000_000;
  const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true };
  const db = openDb(':memory:');
  const engine = await createEngine(db, { testMode: true });
  const world = createWorld({ db, engine, chain: null, cfg, clock: () => simdi, log: sessiz });
  assert.equal(world.tickDurumu().tur, 0); assert.equal(world.tickDurumu().calisiyor, false);
  simdi += 30_000;
  assert.equal(world.tickDurumu().yasMs, 30_000, 'ilk tur gelene dek yaş = oluşturulmadan beri');
  await world.tick();
  let d = world.tickDurumu();
  assert.equal(d.tur, 1); assert.equal(d.hataSayisi, 0); assert.equal(d.yasMs, 0); assert.equal(typeof d.sonSureMs, 'number');
  simdi += 120_000;
  assert.equal(world.tickDurumu().yasMs, 120_000, 'tur bitmeden zaman geçtikçe yaş büyür');
  const asil = engine.globalPool.checkEpochExpiration;
  engine.globalPool.checkEpochExpiration = () => { throw new Error('dünya bozuldu'); };
  await assert.rejects(world.tick(), /dünya bozuldu/, 'hata yutulmaz, çağırana iletilir');
  d = world.tickDurumu();
  assert.equal(d.hataSayisi, 1); assert.match(d.sonHata, /dünya bozuldu/); assert.equal(d.tur, 2, 'hatalı tur da biten tur sayılır'); assert.equal(d.calisiyor, false, 'hata sonrası kilit açılır');
  engine.globalPool.checkEpochExpiration = asil;
  await world.tick();
  assert.equal(world.tickDurumu().hataSayisi, 1, 'sayaç yalnız artar; sonraki sağlam tur onu silmez');
  ok('zamanlayıcı nabzı: tur/süre/hata sayacı, hata sonrası kilit açılır, yaş büyür');
}

console.log(`\n${passed}/7 gözlem ucu testi geçti`);
