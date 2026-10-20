/* global window, document */
// Zindan ekranını gerçek tarayıcıda (390×844) açar: kat görünümü ve oda görünümü; üst şeritteki düğmeleri sayar, ekran görüntüsü alır.
// Yeni oyuncuda "Zindan modu" düğmesi gizli, ilk boss geçilince görünür (20 Ekim 2026). ELLE çalıştırılır (önce npm run dev, http://127.0.0.1:5180).
//   EKRAN_KLASORU=<klasör> node scripts/tarayici/zindan-bak.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'zindan-bak');
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

async function durum(ad, ilerleme) {
  await s.evaluate((il) => {
    const gs = window.gameState; const st = gs.state;
    st.level = 12; st.adAstraBalance = 3e6; st.dungeonProgress = il;
    if (!(st.soldierUnits || []).length) for (let i = 0; i < 3; i++) gs.buySoldierUnit();
    gs.saveState();
    window.dispatchEvent(new Event('enter-dungeon-view'));
  }, ilerleme);
  await bekle(1200);
  const o = await s.evaluate(() => {
    const k = document.getElementById('zindan-ekrani');
    const serit = k.querySelector('.zd-serit-dugme');
    return { acik: !k.hidden, seritDugme: serit ? [...serit.querySelectorAll('button')].map((b) => b.textContent.trim()) : [], harf: k.innerText.replace(/\s+/g, ' ').length };
  });
  await s.screenshot({ path: path.join(KLASOR, `zindan-${ad}-kat.png`) });
  await s.evaluate(() => { document.querySelector('#zindan-ekrani [data-e="oda"]').click(); });
  await bekle(600);
  const oda = await s.evaluate(() => {
    const k = document.getElementById('zindan-ekrani');
    return { katli: !!k.querySelector('.zd-katli'), katliAcik: !!k.querySelector('.zd-katli[open]'), savas: !!k.querySelector('[data-e="savas"]') };
  });
  await s.screenshot({ path: path.join(KLASOR, `zindan-${ad}-oda.png`) });
  await s.evaluate(() => { document.querySelector('#zindan-ekrani [data-e="geri"]').click(); });
  await s.evaluate(() => { document.querySelector('#zindan-ekrani [data-e="geri"]').click(); });
  await bekle(400);
  return { ad, ...o, oda };
}
const yeni = await durum('yeni', 1);
const ileri = await durum('ileri', 12);
console.log(JSON.stringify({ yeni, ileri }, null, 1));
console.log(hatalar.size ? `HATA: ${[...hatalar].join(' | ')}` : 'konsol hatası yok');
await tarayici.close();
if (hatalar.size) process.exitCode = 1;
