// Pandora kutusu ve koleksiyon eseri ilanı + ilan süzgeci/sıralaması (19 Ekim 2026): toplu satış (adet + birim fiyat), kısmi alım, eserin son kopyası kuralı,
// kayıtta eser adedi ve uyandı bilgisinin korunması, tür / ad süzgeci, fiyata göre sıralama (en ucuz üstte), limit, tür sayıları.
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
  const hazirla = (pid, fn) => engine.mutatePlayer(pid, gs => { gs.state.lockedAda = 0; gs.state.sponsorAda = 0; gs.state.kayitHarci = { due: 0, paid: 0 }; fn(gs); });
  const eserOf = (st, id) => st.collectionArtifacts.find((a) => a.id === id);
  hazirla(A.pid, (gs) => { gs.state.adAstraBalance = 0; gs.state.lockedBoxes = 6; gs.state.arenaKeys = 0; });
  hazirla(B.pid, (gs) => { gs.state.adAstraBalance = 5000; gs.state.lockedBoxes = 0; });

  // 1) Pandora kutusu ilanı: adet + birim fiyat, kısmi alım, geri çekme
  assert.equal((await call('POST', '/api/pazar/sell-bulk', { kind: 'box', qty: 0, price: 5 }, A.token)).status, 400, 'adet 0');
  assert.equal((await call('POST', '/api/pazar/sell-bulk', { kind: 'olmayan', qty: 1, price: 5 }, A.token)).status, 400, 'bilinmeyen tür');
  const fazla = await call('POST', '/api/pazar/sell-bulk', { kind: 'box', qty: 99, price: 5 }, A.token);
  assert.equal(fazla.status, 400); assert.ok(/Yetersiz Pandora kutusu/.test(fazla.body.error), fazla.body.error);
  const kutuIlan = await call('POST', '/api/pazar/sell-bulk', { kind: 'box', qty: 4, price: 20 }, A.token);
  assert.equal(kutuIlan.status, 200, JSON.stringify(kutuIlan.body));
  assert.equal(kutuIlan.body.player.lockedBoxes, 2, '4 kutu ilanda bekliyor');
  const kid = kutuIlan.body.result.listing.id;
  const alKutu = await call('POST', '/api/pazar/buy', { id: kid, qty: 3 }, B.token);
  assert.equal(alKutu.status, 200, JSON.stringify(alKutu.body));
  assert.equal(alKutu.body.player.lockedBoxes, 3, '3 kutu alıcıya geçti');
  assert.ok(near(alKutu.body.player.adAstraBalance, 5000 - 60), '3 × 20 ASTRA ödendi');
  assert.equal((await call('GET', '/api/pazar', null, B.token)).body.listings.find((l) => l.id === kid).item.qty, 1, 'kalan 1 kutuyla ilan açık');
  assert.equal((await call('POST', '/api/pazar/cancel', { id: kid }, A.token)).body.player.lockedBoxes, 3, 'kalan kutu geri döndü (2 + 1)');
  ok('Pandora kutusu ilanı: toplu satış, kısmi alım, geri çekme');

  // 2) Koleksiyon eseri: kopya satılır, alıcıya eklenir; son kopya satılırsa eser düşer; uyandırılmış eserin son kopyası satılamaz
  hazirla(A.pid, (gs) => {
    const k = (id, alan) => Object.assign(gs.state.collectionArtifacts.find((a) => a.id === id), alan);
    k('artifact_01', { discovered: true, discoveredAt: 111, count: 3 });
    k('artifact_02', { discovered: true, discoveredAt: 222, count: 1, uyandi: true, uyandiAt: 333 });
    k('artifact_03', { discovered: true, discoveredAt: 444 });   // count yok: tek kopya sayılır
  });
  const a0 = await stateOf(A.token);
  assert.equal(eserOf(a0, 'artifact_01').count, 3, 'kayıt yüklenince eser adedi korunuyor');
  assert.equal(eserOf(a0, 'artifact_02').uyandi, true, 'kayıt yüklenince "uyandı" korunuyor');
  assert.equal((await call('POST', '/api/pazar/sell-bulk', { kind: 'artifact', qty: 1, price: 5 }, A.token)).status, 400, 'eser kimliği şart');
  assert.equal((await call('POST', '/api/pazar/sell-bulk', { kind: 'artifact', id: 'artifact_01', qty: 4, price: 5 }, A.token)).status, 400, 'kopyadan fazlası');
  const uy = await call('POST', '/api/pazar/sell-bulk', { kind: 'artifact', id: 'artifact_02', qty: 1, price: 5 }, A.token);
  assert.equal(uy.status, 400); assert.ok(/son kopyası satılamaz/.test(uy.body.error), uy.body.error);
  assert.equal((await call('POST', '/api/pazar/sell-bulk', { kind: 'artifact', id: 'artifact_xx', qty: 1, price: 5 }, A.token)).status, 400, 'bilinmeyen eser');
  const e1 = await call('POST', '/api/pazar/sell-bulk', { kind: 'artifact', id: 'artifact_01', qty: 2, price: 8 }, A.token);
  assert.equal(e1.status, 200, JSON.stringify(e1.body));
  assert.equal(eserOf(e1.body.player, 'artifact_01').count, 1, '2 kopya ilanda, 1 elde');
  const eid = e1.body.result.listing.id;
  const eAl = await call('POST', '/api/pazar/buy', { id: eid, qty: 2 }, B.token);
  assert.equal(eAl.status, 200, JSON.stringify(eAl.body));
  const b1 = eserOf(eAl.body.player, 'artifact_01');
  assert.ok(b1.discovered && b1.count === 2 && b1.discoveredAt, 'alıcıda eser keşfedilmiş, 2 kopya');
  // tek kopyası (uyandırılmamış) satılırsa eser koleksiyondan düşer; uyandırılmışın fazladan kopyası satılabilir
  const e3 = await call('POST', '/api/pazar/sell-bulk', { kind: 'artifact', id: 'artifact_03', qty: 1, price: 3 }, A.token);
  assert.equal(e3.status, 200, JSON.stringify(e3.body));
  assert.equal(eserOf(e3.body.player, 'artifact_03').discovered, false, 'son kopya satılınca eser düşer');
  assert.equal((await call('POST', '/api/pazar/cancel', { id: e3.body.result.listing.id }, A.token)).status, 200);
  assert.equal(eserOf(await stateOf(A.token), 'artifact_03').discovered, true, 'geri çekilince eser geri döner');
  hazirla(A.pid, (gs) => { gs.state.collectionArtifacts.find((a) => a.id === 'artifact_02').count = 2; });
  assert.equal((await call('POST', '/api/pazar/sell-bulk', { kind: 'artifact', id: 'artifact_02', qty: 2, price: 5 }, A.token)).status, 400, 'uyandırılmışın ikisi birden satılamaz');
  const fazlalik = await call('POST', '/api/pazar/sell-bulk', { kind: 'artifact', id: 'artifact_02', qty: 1, price: 5 }, A.token);
  assert.equal(fazlalik.status, 200, JSON.stringify(fazlalik.body));
  assert.equal(eserOf(fazlalik.body.player, 'artifact_02').uyandi, true, 'uyandı bilgisi satıştan sonra da duruyor');
  assert.equal((await call('POST', '/api/pazar/cancel', { id: fazlalik.body.result.listing.id }, A.token)).status, 200);
  ok('Eser ilanı: kopya satılır, alıcıya eklenir, son kopya düşer; uyandırılmışın son kopyası satılamaz; kayıt adet/uyandı korunur');

  // 3) Süzgeç ve sıralama: tür, ad, fiyata göre (en ucuz üstte); türlere göre sayılar; limit
  hazirla(A.pid, (gs) => {
    gs.state.arenaKeys = 10; gs.state.lockedBoxes = 5; gs.state.armoryInventory = [
      { id: 'w1', slot: 'weapon', name: 'Demir Kılıç', icon: '⚔️', level: 2, atkBonus: 5, hpBonus: 0, durability: 10, maxDurability: 13 },
      { id: 'h1', slot: 'helmet', name: 'Çelik Miğfer', icon: '⛑️', level: 1, atkBonus: 0, hpBonus: 9, durability: 13, maxDurability: 13 }
    ];
  });
  const fiyatlar = [['key', 7], ['box', 3], ['artifact', 9]];
  assert.equal((await call('POST', '/api/pazar/sell-bulk', { kind: 'key', qty: 2, price: 7 }, A.token)).status, 200);
  assert.equal((await call('POST', '/api/pazar/sell-bulk', { kind: 'box', qty: 2, price: 3 }, A.token)).status, 200);
  assert.equal((await call('POST', '/api/pazar/sell-bulk', { kind: 'artifact', id: 'artifact_01', qty: 1, price: 9 }, A.token)).status, 200);
  assert.equal((await call('POST', '/api/pazar/sell', { ref: { source: 'armory', armoryIndex: 0 }, price: 12 }, A.token)).status, 200);
  assert.equal((await call('POST', '/api/pazar/sell', { ref: { source: 'armory', armoryIndex: 0 }, price: 4 }, A.token)).status, 200);
  void fiyatlar;
  const g = async (q, tok = B.token) => (await call('GET', '/api/pazar' + q, null, tok)).body;
  const hepsi = await g('');
  assert.deepEqual(hepsi.listings.map((l) => l.price), [3, 4, 7, 9, 12], 'varsayılan: en ucuzdan pahalıya, en ucuz en üstte');
  assert.equal(hepsi.toplam, 5);
  assert.deepEqual(hepsi.sayilar, { hepsi: 5, key: 1, box: 1, artifact: 1, weapon: 1, helmet: 1 }, 'türlere göre sayılar');
  assert.deepEqual((await g('?sira=pahali')).listings.map((l) => l.price), [12, 9, 7, 4, 3], 'en pahalıdan');
  assert.deepEqual((await g('?tur=box')).listings.map((l) => l.item.kind), ['box'], 'yalnız kutu');
  assert.deepEqual((await g('?tur=helmet')).listings.map((l) => l.item.name), ['Çelik Miğfer'], 'yuvaya göre');
  assert.equal((await g('?tur=hepsi')).toplam, 5);
  assert.deepEqual((await g('?ara=KILIÇ')).listings.map((l) => l.item.name), ['Demir Kılıç'], 'ad araması büyük/küçük harf ve Türkçe harfe duyarsız');
  assert.deepEqual((await g('?ara=balçık')).listings.map((l) => l.item.kind), ['artifact'], 'eser adına göre arama (Balçık Özü Kristali)');
  const sayfa = await g('?limit=2');
  assert.equal(sayfa.listings.length, 2); assert.equal(sayfa.toplam, 5, 'limit görünenleri keser, toplam sürer');
  assert.deepEqual(sayfa.listings.map((l) => l.price), [3, 4], 'kesilen liste de en ucuzlardan');
  assert.deepEqual((await g('?sira=sacma&tur=weapon&limit=abc')).listings.map((l) => l.item.slot), ['weapon'], 'bozuk sıra/limit varsayılana döner');
  const benim = await g('', A.token);
  assert.equal(benim.sayilar.hepsi, 0, 'kendi ilanların "satıştakiler" sayısına girmez');
  assert.ok(benim.mine.length >= 5 && benim.listings.every((l) => l.mine), 'satıcı kendi ilanlarını "mine" olarak görür');
  ok('Süzgeç ve sıralama: tür, ad, fiyat (en ucuz üstte), limit, tür sayıları');

  console.log(`
${passed} kutu/eser ilanı ve süzgeç kontrolü geçti.`);
} finally {
  server.close();
}
