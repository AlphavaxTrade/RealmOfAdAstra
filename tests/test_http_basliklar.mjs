// HTTP başlıkları ve zaman aşımları (kurumsal A2.8): HSTS yalnız HTTPS yayında, COOP, hash'li dosyalar "immutable" önbellek,
// yavaş istemci (slowloris) kesilir, aşırı büyük başlık reddedilir.
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
const ok = name => { passed++; console.log(`✅ ${name}`); };
const quiet = { log() {}, warn() {}, error() {} };
// fetch yanıtının gövdesi mutlaka tüketilir: okunmamış gövde bağlantıyı askıda bırakır ve sonraki bölümleri bozar
const get = async url => { const r = await fetch(url); await r.arrayBuffer(); return r; };

// Geçici "dist": index.html + hash'li js + hash'siz görsel
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-'));
fs.mkdirSync(path.join(dist, 'assets'));
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>x</title>');
fs.writeFileSync(path.join(dist, 'assets', 'index-AbCd1234.js'), 'console.log(1)');
fs.writeFileSync(path.join(dist, 'assets', 'adastra_vadisi.jpg'), 'jpg');

async function baslat(ek = {}) {
  const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: true, distDir: dist, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000, testMode: true, ...ek };
  const db = openDb(':memory:');
  const engine = await createEngine(db, { testMode: true });
  const mailer = createMailer({ db, cfg, log: quiet });
  const accounts = createAccounts({ db, cfg, mailer, verifyMessage: () => '0x0' });
  const world = createWorld({ db, engine, chain: null, accounts, mailer, cfg, log: quiet });
  const app = createApp({ db, engine, world, accounts, chain: null, cfg, log: quiet });
  const server = app.server().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  return { server, port: server.address().port, base: `http://127.0.0.1:${server.address().port}`, db };
}

// 1) HSTS yalnız HTTPS adresiyle yayınlanırken; COOP her zaman
{
  const http1 = await baslat({ publicUrl: 'http://localhost:8080' });
  const r1 = await get(http1.base + '/api/health');
  assert.equal(r1.headers.get('strict-transport-security'), null, 'http yayında HSTS olmaz');
  assert.equal(r1.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
  http1.server.close(); http1.server.closeAllConnections();
  const https1 = await baslat({ publicUrl: 'https://oyun.ornek.com' });
  const r2 = await get(https1.base + '/api/health');
  assert.match(r2.headers.get('strict-transport-security') || '', /max-age=31536000/);
  assert.equal((await get(https1.base + '/')).headers.get('strict-transport-security') !== null, true, 'sayfalarda da HSTS');
  https1.server.close(); https1.server.closeAllConnections();
  ok('HSTS yalnız https PUBLIC_URL ile; COOP her yanıtta');
}

// 2) Önbellek: hash'li js/css "immutable" 1 yıl; hash'siz görsel ve html farklı
{
  const s = await baslat();
  const js = await get(s.base + '/assets/index-AbCd1234.js');
  assert.equal(js.status, 200);
  assert.equal(js.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  const jpg = await get(s.base + '/assets/adastra_vadisi.jpg');
  assert.equal(jpg.headers.get('cache-control'), 'public, max-age=86400', 'hash\'siz dosya immutable olmaz');
  const html = await get(s.base + '/');
  assert.equal(html.headers.get('cache-control'), 'no-cache');
  s.server.close(); s.server.closeAllConnections();
  ok('önbellek: hash\'li js immutable, hash\'siz görsel 1 gün, html no-cache');
}

// 3) Yavaş istemci (başlıkları bitirmeyen) kesilir; aşırı büyük başlık reddedilir
{
  const s = await baslat({ httpTimeouts: { headers: 600, request: 1500, keepAlive: 2000, interval: 100, maxHeader: 16384 } });
  const kapandi = await new Promise(resolve => {
    const sock = net.connect(s.port, '127.0.0.1', () => sock.write('GET /api/health HTTP/1.1\r\nHost: x\r\nX-Yavas: a'));   // başlık hiç bitmiyor
    const zaman = setTimeout(() => { sock.destroy(); resolve(false); }, 4000);
    sock.resume();   // veri okunmazsa soket 'close' demez (sunucunun 408 yanıtı ve kapanışı okunmalı)
    sock.on('close', () => { clearTimeout(zaman); resolve(true); });
    sock.on('error', () => { /* sunucu bağlantıyı kesti: beklenen */ });
  });
  assert.equal(kapandi, true, 'yavaş istemci zaman aşımıyla kesilmeli');
  const cevap = await new Promise(resolve => {
    const sock = net.connect(s.port, '127.0.0.1', () => sock.write('GET /api/health HTTP/1.1\r\nHost: x\r\nX-Buyuk: ' + 'a'.repeat(40000) + '\r\n\r\n'));
    let veri = '';
    sock.on('data', d => { veri += d.toString(); });
    sock.on('close', () => resolve(veri));
    sock.on('error', () => resolve(veri));
    setTimeout(() => { sock.destroy(); resolve(veri); }, 3000);
  });
  assert.match(cevap, /^HTTP\/1\.1 431/, 'aşırı büyük başlık 431 ile reddedilmeli: ' + cevap.slice(0, 40));
  s.server.close(); s.server.closeAllConnections();
  ok('yavaş istemci kesilir, aşırı büyük başlık 431');
}

fs.rmSync(dist, { recursive: true, force: true });
console.log(`\n${passed}/3 HTTP başlık testi geçti`);
