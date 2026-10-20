/* global window, document */
// Karnaval çarkını gerçek tarayıcıda (390×844) çevirir: düğmeler çarkın üstünde mi, çevirme sonucu görünüyor mu, konsol hatası var mı.
// ELLE çalıştırılır (önce npm run dev, http://127.0.0.1:5180).   EKRAN_KLASORU=<klasör> node scripts/tarayici/karnaval-cevir.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'karnaval-cevir');
fs.mkdirSync(KLASOR, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const hatalar = new Set();
const tarayici = await chromium.launch({
  executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const s = await baglam.newPage();
s.on('pageerror', (e) => hatalar.add(`sayfa hatası: ${e.message}`));
s.on('console', (m) => { if (m.type() === 'error' && !/ERR_NO_BUFFER|Failed to load resource/.test(m.text())) hatalar.add(`konsol: ${m.text().slice(0, 160)}`); });
await s.addInitScript(() => { try { localStorage.setItem('v3_tur_bitti', '1'); localStorage.setItem('roa_tur_bitti', '1'); } catch (_) { /* depo yok */ } });
await s.goto(BASE, { waitUntil: 'domcontentloaded' });
await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
await bekle(1500);
await s.evaluate(() => { const st = window.gameState.state; st.level = 12; st.adAstraBalance = 3e6; window.gameState.saveState(); window.__v3.git('karnaval'); });
await bekle(1200);
const once = await s.evaluate(() => {
  const m = document.getElementById('modal-body');
  const d = m.querySelector('[data-e="cevir"][data-odeme="ada"]');
  const t = m.querySelector('canvas');
  return { dugmeUstte: !!d && !!t && d.getBoundingClientRect().top < t.getBoundingClientRect().top, dugmeY: d && Math.round(d.getBoundingClientRect().top) };
});
await s.evaluate(() => { document.querySelector('#modal-body [data-e="cevir"][data-odeme="ada"]').click(); });
await bekle(9000);
const sonra = await s.evaluate(() => {
  const m = document.getElementById('modal-body');
  const k = m.querySelector('.ek-sonuc');
  const t = m.querySelector('canvas');
  return { sonucVar: !!k, sonucCarkinUstunde: !!k && !!t && k.getBoundingClientRect().top < t.getBoundingClientRect().top, baslik: k ? k.innerText.replace(/\s+/g, ' ').slice(0, 80) : '' };
});
await s.screenshot({ path: path.join(KLASOR, 'karnaval-cevrildi.png') });
console.log(JSON.stringify({ once, sonra }, null, 1));
console.log(hatalar.size ? `HATA: ${[...hatalar].join(' | ')}` : 'konsol hatası yok');
await tarayici.close();
if (hatalar.size || !once.dugmeUstte || !sonra.sonucVar) process.exitCode = 1;
