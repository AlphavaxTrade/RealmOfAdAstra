// v2 — İlan pazarı (teçhizat): ilan verme (eşya kayıttan çıkar), 10 ilan sınırı, fiyat sınırı, satın alma
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
const lastLink = kind => { const m = db.kvJson('dev:outbox', [])[0]; const r = new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(m ? m.text : ''); return r && r[1]; };
async function register(email) {
  const r = await call('POST', '/api/account/register', { email, password: 'gizli-sifre-123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = await call('POST', '/api/account/verify', { token: lastLink('verify'), password: 'gizli-sifre-123' });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { token: v.body.token, pid: v.body.playerId };
}
const item = (n, i) => ({ id: `w${n}_${i}`, slot: 'weapon', name: `Test Kılıcı ${n}`, icon: '🗡️', level: 2, baseAtk: 3, baseHp: 0, atkBonus: 5, hpBonus: 0, durability: 10, maxDurability: 13, craftedAt: 1 });
const stateOf = async tok => (await call('GET', '/api/state', null, tok)).body.player;

try {
  const A = await register('ayse@ornek.com');
  const B = await register('bora@ornek.com');
  engine.mutatePlayer(A.pid, gs => { gs.state.armoryInventory = [item(1, 0)]; gs.state.adAstraBalance = 0; gs.state.lockedAda = 0; gs.state.kayitHarci = { due: 0, paid: 0 }; });
  engine.mutatePlayer(B.pid, gs => { gs.state.armoryInventory = []; gs.state.adAstraBalance = 4; gs.state.lockedAda = 0; gs.state.kayitHarci = { due: 0, paid: 0 }; });

  // 1) İlan ver: eşya kayıttan çıkar; fiyat sınırı; listede görünür
  const bad = await call('POST', '/api/pazar/sell', { ref: { source: 'armory', armoryIndex: 0 }, price: 0 }, A.token);
  assert.equal(bad.status, 400, 'Sıfır fiyat reddedilir');
  const s1 = await call('POST', '/api/pazar/sell', { ref: { source: 'armory', armoryIndex: 0 }, price: 10 }, A.token);
  assert.equal(s1.status, 200, JSON.stringify(s1.body));
  assert.equal(s1.body.player.armoryInventory.length, 0, 'Eşya ilanda bekler, kayıtta değil');
  const l1 = await call('GET', '/api/pazar', null, B.token);
  assert.equal(l1.body.listings.length, 1);
  assert.equal(l1.body.listings[0].price, 10);
  assert.equal(l1.body.listings[0].item.name, 'Test Kılıcı 1');
  assert.equal(l1.body.listings[0].mine, false);
  const missing = await call('POST', '/api/pazar/sell', { ref: { source: 'armory', armoryIndex: 5 }, price: 1 }, A.token);
  assert.equal(missing.status, 400, 'Olmayan eşya ilana konamaz');
  ok('İlan verme: eşya kayıttan çıkar, listede görünür, hatalı istekler reddedilir');

  // 2) En çok 10 açık ilan
  engine.mutatePlayer(A.pid, gs => { gs.state.armoryInventory = Array.from({ length: 10 }, (_, i) => item(2, i)); });
  for (let i = 0; i < 9; i++) assert.equal((await call('POST', '/api/pazar/sell', { ref: { source: 'armory', armoryIndex: 0 }, price: 1 }, A.token)).status, 200);
  const eleventh = await call('POST', '/api/pazar/sell', { ref: { source: 'armory', armoryIndex: 0 }, price: 1 }, A.token);
  assert.equal(eleventh.status, 400, '11. ilan reddedilir');
  assert.ok(/10/.test(eleventh.body.error));
  ok('Oyuncu başına en çok 10 açık ilan');

  // 3) Satın alma: kendi ilanı alınamaz, para yetmezse olmaz; önce serbest bakiyeden öder; satıcıya %98 (%80 kilitli); %1 yakım, %1 kasa
  const listingId = l1.body.listings[0].id;
  assert.equal((await call('POST', '/api/pazar/buy', { id: listingId }, A.token)).status, 400, 'Kendi ilanını alamaz');
  const poor = await call('POST', '/api/pazar/buy', { id: listingId }, B.token);
  assert.equal(poor.status, 400, 'Para yetmiyor');
  assert.ok(/Yetersiz ASTRA/.test(poor.body.error), poor.body.error);
  engine.mutatePlayer(B.pid, gs => { gs.state.adAstraBalance = 16; gs.state.lockedAda = 6; });
  const burned0 = Number(engine.globalPool.state.totalBurned) || 0;
  const pools0 = Object.values(engine.treasury.state.pools).reduce((s, v) => s + v, 0);
  const buy = await call('POST', '/api/pazar/buy', { id: listingId }, B.token);
  assert.equal(buy.status, 200, JSON.stringify(buy.body));
  assert.ok(near(buy.body.player.adAstraBalance, 6), 'Alıcı 10 ödedi');
  // 5,988: aradan geçen sürenin doğal kilit açılması (zamanla herkese açılır); alımdan açılan pay yok
  assert.ok(buy.body.player.lockedAda > 5.9 && buy.body.player.lockedAda <= 6, 'Serbest 10 yetti: kilitli 6 bozulmadı (kilit buradan açılmaz): ' + buy.body.player.lockedAda);
  assert.equal(buy.body.player.armoryInventory.length, 1);
  assert.equal(buy.body.player.armoryInventory[0].name, 'Test Kılıcı 1', 'Eşya alıcının Cephaneliğinde');
  const aSt = await stateOf(A.token);
  assert.ok(near(aSt.adAstraBalance, 9.8), 'Satıcıya %98');
  assert.ok(near(aSt.lockedAda, 7.84), 'Gelen paranın %80\'i kilitli');
  assert.ok((aSt.pendingNotices || []).some(n => /İlanın satıldı/.test(n.message)), 'Satıcıya bildirim');
  assert.ok(near((Number(engine.globalPool.state.totalBurned) || 0) - burned0, 0.1), 'Komisyonun yarısı yakıldı');
  assert.ok(near(Object.values(engine.treasury.state.pools).reduce((s, v) => s + v, 0) - pools0, 0.1, 1e-6), 'Komisyonun yarısı kasalara');
  assert.equal((await call('POST', '/api/pazar/buy', { id: listingId }, B.token)).status, 400, 'Satılmış ilan tekrar alınamaz');
  const hist = await call('GET', '/api/pazar', null, B.token);
  assert.equal(hist.body.history[0].status, 'sold');
  ok('Satın alma: serbestten ödeme, satıcı payı, yakım ve kasa payı, geçmiş');

  // 4) Geri çekme: yalnız sahibi; eşya Cephaneliğe döner
  const mine = (await call('GET', '/api/pazar', null, A.token)).body.mine;
  assert.equal(mine.length, 9);
  assert.equal((await call('POST', '/api/pazar/cancel', { id: mine[0].id }, B.token)).status, 400, 'Başkasının ilanı geri çekilemez');
  const c = await call('POST', '/api/pazar/cancel', { id: mine[0].id }, A.token);
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.player.armoryInventory.length, 2, 'Eşya geri geldi (1 kalan + 1 dönen)');
  ok('Geri çekme: eşya sahibine döner');

  // 5) 7 gün: süresi dolan ilanın eşyası sahibine döner, bildirim gider
  now += 8 * DAY;
  const n = pazar.expire();
  assert.equal(n, 8, 'Kalan 8 ilan süresi dolunca kapandı');
  const lb = await call('POST', '/api/account/login', { email: 'ayse@ornek.com', password: 'gizli-sifre-123' });
  const aSt2 = await stateOf(lb.body.token);
  assert.equal(aSt2.armoryInventory.length, 10, 'Hepsi Cephanelikte');
  assert.ok((aSt2.pendingNotices || []).some(nn => /süresi doldu/.test(nn.message)));
  assert.equal((await call('GET', '/api/pazar', null, lb.body.token)).body.listings.length, 0);
  ok('7 gün sonra eşya sahibine döner');

  // 5b) Kilit aklama kapalı: iki hesapla al-sat kilitli ASTRA'yı serbest bırakamaz
  {
    const satici = lb.body.token;
    const saticiPid = lb.body.playerId;
    const listele = async fiyat => {
      const s = await call('POST', '/api/pazar/sell', { ref: { source: 'armory', armoryIndex: 0 }, price: fiyat }, satici);
      assert.equal(s.status, 200, JSON.stringify(s.body));
      return (await call('GET', '/api/pazar', null, satici)).body.mine[0].id;   // en yeni ilan başta
    };
    const durum = pid => { let o; engine.mutatePlayer(pid, gs => { o = { bal: gs.state.adAstraBalance, locked: gs.state.lockedAda }; }); return o; };
    const sifirla = (pid, bal, locked) => engine.mutatePlayer(pid, gs => { gs.state.adAstraBalance = bal; gs.state.lockedAda = locked; gs.state.sponsorAda = 0; });

    // (a) Alıcının tamamı kilitli: satıcıya gelen paranın TAMAMI kilitli gelir (eskiden %20'si serbest kalıyordu)
    sifirla(saticiPid, 0, 0); sifirla(B.pid, 10, 10);
    let id = await listele(10);
    let r = await call('POST', '/api/pazar/buy', { id }, B.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let a = durum(saticiPid), b = durum(B.pid);
    assert.ok(near(b.bal, 0) && near(b.locked, 0), `Alıcı: ${JSON.stringify(b)}`);
    assert.ok(near(a.bal, 9.8) && near(a.locked, 9.8), `Satıcıya gelen 9,8'in tamamı kilitli: ${JSON.stringify(a)}`);

    // (b) Karışık: 6 serbest + 8 kilitli, fiyat 10 → 4'ü kilitliden; satıcıda kilitli pay yine en az %80
    sifirla(saticiPid, 0, 0); sifirla(B.pid, 14, 8);
    id = await listele(10);
    r = await call('POST', '/api/pazar/buy', { id }, B.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    a = durum(saticiPid); b = durum(B.pid);
    assert.ok(near(b.bal, 4) && near(b.locked, 4), `Serbest 6 önce gitti, kalan 4 kilitliden: ${JSON.stringify(b)}`);
    assert.ok(near(a.bal, 9.8) && near(a.locked, 7.84), `Satıcıda %80 kilitli: ${JSON.stringify(a)}`);

    // (c) Serbest yetmeyip kilitli oranı %80'i aşarsa satıcıdaki kilitli pay o orana çıkar (fiyat 10: 2 serbest + 8 kilitli → %80; 1 + 9 → %90)
    sifirla(saticiPid, 0, 0); sifirla(B.pid, 10, 9);
    id = await listele(10);
    r = await call('POST', '/api/pazar/buy', { id }, B.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    a = durum(saticiPid);
    assert.ok(near(a.locked, 9.8 * 0.9), `Kilitli pay %90: ${JSON.stringify(a)}`);
    // satıcının topladığı kilit, alıcıdan çıkan kilitliden fazla olamaz (toplam kilit hiçbir hâlde artmaz, ücret kısmı hariç)
    assert.ok(a.locked <= 9 + 1e-6, 'Kilitli toplam alıcının ödediği kilitliyi aşmaz');
  }
  ok('Kilit aklama kapalı: kilitli ödeme satıcıda kilitli kalır, serbest önce harcanır');

  // 6) Bekleme sırasındaki oyuncu ilan pazarını görür ama kullanamaz
  engine.GAME_CONFIG.KAPI.START_LIMIT = 2;
  kapi.adminSet({ limit: 2 });
  const C = await register('ceyda@ornek.com');
  assert.equal(kapi.statusOf(C.pid).status, 'waiting');
  assert.equal((await call('GET', '/api/pazar', null, C.token)).status, 200);
  const cs = await call('POST', '/api/pazar/sell', { ref: { source: 'armory', armoryIndex: 0 }, price: 1 }, C.token);
  assert.equal(cs.status, 403);
  ok('Bekleme sırasındaki yalnız bakar');

  console.log(`\n${passed}/7 ilan pazarı testi geçti`);
} finally {
  server.close();
}
