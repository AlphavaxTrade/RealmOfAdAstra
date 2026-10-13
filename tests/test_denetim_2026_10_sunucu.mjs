// 14 Ekim 2026 canlıya çıkış öncesi denetiminin sunucu tarafı gerileme testleri.
// (A1) Parola sıfırlandıktan sonra, e-posta geçmişinde kalmış ESKİ doğrulama bağlantısı parolasız oturum açtırmamalı.
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

const ok = (ad) => console.log(`✅ ${ad}`);
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000 };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
let now = Date.UTC(2026, 9, 14, 12);
const clock = () => now;
const sessiz = { log() {}, warn() {}, error() {} };
const mailer = createMailer({ db, cfg, log: sessiz });
const accounts = createAccounts({ db, cfg, mailer, clock, verifyMessage: () => '0x0' });
const kapi = createKapi({ db, engine, accounts, mailer, cfg, clock, log: sessiz });
const pazar = createPazar({ db, engine, clock, log: sessiz });
const world = createWorld({ db, engine, chain: null, accounts, mailer, kapi, pazar, cfg, clock, log: sessiz });
const app = createApp({ db, engine, world, accounts, kapi, pazar, chain: null, cfg, clock, log: sessiz });
const server = app.server().listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, body, token) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
// Posta kutusundaki bağlantılardan, istenen türdeki (verify / reset) n'inciyi (0 = ilk) verir
const baglanti = (tur, n = 0) => {
  const l = [];
  for (const m of db.kvJson('dev:outbox', [])) for (const x of String(m.text).matchAll(/[?&](verify|reset)=([a-f0-9]+)/g)) if (x[1] === tur) l.push(x[2]);
  return l[n] || null;
};

try {
  // A1: doğrulanmış hesapta, sıfırlamadan sonra eski doğrulama bağlantısı artık işe yaramaz
  const E = 'eski.baglanti@ornek.com';
  assert.equal((await call('POST', '/api/account/register', { email: E, password: 'gizli-sifre-123' })).status, 200);
  const eskiDogrulama = baglanti('verify');
  assert.ok(eskiDogrulama, 'doğrulama bağlantısı posta kutusunda');
  await call('POST', '/api/account/forgot', { email: E });
  const sifirla = baglanti('reset');
  assert.ok(sifirla, 'sıfırlama bağlantısı posta kutusunda');
  const r = await call('POST', '/api/account/reset', { token: sifirla, password: 'yeni-gizli-sifre-456' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const eski = await call('POST', '/api/account/verify', { token: eskiDogrulama });
  assert.equal(eski.status, 400, 'sıfırlamadan sonra eski doğrulama bağlantısı reddedilmeli: ' + JSON.stringify(eski.body));
  assert.ok(!eski.body.token, 'oturum belirteci verilmemeli');
  const eskiSifreli = await call('POST', '/api/account/verify', { token: eskiDogrulama, password: 'baska-sifre-789' });
  assert.equal(eskiSifreli.status, 400, 'şifre eklense de eski bağlantı işe yaramaz');
  const giris = await call('POST', '/api/account/login', { email: E, password: 'yeni-gizli-sifre-456' });
  assert.equal(giris.status, 200, 'yeni şifreyle giriş çalışır');
  ok('A1: parola sıfırlandıktan sonra eski doğrulama bağlantısı oturum açtırmıyor, yeni şifreyle giriş çalışıyor');
} finally {
  server.close();
  db.close && db.close();
}

// (W2) Haftalık hesaplaşma hata verirse dünya turunun kalanı (kapı, ilan pazarı, ödeme kuyruğu...) yine de çalışmalı;
// hata nabızda görünür, hafta işlenmiş sayılmaz (sonraki turda yeniden denenir).
{
  let simdi = Date.UTC(2026, 9, 14, 12);
  const db2 = openDb(':memory:');
  const engine2 = await createEngine(db2, { testMode: true });
  let pazarTur = 0;
  const pazar2 = { expire() { pazarTur++; } };
  const world2 = createWorld({ db: db2, engine: engine2, chain: null, pazar: pazar2, cfg: { ...loadConfig({}), dbFile: ':memory:', testMode: true }, clock: () => simdi, log: sessiz });
  await world2.tick();                                              // ilk tur: hafta kaydı
  assert.equal(pazarTur, 1, 'sağlam turda ilan pazarı işi çalışır');
  engine2.globalPool.state.epochId = Number(engine2.globalPool.state.epochId) + 2;   // iki hafta ilerlemiş gibi
  db2.kvSet('world:epochProcessed', Number(engine2.globalPool.state.epochId) - 1);
  const asil = db2.q.playersAll;
  db2.q.playersAll = { all() { throw new Error('bozuk oyuncu kaydı'); } };
  simdi += 3600_000 + 1;                                             // ilan pazarı saatte bir
  await world2.tick();                                              // reddedilmemeli
  const d = world2.tickDurumu();
  assert.equal(d.hataSayisi, 1);
  assert.match(d.sonHata, /Haftalık hesaplaşma.*bozuk oyuncu kaydı/);
  assert.equal(pazarTur, 2, 'hesaplaşma düşse de turun kalanı (ilan pazarı) çalıştı');
  assert.equal(Number(db2.kvGet('world:epochProcessed')), Number(engine2.globalPool.state.epochId) - 1, 'hafta işlenmiş sayılmadı (yeniden denenecek)');
  db2.q.playersAll = asil;
  ok('W2: haftalık hesaplaşma hatası turun kalanını durdurmuyor, nabızda görünüyor, hafta yeniden denenecek');
}
