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
  await baglam.addInitScript(() => { try { localStorage.setItem('roa_v3_tur_yerel', '{"atlandi":true}'); } catch { /* */ } });   // tur ayrı denenir
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
  kontrol(`${ad}: Krallık merkezi açılır`, /Krallık merkezi/i.test(await baslik()), await baslik());
  await tikla('[data-v3-sekme="kralik"]');
  kontrol(`${ad}: aktif sekmeye tekrar dokunmak ana listeye döner`, await s.evaluate(() => !!document.querySelector('#modal-body .v3-hub')));
  await tikla('[data-v3-sekme="kralik"]');
  kontrol(`${ad}: ana listedeyken tekrar dokunmak paneli kapatır`, !(await panelAcik()));

  await tikla('[data-v3-sekme="kralik"]'); await tikla('[data-v3-git="seferler"]'); await foto('04_seferler');
  kontrol(`${ad}: seferler paneli açılır`, await s.evaluate(() => document.getElementById('realm-sidebar').classList.contains('open')));
  await tikla('.v3-yan-kapat');
  kontrol(`${ad}: seferler paneli kapanır`, await s.evaluate(() => !document.getElementById('realm-sidebar').classList.contains('open')));

  // Aşama 2: eski ekranların v3 görünümü (düzey 30 hesapla; ekranlar kilitli olmasın)
  await s.evaluate(() => { window.gameState.setDevLevel(30); window.gameState.addDevAdAstra(2000000); });
  const govdeYuk = () => s.evaluate(() => document.getElementById('modal-body').scrollHeight);
  const ust = async (sekme, git) => { await s.keyboard.press('Escape'); await bekle(300); await tikla(`[data-v3-sekme="${sekme}"]`); await tikla(`[data-v3-git="${git}"]`); await bekle(600); };
  await ust('pazar', 'pazar'); await foto('06_pazar_alsat');
  kontrol(`${ad}: Pazar sade başlıkla açılır`, (await baslik()) === '🏪 Pazar', await baslik());
  kontrol(`${ad}: Pazar'da 3 bölüm var (5 sekme değil)`, await s.evaluate(() => document.querySelectorAll('.v3-bolumler .market-tab-btn').length === 3));
  kontrol(`${ad}: Pazar'da tek seferde tek kaynak kartı`, await s.evaluate(() => document.querySelectorAll('.amm-card').length === 1));
  kontrol(`${ad}: Pazar kısa (≤ 1100 px; eskiden ~4000)`, (await govdeYuk()) <= 1100, String(await govdeYuk()));
  await tikla('[data-v3-res="stone"]');
  kontrol(`${ad}: kaynak seçici Taş kartını getirir`, await s.evaluate(() => document.querySelector('.amm-card')?.dataset.res === 'stone'));
  await tikla('.v3-terim');
  kontrol(`${ad}: terim balonu açılır`, await s.evaluate(() => !document.getElementById('v3-balon').hidden && /Takas havuzu/.test(document.getElementById('v3-balon').innerText)));
  await s.keyboard.press('Escape'); await bekle(200);
  kontrol(`${ad}: Esc balonu kapatır`, await s.evaluate(() => document.getElementById('v3-balon').hidden));
  await tikla('.v3-bolumler [data-tab="ilan"]');
  kontrol(`${ad}: İlanlar bölümü iki liste seçeneği sunar`, await s.evaluate(() => document.querySelectorAll('.v3-chipler .v3-chip').length === 2));
  await ust('kralik', 'merkez'); await foto('07_kralik_merkez');
  kontrol(`${ad}: Krallık merkezinde yan kartlar katlı (≥3 kapalı bölüm)`, await s.evaluate(() => document.querySelectorAll('#modal-body details.v3-katli:not([open])').length >= 3));
  kontrol(`${ad}: Krallık merkezi kısa (≤ 800 px)`, (await govdeYuk()) <= 800, String(await govdeYuk()));
  await s.evaluate(() => document.querySelector('#modal-body details.v3-katli:not([open]) > summary').click()); await bekle(300);
  kontrol(`${ad}: katlı bölüm açılır`, await s.evaluate(() => document.querySelectorAll('#modal-body details.v3-katli[open]').length >= 3));
  await ust('ben', 'surum'); await foto('08_surum');
  kontrol(`${ad}: sürüm geçmişi kısa (≤ 1500 px; eskiden ~17000)`, (await govdeYuk()) <= 1500, String(await govdeYuk()));
  await s.evaluate(() => document.querySelector('.v3-eski-dugme').click()); await bekle(300);
  kontrol(`${ad}: "Eski sürümleri göster" hepsini açar`, (await govdeYuk()) > 5000);
  await ust('ben', 'hazine');
  kontrol(`${ad}: konsey ve hazine sade başlıklı`, (await baslik()) === '🏛️ Konsey ve hazine', await baslik());
  await s.keyboard.press('Escape'); await bekle(300);

  // Demirhane (v3): sade başlık, 2 sade sekme, ana işlemler görünür; pazara koy / geri dönüştür / çıkar "Diğer" altında
  await s.evaluate(() => {   // cephanelige 3 deneme esyasi (biri hasarli): dovme maliyetli/sureli oldugu icin dogrudan eklenir
    const g = window.gameState;
    const e = (id, slot, name, icon, atk, hp, dur) => ({ id, slot, name, icon, level: 1, baseAtk: atk, baseHp: hp, atkBonus: atk, hpBonus: hp, durability: dur, maxDurability: 13, craftedAt: Date.now() });
    g.state.armoryInventory = [e('t_w', 'weapon', 'Deneme Kılıcı', '🗡️', 12, 0, 13), e('t_h', 'helmet', 'Deneme Miğferi', '🪖', 0, 20, 5), e('t_a', 'armor', 'Deneme Zırhı', '🛡️', 0, 40, 13)];
    g.saveState();
  });
  await ust('kralik', 'demirhane'); await foto('09_demirhane_dov');
  kontrol(`${ad}: Demirhane sade başlıkla açılır`, (await baslik()) === '⚒️ Demirhane', await baslik());
  kontrol(`${ad}: Demirhane sekmeleri sade (numara ve bağırma yok)`, await s.evaluate(() => { const t = [...document.querySelectorAll('.btn-bs-tab')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()); return t.length === 2 && !/^\S*\s*\d\./.test(t[0]) && !/[A-ZÇĞİÖŞÜ]{4,}/.test(t.join(' ')); }));
  await tikla('.btn-bs-tab[data-bstab="armory"]'); await foto('10_demirhane_esyalarim');
  kontrol(`${ad}: Eşyalarım'da toplu işlemler katlı`, await s.evaluate(() => { const d = document.querySelector('#modal-body details.v3-daha.v3-genis'); return !!d && !d.open; }));
  kontrol(`${ad}: ana işlem düğmeleri görünür (onar-hepsi, giydir)`, await s.evaluate(() => { const gor = (sel) => { const e = document.querySelector(sel); return !!e && e.offsetParent !== null; }; return gor('.btn-armory-repair-all') && gor('.btn-smart-auto-equip'); }));
  kontrol(`${ad}: eşya kartında "Diğer" bölümü katlı ve ikincil işlemleri içerir`, await s.evaluate(() => { const d = document.querySelector('#modal-body details.v3-daha:not(.v3-genis)'); return !!d && !d.open && !!d.querySelector('.btn-recycle-equipment, .btn-sell-equipment, .btn-unequip-soldier-slot'); }));
  kontrol(`${ad}: Demirhane düğmeleri ≥ 44 px`, await s.evaluate(() => [...document.querySelectorAll('#modal-body .btn-armory-direct-upgrade, #modal-body .btn-smart-auto-equip, #modal-body .btn-bs-tab')].filter((b) => b.offsetParent !== null).every((b) => b.getBoundingClientRect().height >= 43.5)));
  await s.evaluate(() => document.querySelector('#modal-body details.v3-daha:not(.v3-genis) > summary').click()); await bekle(300);
  kontrol(`${ad}: "Diğer" açılınca ikincil düğmeler görünür`, await s.evaluate(() => { const b = document.querySelector('#modal-body details.v3-daha:not(.v3-genis)[open] button'); return !!b && b.offsetParent !== null; }));
  kontrol(`${ad}: Demirhane yatay taşma yok`, await s.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await s.keyboard.press('Escape'); await bekle(300);

  // Kolezyum (v3): sade başlık, 3 kısa bölüm, taktik seçimi katlı, ana düğme görünür; rakipler ve lig bölümleri taşmaz
  await s.evaluate(() => { const g = window.gameState; g.setDevAdAstra(5e6); if (!(g.state.soldierUnits || []).length) { g.buySoldierUnit(); g.buySoldierUnit(); } });
  await ust('savas', 'kolezyum'); await foto('11_kolezyum_duello');
  kontrol(`${ad}: Kolezyum sade başlıkla açılır`, (await baslik()) === '🏟️ Kolezyum', await baslik());
  kontrol(`${ad}: Kolezyum bölümleri 3 kısa sekme`, await s.evaluate(() => { const t = [...document.querySelectorAll('.colosseum-tab-btn')].map((b) => b.innerText.trim()); return t.length === 3 && t.every((x) => x.length <= 14); }));
  kontrol(`${ad}: taktik seçimi katlı`, await s.evaluate(() => { const d = document.querySelector('#modal-body details.v3-daha.v3-genis'); return !!d && !d.open; }));
  kontrol(`${ad}: "Kolezyuma çık" düğmesi görünür ve ≥ 44 px`, await s.evaluate(() => { const b = document.getElementById('btn-start-1v1-duel'); return !!b && b.offsetParent !== null && b.getBoundingClientRect().height >= 43.5; }));
  kontrol(`${ad}: Kolezyum kısa (≤ 900 px)`, (await govdeYuk()) <= 900, String(await govdeYuk()));
  kontrol(`${ad}: şampiyon satırında düğme ekrandan taşmıyor`, await s.evaluate(() => { const b = document.getElementById('btn-toggle-colosseum-champ-row'); const r = b && b.getBoundingClientRect(); return !!r && r.right <= innerWidth + 1; }));
  await tikla('.colosseum-tab-btn[data-tab="leaderboard"]'); await foto('12_kolezyum_lig');
  kontrol(`${ad}: lig sekmesi yatay taşmaz`, await s.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2 && document.getElementById('modal-body').scrollWidth <= document.getElementById('modal-body').clientWidth + 2));
  await tikla('.colosseum-tab-btn[data-tab="pvp"]'); await foto('13_kolezyum_rakipler');
  kontrol(`${ad}: rakipler sekmesi açılır ve taşmaz`, await s.evaluate(() => !!document.getElementById('pvp-panel') && document.documentElement.scrollWidth <= innerWidth + 2));
  await s.keyboard.press('Escape'); await bekle(300);

  // Hazine, Kotalar, Karnaval (v3): para birimi ASTRA, uzun kart yığınları katlı, kısa sekmeler
  await ust('ben', 'hazine'); await foto('14_hazine');
  kontrol(`${ad}: Hazine'de eski "ADA" yazısı kalmadı`, await s.evaluate(() => !/(^|\s)ADA(\s|$)/.test(document.getElementById('modal-body').innerText)));
  kontrol(`${ad}: kasa açıklamaları katlı ("Bu kasa ne işe yarar?")`, await s.evaluate(() => document.querySelectorAll('#modal-body details.v3-ayrinti:not([open])').length >= 3));
  kontrol(`${ad}: Hazine yatay taşma yok`, await s.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await ust('ben', 'kotalar'); await foto('15_kotalar');
  kontrol(`${ad}: Kotalar katlı kartlarla kısa (≤ 1300 px; eskiden ~2300)`, (await govdeYuk()) <= 1300 && await s.evaluate(() => document.querySelectorAll('#modal-body details.v3-katli').length >= 3), String(await govdeYuk()));
  await ust('pazar', 'karnaval'); await foto('16_karnaval');
  kontrol(`${ad}: Karnaval 3 kısa sekme`, await s.evaluate(() => { const t = [...document.querySelectorAll('.carnival-tab-btn')].map((b) => b.innerText.trim()); return t.length === 3 && t.every((x) => x.length <= 14); }));
  kontrol(`${ad}: Karnaval düğmeleri ≥ 44 px`, await s.evaluate(() => [...document.querySelectorAll('#modal-body .carnival-tab-btn, #modal-body .btn-spin-wheel')].filter((b) => b.offsetParent !== null).every((b) => b.getBoundingClientRect().height >= 43.5)));
  kontrol(`${ad}: Karnaval yatay taşma yok`, await s.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await s.keyboard.press('Escape'); await bekle(300);

  // Aşama 4: Test laboratuvarı
  await ust('ben', 'test'); await foto('09_lab_senaryolar');
  kontrol(`${ad}: Test laboratuvarı açılır`, /Test laboratuvarı/.test(await baslik()), await baslik());
  const lab = sel => s.evaluate(q => document.querySelectorAll(`#modal-body ${q}`).length, sel);
  const toplamSenaryo = await s.evaluate(async (yol) => (await import(yol)).SENARYOLAR.length, '/js/dev/senaryolar.js');
  kontrol(`${ad}: laboratuvarda tüm senaryolar kart olarak var (${toplamSenaryo})`, (await lab('.v3-lab-kart')) === toplamSenaryo && toplamSenaryo >= 35, String(await lab('.v3-lab-kart')));
  await tikla('[data-lab^="calistir:zaman-sefer-hazir"]');
  kontrol(`${ad}: tek senaryo çalışır ve ✓ gösterir`, await s.evaluate(() => /Geçti/.test(document.querySelector('[data-lab-senaryo="zaman-sefer-hazir"] .v3-lab-sonuc')?.innerText || '')));
  await tikla('[data-lab="hepsini"]'); await bekle(1500);
  const ozetMetni = await s.evaluate(() => document.querySelector('.v3-lab-ozet span')?.innerText || '');
  kontrol(`${ad}: "listeyi çalıştır" hepsi geçti`, new RegExp(`${toplamSenaryo}/${toplamSenaryo} geçti`).test(ozetMetni), ozetMetni);
  await foto('10_lab_sonuclar');
  await tikla('[data-lab="sekme:arac"]'); await foto('11_lab_araclar');
  await tikla('[data-lab="astra:1000"]');
  await tikla('[data-lab="sekme:gunluk"]');
  kontrol(`${ad}: yapılan işlem günlükte görünür`, await s.evaluate(() => /ASTRA/.test(document.querySelector('.v3-lab-gunluk')?.innerText || '')));
  await tikla('[data-lab="sekme:durum"]'); await tikla('[data-lab="karsilastir"]'); 
  await tikla('[data-lab="sekme:arac"]'); await tikla('[data-lab="astra:1000000"]'); await tikla('[data-lab="sekme:durum"]');
  kontrol(`${ad}: durum sekmesi karşılaştırmadan beri değişen ASTRA'yı gösterir`, await s.evaluate(() => /ASTRA/.test(document.querySelector('.v3-lab-fark')?.innerText || '')));
  await tikla('[data-lab="sekme:arac"]');
  await s.evaluate(() => { document.getElementById('lab-kayit-ad').value = 'deneme kaydı'; });
  await tikla('[data-lab="kayit-al"]');
  kontrol(`${ad}: kayıt noktası alınır ve listelenir`, await s.evaluate(() => /deneme kaydı/.test(document.querySelector('#modal-body')?.innerText || '')));
  await tikla('[data-lab^="kayit-sil:"]');
  kontrol(`${ad}: kayıt noktası silinir`, await s.evaluate(() => !/deneme kaydı/.test(document.querySelector('#modal-body')?.innerText || '')));
  await s.keyboard.press('Escape'); await bekle(300);
  await s.keyboard.press('t'); await bekle(700);
  kontrol(`${ad}: T kısayolu laboratuvarı açar (eski test menüsünü değil)`, /Test laboratuvarı/.test(await baslik()) && await s.evaluate(() => document.getElementById('dev-modal').classList.contains('hidden')));
  await s.keyboard.press('t'); await bekle(500);
  kontrol(`${ad}: T tekrar basınca kapanır`, !(await panelAcik()));

  // Aşama 5: ayarlar, zindan geçişi, varsayılan arayüz
  await ust('ben', 'ayarlar'); await foto('12_ayarlar');
  kontrol(`${ad}: ayarlar paneli açılır`, /Ayarlar/.test(await baslik()), await baslik());
  await tikla('[data-v3-ayar="yazi:cokbuyuk"]');
  kontrol(`${ad}: yazı boyutu "çok büyük" olunca kök yazı 20 px olur`, await s.evaluate(() => getComputedStyle(document.documentElement).fontSize === '20px'), await s.evaluate(() => getComputedStyle(document.documentElement).fontSize));
  await tikla('[data-v3-ayar="hareket:ac"]');
  kontrol(`${ad}: hareketi azalt açılır`, await s.evaluate(() => document.documentElement.classList.contains('v3-azalt')));
  await s.reload({ waitUntil: 'load' }); await s.waitForFunction(() => window.__v3, null, { timeout: 60000 }); await bekle(1500);
  kontrol(`${ad}: ayarlar sayfa yenilenince kalır`, await s.evaluate(() => document.documentElement.classList.contains('v3-azalt') && getComputedStyle(document.documentElement).fontSize === '20px'));
  await s.evaluate(() => { window.gameState.setDevLevel(30); });
  await ust('ben', 'ayarlar'); await tikla('[data-v3-ayar="yazi:normal"]'); await tikla('[data-v3-ayar="hareket:kapat"]');
  kontrol(`${ad}: ayarlar geri alınır`, await s.evaluate(() => !document.documentElement.classList.contains('v3-azalt') && getComputedStyle(document.documentElement).fontSize === '16px'));
  await s.keyboard.press('Escape'); await bekle(300);
  await ust('savas', 'zindan'); await bekle(1200); await foto('13_zindan');
  const zin = await s.evaluate(() => ({ iceride: document.body.classList.contains('in-dungeon'), hud: getComputedStyle(document.getElementById('v3-hud')).display, eskiSerit: getComputedStyle(document.getElementById('top-nav-strip')).display, katlar: document.querySelectorAll('#dungeon-floor-bar .floor-tab').length }));
  kontrol(`${ad}: zindana girilir; v3 çubuğu gizlenir, zindanın kendi kat çubuğu görünür`, zin.iceride && zin.hud === 'none' && zin.eskiSerit !== 'none' && zin.katlar >= 6, JSON.stringify(zin));
  await s.evaluate(() => document.getElementById('btn-dungeon-return-town').click()); await bekle(1200);
  const don = await s.evaluate(() => ({ iceride: document.body.classList.contains('in-dungeon'), hud: getComputedStyle(document.getElementById('v3-hud')).display, tab: getComputedStyle(document.getElementById('v3-tabbar')).display }));
  kontrol(`${ad}: kasabaya dönünce v3 çubukları geri gelir`, !don.iceride && don.hud !== 'none' && don.tab !== 'none', JSON.stringify(don));
  const varsayilan = await baglam.newPage();
  await varsayilan.goto(BASE + '/', { waitUntil: 'load' }); await varsayilan.waitForFunction(() => window.gameState && window.__v3, null, { timeout: 60000 }); await bekle(1500);
  kontrol(`${ad}: adres parametresi olmadan da yeni arayüz açılır (varsayılan)`, await varsayilan.evaluate(() => document.documentElement.classList.contains('v3') && !!document.getElementById('v3-tabbar')));
  await varsayilan.goto(BASE + '/?arayuz=eski', { waitUntil: 'load' }); await varsayilan.waitForFunction(() => window.gameState, null, { timeout: 60000 }); await bekle(1500);
  kontrol(`${ad}: ?arayuz=eski eski arayüzü açar`, await varsayilan.evaluate(() => !document.documentElement.classList.contains('v3') && !document.getElementById('v3-tabbar')));
  await varsayilan.goto(BASE + '/', { waitUntil: 'load' }); await varsayilan.waitForFunction(() => window.gameState, null, { timeout: 60000 }); await bekle(1500);
  kontrol(`${ad}: eski tercih tarayıcıda hatırlanır`, await varsayilan.evaluate(() => !document.documentElement.classList.contains('v3')));
  await varsayilan.goto(BASE + '/?arayuz=3', { waitUntil: 'load' }); await varsayilan.waitForFunction(() => window.gameState, null, { timeout: 60000 }); await bekle(1500);
  kontrol(`${ad}: ?arayuz=3 yeni arayüze döndürür ve tercihi siler`, await varsayilan.evaluate(() => document.documentElement.classList.contains('v3') && localStorage.getItem('roa_arayuz') === null));
  await varsayilan.close();

  // Kışla (compact kip): ikincil işlemler katlı, dokunma hedefleri büyük
  await s.evaluate(() => { const g = window.gameState; g.setDevLevel(30); g.setDevAdAstra(5e6); g.state.soldierUnits = []; for (let i = 0; i < 4; i++) g.buySoldierUnit(); });
  await ust('savas', 'kisla'); await foto('14_kisla');
  const kis = await s.evaluate(() => ({ ana: document.querySelectorAll('.bk-summary-actions .bk-btn:not(.ghost)').length, ekstra: !!document.querySelector('.bk-extra'), asker: document.querySelectorAll('.bk-row').length, aracGizli: document.querySelector('.bk-roster-tools')?.hidden === true }));
  kontrol(`${ad}: Kışla'da ilk bakışta yalnız 2 ana düğme (Orduyu hazırla, Yeni asker)`, kis.ana === 2 && !kis.ekstra, JSON.stringify(kis));
  kontrol(`${ad}: kısa listede ara/süz araçları kapalı, asker listesi görünür`, kis.aracGizli && kis.asker === 4, JSON.stringify(kis));
  await tikla('[data-ne="diger"]');
  kontrol(`${ad}: "Diğer işlemler" üç işlemi açar`, await s.evaluate(() => document.querySelectorAll('.bk-extra .bk-btn').length === 3));
  await tikla('[data-ne="arac"]');
  kontrol(`${ad}: "Ara, süz, sırala" araçları açar`, await s.evaluate(() => document.querySelector('.bk-roster-tools')?.hidden === false && !!document.querySelector('.bk-search')));
  const kucuk = await s.evaluate(() => [...document.querySelectorAll('.bk :is(.bk-btn:not(.sm), .bk-chip, .bk-tab, .bk-row)')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43).length);
  kontrol(`${ad}: Kışla'da ana dokunma hedefleri ≥ 44 px (küçük olan yok)`, kucuk === 0, String(kucuk));
  await tikla('[data-ne="taktik"]');
  kontrol(`${ad}: diziliş seçenekleri açılır`, await s.evaluate(() => document.querySelectorAll('.bk-presets [data-bk="preset"]').length >= 1));
  await s.keyboard.press('Escape'); await bekle(300);

  // onay penceresi: Esc vazgeç, Onayla evet
  await s.evaluate(async (yol) => { const m = await import(yol); window.__onay = (...a) => { window.__sonuc = undefined; m.onay(...a).then(v => { window.__sonuc = v; }); }; }, '/js/ui/v3/bilesenler.js');   // söz döndürmez: evaluate pencere kapanana kadar beklemesin
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

// ---- Yeni oyuncu turu: temiz tarayıcı, yepyeni oyuncu (telefon boyutu)
{
  const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const s = await baglam.newPage();
  s.on('pageerror', e => hatalar.push(`tur pageerror: ${e.message}`));
  s.on('console', m => { if (m.type() === 'error') hatalar.push(`tur console.error: ${m.text().slice(0, 200)}`); });
  const yukle = async () => { await s.goto(BASE + '/?arayuz=3', { waitUntil: 'load' }); await s.waitForFunction(() => window.gameState && window.__v3, null, { timeout: 60000 }); };
  const kart = () => s.evaluate(() => ({ gorunur: !document.getElementById('v3-tur').hidden, baslik: document.getElementById('v3-tur-baslik').textContent, say: document.getElementById('v3-tur-say').textContent }));
  const dokun = async sel => { await s.locator(sel).first().click({ timeout: 5000 }); await bekle(800); };
  const kayit = () => s.evaluate(() => localStorage.getItem('roa_v3_tur_yerel'));
  await yukle(); await bekle(6000);
  let k = await kart();
  kontrol('tur: yepyeni oyuncuda kendiliğinden başlar', k.gorunur && /hoş geldin/i.test(k.baslik), JSON.stringify(k));
  await s.screenshot({ path: path.join(EKRAN, 'tur_1_hos.png') });
  await dokun('#v3-tur-devam'); await dokun('#v3-tur-devam');
  k = await kart();
  kontrol('tur: Devam adımları ilerler (Hammaddelerin)', /Hammadde/i.test(k.baslik), k.baslik);
  await dokun('#v3-tur-devam'); await bekle(600);
  k = await kart();
  kontrol('tur: Krallık adımı gerçek dokunuşu bekler (Devam düğmesi yok)', /^Krallık$/.test(k.baslik) && await s.evaluate(() => document.getElementById('v3-tur-devam').hidden), k.baslik);
  await s.screenshot({ path: path.join(EKRAN, 'tur_2_kralik.png') });
  await dokun('[data-v3-sekme="kralik"]'); await bekle(800);
  k = await kart();
  kontrol('tur: Krallık sekmesine dokununca Krallık merkezi adımına geçer', /Krallık merkezi/i.test(k.baslik), k.baslik);
  await dokun('[data-v3-git="merkez"]'); await bekle(900);
  k = await kart();
  kontrol('tur: merkez açılınca İlk seferin adımına geçer', /İlk seferin/i.test(k.baslik), k.baslik);
  await s.screenshot({ path: path.join(EKRAN, 'tur_3_sefer.png') });
  await dokun('.btn-1click-claim-restart-exp'); await bekle(1200);
  k = await kart();
  kontrol('tur: sefer başlayınca İşçilerin yolda adımına geçer ve panel kapanır', /yolda/i.test(k.baslik) && await s.evaluate(() => !document.getElementById('rpg-modal').classList.contains('active')), k.baslik);
  await dokun('#v3-tur-devam'); await dokun('#v3-tur-devam'); await dokun('#v3-tur-devam');
  k = await kart();
  kontrol('tur: bitince kapanır ve "bitti" diye kaydedilir', !k.gorunur && /"bitti":true/.test(await kayit()), await kayit());
  await yukle(); await bekle(5500);
  kontrol('tur: sayfa yenilenince tekrar başlamaz', !(await kart()).gorunur);
  await dokun('[data-v3-sekme="ben"]'); await dokun('[data-v3-git="tur"]'); await bekle(500);
  k = await kart();
  kontrol('tur: Ben → Oyun turu ile yeniden oynatılır (1. adım)', k.gorunur && /hoş geldin/i.test(k.baslik) && await s.evaluate(() => !document.getElementById('rpg-modal').classList.contains('active')), JSON.stringify(k));
  await dokun('#v3-tur-atla');
  kontrol('tur: Atla turu kapatır ve "atlandı" diye kaydeder', !(await kart()).gorunur && /"atlandi":true/.test(await kayit()), await kayit());
  await baglam.close();
}
await tarayici.close();
kontrol('konsolda hata yok', hatalar.length === 0, hatalar.slice(0, 5).join(' | '));
console.log(`\nEkran görüntüleri: ${EKRAN}`);
process.exit(sonuc.every(x => x[1]) ? 0 : 1);
