// Yönetici işlemlerinin denetim izi (kurumsal A2.9): her yönetici POST'u ve yetkisiz deneme olay kaydına yazılır;
// salt okunur GET (durum paneli sık yenilenir) yazılmaz; istek gövdesi (şifre, kod vb.) kayda GİRMEZ.
import assert from 'node:assert/strict';
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
const ADMIN = 'yonetici-test-anahtari-uzun-1234567890';

const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: ADMIN, serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000, testMode: true };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
const mailer = createMailer({ db, cfg, log: quiet });
const accounts = createAccounts({ db, cfg, mailer, verifyMessage: () => '0x0' });
const world = createWorld({ db, engine, chain: null, accounts, mailer, cfg, log: quiet });
const app = createApp({ db, engine, world, accounts, chain: null, cfg, log: quiet });
const server = app.server().listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, body, token) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const olaylar = tip => db.raw.prepare('SELECT * FROM events WHERE type = ? ORDER BY id').all(tip).map(o => ({ ...o, veri: o.data ? JSON.parse(o.data) : null }));

try {
  // 1) Başarılı yönetici POST'u kaydedilir (rota, durum, adres); gövde kayda girmez
  const r = await call('POST', '/api/admin/pause', { paused: true, gizliAlan: 'bu-kayda-girmemeli' }, ADMIN);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const a = olaylar('admin');
  assert.equal(a.length, 1);
  assert.equal(a[0].veri.route, 'POST /api/admin/pause');
  assert.equal(a[0].veri.status, 200);
  assert.ok(a[0].veri.ip, 'istek adresi kayıtlı');
  assert.ok(!JSON.stringify(a[0]).includes('bu-kayda-girmemeli'), 'istek gövdesi kayda girmemeli');
  assert.ok(!JSON.stringify(a[0]).includes(ADMIN), 'yönetici şifresi kayda girmemeli');
  ok('yönetici POST kaydedilir (rota, durum, adres); gövde ve şifre kayda girmez');

  // 2) Kullanıcı hatası (400) da kaydedilir
  const kotu = await call('POST', '/api/admin/universe-stage', { stage: 99 }, ADMIN);
  assert.equal(kotu.status, 400);
  const a2 = olaylar('admin');
  assert.equal(a2.length, 2);
  assert.equal(a2[1].veri.route, 'POST /api/admin/universe-stage');
  assert.equal(a2[1].veri.status, 400);
  ok('başarısız yönetici işlemi de durum koduyla kaydedilir');

  // 3) Salt okunur GET yazılmaz
  assert.equal((await call('GET', '/api/admin/status', null, ADMIN)).status, 200);
  assert.equal(olaylar('admin').length, 2, 'GET durum sorgusu kayıt üretmemeli');
  ok('salt okunur GET kayıt üretmez');

  // 4) Yetkisiz deneme kaydedilir
  assert.equal((await call('POST', '/api/admin/pause', { paused: false }, 'yanlis-sifre')).status, 401);
  assert.equal((await call('GET', '/api/admin/status')).status, 401);
  const y = olaylar('admin-yetkisiz');
  assert.equal(y.length, 2);
  assert.equal(y[0].veri.route, 'POST /api/admin/pause');
  assert.ok(!JSON.stringify(y).includes('yanlis-sifre'), 'denenen şifre kayda girmemeli');
  assert.equal(world.econ().paused, true, 'yetkisiz istek durumu değiştirmedi');
  ok('yetkisiz yönetici denemesi kaydedilir (denenen şifre hariç)');
} finally { server.close(); }

console.log(`\n${passed}/4 yönetici denetim izi testi geçti`);
