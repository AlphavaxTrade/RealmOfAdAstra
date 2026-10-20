/* global window, document */
// Demirhane "Eşyalarım": zırhların hepsini toplu geliştirme (eksikleri al ve geliştir) gerçek tarayıcıda: silo toplamı tutmasa bile eşyalar tek tek alınıp geliştirilir.
// ELLE çalıştırılır (önce npm run dev, http://127.0.0.1:5180).   EKRAN_KLASORU=<klasör> SILO=<seviye> node scripts/tarayici/demirhane-toplu.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'demirhane-toplu');
const SILO = Number(process.env.SILO || 6);
fs.mkdirSync(KLASOR, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const hatalar = [];
const adimlar = [];
const not = (ad, ok, ayrinti = '') => { adimlar.push([ad, !!ok]); console.log(`${ok ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + ayrinti : ''}`); };
const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await baglam.addInitScript(() => { try { localStorage.setItem('v3_tur_bitti', '1'); localStorage.setItem('roa_tur_bitti', '1'); } catch (_) { /* depo yok */ } });
const s = await baglam.newPage();
s.on('pageerror', (e) => hatalar.push(`pageerror: ${e.message}`));
s.on('console', (m) => { if (m.type() === 'error' && !/ERR_NO_BUFFER|Failed to load resource/.test(m.text())) hatalar.push(`console: ${m.text().slice(0, 160)}`); });
await s.goto(BASE, { waitUntil: 'domcontentloaded' });
await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
await bekle(1500);
await s.evaluate((silo) => {
  const gs = window.gameState; const st = gs.state;
  st.level = 12; st.warehouseLevel = silo; st.adAstraBalance = 1e9;
  for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) st.inventory[k] = 0;
  st.inventory.fragments = 200;
  st.armoryInventory = [];
  for (let i = 0; i < 4; i++) st.armoryInventory.push({ id: 'z' + i, slot: 'armor', name: 'Zırh ' + i, icon: '🛡️', level: 3, atkBonus: 40, hpBonus: 60, durability: 13, maxDurability: 13 });
  gs.saveState();
}, SILO);
await s.evaluate(() => window.__v3.git('demirhane'));
await bekle(1000);
await s.locator('#modal-body [data-e="sekme"][data-sekme="esyalar"], #modal-body [data-sekme="esyalar"]').first().click().catch(() => {});
await bekle(700);
const DUGME = process.env.DUGME || 'hizliToplu';   // hizliToplu | hepsiniGelistir | ozelGrup
const bilgi = await s.evaluate((dg) => {
  const m = document.getElementById('modal-body');
  const d = m.querySelector('details[data-k="toplu"]'); if (d) d.open = true;
  const dugme = m.querySelector(dg === 'hizliToplu' ? '[data-e="hizliToplu"][data-yuva="all"]' : `[data-e="${dg}"]`);
  return { var: !!dugme, pasif: dugme && dugme.disabled, metin: dugme && dugme.innerText.replace(/\s+/g, ' '), uyarilar: [...m.querySelectorAll('.ek-uyari, .ek-kucuk')].map((e) => e.innerText.replace(/\s+/g, ' ')).filter((t) => /silo|alınamıyor/i.test(t)).slice(0, 3) };
}, DUGME);
console.log('Toplu düğme:', JSON.stringify(bilgi));
await s.screenshot({ path: path.join(KLASOR, '01_toplu.png') });
not('toplu "Eksikleri al ve geliştir" düğmesi var ve basılabilir', bilgi.var && !bilgi.pasif, JSON.stringify(bilgi));
if (bilgi.var && !bilgi.pasif) {
  await s.locator(DUGME === 'hizliToplu' ? '#modal-body [data-e="hizliToplu"][data-yuva="all"]' : `#modal-body [data-e="${DUGME}"]`).first().click();
  await s.waitForSelector('[data-v3-tamam]', { timeout: 8000 }).catch(() => {});
  await s.locator('[data-v3-tamam]').first().click().catch(() => {});
  await bekle(4000);
  const sonuc = await s.evaluate(() => ({ seviyeler: window.gameState.state.armoryInventory.map((e) => e.level), bildirimler: [...document.querySelectorAll('[class*=toast]')].map((e) => e.innerText.replace(/\s+/g, ' ')).join(' | ').slice(0, 300) }));
  console.log('Sonuç:', JSON.stringify(sonuc));
  not('dört zırhın hepsi bir üst seviyeye çıktı', sonuc.seviyeler.every((l) => l === 4), JSON.stringify(sonuc.seviyeler));
}
not('konsolda hata yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
await tarayici.close();
const kotu = adimlar.filter(([, ok]) => !ok);
console.log(`\n${adimlar.length - kotu.length}/${adimlar.length} adım geçti.`);
process.exitCode = kotu.length ? 1 : 0;
