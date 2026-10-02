// Realm of Astra sunucusu — HTTP uç noktaları (ek kütüphane yok; Node'un kendi http modülü)
// ============================================================================
//  GET  /api/health                      sunucu ayakta mı
//  POST /api/auth/nonce   {address}      giriş için imzalanacak mesaj
//  POST /api/auth/verify  {address, signature}  → {token}
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
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };

export const loginMessage = (address, nonce) =>
  `Realm of Astra girişi\n\nCüzdan: ${address}\nKod: ${nonce}\n\nBu imza yalnızca giriş içindir; hiçbir işlem ya da ücret onaylamaz.`;

export function createApp({ db, engine, world, chain, cfg, clock = () => Date.now(), verifyLogin, log = console }) {
  const E = engine;
  const isAddr = a => typeof a === 'string' && /^0x[a-fA-F0-9]{40}$/.test(a);

  // Basit hız sınırı: oturum başına saniyede en fazla cfg.rateLimitPerSec (varsayılan 15) istek
  const rate = new Map();
  function limited(key) {
    const now = clock();
    const r = rate.get(key) || { t: now, n: 0 };
    if (now - r.t > 1000) { r.t = now; r.n = 0; }
    r.n++;
    rate.set(key, r);
    if (rate.size > 50000) rate.clear();
    return r.n > (cfg.rateLimitPerSec || 15);
  }

  function send(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(new Error('İstek çok büyük')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('Geçersiz JSON')); } });
      req.on('error', reject);
    });
  }

  function auth(req) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!token) return null;
    const s = db.q.sessionGet.get(token);
    if (!s || s.expires < clock()) return null;
    const p = db.q.playerGet.get(s.address);
    if (!p || p.banned) return null;
    return s.address;
  }

  function isAdmin(req) {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!cfg.adminToken || !t) return false;
    const a = Buffer.from(t), b = Buffer.from(cfg.adminToken);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // Oyuncu işlemi: hata olursa veritabanı ve bellekteki dünya geri alınır
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
    return { player: state, world: E.worldSnapshot(), address, epochId: E.globalPool.state.epochId };
  }

  const routes = {
    'GET /api/health': () => ({ ok: true, time: clock(), version: E.GAME_CONFIG.GAME_VERSION, chain: !!chain, payoutMode: cfg.payoutMode }),

    'POST /api/auth/nonce': async (req) => {
      const { address } = await readBody(req);
      if (!isAddr(address)) return [400, { error: 'Geçersiz cüzdan adresi' }];
      const a = address.toLowerCase();
      const nonce = crypto.randomBytes(16).toString('hex');
      db.q.nonceSet.run(a, nonce, clock() + 10 * 60000);
      return { message: loginMessage(a, nonce) };
    },

    'POST /api/auth/verify': async (req) => {
      const { address, signature } = await readBody(req);
      if (!isAddr(address) || typeof signature !== 'string' || signature.length > 200) return [400, { error: 'Eksik bilgi' }];
      const a = address.toLowerCase();
      const n = db.q.nonceGet.get(a);
      if (!n || n.expires < clock()) return [401, { error: 'Giriş kodunun süresi doldu, tekrar dene' }];
      let signer = '';
      try { signer = verifyLogin(loginMessage(a, n.nonce), signature); } catch { signer = ''; }
      if (signer !== a) return [401, { error: 'İmza doğrulanamadı' }];
      db.q.nonceDel.run(a);
      const token = crypto.randomBytes(32).toString('hex');
      db.q.playerAdd.run(a, clock(), clock());
      db.q.sessionAdd.run(token, a, clock() + cfg.sessionDays * 86400000);
      db.q.sessionsPurge.run(clock());
      world.creditDeposits(a);
      db.event('login', a);
      return { token, address: a };
    },

    'GET /api/state': (req, me) => {
      const out = safePlayer(me, () => null);
      if (out.error) return [500, { error: out.result.message }];
      return playerPayload(me, out.state);
    },

    'POST /api/action': async (req, me) => {
      const { name, args } = await readBody(req);
      if (typeof name !== 'string') return [400, { error: 'İşlem adı gerekli' }];
      const res = safePlayer(me, g => E.runAction(g, name, Array.isArray(args) ? args : []));
      if (res.error) return [500, { error: res.result.message }];
      if (res.result && res.result.rejected) return [400, { error: res.result.message }];
      return { result: res.result, ...playerPayload(me, res.state) };
    },

    'GET /api/wallet': (req, me) => ({
      gameWallet: chain ? chain.gameWallet : null,
      tokenAddress: cfg.tokenAddress,
      deposits: db.q.depositsOf.all(me),
      withdraw: world.withdrawStatus(me)
    }),

    'POST /api/withdraw': async (req, me) => {
      const { amount } = await readBody(req);
      try { return db.tx(() => world.requestWithdraw(me, amount)); }
      catch (err) { E.reloadWorld(); log.error(err); return [500, { error: 'Sunucu hatası' }]; }
    },

    'POST /api/withdraw/cancel': (req, me) => {
      try { return db.tx(() => world.cancelWithdraw(me)); }
      catch (err) { E.reloadWorld(); log.error(err); return [500, { error: 'Sunucu hatası' }]; }
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
        payouts: db.q.payoutsRecent.all(50),
        events: db.q.eventsRecent.all(50)
      };
    },
    'POST /api/admin/pause': async (req) => { const { paused } = await readBody(req); return world.setPaused(!!paused); },
    'POST /api/admin/payouts/run': async () => world.processPayouts({ force: true }),
    'POST /api/admin/weekly/run': async () => world.runWeekly(E.globalPool.state.epochId - 1)
  };

  function serveStatic(req, res) {
    if (!cfg.serveDist) { res.writeHead(404); return res.end(); }
    const root = path.resolve(cfg.distDir);
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.resolve(root, '.' + p);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Oyun dosyaları bulunamadı: önce "npm run build" çalıştırın.'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
    fs.createReadStream(file).pipe(res);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const key = `${req.method} ${url.pathname}`;
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      const html = fs.readFileSync(new URL('./admin.html', import.meta.url), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
      return res.end(html);
    }
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);
    const route = routes[key];
    if (!route) return send(res, 404, { error: 'Bulunamadı' });
    try {
      let me = null;
      if (key.startsWith('GET /api/admin') || key.startsWith('POST /api/admin')) {
        if (!isAdmin(req)) return send(res, 401, { error: 'Yönetici yetkisi gerekli' });
      } else if (!['GET /api/health', 'POST /api/auth/nonce', 'POST /api/auth/verify'].includes(key)) {
        me = auth(req);
        if (!me) return send(res, 401, { error: 'Giriş gerekli' });
      }
      const ip = req.socket.remoteAddress || '';
      if (limited(me || ip)) return send(res, 429, { error: 'Çok hızlı istek; biraz yavaşla' });
      const out = await route(req, me);
      if (Array.isArray(out)) return send(res, out[0], out[1]);
      return send(res, 200, out);
    } catch (err) {
      log.error('İstek hatası', key, err);
      return send(res, 400, { error: String(err.message || err).slice(0, 200) });
    }
  }

  return { handle, server: () => http.createServer(handle) };
}
