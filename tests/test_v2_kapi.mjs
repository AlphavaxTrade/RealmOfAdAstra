// v2 — Kapı kuralı (R4/R4c): vatandaş sınırı, bekleme sırası, pasiflik uyarısı / askı, dönüşte öncelik,
// kayıt harcı, yönetici kolu (sınır / dönem / elle içeri alma), gösterge ve ayda %10 büyüme.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';
import { createKapi } from '../server/kapi.js';

let passed = 0;
const ok = name => { passed++; console.log(`✅ ${name}`); };
const DAY = 86400000;

const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000, testMode: true };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
let now = Date.UTC(2026, 9, 7, 12);
const clock = () => now;
const quiet = { log() {}, warn() {}, error() {} };
const mailer = createMailer({ db, cfg, log: quiet });
const accounts = createAccounts({ db, cfg, mailer, clock, verifyMessage: () => '0x0' });
engine.GAME_CONFIG.KAPI.START_LIMIT = 2;            // test: 2 kişilik vadi
const kapi = createKapi({ db, engine, accounts, mailer, cfg, clock, log: quiet });
const world = createWorld({ db, engine, chain: null, accounts, mailer, kapi, cfg, clock, log: quiet });
const app = createApp({ db, engine, world, accounts, kapi, chain: null, cfg, clock, log: quiet });
const server = app.server().listen(0);
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, body, token) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const ADMIN = cfg.adminToken;
const outbox = () => db.kvJson('dev:outbox', []);
const lastLink = kind => { const m = outbox()[0]; const r = new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(m ? m.text : ''); return r && r[1]; };
async function register(email) {
  const r = await call('POST', '/api/account/register', { email, password: 'gizli-sifre-123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = await call('POST', '/api/account/verify', { token: lastLink('verify') });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { token: v.body.token, pid: v.body.playerId };
}
const login = email => call('POST', '/api/account/login', { email, password: 'gizli-sifre-123' });

try {
  // 1) Sınır 2: ilk iki hesap vatandaş, üçüncü bekleme sırasında; sıradaki gezer ama işlem yapamaz
  const A = await register('ayse@ornek.com');
  const B = await register('bora@ornek.com');
  const C = await register('ceyda@ornek.com');
  assert.equal(kapi.statusOf(A.pid).status, 'citizen');
  assert.equal(kapi.statusOf(B.pid).status, 'citizen');
  const cs = await call('GET', '/api/state', null, C.token);
  assert.equal(cs.status, 200, 'Sıradaki hesap dünyayı görebilir');
  assert.equal(cs.body.gate.status, 'waiting');
  assert.equal(cs.body.gate.position, 1);
  assert.equal(cs.body.world.kapi.limit, 2);
  assert.equal(cs.body.world.kapi.citizens, 2);
  const cAct = await call('POST', '/api/action', { name: 'startExpedition', args: ['wood'] }, C.token);
  assert.equal(cAct.status, 403, 'Sıradaki işlem yapamaz');
  assert.ok(/Bekleme sırasındasın/.test(cAct.body.error), cAct.body.error);
  const aAct = await call('POST', '/api/action', { name: 'startExpedition', args: ['wood'] }, A.token);
  assert.equal(aAct.status, 200, 'Vatandaş işlem yapar');
  ok('Sınır 2: iki vatandaş, üçüncü sırada; sıradaki görür ama işlem yapamaz');

  // 2) Kayıt harcı: vatandaş olunca 1 ASTRA borç yazılır, ilk ASTRA'dan düşer
  const a0 = await call('GET', '/api/state', null, A.token);
  assert.equal(a0.body.player.kayitHarci.due, 1);
  assert.equal(a0.body.player.kayitHarci.paid, 0);
  engine.mutatePlayer(A.pid, gs => { gs.state.adAstraBalance = 5; });
  const a1 = await call('GET', '/api/state', null, A.token);
  assert.equal(a1.body.player.adAstraBalance, 4, 'Harç düşüldü');
  assert.equal(a1.body.player.kayitHarci.paid, 1);
  ok('Kayıt harcı 1 ASTRA ilk kazançtan düşer');

  // 3) 15 gün sessizlik: uyarı (e-posta + oyun içi); giriş yapınca uyarı silinir
  now += 15 * DAY;
  const r1 = kapi.run();
  assert.deepEqual(r1.warned.sort(), [A.pid, B.pid].sort(), 'İki vatandaş uyarıldı');
  assert.equal(r1.suspended.length, 0);
  assert.ok(outbox().some(m => /uğramadın/.test(m.text)), 'Uyarı e-postası gitti');
  const r1b = kapi.run();
  assert.equal(r1b.warned.length, 0, 'Aynı sessizlik için ikinci uyarı yok');
  const la = await login('ayse@ornek.com');
  assert.equal(la.status, 200);
  const aNotice = await call('GET', '/api/state', null, la.body.token);
  assert.ok((aNotice.body.player.pendingNotices || []).some(n => /uğramadın/.test(n.message)), 'Oyun içi uyarı teslim edildi');
  ok('14 gün sessizlik: uyarı e-postası ve oyun içi bildirim; tekrar etmez');

  // 4) 31 gün sessizlik: askı; yer sıradakine geçer
  now += 16 * DAY;
  const r2 = kapi.run();
  assert.deepEqual(r2.suspended, [B.pid], 'Bora 31 gün girmedi: askı');
  assert.equal(r2.admitted, 1, 'Boşalan yer sıradakine verildi');
  assert.equal(kapi.statusOf(C.pid).status, 'citizen');
  assert.equal(kapi.statusOf(B.pid).status, 'suspended');
  assert.ok(outbox().some(m => /Sıran geldi/.test(m.text)), 'Sıradakine "yerin açıldı" e-postası');
  const lc = await login('ceyda@ornek.com');   // 31 gün geçti: eski oturum süresi doldu, yeniden giriş
  const cAct2 = await call('POST', '/api/action', { name: 'startExpedition', args: ['stone'] }, lc.body.token);
  assert.equal(cAct2.status, 200, 'Yeni vatandaş işlem yapar');
  ok('30 gün sessizlik: askı, yer sıradakine geçer');

  // 5) Askıdaki döner: sıranın önüne; sonra kayıt olan arkasına
  const lb = await login('bora@ornek.com');
  assert.equal(lb.status, 200);
  const bs = await call('GET', '/api/state', null, lb.body.token);
  assert.equal(bs.body.gate.status, 'waiting');
  assert.equal(bs.body.gate.position, 1);
  const D = await register('deniz@ornek.com');
  assert.equal(kapi.statusOf(D.pid).position, 2, 'Yeni kayıt dönenin arkasında');
  const bAct = await call('POST', '/api/action', { name: 'startExpedition', args: ['wood'] }, lb.body.token);
  assert.equal(bAct.status, 403);
  ok('Askıdan dönen sıranın önüne alınır');

  // 6) Yönetici kolu: sınır 3 → dönen içeri; elle içeri alma; hatalı sınır reddedilir
  const bad = await call('POST', '/api/admin/kapi', { limit: 0 }, ADMIN);
  assert.equal(bad.status, 400);
  const set = await call('POST', '/api/admin/kapi', { limit: 3 }, ADMIN);
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.limit, 3);
  assert.equal(kapi.statusOf(B.pid).status, 'citizen', 'Sınır büyüyünce sıranın önündeki içeri');
  assert.equal(kapi.statusOf(D.pid).position, 1);
  const st = await call('GET', '/api/admin/status', null, ADMIN);
  assert.equal(st.body.kapi.queue.length, 1);
  assert.equal(st.body.kapi.queue[0].email, 'deniz@ornek.com');
  const man = await call('POST', '/api/admin/kapi/player', { playerId: D.pid, status: 'citizen' }, ADMIN);
  assert.equal(man.status, 200, JSON.stringify(man.body));
  assert.equal(kapi.counts().citizen, 4, 'Yönetici sınırın üstünde de alabilir');
  ok('Yönetici: sınır değişimi, elle içeri alma, hatalı değer reddi');

  // 7) Gösterge ve büyüme: kişi başı aylık kazanç eşiği geçince sınır ayda bir %10 büyür
  kapi.recordWeek({ epoch: 1, faucet: { totalAda: 1000 }, withdraw: { sent: 0 }, lottery: { prize: 0 } }, 0.5);
  const ind = kapi.indicator();
  assert.ok(Math.abs(ind.usdPerPlayerMonth - 1000 * 0.5 / 4 * 4.33) < 0.5, 'Gösterge: haftalık 500 $ / 4 kişi × 4,33');
  const r3 = kapi.run();
  assert.deepEqual(r3.grown, { from: 3, to: 4 }, 'Eşik geçildi: sınır %10 büyüdü (yukarı yuvarlanır)');
  assert.equal(kapi.run().grown, null, 'Aynı ay ikinci büyüme yok');
  now += 31 * DAY;
  for (const p of [A, B, C, D]) db.q.playerSeen.run(now, p.pid);   // kimse askıya düşmesin
  assert.deepEqual(kapi.run().grown, { from: 4, to: 5 }, 'Bir ay sonra yine %10');
  const tier = await call('POST', '/api/admin/kapi', { tier: 3 }, ADMIN);
  assert.equal(tier.body.tier, 3);
  assert.equal(kapi.publicSummary().threshold, 300, 'Dönem 4 eşiği 300 $');
  ok('Gösterge: dönem eşiği geçilince ayda bir %10 büyüme; dönem yönetici kolu');

  console.log(`\n${passed}/7 kapı kuralı testi geçti`);
} finally {
  server.close();
}
