// Realm of AdAstra sunucusu — HTTP uç noktaları (ek kütüphane yok; Node'un kendi http modülü)
// ============================================================================
//  GET  /api/health                      sunucu ayakta mı
//  POST /api/account/register {email, password}   kayıt → {token}
//  POST /api/account/login    {email, password}   giriş → {token}
//  POST /api/account/verify   {token}             e-posta doğrulama (e-postadaki bağlantı)
//  POST /api/account/forgot   {email}             şifre sıfırlama e-postası
//  POST /api/account/reset    {token, password}   yeni şifre
//  POST /api/account/wallet/confirm {token}       cüzdan bağlama onayı (e-postadaki bağlantı)
//  GET  /api/account/me                           hesap + bağlı cüzdan durumu           (giriş gerekli)
//  POST /api/account/resend                       doğrulama e-postasını yeniden gönder  (giriş gerekli)
//  POST /api/account/wallet/nonce {address}       cüzdana imzalatılacak mesaj           (giriş gerekli)
//  POST /api/account/wallet/link  {signature}     imza → e-posta onayı istenir          (giriş gerekli)
//  POST /api/account/wallet/cancel                bekleyen cüzdan değişikliğini iptal   (giriş gerekli)
//  POST /api/account/logout                       bu cihazdan çıkış                     (giriş gerekli)
//  GET  /api/state                       oyuncu kaydı + dünya görüntüsü           (giriş gerekli)
//  POST /api/action       {name, args}   oyun işlemi (beyaz liste, server/actions.js) (giriş gerekli)
//  GET  /api/wallet                      yatırma adresi, çekim durumu, geçmiş    (giriş gerekli)
//  POST /api/withdraw     {amount}       çekim talebi (serbest bakiyeden)         (giriş gerekli)
//  POST /api/withdraw/cancel             talebi geri al                           (giriş gerekli)
//  GET  /api/admin/status                sunucu, kasa, ödeme özeti                (ADMIN_TOKEN)
//  POST /api/admin/pause  {paused}       çekim ve ödemeleri durdur/başlat         (ADMIN_TOKEN)
//  POST /api/admin/payouts/run           bekleyen ödemeleri şimdi gönder          (ADMIN_TOKEN)
//  POST /api/admin/weekly/run            haftalık hesaplaşmayı elle çalıştır (test) (ADMIN_TOKEN)
//  GET  /admin                           yönetici paneli sayfası (şifre sayfada sorulur)
// Diğer tüm adresler: oyunun derlenmiş dosyaları (dist/).
// ============================================================================
import http from 'node:http';
import { createPromo } from './promo.js';
import { tokenOzeti } from './oturum.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };

// Tarayıcı korumaları (her yanıta). HSTS yalnız HTTPS adresiyle yayınlanırken eklenir (createApp içinde).
// COOP same-origin-allow-popups: sayfa başka sitelerin penceresiyle bağ kurmaz ama cüzdan açılır pencereleri çalışır.
const SEC_BASE = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
};
const HSTS = 'max-age=31536000; includeSubDomains';
// Vite'ın içerik özetli dosya adları (index-AbCd1234.js): içerik değişince ad değişir, bu yüzden 1 yıl "immutable" önbellek güvenli
const OZETLI_DOSYA = /-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
// Varsayılan HTTP zaman aşımları (ms). Caddy/Nginx arkasında boşta bağlantı ~2 dk yaşar: keepAlive 150 sn olmalı ki
// vekil sunucu bağlantıyı HER ZAMAN önce kapatsın (aksi halde "connection reset" 502'leri).
const HTTP_ZAMAN = { headers: 20000, request: 30000, keepAlive: 150000, interval: 5000, maxHeader: 16384 };
const ADMIN_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
// Oyun sayfası: yalnız kendi dosyalarımız çalışır; dışarıdan kod yüklenemez, sayfaya sokulan kod çalışmaz,
// veriler yalnız kendi sunucumuza gönderilebilir (Google yazı tipleri hariç). Cüzdan eklentileri (Core/MetaMask) etkilenmez.
const GAME_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
const userError = msg => Object.assign(new Error(msg), { userError: true });

const PUBLIC_ROUTES = ['GET /api/health', 'GET /api/rates', 'POST /api/account/register', 'POST /api/account/login', 'POST /api/account/login2fa', 'POST /api/account/verify',
  'POST /api/account/resend', 'POST /api/account/forgot', 'POST /api/account/reset', 'POST /api/account/wallet/confirm'];

export function createApp({ db, engine, world, accounts, payments = null, kasa = null, arena = null, promo = null, kapi = null, pazar = null, chain, cfg, clock = () => Date.now(), log = console }) {
  const E = engine;
  const SEC_HEADERS = String(cfg.publicUrl || '').startsWith('https://') ? { ...SEC_BASE, 'Strict-Transport-Security': HSTS } : SEC_BASE;
  promo = promo || createPromo({ db, engine, clock, log });   // 🎟️ promo kodları (server/promo.js)
  const isAddr = a => typeof a === 'string' && /^0x[a-fA-F0-9]{40}$/.test(a);

  // Basit hız sınırı: oturum başına saniyede en fazla cfg.rateLimitPerSec (varsayılan 15) istek
  const rate = new Map();
  function limited(key, max = cfg.rateLimitPerSec || 15) {
    const now = clock();
    const r = rate.get(key) || { t: now, n: 0 };
    if (now - r.t > 1000) { r.t = now; r.n = 0; }
    r.n++;
    rate.set(key, r);
    if (rate.size > 50000) rate.clear();
    return r.n > max;
  }

  // Sunucunun önünde HTTPS katmanı (Caddy/Nginx) varsa gerçek ziyaretçi adresi X-Forwarded-For'dadır
  // Gerçek ziyaretçi adresi. Önde güvenilen tek bir vekil (Caddy/Nginx) varsa, onun eklediği SON adres alınır;
  // ilk adresler ziyaretçinin kendi yazabildiği kısımdır (sahte olabilir).
  const clientIp = req => {
    if (cfg.trustProxy) {
      const parts = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
    return req.socket.remoteAddress || '';
  };

  function newSession(playerId) {
    const token = crypto.randomBytes(32).toString('hex');
    db.q.sessionAdd.run(tokenOzeti(token), playerId, clock() + cfg.sessionDays * 86400000);   // tabloda özet saklanır (oturum.js)
    db.q.sessionsPurge.run(clock());
    db.q.playerSeen.run(clock(), playerId);
    return token;
  }

  function send(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { ...SEC_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(userError('İstek çok büyük')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        try {
          const v = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
          if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(userError('Geçersiz istek'));
          resolve(v);
        } catch { reject(userError('Geçersiz JSON')); }
      });
      req.on('error', reject);
    });
  }

  function auth(req) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!token) return null;
    const s = db.q.sessionGet.get(tokenOzeti(token));
    if (!s || s.expires < clock()) return null;
    const p = db.q.playerGet.get(s.address);
    if (!p || p.banned) return null;
    return s.address;
  }

  function isAdmin(req) {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!cfg.adminToken || cfg.adminToken.length < 24 || !t) return false;   // kısa yönetici şifresi kabul edilmez
    const a = Buffer.from(t), b = Buffer.from(cfg.adminToken);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // Oyuncu işlemi: hata olursa veritabanı ve bellekteki dünya geri alınır
  // İlan pazarı işlemi: yalnız vatandaşlar; kullanıcı hatası 400, beklenmeyen hata 500 (veritabanı geri alınır)
  async function pazarOp(me, fn) {
    if (!pazar) return [404, { error: 'İlan pazarı kapalı' }];
    if (kapi && !kapi.isCitizen(me)) return [403, { error: '⏳ İlan pazarı yalnız vatandaşlara açık; sıran gelince kullanabilirsin.' }];
    try { const r = await fn(); db.q.playerSeen.run(clock(), me); return { result: r.result, ...playerPayload(me, r.state) }; }
    catch (err) { if (err.userError) return [400, { error: err.message }]; log.error('İlan pazarı hatası', me, err); return [500, { error: 'Sunucu hatası, işlem yapılmadı.' }]; }
  }

  function safePlayer(address, fn) {
    try {
      return db.tx(() => { const out = E.withPlayer(address, fn); db.q.playerSeen.run(clock(), address); return out; });
    } catch (err) {
      E.reloadWorld();
      log.error('İşlem hatası', address, err);
      return { result: { success: false, message: 'Sunucu hatası, işlem yapılmadı.' }, state: null, error: true };
    }
  }

  function playerPayload(address, state) {
    const world = E.worldSnapshot();
    if (kapi) world.kapi = kapi.publicSummary();   // Kapı: sınır, vatandaş / sıra sayıları, gösterge (Sirius Konseyi ekranı)
    return { player: state, world, address, epochId: E.globalPool.state.epochId, gate: kapi ? kapi.statusOf(address) : null };
  }

  const routes = {
    // ADA nereye gidiyor: oranlar herkese açık (RealmRates sözleşmesi)
    'GET /api/rates': () => (world.ratesStatus ? world.ratesStatus() : [404, { error: 'Kapalı' }]),
    'GET /api/health': () => ({ ok: true, time: clock(), version: E.GAME_CONFIG.GAME_VERSION, chain: !!chain, payoutMode: cfg.payoutMode, testMode: !!cfg.testMode, payments: payments ? payments.info() : null }),

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
      const r = accounts.login(email, password, clientIp(req));
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

    'GET /api/state': (req, me) => {
      const out = safePlayer(me, () => null);
      if (out.error) return [500, { error: out.result.message }];
      return playerPayload(me, out.state);
    },

    'POST /api/action': async (req, me) => {
      const { name, args } = await readBody(req);
      if (typeof name !== 'string') return [400, { error: 'İşlem adı gerekli' }];
      if (kapi && !kapi.isCitizen(me)) {
        const g = kapi.statusOf(me);
        return [403, { error: g.status === 'waiting' ? `⏳ Bekleme sırasındasın (${g.position || '?'}. sıra, ${g.citizens}/${g.limit} vatandaş). Vadiyi gezebilirsin; yerin açılınca haber veririz.` : '⏸️ Yerin askıda. Yeniden giriş yaptığında sıranın önüne alınırsın; ilk boşalan yer senin.' }];
      }
      const res = safePlayer(me, g => E.runAction(g, name, Array.isArray(args) ? args : []));
      if (res.error) return [500, { error: res.result.message }];
      if (res.result && res.result.rejected) return [400, { error: res.result.message }];
      return { result: res.result, ...playerPayload(me, res.state) };
    },

    'GET /api/wallet': (req, me) => ({
      account: accounts.me(me),
      gameWallet: chain ? chain.gameWallet : null,
      tokenAddress: cfg.tokenAddress,
      deposits: db.q.depositsOf.all(me),
      withdraw: world.withdrawStatus(me)
    }),

    'POST /api/withdraw': async (req, me) => {
      const { amount, code } = await readBody(req);
      if (!accounts.isVerified(me)) return { success: false, message: 'Çekim için önce e-posta adresini doğrula.' };
      const g = accounts.check2fa(me, code);
      if (!g.ok) return [403, { error: g.error, need2fa: true }];
      if (!accounts.activeWallet(me)) return { success: false, message: 'Çekim için önce hesabına bir cüzdan bağla.' };
      try { return db.tx(() => world.requestWithdraw(me, amount)); }
      catch (err) { E.reloadWorld(); log.error(err); return [500, { error: 'Sunucu hatası' }]; }
    },

    'POST /api/withdraw/cancel': (req, me) => {
      try { return db.tx(() => world.cancelWithdraw(me)); }
      catch (err) { E.reloadWorld(); log.error(err); return [500, { error: 'Sunucu hatası' }]; }
    },

    // 🏦 Oyun Kasası
    'GET /api/kasa': (req, me) => (kasa ? kasa.status(me) : { enabled: false }),
    'POST /api/kasa/refresh': async (req, me) => {
      if (!kasa || !kasa.enabled) return { enabled: false };
      try { await kasa.refresh(me); } catch (err) { return [503, { error: 'Zincir bakiyesi okunamadı, birazdan tekrar dene.' }]; }
      return kasa.status(me);
    },
    'POST /api/kasa/withdraw': async (req, me) => {
      if (!kasa) return [404, { error: 'Kapalı' }];
      const { asset, amount, code } = await readBody(req);
      const g = accounts.check2fa(me, code);
      if (!g.ok) return [403, { error: g.error, need2fa: true }];
      const r = kasa.withdraw(me, asset, amount);
      return r.ok ? r : [400, { error: r.error }];
    },
    'POST /api/kasa/test-deposit': async (req, me) => {
      if (!kasa || !cfg.testMode) return [404, { error: 'Yalnız deneme sunucusunda' }];
      const { ada, avax } = await readBody(req);
      const r = kasa.simulateDeposit(me, Math.min(1e7, Number(ada) || 0), Math.min(10, Number(avax) || 0));
      return r.ok ? kasa.status(me) : [400, { error: r.error }];
    },

    // 💳 Cüzdandan ödeme (kazanılmış bakiye yetmeyince)
    'POST /api/pay/quote': async (req, me) => {
      if (!payments) return [404, { error: 'Kapalı' }];
      const { name, args } = await readBody(req);
      try {
        const r = payments.quote(me, name, Array.isArray(args) ? args : []);
        return r.ok ? r : [400, { error: r.error }];
      } catch (err) { E.reloadWorld(); log.error('Ödeme teklifi', err); return [500, { error: 'Sunucu hatası' }]; }
    },
    'POST /api/pay/confirm': async (req, me) => {
      if (!payments) return [404, { error: 'Kapalı' }];
      const { ref, txHash } = await readBody(req);
      const r = await payments.confirm(me, ref, txHash);
      if (!r.ok) return [r.retry ? 409 : 400, { error: r.error, retry: !!r.retry }];
      return { paid: r.paid, result: r.result, ...playerPayload(me, r.state) };
    },

    // ⚔️ Kolezyum — gerçek rakipler
    'POST /api/pvp/queue': async (req, me) => {
      const { mode, indices } = await readBody(req);
      if (!arena) return [404, { error: 'Kapalı' }];
      if (!['1v1', '3v3'].includes(mode) || !Array.isArray(indices) || indices.length > 3 || !indices.every(i => Number.isInteger(i) && i >= 0 && i < 64)) return [400, { error: 'Geçersiz seçim' }];
      try {
        const out = db.tx(() => { const o = arena.queue(me, mode, indices); db.q.playerSeen.run(clock(), me); return o; });
        return { result: out.result, ...playerPayload(me, out.state) };
      } catch (err) { E.reloadWorld(); log.error('PvP', err); return [500, { error: 'Sunucu hatası' }]; }
    },
    'POST /api/pvp/leave': (req, me) => {
      if (!arena) return [404, { error: 'Kapalı' }];
      try {
        const out = db.tx(() => arena.leave(me));
        return { result: out.result, ...playerPayload(me, out.state) };
      } catch (err) { E.reloadWorld(); log.error('PvP', err); return [500, { error: 'Sunucu hatası' }]; }
    },
    // 🧪 Deneme sunucusu: test menüsündeki "vanilla sıfırla" — dünya ve bütün kayıtlar ilk güne (giriş gerekli)
    'POST /api/dev/vanilla-reset': (req, me) => {
      if (!cfg.testMode) return [404, { error: 'Yalnız deneme sunucusunda' }];
      try { return world.vanillaReset(); } catch (err) { return [400, { error: err.message }]; }
    },
    'POST /api/promo/redeem': async (req, me) => {
      const { code } = await readBody(req);
      const r = promo.redeem(me, code);
      return r.success ? { ok: true, message: r.message } : [400, { error: r.message }];
    },
    // ── İlan pazarı (teçhizat; server/pazar.js) ──
    'GET /api/pazar': (req, me) => (pazar ? pazar.list(me) : [404, { error: 'İlan pazarı kapalı' }]),
    'POST /api/pazar/sell': async (req, me) => pazarOp(me, async () => { const { ref, price } = await readBody(req); return pazar.sell(me, ref, price); }),
    'POST /api/pazar/cancel': async (req, me) => pazarOp(me, async () => { const { id } = await readBody(req); return pazar.cancel(me, id); }),
    'POST /api/pazar/buy': async (req, me) => pazarOp(me, async () => { const { id } = await readBody(req); return pazar.buy(me, id); }),
    'GET /api/pvp/status': (req, me) => (arena ? arena.status(me) : [404, { error: 'Kapalı' }]),
    'GET /api/pvp/match': (req) => {
      const id = Number(new URL(req.url, 'http://x').searchParams.get('id'));
      const m = arena && Number.isInteger(id) ? arena.getMatch(id) : null;
      return m || [404, { error: 'Maç bulunamadı' }];
    },

    'GET /api/admin/status': () => {
      const e = world.econ();
      const players = db.q.playersAll.all();
      return {
        time: clock(), epochId: E.globalPool.state.epochId, nextWeekAt: E.globalPool.state.epochEndTime,
        payoutMode: cfg.payoutMode, canSend: !!(chain && chain.canSend), gameWallet: chain ? chain.gameWallet : null,
        paused: !!e.paused, market: e.market || null, brake: e.brake || null, priceMultiplier: e.priceMultiplier || 1,
        lastWeekly: e.lastWeekly || null, weeklyCap: world.currentCap(),
        players: { total: players.length, activeWeek: players.filter(p => p.last_seen >= clock() - 7 * 86400000).length,
          depositors: players.filter(p => p.deposited_ada > 0).length,
          pendingWithdraw: players.reduce((s, p) => s + (p.pending_withdraw || 0), 0) },
        treasury: E.treasury.state.pools,
        kapi: kapi ? kapi.adminSummary() : null,
        universeStage: world.universeStage ? world.universeStage() : (Number(E.GAME_CONFIG.UNIVERSE_STAGE) || 0),
        chainId: cfg.chainId, tokenAddress: cfg.tokenAddress, paymentsContract: cfg.paymentsContract || null,
        reserveWallet: cfg.reserveWallet || null, contractOwner: cfg.contractOwner || null,
        hotWallet: e.hotWallet || null, hotNeed: world.hotWalletNeed ? world.hotWalletNeed() : null,
        partnerIncome: world.partnerIncomeStatus ? world.partnerIncomeStatus() : null,
        rates: world.ratesStatus ? world.ratesStatus() : null,
        payouts: db.q.payoutsRecent.all(50),
        events: db.q.eventsRecent.all(50)
      };
    },
    'GET /api/admin/promo': () => ({ codes: promo.list() }),
    'POST /api/admin/promo/create': async (req) => promo.create(await readBody(req)),
    'POST /api/admin/promo/active': async (req) => { const { code, active } = await readBody(req); return promo.setActive(code, !!active); },
    'POST /api/admin/pause': async (req) => { const { paused } = await readBody(req); return world.setPaused(!!paused); },
    'POST /api/admin/payouts/run': async () => world.processPayouts({ force: true }),
    'POST /api/admin/weekly/run': async () => world.runWeekly(E.globalPool.state.epochId - 1),
    'POST /api/admin/rates/sync': async () => (world.syncRates ? (await world.syncRates()) || { skipped: 'oran sözleşmesi tanımlı değil' } : { skipped: true }),
    'POST /api/admin/hotwallet/check': async () => (world.checkHotWallet ? (await world.checkHotWallet()) || { skipped: 'zincir yok' } : { skipped: true }),
    // Kapı kuralı (yönetici kolu): sınır / dönem, şimdi işlet, bir hesabı elle içeri al / sıraya koy / askıya al
    'POST /api/admin/kapi': async (req) => { if (!kapi) return [404, { error: 'Kapı kapalı' }]; const { limit, tier } = await readBody(req); try { return kapi.adminSet({ limit, tier }); } catch (err) { return [400, { error: err.message }]; } },
    'POST /api/admin/universe-stage': async (req) => { const { stage } = await readBody(req); try { return world.setUniverseStage(stage); } catch (err) { return [400, { error: err.message }]; } },
    'POST /api/admin/kapi/run': async () => (kapi ? { ...kapi.run(), ...kapi.publicSummary() } : [404, { error: 'Kapı kapalı' }]),
    'POST /api/admin/kapi/player': async (req) => { if (!kapi) return [404, { error: 'Kapı kapalı' }]; const { playerId, status } = await readBody(req); try { return kapi.adminSetPlayer(String(playerId || ''), String(status || '')); } catch (err) { return [400, { error: err.message }]; } }
  };

  function serveStatic(req, res, pathname) {
    if (!cfg.serveDist) { res.writeHead(404, SEC_HEADERS); return res.end(); }
    const root = path.resolve(cfg.distDir);
    let p;
    try { p = decodeURIComponent(pathname); } catch { res.writeHead(400, SEC_HEADERS); return res.end(); }
    if (p.includes('\0')) { res.writeHead(400, SEC_HEADERS); return res.end(); }
    let file = path.resolve(root, '.' + p);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403, SEC_HEADERS); return res.end(); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Oyun dosyaları bulunamadı: önce "npm run build" çalıştırın.'); }
    const ext = path.extname(file).toLowerCase();
    const s = fs.createReadStream(file);
    s.on('error', () => { if (!res.headersSent) res.writeHead(500, SEC_HEADERS); res.end(); });
    res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : OZETLI_DOSYA.test(file) ? 'public, max-age=31536000, immutable' : 'public, max-age=86400', ...(ext === '.html' ? { 'Content-Security-Policy': GAME_CSP } : {}) });
    s.pipe(res);
  }

  // Yanlış yönetici şifresi denemeleri: IP başına 10 dakikada 10 → sonra bekletilir
  const adminFails = new Map();
  const adminBlocked = ip => { const f = adminFails.get(ip); return !!(f && clock() - f.t < 600000 && f.n >= 10); };
  const adminFail = ip => { const now = clock(); let f = adminFails.get(ip); if (!f || now - f.t >= 600000) f = { t: now, n: 0 }; f.n++; adminFails.set(ip, f); if (adminFails.size > 10000) adminFails.clear(); };

  async function handleInner(req, res) {
    const url = new URL(req.url, 'http://x');
    const key = `${req.method} ${url.pathname}`;
    const ip = clientIp(req);
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      const html = fs.readFileSync(new URL('./admin.html', import.meta.url), 'utf8');
      res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': ADMIN_CSP });
      return res.end(html);
    }
    if (url.pathname === '/admin.js') {
      const code = fs.readFileSync(new URL('./admin.js', import.meta.url), 'utf8');
      res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(code);
    }
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
    // Oyun dosyaları başka adresten (Vercel) sunuluyorsa: yalnız CORS_ORIGINS'teki adreslere izin (giriş anahtarı başlıkta, çerez yok)
    const origin = req.headers.origin;
    if (origin && (cfg.corsOrigins || []).includes(origin) && !url.pathname.startsWith('/api/admin')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Max-Age', '86400');
      if (req.method === 'OPTIONS') { res.writeHead(204, SEC_HEADERS); return res.end(); }
    }
    // IP başına genel sınır: kimlik denetiminden ÖNCE (yanlış şifre/anahtar denemeleri de sayılır)
    if (limited('ip:' + ip, cfg.ipRateLimitPerSec || 40)) return send(res, 429, { error: 'Çok hızlı istek; biraz yavaşla' });
    const route = Object.hasOwn(routes, key) ? routes[key] : null;
    if (!route) return send(res, 404, { error: 'Bulunamadı' });
    try {
      let me = null;
      if (key.startsWith('GET /api/admin') || key.startsWith('POST /api/admin')) {
        if (adminBlocked(ip)) return send(res, 429, { error: 'Çok fazla hatalı deneme; 10 dakika sonra tekrar dene.' });
        if (!isAdmin(req)) { adminFail(ip); return send(res, 401, { error: 'Yönetici yetkisi gerekli' }); }
      } else if (!PUBLIC_ROUTES.includes(key)) {
        me = auth(req);
        if (!me) return send(res, 401, { error: 'Giriş gerekli' });
      }
      if (limited(me || ip)) return send(res, 429, { error: 'Çok hızlı istek; biraz yavaşla' });
      if (PUBLIC_ROUTES.includes(key) && key !== 'GET /api/health' && limited('pub:' + ip, cfg.publicRateLimitPerSec || 5)) return send(res, 429, { error: 'Çok hızlı istek; biraz yavaşla' });
      const out = await route(req, me);
      if (Array.isArray(out)) return send(res, out[0], out[1]);
      return send(res, 200, out);
    } catch (err) {
      if (err && err.userError) return send(res, 400, { error: err.message });
      log.error('İstek hatası', key, err);
      return send(res, 500, { error: 'Sunucu hatası' });   // iç ayrıntı dışarı verilmez
    }
  }

  // Hiçbir istek sunucuyu düşüremez: beklenmeyen her hata burada yakalanır
  async function handle(req, res) {
    try { await handleInner(req, res); }
    catch (err) {
      log.error('Beklenmeyen istek hatası', err);
      try { if (!res.headersSent) send(res, 400, { error: 'Geçersiz istek' }); else res.end(); } catch { /* bağlantı kapanmış */ }
    }
  }

  // Zaman aşımları açıkça ayarlı: başlığı/gövdeyi bitirmeyen yavaş istemci (slowloris) kesilir, aşırı büyük başlık 431 olur
  const zaman = { ...HTTP_ZAMAN, ...(cfg.httpTimeouts || {}) };
  const sunucu = () => http.createServer({
    headersTimeout: zaman.headers, requestTimeout: zaman.request, keepAliveTimeout: zaman.keepAlive,
    connectionsCheckingInterval: zaman.interval, maxHeaderSize: zaman.maxHeader
  }, handle);
  return { handle, server: sunucu };
}
