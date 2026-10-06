// Oyunun dosyalarını Vercel'e yükler: https://realmofadastra.vercel.app (kullanıcı kararı 6 Ekim 2026, "A yolu")
// ============================================================================
// Vercel yalnız oyunun dosyalarını sunar; oyun sunucusu (server/) başka bir makinede çalışır. Oyuncunun tarayıcısı
// sunucuyla doğrudan konuşur, bu yüzden Vercel'in ücretsiz kotası yalnız sayfa açılışlarını sayar.
//
//   node scripts/vercel-yukle.mjs                          → sunucusuz (tarayıcı) sürüm
//   node scripts/vercel-yukle.mjs https://sunucu-adresi    → çevrimiçi sürüm (sunucuda CORS_ORIGINS=https://realmofadastra.vercel.app)
//
// Erişim anahtarı: REALM_VERCEL_TOKEN ortam değişkeni ya da %USERPROFILE%\.realm_vercel_token dosyası (koda, kayda yazılmaz).
// Proje bilgisi data/vercel-proje.json içinde tutulur (data/ GitHub'a gitmez).
// ============================================================================
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'realmofadastra';
const tokenFile = path.join(os.homedir(), '.realm_vercel_token');
const token = (process.env.REALM_VERCEL_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '')).trim();
if (!/^[A-Za-z0-9_-]{10,}$/.test(token)) { console.error(`❌ Vercel erişim anahtarı yok: ${tokenFile} dosyasına kaydet.`); process.exit(1); }

const api = String(process.argv[2] || process.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
if (api && !/^https:\/\/[^/\s]+$/.test(api)) { console.error('❌ Sunucu adresi https:// ile başlamalı (Vercel sitesi güvenli bağlantıyla açılır; tarayıcı http sunucuya bağlanmaz).'); process.exit(1); }

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) { console.error(`❌ ${cmd} ${args[0]} başarısız`); process.exit(r.status || 1); }
};

console.log(api ? `🌐 Çevrimiçi sürüm: oyun sunucusu ${api}` : '🖥️ Sunucusuz sürüm (herkes kendi tarayıcısında oynar)');
run('npm', ['run', 'build'], { cwd: ROOT, env: { ...process.env, VITE_API_URL: api } });

// Yükleme klasörü: adı proje adıdır (realmofadastra → realmofadastra.vercel.app)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'realm-'));
const dir = path.join(tmp, NAME);
fs.cpSync(path.join(ROOT, 'dist'), dir, { recursive: true });

const csp = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:", "media-src 'self' data: blob:", `connect-src 'self'${api ? ' ' + api : ''}`, "worker-src 'self' blob:", "object-src 'none'",
  "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'"].join('; ');
const sec = [
  { key: 'Content-Security-Policy', value: csp }, { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }
];
// Önbellek (ücretsiz kotanın asıl koruması): dosyalar tarayıcıda saklanır, her açılışta yeniden istenmez.
// Adında parmak izi olan derleme dosyaları 1 yıl; diğer görseller 7 gün; sayfanın kendisi her açılışta denetlenir.
fs.writeFileSync(path.join(dir, 'vercel.json'), JSON.stringify({
  cleanUrls: true,
  headers: [
    // Sonra gelen kural öncekini ezer: genelden özele doğru sıralı
    { source: '/(.*)', headers: sec },
    { source: '/(.*)\\.(webp|jpg|png|svg|mp3|ogg|ico|js|css)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
    { source: '/assets/(index|phaser)-(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] }
  ]
}, null, 1));

const proj = path.join(ROOT, 'data', 'vercel-proje.json');
if (fs.existsSync(proj)) { fs.mkdirSync(path.join(dir, '.vercel')); fs.copyFileSync(proj, path.join(dir, '.vercel', 'project.json')); }
// Anahtar komut satırına değil ortam değişkenine verilir (başka programlar komut satırını görebilir)
run('npx', ['--yes', 'vercel@latest', 'deploy', '--prod', '--yes'], { cwd: dir, env: { ...process.env, VERCEL_TOKEN: token } });
const linked = path.join(dir, '.vercel', 'project.json');
if (fs.existsSync(linked)) { fs.mkdirSync(path.dirname(proj), { recursive: true }); fs.copyFileSync(linked, proj); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n✅ Yüklendi: https://${NAME}.vercel.app`);
