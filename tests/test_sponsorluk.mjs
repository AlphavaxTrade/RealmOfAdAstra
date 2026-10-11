// Sponsorluk (docs/v2/SPONSORLUK_TASARIMI.md): kurallar, sızdırmazlık ve kötüye kullanım denemeleri.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createKapi } from '../server/kapi.js';
import { createSponsor } from '../server/sponsor.js';
import { createPazar } from '../server/pazar.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const quiet = { log() {}, warn() {}, error() {} };
const DAY = 86400000;

const db = openDb(':memory:');
const E = await createEngine(db, { testMode: true });
E.GAME_CONFIG.KAPI.START_LIMIT = 6;
let now = Date.UTC(2026, 9, 9, 12);
const clock = () => now;
const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true };
const kapi = createKapi({ db, engine: E, cfg, clock, log: quiet });
const sp = createSponsor({ db, engine: E, kapi, clock, log: quiet });
const pazar = createPazar({ db, engine: E, clock, log: quiet });
const world = createWorld({ db, engine: E, kapi, sponsor: sp, cfg: { ...cfg, minWithdrawAda: 100 }, clock, log: quiet });

const P = i => 'acc:' + i;
for (let i = 1; i <= 8; i++) { db.q.playerAdd.run(P(i), now, now); E.withPlayer(P(i), () => null); kapi.admit(P(i)); }   // 1-6 vatandaş, 7-8 sırada
// Vatandaş olunca yazılan kayıt harcı ilk ASTRA'dan düşer: testten önce ödenmiş olsun ki bakiye ölçümleri temiz kalsın
for (let i = 1; i <= 6; i++) { E.mutatePlayer(P(i), gs => { gs.state.adAstraBalance = 100; }); E.withPlayer(P(i), () => null); }
const setBal = (id, bal, locked = 0) => E.mutatePlayer(id, gs => { gs.state.adAstraBalance = bal; gs.state.lockedAda = locked; gs.state.sponsorAda = 0; });
const st = id => E.readPlayer(id);
const total = () => [1, 2, 3, 4, 5, 6, 7, 8].reduce((s, i) => s + (st(P(i)).adAstraBalance || 0), 0);
const sifirla = () => db.kvSetJson('sponsor:defter', { seq: sp.ledger().seq, items: [] });   // testler arası temizlik
const hata = async (fn, re) => {
  try { await fn(); } catch (e) { assert.ok(e.userError, 'kullanıcı hatası bekleniyordu: ' + e.message); if (re) assert.match(e.message, re); return; }
  assert.fail('hata bekleniyordu');
};

for (const i of [1, 2, 3, 4, 5, 6]) setBal(P(i), 0);
setBal(P(1), 50000, 20000);          // B: serbest 30.000, kilitli 20.000
const total0 = total();

// 1) Doğrulamalar
{
  await hata(() => sp.give(P(1), P(2), 500), /En az 1000/);
  await hata(() => sp.give(P(1), P(1), 2000), /Kendine/);
  await hata(() => sp.give(P(1), P(7), 2000), /yalnız vatandaş/);
  await hata(() => sp.give(P(1), 'acc:999', 2000), /bulunamadı/);
  await hata(() => sp.give(P(1), P(2), 35000), /serbest bakiyen 30000/);       // kilitli para verilemez
  E.mutatePlayer(P(3), gs => { gs._katilim().izinModu = { bitis: now + 5 * DAY, gun: 5 }; });
  await hata(() => sp.give(P(1), P(3), 2000), /izinde/);
  E.mutatePlayer(P(3), gs => { gs._katilim().izinModu = null; });
  assert.equal(st(P(1)).adAstraBalance, 50000, 'başarısız denemeler bakiyeye dokunmadı');
  ok('Doğrulamalar: alt sınır, kendine, sıradaki hedef, bilinmeyen hedef, serbest bakiye aşımı, izindeki hedef');
}

// 2) Sponsor olmak: para B → A, A'da çekilemez kalem
{
  const r = await sp.give(P(1), P(2), 10000);
  assert.equal(r.success, true);
  assert.equal(st(P(1)).adAstraBalance, 40000);
  assert.equal(st(P(2)).adAstraBalance, 10000);
  assert.equal(st(P(2)).sponsorAda, 10000);
  assert.ok(near(total(), total0), 'ASTRA korunuyor');
  E.withPlayer(P(2), gs => { const lk = gs.getLockedBalanceInfo(); assert.equal(lk.free, 0, 'sponsorlu para serbest (çekilebilir) sayılmaz'); assert.equal(lk.sponsored, 10000); return null; });
  E.withPlayer(P(1), gs => { assert.equal(gs.getLockedBalanceInfo().free, 20000, 'B\'nin kilitli 20.000\'i dokunulmadı, serbesti 20.000'); return null; });
  ok('Sponsor olunca para B\'den A\'nın sponsorlu kalemine taşınır; A\'da serbest bakiyeye girmez; toplam ASTRA sabit');
}

// 3) A'nın harcaması önce sponsorlu parayı kullanır; kendi parası çekilebilir kalır
{
  setBal(P(2), 12000); E.mutatePlayer(P(2), gs => { gs.state.sponsorAda = 10000; });   // 10.000 sponsorlu + 2.000 kendi
  E.mutatePlayer(P(2), gs => { gs.state.adAstraBalance -= 4000; gs._onAdaSpent(4000); });
  const s = st(P(2));
  assert.equal(s.sponsorAda, 6000, 'önce sponsorlu para harcandı');
  assert.equal(s.adAstraBalance, 8000);
  E.withPlayer(P(2), gs => { assert.equal(gs.getLockedBalanceInfo().free, 2000, 'kendi parası (2.000) serbest kaldı'); return null; });
  E.mutatePlayer(P(2), gs => { gs.state.adAstraBalance -= 7000; gs._onAdaSpent(7000); });
  assert.equal(st(P(2)).sponsorAda, 0); assert.equal(st(P(2)).adAstraBalance, 1000);
  E.withPlayer(P(2), gs => { assert.equal(gs.getLockedBalanceInfo().free, 1000, 'sponsorlu bitince kalan kendi para'); return null; });
  ok('Harcama sırası: önce sponsorlu para; kendi parası serbest kalır');
  setBal(P(2), 0);
}

// 4) Kara para temizleme: sponsorlu para ilan pazarında kullanılamaz
{
  setBal(P(2), 0); E.mutatePlayer(P(2), gs => { gs.state.adAstraBalance = 5000; gs.state.sponsorAda = 5000; });
  E.mutatePlayer(P(3), gs => { gs.state.armoryInventory = [{ name: 'Çürük Kılıç', slot: 'weapon' }]; });
  pazar.sell(P(3), { source: 'armory', armoryIndex: 0 }, 4000);
  const ilan = db.raw.prepare("SELECT id FROM listings WHERE status = 'active'").get();
  await hata(() => pazar.buy(P(2), ilan.id), /sponsorlu para ilan pazarında kullanılamaz/);
  assert.equal(st(P(2)).adAstraBalance, 5000, 'alım reddedildi, bakiye aynı');
  E.mutatePlayer(P(2), gs => { gs.state.adAstraBalance = 9000; });                // 5.000 sponsorlu + 4.000 kendi
  pazar.buy(P(2), ilan.id);
  assert.equal(st(P(2)).sponsorAda, 5000, 'alım yalnız kendi parasından; sponsorlu para yerinde');
  ok('Sponsorlu para oyuncudan oyuncuya geçemez (ilan pazarı yalnız kendi bakiyesiyle ödenir)');
  setBal(P(2), 0);
}

// 5) Sponsor payı: toplam %30, anapara oranında; her sponsora ayrı
{
  sifirla();
  for (const i of [1, 2, 3, 4, 5, 6]) setBal(P(i), 0);
  setBal(P(1), 20000); setBal(P(3), 60000);
  await sp.give(P(1), P(2), 10000);                               // c1: anapara 10.000
  await sp.give(P(3), P(2), 30000);                               // c2: anapara 30.000
  const b1 = st(P(1)).adAstraBalance, b3 = st(P(3)).adAstraBalance;
  const out = sp.settleShares(P(2), 1000);
  assert.ok(near(out.total, 300), `toplam pay net çekimin %30'u: ${out.total}`);
  assert.ok(near(out.parts.find(p => p.sponsor === P(1)).amount, 75) && near(out.parts.find(p => p.sponsor === P(3)).amount, 225), 'anapara oranında %25 / %75');
  assert.ok(near(st(P(1)).adAstraBalance - b1, 75) && near(st(P(3)).adAstraBalance - b3, 225), 'pay sponsorların bakiyesine eklendi');
  assert.equal(sp.settleShares(P(5), 1000).total, 0, 'sponsoru olmayana pay yok');
  assert.equal(sp.settleShares(P(2), 0).total, 0);
  ok('Sponsor payı: net çekimin %30\'u, anapara oranında bölünür, sponsorların bakiyesine eklenir');
}

// 6) Getiri tavanı (anaparanın 2 katı) ve kapatma/feragat kuralları
{
  const c1 = sp.ledger().items.find(x => x.sponsor === P(1) && x.status === 'active');
  assert.equal(c1.cap, 20000);
  const big = sp.settleShares(P(2), 1e7);                          // dev çekim: sponsorlar tavana dayanır
  assert.ok(near(sp.ledger().items.find(x => x.id === c1.id).returned, 20000), 'getiri anaparanın 2 katında durur');
  assert.equal(sp.ledger().items.find(x => x.id === c1.id).status, 'done');
  assert.ok(big.total > 0);
  await hata(() => sp.kapat(P(2), c1.id), /Açık bir sponsorluk bulunamadı/);                     // zaten bitti
  setBal(P(4), 5000);
  const r = await sp.give(P(4), P(5), 2000);
  await hata(() => sp.kapat(P(5), r.id), /henüz anaparaya/);
  sp.settleShares(P(5), 10000);                                    // %30 × 10.000 = 3.000: anaparayı (2.000) aşar, tavana (4.000) varmaz
  assert.equal(sp.kapat(P(5), r.id).success, true, 'getiri anaparaya ulaşınca A kapatabilir');
  const r2 = await sp.give(P(4), P(5), 2000);
  await hata(() => sp.feragat(P(5), r2.id), /bulunamadı/);          // başkası feragat edemez
  assert.equal(sp.feragat(P(4), r2.id).success, true);
  assert.equal(sp.settleShares(P(5), 1000).total, 0, 'feragat sonrası pay yok');
  ok('Getiri tavanı 2×; A getiri anaparaya ulaşınca kapatabilir; yalnız sponsor feragat eder; kapanan sözleşme pay almaz');
}

// 7) Süre dolumu ve sayı sınırları
{
  sifirla();
  for (const i of [1, 2, 3, 4, 5, 6]) setBal(P(i), 100000);
  const r = await sp.give(P(6), P(4), 1000);
  now += 366 * DAY;
  assert.equal(sp.settleShares(P(4), 1000).total, 0, '12 ay dolunca pay işlemez');
  assert.equal(sp.ledger().items.find(x => x.id === r.id).status, 'expired');
  now -= 366 * DAY;
  for (const b of [P(1), P(2), P(3), P(5), P(6)]) await sp.give(b, P(4), 1000);
  await hata(() => sp.give(P(6), P(4), 1000), /en çok sponsoru/);
  ok('Süre 12 ay; hedef başına en çok 5 aktif sponsor');
}

// 8) Herkese açık tablo: kimlik sızdırmaz
{
  sp.clearCache();
  const t = sp.table();
  assert.ok(t.rows.length >= 6);
  const text = JSON.stringify(t).replace(/"id":"acc:\d+"/g, '');
  assert.ok(!/@|0x[a-f0-9]{8}|wallet|email/i.test(text), 'tabloda e-posta/cüzdan yok');
  const row = t.rows.find(r => r.id === P(4));
  assert.equal(row.sponsorSayisi, 5); assert.equal(row.sponsorluToplam, 5000);
  assert.ok(row.ad.startsWith('Vatandaş #'));
  assert.ok(!t.rows.some(r => r.id === P(7)), 'sıradaki oyuncu tabloda yok');
  const m = sp.mine(P(4));
  assert.ok(m.received.length >= 5); assert.equal(m.sponsoredBalance, 6000, 'süresi dolan sözleşmenin parası da çekilemez kalır (5 aktif + 1 süresi dolmuş)');
  ok('Tablo: yalnız vatandaşlar, takma ad + gelişim; e-posta/cüzdan yok; "benim" görünümü doğru');
}

// 9) Çekim talebi sponsorlu parayı çekemez
{
  setBal(P(2), 0); E.mutatePlayer(P(2), gs => { gs.state.adAstraBalance = 5000; gs.state.sponsorAda = 5000; });
  const r = world.requestWithdraw(P(2), 1000);
  assert.equal(r.success, false);
  assert.match(r.message, /serbest\) bakiyen 0/);
  E.mutatePlayer(P(2), gs => { gs.state.adAstraBalance = 5500; });          // 500 kendi para
  assert.equal(world.requestWithdraw(P(2), 400).success, true, 'kendi parası çekilebilir');
  assert.equal(world.requestWithdraw(P(2), 200).success, false, 'kalan kendi para yetmez; sponsorlu para çekilemez');
  assert.equal(st(P(2)).sponsorAda, 5000);
  assert.equal(world.withdrawStatus(P(2)).sponsored, 5000);
  ok('Çekim talebi yalnız kendi paradan; sponsorlu para (5.000) dokunulmaz; çekim durumunda sponsorlu kalem görünür');
}

console.log(`\n${passed} sponsorluk kontrolü geçti.`);
process.exit(0);
