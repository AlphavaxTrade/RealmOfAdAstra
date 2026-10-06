// Realm of AdAstra — yerel DENEME oyun sunucusu bekçisi (yönetici paneliyle)
// ---------------------------------------------------------------------------
// Oyun sunucusunu (server/index.js) deneme modunda arka planda çalıştırır, kapanırsa yeniden başlatır.
//  • Oyun:            http://localhost:8080/
//  • Yönetici paneli: http://localhost:8080/admin   (şifre: data/admin-token.txt)
// Deneme modu: test menüsü, bot rakip, taklit kasa/ödeme; gerçek para YOK, zincire bağlanmaz.
// Her açılışta oyun yeniden derlenir (en son kod sunulur). Kayıt: data/local.db
// OYUN-SUNUCUSU-BASLAT.bat bunu gizli açar ve Windows açılışına ekler. Durdurmak: OYUN-SUNUCUSU-DURDUR.bat
// Günlük: logs/online-server.log · Süreç kimliği: logs/online-server.pid
// ---------------------------------------------------------------------------
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.REALM_ONLINE_PORT) || 8080;
const LOG_DIR = path.join(ROOT, 'logs');
const DATA_DIR = path.join(ROOT, 'data');
const LOG_FILE = path.join(LOG_DIR, 'online-server.log');
const PID_FILE = path.join(LOG_DIR, 'online-server.pid');
const TOKEN_FILE = path.join(DATA_DIR, 'admin-token.txt');

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
try { if (fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) fs.writeFileSync(LOG_FILE, ''); } catch { /* yok */ }

function log(msg) {
  const line = `[${new Date().toLocaleString('tr-TR')}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* disk hatası sunucuyu durdurmamalı */ }
  if (process.stdout.isTTY) process.stdout.write(line);
}
const isAlive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Tek kopya
try {
  const old = Number(fs.readFileSync(PID_FILE, 'utf8'));
  if (old && old !== process.pid && isAlive(old)) { log(`Zaten çalışıyor (PID ${old}). http://localhost:${PORT}/`); process.exit(0); }
} catch { /* pid dosyası yok */ }
fs.writeFileSync(PID_FILE, String(process.pid));

// Yönetici şifresi: bir kez üretilir, data/admin-token.txt içinde durur (data/ GitHub'a gitmez)
let token = '';
try { token = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { /* yok */ }
if (token.length < 24) { token = crypto.randomBytes(24).toString('hex'); fs.writeFileSync(TOKEN_FILE, token + '\n'); log('Yeni yönetici şifresi üretildi: data/admin-token.txt'); }

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!fs.existsSync(path.join(ROOT, 'node_modules', 'vite'))) {
  log('Bağımlılıklar eksik: npm install…');
  spawnSync(npm, ['install'], { cwd: ROOT, shell: true, windowsHide: true });
}
log('Oyun derleniyor (npm run build)…');
const b = spawnSync(npm, ['run', 'build'], { cwd: ROOT, shell: true, windowsHide: true, encoding: 'utf8' });
log(b.status === 0 ? 'Derleme tamam.' : `Derleme başarısız (kod ${b.status}); son derlenmiş sürüm sunulacak. ${(b.stderr || '').slice(-300)}`);

let child = null, stopping = false, quickFails = 0;
function start() {
  const t0 = Date.now();
  log(`Oyun sunucusu başlatılıyor → http://localhost:${PORT}/  (yönetici: /admin)`);
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DB_FILE: './data/local.db', TEST_MODE: '1', CHAIN_ENABLED: '0',
      ADMIN_TOKEN: token, PUBLIC_URL: `http://localhost:${PORT}`, GAME_WALLET_PRIVATE_KEY: '', KASA_MASTER_KEY: '' }
  });
  const pipe = buf => { const t = buf.toString().replace(/\x1b\[[0-9;]*m/g, '').trim(); if (t) log(t); };
  child.stdout.on('data', pipe);
  child.stderr.on('data', pipe);
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) return;
    quickFails = Date.now() - t0 < 15000 ? quickFails + 1 : 0;
    const delay = Math.min(60000, 2000 * Math.max(1, quickFails));
    log(`Sunucu durdu (kod ${code}, sinyal ${signal}). ${Math.round(delay / 1000)} sn sonra yeniden başlatılıyor.`);
    setTimeout(start, delay);
  });
  child.on('error', err => log(`Başlatılamadı: ${err.message}`));
}
function shutdown() {
  stopping = true;
  log('Durduruluyor.');
  if (child) child.kill();
  try { if (Number(fs.readFileSync(PID_FILE, 'utf8')) === process.pid) fs.unlinkSync(PID_FILE); } catch { /* yok */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
start();
