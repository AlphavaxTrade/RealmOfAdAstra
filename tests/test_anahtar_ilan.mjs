// Anahtar ilanı (18 Ekim 2026): toplu satış (adet + birim fiyat), kısmi alım, geri çekme, süre dolumu; kaldırılan havuzların ASTRA'sı kasalara.
// (Eski teçhizat testi: ilan verme (eşya kayıttan çıkar), 10 ilan sınırı, fiyat sınırı, satın alma
// (alıcı önce serbest bakiyesinden öder; satıcıya %98, bunun en az %80'i kilitli; %1 yakım, %1 kasalar), kendi ilanını alamama,
// geri çekme, 7 gün sonra eşyanın sahibine dönmesi, bekleme sırasındakine kapalı olması.
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
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const DAY = 86400000;

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
const lastLink = kind => { const m = db.kvJson('dev:outbox', [])[0]; const text = m ? m.text : ''; const i = text.indexOf(kind + '='); return i < 0 ? null : (/^[a-f0-9]+/.exec(text.slice(i + kind.length + 1)) || [null])[0]; };
async function register(email) {
  const r = await call('POST', '/api/account/register', { email, password: 'gizli-sifre-123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = await call('POST', '/api/account/verify', { token: lastLink('verify'), password: 'gizli-sifre-123' });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { token: v.body.token, pid: v.body.playerId };
}
const stateOf = async tok => (await call('GET', '/api/state', null, tok)).body.player;

try {
  const A = await register('ayse@ornek.com');
  const B = await register('bora@ornek.com');
  const sifirla = (pid, anahtar, bal) => engine.mutatePlayer(pid, gs => { gs.state.arenaKeys = anahtar; gs.state.adAstraBalance = bal; gs.state.lockedAda = 0; gs.state.sponsorAda = 0; gs.state.kayitHarci = { due: 0, paid: 0 }; });
  sifirla(A.pid, 10, 0); sifirla(B.pid, 0, 1000);

  // 1) İlan verme: geçersiz adet/fiyat/elde olmayandan fazlası reddedilir; anahtarlar kayıttan çıkar
  assert.equal((await call('POST', '/api/pazar/sell-key', { qty: 0, price: 5 }, A.token)).status, 400, 'adet 0');
  assert.equal((await call('POST', '/api/pazar/sell-key', { qty: 2.5, price: 5 }, A.token)).status, 200, 'kesirli adet aşağı yuvarlanır (2)');
  assert.equal((await call('POST', '/api/pazar/sell-key', { qty: 1, price: 0 }, A.token)).status, 400, 'fiyat 0');
  const fazla = await call('POST', '/api/pazar/sell-key', { qty: 99, price: 5 }, A.token);
  assert.equal(fazla.status, 400, 'elde olmayandan fazlası'); assert.ok(/Yetersiz anahtar/.test(fazla.body.error), fazla.body.error);
  assert.equal((await stateOf(A.token)).arenaKeys, 8, '2 anahtar ilanda bekliyor');
  const sat = await call('POST', '/api/pazar/sell-key', { qty: 8, price: 10 }, A.token);
  assert.equal(sat.status, 200, JSON.stringify(sat.body));
  assert.equal(sat.body.player.arenaKeys, 0, 'hepsi ilanda');
  const liste = (await call('GET', '/api/pazar', null, B.token)).body.listings;
  const ilan = liste.find((l) => l.item.qty === 8);
  assert.ok(ilan && ilan.item.kind === 'key' && ilan.price === 10 && ilan.item.icon === '🔑', 'toplu anahtar ilanı: adet 8, birim fiyat 10');
  ok('Anahtar ilanı: adet + birim fiyat, anahtarlar kayıttan çıkar, hatalı istekler reddedilir');

  // 2) Kısmi alım: bedel = birim × adet; kalan adetle ilan açık; satıcıya %98; anahtarlar alıcıya
  assert.equal((await call('POST', '/api/pazar/buy', { id: ilan.id, qty: 99 }, B.token)).status, 400, 'kalandan fazlası alınamaz');
  assert.equal((await call('POST', '/api/pazar/buy', { id: ilan.id, qty: 0 }, B.token)).status, 400, '0 adet alınamaz');
  assert.equal((await call('POST', '/api/pazar/buy', { id: ilan.id, qty: 3 }, A.token)).status, 400, 'kendi ilanını alamaz');
  const burned0 = Number(engine.globalPool.state.totalBurned) || 0;
  const alim = await call('POST', '/api/pazar/buy', { id: ilan.id, qty: 3 }, B.token);
  assert.equal(alim.status, 200, JSON.stringify(alim.body));
  assert.equal(alim.body.player.arenaKeys, 3, '3 anahtar alıcıda');
  assert.ok(near(alim.body.player.adAstraBalance, 1000 - 30), '3 × 10 = 30 ASTRA ödendi');
  assert.ok(near((await stateOf(A.token)).adAstraBalance, 29.4), 'satıcıya %98');
  assert.ok(near((Number(engine.globalPool.state.totalBurned) || 0) - burned0, 0.3), 'komisyonun yarısı yakıldı');
  const kalan = (await call('GET', '/api/pazar', null, B.token)).body.listings.find((l) => l.id === ilan.id);
  assert.equal(kalan.item.qty, 5, 'ilan kalan 5 adetle açık');
  ok('Kısmi alım: birim × adet ödenir, ilan kalan adetle açık kalır');

  // 3) Geri çekme: kalan anahtarlar sahibine döner
  const c = await call('POST', '/api/pazar/cancel', { id: ilan.id }, A.token);
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.player.arenaKeys, 5, 'kalan 5 anahtar geri geldi');
  ok('Geri çekme: kalan anahtarlar döner');

  // 4) Tamamını alma ve süre dolumu
  await call('POST', '/api/pazar/sell-key', { qty: 4, price: 2 }, A.token);
  const id2 = (await call('GET', '/api/pazar', null, B.token)).body.listings[0].id;
  const hepsi = await call('POST', '/api/pazar/buy', { id: id2 }, B.token);
  assert.equal(hepsi.status, 200, JSON.stringify(hepsi.body));
  assert.equal(hepsi.body.player.arenaKeys, 7, 'qty verilmeyince kalanın hepsi (4) alınır');
  assert.equal((await call('POST', '/api/pazar/buy', { id: id2 }, B.token)).status, 400, 'satılmış ilan tekrar alınamaz');
  engine.mutatePlayer(A.pid, gs => { gs.state.arenaKeys += 4; });   // 1 + 4 = 5
  assert.equal((await call('POST', '/api/pazar/sell-key', { qty: 3, price: 2 }, A.token)).status, 200);
  now += 8 * DAY;
  assert.equal(pazar.expire(), 2, 'süresi dolan iki anahtar ilanı (baştaki 2 adetlik ve 3 adetlik) kapandı');
  assert.equal((await stateOf(A.token)).arenaKeys, 7, 'anahtarlar sahibine döndü (2 eldeki + 3 + 2 dönen)');
  ok('Tamamını alma ve 7 gün sonra anahtarın sahibine dönmesi');

  // 5) Haftalık Kolezyum anahtarı yapılandırması: ilk 3'e birer; ve kaldırılan havuzların ASTRA'sı kasalara (yarı yarıya, bir kez)
  assert.deepEqual(engine.GAME_CONFIG.COLOSSEUM.HAFTALIK_ANAHTAR, [1, 1, 1], 'ilk 3 birer anahtar');
  assert.ok(!engine.ammMarket.pools.keys && !engine.ammMarket.pools.boxes, 'takas havuzunda Anahtar ve Pandora kutusu yok');
  {
    const kv = new Map();
    const eskiDb = { kvGet: (k) => (kv.has(k) ? kv.get(k) : null), kvSet: (k, v) => kv.set(k, String(v)) };
    const AM = engine.ammMarket;
    const ham = JSON.parse(globalThis.localStorage.getItem(AM.storageKey) || '{}');
    ham.keys = { resourceReserve: 200000, adAstraReserve: 2000000 };
    ham.boxes = { resourceReserve: 20000, adAstraReserve: 1500000 };
    globalThis.localStorage.setItem(AM.storageKey, JSON.stringify(ham));
    const kar0 = engine.treasury.state.pools.carnival, geri0 = engine.treasury.state.pools.ammBuyback;
    const { parcaHavuzuGecisi } = await import('../server/parca-havuzu.js');
    const r = parcaHavuzuGecisi({ db: eskiDb, ammMarket: AM, treasury: engine.treasury });
    assert.equal(r.yapildi, true);
    const kar = engine.treasury.state.pools.carnival - kar0, geri = engine.treasury.state.pools.ammBuyback - geri0;
    assert.ok(near(kar + geri, 3500000, 0.01), `kutu + anahtar havuzlarının ASTRA'sı kasalara geçti: ${kar + geri}`);
    assert.ok(Math.abs(kar - geri) < 0.01, 'yarı yarıya');
    assert.ok(!JSON.parse(globalThis.localStorage.getItem(AM.storageKey)).keys, 'kayıtlı anahtar havuzu silindi');
    assert.equal(parcaHavuzuGecisi({ db: eskiDb, ammMarket: AM, treasury: engine.treasury }).yapildi, false, 'bayrak: bir kez');
  }
  ok('Kolezyum haftalık anahtar ayarı ve kaldırılan havuzların ASTRA payının kasalara aktarılması');

  console.log(`
${passed} anahtar ilanı kontrolü geçti.`);
} finally {
  server.close();
}
