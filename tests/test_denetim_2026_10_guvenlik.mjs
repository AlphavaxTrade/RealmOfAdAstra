// 13 Ekim 2026 denetimi, güvenlik mühendisliği turu: gerileme testleri.
//   EK-02a  e-posta benzersizlik anahtarı (+etiket / gmail noktaları aynı kutu)
//   EK-02b  istemci adresi kotası (24 saatte en çok N vatandaşlık; aşan sıraya düşer)
//   A2      e-posta belirteçleri özetli, TOTP sırrı şifreli, yedek kodlar tuzlu
//   üretim doğrulaması: HESAP_ANAHTARI ve (YEDEK_KLASORU varsa) YEDEK_ANAHTAR zorunlu
// Her blok eski kodda düşer, yenide geçer (düşme nedenleri blokların başında).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig, dogrula } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts, totpCode } from '../server/accounts.js';
import { createKapi } from '../server/kapi.js';
import { createPazar } from '../server/pazar.js';
import { epostaAnahtari } from '../server/eposta.js';
import { gecisleriCalistir } from '../server/gecis/index.js';
import { GECISLER } from '../server/gecis/liste.js';
import { tokenOzeti } from '../server/oturum.js';

let toplam = 0;
const ok = (ad) => { toplam++; console.log(`✅ ${ad}`); };
const sessiz = { log() {}, warn() {}, error() {} };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ── 1) E-posta anahtarı: saf kurallar ─────────────────────────────────────────
{
  const e = epostaAnahtari;
  assert.equal(e('Ali.Veli+Oyun@GMail.com'), 'aliveli@gmail.com');
  assert.equal(e('a.l.i@googlemail.com'), 'ali@gmail.com');
  assert.equal(e('ali+1@gmail.com'), e('a.li+zz@gmail.com'));
  assert.equal(e('ali+x@ornek.com'), 'ali@ornek.com', '+etiket her alan adında atılır');
  assert.equal(e('a.li@ornek.com'), 'a.li@ornek.com', 'gmail dışında nokta anlamlıdır');
  assert.equal(e('+x@ornek.com'), '+x@ornek.com', 'etiketten önce hiçbir şey kalmıyorsa dokunulmaz');
  assert.equal(e('ali@gmail.com.'), 'ali@gmail.com', 'alan adı sonundaki nokta');
  assert.equal(e('ａｌｉ@gmail.com'), 'ali@gmail.com', 'tam genişlikli harfler (NFKC)');
  assert.notEqual(e('ali@ornek.com'), e('ali@ornek.org'));
  ok('EK-02a: e-posta anahtarı kuralları (küçük harf, +etiket, gmail noktaları, googlemail, NFKC)');
}

// ── Ortak sunucu kurulumu (vekil arkasında: X-Forwarded-For'un SON girdisi istemci adresi) ──
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: false, trustProxy: true,
  rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000 };
const db = openDb(':memory:');
const engine = await createEngine(db, { testMode: true });
let now = Date.UTC(2026, 9, 14, 12);
const clock = () => now;
const mailer = createMailer({ db, cfg, log: sessiz });
const accounts = createAccounts({ db, cfg, mailer, clock, verifyMessage: () => '0x0' });
const kapi = createKapi({ db, engine, accounts, mailer, cfg, clock, log: sessiz });
const pazar = createPazar({ db, engine, clock, log: sessiz });
const world = createWorld({ db, engine, chain: null, accounts, mailer, kapi, pazar, cfg, clock, log: sessiz });
const app = createApp({ db, engine, world, accounts, kapi, pazar, chain: null, cfg, clock, log: sessiz });
const server = app.server().listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, body, { ip, token } = {}) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(ip ? { 'X-Forwarded-For': ip } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const posta = (tur, kime = null) => {
  for (const m of db.kvJson('dev:outbox', [])) {                       // en yeni başta
    if (kime && m.to !== kime) continue;
    for (const x of String(m.text).matchAll(/[?&](verify|reset|wallet)=([a-f0-9]{48})/g)) if (x[1] === tur) return x[2];
  }
  return null;
};
const PAROLA = 'gizli-sifre-123';
const hesapSayisi = () => db.raw.prepare('SELECT COUNT(*) AS n FROM accounts').get().n;
async function kaydol(email, ip) {
  const r = await call('POST', '/api/account/register', { email, password: PAROLA }, { ip });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r;
}
async function kaydolDogrula(email, ip) {
  await kaydol(email, ip);
  const t = posta('verify', email);
  assert.ok(t, 'doğrulama bağlantısı: ' + email);
  const v = await call('POST', '/api/account/verify', { token: t, password: PAROLA }, { ip });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  const acc = db.raw.prepare('SELECT id FROM accounts WHERE email = ?').get(email);
  return 'acc:' + acc.id;
}
const kapiDurum = (pid) => db.raw.prepare('SELECT gate FROM players WHERE address = ?').get(pid).gate;

try {
  // ── 2) EK-02a: aynı posta kutusundan ikinci kayıt açılmaz, yanıt ve yan etkiler NÖTR ──
  {
    const ilk = await kaydol('ali.veli@gmail.com', '10.0.0.1');
    assert.equal(hesapSayisi(), 1);
    assert.ok(posta('verify', 'ali.veli@gmail.com'));
    db.kvSetJson('dev:outbox', []);                                    // yalnız ikinci kaydın yan etkilerine bak
    const ikinci = await kaydol('aliveli+oyun@gmail.com', '10.0.0.2');
    assert.equal(hesapSayisi(), 1, 'ikinci hesap açılmamalı (eski kodda 2 olur)');
    assert.deepEqual(Object.keys(ikinci.body).sort(), Object.keys(ilk.body).sort(), 'yanıt biçimi var olan/yeni hesapta aynı (numaralandırma yok)');
    assert.equal(ikinci.body.message, ilk.body.message);
    const yeni = db.kvJson('dev:outbox', []);
    assert.ok(yeni.some(m => m.to === 'ali.veli@gmail.com' && /zaten bir hesabın var/.test(m.subject)), 'uyarı e-postası hesabın KAYITLI adresine gitti');
    assert.ok(!yeni.some(m => m.to === 'aliveli+oyun@gmail.com'), 'yazılan +etiketli varyanta bağlantı gitmedi');
    // Aynı kutunun başka yazımları da (nokta / googlemail / büyük harf)
    await kaydol('A.L.I.V.E.L.I@GoogleMail.com', '10.0.0.3');
    assert.equal(hesapSayisi(), 1);
    // Posta için adres olduğu gibi: ilk hesabın e-postası değişmedi
    assert.equal(db.raw.prepare('SELECT email, email_key FROM accounts').get().email, 'ali.veli@gmail.com');
    assert.equal(db.raw.prepare('SELECT email_key FROM accounts').get().email_key, 'aliveli@gmail.com');
    // Farklı kutu (gmail dışında nokta anlamlı) ayrı hesap açar
    await kaydol('a.li@ornek.com', '10.0.0.4'); await kaydol('ali@ornek.com', '10.0.0.4');
    assert.equal(hesapSayisi(), 3);
    ok('EK-02a: +etiket / gmail noktası / googlemail aynı kutu → ikinci hesap yok, nötr yanıt, uyarı kayıtlı adrese gider');
  }

  // ── 3) EK-02a: eşzamanlı iki kayıt benzersiz anahtarda çakışırsa da nötr yanıt ──
  {
    const kullanici = 'es.zamanli@gmail.com';
    const [a, b] = await Promise.all([kaydol(kullanici, '10.0.1.1'), kaydol('eszamanli+2@gmail.com', '10.0.1.2')]);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    const n = db.raw.prepare("SELECT COUNT(*) AS n FROM accounts WHERE email_key = 'eszamanli@gmail.com'").get().n;
    assert.equal(n, 1, 'aynı anahtardan tek hesap');
    ok('EK-02a: eşzamanlı iki kayıt tek hesap bırakır, ikisi de nötr yanıt alır');
  }

  // ── 4) EK-02a: eski veritabanında çakışan e-postalar geçişi kırmaz; yeni kayıtlar yine engellenir ──
  {
    const d = new DatabaseSync(':memory:');
    gecisleriCalistir(d, { gecisler: GECISLER.filter(g => g.surum <= 4) });          // eski sürüm şeması
    const ekle = d.prepare('INSERT INTO accounts (email, pass_hash, created_at) VALUES (?, ?, 1)');
    for (const e of ['a.b@gmail.com', 'ab@gmail.com', 'ab+x@gmail.com', 'baska@ornek.com']) ekle.run(e, 'h');
    const r = gecisleriCalistir(d);
    assert.deepEqual(r.uygulanan, [5, 6, 7], 'yeni geçişler hatasız uygulandı');
    const anahtarlar = d.prepare('SELECT id, email_key FROM accounts ORDER BY id').all();
    assert.equal(anahtarlar[0].email_key, 'ab@gmail.com', 'ilk hesap düz anahtarı alır');
    assert.equal(anahtarlar[1].email_key, 'ab@gmail.com#2', 'çakışan ikincisi sonek alır (silinmedi)');
    assert.equal(anahtarlar[2].email_key, 'ab@gmail.com#3');
    assert.equal(anahtarlar[3].email_key, 'baska@ornek.com');
    assert.equal(d.prepare('SELECT COUNT(*) AS n FROM accounts').get().n, 4, 'hesap silinmedi');
    assert.throws(() => d.prepare("INSERT INTO accounts (email, email_key, pass_hash, created_at) VALUES ('x@y.com', 'ab@gmail.com', 'h', 1)").run(), /UNIQUE/, 'benzersiz kısıt çalışıyor');
    // İşlev kopyası ile geçişteki kopya aynı sonucu verir
    for (const e of ['Ali.Veli+x@Gmail.com', 'q@googlemail.com', 'z.z@ornek.com']) {
      const dd = new DatabaseSync(':memory:'); gecisleriCalistir(dd, { gecisler: GECISLER.filter(g => g.surum <= 4) });
      dd.prepare('INSERT INTO accounts (email, pass_hash, created_at) VALUES (?, ?, 1)').run(e, 'h'); gecisleriCalistir(dd);
      assert.equal(dd.prepare('SELECT email_key FROM accounts').get().email_key, epostaAnahtari(e), 'geçiş kopyası = kod: ' + e);
    }
    ok('EK-02a: eski veritabanında çakışan e-postalar geçişi kırmaz (ikincisi sonek alır, silinmez); yeni kayıt yine engellenir');
  }

  // ── 5) EK-02b: istemci adresi kotası ──
  {
    assert.equal(engine.GAME_CONFIG.KAPI.IP_DAILY_ADMIT, 3, 'varsayılan kota 3');
    const A = '203.0.113.7';
    const pid = [];
    for (let i = 0; i < 4; i++) pid.push(await kaydolDogrula(`kota${i}@ornek.com`, A));
    assert.deepEqual(pid.slice(0, 3).map(kapiDurum), ['citizen', 'citizen', 'citizen']);
    assert.equal(kapiDurum(pid[3]), 'waiting', 'kotayı aşan hesap bekleme sırasına düştü (eski kodda citizen olur)');
    // Reddedilmedi: doğrulama 200 döndü, hesap duruyor, sırada
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM players WHERE address = ?').get(pid[3]).n, 1);
    // Başka adres etkilenmez
    const baska = await kaydolDogrula('kota-baska@ornek.com', '203.0.113.8');
    assert.equal(kapiDurum(baska), 'citizen');
    // X-Forwarded-For: SON girdi geçerli (ilk girdiler istemcinin yazdığı, sahte olabilir)
    const sahteliBasta = await kaydolDogrula('kota-sahte@ornek.com', `198.51.100.99, ${A}`);
    assert.equal(kapiDurum(sahteliBasta), 'waiting', 'sahte baş girdi kotayı atlatmaz: gerçek adres son girdi');
    const sonSahte = await kaydolDogrula('kota-farkli@ornek.com', `${A}, 198.51.100.50`);
    assert.equal(kapiDurum(sonSahte), 'citizen', 'son girdi başka adres → o adresin kotası');
    // IPv6: aynı /64 ağı aynı kota
    const v6 = ['2001:db8:1:2::1', '2001:db8:1:2:ffff::9', '2001:0db8:0001:0002::7'];
    const v6p = [];
    for (let i = 0; i < 4; i++) v6p.push(await kaydolDogrula(`kota-v6-${i}@ornek.com`, i < 3 ? v6[i] : '2001:db8:1:2::abcd'));
    assert.deepEqual(v6p.map(kapiDurum), ['citizen', 'citizen', 'citizen', 'waiting'], 'IPv6 için /64 ağı tek adres sayılır');
    const v6baska = await kaydolDogrula('kota-v6-baska@ornek.com', '2001:db8:1:3::1');
    assert.equal(kapiDurum(v6baska), 'citizen', 'başka /64 ağı ayrı kota');
    // Yerel / bilinmeyen adres muaf (vekilsiz doğrudan istek)
    const yerel = [];
    for (let i = 0; i < 5; i++) yerel.push(await kaydolDogrula(`yerel${i}@ornek.com`, null));
    assert.ok(yerel.every(p => kapiDurum(p) === 'citizen'), 'yerel istekler kotadan muaf');
    // Ham adres hiçbir yerde saklanmaz (kayıt satırları, kv, olaylar)
    const kirli = [];
    for (const [tablo, kolonlar] of [['players', ['kayit_ip']], ['kapi_ip_kabul', ['ip']], ['events', ['data']], ['kv', ['value']]]) {
      for (const r of db.raw.prepare(`SELECT ${kolonlar.join(',')} FROM ${tablo}`).all()) for (const k of kolonlar) if (/203\.0\.113|2001:0?db8/.test(String(r[k] || ''))) kirli.push(tablo);
    }
    assert.deepEqual(kirli, [], 'ham IP saklanmadı');
    const satir = db.raw.prepare('SELECT ip FROM kapi_ip_kabul LIMIT 1').get();
    assert.match(satir.ip, /^[0-9a-f]{64}$/, 'yalnız tuzlu özet');
    ok('EK-02b: aynı adresten 4. hesap sıraya düşer (reddedilmez); son XFF girdisi; IPv6 /64; yerel muaf; ham IP saklanmaz');
  }

  // ── 6) EK-02b: 24 saat sonra kota boşalınca sıradaki davet edilir ──
  {
    const bekleyen = db.raw.prepare("SELECT address FROM players WHERE gate = 'waiting' AND kayit_ip IS NOT NULL ORDER BY gate_at LIMIT 1").get().address;
    kapi.run();
    assert.ok(!kapi.statusOf(bekleyen).davet, 'kota dolu: davet yok');
    now += 25 * 3600 * 1000;                                        // pencere kaydı
    kapi.run();
    assert.ok(kapi.statusOf(bekleyen).davet, 'kota boşalınca sıradaki davet edilir');
    // Davet ilk işlemde vatandaşlığa çevirir
    assert.equal(kapi.kabulEtDavet(bekleyen), true);
    assert.equal(kapiDurum(bekleyen), 'citizen');
    ok('EK-02b: pencere dolunca bekleyen aday davet edilir ve vatandaş olur');
  }

  // ── 7) EK-02b: kota 0 = sınırsız; yapılandırılabilir ──
  {
    engine.GAME_CONFIG.KAPI.IP_DAILY_ADMIT = 1;
    const a = await kaydolDogrula('tek1@ornek.com', '192.0.2.10');
    const b = await kaydolDogrula('tek2@ornek.com', '192.0.2.10');
    assert.deepEqual([kapiDurum(a), kapiDurum(b)], ['citizen', 'waiting'], 'kota 1');
    engine.GAME_CONFIG.KAPI.IP_DAILY_ADMIT = 0;
    const c = await kaydolDogrula('tek3@ornek.com', '192.0.2.10');
    assert.equal(kapiDurum(c), 'citizen', '0 = sınırsız');
    engine.GAME_CONFIG.KAPI.IP_DAILY_ADMIT = 3;
    ok('EK-02b: kota ayarla değişir (1), 0 sınırsız');
  }

  // ── 8) A2: e-posta belirteçleri özetli saklanır; bağlantı yine çalışır ──
  {
    const pid = await kaydolDogrula('belirtec@ornek.com', null);       // doğrulama bağlantısı tüketildi
    await call('POST', '/api/account/forgot', { email: 'belirtec@ornek.com' });
    const duz = posta('reset', 'belirtec@ornek.com');
    assert.ok(duz, 'sıfırlama bağlantısı posta kutusunda');
    const satirlar = db.raw.prepare('SELECT token FROM email_tokens').all().map(r => r.token);
    assert.ok(!satirlar.includes(duz), 'düz belirteç veritabanında OLMAMALI (eski kodda olur)');
    assert.ok(satirlar.includes(tokenOzeti(duz)) && satirlar.every(t => /^[0-9a-f]{64}$/.test(t)), 'yalnız SHA-256 özeti');
    const r = await call('POST', '/api/account/reset', { token: duz, password: 'yeni-gizli-sifre-9' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await call('POST', '/api/account/reset', { token: duz, password: 'yeni-gizli-sifre-9' })).status, 400, 'tek kullanımlık');
    assert.equal((await call('POST', '/api/account/reset', { token: tokenOzeti(duz), password: 'yeni-gizli-sifre-9' })).status, 400, 'özetin kendisi belirteç olarak geçmez');
    assert.ok(pid);
    ok('A2: belirteçler yalnız SHA-256 özeti olarak saklanır; bağlantı çalışır, tek kullanımlıktır, özet belirteç yerine geçmez');
  }

  // ── 9) A2: geçiş 007 eski düz belirteçleri yerinde özetler; eski bağlantı çalışmaya devam eder ──
  {
    const d = new DatabaseSync(':memory:');
    gecisleriCalistir(d, { gecisler: GECISLER.filter(g => g.surum <= 6) });
    d.prepare("INSERT INTO accounts (email, email_key, pass_hash, created_at, email_verified) VALUES ('eski@ornek.com', 'eski@ornek.com', 'h', 1, 1)").run();
    d.prepare("INSERT INTO email_tokens (token, account_id, kind, data, expires) VALUES (?, 1, 'reset', NULL, ?)").run('ab'.repeat(24), Date.now() + 3600000);
    gecisleriCalistir(d);
    assert.equal(d.prepare('SELECT token FROM email_tokens').get().token, sha('ab'.repeat(24)));
    ok('A2: geçiş 007 eski düz belirteçleri yerinde özetler (dolaşımdaki bağlantılar geçerli kalır)');
  }
} finally {
  server.close();
}

// ── 10) A2: TOTP sırrı şifreli, yedek kodlar tuzlu (HESAP_ANAHTARI ile) ──
{
  const ANAHTAR = 'ab'.repeat(32);
  const d = openDb(':memory:');
  const cfg2 = { ...loadConfig({}), dbFile: ':memory:', hesapAnahtari: ANAHTAR };
  let simdi = Date.UTC(2026, 9, 14, 12);
  const mail = createMailer({ db: d, cfg: cfg2, log: sessiz });
  const acc = createAccounts({ db: d, cfg: cfg2, mailer: mail, clock: () => simdi, verifyMessage: () => '0x0' });
  const kur = async (email) => {
    const r = await acc.register(email, PAROLA);
    const id = Number(r.playerId.slice(4));
    d.raw.prepare('UPDATE accounts SET email_verified = 1 WHERE id = ?').run(id);
    return r.playerId;
  };
  const ac2fa = async (pid) => {
    const s = await acc.totpSetup(pid);
    const kod = totpCode(s.secret, Math.floor(simdi / 30000));
    const e = await acc.totpEnable(pid, kod, PAROLA);
    assert.ok(e.ok, JSON.stringify(e));
    return { secret: s.secret, backupCodes: e.backupCodes };
  };
  const satir = (pid) => d.raw.prepare('SELECT totp_secret, totp_pending, backup_codes FROM accounts WHERE id = ?').get(Number(pid.slice(4)));

  const p1 = await kur('iki1@ornek.com');
  const bekleyen = await acc.totpSetup(p1);
  assert.match(satir(p1).totp_pending, /^enc1:/, 'bekleyen sır şifreli (eski kodda düz base32)');
  assert.ok(!satir(p1).totp_pending.includes(bekleyen.secret));
  const kod = totpCode(bekleyen.secret, Math.floor(simdi / 30000));
  const etkin = await acc.totpEnable(p1, kod, PAROLA);
  assert.ok(etkin.ok);
  const s1 = satir(p1);
  assert.match(s1.totp_secret, /^enc1:/); assert.equal(s1.totp_pending, null);
  // Doğrulama çalışır
  simdi += 31000;
  assert.ok((await acc.check2fa(p1, totpCode(bekleyen.secret, Math.floor(simdi / 30000)))).ok, 'şifreli sırla TOTP girişi çalışır');
  // Yedek kodlar: kod başına tuz; aynı kod iki hesapta farklı kayıt üretir; düz özet değil
  const kayitlar = JSON.parse(s1.backup_codes);
  assert.equal(kayitlar.length, 10);
  assert.ok(kayitlar.every(k => /^s2\$\d+\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(k)), 'scrypt + tuzlu biçim');
  assert.equal(new Set(kayitlar.map(k => k.split('$')[4])).size, 10, 'her kodun kendi tuzu var');
  const duzOzet = etkin.backupCodes.map(c => sha(c.replace('-', '')));
  assert.ok(!kayitlar.some(k => duzOzet.includes(k)), 'tuzsuz düz özet yok');
  simdi += 31000;
  const g = (await acc.check2fa(p1, etkin.backupCodes[3]));
  assert.ok(g.ok && g.usedBackup && g.backupLeft === 9, 'yedek kod çalışır ve tükenir');
  assert.equal((await acc.check2fa(p1, etkin.backupCodes[3])).ok, false, 'aynı yedek kod ikinci kez geçmez');
  // Başka hesabın şifreli sırrı bu hesaba kopyalanırsa çözülmez (bağlam)
  const p2 = await kur('iki2@ornek.com');
  const o2 = await ac2fa(p2);
  d.raw.prepare('UPDATE accounts SET totp_secret = ? WHERE id = ?').run(satir(p1).totp_secret, Number(p2.slice(4)));
  simdi += 31000;
  assert.equal((await acc.check2fa(p2, totpCode(bekleyen.secret, Math.floor(simdi / 30000)))).ok, false, 'kopyalanmış şifreli sır çözülmez');
  assert.equal((await acc.check2fa(p2, totpCode(o2.secret, Math.floor(simdi / 30000)))).ok, false, 'sır değişmiş: eski sırla da geçmez');
  assert.ok((await acc.check2fa(p2, o2.backupCodes[0])).ok, 'kapalı başarısızlık: yedek kodla yine girilir');
  ok('A2: TOTP sırrı AES-256-GCM (enc1:), hesaba bağlı; yedek kodlar kod başına tuzlu; kopyalanan kayıt çözülmez');

  // Yanlış anahtar: kapalı başarısızlık (TOTP geçmez, düz sır sızmaz); yedek kod çalışır
  const yanlis = createAccounts({ db: d, cfg: { ...cfg2, hesapAnahtari: 'cd'.repeat(32) }, mailer: mail, clock: () => simdi, verifyMessage: () => '0x0' });
  simdi += 31000;
  assert.equal((await yanlis.check2fa(p1, totpCode(bekleyen.secret, Math.floor(simdi / 30000)))).ok, false, 'yanlış anahtarla TOTP geçmez');
  const anahtarsiz = createAccounts({ db: d, cfg: { ...cfg2, hesapAnahtari: '' }, mailer: mail, clock: () => simdi, verifyMessage: () => '0x0' });
  assert.equal((await anahtarsiz.check2fa(p1, totpCode(bekleyen.secret, Math.floor(simdi / 30000)))).ok, false, 'anahtarsız açılışta şifreli kayıt düz sayılmaz');
  assert.ok((await anahtarsiz.check2fa(p1, etkin.backupCodes[5])).ok, 'yedek kod yine çalışır');
  assert.throws(() => createAccounts({ db: d, cfg: { ...cfg2, hesapAnahtari: 'kisa' }, mailer: mail, clock, verifyMessage: () => '0x0' }), /HESAP_ANAHTARI/);
  ok('A2: yanlış/eksik anahtarda şifreli sır düz sayılmaz (kapalı başarısızlık), yedek kodlar çalışır; bozuk anahtar açılışta reddedilir');

  // Eski düz kayıt: anahtar sonradan eklenince açılışta şifrelenir, doğrulama çalışmaya devam eder
  const d3 = openDb(':memory:');
  const acc3Eski = createAccounts({ db: d3, cfg: { ...cfg2, hesapAnahtari: '' }, mailer: createMailer({ db: d3, cfg: cfg2, log: sessiz }), clock: () => simdi, verifyMessage: () => '0x0' });
  const r3 = await acc3Eski.register('eski@ornek.com', PAROLA);
  const id3 = Number(r3.playerId.slice(4));
  d3.raw.prepare('UPDATE accounts SET email_verified = 1 WHERE id = ?').run(id3);
  const s3 = await acc3Eski.totpSetup(r3.playerId);
  const e3 = await acc3Eski.totpEnable(r3.playerId, totpCode(s3.secret, Math.floor(simdi / 30000)), PAROLA);
  assert.ok(e3.ok);
  assert.equal(d3.raw.prepare('SELECT totp_secret FROM accounts WHERE id = ?').get(id3).totp_secret, s3.secret, 'anahtarsız: düz (yalnız deneme düzeni)');
  // Eski, TUZSUZ yedek kod kaydı (eski kod biçimi) geçişten sonra da doğrulanır
  d3.raw.prepare('UPDATE accounts SET backup_codes = ? WHERE id = ?').run(JSON.stringify([sha('abcde12345'), sha('fffff00000')]), id3);
  const acc3Yeni = createAccounts({ db: d3, cfg: cfg2, mailer: createMailer({ db: d3, cfg: cfg2, log: sessiz }), clock: () => simdi, verifyMessage: () => '0x0' });
  assert.match(d3.raw.prepare('SELECT totp_secret FROM accounts WHERE id = ?').get(id3).totp_secret, /^enc1:/, 'açılışta eski düz sır şifrelendi');
  simdi += 31000;
  assert.ok((await acc3Yeni.check2fa(r3.playerId, totpCode(s3.secret, Math.floor(simdi / 30000)))).ok, 'şifrelenen eski sır çalışıyor');
  const eskiYedek = (await acc3Yeni.check2fa(r3.playerId, 'abcde-12345'));
  assert.ok(eskiYedek.ok && eskiYedek.usedBackup && eskiYedek.backupLeft === 1, 'eski tuzsuz yedek kod doğrulanmaya devam eder');
  ok('A2: eski düz TOTP sırrı açılışta şifrelenir; eski tuzsuz yedek kodlar çalışmaya devam eder');
}

// ── 11) Üretim doğrulaması ──
{
  const iyi = { NODE_ENV: 'production', PUBLIC_URL: 'https://oyun.ornek.com', TRUST_PROXY: '1', ADMIN_TOKEN: 'a'.repeat(48), SMTP_URL: 'smtp://k:s@posta.ornek.com:587', DB_FILE: '/data/realm.db',
    HESAP_ANAHTARI: 'ab'.repeat(32), YEDEK_KLASORU: '/yedek', YEDEK_ANAHTAR: 'cd'.repeat(32) };
  const dene = (ek) => { const env = { ...iyi, ...ek }; for (const k of Object.keys(env)) if (env[k] == null) delete env[k]; return dogrula(loadConfig(env), env); };
  assert.deepEqual(dene({}).hatalar, [], 'tam ayar hatasız');
  assert.ok(dene({ HESAP_ANAHTARI: null }).hatalar.some(h => /HESAP_ANAHTARI gerekli/.test(h)), 'HESAP_ANAHTARI üretimde zorunlu');
  assert.ok(dene({ HESAP_ANAHTARI: 'kisa' }).hatalar.some(h => /HESAP_ANAHTARI.*64/.test(h)));
  assert.ok(dene({ YEDEK_ANAHTAR: null }).hatalar.some(h => /YEDEK_ANAHTAR gerekli/.test(h)), 'YEDEK_KLASORU varsa YEDEK_ANAHTAR zorunlu');
  assert.ok(!dene({ YEDEK_ANAHTAR: null, YEDEK_KLASORU: null }).hatalar.some(h => /YEDEK_ANAHTAR/.test(h)), 'klasör yoksa anahtar istenmez');
  const gelistirme = dogrula(loadConfig({}), {});
  assert.deepEqual(gelistirme.hatalar, [], 'geliştirmede kural yok');
  ok('Üretim doğrulaması: HESAP_ANAHTARI zorunlu; YEDEK_KLASORU varsa YEDEK_ANAHTAR zorunlu');
}

console.log(`\n${toplam} güvenlik gerileme testi geçti`);
