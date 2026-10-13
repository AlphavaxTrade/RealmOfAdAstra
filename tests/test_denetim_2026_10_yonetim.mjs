// Denetim 2026-10 ikinci tur: yönetici uçları
//   1) POST /api/admin/payouts/resolve — belirsiz ("sending") ödeme satırını yönetici çözer (gönderildi / yeniden sıraya)
//   2) POST /api/admin/kapi/ip         — istemci adresi kotası: günlük sınır ve adres/oyuncu muafiyeti (aynı NAT arkasında çok deneme kullanıcısı)
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

let toplam = 0;
const ok = ad => { toplam++; console.log(`✅ ${ad}`); };
const sessiz = { log() {}, warn() {}, error() {} };
const ADMIN = 'yonetici-test-anahtari-uzun-1234567890';
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: ADMIN, serveDist: false, trustProxy: true, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000 };
let now = Date.UTC(2026, 9, 14, 12);
const clock = () => now;
const HASH = n => '0x' + n.toString(16).padStart(64, '0');
const PAROLA = 'gizli-sifre-123';

// ── Sahte zincir: yalnız checkPayout cevabı kontrol edilir ──
const zincirSonuc = new Map();                        // hash → 'sent' | 'failed' | 'waiting'
const sorgular = [];
const chain = {
  canSend: true, vaultEnabled: false, gameWallet: '0x' + 'ee'.repeat(20),
  async checkPayout(a) { sorgular.push(a); return zincirSonuc.get(a.hash) || 'waiting'; }
};

async function kur(zincir) {
  const db = openDb(':memory:');
  const engine = await createEngine(db, { testMode: true });
  const mailer = createMailer({ db, cfg, log: sessiz });
  const accounts = createAccounts({ db, cfg, mailer, clock, verifyMessage: () => '0x0' });
  const kapi = createKapi({ db, engine, accounts, mailer, cfg, clock, log: sessiz });
  const pazar = createPazar({ db, engine, clock, log: sessiz });
  const world = createWorld({ db, engine, chain: zincir, accounts, mailer, kapi, pazar, cfg, clock, log: sessiz });
  const app = createApp({ db, engine, world, accounts, kapi, pazar, chain: zincir, cfg, clock, log: sessiz });
  const server = app.server().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, { ip, token = ADMIN } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(ip ? { 'X-Forwarded-For': ip } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  return { db, engine, kapi, server, call };
}

// ═══ 1) Belirsiz ödeme satırının çözümü ═══
{
  const t = await kur(chain);
  const { db, call } = t;
  try {
    const A = '0x' + '11'.repeat(20);
    let n = 0;
    // Belirsiz satır: imzalanmış ama sonucu bilinmiyor ('sending' + tx_hash)
    const belirsiz = (kind = 'withdraw', tx = true) => {
      const id = Number(db.q.payoutAdd.run(1, kind, A, 25, now).lastInsertRowid);
      if (tx) db.q.payoutSigned.run(HASH(++n + 1000), '0x01', n, id);
      else db.q.payoutMark.run('sending', null, null, now, id);
      db.q.payoutSetStatus.run('sending', 'Onay bekleniyor: bağlantı koptu', id);
      return id;
    };
    const satir = id => db.q.payoutGet.get(id);
    const olay = () => db.raw.prepare("SELECT address, data FROM events WHERE type = 'payout-resolve' ORDER BY id DESC").all();
    const gerekce = 'Gezginde işlemi kontrol ettim, durum ortada';

    // Yetki + durum listesi
    const s1 = belirsiz();
    assert.equal((await call('POST', '/api/admin/payouts/resolve', { id: s1, durum: 'sent', gerekce }, { token: '' })).status, 401, 'yönetici şifresiz çözülmez');
    assert.equal((await call('POST', '/api/admin/payouts/resolve', { id: s1, durum: 'sent', gerekce }, { token: 'yanlis-yonetici-anahtari-1234567890' })).status, 401);
    const durum = await call('GET', '/api/admin/status');
    assert.ok(durum.body.payoutsBelirsiz.some(p => p.id === s1 && p.tx_hash === HASH(1001)), 'belirsiz satır yönetici durumunda listelenir');
    assert.equal(satir(s1).status, 'sending', 'yetkisiz çağrı satırı değiştirmedi');

    // Geçersiz girdiler
    const r = (body) => call('POST', '/api/admin/payouts/resolve', body);
    assert.equal((await r({ id: s1, durum: 'sent' })).status, 400, 'gerekçe zorunlu');
    assert.equal((await r({ id: s1, durum: 'sent', gerekce: 'kısa' })).status, 400, 'çok kısa gerekçe');
    assert.equal((await r({ id: s1, durum: 'sent', gerekce: 'x'.repeat(501) })).status, 400, 'çok uzun gerekçe');
    assert.equal((await r({ id: s1, durum: 'bitti', gerekce })).status, 400, 'bilinmeyen durum');
    assert.equal((await r({ id: 'abc', durum: 'sent', gerekce })).status, 400);
    assert.equal((await r({ id: s1, durum: 'sent', txHash: '0x123', gerekce })).status, 400, 'bozuk işlem numarası');
    assert.equal((await r({ id: s1, durum: 'pending', txHash: HASH(5), gerekce })).status, 400, "pending'de işlem numarası verilmez");
    assert.equal((await r({ id: 99999, durum: 'sent', gerekce })).status, 404);
    assert.equal(satir(s1).status, 'sending');
    assert.equal(olay().length, 0, 'reddedilen çağrılar olay yazmadı');
    // Zaten sonuçlanmış satır çözülmez
    const bitmis = Number(db.q.payoutAdd.run(1, 'withdraw', A, 10, now).lastInsertRowid);
    db.q.payoutMark.run('sent', HASH(7777), null, now, bitmis);
    const bitmisSonuc = await r({ id: bitmis, durum: 'pending', gerekce });
    assert.equal(bitmisSonuc.status, 409); assert.match(bitmisSonuc.body.error, /sending/);
    assert.equal(satir(bitmis).status, 'sent', 'gönderilmiş satır geri sıraya alınamaz (çift ödeme)');
    ok('Belirsiz ödeme: yetki, girdi doğrulaması ve "yalnız sending" kuralı; reddedilen çağrı hiçbir şey yazmaz');

    // 'sent': zincir hâlâ belirsiz, yönetici gezginde gördü
    const g = await r({ id: s1, durum: 'sent', gerekce });
    assert.equal(g.status, 200, JSON.stringify(g.body));
    assert.deepEqual({ id: g.body.id, durum: g.body.durum, txHash: g.body.txHash }, { id: s1, durum: 'sent', txHash: HASH(1001) }, 'satırdaki kayıtlı işlem numarası kullanıldı');
    assert.equal(satir(s1).status, 'sent'); assert.equal(satir(s1).error, null); assert.ok(satir(s1).sent_at);
    const o1 = olay()[0];
    assert.equal(o1.address, A);
    assert.deepEqual(JSON.parse(o1.data), { id: s1, kind: 'withdraw', amount: 25, durum: 'sent', txHash: HASH(1001), oncekiHash: HASH(1001), oncekiHata: 'Onay bekleniyor: bağlantı koptu', zincir: 'waiting', gerekce });
    // Çift kullanım: aynı çözüm ikinci kez uygulanamaz
    const tekrar = await r({ id: s1, durum: 'sent', gerekce });
    assert.equal(tekrar.status, 409);
    assert.equal(olay().length, 1, 'ikinci çağrı olay yazmadı');
    ok("Belirsiz ödeme 'sent': kayıtlı işlem numarasıyla çözülür, olay günlüğüne gerekçeyle yazılır, ikinci çağrı 409");

    // 'pending': zincir de belirsiz → yeniden sıraya (işlem numarası silinir, hata nedenle dolar)
    const s2 = belirsiz();
    const p = await r({ id: s2, durum: 'pending', gerekce: 'Gezginde işlem hiç görünmüyor, nonce boşta' });
    assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.equal(satir(s2).status, 'pending'); assert.equal(satir(s2).tx_hash, null); assert.equal(satir(s2).sent_at, null);
    assert.match(satir(s2).error, /Yönetici yeniden sıraya aldı: Gezginde işlem hiç görünmüyor/);
    assert.ok(db.q.payoutsPending.all().some(x => x.id === s2), 'gönderim kuyruğuna döndü');
    assert.equal((await r({ id: s2, durum: 'pending', gerekce })).status, 409, "pending'e alınan satır tekrar 'pending'e alınamaz");
    ok("Belirsiz ödeme 'pending': kuyruğa döner, eski işlem numarası temizlenir, ikinci çağrı 409");

    // Zincir kanıtı yönetici kararıyla çelişirse reddedilir
    const s3 = belirsiz();
    zincirSonuc.set(satir(s3).tx_hash, 'sent');
    const cift = await r({ id: s3, durum: 'pending', gerekce });
    assert.equal(cift.status, 409); assert.match(cift.body.error, /ÇİFT ÖDEME/);
    assert.equal(satir(s3).status, 'sending', 'zincir "gitti" diyorsa yeniden sıraya alınmaz');
    assert.equal((await r({ id: s3, durum: 'sent', gerekce })).status, 200, "aynı satır 'sent' olarak çözülebilir");
    const s4 = belirsiz();
    zincirSonuc.set(satir(s4).tx_hash, 'failed');
    const yok = await r({ id: s4, durum: 'sent', gerekce });
    assert.equal(yok.status, 409); assert.match(yok.body.error, /işlenmediğini/);
    const baskaIslem = await r({ id: s4, durum: 'sent', txHash: HASH(424242), gerekce: 'Aynı tutarı elle başka işlemle ödedim, gezgin linki kontrol edildi' });
    assert.equal(baskaIslem.status, 200, 'başka bir işlemle elle ödendiyse numarası verilerek kapatılır');
    assert.equal(satir(s4).tx_hash, HASH(424242));
    ok('Zincirin kesin kanıtı yönetici kararıyla çelişirse reddedilir (çift ödeme / yanlış "gönderildi")');

    // İşlem kaydı olmayan satır: gönderildi demek için numara şart; aynı numara iki satıra yazılamaz
    const s5 = belirsiz('burn', false);
    assert.equal((await r({ id: s5, durum: 'sent', gerekce })).status, 400, 'imza kaydı yok: işlem numarası şart');
    const s5b = await r({ id: s5, durum: 'sent', txHash: HASH(424242), gerekce });
    assert.equal(s5b.status, 409); assert.match(s5b.body.error, /başka bir ödeme satırına/);
    assert.equal((await r({ id: s5, durum: 'sent', txHash: HASH(31337), gerekce })).status, 200);
    const s6 = belirsiz('creator', false);
    assert.equal((await r({ id: s6, durum: 'pending', gerekce })).status, 200, 'imza kaydı olmayan satır yeniden sıraya alınabilir');
    assert.ok(!sorgular.some(q => !q.hash), 'kayıtsız satır için zincire sorulmadı');
    ok('İşlem kaydı olmayan satır: numara şart, aynı numara iki satıra yazılamaz');

    // Eşzamanlı iki çözüm: biri geçer, biri 409
    const s7 = belirsiz();
    const [a, b] = await Promise.all([r({ id: s7, durum: 'sent', gerekce }), r({ id: s7, durum: 'pending', gerekce })]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], 'eşzamanlı iki çözümden yalnız biri uygulanır: ' + [a.status, b.status]);
    assert.ok(['sent', 'pending'].includes(satir(s7).status));
    ok('Eşzamanlı çözümler: tek uygulama (çift kullanım güvenli)');
  } finally { t.server.close(); }
}

// ═══ 2) Adres kotası: günlük sınır ve muafiyet ═══
{
  const t = await kur(null);
  const { db, kapi, call } = t;
  try {
    const posta = (tur, kime) => {
      for (const m of db.kvJson('dev:outbox', [])) {
        if (m.to !== kime) continue;
        for (const x of String(m.text).matchAll(/[?&](verify)=([a-f0-9]{48})/g)) return x[2];
      }
      return null;
    };
    const hesap = async (email, ip) => {
      assert.equal((await call('POST', '/api/account/register', { email, password: PAROLA }, { ip, token: '' })).status, 200);
      const v = await call('POST', '/api/account/verify', { token: posta('verify', email), password: PAROLA }, { ip, token: '' });
      assert.equal(v.status, 200, JSON.stringify(v.body));
      return 'acc:' + db.raw.prepare('SELECT id FROM accounts WHERE email = ?').get(email).id;
    };
    const kapiDurum = pid => db.raw.prepare('SELECT gate FROM players WHERE address = ?').get(pid).gate;
    const davetli = pid => !!db.kvJson('world:kapi:davet', {})[pid];
    const A = '203.0.113.7', B = '198.51.100.20', C = '192.0.2.40';
    const ipApi = body => call('POST', '/api/admin/kapi/ip', body);

    // Yetki ve doğrulama
    assert.equal((await call('POST', '/api/admin/kapi/ip', { dailyAdmit: 5 }, { token: '' })).status, 401);
    assert.equal((await ipApi({})).status, 400, 'değişecek bir şey yok');
    assert.equal((await ipApi({ dailyAdmit: -1 })).status, 400);
    assert.equal((await ipApi({ dailyAdmit: 5000 })).status, 400);
    assert.equal((await ipApi({ dailyAdmit: 'çok' })).status, 400);
    assert.equal((await ipApi({ ip: '127.0.0.1' })).status, 400, 'yerel adres zaten muaf');
    assert.equal((await ipApi({ ip: 'adres degil' })).status, 400);
    assert.equal((await ipApi({ playerId: 'acc:99999' })).status, 400, 'bilinmeyen oyuncu');
    assert.equal((await ipApi({ muaf: true })).status, 400, 'muafiyet için hedef şart');
    ok('Adres kotası ucu: yetki ve girdi doğrulaması');

    // Aynı adresten 3 vatandaş, 4.sü sırada
    const hepsi = [];
    for (let i = 0; i < 4; i++) hepsi.push(await hesap(`nat-a${i}@ornek.com`, A));
    assert.deepEqual(hepsi.map(kapiDurum), ['citizen', 'citizen', 'citizen', 'waiting'], 'varsayılan kota 3');
    // Günlük sınırı yönetici yükseltir: bekleyen davet edilir (kota gevşedi)
    const s = await ipApi({ dailyAdmit: 10 });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.dailyAdmit, 10); assert.equal(s.body.varsayilan, 3);
    assert.ok(s.body.davetGonderilen >= 1 && davetli(hepsi[3]), 'kotası gevşeyen bekleyen adaya davet gitti');
    const bes = await hesap('nat-a4@ornek.com', A);
    assert.equal(kapiDurum(bes), 'citizen', 'yükseltilen sınırla aynı adresten yeni kayıt vatandaş olur');
    assert.equal(kapi.adminSummary().ipKota.dailyAdmit, 10, 'yönetici özeti güncel sınırı gösterir');
    // 0 = sınırsız, sonra geri 1
    await ipApi({ dailyAdmit: 1 });
    assert.equal(kapiDurum(await hesap('nat-a5@ornek.com', A)), 'waiting', 'sınır 1: bu adresten bugün çok kabul edilmiş, yeni kayıt sırada');
    await ipApi({ dailyAdmit: 0 });
    assert.equal(kapiDurum(await hesap('nat-a6@ornek.com', A)), 'citizen', '0 = sınırsız');
    await ipApi({ dailyAdmit: 3 });
    ok('Günlük kabul sınırı yönetici panelinden değişir (yükseltilince bekleyen davet edilir; 0 sınırsız)');

    // Adres muafiyeti (ham IP ile): sınır 3 iken tüm ekip girer
    for (let i = 0; i < 3; i++) await hesap(`nat-b${i}@ornek.com`, B);
    const b3 = await hesap('nat-b3@ornek.com', B);
    assert.equal(kapiDurum(b3), 'waiting');
    const m = await ipApi({ ip: B, muaf: true });
    assert.equal(m.status, 200, JSON.stringify(m.body));
    assert.equal(m.body.muafAdet, 1); assert.ok(davetli(b3), 'muafiyetle sıradaki aday davet edildi');
    for (let i = 4; i < 7; i++) assert.equal(kapiDurum(await hesap(`nat-b${i}@ornek.com`, B)), 'citizen', 'muaf adresten sınırsız kabul');
    assert.equal(kapiDurum(await hesap('nat-c0@ornek.com', C)), 'citizen', 'diğer adres etkilenmedi (kendi kotası)');
    // Ham adres hiçbir yere yazılmadı
    const tum = JSON.stringify([db.raw.prepare('SELECT * FROM kv').all(), db.raw.prepare('SELECT * FROM events').all(), db.raw.prepare('SELECT kayit_ip FROM players').all()]);
    for (const ham of [A, B, C]) assert.ok(!tum.includes(ham), 'ham adres saklanmadı: ' + ham);
    // Muafiyeti kaldır: sınır yine geçerli
    const k = await ipApi({ ip: B, muaf: false });
    assert.equal(k.status, 200); assert.equal(k.body.muafAdet, 0);
    assert.equal(kapiDurum(await hesap('nat-b7@ornek.com', B)), 'waiting', 'muafiyet kalkınca kota yine uygulanır');
    ok('Muafiyet: ham adresle verilir/kaldırılır, kota yalnız o adreste gevşer, ham adres hiçbir yere yazılmaz');

    // Oyuncu üzerinden muafiyet (kayıt adresi bilinmeden)
    for (let i = 0; i < 3; i++) await hesap(`nat-d${i}@ornek.com`, '192.0.2.77');
    const d3 = await hesap('nat-d3@ornek.com', '192.0.2.77');
    assert.equal(kapiDurum(d3), 'waiting');
    const po = await ipApi({ playerId: d3, muaf: true });
    assert.equal(po.status, 200, JSON.stringify(po.body));
    assert.equal(kapiDurum(await hesap('nat-d4@ornek.com', '192.0.2.77')), 'citizen', "oyuncunun kayıt adresi muaf: aynı adresten yenileri girer");
    assert.equal((await ipApi({ playerId: d3, muaf: false })).body.muafAdet, 0);
    // Aynı muafiyeti iki kez vermek listeyi şişirmez
    await ipApi({ ip: C, muaf: true }); const iki = await ipApi({ ip: C, muaf: true });
    assert.equal(iki.body.muafAdet, 1, 'aynı adres iki kez eklenmez');
    // Liste sınırlıdır (yanlışlıkla ya da kötü niyetle şişirilemez)
    db.kvSetJson('world:kapi:ip-muaf', Array.from({ length: 200 }, (_, i) => 'ozet' + i));
    const dolu = await ipApi({ ip: '203.0.113.99', muaf: true });
    assert.equal(dolu.status, 400); assert.match(dolu.body.error, /dolu/);
    ok('Muafiyet oyuncu kimliğiyle de verilir; tekrar eklenmez; liste 200 ile sınırlı');
  } finally { t.server.close(); }
}

console.log(`\n${toplam} yönetici ucu kontrolü geçti.`);
process.exit(0);
