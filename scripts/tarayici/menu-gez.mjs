/* global window, document */
// Yeni menüyü (alt çubuk sekmeleri, Gelişmiş katı) ve birleşen ekranların (Köy|Konsey, Kolezyum|Dünya bossu) sekmelerini gerçek tarayıcıda dener.
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
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'menu-gez');
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
await s.evaluate(() => { const gs = window.gameState; const st = gs.state; st.level = 12; st.adAstraBalance = 3e6; for (let i = 0; i < 3; i++) gs.buySoldierUnit(); st.dungeonProgress = 3; gs.saveState(); });
let cikis = 0;
const metin = () => s.evaluate(() => document.getElementById('modal-body').innerText.replace(/\s+/g, ' '));
const kontrol = async (ad, fn, dogru, yok) => {
  await fn(); await bekle(900);
  const m = await metin();
  const tamam = dogru.test(m) && !(yok && yok.test(m));
  if (!tamam) cikis = 1;
  console.log(`${tamam ? 'OK   ' : 'EKSİK'} ${ad}: ${m.slice(0, 110)}`);
  await s.screenshot({ path: path.join(KLASOR, `${ad.replace(/\W+/g, '_')}.png`) });
};
const sekme = (id) => async () => { await s.evaluate(() => { const k = document.getElementById('modal-close'); if (k) k.click(); }); await bekle(200); await s.click(`[data-v3-sekme="${id}"]`); };
await kontrol('kralik_menu', sekme('kralik'), /Krallık merkezi.*Köy ve Konsey/s, /Şifahane|Silo ve depo|Sirius Konseyi/);
await kontrol('savas_menu', sekme('savas'), /Kışla.*Zindan.*Arena/s, /Savaş alanı|Zindan modu/);
await kontrol('pazar_menu', sekme('pazar'), /Meydan pazarı.*Karnaval.*koleksiyon/s, /Ekonomi panosu/);
await kontrol('ben_menu', sekme('ben'), /Karakterim.*Hesap.*Oyun rehberi.*Ayarlar.*Sorun bildir.*Gelişmiş/s, /Kotalarım/);
await kontrol('ben_gelismis_ac', async () => { await s.click('.v3-gelismis > summary'); }, /Kotalarım.*Hazine.*Ekonomi panosu.*Sürüm geçmişi/s);
await kontrol('koy_konsey_sekmesi', async () => { await s.evaluate(() => window.__v3.git('koy')); }, /Köy.*Konsey.*Köy durumu/s);
await kontrol('koy_den_konseye', async () => { await s.click('[data-e="grupGit"][data-sekme="konsey"]'); }, /Konsey ne işe yarar/);
await kontrol('arena_sekmesi', async () => { await s.evaluate(() => window.__v3.git('kolezyum')); }, /Kolezyum.*Dünya bossu/s);
await kontrol('arenadan_bossa', async () => { await s.click('[data-e="grupGit"][data-sekme="savasalani"]'); }, /Haftalık dünya bossu/);
await kontrol('merkez_yapilacaklar', async () => { await s.evaluate(() => window.__v3.git('merkez')); }, /Şimdi yapılacaklar/);
await kontrol('kisla_sifahane', async () => { await s.evaluate(() => window.__v3.git('kisla')); }, /Orduyu hazırla/);
if (hatalar.size) { console.log('HATALAR:\n  ' + [...hatalar].join('\n  ')); cikis = 1; }
await tarayici.close();
process.exit(cikis);
