// Kötüye kullanım ve uç durum denemeleri (T4, yerel doğrulama kampanyası): kapı/katılım kuralları, HTTP sağlamlığı ve ekonomik sömürü
// girişimleri GERÇEK sunucu koduna karşı. Her deneme için beklenen: reddedilir ya da zararsız kalır; sunucu asla 500 vermez, ayakta kalır.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';
import { createKapi } from '../server/kapi.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const quiet = { log() {}, warn() {}, error() {} };
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: false, rateLimitPerSec: 1e6, publicRateLimitPerSec: 1e6, ipRateLimitPerSec: 1e6, testMode: true };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
engine.GAME_CONFIG.KAPI.START_LIMIT = 3;
const mailer = createMailer({ db, cfg, log: quiet });
const accounts = createAccounts({ db, cfg, mailer, verifyMessage: () => '0x0' });
const kapi = createKapi({ db, engine, accounts, mailer, cfg, log: quiet });
const world = createWorld({ db, engine, chain: null, accounts, mailer, kapi, cfg, log: quiet });
const app = createApp({ db, engine, world, accounts, kapi, chain: null, cfg, log: quiet });
const server = app.server().listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const ADMIN = cfg.adminToken;
// Ağ hatası (sunucu sınırı aşan gövdede bağlantıyı keser) status 0 olarak döner: kesilme bir savunmadır, çökme değil (aşağıda sunucunun ayakta olduğu ayrıca denetlenir)
const ham = async (method, p, bodyText, token, ekBaslik = {}) => {
  try {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...ekBaslik }, body: bodyText });
    let body = null; try { body = await res.json(); } catch { /* JSON değil */ }
    return { status: res.status, body };
  } catch (e) { return { status: 0, body: null, ag: String((e.cause && e.cause.code) || e.message) }; }
};
const call = (m, p, b, t) => ham(m, p, b === undefined || m === 'GET' ? undefined : JSON.stringify(b), t);
const lastLink = kind => { const m = db.kvJson('dev:outbox', [])[0]; const r = { verify: /[?&]verify=([a-f0-9]+)/, wallet: /[?&]wallet=([a-f0-9]+)/ }[kind].exec(m ? m.text : ''); return r && r[1]; };
async function register(email) {
  const r = await call('POST', '/api/account/register', { email, password: 'gizli-sifre-123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = await call('POST', '/api/account/verify', { token: lastLink('verify'), password: 'gizli-sifre-123' });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { token: v.body.token, pid: v.body.playerId, email };
}
const saglik = async () => assert.equal((await call('GET', '/api/health')).status, 200, 'Sunucu ayakta');

try {
  const A = await register('a@ornek.com'), B = await register('b@ornek.com'), C = await register('c@ornek.com');   // 3 vatandaş (sınır 3)

  // 1) HTTP sağlamlığı: hiçbir bozuk girdi 500 vermez
  {
    const durumlar = [];
    const dene = async (ad, p, kesilebilir = false) => { const r = await p; durumlar.push([ad, r.status]); assert.notEqual(r.status, 500, `${ad} → 500`); if (!kesilebilir) assert.notEqual(r.status, 0, `${ad}: bağlantı beklenmedik biçimde kesildi (${r.ag})`); return r; };
    await dene('bozuk JSON', ham('POST', '/api/action', '{"name":', A.token));
    await dene('boş gövde', ham('POST', '/api/action', '', A.token));
    await dene('gövde dizi', ham('POST', '/api/action', '[1,2,3]', A.token));
    await dene('args nesne', call('POST', '/api/action', { name: 'claimAllHarvests', args: { a: 1 } }, A.token));
    await dene('devasa gövde (2 MB)', ham('POST', '/api/action', JSON.stringify({ name: 'x'.repeat(2e6), args: [] }), A.token), true);   // 400/413 ya da bağlantı kesilir
    for (const ad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'yok', '', 'a'.repeat(500)]) { const r = await dene(`işlem adı "${ad.slice(0, 12)}"`, call('POST', '/api/action', { name: ad, args: [] }, A.token)); assert.ok(r.status >= 400 || (r.body && r.body.result && r.body.result.success === false), `işlem adı ${ad.slice(0, 12)} kabul edilmemeli`); }
    for (const a of ['evet', null, 1, [], {}, undefined]) await dene(`cevaplaIzinSorusu(${JSON.stringify(a)})`, call('POST', '/api/action', { name: 'cevaplaIzinSorusu', args: [a] }, A.token));
    const yanlisTur = await call('POST', '/api/action', { name: 'cevaplaIzinSorusu', args: ['evet'] }, A.token);
    assert.equal(yanlisTur.status, 400, 'bool bekleyen işleme dizgi: 400');
    for (const a of [1, null, {}, 'yok_boyle_adim', 'x'.repeat(200)]) await dene(`misafirGorevTamamla(${JSON.stringify(a).slice(0, 14)})`, call('POST', '/api/action', { name: 'misafirGorevTamamla', args: [a] }, A.token));
    await dene('token yok', call('POST', '/api/action', { name: 'claimAllHarvests', args: [] }));
    await dene('uydurma token', call('POST', '/api/action', { name: 'claimAllHarvests', args: [] }, 'x'.repeat(64)));
    assert.equal((await call('POST', '/api/action', { name: 'claimAllHarvests', args: [] })).status, 401);
    await saglik();
    ok(`HTTP: ${durumlar.length} bozuk/uç girdi — hiçbiri 500 vermedi, bozuk tür 400, kimliksiz 401, sunucu ayakta`);
  }

  // 2) Yönetici uçları: saçma değerler (doğru belirteçle) ve yetkisiz erişim + kaba kuvvet kilidi
  {
    const once = kapi.publicSummary();
    for (const g of [{ limit: -1 }, { limit: 0 }, { limit: 'abc' }, { limit: 1e12 }, { limit: null }, { limit: 1.5 }, { tier: 99 }, { tier: -1 }, { tier: 'x' }, { growthLocked: 'false' }, { growthLocked: 0 }, {}, { limit: [] }]) {
      const r = await call('POST', '/api/admin/kapi', g, ADMIN);
      assert.notEqual(r.status, 500, JSON.stringify(g) + ' → 500');
    }
    const sonra = kapi.publicSummary();
    assert.ok(Number.isInteger(sonra.limit) && sonra.limit >= 1 && sonra.limit < 1e9, 'sınır geçerli bir tam sayı kaldı: ' + sonra.limit);
    assert.ok([0, 1, 2].includes(sonra.tier), 'dönem geçerli kaldı');
    assert.equal(typeof sonra.growthLocked, 'boolean');
    await call('POST', '/api/admin/kapi', { limit: once.limit, tier: once.tier, growthLocked: once.growthLocked }, ADMIN);
    // yetkisiz erişim (hata sayacı 10'a varmadan): belirteçsiz / yanlış / oyuncu belirteci
    for (const [m, p] of [['GET', '/api/admin/status'], ['POST', '/api/admin/kapi'], ['POST', '/api/admin/pause']]) {
      assert.equal((await call(m, p, {}, undefined)).status, 401, `${p} belirteçsiz`);
      assert.equal((await call(m, p, {}, 'yanlis-yonetici-anahtari-yanlis-1234567890')).status, 401, `${p} yanlış belirteç`);
      assert.equal((await call(m, p, {}, A.token)).status, 401, `${p} oyuncu belirteciyle`);
    }
    // kaba kuvvet: 10 başarısız denemeden sonra aynı adres 10 dakika kilitlenir (doğru belirteç de reddedilir — savunmanın bedeli)
    for (let i = 0; i < 4; i++) await call('POST', '/api/admin/kapi', {}, 'yanlis-' + i);
    assert.equal((await call('POST', '/api/admin/kapi', {}, ADMIN)).status, 429, 'kilitlenince doğru belirteç de 429 alır');
    await saglik();
    ok('Yönetici: saçma sınır/dönem/kilit değerleri 500 vermez ve durum geçerli kalır; belirteçsiz/yanlış/oyuncu belirteciyle 401; 10 hatalı denemeden sonra kilit (429)');
  }

  // 3) Katılım kuralları: tekrar puan getirmez, başarısız eylem işaretlemez
  {
    const ozet = async who => (await call('GET', '/api/state', undefined, who.token)).body.player.katilim;
    await call('POST', '/api/action', { name: 'carnivalCheer', args: [] }, A.token);
    await call('POST', '/api/action', { name: 'marketBuy', args: ['wheat', 5] }, A.token);        // ASTRA yok: reddedilir
    await call('POST', '/api/action', { name: 'startExpedition', args: ['wheat'] }, A.token);
    await call('POST', '/api/action', { name: 'startExpedition', args: ['wood'] }, A.token);
    const k = await ozet(A);
    assert.deepEqual(Object.keys(k.touched).sort(), ['karnaval', 'sefer'], 'yalnız başarılı eylemlerin kategorisi: ' + JSON.stringify(k.touched));
    assert.ok(!k.touched.pazar, 'reddedilen marketBuy kategoriyi işaretlemedi');
    const ozetA = engine.withPlayer(A.pid, gs => gs.getKatilimOzet()).result;
    assert.equal(ozetA.puan, 2, 'aynı kategoriyi tekrarlamak puanı artırmadı (2 farklı kategori)');
    ok('Katılım: başarısız eylem kategoriyi işaretlemiyor, aynı kategoriyi tekrarlamak ek puan getirmiyor');
  }

  // 4) İzin sorusu: tekrar/geç/yok iken cevap, 30 gün tavanı
  {
    const cevap = (who, evet) => call('POST', '/api/action', { name: 'cevaplaIzinSorusu', args: [evet] }, who.token);
    assert.equal((await cevap(B, true)).body.result.success, false, 'soru yokken "evet" reddedilir');
    const simdi = Date.now();
    engine.mutatePlayer(B.pid, gs => { const k = gs._katilim(); k.izinSorusu = { soruldu: simdi, sonTarih: simdi + 3600000 }; k.izinYillikKalan = 5; });
    const r1 = (await cevap(B, true)).body.result;
    assert.equal(r1.success, true); assert.equal(r1.gun, 5, 'izin en çok kalan hak kadar (5 gün) verilir'); assert.equal(r1.kalanHak, 0);
    assert.equal((await cevap(B, true)).body.result.success, false, 'ikinci "evet" reddedilir');
    engine.mutatePlayer(B.pid, gs => { const k = gs._katilim(); k.izinModu = null; k.izinSorusu = { soruldu: simdi, sonTarih: simdi + 3600000 }; });
    const r2 = (await cevap(B, true)).body.result;
    assert.equal(r2.success, false); assert.match(r2.message, /hakkın kalmadı/, 'hak bitince izin verilmez');
    engine.mutatePlayer(C.pid, gs => { gs._katilim().izinSorusu = { soruldu: simdi - 7200000, sonTarih: simdi - 3600000 }; });
    const r3 = (await cevap(C, true)).body.result;
    assert.equal(r3.success, false); assert.match(r3.message, /süresi geçti/);
    assert.equal(engine.readPlayer(C.pid).katilim.izinSorusu, null, 'süresi geçen soru temizlendi');
    ok('İzin sorusu: soru yokken, ikinci kez, süresi geçmişken ve hak bitmişken "evet" reddediliyor; hak tavanı (5 gün) uygulanıyor');
  }

  // 5) Pazartesi yarışı: hafta döndükten SONRA ama değerlendirmeden ÖNCE eylem yapan oyuncunun kapanan haftası silinmemeli
  {
    const D = await register('d@ornek.com');   // sınır dolu: sırada
    kapi.adminSetPlayer(D.pid, 'citizen');
    const kapanan = engine.globalPool.state.epochId;
    engine.mutatePlayer(D.pid, gs => { gs._katilim().touched = { sefer: true, pazar: true, zindan: true }; gs.state.level = 1; });
    engine.globalPool.state.epochId = kapanan + 1;                                   // hafta döndü (Pazartesi 00:00)
    engine.mutatePlayer(D.pid, gs => gs._markKatilimTouch('karnaval'));              // oyuncu 00:00:30'da bir eylem yaptı
    const once = engine.readPlayer(D.pid).katilim.dusukHaftaSayisi || 0;
    kapi.haftalikKatilimDegerlendir(kapanan);                                        // değerlendirme 00:01'de
    const k = engine.readPlayer(D.pid).katilim;
    assert.equal(k.dusukHaftaSayisi || 0, once, 'kapanan hafta 3 kategoriydi (eşik 2): düşük sayılmamalı');
    assert.deepEqual(Object.keys(k.touched), ['karnaval'], 'yeni haftanın dokunuşu korundu');
    // Hiç girmeyen oyuncu: bayat dokunuşlar kapanan haftaya yazılmaz
    const E = await register('e@ornek.com'); kapi.adminSetPlayer(E.pid, 'citizen');
    engine.mutatePlayer(E.pid, gs => { const kk = gs._katilim(); kk.epochId = kapanan - 3; kk.touched = { sefer: true, pazar: true, zindan: true }; });
    kapi.haftalikKatilimDegerlendir(kapanan);
    assert.equal(engine.readPlayer(E.pid).katilim.dusukHaftaSayisi, 1, 'kapanan haftada girmeyen oyuncu 3 hafta önceki dokunuşlarla sağlıklı sayılmaz');
    ok('Pazartesi yarışı: hafta döndükten sonra eylem yapan oyuncunun kapanan haftası korunuyor; kapanan haftada hiç girmeyenin bayat dokunuşları sayılmıyor');
  }

  // 6) Sıra atlama dalgası: aynı anda 20 kayıt, sınır dolu — kimse sıra atlayamaz, sayımlar tutarlı
  {
    const e0 = kapi.publicSummary();
    // Kayıtlar EŞZAMANLI gelir; doğrulama bağlantıları gelen kutusundan alıcıya göre okunur (yardımcı tek-tek çalışır, eşzamanlı olamaz)
    const epostalar = Array.from({ length: 20 }, (_, i) => `dalga${i}@ornek.com`);
    const kayitlar = await Promise.all(epostalar.map(e => call('POST', '/api/account/register', { email: e, password: 'gizli-sifre-123' })));
    assert.ok(kayitlar.every(r => r.status === 200), 'tüm kayıtlar kabul edildi');
    const kutu = db.kvJson('dev:outbox', []);
    const dalga = await Promise.all(epostalar.map(async e => {
      const m = kutu.find(x => x.to === e);
      const t = /[?&]verify=([a-f0-9]+)/.exec(m ? m.text : '');
      const v = await call('POST', '/api/account/verify', { token: t && t[1], password: 'gizli-sifre-123' });
      return { token: v.body && v.body.token, pid: v.body && v.body.playerId };
    }));
    assert.ok(dalga.every(x => x.token), 'tüm doğrulamalar tamamlandı');
    const e1 = kapi.publicSummary();
    assert.equal(e1.citizens, e0.citizens, 'sınır doluyken yeni vatandaş eklenmedi');
    assert.equal(e1.waiting - e0.waiting, 20, '20 kişi sıraya girdi');
    const pozlar = await Promise.all(dalga.map(async x => (await call('GET', '/api/state', undefined, x.token)).body.gate.position));
    assert.equal(new Set(pozlar).size, 20, 'her adayın sırası benzersiz: ' + pozlar.join(','));
    const durumlar = await Promise.all(dalga.slice(0, 5).map(x => call('POST', '/api/action', { name: 'startExpedition', args: ['wheat'] }, x.token)));
    assert.ok(durumlar.every(r => r.status === 403), 'sıradaki aday oyun eylemi yapamaz (403)');
    ok('Kayıt dalgası: 20 eşzamanlı kayıt sınır doluyken hepsi sırada, sıra numaraları benzersiz, sıradakiler eylem yapamıyor');
  }

  // 7) Eşzamanlı çift harcama + kilitli bakiyeyle çekim + UBI tekrarı
  {
    engine.mutatePlayer(A.pid, gs => { gs.state.adAstraBalance = 60; gs.state.lockedAda = 0; });   // yalnız 1 asker (50 ASTRA) alacak kadar
    const yaris = await Promise.all(Array.from({ length: 10 }, () => call('POST', '/api/action', { name: 'buySoldierUnit', args: [] }, A.token)));
    const basarili = yaris.filter(r => r.status === 200 && r.body.result && r.body.result.success !== false).length;
    assert.equal(basarili, 1, `10 eşzamanlı satın alma: yalnız biri geçmeli (${basarili})`);
    const st = engine.readPlayer(A.pid);
    assert.ok(st.adAstraBalance >= 0 && st.adAstraBalance < 20, 'bakiye eksiye düşmedi, yalnız bir asker bedeli düştü: ' + st.adAstraBalance);
    assert.equal(st.soldierUnits.length, 1, 'tam bir asker alındı');
    // kilitli bakiyeyle çekim
    engine.mutatePlayer(B.pid, gs => { gs.state.adAstraBalance = 5000; gs.state.lockedAda = 5000; });
    const cek = world.requestWithdraw(B.pid, 1000);
    assert.equal(cek.success, false); assert.match(cek.message, /serbest/, 'tamamen kilitli bakiyeyle çekim talebi serbest bakiye gerekçesiyle reddedilir');
    engine.mutatePlayer(B.pid, gs => { gs.state.lockedAda = 2000; });
    assert.equal(world.requestWithdraw(B.pid, 3500).success, false, 'serbest ~3000: 3500 istenemez');
    const serbest = engine.readPlayer(B.pid);
    const cek3000 = world.requestWithdraw(B.pid, 2500);
    assert.equal(cek3000.success, true, JSON.stringify(cek3000));
    const talep = engine.readPlayer(B.pid);
    assert.equal(talep.pendingWithdrawAda, 2500); assert.equal(talep.adAstraBalance, serbest.adAstraBalance - 2500);
    assert.equal(world.requestWithdraw(B.pid, 1000).success, false, 'ikinci talep: kalan serbest bakiye en az çekim tutarının altında');
    assert.equal(world.cancelWithdraw(B.pid).success, true);
    assert.equal(engine.readPlayer(B.pid).adAstraBalance, serbest.adAstraBalance, 'iptal bakiyeyi kuruşu kuruşuna geri verir');
    // UBI tekrarı
    engine.mutatePlayer(C.pid, gs => { gs.state.level = 5; gs.state.lastClaimedUbiEpoch = 0; gs.state.adAstraBalance = 0; });
    engine.globalPool.state.ubiClaimPot = 5000; engine.globalPool.state.ubiClaimPotAtOpen = 5000;
    const u1 = (await call('POST', '/api/action', { name: 'claimWeeklyUbi', args: [] }, C.token)).body.result;
    const u2 = (await call('POST', '/api/action', { name: 'claimWeeklyUbi', args: [] }, C.token)).body.result;
    assert.equal(u1.success, true); assert.equal(u2.success, false, 'aynı hafta ikinci temel gelir talebi reddedilir');
    ok('Sömürü: 10 eşzamanlı satın alma tek geçer (bakiye eksiye düşmez); kilitli bakiyeyle çekim reddedilir; çekim iptali kuruşu kuruşuna iade; temel gelir haftada bir');
  }

  await saglik();
  console.log(`\n${passed} kötüye kullanım kontrolü geçti.`);
} finally {
  server.close();
}
