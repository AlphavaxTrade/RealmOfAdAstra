// İki adımlı doğrulama yedek kodları (denetim 2026-10 ikinci tur, A2 devamı): yavaş özet (scrypt) + tuz; eski kayıtlar çalışır.
//   1) server/yedek-kod.js saf kurallar: biçimler, yükseltme bayrağı, bozuk kayıt hesaplanmadan reddedilir
//   2) hesap katmanı: yeni kodlar s2, karışık (düz + s1 + s2) listede her biri doğrulanır, kullanılan silinir, eşzamanlı çift kullanım yok,
//      toplu deneme sınırı beklemeden uygulanır, yenileme eski kodları (eski biçimliler dahil) geçersiz kılar
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../server/db.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts, totpCode } from '../server/accounts.js';
import { yedekKodOzetle, yedekKodDogrula, yedekKodBicimi, YEDEK_GUCLU } from '../server/yedek-kod.js';

let toplam = 0;
const ok = ad => { toplam++; console.log(`✅ ${ad}`); };
const sessiz = { log() {}, warn() {}, error() {} };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const GUCLU_DEGIL = { N: 1024, r: 8, p: 1 };   // testte hızlı; güncel hedefin altında olduğu için "eski" sayılmalı

// ── 1) Saf kurallar ──
{
  const k1 = await yedekKodOzetle('ABCDE-12345', GUCLU_DEGIL), k2 = await yedekKodOzetle('abcde12345', GUCLU_DEGIL);
  assert.match(k1, /^s2\$1024\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.notEqual(k1, k2, 'aynı kod iki kez özetlenince farklı tuz: farklı kayıt');
  assert.equal(yedekKodBicimi(k1), 's2');
  for (const girdi of ['abcde12345', 'ABCDE-12345', ' abcde 12345 ']) assert.equal((await yedekKodDogrula(k1, girdi)).ok, true, 'büyük/küçük harf, tire, boşluk fark etmez: ' + girdi);
  assert.equal((await yedekKodDogrula(k1, 'abcde12346')).ok, false);
  // Güncel hedefin altındaki s2 kaydı doğrulanır ama yenilenmesi gerektiği bildirilir; güncel ayarla yazılan bildirilmez
  // (PAROLA_HAFIF=1 testlerde hedef zaten 1024 olduğundan "eski ayar" ancak tam ayarlı çalıştırmada görülür)
  const eskiAyar = await yedekKodDogrula(k1, 'abcde12345');
  assert.deepEqual(eskiAyar, { ok: true, eski: process.env.PAROLA_HAFIF !== '1' });
  const guncel = await yedekKodOzetle('abcde12345', YEDEK_GUCLU);
  assert.deepEqual(await yedekKodDogrula(guncel, 'abcde12345'), { ok: true, eski: false });
  // Eski iki biçim: doğrulanır ve "eski" sayılır
  const tuz = 'f0'.repeat(16);
  const s1 = `s1$${tuz}$${sha(tuz + ':abcde12345')}`, duz = sha('abcde12345');
  assert.equal(yedekKodBicimi(s1), 's1'); assert.equal(yedekKodBicimi(duz), 'duz');
  assert.deepEqual(await yedekKodDogrula(s1, 'ABCDE-12345'), { ok: true, eski: true });
  assert.deepEqual(await yedekKodDogrula(duz, 'abcde12345'), { ok: true, eski: true });
  assert.equal((await yedekKodDogrula(s1, 'yanlis00000')).ok, false);
  assert.equal((await yedekKodDogrula(duz, 'yanlis00000')).ok, false);
  // Bozuk / saldırgan kayıtlar hesaplanmadan reddedilir (bellek ve işlemci patlatılamaz)
  const bozuklar = [null, 42, '', 'rastgele', 's1$', 's1$tuz', 's2$1024$8$1$aa$bb', `s2$${2 ** 30}$8$1$${tuz}$${'ab'.repeat(32)}`, `s2$1000$8$1$${tuz}$${'ab'.repeat(32)}`,
    `s2$1024$8$99$${tuz}$${'ab'.repeat(32)}`, `s2$1024$8$1$${tuz}$${'zz'.repeat(32)}`, `s2$1024$8$1$${tuz}`, 'a'.repeat(63)];
  const t0 = process.hrtime.bigint();
  for (const b of bozuklar) assert.deepEqual(await yedekKodDogrula(b, 'abcde12345'), { ok: false, eski: false }, 'reddedilmeli: ' + String(b).slice(0, 30));
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 500, 'bozuk kayıtlar için ağır hesap yapılmadı');
  ok('Yedek kod özeti: s2 (scrypt + tuz), eski s1 / düz biçimler doğrulanır ve "eski" işaretlenir, bozuk kayıt hesaplanmadan reddedilir');
}

// ── 2) Hesap katmanı ──
const PAROLA = 'gizli-sifre-123';
const d = openDb(':memory:');
const cfg = { ...loadConfig({}), dbFile: ':memory:', hesapAnahtari: 'ab'.repeat(32) };
let simdi = Date.UTC(2026, 9, 14, 12);
const posta = createMailer({ db: d, cfg, log: sessiz });
const acc = createAccounts({ db: d, cfg, mailer: posta, clock: () => simdi, verifyMessage: () => '0x0' });
const yeniHesap = async email => {
  const r = await acc.register(email, PAROLA);
  d.raw.prepare('UPDATE accounts SET email_verified = 1 WHERE id = ?').run(Number(r.playerId.slice(4)));
  return r.playerId;
};
const ac = async pid => {
  const s = await acc.totpSetup(pid);
  const e = await acc.totpEnable(pid, totpCode(s.secret, Math.floor(simdi / 30000)), PAROLA);
  assert.ok(e.ok, JSON.stringify(e));
  return { secret: s.secret, codes: e.backupCodes };
};
const kayitlar = pid => JSON.parse(d.raw.prepare('SELECT backup_codes FROM accounts WHERE id = ?').get(Number(pid.slice(4))).backup_codes);
const yaz = (pid, liste) => d.raw.prepare('UPDATE accounts SET backup_codes = ? WHERE id = ?').run(JSON.stringify(liste), Number(pid.slice(4)));

{
  const p = await yeniHesap('yedek1@ornek.com');
  const { codes } = await ac(p);
  const k = kayitlar(p);
  assert.equal(k.length, 10);
  assert.ok(k.every(x => yedekKodBicimi(x) === 's2'), 'yeni kodların hepsi scrypt kaydı');
  assert.ok(!k.some(x => codes.some(c => x.includes(c.replace('-', '')))), 'düz kod kayıtta yok');
  const g = await acc.check2fa(p, codes[0]);
  assert.ok(g.ok && g.usedBackup && g.backupLeft === 9 && g.backupLegacy === 0);
  assert.equal(kayitlar(p).length, 9);
  assert.equal((await acc.check2fa(p, codes[0])).ok, false, 'kullanılan kod ikinci kez geçmez');
  assert.equal((await acc.me(p)).backupLegacy, 0);
  ok('Yeni kurulumda 10 kod da s2 olarak saklanır; kullanılan kod silinir');
}

{
  // Karışık eski liste: düz özet, s1, s2; her biri tek tek doğrulanır, "eski" sayısı bildirilir
  const p = await yeniHesap('yedek2@ornek.com');
  await ac(p);
  const tuz = '0a'.repeat(16);
  yaz(p, [sha('aaaaa11111'), `s1$${tuz}$${sha(tuz + ':bbbbb22222')}`, await yedekKodOzetle('ccccc33333'), sha('ddddd44444')]);
  assert.equal((await acc.me(p)).backupLegacy, 3, 'hesabım ekranı kaç kodun eski biçimde olduğunu bilir');
  simdi += 31000;
  const a = await acc.check2fa(p, 'bbbbb-22222');
  assert.ok(a.ok && a.usedBackup && a.backupLeft === 3 && a.backupLegacy === 2, JSON.stringify(a));
  const b = await acc.check2fa(p, 'ccccc33333');
  assert.ok(b.ok && b.backupLeft === 2 && b.backupLegacy === 2);
  const c = await acc.check2fa(p, 'aaaaa11111');
  assert.ok(c.ok && c.backupLeft === 1 && c.backupLegacy === 1);
  assert.equal(kayitlar(p).length, 1);
  ok('Karışık (düz + s1 + s2) listede her kod doğrulanır; eski biçimli kalan sayısı bildirilir');
}

{
  // Eşzamanlı çift kullanım: aynı yedek kod iki istekte aynı anda gelirse yalnız biri geçer
  const p = await yeniHesap('yedek3@ornek.com');
  const { codes } = await ac(p);
  simdi += 31000;
  const sonuc = await Promise.all([acc.check2fa(p, codes[2]), acc.check2fa(p, codes[2]), acc.check2fa(p, codes[2])]);
  assert.equal(sonuc.filter(x => x.ok).length, 1, 'üç eşzamanlı istekten tam biri geçti: ' + JSON.stringify(sonuc.map(x => x.ok)));
  assert.equal(kayitlar(p).length, 9);
  ok('Aynı yedek kodla eşzamanlı istekler: tek geçiş (beklerken yarış yok)');
}

{
  // Toplu deneme: deneme hakkı beklemeden önce düşer; aynı anda 20 yanlış istek 5 haktan fazlasını hesaplayamaz, kilit devreye girer
  const p = await yeniHesap('yedek4@ornek.com');
  const { codes } = await ac(p);
  simdi += 31000;
  const yanlis = Array.from({ length: 20 }, (_, i) => acc.check2fa(p, 'yanlis' + String(i).padStart(4, '0')));
  const sonuclar = await Promise.all(yanlis);
  assert.ok(sonuclar.every(x => !x.ok));
  assert.ok(sonuclar.filter(x => /Çok fazla/.test(x.error)).length >= 15, 'ilk 5 deneme hesaplandı, kalan 15 doğrudan kilitli yanıt aldı');
  // Doğru kod da şimdi kilitli (15 dakika), süre dolunca çalışır
  assert.match((await acc.check2fa(p, codes[0])).error, /Çok fazla/);
  simdi += 16 * 60000;
  assert.ok((await acc.check2fa(p, codes[0])).ok, 'kilit süresi dolunca doğru kod geçer');
  ok('Eşzamanlı toplu yanlış deneme: 5 hakla sınırlı, kilit sonrası doğru kod da 15 dakika bekler');
}

{
  // Kodları yenile: parola + geçerli kod şart; eski 10 kod (eski biçimliler dahil) geçersiz, yeni 10 s2
  const p = await yeniHesap('yedek5@ornek.com');
  const { secret, codes } = await ac(p);
  const tuz = '0a'.repeat(16);
  yaz(p, [sha('aaaaa11111'), `s1$${tuz}$${sha(tuz + ':bbbbb22222')}`]);
  simdi += 31000;
  const totp = () => totpCode(secret, Math.floor(simdi / 30000));
  assert.equal((await acc.yedekKodlariYenile(p, totp(), 'yanlis-parola')).ok, false, 'parola yanlışsa yenilenmez');
  assert.equal(kayitlar(p).length, 2, 'başarısız yenileme listeyi değiştirmedi');
  const yeni = await acc.yedekKodlariYenile(p, totp(), PAROLA);
  assert.ok(yeni.ok && yeni.backupCodes.length === 10 && new Set(yeni.backupCodes).size === 10);
  assert.ok(kayitlar(p).every(x => yedekKodBicimi(x) === 's2') && kayitlar(p).length === 10);
  simdi += 31000;
  assert.equal((await acc.check2fa(p, 'aaaaa11111')).ok, false, 'eski düz kayıt geçersiz');
  assert.equal((await acc.check2fa(p, 'bbbbb22222')).ok, false, 'eski s1 kayıt geçersiz');
  assert.equal((await acc.check2fa(p, codes[1])).ok, false, 'ilk kurulumun kodu geçersiz');
  assert.ok((await acc.check2fa(p, yeni.backupCodes[4])).ok, 'yeni kod geçer');
  assert.equal((await acc.me(p)).backupLegacy, 0);
  // 2FA kapalı hesapta yenileme yok
  const q = await yeniHesap('yedek6@ornek.com');
  assert.equal((await acc.yedekKodlariYenile(q, '123456', PAROLA)).ok, false);
  ok('Yedek kodlar yenilenir: parola + kod şart, eski kayıtlar (düz ve s1 dahil) geçersiz olur, yeniler s2');
}

console.log(`\n${toplam} yedek kod kontrolü geçti.`);
process.exit(0);
