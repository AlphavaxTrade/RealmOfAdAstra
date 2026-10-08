// Realm of AdAstra sunucusu — HTTP uç noktaları (ek kütüphane yok; Node'un kendi http modülü)
// ============================================================================
//  GET  /api/health                      sunucu ayakta mı
//  GET  /api/ready                       hazır mı (veritabanı + dünya zamanlayıcısı); değilse 503
//  GET  /metrics                         Prometheus ölçümleri (yönetici şifresi ya da yalnız yerel adres)
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
import { createMetrik } from './metrik.js';
import { istekBaglami } from './log.js';
import { createStatic } from './statik.js';
import genelRotalar from './rotalar/genel.js';
import hesapRotalari from './rotalar/hesap.js';
import oyunRotalari from './rotalar/oyun.js';
import cuzdanRotalari from './rotalar/cuzdan.js';
import pvpRotalari from './rotalar/pvp.js';
import ilanRotalari from './rotalar/ilan.js';
import yonetimRotalari from './rotalar/yonetim.js';
import crypto from 'node:crypto';
import fs from 'node:fs';


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
// Varsayılan HTTP zaman aşımları (ms). Caddy/Nginx arkasında boşta bağlantı ~2 dk yaşar: keepAlive 150 sn olmalı ki
// vekil sunucu bağlantıyı HER ZAMAN önce kapatsın (aksi halde "connection reset" 502'leri).
const HTTP_ZAMAN = { headers: 20000, request: 30000, keepAlive: 150000, interval: 5000, maxHeader: 16384 };
const ADMIN_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const userError = msg => Object.assign(new Error(msg), { userError: true });

const PUBLIC_ROUTES = ['GET /api/health', 'GET /api/ready', 'GET /api/rates', 'POST /api/account/register', 'POST /api/account/login', 'POST /api/account/login2fa', 'POST /api/account/verify',
  'POST /api/account/resend', 'POST /api/account/forgot', 'POST /api/account/reset', 'POST /api/account/wallet/confirm'];

export function createApp({ db, engine, world, accounts, payments = null, kasa = null, arena = null, promo = null, kapi = null, pazar = null, chain, cfg, clock = () => Date.now(), log = console, metrik = null }) {
  const E = engine;
  metrik = metrik || createMetrik();
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

  // Rotalar alan bazlı modüllerde (server/rotalar/*); bağımlılıklar tek nesneyle verilir
  const ctx = { db, E, world, accounts, payments, kasa, arena, promo, kapi, pazar, chain, cfg, clock, log, readBody, safePlayer, playerPayload, pazarOp, newSession, clientIp };
  const routes = {
    ...genelRotalar(ctx), ...hesapRotalari(ctx), ...oyunRotalari(ctx), ...cuzdanRotalari(ctx),
    ...pvpRotalari(ctx), ...ilanRotalari(ctx), ...yonetimRotalari(ctx)
  };
  const serveStatic = createStatic({ cfg, secHeaders: SEC_HEADERS });

  // Ölçüler (/metrics): veritabanı boyutu, bekleyen para işleri, dünya zamanlayıcısı nabzı. Hepsi ucuz tek sorgu; tarama başına bir kez çalışır.
  const sayiSorgu = sql => () => db.raw.prepare(sql).get().n;
  metrik.gauge('realm_db_dosya_bayt', 'Ana veritabanı dosyasının boyutu (WAL hariç)', () => db.raw.prepare('PRAGMA page_count').get().page_count * db.raw.prepare('PRAGMA page_size').get().page_size);
  metrik.gauge('realm_odeme_bekleyen', 'Gönderilmeyi bekleyen çekim/ödeme sayısı', sayiSorgu("SELECT COUNT(*) AS n FROM payouts WHERE status = 'pending'"));
  metrik.gauge('realm_kasa_islem_bekleyen', 'Oyun Kasası kuyruğunda bekleyen işlem sayısı', sayiSorgu("SELECT COUNT(*) AS n FROM kasa_ops WHERE status = 'pending'"));
  if (typeof world.tickDurumu === 'function') {
    const tur = f => () => { const t = world.tickDurumu(); return t ? f(t) : null; };
    metrik.gauge('realm_zamanlayici_tur_toplam', 'Biten dünya zamanlayıcı turu sayısı', tur(t => t.tur), 'counter');
    metrik.gauge('realm_zamanlayici_hata_toplam', 'Hatayla biten dünya zamanlayıcı turu sayısı', tur(t => t.hataSayisi), 'counter');
    metrik.gauge('realm_zamanlayici_son_sure_saniye', 'Son dünya zamanlayıcı turunun süresi', tur(t => (t.sonSureMs ?? NaN) / 1000));
    metrik.gauge('realm_zamanlayici_son_bitis_yas_saniye', 'Dünya zamanlayıcısının son turunu bitirmesinin üstünden geçen süre (takılırsa büyür)', tur(t => t.yasMs / 1000));
  }
  // Yanlış yönetici şifresi denemeleri: IP başına 10 dakikada 10 → sonra bekletilir
  const adminFails = new Map();
  const adminBlocked = ip => { const f = adminFails.get(ip); return !!(f && clock() - f.t < 600000 && f.n >= 10); };
  const adminFail = ip => { const now = clock(); let f = adminFails.get(ip); if (!f || now - f.t >= 600000) f = { t: now, n: 0 }; f.n++; adminFails.set(ip, f); if (adminFails.size > 10000) adminFails.clear(); };

  // Yönetici denetim izi: ne, ne zaman, hangi adresten, sonucu ne. İstek gövdesi ve denenen şifre ASLA yazılmaz.
  function denetimIzi(tip, route, ip, status) {
    try { db.event(tip, null, status == null ? { route, ip } : { route, ip, status }); }
    catch (err) { log.error('Denetim izi yazılamadı', route, err); }
  }

  async function handleInner(req, res) {
    const url = new URL(req.url, 'http://x');
    const key = `${req.method} ${url.pathname}`;
    const ip = clientIp(req);
    // Metrik/günlük etiketi: bilinen rota anahtarı ya da sabit bir ad (ham adres ASLA etiket olmaz: sınırsız çeşit ve sızıntı olurdu)
    req.rotaEtiketi = url.pathname.startsWith('/api/') ? (Object.hasOwn(routes, key) ? key : 'bilinmeyen')
      : url.pathname === '/metrics' ? 'GET /metrics' : url.pathname.startsWith('/admin') ? 'admin-sayfa' : 'statik';
    if (url.pathname === '/metrics') return metrikSun(req, res, ip);
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
    const adminYazma = key.startsWith('POST /api/admin');   // değiştiren yönetici işlemleri denetim izine yazılır (salt okunur GET yazılmaz)
    try {
      let me = null;
      if (key.startsWith('GET /api/admin') || key.startsWith('POST /api/admin')) {
        if (adminBlocked(ip)) return send(res, 429, { error: 'Çok fazla hatalı deneme; 10 dakika sonra tekrar dene.' });
        if (!isAdmin(req)) { adminFail(ip); denetimIzi('admin-yetkisiz', key, ip); return send(res, 401, { error: 'Yönetici yetkisi gerekli' }); }
      } else if (!PUBLIC_ROUTES.includes(key)) {
        me = auth(req);
        if (!me) return send(res, 401, { error: 'Giriş gerekli' });
        req.oyuncu = me;
      }
      if (limited(me || ip)) return send(res, 429, { error: 'Çok hızlı istek; biraz yavaşla' });
      if (PUBLIC_ROUTES.includes(key) && key !== 'GET /api/health' && key !== 'GET /api/ready' && limited('pub:' + ip, cfg.publicRateLimitPerSec || 5)) return send(res, 429, { error: 'Çok hızlı istek; biraz yavaşla' });
      const out = await route(req, me);
      if (adminYazma) denetimIzi('admin', key, ip, Array.isArray(out) ? out[0] : 200);
      if (Array.isArray(out)) return send(res, out[0], out[1]);
      return send(res, 200, out);
    } catch (err) {
      if (adminYazma) denetimIzi('admin', key, ip, err && err.userError ? 400 : 500);
      if (err && err.userError) return send(res, 400, { error: err.message });
      log.error('İstek hatası', key, err);
      return send(res, 500, { error: 'Sunucu hatası', istekKimligi: req.istekKimligi });   // iç ayrıntı dışarı verilmez; kimlik günlükte aranır
    }
  }

  // /metrics: yönetici şifresiyle ya da YALNIZ yerel adresten (aynı makinedeki Prometheus/Alloy). Önde vekil (Caddy) varsa
  // her dış istek X-Forwarded-For taşır; bu yüzden vekil üzerinden gelen şifresiz istek yerel sayılmaz (internete açık kalmaz).
  function metrikSun(req, res, ip) {
    const vekilli = !!(req.headers['x-forwarded-for'] || req.headers.forwarded);
    const yerel = !vekilli && /^(::1|127.0.0.1|::ffff:127.0.0.1)$/.test(req.socket.remoteAddress || '');
    if (req.method !== 'GET') return send(res, 404, { error: 'Bulunamadı' });
    if ((req.headers.authorization || '').startsWith('Bearer ')) {
      if (adminBlocked(ip)) return send(res, 429, { error: 'Çok fazla hatalı deneme; 10 dakika sonra tekrar dene.' });
      if (!isAdmin(req)) { adminFail(ip); denetimIzi('admin-yetkisiz', 'GET /metrics', ip); return send(res, 401, { error: 'Yetki gerekli' }); }
    } else if (!yerel) return send(res, 401, { error: 'Yetki gerekli' });
    res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(metrik.metin());
  }

  // Günlük işlevi eksik olabilir (eski testler yalnız log/warn/error veren sahte nesne geçer); yapılandırılmış günlük yoksa istek satırı yazılmaz
  const yapisalGunluk = log !== console && typeof log.info === 'function' && typeof log.debug === 'function';
  const SESSIZ_UCLAR = new Set(['GET /api/health', 'GET /api/ready', 'GET /metrics', 'statik']);   // sık yoklanan uçlar yalnız debug seviyesinde yazılır
  const GECERLI_KIMLIK = /^[A-Za-z0-9._-]{8,64}$/;

  // Hiçbir istek sunucuyu düşüremez: beklenmeyen her hata burada yakalanır.
  // Her isteğe bir kimlik verilir (vekilin ürettiği geçerli kimlik korunur; yoksa/zararlıysa yenisi), yanıt başlığına ve o istekte yazılan
  // her günlük satırına eklenir; bitince tek satır istek günlüğü ve metrik kaydı yazılır.
  async function handle(req, res) {
    const t0 = process.hrtime.bigint();
    const gelen = req.headers['x-request-id'];
    const id = typeof gelen === 'string' && GECERLI_KIMLIK.test(gelen) ? gelen : crypto.randomBytes(8).toString('hex');
    req.istekKimligi = id;
    res.setHeader('X-Request-Id', id);
    res.once('close', () => {
      const ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
      const etiket = req.rotaEtiketi || 'bilinmeyen';
      const durum = res.statusCode;
      metrik.istek(etiket, durum, ms / 1000);
      if (!yapisalGunluk) return;
      const sev = durum >= 500 ? 'warn' : (SESSIZ_UCLAR.has(etiket) && durum < 400 ? 'debug' : 'info');
      log[sev]('istek', { istek: id, yontem: req.method, rota: etiket, durum, ms, ...(req.oyuncu ? { oyuncu: req.oyuncu } : {}), ...(res.writableFinished ? {} : { kesildi: true }) });
    });
    await istekBaglami.run({ istek: id }, async () => {
      try { await handleInner(req, res); }
      catch (err) {
        log.error('Beklenmeyen istek hatası', err);
        try { if (!res.headersSent) send(res, 400, { error: 'Geçersiz istek' }); else res.end(); } catch { /* bağlantı kapanmış */ }
      }
    });
  }

  // Zaman aşımları açıkça ayarlı: başlığı/gövdeyi bitirmeyen yavaş istemci (slowloris) kesilir, aşırı büyük başlık 431 olur
  const zaman = { ...HTTP_ZAMAN, ...(cfg.httpTimeouts || {}) };
  const sunucu = () => http.createServer({
    headersTimeout: zaman.headers, requestTimeout: zaman.request, keepAliveTimeout: zaman.keepAlive,
    connectionsCheckingInterval: zaman.interval, maxHeaderSize: zaman.maxHeader
  }, handle);
  return { handle, server: sunucu, metrik };
}
