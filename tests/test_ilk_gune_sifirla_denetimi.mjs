// 19 Ekim 2026 — "İlk güne sıfırla" DENETİMİ: sıfırlanan dünya ve oyuncu, taze kurulmuş olanla AYNIDIR (UOA tohumu, hammadde adetleri, Konsey, roket dahil).
// (eski başlık) v2 — Deneme sunucusunda "vanilla sıfırla": dünya (havuzlar, hazine, kota, piyango) ve bütün oyuncu kayıtları ilk güne
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
const lastLink = kind => { const m = outbox()[0]; const parca = ((m ? m.text : '').split(kind + '=')[1] || '').match(/^[a-f0-9]+/); return parca && parca[0]; };
async function register(email) {
  const r = await call('POST', '/api/account/register', { email, password: 'gizli-sifre-123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = await call('POST', '/api/account/verify', { token: lastLink('verify'), password: 'gizli-sifre-123' });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { token: v.body.token, pid: v.body.playerId };
}
const RES = engine.GAME_CONFIG.RESOURCE_KEYS;

try {
  const A = await register('ayse@ornek.com');
  await world.tick();

  // Karşılaştırma: zaman damgaları (ms) ve kimlikler dışında iki nesne aynı olmalı
  const gurultu = (k, v) => (typeof v === 'number' && v > 1e12) || /(^|_)(id|nonce|since|expires|updated|created|saved)/i.test(k);
  const fark = (a, b, yol = '', cikti = []) => {
    if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)) && !gurultu(yol.split('.').pop(), a)) cikti.push(`${yol}: ${a} ≠ ${b}`); return cikti; }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (/^(ts|time|at|now)$/i.test(k)) continue; fark(a[k], b[k], yol ? yol + '.' + k : k, cikti); }
      return cikti;
    }
    if (JSON.stringify(a) !== JSON.stringify(b) && !gurultu(yol.split('.').pop(), a)) cikti.push(`${yol}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
    return cikti;
  };
  const dunya = () => ({
    kasalar: Object.fromEntries(Object.entries(engine.treasury.state.pools).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    pazar: Object.fromEntries(Object.entries(engine.ammMarket.pools).map(([k, v]) => [k, { r: Math.round(v.resourceReserve), a: Math.round(v.adAstraReserve) }])),
    piyango: Math.round((engine.lottery && engine.lottery().pool) || 0),
    konsey: engine.globalPool.getOtoriteStatus ? { ot: engine.globalPool.getOtoriteStatus().progress, pj: engine.globalPool.getProjectStatus().progress, stok: engine.globalPool.getKonseyStock() } : null,
    sayac: { harcama: engine.globalPool.state.totalSpent, yakim: engine.globalPool.state.totalBurned }
  });
  // İlk istekte tembel kurulan alanlar (Üretim Hakkı kullanımı, katkı, kayıt harcası, karşılama bildirimi) karşılaştırmaya girmez: ikisinde de ilk istekte kurulur
  const TEMBEL = ['uretim', 'contribution', 'kayitHarci', 'pendingNotices'];
  const oyuncu = async () => { const r = await call('GET', '/api/state', null, A.token); const o = { ...r.body.player }; for (const k of TEMBEL) delete o[k]; return o; };

  const d0 = dunya();
  const p0 = await oyuncu();
  assert.equal(d0.kasalar.uoaTohum, 0, 'taze dünyada UOA tohumu 0');
  assert.equal(d0.kasalar.konsey, undefined, 'Konsey kasası yok');
  assert.equal(d0.kasalar.universe, undefined, 'Universe rezervi yok');
  ok('taze dünya ve oyuncu kaydedildi (UOA tohumu 0; Konsey / Universe kasası yok)');

  // Her şeyi boz: kaynak, ASTRA, seviye, pazar, Konsey hızlı katkı, piyango, roket, silo
  const act = (name, args) => call('POST', '/api/action', { name, args }, A.token);
  assert.equal((await act('setDevAdAstra', [5e6])).status, 200);
  for (const k of RES) assert.equal((await act('setDevResource', [k, 0])).status, 200);   // silo 1'e sığsın: hızlı katkı alım yapabilsin
  assert.equal((await act('setDevLevel', [12])).status, 200);
  const k1 = await act('konseyHizliKatki', ['otorite', 200000]);
  const k2 = await act('konseyHizliKatki', ['proje', 200000]);
  const buy = await act('marketBuy', ['iron', 500]);
  const lot = await act('buyLotteryTickets', [3]);
  assert.ok([k1, k2, buy, lot].every((x) => x.status === 200), JSON.stringify([k1.body, k2.body, buy.body, lot.body]));
  // harcama UOA tohumunu, Konsey katkısı Otorite ilerlemesini doldurmuş olmalı
  const dMid = dunya();
  assert.ok(dMid.kasalar.uoaTohum > 0, 'harcama UOA tohumunu doldurdu (' + dMid.kasalar.uoaTohum + ')');
  assert.ok(Object.values(dMid.konsey.ot).some((v) => v > 0), 'Konsey katkısı Otorite ilerlemesini doldurdu');
  ok('bozulan dünya: UOA tohumu doldu, Konsey ilerledi, pazar ve piyango oynadı');

  // Sıfırla
  const r = await call('POST', '/api/dev/vanilla-reset', null, A.token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await world.tick();

  const d1 = dunya();
  const farklarDunya = fark(d0, d1);
  assert.deepEqual(farklarDunya, [], 'sıfırlanan dünya taze dünyayla aynı olmalı: ' + farklarDunya.join(' | '));
  ok('sıfırlanan dünya taze dünyayla aynı: kasalar (UOA tohumu 0), pazar havuzları, piyango, Konsey / Otorite, sayaçlar');

  const p1 = await oyuncu();
  const farklarOyuncu = fark(p0, p1);
  assert.deepEqual(farklarOyuncu, [], 'sıfırlanan oyuncu taze oyuncuyla aynı olmalı: ' + farklarOyuncu.join(' | '));
  assert.ok(!p1.rocketLevel, 'roket seviyesi sıfırlandı');
  ok('sıfırlanan oyuncu taze oyuncuyla aynı (seviye, envanter, silo, sayaçlar, roket)');
} finally {
  server.close();
  db.close();
}
console.log(`
${passed}/4 ilk güne sıfırlama denetimi geçti.`);
