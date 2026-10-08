// Realm of AdAstra sunucusu — oyunun derlenmiş dosyalarını (dist/) sunar
// (kurumsal A3.9: server/app.js'ten AYNEN taşındı; davranış değişmedi)
import fs from 'node:fs';
import path from 'node:path';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };

// Vite'ın içerik özetli dosya adları (index-AbCd1234.js): içerik değişince ad değişir, bu yüzden 1 yıl "immutable" önbellek güvenli
const OZETLI_DOSYA = /-[A-Za-z0-9_-]{8}\.(?:js|css)$/;

// Oyun sayfası: yalnız kendi dosyalarımız çalışır; dışarıdan kod yüklenemez, sayfaya sokulan kod çalışmaz,
// veriler yalnız kendi sunucumuza gönderilebilir (Google yazı tipleri hariç). Cüzdan eklentileri (Core/MetaMask) etkilenmez.
const GAME_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";

// secHeaders: createApp'in hesapladığı güvenlik başlıkları (HSTS https yayınında eklenir)
export function createStatic({ cfg, secHeaders: SEC_HEADERS }) {
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

  return serveStatic;
}
