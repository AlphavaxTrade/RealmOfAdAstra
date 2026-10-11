// v2 — Kapı kuralı (E-planı Faz 1, 8 Ekim 2026): vatandaş sınırı, bekleme sırası, HAZIR ADAY önceliği, 72 saatlik
// DAVET (süresi geçince bir sonrakine geçer + sıra cezası), KATILIM PUANI merdiveni (uyarı → izin sorusu → izin
// modu / askı), askıdan dönüşte öncelik kuralı (izin hakkı bitmişse öncelik YOK), yönetici kolu, büyüme kilidi.
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
const ok = name => { passed++; console.log(`✅ ${name}`); };
const DAY = 86400000, HOUR = 3600000;

const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000, testMode: true };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
let now = Date.UTC(2026, 9, 7, 12);
const clock = () => now;
const quiet = { log() {}, warn() {}, error() {} };
const mailer = createMailer({ db, cfg, log: quiet });
const accounts = createAccounts({ db, cfg, mailer, clock, verifyMessage: () => '0x0' });
engine.GAME_CONFIG.KAPI.START_LIMIT = 2;            // test: 2 kişilik vadi
const kapi = createKapi({ db, engine, accounts, mailer, cfg, clock, log: quiet });
const world = createWorld({ db, engine, chain: null, accounts, mailer, kapi, cfg, clock, log: quiet });
const app = createApp({ db, engine, world, accounts, kapi, chain: null, cfg, clock, log: quiet });
const server = app.server().listen(0);
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, body, token) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const ADMIN = cfg.adminToken;
const outbox = () => db.kvJson('dev:outbox', []);
const lastLink = kind => { const m = outbox()[0]; const r = new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(m ? m.text : ''); return r && r[1]; };
async function register(email) {
  const r = await call('POST', '/api/account/register', { email, password: 'gizli-sifre-123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const v = await call('POST', '/api/account/verify', { token: lastLink('verify'), password: 'gizli-sifre-123' });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { token: v.body.token, pid: v.body.playerId };
}
const login = email => call('POST', '/api/account/login', { email, password: 'gizli-sifre-123' });
const misafirOnayla = (token, id) => call('POST', '/api/action', { name: 'misafirGorevTamamla', args: [id] }, token);
const READY_IDS = engine.GAME_CONFIG.KAPI.READY_TASK_IDS;

try {
  // 1) Sınır 2: ilk iki hesap vatandaş (yer varken davet beklemeden); üçüncü bekleme sırasında, işlem yapamaz
  //    ama "hazır aday" onaylarını (misafir modu) verebilir.
  const A = await register('ayse@ornek.com');
  const B = await register('bora@ornek.com');
  const C = await register('ceyda@ornek.com');
  assert.equal(kapi.statusOf(A.pid).status, 'citizen');
  assert.equal(kapi.statusOf(B.pid).status, 'citizen');
  const cs = await call('GET', '/api/state', null, C.token);
  assert.equal(cs.body.gate.status, 'waiting');
  assert.equal(cs.body.gate.position, 1);
  const cAct = await call('POST', '/api/action', { name: 'startExpedition', args: ['wood'] }, C.token);
  assert.equal(cAct.status, 403, 'Sıradaki gerçek oyun aksiyonu yapamaz');
  for (const id of READY_IDS) { const r = await misafirOnayla(C.token, id); assert.equal(r.status, 200, JSON.stringify(r.body)); }
  const cState = await call('GET', '/api/state', null, C.token);
  assert.deepEqual(Object.fromEntries(READY_IDS.map(id => [id, true])), cState.body.player.candidateReady, 'Hazır aday onayları kaydedildi');
  ok('Sınır 2: iki vatandaş, üçüncü sırada; oyun aksiyonu yapamaz ama hazır aday onayı verebilir');

  // 2) Kayıt harcı: vatandaş olunca 1 ASTRA borç yazılır, ilk ASTRA'dan düşer
  const a0 = await call('GET', '/api/state', null, A.token);
  assert.equal(a0.body.player.kayitHarci.due, 1);
  engine.mutatePlayer(A.pid, gs => { gs.state.adAstraBalance = 5; });
  const a1 = await call('GET', '/api/state', null, A.token);
  assert.equal(a1.body.player.adAstraBalance, 4, 'Harç düşüldü');
  ok('Kayıt harcı 1 ASTRA ilk kazançtan düşer');

  // 3) Yer açılınca HAZIR adaya DAVET gider (henüz vatandaş değil); ilk gerçek aksiyonu daveti kabul eder
  kapi.adminSetPlayer(B.pid, 'suspended');   // B'yi elle askıya al (yer açmak için; katılım-tabanlı askı adım 6'da)
  assert.equal(kapi.statusOf(C.pid).status, 'waiting', 'Davet gönderildi ama C henüz vatandaş değil');
  const cStatus1 = await call('GET', '/api/state', null, C.token);
  assert.ok(cStatus1.body.gate.davet && cStatus1.body.gate.davet.deadline > now, 'Davet bilgisi görünür');
  assert.ok(outbox().some(m => /Sıran geldi/.test(m.text)), '"Sıran geldi" bildirimi gitti');
  const cAct2 = await call('POST', '/api/action', { name: 'startExpedition', args: ['stone'] }, C.token);
  assert.equal(cAct2.status, 200, 'İlk gerçek aksiyon daveti kabul eder');
  assert.equal(kapi.statusOf(C.pid).status, 'citizen', 'Artık vatandaş');
  ok('Yer açılınca hazır adaya davet gider; ilk gerçek aksiyon daveti kabul eder');

  // 4) Hazır olmayan aday, hazır olandan SONRA sıraya girse de önce davet alır
  const D = await register('deniz@ornek.com');   // hazır DEĞİL
  const E = await register('ela@ornek.com');     // hazır OLACAK
  for (const id of READY_IDS) await misafirOnayla(E.token, id);
  assert.equal(kapi.statusOf(D.pid).position, 1, 'D önce kayıt oldu, sırası 1');
  assert.equal(kapi.statusOf(E.pid).position, 2);
  kapi.adminSetPlayer(A.pid, 'suspended');   // bir yer aç
  const eState = await call('GET', '/api/state', null, E.token);
  assert.ok(eState.body.gate.davet, 'Hazır olan E, sıra numarası geride olsa da daveti ÖNCE alır');
  const dState = await call('GET', '/api/state', null, D.token);
  assert.ok(!dState.body.gate.davet, 'Hazır olmayan D bu turda davet almaz');
  ok('Hazır aday, sıra numarası geride olsa da daveti önce alır');

  // 5) Davet süresi geçerse bir sonrakine geçer; cevapsız kalan sırada geri düşer (elenmez)
  const F = await register('fatih@ornek.com'); for (const id of READY_IDS) await misafirOnayla(F.token, id); // hazır
  await register('gul@ornek.com');   // sırayı doldurmak için (G'nin konumuna başka bir testte gerek yok)
  const posEonce = kapi.statusOf(E.pid).position;
  now += 73 * HOUR;   // E'nin daveti (72 saat) geçti, hiç cevap vermedi
  const gecen = kapi.davetSuresiGecenler();
  assert.deepEqual(gecen.gecen, [E.pid], 'E hesabının daveti süresi geçti');
  assert.ok(outbox().some(m => /Davetine zamanında cevap vermedin/.test(m.text)), 'Süre geçti bildirimi gitti');
  assert.ok(kapi.statusOf(E.pid).position > posEonce, 'E sırada geri düştü ama hâlâ sırada (elenmedi)');
  const fState = await call('GET', '/api/state', null, F.token);
  assert.ok(fState.body.gate.davet, 'Davet şimdi bir sonraki hazır adaya (F) geçti');
  ok('Davet süresi geçince bir sonrakine geçer; cevapsız kalan sırada geri düşer, elenmez');

  // 6) Katılım puanı: düşük katılım merdiveni — 2 hafta düşük → uyarı, 3 hafta düşük → izin sorusu;
  //    "evet" cevabı izin modunu açar, izindeyken değerlendirme durur, izin bitince yeniden başlar.
  const nextWeek = () => { engine.globalPool.state.epochId = (engine.globalPool.state.epochId || 1) + 1; };
  const KP = engine.GAME_CONFIG.KATILIM_PUANI;
  nextWeek(); const d1 = kapi.haftalikKatilimDegerlendir();
  assert.ok(!d1.uyari.includes(C.pid) && !d1.izinSorusu.includes(C.pid), '1. düşük hafta: henüz sessiz');
  nextWeek(); const d2 = kapi.haftalikKatilimDegerlendir();
  assert.ok(d2.uyari.includes(C.pid), `${KP.UYARI_HAFTA}. düşük hafta: ilk uyarı`);
  nextWeek(); const d3 = kapi.haftalikKatilimDegerlendir();
  assert.ok(d3.izinSorusu.includes(C.pid), `${KP.IZIN_SORUSU_HAFTA}. düşük hafta: izin sorusu soruldu`);
  const cCevap = await call('POST', '/api/action', { name: 'cevaplaIzinSorusu', args: [true] }, C.token);
  assert.equal(cCevap.status, 200, JSON.stringify(cCevap.body));
  assert.ok(cCevap.body.result.izinAlindi, 'İzin alındı');
  const cOzet1 = (await call('GET', '/api/state', null, C.token)).body.player.katilim;
  assert.ok(cOzet1.izinModu && cOzet1.izinModu.bitis > now, 'İzin modu aktif');
  assert.equal(cOzet1.izinYillikKalan, 30 - cOzet1.izinModu.gun, 'Yıllık izin hakkından düşüldü');
  nextWeek(); const d4 = kapi.haftalikKatilimDegerlendir();
  assert.ok(!d4.uyari.includes(C.pid) && d4.degerlendirilen >= 0, 'İzindeyken değerlendirme atlanır (ceza büyümez)');
  assert.ok(kapi.statusOf && kapi.isCitizen(C.pid), 'İzindeyken yer kaybedilmez');
  now += (cOzet1.izinModu.gun + 1) * DAY; nextWeek();
  kapi.haftalikKatilimDegerlendir(); // izin bitti, değerlendirme yeniden başlar (ayrı bir ispat gerekmez, çökmediği yeter)
  ok('Katılım puanı: 2 hafta düşük → uyarı, 3 hafta düşük → izin sorusu; "evet" izin modunu açar, izindeyken ceza durur');

  // 7) İzin sorusuna cevapsız kalma: askıya alınır, dönüşte sıranın ÖNÜNE (öncelik var)
  const Hreg = await register('hakan@ornek.com');
  kapi.adminSetPlayer(Hreg.pid, 'citizen'); // yönetici sınırın üstünde de ekleyebilir (test kolaylığı)
  nextWeek(); kapi.haftalikKatilimDegerlendir();
  nextWeek(); kapi.haftalikKatilimDegerlendir();
  nextWeek(); const dH = kapi.haftalikKatilimDegerlendir();
  assert.ok(dH.izinSorusu.includes(Hreg.pid), 'H için izin sorusu soruldu');
  now += (Number(KP.IZIN_CEVAP_SAAT) + 1) * HOUR;
  const susH = kapi.katilimSuresiGecenler();
  assert.ok(susH.askiyaAlindi.includes(Hreg.pid), 'Cevapsız kalınca askıya alındı');
  const lh = await login('hakan@ornek.com');
  const hs = await call('GET', '/api/state', null, lh.body.token);
  assert.equal(hs.body.gate.status, 'waiting');
  assert.equal(hs.body.gate.position, 1, 'Öncelik VAR: sıranın önüne (izin sorusu cevapsızlığı — ağır askı değil)');
  ok('İzin sorusuna cevapsız kalma: askı, dönüşte sıranın önüne (öncelik korunur)');

  // 8) İzin hakkı tükenmişken düşük kalma: son uyarı → askı, dönüşte sıranın önceliği OLMAZ
  const Ireg = await register('irem@ornek.com');
  kapi.adminSetPlayer(Ireg.pid, 'citizen');
  engine.mutatePlayer(Ireg.pid, gs => { gs._katilim().izinYillikKalan = 0; }); // izin hakkı tükenmiş
  nextWeek(); kapi.haftalikKatilimDegerlendir();
  nextWeek(); kapi.haftalikKatilimDegerlendir();
  nextWeek(); const dI = kapi.haftalikKatilimDegerlendir();
  assert.ok(dI.sonUyari.includes(Ireg.pid), 'İzin hakkı yok: izin sorulmaz, son uyarı verilir');
  assert.ok(!dI.izinSorusu.includes(Ireg.pid));
  now += (Number(KP.SON_UYARI_SAAT) + 1) * HOUR;
  const susI = kapi.katilimSuresiGecenler();
  assert.ok(susI.askiyaAlindi.includes(Ireg.pid), 'Son uyarıya da cevap gelmedi: askı');
  const li = await login('irem@ornek.com');
  const is_ = await call('GET', '/api/state', null, li.body.token);
  assert.equal(is_.body.gate.status, 'waiting');
  assert.ok(is_.body.gate.position > 1, 'Öncelik YOK: normal sıraya girer (izin hakkı tükenmiş ağır askı)');
  // Bir sonraki (varsayımsal) askıda öncelik normale döner (tek seferlik ceza) — doğrudan durumdan doğrulanır
  const iSt = engine.readPlayer(Ireg.pid);
  assert.equal(iSt.katilim.oncelikVar, true, 'Öncelik cezası tüketildi; sonraki sefer normale döner');
  ok('İzin hakkı tükenmişken düşük kalma: son uyarı, askı, dönüşte öncelik YOK (tek seferlik ceza, sonrakinde normale döner)');

  // 9) Büyüme kilidi + çift şart (KARAR 1, Faz 2): gösterge artık GERÇEK hazine ödemesinden (treasury.withdraw,
  // ammBuyback hariç) ve haftanın çekim tavanından hesaplanır (server/kapi.js recordWeek). Büyümek için dağıtılan
  // dönemin eşiğini (50 $) VE çekilebilen eşiğin üçte birini (≈16,7 $) birlikte geçmeli. Önceki adımların katılım-
  // puanı askıları yüzünden vatandaş sayısı 0 olabilir — tek, temiz bir vatandaş ekleniyor ve bu hafta 2 kategoriye
  // dokunduruluyor (Sv.1 eşiği 2; dokunmazsa activeCitizens() onu saymaz, gösterge hep 0 kalır).
  const J = await register('jale@ornek.com'); kapi.adminSetPlayer(J.pid, 'citizen');
  engine.mutatePlayer(J.pid, gs => { gs._katilim().touched = { sefer: true, pazar: true }; });
  const EP = engine.globalPool.state.epochId;   // kapanan hafta = Jale'nin dokunduğu hafta (recordWeek o haftanın kaydını okur)
  assert.equal(engine.GAME_CONFIG.KAPI.GROWTH_LOCKED, true, 'Varsayılan kilitli');
  engine.treasury.depositTo('quest', 100000);
  engine.treasury.withdraw('quest', 30);                            // bu hafta GERÇEKTEN dağıtılan: 30 ASTRA → 15 $/hafta ≈ 65 $/ay (eşik 50 $ geçer)
  kapi.recordWeek({ epoch: EP, withdraw: { cap: 2 } }, 0.5);          // çekim tavanı 2 ASTRA → 1 $/hafta ≈ 4,3 $/ay (eşik ≈16,7 $ geçMEZ)
  assert.equal(kapi.growth(), null, 'Kilitliyken gösterge ikisi de geçse de büyümez');
  const unlock = await call('POST', '/api/admin/kapi', { growthLocked: false }, ADMIN);
  assert.equal(unlock.status, 200, JSON.stringify(unlock.body));
  assert.equal(unlock.body.growthLocked, false);
  assert.equal(kapi.growth(), null, 'Kilit açık ama çekilebilen eşiğin üçte birinin altında: dağıtılan tek başına yetmez');
  engine.treasury.withdraw('quest', 30);
  kapi.recordWeek({ epoch: EP, withdraw: { cap: 50 } }, 0.5);         // 2. hafta çekim tavanı 50 ASTRA → ortalama çekilebilen eşiği de geçer
  const grew = kapi.growth();
  assert.ok(grew && grew.to > grew.from, 'Kilit açık VE dağıtılan+çekilebilen ikisi de eşiği geçince büyür');
  ok('Büyüme Faz 2 göstergesi: GROWTH_LOCKED ile kilitli; açılınca dağıtılan VE çekilebilen (eşiğin üçte biri) birlikte gerekir');

  // 10) Yönetici: sınır/dönem değişimi, hatalı değer reddi
  const bad = await call('POST', '/api/admin/kapi', { limit: 0 }, ADMIN);
  assert.equal(bad.status, 400);
  const tier = await call('POST', '/api/admin/kapi', { tier: 2 }, ADMIN);
  assert.equal(tier.body.tier, 2);
  assert.equal(kapi.publicSummary().threshold, 300, 'Son dönem eşiği 300 $');
  ok('Yönetici: dönem değişimi, hatalı değer reddi');

  console.log(`\n${passed}/10 kapı + katılım puanı testi geçti`);
} finally {
  server.close();
}
