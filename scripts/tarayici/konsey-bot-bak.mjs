// Konsey katkı geçmişi, UBI, kışla, savaşa hazırlık ve bot "Üretim Hakkı bekleniyor" ekranlarını gerçek tarayıcıda dener. ELLE çalıştırılır (önce npm run dev, http://127.0.0.1:5180; EKRAN_KLASORU=<klasör>).
/* global window, document */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(path.resolve('package.json'));
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU;
fs.mkdirSync(KLASOR, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const tarayici = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const baglam = await tarayici.newContext({ viewport: { width: 420, height: 900 }, hasTouch: true, isMobile: true });
const s = await baglam.newPage();
const hatalar = [];
s.on('pageerror', (e) => hatalar.push('sayfa hatası: ' + e.message));
s.on('console', (m) => { if (m.type() === 'error' && !/ERR_NO_BUFFER|Failed to load resource/.test(m.text())) hatalar.push('konsol: ' + m.text().slice(0, 200)); });
await s.addInitScript(() => { try { localStorage.setItem('v3_tur_bitti', '1'); localStorage.setItem('roa_tur_bitti', '1'); } catch (_) { /* depo yok */ } });
await s.goto(BASE, { waitUntil: 'domcontentloaded' });
await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
await bekle(1500);
await s.evaluate(() => { const gs = window.gameState; const st = gs.state; st.level = 8; st.adAstraBalance = 3e6; for (let i = 0; i < 3; i++) gs.buySoldierUnit(); gs.saveState(); });
let cikis = 0;
const kontrol = async (ad, id, secenek, re, hazirla) => {
  if (hazirla) { await s.evaluate(hazirla); await bekle(300); }
  await s.evaluate(async ([i, o]) => { const u = performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('ekran/cekirdek.js')); const m = await import(u); m.ac(i, o || {}); }, [id, secenek]);
  await bekle(900);
  const metin = await s.evaluate(() => document.getElementById('modal-body').innerText.replace(/\s+/g, ' ').toLocaleLowerCase('tr'));
  const ok = re.test(metin);
  if (!ok) cikis = 1;
  console.log(`${ok ? 'OK   ' : 'EKSİK'} ${ad}: ${(metin.match(re) || [metin.slice(0, 120)])[0].slice(0, 160)}`);
  await s.screenshot({ path: path.join(KLASOR, `${ad.replace(/\W+/g, '_')}.png`) });
  await s.evaluate(() => { const k = document.getElementById('modal-close'); if (k) k.click(); });
  await bekle(300);
};
await kontrol('konsey_once', 'konsey', {}, /katkı puanın.*henüz katkı puanın yok/, null);
// Hızlı katkıyı gerçekten düğmeyle yap
await s.evaluate(async () => { window.__v3.git('konsey'); });
await bekle(800);
await s.fill('#hizli-butce', '1000');
await s.click('[data-e="hizliKatki"][data-hedef="otorite"]');
await bekle(600);
const onayBtn = await s.$('text=Al ve yatır');
if (onayBtn) { await onayBtn.click(); await bekle(1500); }
const metinK = await s.evaluate(() => document.getElementById('modal-body').innerText.replace(/\s+/g, ' ').toLocaleLowerCase('tr'));
const okK = /son katkıların.*madencilik otoritesi.*\+\d+ puan/.test(metinK);
console.log(`${okK ? 'OK   ' : 'EKSİK'} konsey_sonra: ${(metinK.match(/son katkıların.{0,200}/) || ['yok'])[0]}`);
if (!okK) cikis = 1;
await s.screenshot({ path: path.join(KLASOR, 'konsey_sonra.png') });
await s.evaluate(() => { const k = document.getElementById('modal-close'); if (k) k.click(); });
await bekle(300);
await kontrol('kotalar', 'kotalar', {}, /şimdi çıkarabilirsin: [\d.]+/, null);
await kontrol('ubi', 'karakter', {}, /bu hafta birikiyor.*pazartesi tahmini payın/, () => { window.gameState; });
await kontrol('kisla_saf', 'kisla', {}, /ön saf|arka saf/, null);
await kontrol('savas_sans', 'savashazirlik', { canavar: { level: 1, name: 'Kütük', hp: 100, atk: 10, rewardXp: 5 }, secili: [0], secimYapildi: true }, /ordunun kazanma şansı: %\d+/, null);
await kontrol('taverna_hak', 'taverna', {}, /bot|taverna/, async () => {});
await kontrol('merkez', 'merkez', {}, /üretim hakkın/, null);
// Bot hak bitti: tüm haklar sıfır, bot satın al
await s.evaluate(async () => {
  const gs = window.gameState; const st = gs.state;
  const hak = gs.getUretimHakki.bind(gs);
  gs.getUretimHakki = (k) => ({ ...hak(k), canTake: 0 });
  for (const k of ['iron', 'wood', 'wheat']) st.inventory[k] = 9999;
  gs.buyTavernaAutomationBot(true, 2); gs.updateBotPauseState(); gs.saveState();
});
await kontrol('taverna_hak_bitti', 'taverna', {}, /üretim hakkın bitti.*azalmaz/, null);
await kontrol('taverna_ucret', 'taverna', {}, /günlük üretim hakkı sınırı|üretim hakkın şu an bitti/, async () => { await new Promise(r => setTimeout(r, 10)); });
if (hatalar.length) { console.log('HATALAR:\n  ' + [...new Set(hatalar)].join('\n  ')); cikis = 1; }
await tarayici.close();
process.exit(cikis);
