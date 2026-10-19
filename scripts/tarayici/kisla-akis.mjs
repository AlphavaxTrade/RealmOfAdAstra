/* global window, document */
// Kışlada asker düzenleme akışını gerçek tarayıcıda dener (telefon 390×844): asker seç → yuvaya dokun → eşya tak → geliştir → çıkar.
// ELLE çalıştırılır (önce npm run dev, http://127.0.0.1:5180). EKRAN_KLASORU=<klasör> ekran görüntülerini yazar.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'kisla-akis');
fs.mkdirSync(KLASOR, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const s = await baglam.newPage();
const hatalar = new Set();
s.on('pageerror', (e) => hatalar.add(`sayfa hatası: ${e.message}`));
s.on('console', (m) => { if (m.type() === 'error' && !/ERR_NO_BUFFER|Failed to load resource/.test(m.text())) hatalar.add(`konsol: ${m.text().slice(0, 160)}`); });
await s.addInitScript(() => { try { localStorage.setItem('v3_tur_bitti', '1'); localStorage.setItem('roa_tur_bitti', '1'); } catch (_) { /* depo yok */ } });
await s.goto(BASE, { waitUntil: 'domcontentloaded' });
await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
await bekle(1500);
await s.evaluate(() => {
  const gs = window.gameState; const st = gs.state;
  st.level = 14; st.adAstraBalance = 3e6; st.warehouseLevel = 3; st.dungeonProgress = 12;
  for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) st.inventory[k] = 20000;
  st.inventory.fragments = 500;
  for (let i = 0; i < 4; i++) gs.buySoldierUnit();
  gs.craftEquipment('weapon'); gs.craftEquipment('helmet'); gs.craftEquipment('armor');
  gs.saveState();
});
await bekle(500);
let cikis = 0;
const metin = () => s.evaluate(() => document.getElementById('modal-body').innerText.replace(/\s+/g, ' '));
const adim = async (ad, fn, dogru) => {
  await fn(); await bekle(700);
  const m = await metin();
  const tamam = dogru ? dogru.test(m) : true;
  if (!tamam) cikis = 1;
  console.log(`${tamam ? 'OK   ' : 'EKSİK'} ${ad}`);
  await s.screenshot({ path: path.join(KLASOR, `${ad.replace(/\W+/g, '_')}.png`) });
};
const dokun = (sec) => async () => { await s.click(sec); };
await adim('1_kisla_ac', async () => { await s.evaluate(() => window.__v3.git('kisla')); }, /Orduyu hazırla/);
await adim('2_orduyu_hazirla', dokun('[data-e="hazirla"]'), /./);
await adim('3_asker2_sec', dokun('[data-e="sec"][data-idx="1"]'), /Asker 2/);
await adim('4_silah_yuvasi', dokun('[data-e="secici"][data-yuva="weapon"]'), /Silah/);
const panel = await metin();
console.log(/Takılı:|uygun eşya/.test(panel) ? 'OK    yuva paneli açıldı (takılı eşya / uygun eşya)' : 'EKSİK yuva paneli');
if (await s.$('[data-e="yuvaGelistir"]')) await adim('5_gelistir', async () => { await s.click('[data-e="yuvaGelistir"]'); await bekle(800); const t = await s.$('text=Al ve geliştir'); if (t) await t.click(); }, /./);
else console.log('(bu askerin silahı yok ya da geliştirilemez; geliştir düğmesi çıkmadı)');
await adim('6_cephanelik', dokun('[data-e="sekme"][data-sekme="cephanelik"]'), /Cephanelik/);
if (hatalar.size) { console.log('HATALAR:\n  ' + [...hatalar].join('\n  ')); cikis = 1; }
await tarayici.close();
process.exit(cikis);
