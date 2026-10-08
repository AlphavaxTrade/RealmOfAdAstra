/* global window, document, innerWidth, getComputedStyle */
// Arayüz v3 kabuğu: gerçek tarayıcıda (Chrome + Playwright) gözle ve sayıyla kontrol. ELLE çalıştırılır (npm test'e girmez).
// Önce geliştirme sunucusu açık olmalı: npm run dev (http://127.0.0.1:5180, tek kişilik yerel mod, giriş gerekmez).
// Kullanım: node scripts/tarayici/v3.mjs      Ortam: OYUN_ADRESI, CHROME_YOLU, EKRAN_KLASORU (ekran görüntüleri; varsayılan geçici klasör)
// Denetler: üst çubuk/alt çubuk boyutu, yatay taşma, her sekmenin ana listesi, bir alt sayfaya girip sekmeyle geri dönme,
// seferler paneli, kaynak tepsisi, onay penceresi (Esc = vazgeç, Onayla = evet), konsol hatası yok.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const EKRAN = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'v3-ekran');
fs.mkdirSync(EKRAN, { recursive: true });
const bekle = ms => new Promise(r => setTimeout(r, ms));
const sonuc = [];
const kontrol = (ad, kosul, ayrinti = '') => { sonuc.push([ad, !!kosul]); console.log(`${kosul ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + ayrinti : ''}`); };

const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const hatalar = [];
for (const [ad, w, h, mobil] of [['tel', 390, 844, true], ['masa', 1280, 800, false]]) {
  const baglam = await tarayici.newContext({ viewport: { width: w, height: h }, hasTouch: mobil, isMobile: mobil });
  const s = await baglam.newPage();
  s.on('pageerror', e => hatalar.push(`${ad} pageerror: ${e.message}`));
  s.on('console', m => { if (m.type() === 'error') hatalar.push(`${ad} console.error: ${m.text().slice(0, 200)}`); });
  await s.goto(BASE + '/?arayuz=3', { waitUntil: 'load' });
  await s.waitForFunction(() => window.gameState && window.__v3, null, { timeout: 60000 });
  await bekle(4000);
  const foto = n => s.screenshot({ path: path.join(EKRAN, `${ad}_${n}.png`) });
  const tikla = async sel => { await s.locator(sel).first().click({ timeout: 5000 }); await bekle(600); };
  const panelAcik = () => s.evaluate(() => document.getElementById('rpg-modal').classList.contains('active'));
  const baslik = () => s.evaluate(() => document.getElementById('modal-title').innerText.replace(/\s+/g, ' ').trim());

  await foto('00_harita');
  const o = await s.evaluate(() => ({ tasma: document.documentElement.scrollWidth > innerWidth + 2, hud: document.getElementById('v3-hud').offsetHeight, tab: document.getElementById('v3-tabbar').offsetHeight, eski: getComputedStyle(document.getElementById('top-nav-strip')).display }));
  kontrol(`${ad}: yatay taşma yok`, !o.tasma);
  kontrol(`${ad}: üst çubuk tek satır (52 px) ve alt çubuk 60 px`, o.hud === 52 && o.tab === 60, JSON.stringify(o));
  kontrol(`${ad}: eski üst şerit gizli`, o.eski === 'none');

  await tikla('#v3-kaynak-dugme'); await foto('01_kaynak_tepsi');
  kontrol(`${ad}: kaynak tepsisi açıldı (7 satır)`, await s.evaluate(() => !document.getElementById('v3-kaynak-tepsi').hidden && document.querySelectorAll('.v3-kaynak').length === 7));
  await tikla('#v3-kaynak-dugme');

  for (const id of ['kralik', 'savas', 'pazar', 'ben']) { await tikla(`[data-v3-sekme="${id}"]`); await foto(`02_${id}`); kontrol(`${ad}: ${id} ana listesi açılır`, (await panelAcik()) && await s.evaluate(() => !!document.querySelector('#modal-body .v3-hub'))); }

  await tikla('[data-v3-sekme="kralik"]'); await tikla('[data-v3-git="merkez"]'); await foto('03_kralik_merkez');
  kontrol(`${ad}: Krallık merkezi açılır`, /KRALLIK MERKEZİ/i.test(await baslik()), await baslik());
  await tikla('[data-v3-sekme="kralik"]');
  kontrol(`${ad}: aktif sekmeye tekrar dokunmak ana listeye döner`, await s.evaluate(() => !!document.querySelector('#modal-body .v3-hub')));
  await tikla('[data-v3-sekme="kralik"]');
  kontrol(`${ad}: ana listedeyken tekrar dokunmak paneli kapatır`, !(await panelAcik()));

  await tikla('[data-v3-sekme="kralik"]'); await tikla('[data-v3-git="seferler"]'); await foto('04_seferler');
  kontrol(`${ad}: seferler paneli açılır`, await s.evaluate(() => document.getElementById('realm-sidebar').classList.contains('open')));
  await tikla('.v3-yan-kapat');
  kontrol(`${ad}: seferler paneli kapanır`, await s.evaluate(() => !document.getElementById('realm-sidebar').classList.contains('open')));

  // onay penceresi: Esc vazgeç, Onayla evet
  await s.evaluate(async () => { const m = await import('/js/ui/v3/bilesenler.js'); window.__onay = (...a) => { window.__sonuc = undefined; m.onay(...a).then(v => { window.__sonuc = v; }); }; });   // söz döndürmez: evaluate pencere kapanana kadar beklemesin
  await s.evaluate(() => window.__onay({ baslik: 'Silinsin mi?', metin: 'Geri alınamaz.', tamam: 'Sil', tehlikeli: true }));
  await foto('05_onay');
  kontrol(`${ad}: tehlikeli onayda odak Vazgeç düğmesinde`, await s.evaluate(() => document.activeElement?.hasAttribute('data-v3-vazgec')));
  await s.keyboard.press('Escape'); await bekle(200);
  kontrol(`${ad}: Esc = vazgeç (false) ve pencere kapanır`, await s.evaluate(() => window.__sonuc === false && !document.querySelector('.v3-onay-kap')));
  await s.evaluate(() => window.__onay({ baslik: 'Devam?' }));
  await tikla('[data-v3-tamam]');
  kontrol(`${ad}: Onayla = evet (true)`, await s.evaluate(() => window.__sonuc === true));
  await baglam.close();
}
await tarayici.close();
kontrol('konsolda hata yok', hatalar.length === 0, hatalar.slice(0, 5).join(' | '));
console.log(`\nEkran görüntüleri: ${EKRAN}`);
process.exit(sonuc.every(x => x[1]) ? 0 : 1);
