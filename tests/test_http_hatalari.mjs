// HTTP hata yolları (kurumsal A3.7): bozuk/büyük gövde, bilinmeyen rota, yetkisiz istek, yol gezme (path traversal), CORS izin listesi,
// hız sınırı (429) ve yönetici yanlış şifre kilidi. Hiçbir kötü istek sunucuyu düşürmemeli.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const quiet = { log() {}, warn() {}, error() {} };
const ADMIN = 'yonetici-test-anahtari-uzun-1234567890';

// Geçici dist + dist DIŞINDA bir "gizli" dosya (yol gezme ile okunamamalı)
const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'http-hata-'));
const dist = path.join(kok, 'dist');
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>oyun</title>');
fs.writeFileSync(path.join(kok, 'gizli.txt'), 'DISARIDAKI-GIZLI-ICERIK');

async function baslat(ek = {}) {
  const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: ADMIN, serveDist: true, distDir: dist, rateLimitPerSec: 1e6, publicRateLimitPerSec: 1e6, ipRateLimitPerSec: 1e6, testMode: true, ...ek };
  const db = openDb(':memory:');
  const engine = await createEngine(db, { testMode: true });
  const mailer = createMailer({ db, cfg, log: quiet });
  const accounts = createAccounts({ db, cfg, mailer, verifyMessage: () => '0x0' });
  const world = createWorld({ db, engine, chain: null, accounts, mailer, cfg, log: quiet });
  const app = createApp({ db, engine, world, accounts, chain: null, cfg, log: quiet });
  const server = app.server().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  return { server, port: server.address().port, base: `http://127.0.0.1:${server.address().port}` };
}
async function istek(url, secenek = {}) { const r = await fetch(url, secenek); const metin = await r.text(); let json = null; try { json = JSON.parse(metin); } catch { /* JSON olmayan yanıt */ } return { status: r.status, headers: r.headers, metin, json }; }
// Ham HTTP isteği (fetch'in yolu düzeltmesini atlatmak için)
function ham(port, istekSatiri, ekBaslik = '') {
  return new Promise(resolve => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write(`${istekSatiri} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n${ekBaslik}\r\n`));
    let veri = '';
    sock.on('data', d => { veri += d.toString('utf8'); });
    sock.on('close', () => resolve(veri));
    sock.on('error', () => resolve(veri));
    setTimeout(() => { sock.destroy(); resolve(veri); }, 3000);
  });
}

try {
  const s = await baslat({ corsOrigins: ['https://oyun.example'] });

  // 1) Bilinmeyen rota / yöntem: JSON 404; sunucu ayakta
  {
    const a = await istek(s.base + '/api/yok-boyle-bir-uc');
    assert.equal(a.status, 404);
    assert.deepEqual(a.json, { error: 'Bulunamadı' });
    assert.equal((await istek(s.base + '/api/health', { method: 'DELETE' })).status, 404, 'yanlış yöntem = bilinmeyen rota');
    assert.equal((await istek(s.base + '/api/__proto__')).status, 404);
    assert.equal((await istek(s.base + '/api/health')).status, 200);
    ok('bilinmeyen rota ve yöntem 404 (JSON), sunucu ayakta');
  }

  // 2) Kimlik: eksik / bozuk Bearer 401
  {
    for (const baslik of [{}, { Authorization: 'Bearer' }, { Authorization: 'Bearer ' }, { Authorization: 'Basic abc' }, { Authorization: 'Bearer ' + 'a'.repeat(64) }, { Authorization: 'Bearer ' + 'x'.repeat(5000) }]) {
      const r = await istek(s.base + '/api/state', { headers: baslik });
      assert.equal(r.status, 401, JSON.stringify(baslik).slice(0, 60));
      assert.equal(r.json.error, 'Giriş gerekli');
    }
    ok('eksik/bozuk/rastgele Bearer anahtarı 401');
  }

  // 3) Gövde: bozuk JSON 400, dizi/null 400, 64 KB üstü reddedilir (yanıt ya da bağlantı kesme), sonra sunucu sağlam
  {
    const post = govde => istek(s.base + '/api/account/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: govde });
    assert.equal((await post('{bozuk')).status, 400);
    assert.equal((await post('[]')).status, 400);
    assert.equal((await post('null')).status, 400);
    assert.equal((await post('"metin"')).status, 400);
    let buyuk;
    try { buyuk = (await post(JSON.stringify({ email: 'a@b.cc', password: 'x'.repeat(70 * 1024) }))).status; } catch { buyuk = 'baglanti-kesildi'; }
    assert.ok(buyuk === 400 || buyuk === 'baglanti-kesildi', '64 KB üstü gövde kabul edilmemeli: ' + buyuk);
    assert.equal((await istek(s.base + '/api/health')).status, 200, 'büyük gövdeden sonra sunucu sağlam');
    ok('bozuk JSON, dizi/null ve 64 KB üstü gövde reddedilir');
  }

  // 4) Statik dosya: yol gezme ve bozuk kodlama
  {
    const gizliSizdi = yanit => yanit.includes('DISARIDAKI-GIZLI-ICERIK');
    for (const yol of ['/..%2fgizli.txt', '/..%2f..%2fgizli.txt', '/assets/..%2f..%2fgizli.txt', '/%2e%2e/gizli.txt', '/..\\gizli.txt']) {
      const y = await ham(s.port, `GET ${yol}`);
      assert.ok(!gizliSizdi(y), `yol gezme başarılı oldu: ${yol}\n${y.slice(0, 200)}`);
    }
    assert.match(await ham(s.port, 'GET /%00'), /^HTTP\/1\.1 400/, 'null bayt 400');
    assert.match(await ham(s.port, 'GET /%E0%A4%A'), /^HTTP\/1\.1 400/, 'bozuk yüzde-kodlama 400');
    assert.equal((await istek(s.base + '/')).status, 200);
    assert.equal((await istek(s.base + '/baska/sayfa/yok')).metin.includes('<title>oyun</title>'), true, 'bilinmeyen sayfa oyunun ana sayfasına düşer');
    ok('yol gezme dist dışına çıkamaz; bozuk kodlama 400');
  }

  // 5) CORS: yalnız izin listesindeki adres; yönetici uçlarına asla
  {
    const izinli = await istek(s.base + '/api/health', { headers: { Origin: 'https://oyun.example' } });
    assert.equal(izinli.headers.get('access-control-allow-origin'), 'https://oyun.example');
    assert.equal(izinli.headers.get('vary'), 'Origin');
    const yabanci = await istek(s.base + '/api/health', { headers: { Origin: 'https://kotu.example' } });
    assert.equal(yabanci.headers.get('access-control-allow-origin'), null, 'izin listesinde olmayan adrese başlık verilmez');
    const onUcus = await istek(s.base + '/api/state', { method: 'OPTIONS', headers: { Origin: 'https://oyun.example', 'Access-Control-Request-Method': 'GET' } });
    assert.equal(onUcus.status, 204);
    assert.equal(onUcus.headers.get('access-control-allow-origin'), 'https://oyun.example');
    const yonetici = await istek(s.base + '/api/admin/status', { headers: { Origin: 'https://oyun.example', Authorization: 'Bearer ' + ADMIN } });
    assert.equal(yonetici.headers.get('access-control-allow-origin'), null, 'yönetici uçları çapraz kaynağa açılmaz');
    ok('CORS: yalnız izin listesi, yönetici uçları hariç');
  }
  s.server.close();

  // 6) Yönetici yanlış şifre: 10 denemeden sonra DOĞRU şifre bile bir süre reddedilir
  {
    const a = await baslat();
    for (let i = 0; i < 10; i++) assert.equal((await istek(a.base + '/api/admin/status', { headers: { Authorization: 'Bearer yanlis' + i } })).status, 401);
    const kilitli = await istek(a.base + '/api/admin/status', { headers: { Authorization: 'Bearer ' + ADMIN } });
    assert.equal(kilitli.status, 429, 'kilit sonrası doğru şifre de bekletilir');
    assert.match(kilitli.json.error, /10 dakika/);
    a.server.close();
    ok('yönetici şifresi 10 yanlış denemeden sonra kilitlenir (429)');
  }

  // 7) IP başına hız sınırı
  {
    const h = await baslat({ ipRateLimitPerSec: 5 });
    const kodlar = [];
    for (let i = 0; i < 8; i++) kodlar.push((await istek(h.base + '/api/health')).status);
    assert.ok(kodlar.slice(0, 5).every(k => k === 200), 'sınır altı istekler geçer: ' + kodlar);
    assert.ok(kodlar.includes(429), 'sınır aşılınca 429: ' + kodlar);
    h.server.close();
    ok('IP hız sınırı aşılınca 429');
  }
} finally { fs.rmSync(kok, { recursive: true, force: true }); }

console.log(`\n${passed}/7 HTTP hata yolu testi geçti`);
