/* global window, document */
// Hesap seviyesi bağı: silo ekranında "hesap seviyeni geçemez" kilidi, Konsey çıkarma hakkı kartı, Demirhane kilidi. ELLE çalıştırılır (önce npm run dev, http://127.0.0.1:5180).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'ekran-bak');
fs.mkdirSync(KLASOR, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const tarayici = await chromium.launch({
  executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
let cikis = 0;
const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const s = await baglam.newPage();
const hatalar = [];
s.on('pageerror', (e) => hatalar.push('sayfa hatası: ' + e.message));
s.on('console', (m) => { if (m.type() === 'error') hatalar.push('konsol: ' + m.text().slice(0, 200)); });
await s.addInitScript(() => { try { localStorage.setItem('v3_tur_bitti', '1'); localStorage.setItem('roa_tur_bitti', '1'); } catch (_) { /* depo yok */ } });
await s.goto(BASE, { waitUntil: 'domcontentloaded' });
await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
await bekle(1500);
await s.evaluate(() => { const gs = window.gameState; gs.state.level = 1; gs.state.warehouseLevel = 1; gs.state.adAstraBalance = 5000; for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) gs.state.inventory[k] = 1e6; gs.saveState(); });
for (const [ekran, aranan, dosya] of [['silo', /hesap seviyeni geçemez/, 'silo-kilit'], ['konsey', /Kişisel limit|Bu haftaki çıkarma hakkın/, 'konsey-hak']]) {
  await s.evaluate((e) => window.__v3.git(e), ekran);
  await bekle(1200);
  const metin = await s.evaluate(() => document.getElementById('modal-body').innerText.replace(/\s+/g, ' '));
  const var_ = aranan.test(metin);
  console.log(`[${ekran}] ${var_ ? 'OK' : 'EKSİK'}: ${metin.slice(0, 160)}`);
  if (!var_) cikis = 1;
  await s.screenshot({ path: path.join(KLASOR, `${dosya}-tel.png`) });
  await s.evaluate(() => { const k = document.getElementById('modal-close'); if (k) k.click(); });
  await bekle(300);
}
if (hatalar.length) { console.log('HATALAR:\n  ' + [...new Set(hatalar)].join('\n  ')); cikis = 1; }
await tarayici.close();
process.exit(cikis);
