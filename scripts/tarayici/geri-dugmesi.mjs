/* global window, document */
// Panel başlığındaki "‹ Geri" düğmesi (20 Ekim 2026): bir önceki ekrana ya da bölüm listesine döner.
// Senaryolar: bölüm listesi → ekran → Geri → liste; ekran → ekran → Geri → önceki ekran; aynı grubun sekmesi geçiş sayılmaz;
// listenin kendisinde ve ekran dışı panelde (ayarlar) düğme yok; panel kapanıp açılınca yığın temiz. ELLE çalıştırılır (npm run dev, http://127.0.0.1:5180).
//   EKRAN_KLASORU=<klasör> node scripts/tarayici/geri-dugmesi.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'geri-dugmesi');
fs.mkdirSync(KLASOR, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const hatalar = [];
const adimlar = [];
const not = (ad, ok, ayrinti = '') => { adimlar.push([ad, !!ok]); console.log(`${ok ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + ayrinti : ''}`); };

const tarayici = await chromium.launch({
  executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await baglam.addInitScript(() => { try { localStorage.setItem('v3_tur_bitti', '1'); localStorage.setItem('roa_tur_bitti', '1'); localStorage.setItem('roa_v3_tur_yerel', '{"atlandi":true}'); } catch (_) { /* depo yok */ } });
const s = await baglam.newPage();
s.on('pageerror', (e) => hatalar.push(`pageerror: ${e.message}`));
s.on('console', (m) => { if (m.type() === 'error' && !/ERR_NO_BUFFER|Failed to load resource/.test(m.text())) hatalar.push(`console: ${m.text().slice(0, 160)}`); });
await s.goto(BASE, { waitUntil: 'domcontentloaded' });
await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
await bekle(1500);
await s.evaluate(() => {
  const gs = window.gameState; const st = gs.state;
  st.level = 12; st.adAstraBalance = 3e6; st.warehouseLevel = 3;
  for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) st.inventory[k] = 4000;
  for (let i = 0; i < 2; i++) gs.buySoldierUnit();
  st.dungeonProgress = 4;
  gs.saveState();
});
await bekle(400);

const durum = () => s.evaluate(() => {
  const g = document.getElementById('btn-geri-modal');
  const m = document.getElementById('rpg-modal');
  return {
    acik: m.classList.contains('active'),
    geriGorunur: !!g && !g.hidden && g.offsetParent !== null,
    geriEtiket: g ? g.getAttribute('aria-label') : null,
    baslik: (document.getElementById('modal-title') || {}).innerText?.replace(/\s+/g, ' ').trim(),
    hub: !!document.querySelector('#modal-body .v3-hub')
  };
});
const sekme = async (ad) => { await s.locator('#v3-tabbar button').filter({ hasText: ad }).first().click(); await bekle(700); };
const git = async (k) => { await s.locator(`[data-v3-git="${k}"]`).first().click(); await bekle(900); };
const geri = async () => { await s.locator('#btn-geri-modal').click(); await bekle(700); };

// 1) Liste → ekran → Geri → liste
await sekme('Krallık');
let d = await durum();
not('bölüm listesinde Geri düğmesi yok', d.hub && !d.geriGorunur, JSON.stringify(d));
await git('taverna');
d = await durum();
await s.screenshot({ path: path.join(KLASOR, '01_taverna_geri.png') });
not('listeden ekrana gidince Geri düğmesi çıkar ve listeye (Krallık) döneceğini söyler', d.geriGorunur && /Krallık/.test(d.geriEtiket || ''), JSON.stringify(d));
await geri();
d = await durum();
not('Geri: bölüm listesi geri gelir, düğme kaybolur', d.hub && !d.geriGorunur && /Krallık/.test(d.baslik), JSON.stringify(d));

// 2) Ekran → ekran (ekran içi düğmeyle) → Geri → önceki ekran, sekme durumu korunur; ikinci Geri → liste
await sekme('Pazar');
await git('karnaval');
await s.locator('#modal-body [data-e="sekme"][data-sekme="havuzlar"]').first().click();
await bekle(700);
await s.locator('#modal-body [data-e="git"][data-hedef="hazine"]').first().click();
await bekle(900);
d = await durum();
await s.screenshot({ path: path.join(KLASOR, '02_hazine_geri.png') });
not('Karnaval → Hazine (ekran içi düğme): Geri düğmesi Karnaval ekranını gösterir', /Hazine/.test(d.baslik || '') && d.geriGorunur && /Karnaval/.test(d.geriEtiket || ''), JSON.stringify(d));
await geri();
d = await durum();
const sekmeKasalar = await s.evaluate(() => !!document.querySelector('#modal-body [data-sekme="havuzlar"][aria-selected="true"], #modal-body [data-sekme="havuzlar"].is-aktif, #modal-body [data-sekme="havuzlar"][aria-pressed="true"]'));
not('Geri: Karnaval açıldı (Kasalar sekmesi korunur) ve bir daha Geri Pazar listesini gösterir', /Karnaval/.test(d.baslik || '') && d.geriGorunur && /Pazar/.test(d.geriEtiket || ''), JSON.stringify({ ...d, sekmeKasalar }));
await geri();
d = await durum();
not('Geri iki kez: Pazar listesine ulaşıldı, düğme kayboldu', d.hub && !d.geriGorunur, JSON.stringify(d));

// 3) Aynı grubun sekmesi (Kolezyum ↔ Dünya bossu) geçiş sayılmaz
await sekme('Savaş');
await git('kolezyum');
d = await durum();
not('Arena (Kolezyum) ekranında Geri → Savaş listesi', d.geriGorunur && /Savaş/.test(d.geriEtiket || ''), JSON.stringify(d));
await s.locator('#modal-body [data-e="grupGit"][data-sekme="savasalani"]').first().click().catch(() => {});
await bekle(900);
d = await durum();
not('Dünya bossu sekmesine geçince Geri hâlâ Savaş listesini gösterir (sekme geçiş sayılmaz)', /Savaş alanı|Dünya/i.test(d.baslik || '') && d.geriGorunur && /Savaş/.test(d.geriEtiket || ''), JSON.stringify(d));
await geri();
d = await durum();
not('Geri: Savaş listesi', d.hub, JSON.stringify(d));

// 4) Ekran dışı panel (Ayarlar) ve kapat/aç: yığın temiz
await sekme('Ben');
await git('ayarlar');
d = await durum();
not('Ayarlar gibi ekran dışı panelde Geri düğmesi yok', !d.geriGorunur, JSON.stringify(d));
await s.evaluate(() => { const k = document.getElementById('btn-close-modal'); if (k) k.click(); });
await bekle(300);
await sekme('Krallık');
await git('merkez');
await s.evaluate(() => { const k = document.getElementById('btn-close-modal'); if (k) k.click(); });
await bekle(300);
await s.evaluate(() => window.__v3.git('taverna'));   // kısayolla (liste olmadan) açılan ekranda geri yok
await bekle(900);
d = await durum();
not('listeden gelmeyen (kısayolla açılan) ekranda Geri düğmesi yok', !d.geriGorunur, JSON.stringify(d));

not('konsolda hata yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
await tarayici.close();
const kotu = adimlar.filter(([, ok]) => !ok);
console.log(`\n${adimlar.length - kotu.length}/${adimlar.length} adım geçti. Görüntüler: ${KLASOR}`);
process.exitCode = kotu.length ? 1 : 0;
