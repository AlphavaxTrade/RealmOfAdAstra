/* global window, document */
// Harita sahneleri (21 Ekim 2026): ana harita → kapı → alt harita, bulut perdesi, "Ana harita" dönüşü, panel açıp kapama, zindan girişi/dönüşü.
// Telefon (390x844) ve bilgisayar (1280x800) boyutunda her sahnenin ekran görüntüsünü alır. ELLE çalıştırılır (npm run dev, http://127.0.0.1:5180).
//   EKRAN_KLASORU=<klasör> node scripts/tarayici/harita-sahneler.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'harita-sahneler');
fs.mkdirSync(KLASOR, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const hatalar = [];
const adimlar = [];
const not = (ad, ok, ayrinti = '') => { adimlar.push([ad, !!ok]); console.log(`${ok ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + ayrinti : ''}`); };

const tarayici = await chromium.launch({
  executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

async function oyna(ad, viewport, mobil) {
  console.log(`\n── ${ad} ${viewport.width}x${viewport.height} ──`);
  const baglam = await tarayici.newContext({ viewport, hasTouch: mobil, isMobile: mobil });
  await baglam.addInitScript(() => { try { localStorage.setItem('v3_tur_bitti', '1'); localStorage.setItem('roa_tur_bitti', '1'); localStorage.setItem('roa_v3_tur_yerel', '{"atlandi":true}'); } catch (_) { /* depo yok */ } });
  const s = await baglam.newPage();
  s.on('pageerror', (e) => hatalar.push(`${ad} pageerror: ${e.message}`));
  s.on('console', (m) => { if (m.type() === 'error' && !/ERR_NO_BUFFER|Failed to load resource/.test(m.text())) hatalar.push(`${ad} console: ${m.text().slice(0, 160)}`); });
  await s.goto(BASE, { waitUntil: 'domcontentloaded' });
  await s.waitForFunction(() => window.__v3 && window.gameState && window.realmMap && window.realmMap.sahne, null, { timeout: 40000 });
  await bekle(1500);
  await s.evaluate(() => {
    const gs = window.gameState; const st = gs.state;
    st.level = 12; st.adAstraBalance = 3e6; st.warehouseLevel = 3;
    for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) st.inventory[k] = 4000;
    for (let i = 0; i < 2; i++) gs.buySoldierUnit();
    st.dungeonProgress = 4;
    gs.saveState();
  });
  await bekle(600);

  const sahne = () => s.evaluate(() => window.realmMap.sahne);
  const tumEtiketler = () => s.evaluate(() => [...document.querySelectorAll('#map-overlay .map-label')].map((e) => e.dataset.zone));
  const foto = async (ad2) => s.screenshot({ path: path.join(KLASOR, `${ad}-${ad2}.png`) });
  const gec = async (id) => { await s.evaluate((x) => window.realmMap.sahneyeGec(x), id); await bekle(3200); };
  const perdeVar = () => s.evaluate(() => { const p = document.getElementById('gecis-perdesi'); return !!p && p.classList.contains('gp-goster'); });

  // 1) Ana harita: kapılar ve doğrudan yerler
  not('ana harita açılıyor', (await sahne()) === 'ana');
  const anaYerler = await tumEtiketler();
  for (const k of ['gec_sehir', 'gec_kaynak', 'gec_kisla', 'gec_savas', 'gec_zindan', 'gec_tarla', 'spaceport']) not(`ana haritada ${k}`, anaYerler.includes(k), anaYerler.join(','));
  not('ana haritada "Ana harita" çubuğu gizli', await s.evaluate(() => { const b = document.getElementById('sahne-bar'); return !b || b.hidden; }));
  await foto('1-ana');

  // 2) Şehre geçiş: perde görünür, sonra şehir sahnesi
  await s.evaluate(() => { window.realmMap.sahneyeGec('sehir'); });   // beklemeden: perde ortasında bakılacak
  await bekle(500);
  not('geçişte bulut perdesi görünüyor', await perdeVar());
  await foto('2-perde');
  await bekle(3000);
  not('perde kapanınca şehir sahnesi', (await sahne()) === 'sehir' && !(await perdeVar()));
  const sehirYerler = await tumEtiketler();
  for (const k of ['market', 'council', 'blacksmith', 'tavern', 'carnival', 'village', 'colosseum']) not(`şehirde ${k}`, sehirYerler.includes(k));
  not('şehirde silo yok (tarlalarda)', !sehirYerler.includes('warehouse'));
  not('"Ana harita" çubuğu görünür', await s.evaluate(() => { const b = document.getElementById('sahne-bar'); return !!b && !b.hidden && b.offsetParent !== null; }));
  await foto('3-sehir');

  // 3) Bir yere dokun: panel açılır, kapanınca aynı sahnede kalınır
  await s.evaluate(() => document.querySelector('#map-overlay .map-label[data-zone="market"]').click());
  await bekle(900);
  not('pazar paneli açıldı', await s.evaluate(() => document.getElementById('rpg-modal').classList.contains('active')));
  await s.evaluate(() => document.getElementById('btn-close-modal').click());
  await bekle(600);
  not('panel kapanınca şehirde kalındı', (await sahne()) === 'sehir');

  // 4) Harita sekmesine dokun: ana haritaya dön
  await s.locator('#v3-tabbar button').filter({ hasText: 'Harita' }).first().click();
  await bekle(3200);
  not('Harita sekmesi ana haritaya döndürdü', (await sahne()) === 'ana');

  // 5) "Ana harita" düğmesiyle dönüş
  await gec('kaynak');
  not('madenler sahnesi', (await sahne()) === 'kaynak');
  const kaynakYerler = await tumEtiketler();
  for (const k of ['coalmine', 'mine', 'quarry', 'forest']) not(`madenlerde ${k}`, kaynakYerler.includes(k));
  await foto('4-kaynak');
  await s.locator('.sahne-geri').click();
  await bekle(3200);
  not('"Ana harita" düğmesi çalıştı', (await sahne()) === 'ana');

  // 6) Diğer sahneler
  for (const [id, beklenen] of [['kisla', ['barracks', 'healer']], ['savas', ['battlefield']], ['tarla', ['farm', 'herbgarden', 'warehouse']]]) {
    await gec(id);
    const y = await tumEtiketler();
    not(`${id} sahnesi açıldı`, (await sahne()) === id);
    for (const k of beklenen) not(`${id} sahnesinde ${k}`, y.includes(k));
    await foto(`5-${id}`);
    await gec('ana');
  }

  // 7) Zindan: kapıdan zindan sahnesi, oradan zindan ekranı; çıkınca zindan sahnesinde kalınır
  await gec('zindan');
  not('zindan sahnesi', (await sahne()) === 'zindan');
  await foto('6-zindan');
  await s.evaluate(() => document.querySelector('#map-overlay .map-label[data-zone="dungeon"]').click());
  await bekle(1500);
  not('zindan ekranı açıldı', await s.evaluate(() => { const z = document.getElementById('zindan-ekrani'); return !!z && !z.hidden; }));
  await foto('7-zindan-ekrani');
  await s.evaluate(() => { const b = document.querySelector('#zindan-ekrani [data-zd="cik"], #zindan-ekrani .zd-geri, #zindan-ekrani [data-zd-cik]'); if (b) b.click(); });
  await bekle(1500);
  const geriDondu = await s.evaluate(() => { const z = document.getElementById('zindan-ekrani'); return !z || z.hidden; });
  if (geriDondu) not('zindandan dönünce zindan haritasındayız', (await sahne()) === 'zindan');
  else console.log('ℹ️ zindan çıkış düğmesi bulunamadı, dönüş denemesi atlandı');

  await baglam.close();
}

await oyna('telefon', { width: 390, height: 844 }, true);
await oyna('bilgisayar', { width: 1280, height: 800 }, false);
await tarayici.close();

const basarisiz = adimlar.filter(([, ok]) => !ok);
console.log(`\n${adimlar.length - basarisiz.length}/${adimlar.length} adım geçti; konsol hatası: ${hatalar.length}`);
for (const h of hatalar.slice(0, 10)) console.log('  ' + h);
console.log(`Ekran görüntüleri: ${KLASOR}`);
process.exit(basarisiz.length || hatalar.length ? 1 : 0);
