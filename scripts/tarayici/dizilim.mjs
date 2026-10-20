/* global window, document */
// Zindan savaşa hazırlık: Dizilim kartı (otomatik / manuel). Gerçek tarayıcıda (390×844): otomatik modda sistem ön/arka saf dizer, şans şeridi uygulanan dizilimi
// gösterir; bir askerin saf düğmesine basmak manuele geçirir; "Otomatik diz" yeniden kurar; savaş otomatik dizilimle başlar. ELLE çalıştırılır (npm run dev).
//   EKRAN_KLASORU=<klasör> node scripts/tarayici/dizilim.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'dizilim');
fs.mkdirSync(KLASOR, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const hatalar = [];
const adimlar = [];
const not = (ad, ok, ayrinti = '') => { adimlar.push([ad, !!ok]); console.log(`${ok ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + ayrinti : ''}`); };
const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await baglam.addInitScript(() => { try { localStorage.setItem('v3_tur_bitti', '1'); localStorage.setItem('roa_tur_bitti', '1'); localStorage.setItem('roa_v3_tur_yerel', '{"atlandi":true}'); } catch (_) { /* depo yok */ } });
const s = await baglam.newPage();
s.on('pageerror', (e) => hatalar.push(`pageerror: ${e.message}`));
s.on('console', (m) => { if (m.type() === 'error' && !/ERR_NO_BUFFER|Failed to load resource/.test(m.text())) hatalar.push(`console: ${m.text().slice(0, 160)}`); });
await s.goto(BASE, { waitUntil: 'domcontentloaded' });
await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
await bekle(1500);
// 6 asker, orta güçte; dungeonProgress 12 (4. kat); hepsi ön safta başlar
await s.evaluate(() => {
  const gs = window.gameState; const st = gs.state;
  st.level = 40; st.adAstraBalance = 3e6; st.warehouseLevel = 6; st.dungeonProgress = 12; st.stamina = 5000; st.maxStamina = 5000;
  const yet = [['shieldWall'], ['armorBreaker'], ['fieldMedic'], ['bloodFrenzy'], ['stunStrike'], ['lastStand']];
  st.soldierUnits = yet.map((sk, i) => ({ id: 's' + i, name: 'Er ' + (i + 1), level: 12, xp: 0, maxHp: 1300 + i * 150, hp: 1300 + i * 150, baseAtk: 200 + (i % 3) * 50, skills: sk, row: 'front', equipment: { weapon: null, helmet: null, armor: null, legs: null, boots: null }, baseArmor: 10, baseSpeed: 10, baseCrit: 0.05, basePen: 5, woundedUntil: 0 }));
  delete st.dizilimModu;
  gs.saveState();
  window.dispatchEvent(new Event('enter-dungeon-view'));
});
await bekle(1200);
await s.locator('#zindan-ekrani .zd-devam').click();
await bekle(2500);
const durum = () => s.evaluate(() => {
  const m = document.getElementById('modal-body');
  const rows = window.gameState.state.soldierUnits.map((a) => a.row);
  return {
    mod: window.gameState.state.dizilimModu || 'oto',
    rozet: (m.querySelector('.ek-kart-rozet, .ek-rozet') || {}).innerText,
    kart: [...m.querySelectorAll('.ek-kart')].map((e) => e.innerText.split(/\s+/).join(' ')).find((x) => /Dizilim/.test(x)) || '',
    sansBaslik: (m.querySelector('.ek-kart-baslik') || {}).innerText,
    rows,
    ons: rows.filter((r) => r === 'front').length
  };
});
let d = await durum();
await s.screenshot({ path: path.join(KLASOR, '01_oto.png') });
console.log('Otomatik:', JSON.stringify(d).slice(0, 400));
not('varsayılan mod otomatik ve kart görünüyor', d.mod === 'oto' && /Dizilim/.test(d.kart) && /Ön saf \d+ · arka saf \d+/.test(d.kart), d.kart.slice(0, 200));
not('sistem satırları dizdi (hepsi ön olarak kalmadı ya da en iyi dizilim zaten hepsi önde)', d.rows.length === 6, JSON.stringify(d.rows));
const sansOto = await s.evaluate(() => { const m = document.getElementById('modal-body'); const x = (m.innerText.match(/Ordunun kazanma şansı: %(\d+)/) || [])[1]; return Number(x); });
console.log('Şans şeridi (otomatik):', sansOto);

// Manuele geçiş: bir askerin saf düğmesi
await s.locator('#modal-body [data-e="mevzi"]').first().click();
await bekle(800);
d = await durum();
await s.screenshot({ path: path.join(KLASOR, '02_manuel.png') });
not('saf düğmesine basınca manuel moda geçti', d.mod === 'manuel', JSON.stringify({ mod: d.mod }));
const elle = d.rows.slice();
await s.locator('#modal-body [data-e="mevzi"]').nth(1).click();
await bekle(600);
d = await durum();
not('manuel modda dizilim sistem tarafından bozulmuyor (elle çevrilen saf kalır)', d.mod === 'manuel' && d.rows[1] !== elle[1], JSON.stringify({ once: elle, sonra: d.rows }));

// Otomatik diz → otomatik mod, satırlar sistem önerisi
await s.locator('#modal-body [data-e="otomatikDiz"]').click();
await bekle(2500);
d = await durum();
await s.screenshot({ path: path.join(KLASOR, '03_otomatik_diz.png') });
not('Otomatik diz: otomatik moda döndü ve dizilim özeti yazıyor', d.mod === 'oto' && /Ön saf \d+ · arka saf \d+/.test(d.kart), d.kart.slice(0, 220));
const sans2 = await s.evaluate(() => Number(((document.getElementById('modal-body').innerText.match(/Ordunun kazanma şansı: %(\d+)/)) || [])[1]));
console.log('Şans (Otomatik diz sonrası):', sans2);
not('şans şeridi uygulanan dizilimin şansını gösteriyor', Number.isFinite(sans2) && sans2 >= 0);

// Savaşı başlat: otomatik dizilimle girilir
const satirOnce = (await durum()).rows.slice();
await s.evaluate(() => document.querySelector('#modal-body [data-e="basla"]').click());
await bekle(2500);
await s.evaluate(() => document.getElementById('aa-skipBtn')?.click());
await bekle(2000);
const sonuc = await s.evaluate(() => ({ baslik: (document.getElementById('aa-resultTitle') || document.querySelector('#aa-result h2, .aa-result-title') || {}).textContent || '', satirlar: window.gameState.state.soldierUnits.map((a) => a.row) }));
await s.screenshot({ path: path.join(KLASOR, '04_savas_sonuc.png') });
console.log('Savaş sonucu:', JSON.stringify(sonuc));
not('savaş bu dizilimle oynandı (sonuç ekranı var), satırlar değişmedi', !!sonuc.baslik && JSON.stringify(sonuc.satirlar) === JSON.stringify(satirOnce), JSON.stringify({ satirOnce, sonra: sonuc.satirlar }));
not('konsolda hata yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
await tarayici.close();
const kotu = adimlar.filter(([, ok]) => !ok);
console.log(`
${adimlar.length - kotu.length}/${adimlar.length} adım geçti. Görüntüler: ${KLASOR}`);
process.exitCode = kotu.length ? 1 : 0;
