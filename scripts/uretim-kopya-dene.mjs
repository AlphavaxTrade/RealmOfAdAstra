// Üretim imajının içeriğini Docker OLMADAN doğrular (kurumsal A6.8): Dockerfile "calisma" aşamasının COPY kümesini birebir taklit eden
// geçici bir klasör kurar (server/, js/, package.json, dist/, YALNIZ üretim node_modules), gerçek bir üretim yapılandırmasıyla (NODE_ENV=production,
// https adresi, 24+ karakterlik yönetici şifresi, SMTP) sunucuyu kaldırır ve temel uçları dener. Ağ gerekir (npm ci).
//   npm run build && node scripts/uretim-kopya-dene.mjs
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bekle = ms => new Promise(r => setTimeout(r, ms));
const boyut = klasor => { let t = 0; for (const e of fs.readdirSync(klasor, { withFileTypes: true })) { const y = path.join(klasor, e.name); t += e.isDirectory() ? boyut(y) : fs.statSync(y).size; } return t; };
const mb = b => Math.round(b / 104857.6) / 10;
const sonuclar = [];
const kontrol = (ad, kosul, ayrinti = '') => { sonuclar.push({ ad, ok: !!kosul }); console.log(`${kosul ? '✅' : '❌'} ${ad}${ayrinti ? '  ' + ayrinti : ''}`); };

if (!fs.existsSync(path.join(kok, 'dist/index.html'))) { console.error('❌ dist/ yok: önce `npm run build`'); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uretim-kopya-'));
let sunucu;
try {
  // Dockerfile "calisma" aşamasındaki COPY kümesi
  fs.cpSync(path.join(kok, 'server'), path.join(tmp, 'server'), { recursive: true });
  fs.cpSync(path.join(kok, 'js'), path.join(tmp, 'js'), { recursive: true });
  fs.cpSync(path.join(kok, 'dist'), path.join(tmp, 'dist'), { recursive: true });
  fs.copyFileSync(path.join(kok, 'package.json'), path.join(tmp, 'package.json'));
  fs.copyFileSync(path.join(kok, 'package-lock.json'), path.join(tmp, 'package-lock.json'));
  const k = spawnSync('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', { cwd: tmp, encoding: 'utf8', shell: true });
  if (k.status !== 0) throw new Error('npm ci başarısız:\n' + (k.stderr || k.stdout).slice(0, 600));
  for (const gereksiz of ['tests', 'docs', 'scripts', 'public', 'css', 'research', 'contracts', 'vite.config.js']) fs.rmSync(path.join(tmp, gereksiz), { recursive: true, force: true });   // zaten yok; emin ol
  console.log(`Üretim klasörü: ${mb(boyut(tmp))} MB (node_modules ${mb(boyut(path.join(tmp, 'node_modules')))} MB, dist ${mb(boyut(path.join(tmp, 'dist')))} MB)`);
  kontrol('üretim kurulumunda geliştirme araçları yok', !['vite', 'phaser', 'three', 'eslint', 'ganache', 'playwright', 'solc', 'knip'].some(p => fs.existsSync(path.join(tmp, 'node_modules', p))));

  const port = 18500 + Math.floor(Math.random() * 400);
  const yonetici = crypto.randomBytes(24).toString('hex');
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', PUBLIC_URL: 'https://oyun.ornek.com', TRUST_PROXY: '1', ADMIN_TOKEN: yonetici,
    SMTP_URL: 'smtp://k:s@127.0.0.1:2525', DB_FILE: path.join(tmp, 'veri', 'realm.db'), YEDEK_KLASORU: path.join(tmp, 'yedek'), CHAIN_ENABLED: '0',
    TEST_MODE: '', PAROLA_HAFIF: '', GAME_WALLET_PRIVATE_KEY: '', KASA_MASTER_KEY: '', PAYMENTS_CONTRACT: '', RESERVE_WALLET: '', ADMIN_EMAIL: '' };
  sunucu = spawn(process.execPath, ['server/index.js'], { cwd: tmp, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let cikti = ''; sunucu.stdout.on('data', d => { cikti += d; }); sunucu.stderr.on('data', d => { cikti += d; });
  let saglik = null;
  for (let i = 0; i < 80 && !saglik; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) saglik = await r.json(); } catch { await bekle(250); } }
  kontrol('üretim yapılandırmasıyla sunucu açıldı, /api/health 200', saglik && saglik.ok === true, saglik ? `(sürüm ${saglik.version}, testMode=${saglik.testMode})` : cikti.slice(0, 300));
  if (saglik) {
    kontrol('üretimde deneme modu kapalı', saglik.testMode === false);
    const raw = (yol, kodlama) => new Promise((res, rej) => http.get({ port, host: '127.0.0.1', path: yol, headers: kodlama ? { 'Accept-Encoding': kodlama } : {} }, r => { const p = []; r.on('data', d => p.push(d)); r.on('end', () => res({ durum: r.statusCode, baslik: r.headers, govde: Buffer.concat(p) })); }).on('error', rej));
    const ana = await raw('/', 'br');
    kontrol('ana sayfa 200, brotli ön-sıkıştırılmış, CSP ve no-cache başlıkları var', ana.durum === 200 && ana.baslik['content-encoding'] === 'br' && /default-src 'self'/.test(ana.baslik['content-security-policy'] || '') && ana.baslik['cache-control'] === 'no-cache');
    kontrol('ana sayfa içeriği kaynakla aynı', zlib.brotliDecompressSync(ana.govde).toString() === fs.readFileSync(path.join(tmp, 'dist/index.html'), 'utf8'));
    const phaser = fs.readdirSync(path.join(tmp, 'dist/assets')).find(f => /^phaser-.*\.js$/.test(f));
    const p = await raw('/assets/' + phaser, 'br');
    kontrol('phaser brotli ile ve immutable önbellekle sunulur', p.baslik['content-encoding'] === 'br' && /immutable/.test(p.baslik['cache-control']), `(${mb(fs.statSync(path.join(tmp, 'dist/assets', phaser)).size)} MB → ${mb(p.govde.length)} MB)`);
    kontrol('HSTS (https PUBLIC_URL) ve COOP başlıkları var', /max-age=31536000/.test(ana.baslik['strict-transport-security'] || '') && ana.baslik['cross-origin-opener-policy'] === 'same-origin-allow-popups');
    const adm = await raw('/api/admin/status');
    kontrol('yönetici ucu şifresiz 401', adm.durum === 401);
    const adm2 = await fetch(`http://127.0.0.1:${port}/api/admin/status`, { headers: { Authorization: 'Bearer ' + yonetici } });
    kontrol('yönetici ucu doğru şifreyle 200', adm2.status === 200); await adm2.arrayBuffer();
    kontrol('günlükte gizli değer yok', !cikti.includes(yonetici) && !/smtp:\/\/k:s@/.test(cikti));
    // Yedek araçları üretim ağacında, ÇALIŞAN sunucunun veritabanıyla: yedekle → derin doğrula → /metrics'te yedek yaşı
    const cli = ad => spawnSync(process.execPath, ['server/yedek/cli/' + ad], { cwd: tmp, env, encoding: 'utf8', timeout: 120000 });
    const y = cli('yedekle.js'), dg = cli('dogrula.js');
    kontrol('yedek aracı üretim ağacında çalışan sunucunun verisini yedekler ve derin doğrular', y.status === 0 && dg.status === 0, y.status === 0 && dg.status === 0 ? '' : (y.stdout + y.stderr + dg.stdout + dg.stderr).slice(0, 300));
    const met = await fetch(`http://127.0.0.1:${port}/metrics`, { headers: { Authorization: 'Bearer ' + yonetici } }); const metin = await met.text();
    kontrol('/metrics yedek yaşını gösterir', met.status === 200 && /^realm_yedek_son_yas_saniye [0-9]+$/m.test(metin));
  }
} catch (e) {
  kontrol('betik hatasız çalıştı', false, e.message);
} finally {
  if (sunucu) sunucu.kill();
  await bekle(300);
  fs.rmSync(tmp, { recursive: true, force: true });
}
const basarisiz = sonuclar.filter(s => !s.ok);
console.log(basarisiz.length ? `\n❌ ${basarisiz.length} kontrol başarısız` : `\n✅ ${sonuclar.length} kontrol geçti`);
process.exit(basarisiz.length ? 1 : 0);
