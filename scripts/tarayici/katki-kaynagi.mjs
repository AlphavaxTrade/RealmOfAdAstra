/* global window, document */
// Konsey ekranı: "Katkı puanın nereden geliyor?" bölümü gerçek tarayıcıda (390×844). Hesap yükseltip teçhizat dövüp bölümü açar, satırları ve ekran görüntüsünü alır.
// ELLE çalıştırılır (npm run dev, http://127.0.0.1:5180).   EKRAN_KLASORU=<klasör> node scripts/tarayici/katki-kaynagi.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'katki-kaynagi');
fs.mkdirSync(KLASOR, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const hatalar = [];
const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await baglam.addInitScript(() => { try { localStorage.setItem('v3_tur_bitti', '1'); localStorage.setItem('roa_tur_bitti', '1'); } catch (_) { /* depo yok */ } });
const s = await baglam.newPage();
s.on('pageerror', (e) => hatalar.push(`pageerror: ${e.message}`));
s.on('console', (m) => { if (m.type() === 'error' && !/ERR_NO_BUFFER|Failed to load resource/.test(m.text())) hatalar.push(`console: ${m.text().slice(0, 160)}`); });
await s.goto(BASE, { waitUntil: 'domcontentloaded' });
await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
await bekle(1500);
const sonuc = await s.evaluate(() => {
  const gs = window.gameState; const st = gs.state;
  st.level = 5; st.warehouseLevel = 6; st.adAstraBalance = 5e6;
  const g = gs.getNextLevelRequirement(); st.currentXp = g.xp + 5;
  for (const k of Object.keys(g.costs)) st.inventory[k] = g.costs[k] + 5;
  const r1 = gs.levelUp();
  st.inventory.fragments = 20; for (const k of ['iron', 'wood', 'coal']) st.inventory[k] = 1e6;
  const r2 = gs.craftEquipment('boots');
  gs.saveState();
  return { lv: r1.success, dovme: r2.success };
});
await s.evaluate(() => window.__v3.git('konsey'));
await bekle(1200);
const d = await s.evaluate(() => {
  const m = document.getElementById('modal-body');
  const det = m.querySelector('details[data-k="katki-kaynak"]'); if (det) { det.open = true; det.scrollIntoView(); }
  return det ? det.innerText.split(/\s+/).join(' ').slice(0, 700) : null;
});
await bekle(300);
await s.screenshot({ path: path.join(KLASOR, 'katki-kaynagi.png') });
console.log(JSON.stringify(sonuc), '\n', d);
console.log(d && /Hesap yükseltme/.test(d) && /Teçhizat dövme/.test(d) ? '✅ döküm görünüyor' : '❌ döküm yok');
console.log(hatalar.length ? `HATA: ${hatalar.join(' | ')}` : 'konsol hatası yok');
await tarayici.close();
process.exitCode = d && /Hesap yükseltme/.test(d) && !hatalar.length ? 0 : 1;
