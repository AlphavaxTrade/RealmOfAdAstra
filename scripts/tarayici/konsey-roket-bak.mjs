/* global window, document */
// Konsey "Hızlı katkı" kartı ve Uzay Limanı roket seviyeleri kartını gerçek tarayıcıda (telefon + masaüstü) açıp görüntüsünü verir. ELLE çalıştırılır.
// Önce geliştirme sunucusu: npm run dev (http://127.0.0.1:5180). Çıktı: %TEMP%/ekran-bak/konsey-hizli-*.png, uzay-roket-*.png
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
for (const [ad, w, h, mobil] of [['tel', 390, 844, true], ['masa', 1280, 800, false]]) {
  const baglam = await tarayici.newContext({ viewport: { width: w, height: h }, hasTouch: mobil, isMobile: mobil });
  const s = await baglam.newPage();
  const hatalar = [];
  s.on('pageerror', (e) => hatalar.push('sayfa hatası: ' + e.message));
  s.on('console', (m) => { if (m.type() === 'error') hatalar.push('konsol: ' + m.text().slice(0, 200)); });
  await s.addInitScript(() => { try { localStorage.setItem('v3_tur_bitti', '1'); localStorage.setItem('roa_tur_bitti', '1'); } catch (_) { /* depo yok */ } });
  await s.goto(BASE, { waitUntil: 'domcontentloaded' });
  await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
  await bekle(1500);
  await s.evaluate(() => {
    const gs = window.gameState; const st = gs.state;
    st.level = 30; st.adAstraBalance = 250000;
    for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) st.inventory[k] = 0;
    st.warehouseLevel = 12; st.rocketReady = true; st.rocketLevel = 2;
    gs.saveState();
  });
  // 1) Konsey: hızlı katkı kartına kaydır, bir kez yatır
  await s.evaluate(() => window.__v3.git('konsey'));
  await bekle(1200);
  const kartMetni = await s.evaluate(() => { const g = document.getElementById('modal-body'); const k = [...g.querySelectorAll('.ek-kart')].find((e) => /Hızlı katkı/.test(e.innerText)); if (!k) return null; k.scrollIntoView({ block: 'start' }); return k.innerText.replace(/\s+/g, ' '); });
  console.log(`[${ad}] hızlı katkı kartı:`, kartMetni ? kartMetni.slice(0, 260) : 'YOK');
  if (!kartMetni) cikis = 1;
  await bekle(300);
  await s.screenshot({ path: path.join(KLASOR, `konsey-hizli-${ad}.png`) });
  const once = await s.evaluate(() => window.gameState.state.adAstraBalance);
  await s.evaluate(() => { const b = document.querySelector('[data-e="hizliKatki"][data-hedef="otorite"], button[data-hedef="otorite"]'); if (b) b.click(); });
  await bekle(800);
  // onay penceresi açıldıysa onayla
  await s.evaluate(() => { const t = [...document.querySelectorAll('button')].find((e) => /Al ve yatır/.test(e.innerText)); if (t) t.click(); });
  await bekle(1500);
  const sonra = await s.evaluate(() => ({ bakiye: window.gameState.state.adAstraBalance, ilerleme: window.globalPool ? window.globalPool.getOtoriteStatus().progress : null }));
  console.log(`[${ad}] ASTRA ${Math.round(once)} → ${Math.round(sonra.bakiye)}; Otorite ilerleme:`, JSON.stringify(sonra.ilerleme));
  // 2) Uzay Limanı: roket seviye kartı
  await s.evaluate(() => { const k = document.getElementById('modal-close'); if (k) k.click(); });
  await bekle(300);
  await s.evaluate(() => window.__v3.git('uzay'));
  await bekle(1200);
  const uzay = await s.evaluate(() => { const g = document.getElementById('modal-body'); const k = [...g.querySelectorAll('.ek-kart')].find((e) => /Roket seviye/.test(e.innerText)); if (!k) return null; k.scrollIntoView({ block: 'start' }); return k.innerText.replace(/\s+/g, ' '); });
  console.log(`[${ad}] roket kartı:`, uzay ? uzay.slice(0, 300) : 'YOK');
  if (!uzay) cikis = 1;
  await bekle(300);
  await s.screenshot({ path: path.join(KLASOR, `uzay-roket-${ad}.png`) });
  if (hatalar.length) { console.log('HATALAR:\n  ' + [...new Set(hatalar)].join('\n  ')); cikis = 1; }
  await baglam.close();
}
await tarayici.close();
process.exit(cikis);
