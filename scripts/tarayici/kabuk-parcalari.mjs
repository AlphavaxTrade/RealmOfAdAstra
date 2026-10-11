/* global window, document */
// Kabuğun yeni parçalarını gerçek tarayıcıda dener: bildirim zili, Krallık Yolu kutusu ve paneli, "Sen yokken olanlar",
// kapı şeridi (izin sorusu), sürüm geçmişi ve öğreticinin "görüldü" kancası. ELLE çalıştırılır; önce: npm run dev (5180).
// Çıkış kodu 0 = hepsi geçti.
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');

const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let basarisiz = 0;
const kontrol = (ad, kosul, ek = '') => {
  if (!kosul) basarisiz++;
  console.log(`${kosul ? '✅' : '❌'} ${ad}${ek ? '  → ' + ek : ''}`);
};

const tarayici = await chromium.launch({
  executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
for (const [ad, w, h, mobil] of [['tel', 390, 844, true], ['masa', 1280, 800, false]]) {
  const baglam = await tarayici.newContext({ viewport: { width: w, height: h }, hasTouch: mobil, isMobile: mobil });
  const s = await baglam.newPage();
  const hatalar = [];
  s.on('pageerror', (e) => hatalar.push('sayfa hatası: ' + e.message));
  s.on('console', (m) => { if (m.type() === 'error') hatalar.push('konsol: ' + m.text().slice(0, 200)); });
  await s.addInitScript(() => { try { localStorage.setItem('roa_v3_tur_yerel', '{"atlandi":true}'); } catch { /* depo yok */ } });
  await s.goto(BASE, { waitUntil: 'domcontentloaded' });
  await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
  await bekle(2500);

  // 1) Zil: karşılama bildirimi okunmamış; açınca panel gelir, sayı kaybolur, dışa dokunmak kapatır
  kontrol(`${ad}: zilde okunmamış sayısı 1`, await s.evaluate(() => { const b = document.getElementById('v3-zil-sayi'); return !b.hidden && b.textContent === '1'; }));
  await s.click('#v3-zil'); await bekle(300);
  await s.screenshot({ path: path.join(os.tmpdir(), `kabuk-zil-${ad}.png`) });
  kontrol(`${ad}: bildirim paneli açılır, karşılama mesajı görünür`, await s.evaluate(() => { const p = document.getElementById('v3-bildirim'); return !!p && p.innerText.includes('Krallığına hoş geldin'); }));
  kontrol(`${ad}: panel açılınca zil sayısı kaybolur`, await s.evaluate(() => document.getElementById('v3-zil-sayi').hidden));
  await s.click('#v3-zil'); await bekle(200);
  kontrol(`${ad}: zile tekrar dokunmak paneli kapatır`, await s.evaluate(() => !document.getElementById('v3-bildirim')));
  await s.click('#v3-zil'); await bekle(200);
  await s.click('.v3-bildirim-temizle'); await bekle(200);
  kontrol(`${ad}: Temizle listeyi boşaltır`, await s.evaluate(() => document.getElementById('v3-bildirim').innerText.includes('Yeni bildirim yok')));
  await s.mouse.click(w / 2, h / 2 + 100); await bekle(200);
  kontrol(`${ad}: dışarıya dokunmak paneli kapatır`, await s.evaluate(() => !document.getElementById('v3-bildirim')));

  // 2) Krallık Yolu kutusu ve paneli
  kontrol(`${ad}: rehber kutusu görünür`, await s.evaluate(() => !document.getElementById('guide-widget').hidden));
  await s.click('#guide-widget .guide-head'); await bekle(400);
  kontrol(`${ad}: kutuya dokununca Krallık Yolu paneli açılır`, await s.evaluate(() => document.getElementById('modal-title').innerText.includes('Krallık Yolu') && !!document.querySelector('#modal-body .v3-yol')));
  await s.keyboard.press('Escape'); await bekle(300);
  kontrol(`${ad}: Esc paneli kapatır`, await s.evaluate(() => !document.getElementById('rpg-modal').classList.contains('active')));

  // 3) "Görüldü" kancası: ekranlar açılınca öğretici görevi tamamlanır
  const gorulen = await s.evaluate(async () => {
    const gs = window.gameState;
    const once = Object.keys(gs.state.firsts || {}).filter((k) => k.startsWith('gordu_'));
    for (const k of ['merkez', 'kotalar', 'hazine', 'ekonomi', 'profil']) { window.__v3.git(k); await new Promise((r) => setTimeout(r, 250)); }
    window.__v3.git('pazar'); await new Promise((r) => setTimeout(r, 250));
    const sonra = Object.keys(gs.state.firsts || {}).filter((k) => k.startsWith('gordu_'));
    return { once, sonra };
  });
  for (const a of ['merkez', 'kota', 'hazine', 'ekonomi', 'profil']) {
    kontrol(`${ad}: "${a}" ekranı görüldü sayıldı`, gorulen.sonra.includes(`gordu_${a}`), gorulen.sonra.join(','));
  }

  // 4) Sürüm geçmişi: ilk üç açık, eskiler katlı
  await s.evaluate(() => window.__v3.git('surum')); await bekle(400);
  kontrol(`${ad}: sürüm geçmişi 3 açık sürüm + katlı eski sürümler`, await s.evaluate(() => document.querySelectorAll('#modal-body .ek > .ek-kart').length === 3 && !!document.querySelector('#modal-body details[data-k="eski-surumler"]:not([open])')));

  // 5) "Sen yokken olanlar" raporu bir sonraki turda kendiliğinden açılır ve kaydı tüketir
  await s.keyboard.press('Escape'); await bekle(300);
  await s.evaluate(() => {
    const gs = window.gameState;
    gs.state.offlineReport = { seconds: 7200, skippedSeconds: 0, botWorkedSeconds: 3600, expeditionsClaimed: 3, botRenewals: 0, before: { ada: 10, warehouseLevel: 1 }, after: { ada: 25, warehouseLevel: 1 }, village: null, botStoppedReason: '' };
  });
  await bekle(3000);
  kontrol(`${ad}: çevrimdışı rapor kendiliğinden açılır`, await s.evaluate(() => document.getElementById('modal-title').innerText.includes('Sen yokken olanlar')));
  kontrol(`${ad}: rapor kaydı tüketildi`, await s.evaluate(() => window.gameState.state.offlineReport === null));
  await s.click('#modal-body [data-e="tamam"]'); await bekle(300);
  kontrol(`${ad}: "Tamam" paneli kapatır`, await s.evaluate(() => !document.getElementById('rpg-modal').classList.contains('active')));

  // 6) Kapı şeridi: izin sorusu çıkınca şerit görünür, "Hayır" soruyu kapatır
  await s.evaluate(() => {
    const gs = window.gameState;
    gs.state.katilim = { ...(gs.state.katilim || {}), izinSorusu: { sonTarih: Date.now() + 5 * 3600 * 1000 } };
  });
  await bekle(1600);
  kontrol(`${ad}: kapı şeridi izin sorusunu gösterir`, await s.evaluate(() => { const g = document.getElementById('gate-banner'); return !g.hidden && g.innerText.includes('izin hakkını'); }));
  await s.click('#gate-banner [data-kapi="izin-hayir"]'); await bekle(500);
  kontrol(`${ad}: "Hayır" soruyu kapatır, şerit kaybolur`, await s.evaluate(() => document.getElementById('gate-banner').hidden));

  kontrol(`${ad}: konsolda hata yok`, hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
  await baglam.close();
}
await tarayici.close();
console.log(basarisiz === 0 ? '\nHepsi geçti.' : `\n${basarisiz} kontrol başarısız.`);
process.exit(basarisiz === 0 ? 0 : 1);
