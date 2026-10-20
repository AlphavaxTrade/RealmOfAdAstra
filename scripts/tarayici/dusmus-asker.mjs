/* global window, document */
// Düşmüş (canı sıfır) asker: Zindan savaşa hazırlık ekranında seçilemez, "Kazanacak kadar seç" ve "Tümünü seç" onu atlar, savaş reddedilir;
// iyileştirince tekrar seçilebilir. Seviye atlamak canı yenilemez. ELLE çalıştırılır (önce npm run dev, http://127.0.0.1:5180).
//   EKRAN_KLASORU=<klasör> node scripts/tarayici/dusmus-asker.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'dusmus-asker');
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

// Hazırlık: seviye 12, 3 güçlü asker; 1. oda sırada. Üçüncü askerin canını 0 yap (düşmüş).
await s.evaluate(() => {
  const gs = window.gameState; const st = gs.state;
  st.level = 12; st.adAstraBalance = 3e6; st.warehouseLevel = 6; st.dungeonProgress = 1;
  for (let i = 0; i < 2; i++) gs.buySoldierUnit();
  for (const a of st.soldierUnits) { a.hp = a.maxHp; }
  gs.setSoldierHpFromBattle(1, 0, { dusebilir: true });   // zindanda canı biten asker: düşüş bayrağı + can 0
  st.stamina = gs.getMaxStamina();
  gs.saveState();
  window.dispatchEvent(new Event('enter-dungeon-view'));
});
await bekle(1200);
const kat = await s.evaluate(() => (document.querySelector('#zindan-ekrani .zd-serit-bilgi') || {}).innerText?.replace(/\s+/g, ' ') || '');
console.log('Zindan şeridi:', kat);
await s.locator('#zindan-ekrani .zd-devam').click();
await bekle(1200);
await s.screenshot({ path: path.join(KLASOR, '01_hazirlik_dusmus.png') });
const haz = await s.evaluate(() => {
  const m = document.getElementById('modal-body');
  const satirlar = [...m.querySelectorAll('.ek-asker')].map((e) => ({ dusmus: e.classList.contains('is-dusmus'), secili: e.classList.contains('is-secili'), yazi: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 90) }));
  return { satirlar, basla: m.querySelector('[data-e="basla"]')?.innerText.replace(/\s+/g, ' '), pasif: m.querySelector('[data-e="basla"]')?.disabled };
});
console.log('Hazırlık:', JSON.stringify(haz));
not('hazırlık ekranında 2. asker "düştü" olarak işaretli ve seçili değil', haz.satirlar[1] && haz.satirlar[1].dusmus && !haz.satirlar[1].secili && /düştü/.test(haz.satirlar[1].yazi), JSON.stringify(haz.satirlar[1]));
not('sağlam askerler varsayılan seçili', haz.satirlar[0].secili && haz.satirlar[2]?.secili !== false);

// "Tümünü seç" ve "Kazanacak kadar seç" düşmüşü atlar
await s.evaluate(() => document.querySelector('#modal-body [data-e="hepsi"]')?.click());
await bekle(500);
const hepsi = await s.evaluate(() => [...document.querySelectorAll('#modal-body .ek-asker')].map((e) => e.classList.contains('is-secili')));
not('"Tümünü seç" düşmüş askeri seçmez', hepsi[1] === false, JSON.stringify(hepsi));
await s.evaluate(() => document.querySelector('#modal-body [data-e="otomatik"]')?.click());
await bekle(500);
const oto = await s.evaluate(() => [...document.querySelectorAll('#modal-body .ek-asker')].map((e) => e.classList.contains('is-secili')));
not('"Kazanacak kadar seç" düşmüş askeri seçmez', oto[1] === false, JSON.stringify(oto));

// Düşmüş askere dokunmak seçmez, uyarı verir
await s.evaluate(() => document.querySelectorAll('#modal-body .ek-asker')[1].querySelector('button').click());
await bekle(400);
const dok = await s.evaluate(() => [...document.querySelectorAll('#modal-body .ek-asker')].map((e) => e.classList.contains('is-secili')));
not('düşmüş askere dokunmak onu seçmez', dok[1] === false);

// Oyun kuralı: savaş doğrudan istenirse reddedilir
const red = await s.evaluate(() => { const r = window.gameState.fightDungeon(1, [1]); return { success: r.success, fallen: r.fallen, message: r.message }; });
not('savaş düşmüş askerle reddedilir, nedeni yazar', red.success === false && /düştü/.test(red.message), JSON.stringify(red));

// İyileştirince tekrar seçilebilir
await s.evaluate(() => { const a = window.gameState.state.soldierUnits[1]; a.hp = a.maxHp; window.gameState.saveState(); window.__v3.git('savashazirlik'); });
await s.evaluate(() => { const k = document.getElementById('modal-close'); if (k) k.click(); });
await bekle(300);
await s.evaluate(() => window.dispatchEvent(new Event('enter-dungeon-view')));
await bekle(800);
const yeniKat = await s.evaluate(() => window.gameState.getZindanTakimi().length);
not('iyileşince asker yeniden zindan takımına girer', yeniKat === 2, String(yeniKat));
await s.screenshot({ path: path.join(KLASOR, '02_iyilesti.png') });

not('konsolda hata yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
await tarayici.close();
const kotu = adimlar.filter(([, ok]) => !ok);
console.log(`\n${adimlar.length - kotu.length}/${adimlar.length} adım geçti. Görüntüler: ${KLASOR}`);
process.exitCode = kotu.length ? 1 : 0;
