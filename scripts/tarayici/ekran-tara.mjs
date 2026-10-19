/* global window, document */
// Bütün panelleri gerçek tarayıcıda gezer (telefon 390×844 ve masaüstü 1280×800): her ekranın görünen yazı, düğme ve kaydırma yüksekliğini
// ölçer, ekran görüntüsü alır, konsol hatalarını toplar. ELLE çalıştırılır (önce npm run dev, http://127.0.0.1:5180).
//   HESAP=zengin|yeni  EKRAN_KLASORU=<klasör>  node scripts/tarayici/ekran-tara.mjs
// Çıktı: <klasör>/olcum-<hesap>.json ve <ekran>-<genislik>.png. Arayüz sadeleştirme (docs/arayuz4) önce/sonra raporu bunu kullanır.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const HESAP = process.env.HESAP || 'zengin';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'ekran-tara');
fs.mkdirSync(KLASOR, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const EKRANLAR = ['merkez', 'silo', 'taverna', 'demirhane', 'sifahane', 'koy', 'konsey', 'uzay', 'kisla', 'zindanmod', 'kolezyum', 'savasalani', 'pazar', 'karnaval', 'koleksiyon', 'ekonomi', 'profil', 'kotalar', 'hazine', 'surum', 'sorunbildir'];
const BOYUTLAR = [['telefon', 390, 844], ['masaustu', 1280, 800]];

const tarayici = await chromium.launch({
  executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const sonuc = [];
const hatalar = new Set();
for (const [ad, g, y] of BOYUTLAR) {
  const baglam = await tarayici.newContext({ viewport: { width: g, height: y }, hasTouch: ad === 'telefon', isMobile: ad === 'telefon' });
  const s = await baglam.newPage();
  s.on('pageerror', (e) => hatalar.add(`sayfa hatası: ${e.message}`));
  s.on('console', (m) => { if (m.type() === 'error' && !/ERR_NO_BUFFER|Failed to load resource/.test(m.text())) hatalar.add(`konsol: ${m.text().slice(0, 160)}`); });
  await s.addInitScript(() => { try { localStorage.setItem('v3_tur_bitti', '1'); localStorage.setItem('roa_tur_bitti', '1'); } catch (_) { /* depo yok */ } });
  await s.goto(BASE, { waitUntil: 'domcontentloaded' });
  await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
  await bekle(1500);
  if (HESAP === 'zengin') {
    await s.evaluate(() => {
      const gs = window.gameState; const st = gs.state;
      st.level = 12; st.adAstraBalance = 3e6; st.warehouseLevel = 3;
      for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) st.inventory[k] = 4000;
      for (let i = 0; i < 4; i++) gs.buySoldierUnit();
      gs.saveState();
    });
    await bekle(500);
  }
  for (const e of EKRANLAR) {
    await s.evaluate(() => { const k = document.getElementById('modal-close'); if (k) k.click(); });
    await bekle(250);
    await s.evaluate((x) => window.__v3.git(x), e);
    await bekle(1100);
    const o = await s.evaluate(() => {
      const m = document.getElementById('modal-body');
      const acik = !!m && m.offsetParent !== null && m.innerText.trim().length > 0;
      if (!acik) return { acik: false };
      const kap = m.closest('#rpg-modal') || m;
      const metin = m.innerText.replace(/\s+/g, ' ').trim();
      return { acik: true, harf: metin.length, dugme: m.querySelectorAll('button:not([disabled])').length, yukseklik: m.scrollHeight, gorunen: kap.clientHeight, baslik: metin.slice(0, 60) };
    });
    sonuc.push({ ekran: e, boyut: ad, ...o });
    if (o.acik) await s.screenshot({ path: path.join(KLASOR, `${e}-${ad}.png`) });
  }
  await baglam.close();
}
await tarayici.close();
fs.writeFileSync(path.join(KLASOR, `olcum-${HESAP}.json`), JSON.stringify(sonuc, null, 1));
console.log('ekran         boyut     harf düğme  yükseklik');
for (const r of sonuc) console.log(r.ekran.padEnd(13), r.boyut.padEnd(9), r.acik ? `${String(r.harf).padStart(5)} ${String(r.dugme).padStart(5)} ${String(r.yukseklik).padStart(8)}` : '  (açılmadı: kilitli ya da ekran yok)');
if (hatalar.size) { console.log('HATALAR:\n  ' + [...hatalar].join('\n  ')); process.exit(1); }
