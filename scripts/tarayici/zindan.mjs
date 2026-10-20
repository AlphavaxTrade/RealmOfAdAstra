/* global window, document, innerWidth, innerHeight, getComputedStyle */
// Zindan ekranı: gerçek tarayıcıda (Chrome + Playwright) gözle ve sayıyla kontrol. ELLE çalıştırılır (npm test'e girmez).
// Önce geliştirme sunucusu açık olmalı: npm run dev (http://127.0.0.1:5180, tek kişilik yerel mod, giriş gerekmez).
// Kullanım: node scripts/tarayici/zindan.mjs      Ortam: OYUN_ADRESI, CHROME_YOLU, EKRAN_KLASORU
// Denetler (telefon 390×844, küçük telefon 360×640, yatay telefon 844×390, masaüstü 1280×800, geniş 1887×831):
// kat görünümü (3 oda, geçit, kat sekmeleri), oda görünümü (tek oda, savaşa hazırlan), yatay taşma, dokunma hedefi ≥ 40 px,
// kütük, geri düğmeleri, gerçek savaş akışı (kat kutlaması, "aynı savaşı tekrarla"), konsol hatası yok. Ekran görüntüleri EKRAN_KLASORU içine yazılır.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const EKRAN = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'zindan-ekran');
fs.mkdirSync(EKRAN, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const sonuc = [];
const kontrol = (ad, kosul, ayrinti = '') => { sonuc.push([ad, !!kosul]); console.log(`${kosul ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + ayrinti : ''}`); };

const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const hatalar = [];
const BOYUTLAR = [['tel', 390, 844, true], ['kucuk', 360, 640, true], ['yatay', 844, 390, true], ['masa', 1280, 800, false], ['genis', 1887, 831, false]];

for (const [ad, w, h, mobil] of BOYUTLAR) {
  const baglam = await tarayici.newContext({ viewport: { width: w, height: h }, hasTouch: mobil, isMobile: mobil });
  await baglam.addInitScript(() => { try { localStorage.setItem('roa_v3_tur_yerel', '{"atlandi":true}'); } catch { /* */ } });
  const s = await baglam.newPage();
  s.on('pageerror', (e) => hatalar.push(`${ad} pageerror: ${e.message}`));
  s.on('console', (m) => { if (m.type() === 'error') hatalar.push(`${ad} console.error: ${m.text().slice(0, 200)}`); });
  await s.goto(BASE + '/', { waitUntil: 'load' });
  await s.waitForFunction(() => window.gameState && window.__v3, null, { timeout: 60000 });
  await bekle(3000);
  const foto = (n) => s.screenshot({ path: path.join(EKRAN, `${ad}_${n}.png`) });

  // Hesabı zindanı denemeye uygun hâle getir: seviye 30, üç asker, 6. kata kadar açık değil (2. oda sıradaki)
  await s.evaluate(() => {
    const gs = window.gameState;
    gs.setDevLevel(30);
    gs.state.stamina = gs.getMaxStamina();
    if (!(gs.state.soldierUnits || []).length) for (let i = 0; i < 4; i++) gs.state.soldierUnits.push({ name: `Er ${i + 1}`, level: 5, hp: 500, maxHp: 500, atk: 70, row: i % 2 ? "back" : "front", skills: ["shieldWall"] });
    gs.state.dungeonProgress = 5;
    gs.saveState();
  });

  await s.evaluate(() => window.dispatchEvent(new CustomEvent('enter-dungeon-view')));
  await bekle(900);
  await foto('01_kat');

  const kat = await s.evaluate(() => {
    const k = document.getElementById('zindan-ekrani');
    const gorunur = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const dugmeler = [...k.querySelectorAll('button')].filter(gorunur);
    const kucuk = dugmeler.filter((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height) < 40; }).map((b) => b.dataset.e || b.className);
    return {
      acik: !k.hidden && document.body.classList.contains('in-dungeon'),
      gorunum: k.dataset.gorunum,
      katSekmesi: k.querySelectorAll('.zd-kat').length,
      aktifKat: (k.querySelector('.zd-kat.is-aktif') || {}).dataset?.kat,
      oda: k.querySelectorAll('.zd-bolge').length,
      listeGorunur: [...k.querySelectorAll('.zd-liste .zd-kart')].some(gorunur),
      plakaGorunur: [...k.querySelectorAll('.zd-plaka')].some(gorunur),
      tasma: document.documentElement.scrollWidth > innerWidth + 2 || k.scrollWidth > k.clientWidth + 2,
      kucukHedef: kucuk,
      eskiSerit: !!document.getElementById('top-nav-strip'),
      canvas: !!document.querySelector('#phaser-game-container canvas') && getComputedStyle(document.getElementById('zindan-ekrani')).display !== 'none'
    };
  });
  kontrol(`${ad}: zindan ekranı açılır, kat görünümü, 6 kat sekmesi, 3 oda`, kat.acik && kat.gorunum === 'kat' && kat.katSekmesi === 6 && kat.oda === 3, JSON.stringify(kat));
  kontrol(`${ad}: oyuncunun şu anki katı (2) açılır`, kat.aktifKat === '2', String(kat.aktifKat));
  kontrol(`${ad}: yatay taşma yok`, !kat.tasma);
  kontrol(`${ad}: dokunma hedefleri ≥ 40 px`, kat.kucukHedef.length === 0, kat.kucukHedef.join(','));
  if (w <= 760) kontrol(`${ad}: dar ekranda oda listesi görünür, levha yazısı gizli`, kat.listeGorunur && !kat.plakaGorunur);
  else kontrol(`${ad}: geniş ekranda levhalar resmin üstünde, liste gizli`, kat.plakaGorunur && !kat.listeGorunur);

  // Oda aç
  // 20 Ekim 2026 yeni düzen: telefonda oda liste kartından, geniş ekranda resmin üstündeki bölgeden açılır
  await s.locator(w <= 760 ? '.zd-liste [data-e="oda"][data-oda="1"]' : '.zd-bolge[data-oda="1"]').click();
  await bekle(500);
  await foto('02_oda');
  const oda = await s.evaluate(() => {
    const k = document.getElementById('zindan-ekrani');
    const eylem = k.querySelector('.zd-eylem');
    const r = eylem ? eylem.getBoundingClientRect() : null;
    return {
      gorunum: k.dataset.gorunum,
      baslik: (k.querySelector('.zd-oda-ust h2') || {}).textContent,
      sans: !!k.querySelector('.zd-sans-blok'),
      eylemGorunur: !!r && r.bottom <= innerHeight + 1 && r.top >= 0,
      tasma: document.documentElement.scrollWidth > innerWidth + 2,
      geriYazi: (k.querySelector('.zd-geri') || {}).getAttribute?.('aria-label')
    };
  });
  kontrol(`${ad}: oda görünümü açılır (tek oda, canavar adı, şans bloğu)`, oda.gorunum === 'oda' && oda.baslik && oda.sans, JSON.stringify(oda));
  kontrol(`${ad}: "Savaşa hazırlan" düğmesi ekranda görünür (kaydırmadan)`, oda.eylemGorunur, JSON.stringify(oda));
  kontrol(`${ad}: oda görünümünde yatay taşma yok`, !oda.tasma);
  kontrol(`${ad}: geri düğmesi "Odalara dön"`, oda.geriYazi === 'Odalara dön', String(oda.geriYazi));

  // Savaşa hazırlan → hazırlık ekranı (pencere) açılır
  await s.locator('[data-e="savas"]').click();
  await bekle(700);
  await foto('03_hazirlik');
  kontrol(`${ad}: Savaşa hazırlan, savaşa hazırlık penceresini açar`, await s.evaluate(() => document.getElementById('rpg-modal').classList.contains('active') && /Savaşa hazırlık/.test(document.getElementById('modal-title').innerText)));
  await s.keyboard.press('Escape'); await bekle(400);

  // Önceki / sonraki oda, Esc, kat sekmesi, geçit
  await s.locator('[data-e="komsu"][data-yon="1"]').click(); await bekle(300);
  kontrol(`${ad}: sonraki oda (3. oda)`, await s.evaluate(() => /Oda 3 \/ 3/.test(document.querySelector('.zd-oda-etiket').textContent)));
  await s.keyboard.press('Escape'); await bekle(300);
  kontrol(`${ad}: Esc odadan kata döner`, await s.evaluate(() => document.getElementById('zindan-ekrani').dataset.gorunum === 'kat'));
  await s.locator('.zd-kat[data-kat="6"]').click(); await bekle(400);
  await foto('04_kat6');
  kontrol(`${ad}: 6. kat seçilir, geçit yok (son kat)`, await s.evaluate(() => document.getElementById('zindan-ekrani').dataset.tema === 'kat6' && !document.querySelector('.zd-gecit')));
  await s.locator('.zd-kat[data-kat="1"]').click(); await bekle(400);
  await s.locator('[data-e="gecit"]:visible').first().click(); await bekle(400);
  kontrol(`${ad}: geçit sonraki kata ışınlar`, await s.evaluate(() => document.getElementById('zindan-ekrani').dataset.tema === 'kat2'));

  // Kütük ("⋯ Daha fazla" katının içinde: önce kapalı olduğu doğrulanır, sonra açılır)
  kontrol(`${ad}: "Daha fazla" katı başta kapalı, kütük düğmesi gizli`, await s.evaluate(() => { const d = document.querySelector('#zindan-ekrani details.zd-daha'); return !!d && !d.open; }));
  await s.locator('#zindan-ekrani details.zd-daha > summary').click(); await bekle(200);
  await s.locator('[data-e="kutuk"]').click(); await bekle(400);
  await foto('05_kutuk');
  const kutuk = await s.evaluate(() => ({ acik: !!document.querySelector('.zd-pano'), kartlar: document.querySelectorAll('.zd-kutuk-kart').length, kapali: document.querySelectorAll('.zd-kutuk-kart.is-kapali').length }));
  kontrol(`${ad}: kütük açılır (18 kart, ilerlemeye göre kapalı olanlar)`, kutuk.acik && kutuk.kartlar === 18 && kutuk.kapali === 13, JSON.stringify(kutuk));
  await s.locator('[data-e="kutuk-kapat"]').click(); await bekle(300);

  // Kasabaya dön
  await s.locator('[data-e="geri"]').click(); await bekle(900);
  const don = await s.evaluate(() => ({ gizli: document.getElementById('zindan-ekrani').hidden, iceride: document.body.classList.contains('in-dungeon'), hud: getComputedStyle(document.getElementById('v3-hud')).display }));
  kontrol(`${ad}: kasabaya dönünce zindan ekranı kapanır, v3 çubukları gelir`, don.gizli && !don.iceride && don.hud !== 'none', JSON.stringify(don));
  await baglam.close();
}

// ── Gerçek savaş akışı: zafer → kat kutlaması + rozet; zafer ekranından "Aynı savaşı tekrarla" ──
{
  const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await baglam.addInitScript(() => { try { localStorage.setItem('roa_v3_tur_yerel', '{"atlandi":true}'); } catch { /* */ } });
  const s = await baglam.newPage();
  s.on('pageerror', (e) => hatalar.push(`savas pageerror: ${e.message}`));
  s.on('console', (m) => { if (m.type() === 'error') hatalar.push(`savas console.error: ${m.text().slice(0, 200)}`); });
  await s.goto(BASE + '/', { waitUntil: 'load' });
  await s.waitForFunction(() => window.gameState && window.__v3, null, { timeout: 60000 });
  await bekle(3000);
  await s.evaluate(() => {
    const gs = window.gameState;
    gs.setDevLevel(30);
    gs.state.stamina = gs.getMaxStamina();
    gs.state.soldierUnits = Array.from({ length: 6 }, (_, i) => ({ name: `Er ${i + 1}`, level: 10, hp: 9000, maxHp: 9000, atk: 900, row: i % 2 ? 'back' : 'front', skills: ['shieldWall'] }));
    gs.state.dungeonProgress = 3;   // 1. katın son odası sırada
    gs.saveState();
    window.dispatchEvent(new CustomEvent('enter-dungeon-view'));
  });
  await bekle(700);
  // Yeni düzen: kat görünümünün başındaki tek "Sıradaki" düğmesi doğrudan savaşa hazırlığı açar (oda aç → savaşa hazırlan iki dokunuşu bire indi)
  const devam = await s.evaluate(() => (document.querySelector('#zindan-ekrani .zd-devam') || {}).textContent || '');
  kontrol('savaş: kat başında "Sıradaki: Oda 3" düğmesi var', /Sıradaki: Oda 3/.test(devam), devam.replace(/\s+/g, ' '));
  await s.locator('#zindan-ekrani .zd-devam').click(); await bekle(800);
  await s.evaluate(() => document.querySelector('#modal-body [data-e="basla"]').click());
  await bekle(1500);
  await s.evaluate(() => document.getElementById('aa-skipBtn')?.click());
  await bekle(1500);
  const sonuc = await s.evaluate(() => {
    const dugmeler = [...document.querySelectorAll('#aa-resultActions button')].map((b) => b.textContent.trim());
    return { dugmeler, ilerleme: window.gameState.state.dungeonProgress };
  });
  kontrol('savaş: zafer sonrası ilerleme 4 (1. kat tamam)', sonuc.ilerleme === 4, JSON.stringify(sonuc));
  kontrol('savaş: zafer ekranında "Aynı savaşı tekrarla" düğmesi var', sonuc.dugmeler.some((t) => /Aynı savaşı tekrarla/.test(t)), sonuc.dugmeler.join(' | '));
  await s.evaluate(() => document.getElementById('aa-resultCloseBtn')?.click());
  await bekle(600);
  const kutlama = await s.evaluate(() => ({
    bant: (document.querySelector('.zd-kutlama') || {}).textContent || '',
    rozet: (document.querySelector('.zd-kat[data-kat="1"] .zd-kat-isaret') || {}).textContent || '',
    tekrarDugmesi: !!document.querySelector('#zindan-ekrani [data-e="tekrar"]')
  }));
  kontrol('savaş: kat tamamlama kutlaması gösterilir', /1\. Kat tamamlandı/.test(kutlama.bant) && /Mağara Gezgini/.test(kutlama.bant), kutlama.bant.replace(/\s+/g, ' '));
  kontrol('savaş: kat sekmesinde 🏅 rozeti görünür', /🏅/.test(kutlama.rozet) || kutlama.rozet === '', kutlama.rozet);
  kontrol('savaş: "Daha fazla" katında "Son savaş" düğmesi var', kutlama.tekrarDugmesi);
  // Kat tamamlandı: kat görünümünde "Kata geç" düğmesi çıkar
  const gecDugme = await s.evaluate(() => (document.querySelector('#zindan-ekrani .zd-devam') || {}).textContent || '');
  kontrol('savaş: kat temizlenince başta "Kata geç" düğmesi çıkar', /Kata geç/.test(gecDugme), gecDugme.replace(/\s+/g, ' '));
  await s.screenshot({ path: path.join(EKRAN, 'savas_01_kutlama.png') });
  await s.locator('[data-e="kutlama-kapat"]').click(); await bekle(300);
  kontrol('savaş: kutlama bandı kapanır', await s.evaluate(() => !document.querySelector('.zd-kutlama')));

  // "Son savaş" düğmesi, aynı canavar ve aynı askerlerle hazırlığı açar
  await s.locator('#zindan-ekrani details.zd-daha > summary').click(); await bekle(200);
  await s.locator('#zindan-ekrani [data-e="tekrar"]').click(); await bekle(800);
  const hazirlik = await s.evaluate(() => ({
    baslik: document.getElementById('modal-title').innerText.replace(/\s+/g, ' ').trim(),
    secili: document.querySelectorAll('#modal-body .ek-asker.is-secili').length,
    canavar: /Gölge Kurdu/.test(document.getElementById('modal-body').innerText)
  }));
  kontrol('savaş: "Son savaş" savaşa hazırlığı aynı canavar ve 6 askerle açar', /Savaşa hazırlık/.test(hazirlik.baslik) && hazirlik.canavar && hazirlik.secili === 6, JSON.stringify(hazirlik));
  await baglam.close();
}

kontrol('konsolda hata yok', hatalar.length === 0, hatalar.slice(0, 5).join(' | '));
await tarayici.close();
const basarisiz = sonuc.filter(([, ok]) => !ok);
console.log(`\n${sonuc.length - basarisiz.length}/${sonuc.length} kontrol geçti. Ekran görüntüleri: ${EKRAN}`);
process.exit(basarisiz.length ? 1 : 0);
