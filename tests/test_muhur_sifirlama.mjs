// Muhafız Mührü yönetici onaylı sıfırlama (14 Ekim 2026): telefonunu ve yedek kodlarını kaybeden oyuncunun parası içeride kalmasın.
// Kural: yönetici başlatır, 48 saat BEKLER, oyuncunun e-postasına "bu ben değilim" bağlantısı gider; iptal edilmezse mühür kalkar.
// Kod / yeni anahtar GÖNDERİLMEZ. Denenenler: gerekçe şartı, mühürsüz / bekleyen hesap reddi, bekleme boyunca mühür sürer,
// sahibi bağlantıyla iptal eder (tek kullanımlık), yönetici iptal eder, süre dolunca mühür kalkar (giriş + işlem + hesap özeti),
// olay günlüğü, bekleyenler listesi.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts, totpCode, TFA_RESET_DELAY_MS } from '../server/accounts.js';

let toplam = 0;
const ok = ad => { toplam++; console.log(`✅ ${ad}`); };
const sessiz = { log() {}, warn() {}, error() {} };
const PAROLA = 'gizli-sifre-123';

const d = openDb(':memory:');
const cfg = { ...loadConfig({}), dbFile: ':memory:', hesapAnahtari: 'ab'.repeat(32), testMode: true, publicUrl: 'http://127.0.0.1:1' };
let simdi = Date.UTC(2026, 9, 14, 12);
const posta = createMailer({ db: d, cfg, log: sessiz });
const acc = createAccounts({ db: d, cfg, mailer: posta, clock: () => simdi, verifyMessage: () => '0x0' });

const yeniHesap = async email => {
  const r = await acc.register(email, PAROLA);
  d.raw.prepare('UPDATE accounts SET email_verified = 1 WHERE id = ?').run(Number(r.playerId.slice(4)));
  return r.playerId;
};
const muhurTak = async pid => {
  const s = await acc.totpSetup(pid);
  const e = await acc.totpEnable(pid, totpCode(s.secret, Math.floor(simdi / 30000)), PAROLA);
  assert.ok(e.ok, JSON.stringify(e));
  return { secret: s.secret, codes: e.backupCodes };
};
const olaylar = tur => d.raw.prepare('SELECT * FROM events WHERE type = ?').all(tur);
const hataKodu = async fn => { try { await fn(); } catch (e) { return e.kod; } return null; };
const tokenOf = devLink => new URL(devLink).searchParams.get('muhur-iptal');

// 1) Şartlar
{
  const p = await yeniHesap('sifirla1@ornek.com');
  assert.equal(await hataKodu(() => acc.adminTfaSifirla({ playerId: p, gerekce: 'kisa' })), 400, 'gerekçe yetersiz');
  assert.equal(await hataKodu(() => acc.adminTfaSifirla({ email: 'yok@ornek.com', gerekce: 'telefonu kaybolmus, kimlik dogrulandi' })), 404);
  assert.equal(await hataKodu(() => acc.adminTfaSifirla({ playerId: p, gerekce: 'telefonu kaybolmus, kimlik dogrulandi' })), 409, 'mühür zaten kapalı');
  ok('Gerekçe şart; olmayan hesap ve mührü olmayan hesap reddedilir');
}

// 2) Bekleme boyunca mühür sürer; sahibi bağlantıyla iptal eder (tek kullanımlık)
{
  const p = await yeniHesap('sifirla2@ornek.com');
  const { secret, codes } = await muhurTak(p);
  const r = await acc.adminTfaSifirla({ email: 'SIFIRLA2@ornek.com', gerekce: 'telefon kayip, kimlik gorusmede dogrulandi' });
  assert.ok(r.ok && r.applyAt === simdi + TFA_RESET_DELAY_MS && r.playerId === p);
  assert.ok(r.devLink && tokenOf(r.devLink).length >= 40, 'iptal bağlantısı üretildi (deneme modunda görünür)');
  assert.equal(await hataKodu(() => acc.adminTfaSifirla({ playerId: p, gerekce: 'ikinci istek, ayni kisi icin' })), 409, 'bekleyen varken ikinci istek yok');
  assert.equal(acc.me(p).twoFactor, true);
  assert.equal(acc.me(p).muhurSifirlamaAt, r.applyAt);
  assert.equal((await acc.check2fa(p, '')).ok, false, 'bekleme sürerken kod şart');
  const g = await acc.login('sifirla2@ornek.com', PAROLA, '1.1.1.1');
  assert.ok(g.need2fa && g.ticket, 'giriş hâlâ ikinci adım ister');
  assert.equal(acc.tfaSifirlamaBekleyenler().length, 1);
  assert.equal(olaylar('2fa-reset-requested').length, 1);
  // sahibi iptal eder
  const t = tokenOf(r.devLink);
  assert.deepEqual(acc.tfaSifirlaIptalLink(t), { ok: true });
  assert.equal(acc.tfaSifirlaIptalLink(t).ok, false, 'bağlantı tek kullanımlık');
  assert.equal(acc.tfaSifirlamaBekleyenler().length, 0);
  assert.equal(acc.me(p).muhurSifirlamaAt, null);
  simdi += TFA_RESET_DELAY_MS + 3600000;
  assert.equal(acc.me(p).twoFactor, true, 'iptal edilince süre dolsa da mühür sürer');
  assert.equal((await acc.check2fa(p, totpCode(secret, Math.floor(simdi / 30000)))).ok, true, 'kodla hâlâ geçilir');
  assert.ok(codes.length === 10);
  assert.equal(olaylar('2fa-reset-cancelled').length, 1);
  ok('Bekleme boyunca mühür sürer; sahibi bağlantıyla iptal edince mühür kalır, bağlantı tek kullanımlık');
}

// 3) Yönetici iptal eder
{
  const p = await yeniHesap('sifirla3@ornek.com');
  await muhurTak(p);
  assert.equal(await hataKodu(() => acc.adminTfaSifirlaIptal({ playerId: p })), 409, 'bekleyen yokken iptal edilemez');
  await acc.adminTfaSifirla({ playerId: p, gerekce: 'telefon kayip, kimlik dogrulandi' });
  assert.deepEqual(acc.adminTfaSifirlaIptal({ playerId: p }), { ok: true, playerId: p });
  assert.equal(acc.me(p).muhurSifirlamaAt, null);
  simdi += TFA_RESET_DELAY_MS + 60000;
  assert.equal(acc.me(p).twoFactor, true);
  ok('Yönetici bekleyen sıfırlamayı iptal edebilir; iptalden sonra süre dolsa da mühür kalır');
}

// 4) Süre dolunca mühür kalkar (giriş, işlem kapısı ve hesap özeti)
{
  const p = await yeniHesap('sifirla4@ornek.com');
  await muhurTak(p);
  const r = await acc.adminTfaSifirla({ playerId: p, gerekce: 'telefon ve yedek kodlar kayip, kimlik dogrulandi' });
  simdi = r.applyAt - 1000;
  assert.equal((await acc.check2fa(p, '')).ok, false, 'son saniyeye kadar mühür sürer');
  simdi = r.applyAt;
  const g = await acc.login('sifirla4@ornek.com', PAROLA, '2.2.2.2');
  assert.ok(g.ok && !g.need2fa && g.playerId === p, 'süre dolunca yalnız şifre yeter');
  assert.equal((await acc.check2fa(p, '')).ok, true, 'işlem kapısı da açık');
  const m = acc.me(p);
  assert.equal(m.twoFactor, false); assert.equal(m.backupLeft, 0); assert.equal(m.muhurSifirlamaAt, null);
  assert.equal(acc.tfaSifirlamaBekleyenler().length, 0);
  assert.equal(olaylar('2fa-reset-applied').length, 1);
  // oyuncu yeni telefonuyla mührü yeniden takabilir
  const yeni = await muhurTak(p);
  assert.equal(yeni.codes.length, 10);
  assert.equal(acc.me(p).twoFactor, true);
  ok('Süre dolunca mühür kalkar (giriş, işlem kapısı, hesap özeti); oyuncu yeni telefonla yeniden takabilir');
}

// 5) Kuru gün kontrolü: kod / anahtar hiçbir e-postada yok
{
  const giden = d.raw.prepare("SELECT value FROM kv WHERE key = 'dev:outbox'").get();
  const metin = giden ? String(giden.value) : '';
  assert.ok(!/otpauth:|backupCodes|yedek kod(lar)?ın: /i.test(metin), 'e-postalarda kod / anahtar yok');
  ok('Sıfırlama e-postalarında kod ya da anahtar yok (yalnız iptal bağlantısı)');
}

console.log(`\n${toplam} Muhafız Mührü sıfırlama kontrolü geçti.`);
process.exit(0);
