/* global window, document, innerWidth */
// Tek bir ekranı gerçek tarayıcıda (telefon ve masaüstü) açıp görüntüsünü ve ölçümlerini verir. ELLE çalıştırılır.
// Önce geliştirme sunucusu: npm run dev (http://127.0.0.1:5180).
// Kullanım: node scripts/tarayici/ekran-bak.mjs <hub-anahtarı> [--zengin] [--tikla "css seçici"]...
//   örn:   node scripts/tarayici/ekran-bak.mjs silo --zengin
// Çıktı: ekran görüntüleri (%TEMP%/ekran-bak), konsol hataları, taşma ve bozuk metin özeti.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const anahtar = args.find((a) => !a.startsWith('--'));
if (!anahtar) { console.error('Kullanım: node scripts/tarayici/ekran-bak.mjs <hub-anahtarı> [--zengin]'); process.exit(2); }
const zengin = args.includes('--zengin');
const tiklar = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--tikla' && args[i + 1]) tiklar.push(args[i + 1]);
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
  if (zengin) {
    await s.evaluate(() => {
      const gs = window.gameState; const st = gs.state;
      st.level = 30; st.currentXp = 1e6; st.adAstraBalance = 250000; st.stamina = 5000; st.arenaKeys = 6;
      for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) st.inventory[k] = 4000;
      st.inventory.fragments = 120; st.warehouseLevel = 3;
      for (let i = 0; i < 4; i++) gs.buySoldierUnit();
      gs.saveState();
    });
    await bekle(300);
  }
  if (anahtar.startsWith('kaynak:')) {   // kaynak tepsisinden bir hammadde bölgesi: kaynak:wood
    await s.click('#v3-kaynak-dugme');
    await s.click(`[data-v3-kaynak="${anahtar.slice(7)}"]`);
  } else {
    await s.evaluate((k) => window.__v3.git(k), anahtar);
  }
  await bekle(zengin ? 4800 : 800);   // açılışta çıkan bildirimler kaybolsun
  for (const sec of tiklar) { await s.click(sec).catch(() => hatalar.push('tıklanamadı: ' + sec)); await bekle(400); }
  const dosya = path.join(KLASOR, `${anahtar.replace(/[^a-z0-9]/gi, '_')}-${ad}${zengin ? '-zengin' : ''}.png`);
  await s.screenshot({ path: dosya });
  const olcum = await s.evaluate(() => {
    const govde = document.getElementById('modal-body');
    const metin = (govde ? govde.innerText : '').replace(/\s+/g, ' ');
    const tasan = [];
    if (govde) for (const e of govde.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.width > 0 && (r.right > innerWidth + 2 || r.left < -2)) tasan.push(String(e.className).slice(0, 40) || e.tagName); }
    return {
      baslik: (document.getElementById('modal-title') || {}).innerText?.replace(/\s+/g, ' ').trim(),
      acik: !!document.getElementById('rpg-modal')?.classList.contains('active'),
      uzunluk: metin.length,
      bozuk: [...new Set(metin.match(/NaN|undefined|\[object|Infinity|\bnull\b/g) || [])],
      tasan: [...new Set(tasan)].slice(0, 5),
      ilk: metin.slice(0, 160)
    };
  });
  console.log(`[${ad}] ${olcum.acik ? 'açık' : 'KAPALI'} · "${olcum.baslik}" · ${olcum.uzunluk} karakter · taşan: ${olcum.tasan.join(',') || '-'} · bozuk: ${olcum.bozuk.join(',') || '-'}`);
  console.log(`      ${olcum.ilk}`);
  if (hatalar.length) { console.log('      HATALAR:\n        ' + [...new Set(hatalar)].join('\n        ')); cikis = 1; }
  if (!olcum.acik || olcum.bozuk.length || olcum.tasan.length) cikis = 1;
  console.log('      görüntü:', dosya);
  await baglam.close();
}
await tarayici.close();
process.exit(cikis);
