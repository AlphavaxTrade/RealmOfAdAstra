/* global window, document, innerWidth, getComputedStyle */
// Arayüz taraması: Ben/Krallık/Savaş/Pazar listelerindeki her ekranı ve alt sekmelerini gerçek tarayıcıda açar, ölçer ve rapor yazar.
// ELLE çalıştırılır (npm test'e girmez). Önce geliştirme sunucusu açık olmalı: npm run dev (http://127.0.0.1:5180, tek kişilik yerel mod).
// Kullanım: node scripts/tarayici/ekranlar.mjs      Ortam: OYUN_ADRESI, CHROME_YOLU, EKRAN_KLASORU, RAPOR (json yolu)
// Her ekran için: yatay taşma, 44 px altı dokunma hedefi, bozuk metin (NaN, undefined, [object, "ADA" yazımı), boş gövde,
// altı hammaddeden eksik olanlar (Krallık merkezi, silo, seferler, kotalar), konsol hatası. Ekran görüntüleri kaydedilir.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:5180';
const EKRAN = process.env.EKRAN_KLASORU || path.join(os.tmpdir(), 'ekranlar');
const RAPOR = process.env.RAPOR || path.join(EKRAN, 'rapor.json');
fs.mkdirSync(EKRAN, { recursive: true });
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const OGELER = {
  kralik: ['merkez', 'silo', 'taverna', 'demirhane', 'sifahane', 'koy', 'konsey', 'uzay'],
  savas: ['kisla', 'kolezyum', 'savasalani'],
  pazar: ['pazar', 'karnaval', 'koleksiyon', 'ekonomi'],
  ben: ['profil', 'hesap', 'kotalar', 'hazine', 'ayarlar', 'duyurular', 'surum']
};
const HAMMADDE = ['Buğday', 'Taş', 'Odun', 'Kömür', 'Demir', 'Şifalı Ot'];
const KAYNAK_EKRANLARI = new Set(['kralik/merkez', 'kralik/silo', 'ben/kotalar']);

const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const bulgular = [];
const basliklar = [];
const ekleme = (b) => bulgular.push(b);

async function olc(s, mobil) {
  return s.evaluate(([HAM, MOBIL]) => {
    const govde = document.getElementById('modal-body');
    const metin = (govde ? govde.innerText : '').replace(/\s+/g, ' ');
    const tumMetin = (govde ? govde.textContent : '').replace(/\s+/g, ' ');
    const gorunur = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const tasan = [];
    const kucuk = [];
    if (govde) {
      for (const e of govde.querySelectorAll('*')) {
        if (!gorunur(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.right > innerWidth + 2 || r.left < -2) {
          // kendi içinde yana kayan kapsayıcıdaysa (tablo vb.) sayfayı taşırmaz
          let kayar = false;
          for (let p = e.parentElement; p && p !== govde; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') { kayar = true; break; } }
          if (kayar) continue;
        }
        if (r.right > innerWidth + 2 || r.left < -2) tasan.push((e.className && String(e.className).slice(0, 40)) || e.tagName);
      }
      if (MOBIL) for (const e of govde.querySelectorAll('button, a[href], select, input:not([type=hidden]), summary, [role=button]')) {
        if (!gorunur(e) || e.disabled) continue;
        const hedef = (e.type === 'checkbox' || e.type === 'radio') ? (e.closest('label') || e) : e;
        const r = hedef.getBoundingClientRect();
        if (r.height < 43.5 || r.width < 43.5) kucuk.push(`${e.tagName.toLowerCase()}:${(e.innerText || e.getAttribute('aria-label') || e.className || '').toString().replace(/\s+/g, ' ').slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    const bozuk = [];
    for (const m of metin.matchAll(/NaN|undefined|\[object|\bnull\b|\bADA\b|Infinity/g)) bozuk.push(m[0]);
    return {
      baslik: (document.getElementById('modal-title') || {}).innerText?.replace(/\s+/g, ' ').trim() || '',
      acik: !!document.getElementById('rpg-modal')?.classList.contains('active'),
      uzunluk: metin.length,
      yukseklik: govde ? govde.scrollHeight : 0,
      tasan: [...new Set(tasan)].slice(0, 6),
      kucuk: kucuk.slice(0, 12), kucukSayi: kucuk.length,
      bozuk: [...new Set(bozuk)],
      eksikHammadde: HAM.filter((h) => !tumMetin.includes(h)),
      sekmeSayisi: document.querySelectorAll('#modal-body .phase2-tab-btn, #modal-body [data-carnival-tab], #modal-body .ek-sekme, #modal-body .v3-chip[data-tab], #modal-body .v3-chip[data-v3-res]').length
    };
  }, [HAMMADDE, mobil]);
}

for (const [hesap, seviye] of [['sv1', 1], ['sv30', 30]]) {
  for (const [ad, w, h, mobil] of [['tel', 390, 844, true], ['masa', 1280, 800, false]]) {
    const baglam = await tarayici.newContext({ viewport: { width: w, height: h }, hasTouch: mobil, isMobile: mobil });
    await baglam.addInitScript(() => { try { localStorage.setItem('roa_v3_tur_yerel', '{"atlandi":true}'); } catch { /* */ } });
    const s = await baglam.newPage();
    const hatalar = [];
    s.on('pageerror', (e) => hatalar.push(`pageerror: ${e.message}`));
    s.on('console', (m) => { if (m.type() === 'error') hatalar.push(`console: ${m.text().slice(0, 160)}`); });
    await s.goto(BASE + '/', { waitUntil: 'load' });
    await s.waitForFunction(() => window.gameState && window.__v3, null, { timeout: 60000 });
    await bekle(3000);
    if (seviye > 1) {
      await s.evaluate((lv) => { const g = window.gameState; g.setDevLevel(lv); g.setDevAdAstra(5e6); for (let i = 0; i < 4; i++) g.buySoldierUnit(); }, seviye);
      await bekle(500);
    }
    // Krallık merkezi: 6 kaynağın üretim hakkı satırı (eski kenar çubuğunun yerini aldı)
    await s.locator('[data-v3-sekme="kralik"]').first().click(); await bekle(500);
    await s.locator('[data-v3-git="merkez"]').first().click(); await bekle(700);
    const hak = await s.evaluate(() => { const kart = [...document.querySelectorAll('#modal-body details.ek-katli')].find((k) => k.innerText.includes('Üretim hakkın')); return { var: !!kart, satir: kart ? kart.querySelectorAll('.ek-cubuk-satiri').length : 0, yanPanel: !!document.getElementById('realm-sidebar') }; });
    if (!hak.var || hak.satir !== 6 || hak.yanPanel) ekleme({ hesap, ekran: ad, id: 'kralik/merkez', sorun: `üretim hakkı kartı: ${JSON.stringify(hak)}` });
    await s.screenshot({ path: path.join(EKRAN, `${hesap}_${ad}_merkez_hak.png`) });

    // kaynak tepsisi: altı kaynağın altısı da listelenir ve her biri kendi bölgesini açar
    await s.keyboard.press('Escape'); await bekle(250);
    await s.locator('#v3-kaynak-dugme').click(); await bekle(400);
    const tepsi = await s.evaluate(() => [...document.querySelectorAll('#v3-kaynak-tepsi [data-v3-kaynak]')].map((e) => e.dataset.v3Kaynak));
    if (tepsi.filter((k) => k !== 'fragments').length !== 6) ekleme({ hesap, ekran: ad, id: 'tepsi', sorun: 'kaynak tepsisinde 6 kaynak yok: ' + tepsi.join(',') });
    for (const k of tepsi.filter((x) => x !== 'fragments')) {
      await s.keyboard.press('Escape'); await bekle(250);
      await s.locator('#v3-kaynak-dugme').click(); await bekle(300);
      await s.locator('#v3-kaynak-tepsi [data-v3-kaynak="' + k + '"]').click(); await bekle(800);
      const o = await olc(s, mobil);
      await s.screenshot({ path: path.join(EKRAN, hesap + '_' + ad + '_bolge_' + k + '.png') });
      const sorun = [];
      if (!o.acik) sorun.push('bölge paneli açılmadı');
      else {
        if (o.tasan.length) sorun.push('yatay taşma: ' + o.tasan.join(', '));
        if (o.kucukSayi) sorun.push(o.kucukSayi + ' dokunma hedefi < 44 px: ' + o.kucuk.slice(0, 3).join(' | '));
        if (o.bozuk.length) sorun.push('bozuk metin: ' + o.bozuk.join(', '));
      }
      for (const x of sorun) ekleme({ hesap, ekran: ad, id: 'bolge/' + k, sorun: x });
    }
    await s.keyboard.press('Escape'); await bekle(250);

    for (const [sekme, liste] of Object.entries(OGELER)) {
      for (const git of liste) {
        const id = `${sekme}/${git}`;
        await s.keyboard.press('Escape'); await bekle(250);
        await s.evaluate(() => { document.querySelectorAll('.v3-palet').forEach((e) => e.remove()); });
        try {
          await s.locator(`[data-v3-sekme="${sekme}"]`).first().click({ timeout: 4000 }); await bekle(350);
          await s.locator(`[data-v3-git="${git}"]`).first().click({ timeout: 4000 }); await bekle(900);
        } catch (e) { ekleme({ hesap, ekran: ad, id, sorun: `açılamadı: ${String(e.message).split('\n')[0]}` }); continue; }
        const o = await olc(s, mobil);
        if (hesap === 'sv30' && ad === 'tel') basliklar.push(`${id} → ${o.baslik}`);
        await s.screenshot({ path: path.join(EKRAN, `${hesap}_${ad}_${sekme}_${git}.png`) });
        const sorunlar = [];
        if (!o.acik) sorunlar.push('panel açılmadı (kilitli olabilir)');
        else {
          if (o.uzunluk < 30) sorunlar.push(`gövde boş gibi (${o.uzunluk} karakter)`);
          if (o.tasan.length) sorunlar.push(`yatay taşma: ${o.tasan.join(', ')}`);
          if (o.kucukSayi) sorunlar.push(`${o.kucukSayi} dokunma hedefi < 44 px: ${o.kucuk.slice(0, 4).join(' | ')}`);
          if (o.bozuk.length) sorunlar.push(`bozuk metin: ${o.bozuk.join(', ')}`);
          if (KAYNAK_EKRANLARI.has(id) && o.eksikHammadde.length) sorunlar.push(`eksik hammadde: ${o.eksikHammadde.join(', ')}`);
        }
        for (const x of sorunlar) ekleme({ hesap, ekran: ad, id, sorun: x });

        // alt sekmeler
        const n = Math.min(o.sekmeSayisi, 8);
        for (let i = 0; i < n && o.acik; i++) {
          const dugme = s.locator('#modal-body .phase2-tab-btn, #modal-body [data-carnival-tab], #modal-body .ek-sekme, #modal-body .v3-chip[data-tab], #modal-body .v3-chip[data-v3-res]').nth(i);
          const etiket = ((await dugme.innerText().catch(() => '')) || `#${i}`).replace(/\s+/g, ' ').slice(0, 24);
          try { await dugme.click({ timeout: 3000 }); await bekle(500); } catch { continue; }
          const t = await olc(s, mobil);
          const tid = `${id}#${etiket}`;
          if (t.tasan.length) ekleme({ hesap, ekran: ad, id: tid, sorun: `yatay taşma: ${t.tasan.join(', ')}` });
          if (t.kucukSayi) ekleme({ hesap, ekran: ad, id: tid, sorun: `${t.kucukSayi} dokunma hedefi < 44 px: ${t.kucuk.slice(0, 3).join(' | ')}` });
          if (t.bozuk.length) ekleme({ hesap, ekran: ad, id: tid, sorun: `bozuk metin: ${t.bozuk.join(', ')}` });
          if (t.uzunluk < 30) ekleme({ hesap, ekran: ad, id: tid, sorun: `gövde boş gibi (${t.uzunluk})` });
        }
      }
    }
    for (const x of [...new Set(hatalar)]) ekleme({ hesap, ekran: ad, id: 'konsol', sorun: x });
    await baglam.close();
  }
}
await tarayici.close();

// aynı sorunu iki ekranda/iki hesapta tekrar yazma
const grup = new Map();
for (const b of bulgular) {
  const k = `${b.id} :: ${b.sorun.replace(/\d+x\d+/g, '')}`;
  const g = grup.get(k) || { id: b.id, sorun: b.sorun, nerede: [] };
  g.nerede.push(`${b.hesap}/${b.ekran}`);
  grup.set(k, g);
}
const liste = [...grup.values()];
fs.writeFileSync(RAPOR, JSON.stringify(liste, null, 2));
console.log(`Ekran görüntüleri: ${EKRAN}\nRapor: ${RAPOR}\n${liste.length} farklı bulgu\n`);
for (const g of liste) console.log(`- ${g.id}: ${g.sorun}  [${[...new Set(g.nerede)].join(', ')}]`);
console.log('\nAçılan başlıklar (hub kartı → panel):\n' + basliklar.join('\n'));
process.exitCode = liste.length ? 1 : 0;
