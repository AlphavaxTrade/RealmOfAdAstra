// Promo kodları (kullanıcı kararı 6 Ekim 2026): yönetici kod üretir, ödülü kod başına seçer (kilitli ADA ve/veya eşya);
// bedel görev kasasından; her hesap bir kez; kullanım sınırı, süre, kapatma; yanlış deneme sınırı; kayıtta yazılan kod
// e-posta doğrulanınca kullanılır. Sunucu gerçek HTTP ile denenir (zincir yok).
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const ADMIN = 'yonetici-test-anahtari-uzun-1234567890';
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: ADMIN, serveDist: false, testMode: true, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000 };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
let now = Date.now();
const clock = () => now;
const mailer = createMailer({ db, cfg, log: { log() {} } });
const accounts = createAccounts({ db, cfg, mailer, clock, verifyMessage: () => null });
const world = createWorld({ db, engine, accounts, cfg, log: { warn() {}, error() {} } });
const app = createApp({ db, engine, world, accounts, chain: null, cfg, clock, log: { error() {} } });
const server = app.server().listen(0);
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, body, token) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const admin = (m, p, b) => call(m, p, b, ADMIN);
const lastLink = kind => { const m = db.kvJson('dev:outbox', [])[0]; const r = new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(m ? m.text : ''); return r && r[1]; };
async function signup(email, promo) {
  const r = await call('POST', '/api/account/register', { email, password: 'gizli-sifre-123', ...(promo ? { promo } : {}) });
  if (r.status !== 200) return r;
  const v = await call('POST', '/api/account/verify', { token: lastLink('verify') });
  assert.equal(v.status, 200);
  return { token: v.body.token, pid: v.body.playerId };
}
const state = async t => (await call('GET', '/api/state', null, t)).body.player;
const quest = () => engine.treasury.getPool('quest');

try {
  // Yönetici kod üretir
  assert.equal((await call('POST', '/api/admin/promo/create', { code: 'X1', reward: { ada: 1 } })).status, 401, 'Yönetici olmayan kod üretemez');
  assert.equal((await admin('POST', '/api/admin/promo/create', { code: 'BOS-KOD', reward: {} })).status, 400, 'Boş ödül olmaz');
  const c1 = await admin('POST', '/api/admin/promo/create', { code: 'hosgeldin-2026', reward: { ada: 500, wood: 200, keys: 2 }, maxUses: 2, expiresDays: 7, note: 'açılış' });
  assert.equal(c1.status, 200, JSON.stringify(c1.body));
  assert.equal(c1.body.code, 'HOSGELDIN-2026', 'Kod büyük harfe çevrilir');
  assert.equal((await admin('POST', '/api/admin/promo/create', { code: 'hoşgeldin', reward: { ada: 1 } })).status, 400, 'Türkçe harfli kod reddedilir');
  const auto = await admin('POST', '/api/admin/promo/create', { reward: { scroll_heal: 1 } });
  assert.match(auto.body.code, /^ASTRA-[0-9A-F]{8}$/, 'Kod boş bırakılırsa üretilir');
  assert.equal((await admin('POST', '/api/admin/promo/create', { code: 'HOSGELDIN-2026', reward: { ada: 1 } })).status, 400, 'Aynı kod iki kez olmaz');
  ok('Yönetici kod üretiyor (ödül, kullanım sınırı, süre); boş ödül ve aynı kod reddediliyor');

  // Oyun içinde kod kullanma
  const a = await signup('ali@example.com');
  const q0 = quest(), s0 = await state(a.token);
  const r1 = await call('POST', '/api/promo/redeem', { code: 'hosgeldin-2026' }, a.token);
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const s1 = await state(a.token);
  assert.equal(s1.adAstraBalance - (s0.adAstraBalance || 0), 500, '500 ADA geldi');
  assert.ok((s1.lockedAda || 0) >= 500, 'ADA kilitli geldi');
  assert.equal(s1.inventory.wood - (s0.inventory.wood || 0), 200, '200 odun geldi');
  assert.equal((s1.arenaKeys || 0) - (s0.arenaKeys || 0), 2, '2 anahtar geldi');
  assert.ok(q0 - quest() > 500, `Bedel görev kasasından çıktı (${Math.round(q0 - quest())} ADA)`);
  ok('Kod oyunda kullanılıyor: kilitli ADA + pazardan alınan odun ve anahtar, bedeli görev kasasından');

  assert.equal((await call('POST', '/api/promo/redeem', { code: 'HOSGELDIN-2026' }, a.token)).status, 400, 'Aynı hesap ikinci kez kullanamaz');
  const b = await signup('banu@example.com');
  assert.equal((await call('POST', '/api/promo/redeem', { code: 'HOSGELDİN-2026' }, b.token)).status, 200, 'Türkçe klavyedeki İ de tanınır');
  const c = await signup('cem@example.com');
  const r3 = await call('POST', '/api/promo/redeem', { code: 'HOSGELDIN-2026' }, c.token);
  assert.equal(r3.status, 400); assert.match(r3.body.error, /tükendi/);
  ok('Her hesap bir kez; kullanım sınırı dolunca kod tükeniyor');

  // Süre ve kapatma
  await admin('POST', '/api/admin/promo/create', { code: 'KISA-SURE', reward: { wheat: 10 }, expiresDays: 1 });
  now += 2 * 86400000;
  assert.match((await call('POST', '/api/promo/redeem', { code: 'KISA-SURE' }, c.token)).body.error, /süresi dolmuş/);
  await admin('POST', '/api/admin/promo/create', { code: 'KAPANAN', reward: { wheat: 10 } });
  await admin('POST', '/api/admin/promo/active', { code: 'KAPANAN', active: false });
  assert.equal((await call('POST', '/api/promo/redeem', { code: 'KAPANAN' }, c.token)).status, 400, 'Kapatılan kod kullanılmaz');
  await admin('POST', '/api/admin/promo/active', { code: 'KAPANAN', active: true });
  assert.equal((await call('POST', '/api/promo/redeem', { code: 'KAPANAN' }, c.token)).status, 200, 'Yeniden açılınca kullanılır');
  ok('Süresi dolan ve kapatılan kod kullanılamıyor; yeniden açılabiliyor');

  // Kasa yetmezse hiçbir şey verilmez, hak düşmez
  await admin('POST', '/api/admin/promo/create', { code: 'COK-BUYUK', reward: { ada: 9_000_000 } });
  engine.treasury.state.pools.quest = 1000; engine.treasury.save();
  const sBefore = await state(c.token);
  const big = await call('POST', '/api/promo/redeem', { code: 'COK-BUYUK' }, c.token);
  assert.equal(big.status, 400); assert.match(big.body.error, /Görev kasası/);
  assert.equal((await state(c.token)).adAstraBalance, sBefore.adAstraBalance, 'Bakiye değişmedi');
  const list = (await admin('GET', '/api/admin/promo')).body.codes;
  assert.equal(list.find(x => x.code === 'COK-BUYUK').used, 0, 'Hak düşmedi');
  assert.equal(list.find(x => x.code === 'HOSGELDIN-2026').uses.length, 2, 'Panel kimin kullandığını görüyor');
  engine.treasury.state.pools.quest = 8e6; engine.treasury.save();
  ok('Görev kasası yetmezse kod verilmiyor, bakiye değişmiyor, hak düşmüyor');

  // Yanlış deneme sınırı
  for (let i = 0; i < 10; i++) await call('POST', '/api/promo/redeem', { code: 'YANLIS-' + i }, b.token);
  const lim = await call('POST', '/api/promo/redeem', { code: 'KAPANAN' }, b.token);
  assert.match(lim.body.error, /Çok fazla yanlış/, 'Saatte 10 yanlış denemeden sonra durur');
  ok('Yanlış kod denemeleri saatte 10 ile sınırlı');

  // Kayıtta promo kodu
  await admin('POST', '/api/admin/promo/create', { code: 'KAYIT-HEDIYE', reward: { ada: 300 } });
  assert.match((await call('POST', '/api/account/register', { email: 'deniz@example.com', password: 'gizli-sifre-123', promo: 'OLMAYAN' })).body.error, /geçersiz/, 'Geçersiz kodla kayıt uyarı verir');
  const d = await signup('deniz@example.com', 'kayit-hediye');
  const sd = await state(d.token);
  assert.equal(sd.adAstraBalance, 300, 'E-posta doğrulanınca kayıt kodu kullanıldı');
  assert.ok((sd.lockedAda || 0) >= 300);
  ok('Kayıtta yazılan promo kodu e-posta doğrulanınca veriliyor');
} finally {
  server.close();
}
console.log(`\n${passed} promo kodu kontrolü geçti.`);
process.exit(0);
