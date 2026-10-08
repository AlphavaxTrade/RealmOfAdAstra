// Saklama süresi (retention) — veritabanı sınırsız büyümesin (kurumsal A5.8): haftalık hesaplaşma eski olayları (90 gün), eski fiyat
// örneklerini (400 gün) ve son 5.000 dışındaki Kolezyum maç kayıtlarını siler; yenilere ve parasal kayıtlara DOKUNMAZ.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const DAY = 86400000;
const T = Date.UTC(2026, 9, 8, 12);

const db = openDb(':memory:');
const E = await createEngine(db, { clock: () => T, testMode: true });
const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true };
const world = createWorld({ db, engine: E, chain: null, cfg, clock: () => T, log: { log() {}, warn() {}, error() {} } });

// Veri: eski/yeni olay, eski/yeni fiyat, 6.000 maç kaydı, ilgisiz anahtarlar, parasal kayıtlar
const olay = db.raw.prepare('INSERT INTO events (at, address, type, data) VALUES (?, ?, ?, ?)');
olay.run(T - 100 * DAY, 'acc:1', 'eski-olay', null);
olay.run(T - 91 * DAY, 'acc:1', 'sinirdan-eski', null);
olay.run(T - 89 * DAY, 'acc:1', 'sinirdan-yeni', null);
olay.run(T - 1 * DAY, 'acc:2', 'dunku-olay', null);
const fiyat = db.raw.prepare('INSERT INTO prices (at, price_usd, mcap_usd, supply, dead, avax_usd, graduated) VALUES (?, 1, 1, 1, 1, 1, 0)');
fiyat.run(T - 500 * DAY); fiyat.run(T - 401 * DAY); fiyat.run(T - 399 * DAY); fiyat.run(T - 5 * DAY);
db.kvSetJson('world:arena', { seq: 6000, queues: { '1v1': [], '3v3': [] }, table: {} });
const maci = db.raw.prepare('INSERT INTO kv (key, value) VALUES (?, ?)');
for (let i = 1; i <= 6000; i++) maci.run('pvp:match:' + i, '{}');
db.kvSet('pvp:matchX', 'dokunma');          // benzer ama farklı anahtarlar
db.kvSet('pvp:status', 'dokunma');
db.raw.prepare("INSERT INTO payouts (epoch, kind, address, amount, status, created_at) VALUES (1, 'burn', '0xdead', 5, 'sent', ?)").run(T - 300 * DAY);   // parasal kayıt: ASLA silinmez
db.raw.prepare('INSERT INTO deposits (tx_hash, log_index, address, amount, block, credited_at) VALUES (?, 0, ?, 10, 1, ?)').run('0xeski', 'acc:1', T - 300 * DAY);

world.settleWeek(E.globalPool.state.epochId, null);

// 1) Olaylar: 90 günden eskiler gider
{
  const tipler = db.raw.prepare("SELECT type FROM events WHERE type IN ('eski-olay','sinirdan-eski','sinirdan-yeni','dunku-olay') ORDER BY at").all().map(r => r.type);
  assert.deepEqual(tipler, ['sinirdan-yeni', 'dunku-olay'], '90 günden eski olaylar silinir, yenilere dokunulmaz');
  ok('olaylar: 90 günden eskiler silinir, yeniler kalır');
}

// 2) Fiyat örnekleri: 400 günden eskiler gider
{
  const f = db.raw.prepare('SELECT at FROM prices WHERE at IN (?, ?, ?, ?) ORDER BY at').all(T - 500 * DAY, T - 401 * DAY, T - 399 * DAY, T - 5 * DAY).map(r => (T - r.at) / DAY);
  assert.deepEqual(f, [399, 5], '400 günden eski fiyat örnekleri silinir');
  ok('fiyat örnekleri: 400 günden eskiler silinir');
}

// 3) Maç kayıtları: son 5.000 kalır; benzer anahtarlara dokunulmaz
{
  const idler = db.raw.prepare("SELECT key FROM kv WHERE key >= 'pvp:match:' AND key < 'pvp:match;'").all().map(r => Number(r.key.slice(10)));
  assert.equal(idler.length, 5000);
  assert.equal(Math.min(...idler), 1001, 'seq 6000 → 1000 ve öncesi silinir');
  assert.equal(Math.max(...idler), 6000);
  assert.equal(db.kvGet('pvp:matchX'), 'dokunma');
  assert.equal(db.kvGet('pvp:status'), 'dokunma');
  ok('maç kayıtları: son 5.000 kalır, benzer anahtarlara dokunulmaz');
}

// 4) Parasal kayıtlar (ödemeler, yatırmalar) hiçbir zaman silinmez
{
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM payouts').get().n >= 1, true);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM payouts WHERE address = '0xdead' AND created_at = ?").get(T - 300 * DAY).n, 1, '300 günlük ödeme kaydı duruyor');
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM deposits WHERE tx_hash = '0xeski'").get().n, 1, '300 günlük yatırma kaydı duruyor');
  ok('ödeme ve yatırma kayıtları saklama temizliğinden etkilenmez');
}

// 5) Süresi dolan oturum ve imza mesajları temizlenir (girişte çalışan sorgular)
{
  db.raw.prepare('INSERT INTO sessions (token, address, expires) VALUES (?, ?, ?)').run('eski', 'acc:1', T - 1);
  db.raw.prepare('INSERT INTO sessions (token, address, expires) VALUES (?, ?, ?)').run('gecerli', 'acc:1', T + DAY);
  db.raw.prepare('INSERT INTO nonces (address, nonce, expires) VALUES (?, ?, ?)').run('0xa', 'n', T - 1);
  db.raw.prepare('INSERT INTO nonces (address, nonce, expires) VALUES (?, ?, ?)').run('0xb', 'n', T + DAY);
  db.q.sessionsPurge.run(T);
  db.q.noncesPurge.run(T);
  assert.deepEqual(db.raw.prepare('SELECT token FROM sessions').all().map(r => r.token), ['gecerli']);
  assert.deepEqual(db.raw.prepare('SELECT address FROM nonces').all().map(r => r.address), ['0xb']);
  ok('süresi dolan oturum ve imza mesajları temizlenir');
}

console.log(`\n${passed}/5 saklama süresi testi geçti`);
