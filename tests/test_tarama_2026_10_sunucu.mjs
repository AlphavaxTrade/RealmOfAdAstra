// 11 Ekim 2026 sunucu güvenlik taramasından düzeltilen bulguların gerileme testleri:
// (1) ilan pazarında "__proto__" konumuyla yoktan eşya, (2) bekleme sırasındaki hesabın para yollarına girmesi,
// (3) dünya görüntüsünde işletme cüzdanı ve uyarılan oyuncu kimlikleri, (4) ilan alımının sahte katkı puanı.
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
let now = Date.UTC(2026, 9, 11, 12);
const clock = () => now;
const sessiz = { log() {}, warn() {}, error() {} };
const mailer = createMailer({ db, cfg, log: sessiz });
const accounts = createAccounts({ db, cfg, mailer, clock, verifyMessage: () => '0x0' });
engine.GAME_CONFIG.KAPI.START_LIMIT = 2;            // iki vatandaş; üçüncü hesap bekleme sırasında
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
const sonBaglanti = (tur) => { const m = db.kvJson('dev:outbox', [])[0]; const r = new RegExp('[?&]' + tur + '=([a-f0-9]+)').exec(m ? m.text : ''); return r && r[1]; };
async function kayit(eposta) {
  const r = await call('POST', '/api/account/register', { email: eposta, password: 'gizli-sifre-123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = await call('POST', '/api/account/verify', { token: sonBaglanti('verify') });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { token: v.body.token, pid: v.body.playerId };
}
const esya = (ad) => ({ id: `t_${ad}`, slot: 'weapon', name: ad, icon: '🗡️', level: 2, baseAtk: 3, baseHp: 0, atkBonus: 5, hpBonus: 0, durability: 10, maxDurability: 13, craftedAt: 1 });
const durum = async (tok) => (await call('GET', '/api/state', null, tok)).body.player;

try {
  const A = await kayit('ayse@ornek.com');
  const B = await kayit('bora@ornek.com');
  const C = await kayit('ceyda@ornek.com');
  assert.equal(kapi.statusOf(C.pid).status, 'waiting', 'üçüncü hesap bekleme sırasında');
  engine.mutatePlayer(A.pid, (gs) => { gs.state.armoryInventory = []; gs.state.equipment = {}; gs.state.soldierUnits = [{ id: 's1', name: 'Er', level: 1, hp: 100, maxHp: 100, baseAtk: 20, equipment: {} }]; gs.state.kayitHarci = { due: 0, paid: 0 }; });
  engine.mutatePlayer(B.pid, (gs) => { gs.state.armoryInventory = []; gs.state.adAstraBalance = 100; gs.state.lockedAda = 0; gs.state.kayitHarci = { due: 0, paid: 0 }; });

  // 1) "__proto__" ve benzeri konumlar eşya sayılmaz: ilan verilemez, kayıt değişmez
  for (const ref of [
    { source: 'kingdom', slotKey: '__proto__' },
    { source: 'kingdom', slotKey: 'constructor' },
    { source: 'soldier', soldierIndex: 0, slotKey: '__proto__' },
    { source: 'kingdom', slotKey: 'toString' }
  ]) {
    const r = await call('POST', '/api/pazar/sell', { ref, price: 1 }, A.token);
    assert.equal(r.status, 400, `${JSON.stringify(ref)} reddedilmeli: ${JSON.stringify(r.body)}`);
  }
  assert.equal((await durum(A.token)).armoryInventory.length, 0, 'sahte eşya üretilmedi');
  assert.equal((await call('GET', '/api/pazar', null, B.token)).body.listings.length, 0, 'ilan açılmadı');

  // geçerli eşya yine satılır ve alınır
  engine.mutatePlayer(A.pid, (gs) => { gs.state.armoryInventory = [esya('Gerçek Kılıç')]; });
  const sat = await call('POST', '/api/pazar/sell', { ref: { source: 'armory', armoryIndex: 0 }, price: 10 }, A.token);
  assert.equal(sat.status, 200, JSON.stringify(sat.body));
  ok('ilan pazarı: "__proto__"/"constructor" konumları reddedilir, gerçek eşya satılır');

  // 2) Alıcıya katkı puanı yalnız komisyon kadar verilir (alım bedelinin tamamı değil)
  const ilan = (await call('GET', '/api/pazar', null, B.token)).body;
  const katkiOnce = Number(((await durum(B.token)).contribution || {}).week) || 0;
  const al = await call('POST', '/api/pazar/buy', { id: ilan.listings[0].id }, B.token);
  assert.equal(al.status, 200, JSON.stringify(al.body));
  const katkiSonra = Number(((await durum(B.token)).contribution || {}).week) || 0;
  const komisyon = 10 * ilan.fee;
  assert.ok(katkiSonra - katkiOnce <= komisyon + 1e-6, `katkı artışı komisyonu aşmamalı: ${katkiSonra - katkiOnce} <= ${komisyon}`);
  assert.ok(katkiSonra - katkiOnce < 10 * 0.5, 'alım bedelinin tamamı katkı sayılmaz');
  ok('ilan alımı sahte katkı puanı üretmez');

  // 3) Bekleme sırasındaki hesap para yollarına giremez
  const cOdeme = await call('POST', '/api/pay/quote', { name: 'buySoldierUnit', args: [] }, C.token);
  assert.equal(cOdeme.status, 403, 'cüzdandan ödeme teklifi');
  assert.equal((await call('POST', '/api/pay/confirm', { ref: '0x' + 'a'.repeat(64), txHash: 'test' }, C.token)).status, 403, 'ödeme onayı');
  assert.equal((await call('POST', '/api/promo/redeem', { code: 'DENEME' }, C.token)).status, 403, 'promo kodu');
  assert.equal((await call('POST', '/api/pvp/queue', { mode: '1v1', indices: [0] }, C.token)).status, 403, 'Kolezyum sırası');
  assert.notEqual((await call('POST', '/api/promo/redeem', { code: 'DENEME' }, A.token)).status, 403, 'vatandaş engellenmez');
  ok('bekleme sırasındaki hesap ödeme, promo ve Kolezyum yollarına giremez');

  // 4) Dünya görüntüsünde işletme cüzdanı bilgisi ve uyarılan oyuncu kimlikleri yok
  db.kvSetJson('world:economy', {
    priceMultiplier: 1,
    hotWallet: { walletAda: 12345, reserve: '0xGizliYedekCuzdan', contract: { owner: '0xSahip' } },
    lastWeekly: { faucet: { perPlayer: 3 }, katilim: { uyarilan: ['acc:7'] } }
  });
  const gorunum = (await call('GET', '/api/state', null, A.token)).body.world.economy;
  assert.equal(gorunum.priceMultiplier, 1, 'genel alanlar durur');
  assert.equal(gorunum.hotWallet, undefined, 'işletme cüzdanı sızmaz');
  assert.equal(gorunum.lastWeekly.katilim, undefined, 'uyarılan oyuncu kimlikleri sızmaz');
  assert.equal(gorunum.lastWeekly.faucet.perPlayer, 3, 'haftalık özet durur');
  assert.ok(db.kvJson('world:economy', {}).hotWallet, 'sunucu kaydı bozulmadı (yönetici ucu görebilir)');
  ok('dünya görüntüsü işletme ve katılım bilgilerini sızdırmıyor');
} finally {
  server.close();
}
console.log('\n4/4 tarama düzeltmesi testi geçti.');
process.exit(0);
