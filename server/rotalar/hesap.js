// Realm of AdAstra sunucusu — rotalar: hesap: kayıt, giriş, 2FA, şifre sıfırlama, cüzdan bağlama, çıkış
// (kurumsal A3.9: server/app.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar app.js'ten ctx ile gelir.)
import { tokenOzeti } from '../oturum.js';

export default function hesapRotalari(ctx) {
  const { db, accounts, promo, kapi, readBody, newSession, clientIp } = ctx;
  return {
    // ── Hesap ────────────────────────────────────────────────────────────
    'POST /api/account/register': async (req) => {
      const { email, password, promo: code } = await readBody(req);
      // Promo kodu isteğe bağlı: yazıldıysa önce geçerli mi bakılır (e-posta bilgisi sızdırmaz), doğrulamada kullanılır
      const pc = String(code || '').trim();
      if (pc) { const ck = promo.check(pc); if (!ck.ok) return [400, { error: ck.error }]; }
      const r = await accounts.register(email, password);
      if (!r.ok) return [400, { error: r.error }];
      if (pc && r.playerId) promo.setPending(r.playerId, pc);
      // Oturum AÇILMAZ: e-posta kayıtlı olsun olmasın yanıt aynıdır; oyuncu e-postadaki bağlantıyla girer
      return { ok: true, sent: true, message: r.message, devLink: r.devLink };
    },
    'POST /api/account/login': async (req) => {
      const { email, password } = await readBody(req);
      const r = await accounts.login(email, password, clientIp(req));
      if (!r.ok) return [401, { error: r.error }];
      if (r.need2fa) return { need2fa: true, ticket: r.ticket };
      db.event('login', r.playerId);
      if (kapi) kapi.onLogin(r.playerId);
      return { token: newSession(r.playerId), playerId: r.playerId };
    },
    'POST /api/account/login2fa': async (req) => {
      const { ticket, code } = await readBody(req);
      const r = accounts.login2fa(ticket, code);
      if (!r.ok) return [401, { error: r.error }];
      db.event('login', r.playerId, { twoFactor: true });
      if (kapi) kapi.onLogin(r.playerId);
      return { token: newSession(r.playerId), playerId: r.playerId, backupLeft: r.backupLeft };
    },
    'POST /api/account/verify': async (req) => {
      const { token } = await readBody(req);
      const r = accounts.verifyEmail(token);
      if (!r.ok) return [400, { error: r.error }];
      if (r.playerId) promo.redeemPending(r.playerId);
      // Kapı: doğrulanmış yeni hesap yer varsa vatandaş olur, yoksa bekleme sırasına girer (misafir gibi gezer)
      if (r.playerId && kapi) { kapi.admit(r.playerId); if (r.canLogin) kapi.onLogin(r.playerId); }
      return r.canLogin ? { ok: true, token: newSession(r.playerId), playerId: r.playerId } : { ok: true };
    },
    'POST /api/account/resend': async (req) => {
      const { email } = await readBody(req);
      return accounts.resendVerify(email);
    },
    // 🛡️ İki adımlı doğrulama (isteğe bağlı)
    'POST /api/account/2fa/setup': async (req, me) => {
      const r = await accounts.totpSetup(me);
      return r.ok ? r : [400, { error: r.error }];
    },
    'POST /api/account/2fa/enable': async (req, me) => {
      const { code } = await readBody(req);
      const r = await accounts.totpEnable(me, code);
      return r.ok ? r : [400, { error: r.error }];
    },
    'POST /api/account/2fa/disable': async (req, me) => {
      const { code } = await readBody(req);
      const r = await accounts.totpDisable(me, code);
      return r.ok ? r : [r.need2fa ? 403 : 400, { error: r.error, need2fa: !!r.need2fa }];
    },
    'POST /api/account/forgot': async (req) => {
      const { email } = await readBody(req);
      return accounts.forgot(email);
    },
    'POST /api/account/reset': async (req) => {
      const { token, password } = await readBody(req);
      const r = await accounts.reset(token, password);
      return r.ok ? { ok: true, twoFactor: r.twoFactor } : [400, { error: r.error }];
    },
    'GET /api/account/me': (req, me) => accounts.me(me) || [404, { error: 'Hesap yok' }],
    'POST /api/account/wallet/nonce': async (req, me) => {
      const { address } = await readBody(req);
      const r = accounts.walletNonce(me, address);
      return r.ok ? { message: r.message } : [400, { error: r.error }];
    },
    'POST /api/account/wallet/link': async (req, me) => {
      const { signature, code } = await readBody(req);
      if (typeof signature !== 'string' || signature.length > 200) return [400, { error: 'Eksik imza' }];
      const g = accounts.check2fa(me, code);
      if (!g.ok) return [403, { error: g.error, need2fa: true }];
      const r = await accounts.walletLink(me, signature);
      return r.ok ? r : [400, { error: r.error }];
    },
    'POST /api/account/wallet/confirm': async (req) => {
      const { token } = await readBody(req);
      const r = accounts.walletConfirm(token);
      return r.ok ? r : [400, { error: r.error }];
    },
    'POST /api/account/wallet/cancel': (req, me) => {
      const r = accounts.walletCancel(me);
      return r.ok ? r : [400, { error: r.error }];
    },
    'POST /api/account/logout': (req) => {
      const h = req.headers.authorization || '';
      db.raw.prepare('DELETE FROM sessions WHERE token = ?').run(tokenOzeti(h.slice(7).trim()));
      return { ok: true };
    },
  };
}
