// v2 — Deneme sunucusunda "vanilla sıfırla": dünya (havuzlar, hazine, kota, piyango) ve bütün oyuncu kayıtları ilk güne
// döner; hesaplar ve vatandaşlık kalır; gerçek sunucuda (testMode kapalı) yol kapalıdır.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';
import { createKapi } from '../server/kapi.js';
import { createPazar } from '../server/pazar.js';

let passed = 0;
const ok = name => { passed++; console.log(`✅ ${name}`); };

const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000, testMode: true };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
let now = Date.UTC(2026, 9, 7, 12);
const clock = () => now;
const quiet = { log() {}, warn() {}, error() {} };
const mailer = createMailer({ db, cfg, log: quiet });
const accounts = createAccounts({ db, cfg, mailer, clock, verifyMessage: () => '0x0' });
const kapi = createKapi({ db, engine, accounts, mailer, cfg, clock, log: quiet });
const pazar = createPazar({ db, engine, clock, log: quiet });
const world = createWorld({ db, engine, chain: null, accounts, mailer, kapi, pazar, cfg, clock, log: quiet });
const app = createApp({ db, engine, world, accounts, kapi, pazar, chain: null, cfg, clock, log: quiet });
const server = app.server().listen(0);
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, body, token) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const outbox = () => db.kvJson('dev:outbox', []);
const lastLink = kind => { const m = outbox()[0]; const r = new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(m ? m.text : ''); return r && r[1]; };
async function register(email) {
  const r = await call('POST', '/api/account/register', { email, password: 'gizli-sifre-123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = await call('POST', '/api/account/verify', { token: lastLink('verify') });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { token: v.body.token, pid: v.body.playerId };
}
const RES = engine.GAME_CONFIG.RESOURCE_KEYS;

try {
  const A = await register('ayse@ornek.com');
  const B = await register('bora@ornek.com');
  await world.tick();

  // 1) Oyuncu A zenginleşir, pazarda alım yapar, B de kaynak alır
  for (const k of RES) assert.equal((await call('POST', '/api/action', { name: 'setDevResource', args: [k, 5000] }, A.token)).status, 200);
  assert.equal((await call('POST', '/api/action', { name: 'setDevAdAstra', args: [500] }, A.token)).status, 200);
  assert.equal((await call('POST', '/api/action', { name: 'setDevLevel', args: [5] }, A.token)).status, 200);
  const buy = await call('POST', '/api/action', { name: 'marketBuy', args: ['wood', 100] }, A.token);
  assert.equal(buy.status, 200, JSON.stringify(buy.body));
  assert.equal((await call('POST', '/api/action', { name: 'setDevResource', args: ['stone', 777] }, B.token)).status, 200);
  const before = await call('GET', '/api/state', null, A.token);
  assert.equal(before.body.player.level, 5);
  assert.ok(before.body.world.globalPool.totalSpent > 0 || before.body.world.amm.wood.resource !== undefined, 'dünya değişti');
  const seedWood = engine.GAME_CONFIG.AMM_SEED?.wood;
  ok('hazırlık: iki oyuncu, kaynak, seviye, pazar alımı');

  // 2) Misafir sıfırlayamaz; giriş yapan sıfırlar
  assert.equal((await call('POST', '/api/dev/vanilla-reset')).status, 401);
  const r = await call('POST', '/api/dev/vanilla-reset', null, A.token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  ok('sıfırlama yalnız giriş yapana açık ve başarılı');

  // 3) A ve B ilk güne döndü: seviye 1, 0 ASTRA, 0 hammadde; hesaplar ve oturumlar duruyor
  const a2 = await call('GET', '/api/state', null, A.token);
  assert.equal(a2.status, 200, 'oturum kaldı');
  assert.equal(a2.body.player.level, 1);
  assert.equal(Number(a2.body.player.adAstraBalance) || 0, 0);
  for (const k of RES) assert.equal(Number(a2.body.player.inventory[k]) || 0, 0, k + ' sıfır');
  const b2 = await call('GET', '/api/state', null, B.token);
  assert.equal(Number(b2.body.player.inventory.stone) || 0, 0);
  assert.equal(a2.body.gate && a2.body.gate.status, 'citizen', 'vatandaşlık kaldı');
  ok('bütün oyuncular 0 ASTRA / 0 hammadde / seviye 1, hesap ve vatandaşlık korunur');

  // 4) Dünya tohum değerlerine döndü
  const w = a2.body.world;
  assert.equal(Number(w.globalPool.totalSpent) || 0, 0, 'harcama sayacı sıfır');
  assert.equal(Number(w.globalPool.totalBurned) || 0, 0, 'yakım sıfır');
  if (seedWood != null && w.amm && w.amm.wood) assert.equal(Math.round(w.amm.wood.resource ?? w.amm.wood.reserve ?? 0), Math.round(seedWood.resource ?? seedWood.reserve ?? 0));
  assert.equal(db.kvGet('world:economy'), null);
  assert.equal(Number(db.kvGet('world:epochProcessed')), engine.globalPool.state.epochId, 'hafta işareti bugüne kuruldu');
  await world.tick();   // bir sonraki dakika: geçmiş hafta için hesaplaşma denenmez, hata yok
  ok('dünya: havuzlar, hazine ve sayaçlar tohum değerinde; hafta hesaplaşması tetiklenmez');

  // 5) Gerçek sunucuda kapalı
  cfg.testMode = false;
  const r2 = await call('POST', '/api/dev/vanilla-reset', null, A.token);
  assert.equal(r2.status, 404);
  cfg.testMode = true;
  ok('gerçek sunucuda yol kapalı (404)');
} finally {
  server.close();
  db.close();
}
console.log(`\n${passed}/5 kontrol geçti.`);
