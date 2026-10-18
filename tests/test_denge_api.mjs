// Denge İzleme yönetici uçları (18 Ekim 2026): GET /api/admin/denge (hafta/ay), POST /api/admin/denge/goruntu. Gerçek HTTP sunucusu.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createDenge } from '../server/denge.js';

const ok = (ad) => console.log(`✅ ${ad}`);
const sessiz = { log() {}, warn() {}, error() {} };
const ADMIN = 'yonetici-test-anahtari-uzun-1234567890';
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: ADMIN, serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000 };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
const simdi = Date.UTC(2026, 9, 18, 12);
const clock = () => simdi;
const world = createWorld({ db, engine, chain: null, accounts: null, cfg, clock, log: sessiz });
const denge = createDenge({ db, clock, log: sessiz });
engine.setTelemetri((olay, veri, oyuncu) => denge.kaydet(olay, veri, oyuncu));
const app = createApp({ db, engine, world, accounts: null, denge, chain: null, cfg, clock, log: sessiz });
const server = app.server().listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, token) => {
  const res = await fetch(base + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

try {
  // 1) yetki: yalnız yönetici
  {
    assert.equal((await call('GET', '/api/admin/denge')).status, 401);
    assert.equal((await call('GET', '/api/admin/denge', 'yanlis-anahtar-yanlis-anahtar')).status, 401);
    assert.equal((await call('POST', '/api/admin/denge/goruntu')).status, 401);
    ok('yetki: yönetici şifresi olmadan rapor ve görüntü uçları açılmaz');
  }

  // 2) boş veritabanında rapor: hatasız, boş tablolar, görüntü yok
  {
    const r = await call('GET', '/api/admin/denge', ADMIN);
    assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.pencere, 'hafta'); assert.equal(r.body.gunSayisi, 7);
    assert.deepEqual(r.body.zindan, []); assert.equal(r.body.tempo, null);
    assert.equal(r.body.islemler.length, 9); assert.equal(r.body.ekonomi.harcanan, 0);
    assert.deepEqual(r.body.uyarilar, []);
    ok('boş veritabanı: rapor boş ama hatasız; görüntü yok; uyarı yok');
  }

  // 3) veri: gerçek motorla işlem + elle yazılan savaş kayıtları → raporda görünür; hafta/ay pencereleri
  {
    const a = '0x' + 'e9'.repeat(20), b = '0x' + 'ea'.repeat(20);
    for (const x of [a, b]) { db.q.playerAdd.run(x, simdi, simdi); engine.withPlayer(x, () => null); }
    engine.mutatePlayer(a, (gs) => { gs.state.adAstraBalance += 1e5; gs.state.level = 12; });
    assert.equal(engine.act(a, 'buySoldierUnit', []).result.success, true);
    for (let i = 0; i < 25; i++) denge.kaydet('zindan', { mod: 0, seviye: 3, kazandi: i < 24, asker: 2, askerSeviyeOrt: 5, takimOrt: 1, tur: 6, kayip: 0, odul: 2.7, xp: 100, harc: 0 }, a);   // %96 → çok kolay
    const eski = createDenge({ db, clock: () => simdi - 20 * 86400000, log: sessiz });
    eski.kaydet('zindan', { mod: 0, seviye: 3, kazandi: true, asker: 2, askerSeviyeOrt: 5, takimOrt: 1, tur: 6, kayip: 0, odul: 2.7, xp: 100, harc: 0 }, a);   // 20 gün önce: yalnız ay penceresinde
    const hafta = await call('GET', '/api/admin/denge?pencere=hafta', ADMIN);
    const z = hafta.body.zindan.find((x) => x.seviye === 3);
    assert.equal(z.giris, 25); assert.equal(z.zafer, 24); assert.equal(z.oran, 0.96);
    assert.equal(hafta.body.islemler.find((x) => x.tur === 'asker_al').adet, 1);
    assert.ok(hafta.body.uyarilar.some((u) => /Çok kolay/.test(u.ileti)), '%96 kazanma oranı çok kolay uyarısı verir');
    const ay = await call('GET', '/api/admin/denge?pencere=ay', ADMIN);
    assert.equal(ay.body.gunSayisi, 30); assert.equal(ay.body.zindan.find((x) => x.seviye === 3).giris, 26);
    assert.equal((await call('GET', '/api/admin/denge?pencere=saçma', ADMIN)).body.gunSayisi, 7, 'bilinmeyen pencere haftaya düşer');
    ok('rapor gerçek motor işlemini ve savaş kayıtlarını gösterir; hafta/ay penceresi ayrımı; çok kolay uyarısı');
  }

  // 4) görüntü: elle alınır, oyuncu sayısı raporda görünür; kişisel veri yok
  {
    const g = await call('POST', '/api/admin/denge/goruntu', ADMIN);
    assert.equal(g.status, 200); assert.equal(g.body.oyuncu, 2);
    const r = await call('GET', '/api/admin/denge', ADMIN);
    assert.equal(r.body.tempo.oyuncu, 2); assert.equal(r.body.tempo.asker['1'], 1);
    assert.ok(!JSON.stringify(r.body).includes('0xe9'), 'rapor oyuncu adresi taşımaz');
    ok('görüntü elle alınır; rapor oyuncu sayısını ve asker dağılımını gösterir, adres taşımaz');
  }
} finally {
  server.close();
  db.close && db.close();
}
console.log('\nDenge İzleme uç testleri geçti.');
process.exit(0);
