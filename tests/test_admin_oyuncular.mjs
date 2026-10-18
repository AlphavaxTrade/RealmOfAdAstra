// Yönetici oyuncu uçları (salt okunur): liste + arama + kapı süzgeci + ayrıntı; yetki ve gizli alan denetimi (18 Ekim 2026)
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';

const ok = ad => console.log(`✅ ${ad}`);
const sessiz = { log() {}, warn() {}, error() {} };
const ADMIN = 'yonetici-test-anahtari-uzun-1234567890';
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: ADMIN, adminEmail: 'sahip@ornek.com', serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000 };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
let now = Date.UTC(2026, 9, 18, 12);
const clock = () => now;
const mailer = createMailer({ db, cfg, log: sessiz });
const world = createWorld({ db, engine, chain: null, accounts: null, mailer, cfg, clock, log: sessiz });
const app = createApp({ db, engine, world, accounts: null, chain: null, cfg, clock, log: sessiz });
const server = app.server().listen(0);
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (p, token) => {
  const res = await fetch(base + p, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

try {
  db.q.playerAdd.run('oyuncu-ali', now - 5000, now - 1000);
  db.q.playerAdd.run('oyuncu-veli', now - 9000, now - 500);
  db.q.playerAdd.run('baska-ayse', now - 9000, now - 8000);
  db.q.playerAddDeposit.run(12.5, 'oyuncu-ali');
  db.raw.prepare("UPDATE players SET gate = 'waiting' WHERE address = 'baska-ayse'").run();
  db.event('test-olay', 'oyuncu-ali', { x: 1 });

  {
    for (const p of ['/api/admin/players', '/api/admin/players/detail?id=oyuncu-ali']) {
      assert.equal((await call(p)).status, 401, `${p} şifresiz açılmaz`);
      assert.equal((await call(p, 'yanlis')).status, 401, `${p} yanlış şifreyle açılmaz`);
    }
    ok('yetki: şifresiz ve yanlış şifreyle 401');
  }
  {
    const r = await call('/api/admin/players', ADMIN);
    assert.equal(r.status, 200);
    assert.equal(r.body.toplam, 3);
    assert.deepEqual(r.body.rows.map(x => x.playerId), ['oyuncu-veli', 'oyuncu-ali', 'baska-ayse'], 'en son görülen önce');
    assert.equal(r.body.sayi.waiting, 1);
    const ali = r.body.rows.find(x => x.playerId === 'oyuncu-ali');
    assert.equal(ali.depositedAda, 12.5);
    ok('liste: sıra, toplam ve kapı sayıları');
  }
  {
    assert.deepEqual((await call('/api/admin/players?ara=ALI', ADMIN)).body.rows.map(x => x.playerId), ['oyuncu-ali']);
    assert.deepEqual((await call('/api/admin/players?kapi=waiting', ADMIN)).body.rows.map(x => x.playerId), ['baska-ayse']);
    assert.equal((await call('/api/admin/players?ara=yokboyle', ADMIN)).body.rows.length, 0);
    ok('arama büyük/küçük harf duyarsız; kapı süzgeci çalışır');
  }
  {
    const r = await call('/api/admin/players/detail?id=oyuncu-ali', ADMIN);
    assert.equal(r.status, 200);
    assert.equal(r.body.oyuncu.playerId, 'oyuncu-ali');
    assert.equal(r.body.hesap, null, 'hesap sistemi yokken boş');
    assert.ok(r.body.olaylar.some(o => o.type === 'test-olay'));
    assert.ok(!/pass_hash|totp_secret|backup_codes/.test(JSON.stringify(r.body)), 'gizli alan sızmaz');
    assert.equal((await call('/api/admin/players/detail?id=yok', ADMIN)).status, 404);
    assert.equal((await call('/api/admin/players/detail', ADMIN)).status, 400);
    ok('ayrıntı: oyuncu, olaylar; yok → 404, kimliksiz → 400; gizli alan yok');
  }
} finally {
  server.close();
}
