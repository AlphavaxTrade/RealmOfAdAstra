// Realm of AdAstra sunucusu — hesaplar: e-posta/şifre, e-posta doğrulama, şifre sıfırlama, cüzdan bağlama
// ============================================================================
// Kullanıcı kararı (2 Ekim 2026):
//  • Ana hesap e-posta + şifre. Cüzdan kaybolsa/çalınsa da oyundaki bakiye hesapta kalır.
//  • Ödeme ve çekim için cüzdan hesaba bağlanır (cüzdanla imza = cüzdanın sahibi olduğunun kanıtı).
//  • Her cüzdan bağlama/değiştirme e-posta onayı ister. Zaten bağlı bir cüzdanı DEĞİŞTİRMEK ayrıca 48 saat
//    bekler: şifre çalınsa bile hırsız kazancı hemen kendi cüzdanına çekemez; gerçek sahip bu sürede iptal eder.
//  • Oyuncu kimliği "acc:<numara>"; oyun kaydı, sıralama ve ödemeler bu kimlikle tutulur. Ödemeler her zaman
//    hesabın ETKİN cüzdanına gider.
// Güvenlik (4 Ekim 2026):
//  • Kayıt ekranı bir e-postanın kayıtlı olup olmadığını ELE VERMEZ: her durumda "e-postana bağlantı gönderdik" der.
//    Adres zaten kayıtlıysa o adrese "zaten hesabın var / şifreni sıfırla" e-postası gider. Bu yüzden yeni oyuncu
//    e-postasındaki bağlantıya tıklayınca oyuna girer; doğrulanmamış hesap şifreyle giriş yapamaz (aynı hata yanıtı).
//  • İki adımlı doğrulama (isteğe bağlı): telefondaki doğrulama uygulamasının 6 haneli kodu (TOTP, RFC 6238).
//    Açıksa kod; girişte, cüzdan bağlarken/değiştirirken, çekimde, kasadan çekimde ve kapatırken istenir.
//    Telefon kaybına karşı 10 tek kullanımlık yedek kod verilir. Şifre/iki adımlı doğrulama değişince e-posta gider.
// ============================================================================
import crypto from 'node:crypto';
import QRCode from 'qrcode';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  wallet TEXT UNIQUE,
  wallet_set_at INTEGER,
  pending_wallet TEXT,
  pending_confirmed INTEGER NOT NULL DEFAULT 0,
  pending_active_at INTEGER
);
CREATE TABLE IF NOT EXISTS email_tokens (
  token TEXT PRIMARY KEY, account_id INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_nonces (account_id INTEGER PRIMARY KEY, address TEXT NOT NULL, message TEXT NOT NULL, expires INTEGER NOT NULL);
`;

const MIGRATIONS = ['totp_secret TEXT', 'totp_pending TEXT', 'totp_enabled INTEGER NOT NULL DEFAULT 0', 'totp_step INTEGER NOT NULL DEFAULT 0', 'backup_codes TEXT'];

// ── TOTP (doğrulama uygulaması kodları) ─────────────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function unbase32(s) {
  let bits = 0, val = 0; const out = [];
  for (const ch of String(s).replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(ch); if (i < 0) continue;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function totpCode(secretB32, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', unbase32(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const normCode = c => String(c || '').toLowerCase().replace(/[\s-]/g, '');

export const WALLET_CHANGE_DELAY_MS = 48 * 3600 * 1000;
export const playerIdOf = accountId => 'acc:' + accountId;
export const accountIdOf = playerId => (typeof playerId === 'string' && playerId.startsWith('acc:') ? Number(playerId.slice(4)) : null);

const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(hashHex, 'hex');
  return want.length === hash.length && crypto.timingSafeEqual(want, hash);
}
const DUMMY_HASH = hashPassword('zamanlama-esitleme-icin');

export function createAccounts({ db, cfg, mailer, clock = () => Date.now(), verifyMessage }) {
  db.raw.exec(SCHEMA);
  for (const col of MIGRATIONS) { try { db.raw.exec('ALTER TABLE accounts ADD COLUMN ' + col); } catch { /* sütun zaten var */ } }
  const q = {
    byEmail: db.raw.prepare('SELECT * FROM accounts WHERE email = ?'),
    byId: db.raw.prepare('SELECT * FROM accounts WHERE id = ?'),
    byWallet: db.raw.prepare('SELECT * FROM accounts WHERE wallet = ? OR (pending_wallet = ? AND pending_confirmed = 1)'),
    insert: db.raw.prepare('INSERT INTO accounts (email, pass_hash, created_at) VALUES (?, ?, ?)'),
    setVerified: db.raw.prepare('UPDATE accounts SET email_verified = 1 WHERE id = ?'),
    setPass: db.raw.prepare('UPDATE accounts SET pass_hash = ? WHERE id = ?'),
    setPending: db.raw.prepare('UPDATE accounts SET pending_wallet = ?, pending_confirmed = ?, pending_active_at = ? WHERE id = ?'),
    promote: db.raw.prepare('UPDATE accounts SET wallet = pending_wallet, wallet_set_at = ?, pending_wallet = NULL, pending_confirmed = 0, pending_active_at = NULL WHERE id = ?'),
    tokenAdd: db.raw.prepare('INSERT INTO email_tokens (token, account_id, kind, data, expires) VALUES (?, ?, ?, ?, ?)'),
    tokenGet: db.raw.prepare('SELECT * FROM email_tokens WHERE token = ?'),
    tokenDel: db.raw.prepare('DELETE FROM email_tokens WHERE token = ?'),
    tokensDelKind: db.raw.prepare('DELETE FROM email_tokens WHERE account_id = ? AND kind = ?'),
    tokensPurge: db.raw.prepare('DELETE FROM email_tokens WHERE expires < ?'),
    nonceSet: db.raw.prepare('INSERT INTO wallet_nonces (account_id, address, message, expires) VALUES (?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET address = excluded.address, message = excluded.message, expires = excluded.expires'),
    nonceGet: db.raw.prepare('SELECT * FROM wallet_nonces WHERE account_id = ?'),
    nonceDel: db.raw.prepare('DELETE FROM wallet_nonces WHERE account_id = ?'),
    sessionsOf: db.raw.prepare('DELETE FROM sessions WHERE address = ?'),
    totpPending: db.raw.prepare('UPDATE accounts SET totp_pending = ? WHERE id = ?'),
    totpOn: db.raw.prepare('UPDATE accounts SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled = 1, totp_step = ?, backup_codes = ? WHERE id = ?'),
    totpOff: db.raw.prepare('UPDATE accounts SET totp_secret = NULL, totp_pending = NULL, totp_enabled = 0, totp_step = 0, backup_codes = NULL WHERE id = ?'),
    totpStep: db.raw.prepare('UPDATE accounts SET totp_step = ? WHERE id = ?'),
    backupSet: db.raw.prepare('UPDATE accounts SET backup_codes = ? WHERE id = ?')
  };
  const link = (param, token) => `${cfg.publicUrl.replace(/\/$/, '')}/?${param}=${token}`;
  const newToken = (accountId, kind, ttlMs, data = null) => {
    q.tokensPurge.run(clock());
    const t = crypto.randomBytes(24).toString('hex');
    q.tokenAdd.run(t, accountId, kind, data == null ? null : JSON.stringify(data), clock() + ttlMs);
    return t;
  };
  const takeToken = (token, kind) => {
    if (typeof token !== 'string' || token.length > 100) return null;
    const r = q.tokenGet.get(token);
    if (!r || r.kind !== kind || r.expires < clock()) return null;
    q.tokenDel.run(token);
    return r;
  };
  // Deneme düzeninde (gerçek e-posta yokken) bağlantı oyuncuya ekranda gösterilir
  const devLink = url => (mailer.isDev && cfg.testMode ? { devLink: url } : {});

  // Yanlış şifre kilidi (15 dakika): aynı e-postaya 10 hatalı deneme ya da aynı IP'den 50 hatalı deneme.
  // IP sınırı yüksek: aynı internet bağlantısını paylaşan oyuncular (ev, kafe, operatör) birbirini kilitlemesin.
  const fails = new Map();
  const failKey = k => { const now = clock(); const f = fails.get(k); return f && now - f.t < 15 * 60000 ? f : null; };
  const noteFail = k => { const now = clock(); const f = failKey(k) || { t: now, n: 0 }; f.n++; fails.set(k, f); if (fails.size > 100000) fails.clear(); };
  const locked = k => { const f = failKey(k); return !!(f && f.n >= (k.startsWith('i:') ? 50 : 10)); };

  // Bağlı cüzdan: 48 saati dolmuş bekleyen değişikliği etkinleştirir
  function refresh(acc) {
    if (acc && acc.pending_wallet && acc.pending_confirmed && acc.pending_active_at && acc.pending_active_at <= clock()) {
      q.promote.run(clock(), acc.id);
      db.event('wallet-active', playerIdOf(acc.id), { wallet: acc.pending_wallet });
      return q.byId.get(acc.id);
    }
    return acc;
  }

  // Aynı adrese kısa sürede tekrar tekrar e-posta gitmesin (kayıt / yeniden gönderme kötüye kullanılmasın)
  const mailedAt = new Map();
  const mayMail = (key, gapMs = 10 * 60000) => {
    const now = clock(); const t = mailedAt.get(key) || 0;
    if (now - t < gapMs) return false;
    mailedAt.set(key, now); if (mailedAt.size > 100000) mailedAt.clear();
    return true;
  };
  const SENT_MSG = '📧 E-postana bir bağlantı gönderdik. Oyuna girmek için gelen kutundaki bağlantıya tıkla (gereksiz / spam klasörüne de bak).';

  // Her durumda AYNI yanıt: e-postanın kayıtlı olup olmadığı anlaşılmaz
  async function register(email, password) {
    const e = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(e) || e.length > 254) return { ok: false, error: 'Geçerli bir e-posta adresi yaz.' };
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return { ok: false, error: 'Şifre en az 8 karakter olmalı.' };
    const pass = hashPassword(password);                   // var olan hesapta da aynı süre geçsin
    const old = q.byEmail.get(e);
    if (old) {
      let extra = {};
      if (mayMail('reg:' + old.id)) {
        q.tokensDelKind.run(old.id, 'reset');
        const url = link('reset', newToken(old.id, 'reset', 3600000));
        let verifyPart = '';
        if (!old.email_verified) {
          q.tokensDelKind.run(old.id, 'verify');
          verifyPart = `\n\nHesabını henüz doğrulamadıysan bu bağlantıyla doğrulayabilirsin:\n${link('verify', newToken(old.id, 'verify', 7 * 86400000))}`;
        }
        await mailer.send({ to: e, subject: 'Realm of AdAstra — bu e-postayla zaten bir hesabın var',
          text: `Biri (büyük ihtimalle sen) bu e-postayla yeniden kayıt olmayı denedi. Bu e-postayla zaten bir hesabın var. 👑\n\nŞifreni hatırlıyorsan oyuna giriş yapman yeterli. Unuttuysan bu bağlantıyla yeni şifre belirle (1 saat geçerli):\n${url}${verifyPart}\n\nBunu sen yapmadıysan bu e-postayı yok say; hesabında hiçbir şey değişmedi.` });
        extra = devLink(url);
      }
      db.event('register-existing', playerIdOf(old.id));
      return { ok: true, sent: true, message: SENT_MSG, ...extra };
    }
    const r = q.insert.run(e, pass, clock());
    const id = Number(r.lastInsertRowid);
    db.q.playerAdd.run(playerIdOf(id), clock(), clock());
    const t = newToken(id, 'verify', 7 * 86400000);
    const url = link('verify', t);
    await mailer.send({ to: e, subject: 'Realm of AdAstra — e-postanı doğrula ve krallığa gir', text: `Krallığa hoş geldin! 👑\n\nHesabını doğrulayıp oyuna girmek için bu bağlantıya tıkla:\n${url}\n\nBu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.` });
    db.event('register', playerIdOf(id));
    return { ok: true, sent: true, message: SENT_MSG, ...devLink(url), playerId: playerIdOf(id) };   // playerId yalnız sunucu içi (yanıta konmaz)
  }

  // ── İki adımlı doğrulama ────────────────────────────────────────────────
  const tfaFails = new Map();
  const tfaLocked = id => { const f = tfaFails.get(id); return !!(f && clock() - f.t < 15 * 60000 && f.n >= 5); };
  const tfaFail = id => { const now = clock(); let f = tfaFails.get(id); if (!f || now - f.t >= 15 * 60000) f = { t: now, n: 0 }; f.n++; tfaFails.set(id, f); if (tfaFails.size > 100000) tfaFails.clear(); };
  const stepNow = () => Math.floor(clock() / 30000);
  // Kod doğruysa kullanılan adımı döndürür (aynı kod ikinci kez kullanılamaz)
  function matchTotp(secret, code, lastStep = 0) {
    const c = normCode(code);
    if (!/^\d{6}$/.test(c) || !secret) return 0;
    for (const w of [0, -1, 1]) {
      const s = stepNow() + w;
      if (s > lastStep && crypto.timingSafeEqual(Buffer.from(totpCode(secret, s)), Buffer.from(c))) return s;
    }
    return 0;
  }

  // İki adımlı doğrulama açıksa kod (ya da yedek kod) şart; kapalıysa her zaman geçer
  function check2fa(playerId, code) {
    const acc = q.byId.get(accountIdOf(playerId));
    if (!acc || !acc.totp_enabled) return { ok: true };
    if (code == null || code === '') return { ok: false, need2fa: true, error: '🛡️ İki adımlı doğrulama kodunu yaz.' };
    if (tfaLocked(acc.id)) return { ok: false, need2fa: true, error: 'Çok fazla hatalı kod. 15 dakika sonra tekrar dene.' };
    const s = matchTotp(acc.totp_secret, code, acc.totp_step);
    if (s) { q.totpStep.run(s, acc.id); tfaFails.delete(acc.id); return { ok: true }; }
    const list = JSON.parse(acc.backup_codes || '[]');
    const h = sha(normCode(code));
    const i = list.indexOf(h);
    if (i >= 0 && normCode(code).length >= 8) {
      list.splice(i, 1);
      q.backupSet.run(JSON.stringify(list), acc.id);
      tfaFails.delete(acc.id);
      db.event('2fa-backup-used', playerId, { left: list.length });
      return { ok: true, usedBackup: true, backupLeft: list.length };
    }
    tfaFail(acc.id);
    return { ok: false, need2fa: true, error: 'Kod hatalı ya da süresi geçmiş.' };
  }

  async function totpSetup(playerId) {
    const acc = q.byId.get(accountIdOf(playerId));
    if (!acc) return { ok: false, error: 'Hesap yok' };
    if (acc.totp_enabled) return { ok: false, error: 'İki adımlı doğrulama zaten açık.' };
    const secret = base32(crypto.randomBytes(20));
    q.totpPending.run(secret, acc.id);
    const uri = `otpauth://totp/${encodeURIComponent('Realm of AdAstra:' + acc.email)}?secret=${secret}&issuer=${encodeURIComponent('Realm of AdAstra')}&digits=6&period=30`;
    const svg = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return { ok: true, secret, uri, qr: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') };
  }

  async function totpEnable(playerId, code) {
    const acc = q.byId.get(accountIdOf(playerId));
    if (!acc || !acc.totp_pending) return { ok: false, error: 'Önce kurulumu başlat.' };
    if (tfaLocked(acc.id)) return { ok: false, error: 'Çok fazla hatalı kod. 15 dakika sonra tekrar dene.' };
    const s = matchTotp(acc.totp_pending, code, 0);
    if (!s) { tfaFail(acc.id); return { ok: false, error: 'Kod tutmadı. Uygulamadaki güncel 6 haneli kodu yaz.' }; }
    const codes = Array.from({ length: 10 }, () => { const x = crypto.randomBytes(5).toString('hex'); return x.slice(0, 5) + '-' + x.slice(5); });
    q.totpOn.run(s, JSON.stringify(codes.map(c => sha(normCode(c)))), acc.id);
    db.event('2fa-on', playerId);
    await mailer.send({ to: acc.email, subject: 'Realm of AdAstra — iki adımlı doğrulama AÇILDI', text: 'Hesabında iki adımlı doğrulama açıldı. 🛡️ Artık girişte telefonundaki koda da ihtiyaç olacak.\n\nBunu sen yapmadıysan hemen şifreni sıfırla ve bize yaz.' }).catch(() => {});
    return { ok: true, backupCodes: codes };
  }

  async function totpDisable(playerId, code) {
    const acc = q.byId.get(accountIdOf(playerId));
    if (!acc || !acc.totp_enabled) return { ok: false, error: 'İki adımlı doğrulama zaten kapalı.' };
    const g = check2fa(playerId, code);
    if (!g.ok) return g;
    q.totpOff.run(acc.id);
    db.event('2fa-off', playerId);
    await mailer.send({ to: acc.email, subject: 'Realm of AdAstra — iki adımlı doğrulama KAPATILDI', text: 'Hesabında iki adımlı doğrulama kapatıldı.\n\nBunu sen yapmadıysan hemen şifreni sıfırla, ardından iki adımlı doğrulamayı yeniden aç.' }).catch(() => {});
    return { ok: true };
  }

  // Şifre doğru + iki adımlı doğrulama açık: kısa ömürlü giriş bileti (5 dakika, en çok 5 deneme)
  const tickets = new Map();
  function login2fa(ticket, code) {
    const t = typeof ticket === 'string' ? tickets.get(ticket) : null;
    if (!t || t.exp < clock()) { if (t) tickets.delete(ticket); return { ok: false, error: 'Giriş süresi doldu, baştan giriş yap.' }; }
    const g = check2fa(t.playerId, code);
    if (!g.ok) {
      if (++t.tries >= 5) tickets.delete(ticket);
      return { ok: false, error: g.error };
    }
    tickets.delete(ticket);
    return { ok: true, playerId: t.playerId, backupLeft: g.backupLeft };
  }

  function login(email, password, ip = '') {
    const e = String(email || '').trim().toLowerCase();
    if (locked('e:' + e) || locked('i:' + ip)) return { ok: false, error: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.' };
    const acc = q.byEmail.get(e);
    const good = acc ? checkPassword(String(password || ''), acc.pass_hash) : (checkPassword('x', DUMMY_HASH), false);
    // Doğrulanmamış hesap da AYNI yanıtı alır (e-postanın kayıtlı olup olmadığı anlaşılmasın)
    const BAD = 'E-posta ya da şifre hatalı. Yeni kayıt olduysan önce e-postandaki bağlantıya tıkla.';
    if (!good) { noteFail('e:' + e); noteFail('i:' + ip); return { ok: false, error: BAD }; }
    if (!acc.email_verified) return { ok: false, error: BAD };
    fails.delete('e:' + e);
    if (acc.totp_enabled) {
      const ticket = crypto.randomBytes(24).toString('hex');
      tickets.set(ticket, { playerId: playerIdOf(acc.id), exp: clock() + 5 * 60000, tries: 0 });
      if (tickets.size > 50000) for (const [k, v] of tickets) if (v.exp < clock()) tickets.delete(k);
      return { ok: true, need2fa: true, ticket };
    }
    return { ok: true, playerId: playerIdOf(acc.id) };
  }

  function verifyEmail(token) {
    const t = takeToken(token, 'verify');
    if (!t) return { ok: false, error: 'Bağlantı geçersiz ya da süresi dolmuş.' };
    q.setVerified.run(t.account_id);
    const acc = q.byId.get(t.account_id);
    // Bağlantı oyuncuyu doğrudan oyuna sokar; iki adımlı doğrulama açıksa (eski hesap) yine kodla giriş gerekir
    return { ok: true, playerId: playerIdOf(t.account_id), canLogin: !(acc && acc.totp_enabled) };
  }

  // Doğrulama e-postasını yeniden gönder (e-postayla; yanıt her zaman aynı)
  async function resendVerify(email) {
    const e = String(email || '').trim().toLowerCase();
    const acc = EMAIL_RE.test(e) ? q.byEmail.get(e) : null;
    let extra = {};
    if (acc && !acc.email_verified && mayMail('rv:' + acc.id, 2 * 60000)) {
      q.tokensDelKind.run(acc.id, 'verify');
      const url = link('verify', newToken(acc.id, 'verify', 7 * 86400000));
      await mailer.send({ to: acc.email, subject: 'Realm of AdAstra — e-postanı doğrula', text: `Hesabını doğrulayıp oyuna girmek için:\n${url}` });
      extra = devLink(url);
    }
    return { ok: true, message: 'Bu e-posta ile doğrulanmamış bir hesap varsa bağlantı yeniden gönderildi.', ...extra };
  }

  // Kullanıcı varlığını ele vermemek için her zaman aynı yanıt
  async function forgot(email) {
    const e = String(email || '').trim().toLowerCase();
    const acc = q.byEmail.get(e);
    let extra = {};
    if (acc && mayMail('fg:' + acc.id, 60000)) {
      q.tokensDelKind.run(acc.id, 'reset');
      const url = link('reset', newToken(acc.id, 'reset', 3600000));
      await mailer.send({ to: e, subject: 'Realm of AdAstra — şifre sıfırlama', text: `Şifreni sıfırlamak için bu bağlantıya tıkla (1 saat geçerli):\n${url}\n\nBunu sen istemediysen bu e-postayı yok say; şifren değişmez.` });
      extra = devLink(url);
    }
    return { ok: true, message: 'Bu e-posta ile bir hesap varsa sıfırlama bağlantısı gönderildi.', ...extra };
  }

  async function reset(token, newPassword) {
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) return { ok: false, error: 'Şifre en az 8 karakter olmalı.' };
    const t = takeToken(token, 'reset');
    if (!t) return { ok: false, error: 'Bağlantı geçersiz ya da süresi dolmuş.' };
    q.setPass.run(hashPassword(newPassword), t.account_id);
    q.setVerified.run(t.account_id);                       // e-postayı açabildiyse e-posta onun
    q.sessionsOf.run(playerIdOf(t.account_id));            // bütün cihazlardan çıkış
    db.event('password-reset', playerIdOf(t.account_id));
    const acc = q.byId.get(t.account_id);
    if (acc) await mailer.send({ to: acc.email, subject: 'Realm of AdAstra — şifren değişti', text: 'Hesabının şifresi az önce değiştirildi ve bütün cihazlardan çıkış yapıldı. 🛡️\n\nBunu sen yapmadıysan hemen "Şifremi unuttum" ile yeni şifre belirle.' }).catch(() => {});
    return { ok: true, twoFactor: !!(acc && acc.totp_enabled) };
  }

  function me(playerId) {
    const acc = refresh(q.byId.get(accountIdOf(playerId)));
    if (!acc) return null;
    return {
      email: acc.email, verified: !!acc.email_verified, wallet: acc.wallet || null,
      pendingWallet: acc.pending_wallet || null, pendingConfirmed: !!acc.pending_confirmed,
      pendingActiveAt: acc.pending_active_at || null, walletChangeDelayHours: WALLET_CHANGE_DELAY_MS / 3600000,
      twoFactor: !!acc.totp_enabled, backupLeft: acc.totp_enabled ? JSON.parse(acc.backup_codes || '[]').length : 0
    };
  }

  // Ödemeler hep bu adrese gider (48 saati dolmamış değişiklik etkin değildir)
  function activeWallet(playerId) {
    const acc = refresh(q.byId.get(accountIdOf(playerId)));
    return acc ? acc.wallet || null : null;
  }

  function isVerified(playerId) {
    const acc = q.byId.get(accountIdOf(playerId));
    return !!(acc && acc.email_verified);
  }

  // 1) Cüzdan bağlama mesajı (cüzdan bu mesajı imzalar → cüzdanın sahibi olduğu kanıtlanır)
  function walletNonce(playerId, address) {
    const acc = q.byId.get(accountIdOf(playerId));
    if (!acc) return { ok: false, error: 'Hesap yok' };
    if (!/^0x[a-fA-F0-9]{40}$/.test(String(address || ''))) return { ok: false, error: 'Geçersiz cüzdan adresi' };
    const a = address.toLowerCase();
    const nonce = crypto.randomBytes(12).toString('hex');
    const message = `Realm of AdAstra — cüzdan bağlama\n\nBu cüzdanı ${acc.email} hesabına bağlıyorum.\nCüzdan: ${a}\nKod: ${nonce}\nSite: ${cfg.publicUrl}\n\nBu imza hiçbir işlem ya da ücret onaylamaz.`;
    q.nonceSet.run(acc.id, a, message, clock() + 10 * 60000);
    return { ok: true, message };
  }

  // 2) İmza doğrulanır, e-posta onayı istenir. İlk cüzdan onaydan hemen sonra, değişiklik 48 saat sonra etkin olur.
  async function walletLink(playerId, signature) {
    const acc = q.byId.get(accountIdOf(playerId));
    const n = acc && q.nonceGet.get(acc.id);
    if (!n || n.expires < clock()) return { ok: false, error: 'İmza süresi doldu, tekrar dene.' };
    if (!acc.email_verified) return { ok: false, error: 'Önce e-posta adresini doğrula.' };
    let signer = '';
    try { signer = verifyMessage(n.message, signature).toLowerCase(); } catch { signer = ''; }
    if (signer !== n.address) return { ok: false, error: 'İmza bu cüzdana ait değil.' };
    q.nonceDel.run(acc.id);
    if (acc.wallet === n.address) return { ok: false, error: 'Bu cüzdan zaten bağlı.' };
    const other = q.byWallet.get(n.address, n.address);
    if (other && other.id !== acc.id) return { ok: false, error: 'Bu cüzdan başka bir hesaba bağlı.' };
    q.setPending.run(n.address, 0, null, acc.id);
    q.tokensDelKind.run(acc.id, 'wallet');
    const url = link('wallet', newToken(acc.id, 'wallet', 24 * 3600000, { address: n.address }));
    const change = !!acc.wallet;
    await mailer.send({
      to: acc.email,
      subject: change ? 'Realm of AdAstra — hazine yolu değişiyor (onay gerekli)' : 'Realm of AdAstra — cüzdan bağlama onayı',
      text: (change
        ? `Hesabına bağlı cüzdanı ${n.address} olarak değiştirmek istendi.\nOnaylarsan yeni cüzdan 48 saat sonra etkin olur; o zamana kadar ödemeler eski cüzdanına gider.\n\nBunu SEN yaptıysan onayla:\n${url}\n\nSen yapmadıysan bu bağlantıya TIKLAMA ve hemen şifreni değiştir. 🛡️`
        : `Hesabına ${n.address} cüzdanını bağlamak için onayla:\n${url}\n\nBunu sen yapmadıysan tıklama ve şifreni değiştir.`)
    });
    db.event('wallet-request', playerId, { wallet: n.address, change });
    return { ok: true, change, ...devLink(url) };
  }

  // 3) E-postadaki bağlantı
  function walletConfirm(token) {
    const t = takeToken(token, 'wallet');
    if (!t) return { ok: false, error: 'Bağlantı geçersiz ya da süresi dolmuş.' };
    const acc = q.byId.get(t.account_id);
    const { address } = JSON.parse(t.data || '{}');
    if (!acc || acc.pending_wallet !== address) return { ok: false, error: 'Bu istek artık geçerli değil.' };
    const other = q.byWallet.get(address, address);
    if (other && other.id !== acc.id) return { ok: false, error: 'Bu cüzdan başka bir hesaba bağlı.' };
    const activeAt = acc.wallet ? clock() + WALLET_CHANGE_DELAY_MS : clock();
    q.setPending.run(address, 1, activeAt, acc.id);
    refresh(q.byId.get(acc.id));
    db.event('wallet-confirm', playerIdOf(acc.id), { wallet: address, activeAt });
    return { ok: true, activeAt, immediate: !acc.wallet };
  }

  // Bekleyen değişikliği iptal (hesabın sahibi panelden)
  function walletCancel(playerId) {
    const acc = q.byId.get(accountIdOf(playerId));
    if (!acc || !acc.pending_wallet) return { ok: false, error: 'Bekleyen bir cüzdan değişikliği yok.' };
    q.setPending.run(null, 0, null, acc.id);
    q.tokensDelKind.run(acc.id, 'wallet');
    db.event('wallet-cancel', playerId);
    return { ok: true };
  }

  // Etkin cüzdanı bu adres olan oyuncu
  function playerOfWallet(address) {
    const r = db.raw.prepare('SELECT id FROM accounts WHERE wallet = ?').get(String(address || '').toLowerCase());
    return r ? playerIdOf(r.id) : null;
  }

  return { check2fa, totpSetup, totpEnable, totpDisable, login2fa, playerOfWallet, register, login, verifyEmail, resendVerify, forgot, reset, me, activeWallet, isVerified, walletNonce, walletLink, walletConfirm, walletCancel };
}
