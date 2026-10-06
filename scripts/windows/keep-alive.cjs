// Realm of AdAstra — yerel sunucu bekçisi (watchdog)
// ---------------------------------------------------------------------------
// Vite geliştirme sunucusunu arka planda çalıştırır ve kapanırsa yeniden başlatır.
// Konsol penceresine bağlı değildir: OYUNU-BASLAT.bat bu dosyayı gizli olarak açar,
// bu yüzden PowerShell/cmd penceresini kapatmak sunucuyu durdurmaz.
// Durdurmak için: OYUNU-DURDUR.bat
// Günlük: logs/server.log · Süreç kimliği: logs/server.pid
// ---------------------------------------------------------------------------
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.REALM_PORT) || 5180;
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');
const PID_FILE = path.join(LOG_DIR, 'server.pid');
const MAX_LOG_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(LOG_DIR, { recursive: true });
try {
  if (fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) fs.writeFileSync(LOG_FILE, '');
} catch { /* günlük henüz yok */ }

function log(msg) {
  const line = `[${new Date().toLocaleString('tr-TR')}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* disk hatası sunucuyu durdurmamalı */ }
  if (process.stdout.isTTY) process.stdout.write(line);
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Tek kopya: bekçi zaten çalışıyorsa ikinciyi açma
try {
  const oldPid = Number(fs.readFileSync(PID_FILE, 'utf8'));
  if (oldPid && oldPid !== process.pid && isAlive(oldPid)) {
    log(`Sunucu zaten çalışıyor (PID ${oldPid}). http://localhost:${PORT}/`);
    process.exit(0);
  }
} catch { /* pid dosyası yok */ }
fs.writeFileSync(PID_FILE, String(process.pid));

const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(viteBin)) {
  log('Bağımlılıklar eksik, "npm install" çalıştırılıyor...');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const res = spawnSync(npm, ['install'], { cwd: ROOT, shell: true, windowsHide: true, encoding: 'utf8' });
  log(res.status === 0 ? 'npm install tamamlandı.' : `npm install başarısız (kod ${res.status}): ${(res.stderr || '').slice(-500)}`);
}

let child = null;
let stopping = false;
let quickFails = 0;

function startVite() {
  const startedAt = Date.now();
  log(`Vite başlatılıyor → http://localhost:${PORT}/`);
  child = spawn(process.execPath, [viteBin, '--host', '0.0.0.0', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const pipe = (buf) => {
    // Renk kodlarını temizleyip günlüğe yaz
    const text = buf.toString().replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (text) log(text);
  };
  child.stdout.on('data', pipe);
  child.stderr.on('data', pipe);

  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) return;
    // Hemen çöküyorsa (ör. port dolu) bekleme süresini artır: 2 sn → en fazla 60 sn
    quickFails = Date.now() - startedAt < 15000 ? quickFails + 1 : 0;
    const delay = Math.min(60000, 2000 * Math.max(1, quickFails));
    log(`Vite durdu (kod ${code}, sinyal ${signal}). ${Math.round(delay / 1000)} sn sonra yeniden başlatılıyor.`);
    setTimeout(startVite, delay);
  });
  child.on('error', (err) => log(`Vite başlatılamadı: ${err.message}`));
}

function shutdown() {
  stopping = true;
  log('Sunucu durduruluyor.');
  if (child) child.kill();
  try {
    if (Number(fs.readFileSync(PID_FILE, 'utf8')) === process.pid) fs.unlinkSync(PID_FILE);
  } catch { /* zaten silinmiş */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startVite();
