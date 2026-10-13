/* global window, document, getComputedStyle, innerWidth, innerHeight */
// CSS yeniden yazımında GÖRSEL EŞDEĞERLİK ölçümü. ELLE çalıştırılır; geliştirme sunucusu açık olmalı (npm run dev, 5180).
//   node scripts/tarayici/stil-kaydi.mjs <cikti.json> [--kapsam <kapsam.json>] [--html <dom.json>]
//   node scripts/tarayici/stil-fark.mjs <once.json> <sonra.json>
// Her durumda (ekran × görünüm × hesap) sayfadaki HER öğenin hesaplanmış stilini (≈100 özellik) ve konumunu kaydeder.
// CSS dosyaları yeniden yazılınca iki kayıt karşılaştırılır: fark yoksa aynı görünüm. --kapsam: Chrome'un CSS kapsamını (hangi
// kural hiçbir öğeye uygulanmadı) ayrıca yazar. Animasyonlar için animasyonlar kapatılır (kayıt tekrarlanabilir olsun).
// Ortam: OYUN_ADRESI, CHROME_YOLU
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const cikti = process.argv[2];
if (!cikti) { console.error('Kullanım: node scripts/tarayici/stil-kaydi.mjs <cikti.json> [--kapsam <kapsam.json>]'); process.exit(2); }
const kapsamYolu = process.argv.includes('--kapsam') ? process.argv[process.argv.indexOf('--kapsam') + 1] : null;
const htmlYolu = process.argv.includes('--html') ? process.argv[process.argv.indexOf('--html') + 1] : null;   // her durumun DOM'u (css-sadelestir.mjs için)
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

export const OZELLIKLER = [
  'display', 'position', 'top', 'left', 'right', 'bottom', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
  'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat',
  'color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign', 'textTransform',
  'textDecorationLine', 'textShadow', 'whiteSpace', 'wordBreak', 'overflowX', 'overflowY', 'textOverflow', 'opacity', 'visibility', 'zIndex',
  'boxShadow', 'transform', 'filter', 'backdropFilter', 'mixBlendMode', 'cursor', 'pointerEvents', 'userSelect',
  'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink', 'flexBasis', 'justifyContent', 'alignItems', 'alignSelf', 'alignContent', 'order',
  'rowGap', 'columnGap', 'gridTemplateColumns', 'gridTemplateRows', 'gridColumnStart', 'gridColumnEnd', 'objectFit', 'aspectRatio',
  'outlineStyle', 'outlineWidth', 'outlineColor', 'listStyleType', 'verticalAlign', 'boxSizing', 'clipPath', 'maskImage'
];

// Telefon + masaüstü × yeni hesap + ilerlemiş hesap
const GORUNUMLER = [['tel', 390, 844, true], ['masa', 1280, 800, false]];
const HESAPLAR = [['sv1', 1], ['sv30', 30]];
const EKRANLAR = ['merkez', 'silo', 'taverna', 'demirhane', 'sifahane', 'koy', 'konsey', 'uzay', 'kisla', 'kolezyum', 'savasalani',
  'pazar', 'karnaval', 'koleksiyon', 'ekonomi', 'profil', 'hesap', 'kotalar', 'hazine', 'ayarlar', 'duyurular', 'surum', 'cevrimdisi', 'hurda', 'rehber'];

const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sonuc = { ozellikler: OZELLIKLER, durumlar: {} };
const kapsamlar = new Map();   // url → Set(kullanılan aralık "a-b")
const htmller = {};           // durum adı → { html, htmlSinif, govdeSinif, w, h }

async function kaydet(s, ad) {
  const veri = await s.evaluate((OZ) => {
    const yol = (e) => { const p = []; for (let x = e; x && x !== document.documentElement; x = x.parentElement) { let i = 0; for (let k = x; k; k = k.previousElementSibling) i++; p.push(`${x.tagName.toLowerCase()}${i}`); } return p.reverse().join('>'); };
    const cikis = [];
    for (const e of document.body.querySelectorAll('*')) {
      if (e.closest('canvas, script, style, svg')) continue;                     // tuval içi ve satır içi svg ayrıntısı
      if (e.closest('#phaser-game-container, #vadi3d-container') && e.tagName !== 'DIV') continue;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const d = OZ.map((p) => cs[p]);
      cikis.push([yol(e), String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).slice(0, 60), `${Math.round(r.x * 10) / 10},${Math.round(r.y * 10) / 10},${Math.round(r.width * 10) / 10},${Math.round(r.height * 10) / 10}`, d.join('|')]);
    }
    return cikis;
  }, OZELLIKLER);
  sonuc.durumlar[ad] = veri;
  if (htmlYolu) {
    htmller[ad] = await s.evaluate(() => {
      const k = document.body.cloneNode(true);
      k.querySelectorAll('script, canvas, style').forEach((e) => e.remove());
      return { html: k.innerHTML, htmlSinif: document.documentElement.className, govdeSinif: document.body.className, w: innerWidth, h: innerHeight };
    });
  }
}

async function kapsamiTopla(s) {
  const liste = await s.coverage.stopCSSCoverage();
  for (const k of liste) {
    if (!kapsamlar.has(k.url)) kapsamlar.set(k.url, { metin: k.text, aralik: new Set() });
    for (const a of k.ranges) kapsamlar.get(k.url).aralik.add(`${a.start}-${a.end}`);
  }
}

for (const [gAd, w, h, mobil] of GORUNUMLER) {
  for (const [hAd, seviye] of HESAPLAR) {
    const baglam = await tarayici.newContext({ viewport: { width: w, height: h }, hasTouch: mobil, isMobile: mobil, reducedMotion: 'reduce' });
    await baglam.addInitScript(() => { try { localStorage.setItem('roa_v3_tur_yerel', '{"atlandi":true}'); localStorage.setItem('v3_tur_bitti', '1'); } catch { /* */ } });
    const s = await baglam.newPage();
    await s.addInitScript(() => { const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
    if (kapsamYolu) await s.coverage.startCSSCoverage({ resetOnNavigation: false });
    await s.goto(BASE + '/', { waitUntil: 'load' });
    await s.waitForFunction(() => window.gameState && window.__v3, null, { timeout: 60000 });
    await bekle(2500);
    if (seviye > 1) {
      await s.evaluate((lv) => {
        const g = window.gameState; g.setDevLevel(lv); g.setDevAdAstra(250000);
        for (let i = 0; i < 4; i++) g.buySoldierUnit();
        const st = g.state; st.arenaKeys = 6; st.stamina = 5000;
        for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) st.inventory[k] = 800;
        st.inventory.fragments = 60; g.saveState();
      }, seviye);
      await bekle(600);
    }
    const on = `${gAd}_${hAd}_`;
    await kaydet(s, on + 'harita');

    for (const e of EKRANLAR) {
      try {
        await s.keyboard.press('Escape'); await bekle(150);
        await s.evaluate((k) => window.__v3.git(k), e);
        await bekle(500);
        await kaydet(s, on + e);
      } catch (err) { console.log('atlandı', on + e, String(err.message).split('\n')[0]); }
    }
    await s.keyboard.press('Escape'); await bekle(150);

    // kaynak bölgeleri
    for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) {
      try {
        await s.evaluate((x) => { const d = document.getElementById('v3-kaynak-dugme'); if (d) d.click(); document.querySelector(`[data-v3-kaynak="${x}"]`)?.click(); }, k);
        await bekle(400);
        await kaydet(s, on + 'bolge_' + k);
        await s.keyboard.press('Escape'); await bekle(150);
      } catch { /* */ }
    }

    // komut paleti
    try { await s.keyboard.down('Control'); await s.keyboard.press('k'); await s.keyboard.up('Control'); await bekle(400); await kaydet(s, on + 'palet'); await s.keyboard.press('Escape'); await bekle(150); } catch { /* */ }
    // savaş hazırlığı ve arena
    try {
      // gerçek akış: zindan ekranı → 1. oda → "Savaşa hazırlan"
      await s.evaluate(() => { window.dispatchEvent(new CustomEvent('enter-dungeon-view')); });
      await bekle(500);
      await s.evaluate(() => { const o = document.querySelector('#zindan-ekrani .zd-bolge[data-oda="0"]'); if (o) o.click(); });
      await bekle(300);
      await s.evaluate(() => { const b = document.querySelector('#zindan-ekrani [data-e="savas"]'); if (b) b.click(); });
      await bekle(700);
      await kaydet(s, on + 'savashazirlik');
      if (seviye > 1) {
        await s.evaluate(() => { document.querySelector('[data-e="basla"]')?.click(); });
        await bekle(1500);
        await kaydet(s, on + 'arena');
        await s.evaluate(() => { document.getElementById('aa-skipBtn')?.click(); });
        await bekle(1200);
        await kaydet(s, on + 'arena_sonuc');
        await s.evaluate(() => { document.getElementById('aa-resultCloseBtn')?.click(); document.getElementById('aa-closeBtn')?.click(); });
        await bekle(300);
      }
      await s.keyboard.press('Escape'); await bekle(150);
      // zindan ekranından çık (oda → kat → kasaba)
      await s.evaluate(() => { for (let i = 0; i < 2; i++) { const z = document.getElementById('zindan-ekrani'); if (z && !z.hidden) z.querySelector('[data-e="geri"]').click(); } });
      await bekle(300);
    } catch (err) { console.log('arena atlandı', on, String(err.message).split('\n')[0]); }
    // bildirim (toast) ve bildirim kutusu
    try {
      await s.evaluate(() => { window.dispatchEvent(new CustomEvent('toast-notify', { detail: { message: 'Deneme bildirimi', type: 'success' } })); window.dispatchEvent(new CustomEvent('toast-notify', { detail: { message: 'Hata bildirimi', type: 'error' } })); });
      await bekle(300);
      await kaydet(s, on + 'toast');
    } catch { /* */ }

    if (kapsamYolu) await kapsamiTopla(s);
    await baglam.close();
    console.log('tamam', on, Object.keys(sonuc.durumlar).filter((k) => k.startsWith(on)).length, 'durum');
  }
}
await tarayici.close();

fs.writeFileSync(cikti, JSON.stringify(sonuc));
console.log('Yazıldı:', cikti, `(${Object.keys(sonuc.durumlar).length} durum)`);
if (htmlYolu) { fs.writeFileSync(htmlYolu, JSON.stringify(htmller)); console.log('DOM kaydı yazıldı:', htmlYolu); }
if (kapsamYolu) {
  const dosyalar = {};
  for (const [url, v] of kapsamlar) dosyalar[url] = { metin: v.metin, aralik: [...v.aralik].map((a) => a.split('-').map(Number)) };
  fs.writeFileSync(kapsamYolu, JSON.stringify(dosyalar));
  console.log('Kapsam yazıldı:', kapsamYolu);
}
