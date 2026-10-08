// Oturum anahtarları veritabanında düz saklanmaz (kurumsal A2.7): özet saklanır; giriş/çıkış/şifre sıfırlama çalışır;
// eski (düz anahtarlı) kayıt dosyası bir kez özetlenir ve kimse çıkış yapmaz.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';
import { tokenOzeti, eskiOturumlariOzetle } from '../server/oturum.js';

let passed = 0;
const ok = name => { passed++; console.log(`✅ ${name}`); };
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const quiet = { log() {}, warn() {}, error() {} };

// 1) Saf yardımcı
{
  assert.equal(tokenOzeti('abc'), sha('abc'));
  assert.equal(tokenOzeti('abc').length, 64);
  assert.notEqual(tokenOzeti('abc'), tokenOzeti('abd'));
  ok('tokenOzeti SHA-256 (64 hane)');
}

// 2) Eski düz anahtarlı kayıt dosyası: bir kez özetlenir, ikinci çağrı dokunmaz
{
  const raw = new DatabaseSync(':memory:');
  raw.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE sessions (token TEXT PRIMARY KEY, address TEXT NOT NULL, expires INTEGER NOT NULL)');
  raw.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run('eski-duz-anahtar-1', 'acc:1', 9e15);
  raw.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run('eski-duz-anahtar-2', 'acc:2', 9e15);
  assert.equal(eskiOturumlariOzetle(raw), 2);
  const t = raw.prepare('SELECT token FROM sessions ORDER BY address').all().map(r => r.token);
  assert.deepEqual(t, [sha('eski-duz-anahtar-1'), sha('eski-duz-anahtar-2')]);
  assert.equal(eskiOturumlariOzetle(raw), 0, 'ikinci çağrı özeti tekrar özetlemez');
  assert.deepEqual(raw.prepare('SELECT token FROM sessions ORDER BY address').all().map(r => r.token), t);
  raw.close();
  ok('eski düz oturumlar bir kez özetlenir (idempotent)');
}

// 3) Uçtan uca: giriş, çıkış, şifre sıfırlama
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000, testMode: true };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
const mailer = createMailer({ db, cfg, log: quiet });
const accounts = createAccounts({ db, cfg, mailer, verifyMessage: () => '0x0' });
const world = createWorld({ db, engine, chain: null, accounts, mailer, cfg, log: quiet });
const app = createApp({ db, engine, world, accounts, chain: null, cfg, log: quiet });
const server = app.server().listen(0);
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, body, token) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const lastLink = kind => {
  const m = db.kvJson('dev:outbox', [])[0];
  for (const p of (m ? m.text : '').matchAll(/[?&](\w+)=([a-f0-9]+)/g)) if (p[1] === kind) return p[2];
  return null;
};

try {
  await call('POST', '/api/account/register', { email: 'oturum@ornek.com', password: 'gizli-sifre-123' });
  const v = await call('POST', '/api/account/verify', { token: lastLink('verify') });
  const token = v.body.token;
  assert.ok(/^[0-9a-f]{64}$/.test(token));

  // Tabloda düz anahtar yok, özeti var
  const satirlar = db.raw.prepare('SELECT token FROM sessions').all().map(r => r.token);
  assert.ok(!satirlar.includes(token), 'düz anahtar saklanmamalı');
  assert.ok(satirlar.includes(sha(token)), 'özet saklanmalı');
  assert.equal((await call('GET', '/api/account/me', null, token)).status, 200, 'gerçek anahtarla giriş çalışır');
  assert.equal((await call('GET', '/api/account/me', null, sha(token))).status, 401, 'tablodaki özetle giriş YAPILAMAZ');
  ok('oturum tablosunda yalnız özet var; özetle giriş yapılamaz');

  // Çıkış
  const l2 = await call('POST', '/api/account/login', { email: 'oturum@ornek.com', password: 'gizli-sifre-123' });
  const t2 = l2.body.token;
  assert.equal((await call('GET', '/api/state', null, t2)).status, 200);
  assert.equal((await call('POST', '/api/account/logout', {}, t2)).status, 200);
  assert.equal((await call('GET', '/api/state', null, t2)).status, 401, 'çıkıştan sonra anahtar geçersiz');
  assert.equal((await call('GET', '/api/state', null, token)).status, 200, 'diğer oturum etkilenmez');
  ok('çıkış yalnız o oturumu kapatır');

  // Şifre sıfırlama bütün oturumları kapatır
  await call('POST', '/api/account/forgot', { email: 'oturum@ornek.com' });
  const r = await call('POST', '/api/account/reset', { token: lastLink('reset'), password: 'yeni-gizli-sifre-456' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await call('GET', '/api/state', null, token)).status, 401, 'şifre değişince eski oturumlar kapanır');
  ok('şifre sıfırlama bütün oturumları kapatır');
} finally { server.close(); }

console.log(`\n${passed}/5 oturum özeti testi geçti`);
