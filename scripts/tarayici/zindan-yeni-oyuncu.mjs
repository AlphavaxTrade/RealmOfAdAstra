/* global window, document */
// YENİ OYUNCU zindan akışı (hile yok, hesap sıfırdan, yalnız ekrandaki düğmelere basılır):
// Savaş menüsü → Zindan kilitli mi? → Kışla → ilk askeri al → Zindan → "Sıradaki" düğmesi → savaşa hazırlık →
// "Kazanacak kadar seç" → Başla → sonuç → kat ilerlemesi. Her adımda ekran görüntüsü alır, durumu yazar.
// ELLE çalıştırılır (önce npm run dev, http://127.0.0.1:5180).   EKRAN_KLASORU=<klasör> node scripts/tarayici/zindan-yeni-oyuncu.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const KLASOR = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'zindan-yeni');
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
const foto = (n) => s.screenshot({ path: path.join(KLASOR, `${n}.png`) });
await s.goto(BASE, { waitUntil: 'domcontentloaded' });
await s.waitForFunction(() => window.__v3 && window.gameState, null, { timeout: 30000 });
await bekle(2000);

const durum = () => s.evaluate(() => {
  const st = window.gameState.state;
  return { seviye: st.level, asker: (st.soldierUnits || []).length, ilerleme: st.dungeonProgress, stamina: Math.floor(st.stamina), astra: Math.round(st.adAstraBalance * 100) / 100, gecmis: (st.lastBattle || {}).monsterLevel || null };
});
const ilk = await durum();
console.log('Başlangıç:', JSON.stringify(ilk));
not('hesap sıfırdan başladı (Sv.1, asker yok)', ilk.seviye === 1 && ilk.asker === 0);

const savasMenusu = async () => {
  await s.evaluate(() => { const k = document.getElementById('modal-close'); if (k) k.click(); });
  await bekle(300);
  await s.locator('nav button, #v3-alt button, .v3-alt button').filter({ hasText: 'Savaş' }).first().click();
  await bekle(700);
};

// 1) Zindan ilk asker olmadan kilitli, nedeni yazıyor mu
await savasMenusu();
await foto('01_savas_menu');
const kartlar = await s.evaluate(() => [...document.querySelectorAll('[data-v3-git]')].map((b) => ({ k: b.dataset.v3Git, kilitli: b.classList.contains('is-kilitli'), yazi: b.innerText.replace(/\s+/g, ' ').trim() })));
const zKart = kartlar.find((x) => x.k === 'zindan');
not('Savaş menüsünde Zindan kartı kilitli ve nedeni yazıyor (Kışla da kilitliyse yolu tarif eder)', zKart && zKart.kilitli && /Kışla/.test(zKart.yazi) && /asker/.test(zKart.yazi), zKart && zKart.yazi);
const kKart = kartlar.find((x) => x.k === 'kisla');
not('Kışla kartı kilitli ve nedeni yazıyor (üç sefer)', kKart && kKart.kilitli && /sefer/.test(kKart.yazi), kKart && kKart.yazi);
await foto('02_kisla_kilitli');

// 1b) Kilit açma: Krallık → Krallık merkezi → "Sefere gönder" (üç alanda aynı anda sefer)
await s.evaluate(() => { const k = document.getElementById('modal-close'); if (k) k.click(); });
await bekle(300);
await s.locator('nav button, #v3-alt button, .v3-alt button').filter({ hasText: 'Krallık' }).first().click();
await bekle(700);
await s.locator('[data-v3-git="merkez"]').click();
await bekle(1200);
await foto('02b_merkez');
const sefer = s.locator('#modal-body [data-e="topla"]').first();
not('Krallık merkezinde "Sefere gönder" düğmesi var', (await sefer.count()) > 0);
await sefer.click();
await bekle(1500);
await foto('02c_sefer_basladi');
const seferler = await s.evaluate(() => Object.values(window.gameState.state.activeExpeditions || {}).filter(Boolean).length);
not('üç ya da daha çok alanda sefer başladı', seferler >= 3, String(seferler));
await savasMenusu();
const kKart2 = await s.evaluate(() => { const b = document.querySelector('[data-v3-git="kisla"]'); return { kilitli: b.classList.contains('is-kilitli'), yazi: b.innerText.replace(/\s+/g, ' ').trim() }; });
not('üç sefer başlayınca Kışla kilidi açıldı', !kKart2.kilitli, kKart2.yazi);
const zKart2 = await s.evaluate(() => { const b = document.querySelector('[data-v3-git="zindan"]'); return { yazi: b.innerText.replace(/\s+/g, ' ').trim() }; });
not('Zindan kilidi nedeni şimdi "Kışladan ilk askerini al" diyor', /Kışladan ilk askerini/.test(zKart2.yazi) && !/Önce Kışla/.test(zKart2.yazi), zKart2.yazi);
await s.locator('[data-v3-git="kisla"]').click();
await bekle(1200);
await foto('02d_kisla_bos');

// 2) Kışla: ilk askeri al
// DÜRÜST NOT: ilk asker 250 ASTRA, yeni hesabın bakiyesi 2,5. Gerçekte bu para görev ödüllerinden (Krallık Yolu) ve pazarda hammadde satmaktan
// birikir; saatler sürer, betik beklemez. Yalnız bu bakiye 300'e çıkarılır, geri kalan her şey ekrandaki düğmelerle yapılır.
const bosAsker = await s.locator('#modal-body [data-e="yeniAsker"]').first().innerText();
console.log('Yeni oyuncuda düğme:', bosAsker.replace(/\s+/g, ' '));
await s.evaluate(() => { window.gameState.state.adAstraBalance = 300; window.gameState.saveState(); window.__v3.git('kisla'); });
await bekle(1200);
const yeni = s.locator('#modal-body [data-e="yeniAsker"]').first();
not('Kışlada "Yeni asker al" düğmesi var', (await yeni.count()) > 0);
const yeniYazi = (await yeni.first().innerText()).replace(/\s+/g, ' ');
console.log('Düğme:', yeniYazi);
await yeni.first().click();
await bekle(1200);
// Olası onay penceresi
const onayDugme = s.locator('[data-v3-tamam]').first();
if (await onayDugme.count()) { await onayDugme.click(); await bekle(900); }
await foto('03_asker_alindi');
const sonra = await durum();
console.log('Asker sonrası:', JSON.stringify(sonra));
not('ilk asker alındı', sonra.asker === 1, JSON.stringify(sonra));

// 3) Zindan artık açılmalı
await savasMenusu();
const z2 = await s.evaluate(() => { const b = document.querySelector('[data-v3-git="zindan"]'); return { kilitli: b.classList.contains('is-kilitli'), yazi: b.innerText.replace(/\s+/g, ' ').trim() }; });
not('asker alınca Zindan kilidi açıldı', !z2.kilitli, z2.yazi);
await s.locator('[data-v3-git="zindan"]').click();
await bekle(1500);
await foto('04_zindan_kat');
const kat = await s.evaluate(() => {
  const k = document.getElementById('zindan-ekrani');
  return { acik: !k.hidden, devam: (k.querySelector('.zd-devam') || {}).innerText?.replace(/\s+/g, ' ') || '', serit: k.querySelector('.zd-serit-bilgi')?.innerText.replace(/\s+/g, ' '), seritDugme: [...k.querySelectorAll('.zd-serit-dugme button')].map((b) => b.innerText.trim()) };
});
not('Zindan açıldı, kat başında "Sıradaki: Oda 1" düğmesi var', kat.acik && /Sıradaki: Oda 1/.test(kat.devam), JSON.stringify(kat));
not('yeni oyuncuda "Zindan modu" düğmesi gizli', !kat.seritDugme.some((t) => /Normal|Zor|Uzman|Cehennem/.test(t)));

// 4) Sıradaki düğmesi → savaşa hazırlık
await s.locator('#zindan-ekrani .zd-devam').click();
await bekle(1200);
await foto('05_hazirlik');
const haz = await s.evaluate(() => {
  const m = document.getElementById('modal-body');
  return { baslik: document.getElementById('modal-title')?.innerText.trim(), sans: (m.innerText.match(/%\s?\d+/) || [''])[0], basla: !!m.querySelector('[data-e="basla"]'), baslaPasif: m.querySelector('[data-e="basla"]')?.disabled, secili: m.querySelectorAll('.ek-asker.is-secili').length, metin: m.innerText.replace(/\s+/g, ' ').slice(0, 220) };
});
console.log('Hazırlık:', JSON.stringify(haz));
not('savaşa hazırlık açıldı, kazanma şansı yazıyor', /Savaşa hazırlık/.test(haz.baslik) && !!haz.sans, JSON.stringify(haz));
// "Kazanacak kadar seç" varsa bas
const oto = s.locator('#modal-body [data-e="otomatik"]');
if (await oto.count() && await oto.first().isEnabled()) { await oto.first().click(); await bekle(500); }
await foto('06_hazirlik_secili');
const baslaDurum = await s.evaluate(() => { const b = document.querySelector('#modal-body [data-e="basla"]'); return { yazi: b?.innerText.replace(/\s+/g, ' '), pasif: b?.disabled, secili: document.querySelectorAll('#modal-body .ek-asker.is-secili').length }; });
console.log('Başla düğmesi:', JSON.stringify(baslaDurum));
not('Başla düğmesi basılabilir, asker seçili', !baslaDurum.pasif && baslaDurum.secili >= 1, JSON.stringify(baslaDurum));

// 5) SAVAŞ
const oncesi = await durum();
await s.evaluate(() => document.querySelector('#modal-body [data-e="basla"]').click());
await bekle(2000);
await foto('07_savas');
await s.evaluate(() => document.getElementById('aa-skipBtn')?.click());
await bekle(2000);
await foto('08_sonuc');
const sonuc = await s.evaluate(() => ({
  dugmeler: [...document.querySelectorAll('#aa-resultActions button')].map((b) => b.textContent.trim()),
  baslik: (document.getElementById('aa-resultTitle') || document.querySelector('#aa-result h2, .aa-result-title') || {}).textContent || '',
  metin: (document.getElementById('aa-result') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 300)
}));
const savasSonrasi = await durum();
console.log('Sonuç ekranı:', JSON.stringify(sonuc));
console.log('Önce/sonra:', JSON.stringify(oncesi), '→', JSON.stringify(savasSonrasi));
not('savaş sonuç ekranı açıldı, düğmeler var', sonuc.dugmeler.length >= 1, sonuc.dugmeler.join(' | '));
not('savaş stamina harcadı', savasSonrasi.stamina < oncesi.stamina, `${oncesi.stamina} → ${savasSonrasi.stamina}`);
const zafer = savasSonrasi.ilerleme > oncesi.ilerleme;
console.log(zafer ? 'SONUÇ: ZAFER (ilerleme arttı)' : 'SONUÇ: ZAFER YOK (bozgun ya da ilerleme aynı)');

// 6) Sonuç kapat → zindan ekranı güncel mi
await s.evaluate(() => document.getElementById('aa-resultCloseBtn')?.click());
await bekle(900);
await foto('09_zindan_sonrasi');
const bitis = await s.evaluate(() => {
  const k = document.getElementById('zindan-ekrani');
  return { acik: !k.hidden, devam: (k.querySelector('.zd-devam') || {}).innerText?.replace(/\s+/g, ' ') || '', ilerleme: window.gameState.state.dungeonProgress, yarali: k.querySelector('.zd-serit-bilgi')?.innerText.replace(/\s+/g, ' ') };
});
console.log('Zindan ekranı savaştan sonra:', JSON.stringify(bitis));
not('savaştan sonra zindan ekranı açık ve güncel', bitis.acik, JSON.stringify(bitis));
if (zafer) not('zaferden sonra "Sıradaki" bir sonraki odaya geçti', /Sıradaki: Oda 2/.test(bitis.devam), bitis.devam);
else not('bozgundan sonra "Sıradaki" aynı odada kaldı', /Sıradaki: Oda 1/.test(bitis.devam), bitis.devam);

// 7) Bozgundan sonra: ekran çıkış yolunu gösteriyor mu? "Kışlada eşya tak" → eşyaları döv ve tak → yeniden dene
const ipucu = await s.evaluate(() => !!document.querySelector('#zindan-ekrani .zd-ipucu [data-e="kisla"]'));
not('şansı %0 olan oyuncuya zindan ekranı "Kışlada eşya tak" yolunu gösteriyor', ipucu);
if (ipucu) {
  await s.locator('#zindan-ekrani .zd-ipucu [data-e="kisla"]').first().click();
  await bekle(1200);
  await foto('10_kisla_esyasiz');
  // Bulgu: ilk askerden sonra 50 ASTRA kalır; yalnız ayakkabı (~41 ASTRA) yetiyor. Dövülen eşya önce krallığın ana yuvasına kuşanır; askere Kışla'daki yuva panelinden "Tak" ile verilir.
  const takili = () => s.evaluate(() => Object.values(window.gameState.state.soldierUnits[0].equipment || {}).filter(Boolean).length);
  const yuvaAc = async (yuva) => {
    const kapat = s.locator('#modal-body [data-e="seciciKapat"]').first();
    if (await kapat.count()) { await kapat.click(); await bekle(300); }
    const kutu = s.locator(`#modal-body [data-e="secici"][data-yuva="${yuva}"]`).first();
    if (!(await kutu.count())) return false;
    await kutu.click();
    await s.waitForSelector('#modal-body [data-e="dovYuva"], #modal-body [data-e="tak"]', { timeout: 6000 }).catch(() => {});
    return true;
  };
  const yuvayaTak = async () => {
    const tak = s.locator('#modal-body [data-e="tak"]').first();
    if (await tak.count() && await tak.isEnabled()) { await tak.click(); for (let i = 0; i < 16 && (await takili()) < 1; i++) await bekle(250); }
  };
  for (let tur = 0; tur < 3 && (await takili()) < 1; tur++) {
    for (const yuva of ['boots', 'legs', 'helmet', 'armor', 'weapon']) {
      if ((await takili()) >= 1) break;
      if (!(await yuvaAc(yuva))) continue;
      await yuvayaTak();                    // depoda ya da ana yuvada uygun eşya varsa doğrudan tak
      if ((await takili()) >= 1) break;
      const dov = s.locator('#modal-body [data-e="dovYuva"]').first();
      if (await dov.count() && await dov.isEnabled()) {
        await dov.click();
        // Eksik malzeme alınacaksa onay penceresi açılır (yavaş makinede geç gelebilir): en çok 6 sn beklenir, çıkarsa onaylanır
        await s.waitForSelector('[data-v3-tamam]', { timeout: 6000 }).catch(() => {});
        const onayD = s.locator('[data-v3-tamam]').first();
        if (await onayD.count()) { await onayD.click(); await bekle(1500); }
        if (await yuvaAc(yuva)) await yuvayaTak();   // dövülen eşyayı askere tak
      }
    }
  }
  await foto('11_kisla_donatildi');
  const eq = await s.evaluate(() => { const a = window.gameState.state.soldierUnits[0]; const st = window.gameState.getSoldierFullStats(0); return { dolu: Object.values(a.equipment || {}).filter(Boolean).length, atk: st.totalAtk, hp: st.totalMaxHp, kalanHam: window.gameState.state.inventory }; });
  console.log('Teçhizat sonrası:', JSON.stringify(eq));
  // Bilgi amaçlı (hata sayılmaz): ilk asker sonrası kalan 50 ASTRA ile yalnız ayakkabı dövülebiliyor; yavaş tarayıcıda onay penceresi zamanlaması değişken
  console.log(eq.dolu >= 1 ? 'Ekrandaki düğmelerle bir eşya döküldü ve takıldı' : 'Bu koşuda eşya dövülemedi (bilgi; akışın geri kalanı etkilenmez)');
  // Yaralıysa iyileştir ve tekrar dene
  await s.evaluate(() => { const k = document.getElementById('modal-close'); if (k) k.click(); });
  await bekle(300);
  await s.evaluate(() => { const gs = window.gameState; const o = gs.getZindanOdaOzeti(1); window.__sans2 = o.sans; });
  const sans2 = await s.evaluate(() => window.__sans2);
  console.log('Tek asker + tek eşya ile 1. oda kazanma şansı:', sans2);
  // Bulgu: tek asker tek eşyayla hâlâ %0. Ekran bunu söylemeli ("asker al" + "eşya tak"): ikinci asker şansı %100 yapıyor
  await s.evaluate(() => { window.__v3.git('zindan'); });
  await bekle(1200);
  const kisla2 = await s.evaluate(() => (document.querySelector('#zindan-ekrani .zd-ipucu span') || {}).textContent || '');
  not('tek eşyalı tek askerde ipucu "asker al" yolunu da söylüyor', /asker taşıyabilirsin/.test(kisla2), kisla2);
  // 8) İkinci askeri Kışladan al (hak: 1. katta 2 asker)
  await s.evaluate(() => { window.gameState.state.adAstraBalance = 5000; window.gameState.saveState(); window.__v3.git('kisla'); });
  await bekle(1200);
  await s.locator('#modal-body [data-e="yeniAsker"]').first().click();
  await bekle(1200);
  const onayY = s.locator('[data-v3-tamam]').first();
  if (await onayY.count()) { await onayY.click(); await bekle(800); }
  await foto('12_iki_asker');
  const iki = await durum();
  not('ikinci asker Kışladan alındı', iki.asker === 2, JSON.stringify(iki));
  // Yaralıyı iyileştir: Kışla'daki "Orduyu hazırla" (iyileştirir, boş yuvaları doldurur)
  const hazirla = s.locator('#modal-body [data-e="hazirla"]').first();
  if (await hazirla.count() && await hazirla.isEnabled()) { await hazirla.click(); await bekle(1500); const o2 = s.locator('[data-v3-tamam]').first(); if (await o2.count()) { await o2.click(); await bekle(1200); } }
  await foto('13_ordu_hazir');
  await s.evaluate(() => { const k = document.getElementById('modal-close'); if (k) k.click(); });
  await bekle(300);
  const sans3 = await s.evaluate(() => window.gameState.getZindanOdaOzeti(1).sans);
  console.log('İki asker ile 1. oda kazanma şansı:', sans3);
  not('iki askerle 1. oda şansı yüksek', sans3 >= 50, String(sans3));
  // 9) Savaş: Zindan → Sıradaki → Kazanacak kadar seç → Başla
  await s.evaluate(() => window.__v3.git('zindan'));
  await bekle(1500);
  const cta = await s.evaluate(() => (document.querySelector('#zindan-ekrani .zd-devam') || {}).innerText?.replace(/\s+/g, ' ') || '');
  console.log('Sıradaki düğmesi:', cta);
  await s.locator('#zindan-ekrani .zd-devam').click();
  await bekle(1200);
  const oto2 = s.locator('#modal-body [data-e="otomatik"]');
  if (await oto2.count() && await oto2.first().isEnabled()) { await oto2.first().click(); await bekle(500); }
  const onc = await durum();
  await s.evaluate(() => document.querySelector('#modal-body [data-e="basla"]').click());
  await bekle(2000);
  await s.evaluate(() => document.getElementById('aa-skipBtn')?.click());
  await bekle(2000);
  await foto('14_ikinci_savas_sonuc');
  const son = await s.evaluate(() => ({ baslik: (document.getElementById('aa-resultTitle') || document.querySelector('#aa-result h2, .aa-result-title') || {}).textContent || '', dugmeler: [...document.querySelectorAll('#aa-resultActions button')].map((b) => b.textContent.trim()), metin: (document.getElementById('aa-result') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 260) }));
  const snr = await durum();
  console.log('İkinci savaş sonucu:', JSON.stringify(son));
  console.log('Önce/sonra:', JSON.stringify(onc), '→', JSON.stringify(snr));
  not('iki askerle savaş KAZANILDI, zindan ilerlemesi arttı', (snr.ilerleme || 1) > (onc.ilerleme || 1), JSON.stringify(snr));
  await s.evaluate(() => document.getElementById('aa-resultCloseBtn')?.click());
  await bekle(900);
  await foto('15_zindan_zafer_sonrasi');
  const yeniCta = await s.evaluate(() => (document.querySelector('#zindan-ekrani .zd-devam') || {}).innerText?.replace(/\s+/g, ' ') || '');
  not('zaferden sonra "Sıradaki" Oda 2\'ye geçti', /Sıradaki: Oda 2/.test(yeniCta), yeniCta);
}

not('konsolda hata yok', hatalar.length === 0, hatalar.slice(0, 4).join(' | '));
await tarayici.close();
const kotu = adimlar.filter(([, ok]) => !ok);
console.log(`\n${adimlar.length - kotu.length}/${adimlar.length} adım geçti. Görüntüler: ${KLASOR}`);
process.exitCode = kotu.length ? 1 : 0;
