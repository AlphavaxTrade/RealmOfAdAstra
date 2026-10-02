// Realm of Astra sunucusu — hesaplar: e-posta/şifre, e-posta doğrulama, şifre sıfırlama, cüzdan bağlama
// ============================================================================
// Kullanıcı kararı (2 Ekim 2026):
//  • Ana hesap e-posta + şifre. Cüzdan kaybolsa/çalınsa da oyundaki bakiye hesapta kalır.
//  • Ödeme ve çekim için cüzdan hesaba bağlanır (cüzdanla imza = cüzdanın sahibi olduğunun kanıtı).
//  • Her cüzdan bağlama/değiştirme e-posta onayı ister. Zaten bağlı bir cüzdanı DEĞİŞTİRMEK ayrıca 48 saat
//    bekler: şifre çalınsa bile hırsız kazancı hemen kendi cüzdanına çekemez; gerçek sahip bu sürede iptal eder.
//  • Oyuncu kimliği "acc:<numara>"; oyun kaydı, sıralama ve ödemeler bu kimlikle tutulur. Ödemeler her zaman
//    hesabın ETKİN cüzdanına gider.
// ============================================================================
import crypto from 'node:crypto';

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
    sessionsOf: db.raw.prepare('DELETE FROM sessions WHERE address = ?')
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

  async function register(email, password) {
    const e = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(e) || e.length > 254) return { ok: false, error: 'Geçerli bir e-posta adresi yaz.' };
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return { ok: false, error: 'Şifre en az 8 karakter olmalı.' };
    if (q.byEmail.get(e)) return { ok: false, error: 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı ya da şifreni sıfırlamayı dene.' };
    const r = q.insert.run(e, hashPassword(password), clock());
    const id = Number(r.lastInsertRowid);
    db.q.playerAdd.run(playerIdOf(id), clock(), clock());
    const t = newToken(id, 'verify', 7 * 86400000);
    const url = link('verify', t);
    await mailer.send({ to: e, subject: 'Realm of Astra — e-postanı doğrula', text: `Krallığa hoş geldin! 👑\n\nHesabını doğrulamak için bu bağlantıya tıkla:\n${url}\n\nBu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.` });
    db.event('register', playerIdOf(id));
    return { ok: true, playerId: playerIdOf(id), ...devLink(url) };
  }

  function login(email, password, ip = '') {
    const e = String(email || '').trim().toLowerCase();
    if (locked('e:' + e) || locked('i:' + ip)) return { ok: false, error: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.' };
    const acc = q.byEmail.get(e);
    const good = acc ? checkPassword(String(password || ''), acc.pass_hash) : (checkPassword('x', DUMMY_HASH), false);
    if (!good) { noteFail('e:' + e); noteFail('i:' + ip); return { ok: false, error: 'E-posta ya da şifre hatalı.' }; }
    fails.delete('e:' + e);
    return { ok: true, playerId: playerIdOf(acc.id) };
  }

  function verifyEmail(token) {
    const t = takeToken(token, 'verify');
    if (!t) return { ok: false, error: 'Bağlantı geçersiz ya da süresi dolmuş.' };
    q.setVerified.run(t.account_id);
    return { ok: true, playerId: playerIdOf(t.account_id) };
  }

  async function resendVerify(playerId) {
    const acc = q.byId.get(accountIdOf(playerId));
    if (!acc) return { ok: false, error: 'Hesap yok' };
    if (acc.email_verified) return { ok: true, already: true };
    q.tokensDelKind.run(acc.id, 'verify');
    const url = link('verify', newToken(acc.id, 'verify', 7 * 86400000));
    await mailer.send({ to: acc.email, subject: 'Realm of Astra — e-postanı doğrula', text: `Hesabını doğrulamak için:\n${url}` });
    return { ok: true, ...devLink(url) };
  }

  // Kullanıcı varlığını ele vermemek için her zaman aynı yanıt
  async function forgot(email) {
    const e = String(email || '').trim().toLowerCase();
    const acc = q.byEmail.get(e);
    let extra = {};
    if (acc) {
      q.tokensDelKind.run(acc.id, 'reset');
      const url = link('reset', newToken(acc.id, 'reset', 3600000));
      await mailer.send({ to: e, subject: 'Realm of Astra — şifre sıfırlama', text: `Şifreni sıfırlamak için bu bağlantıya tıkla (1 saat geçerli):\n${url}\n\nBunu sen istemediysen bu e-postayı yok say; şifren değişmez.` });
      extra = devLink(url);
    }
    return { ok: true, message: 'Bu e-posta ile bir hesap varsa sıfırlama bağlantısı gönderildi.', ...extra };
  }

  function reset(token, newPassword) {
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) return { ok: false, error: 'Şifre en az 8 karakter olmalı.' };
    const t = takeToken(token, 'reset');
    if (!t) return { ok: false, error: 'Bağlantı geçersiz ya da süresi dolmuş.' };
    q.setPass.run(hashPassword(newPassword), t.account_id);
    q.setVerified.run(t.account_id);                       // e-postayı açabildiyse e-posta onun
    q.sessionsOf.run(playerIdOf(t.account_id));            // bütün cihazlardan çıkış
    db.event('password-reset', playerIdOf(t.account_id));
    return { ok: true };
  }

  function me(playerId) {
    const acc = refresh(q.byId.get(accountIdOf(playerId)));
    if (!acc) return null;
    return {
      email: acc.email, verified: !!acc.email_verified, wallet: acc.wallet || null,
      pendingWallet: acc.pending_wallet || null, pendingConfirmed: !!acc.pending_confirmed,
      pendingActiveAt: acc.pending_active_at || null, walletChangeDelayHours: WALLET_CHANGE_DELAY_MS / 3600000
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
    const message = `Realm of Astra — cüzdan bağlama\n\nBu cüzdanı ${acc.email} hesabına bağlıyorum.\nCüzdan: ${a}\nKod: ${nonce}\nSite: ${cfg.publicUrl}\n\nBu imza hiçbir işlem ya da ücret onaylamaz.`;
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
      subject: change ? 'Realm of Astra — hazine yolu değişiyor (onay gerekli)' : 'Realm of Astra — cüzdan bağlama onayı',
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

  return { playerOfWallet, register, login, verifyEmail, resendVerify, forgot, reset, me, activeWallet, isVerified, walletNonce, walletLink, walletConfirm, walletCancel };
}
