/* global window, document, getComputedStyle */   // aşağıdaki page.evaluate(...) işlevleri tarayıcı içinde çalışır
// "Sorun bildir" (geri bildirim / bilet) uçtan uca tarayıcı denemesi (18 Ekim 2026). Kendi kendine yeter: hazır hesaplı AYRI bir deneme dünyası
// kurar (scripts/senaryo/kur.mjs → data/gb-tarayici.db), sunucuyu 18082 portunda başlatır, gerçek Chrome ile:
//   oyuncu (masaüstü + telefon genişliği) → Ctrl+K "Sorun bildir" → mesaj + 2 ekran görüntüsü → gönder → RB-1001 → sayfa yenile → biletin listede durması
//   yönetici paneli → liste → bilet ayrıntısı (2 görüntü gerçekten yüklenmiş) → durum + cevap → oyuncu cevabı kendi ekranında görür
// Kullanıcının dünyasına (8080/8081) dokunmaz. Önce `npm run build` (dist/ sunulur).
//   node scripts/tarayici/geri-bildirim.mjs        Ortam: CHROME_YOLU, EKRAN_KLASORU
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const PORT = 18082, BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(PROJE, 'data', 'gb-tarayici.db');
const EKRAN = process.env.EKRAN_KLASORU || os.tmpdir();
const SIFRE = 'Deneme-2026';
const ADMIN = crypto.randomBytes(24).toString('hex');
const bekle = ms => new Promise(r => setTimeout(r, ms));
let hataSayisi = 0;
const kontrol = (ad, kosul, ayrinti = '') => { if (!kosul) hataSayisi++; console.log(`${kosul ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + String(ayrinti).slice(0, 220) : ''}`); };

// gerçek, çözülebilir küçük bir PNG (düz renk + çizgiler) üretir
function pngUret(en, boy, renk) {
  const crcTablo = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTablo[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const parca = (tip, veri) => { const t = Buffer.from(tip), l = Buffer.alloc(4), k = Buffer.alloc(4); l.writeUInt32BE(veri.length); k.writeUInt32BE(crc(Buffer.concat([t, veri]))); return Buffer.concat([l, t, veri, k]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(en, 0); ihdr.writeUInt32BE(boy, 4); ihdr[8] = 8; ihdr[9] = 2;
  const ham = Buffer.alloc((en * 3 + 1) * boy);
  for (let y = 0; y < boy; y++) { const o = y * (en * 3 + 1); for (let x = 0; x < en; x++) { const cizgi = (x + y) % 17 === 0; ham[o + 1 + x * 3] = cizgi ? 255 : renk[0]; ham[o + 2 + x * 3] = cizgi ? 255 : renk[1]; ham[o + 3 + x * 3] = cizgi ? 255 : renk[2]; } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), parca('IHDR', ihdr), parca('IDAT', zlib.deflateSync(ham)), parca('IEND', Buffer.alloc(0))]);
}
const klasor = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-resim-'));
const resim1 = path.join(klasor, 'hata-1.png'), resim2 = path.join(klasor, 'hata-2.png');
fs.writeFileSync(resim1, pngUret(1100, 700, [40, 90, 160]));
fs.writeFileSync(resim2, pngUret(640, 480, [160, 60, 60]));

if (!fs.existsSync(path.join(PROJE, 'dist', 'index.html'))) { console.log('❌ dist/ yok: önce `npm run build`'); process.exit(1); }
for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* yok */ } }
const kur = spawnSync(process.execPath, [path.join(PROJE, 'scripts/senaryo/kur.mjs'), '--db=data/gb-tarayici.db'], { cwd: PROJE, encoding: 'utf8' });
if (kur.status !== 0) { console.log('❌ senaryo dünyası kurulamadı:\n' + kur.stdout + kur.stderr); process.exit(1); }

const bos = Object.fromEntries(['GAME_WALLET_PRIVATE_KEY', 'KASA_MASTER_KEY', 'PAYMENTS_CONTRACT', 'RATES_CONTRACT', 'RESERVE_WALLET', 'ADMIN_EMAIL', 'SMTP_URL', 'PARTNER_INCOME_FROM'].map(k => [k, '']));
const sunucu = spawn(process.execPath, [path.join(PROJE, 'server', 'index.js')], { cwd: PROJE, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...bos, PORT: String(PORT), HOST: '127.0.0.1', DB_FILE: './data/gb-tarayici.db', TEST_MODE: '1', CHAIN_ENABLED: '0', ADMIN_TOKEN: ADMIN, PUBLIC_URL: BASE,
    RATE_LIMIT_PER_SEC: '1000', IP_RATE_LIMIT_PER_SEC: '1000', PUBLIC_RATE_LIMIT_PER_SEC: '1000' } });
let sunucuCiktisi = '';
sunucu.stdout.on('data', d => { sunucuCiktisi += d; }); sunucu.stderr.on('data', d => { sunucuCiktisi += d; });
const temizle = () => { try { sunucu.kill(); } catch { /* */ } for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* kilitli olabilir */ } } try { fs.rmSync(klasor, { recursive: true, force: true }); } catch { /* */ } };
process.on('exit', temizle);
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch { /* henüz yok */ } await bekle(500); if (i === 59) { console.log('❌ sunucu açılmadı:\n' + sunucuCiktisi.slice(-800)); process.exit(1); } }

const api = async (method, p, body, token) => { const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const giris = await api('POST', '/api/account/login', { email: 'senaryo-yeni@ornek.com', password: SIFRE });
if (!giris.body.token) { console.log('❌ giriş yapılamadı: ' + JSON.stringify(giris.body)); process.exit(1); }
const g = giris.body;

const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const hatalar = [];
async function oyuncuSayfasi({ mobil = false } = {}) {
  const baglam = await tarayici.newContext({ viewport: mobil ? { width: 390, height: 844 } : { width: 1280, height: 860 }, hasTouch: mobil, permissions: ['clipboard-read', 'clipboard-write'] });
  await baglam.addInitScript(([k]) => { try { localStorage.setItem(k, '{"atlandi":true}'); } catch { /* */ } }, [`roa_v3_tur_${g.playerId}`]);
  await baglam.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, ['adastra_session_v1', JSON.stringify({ token: g.token, playerId: g.playerId })]);
  const sayfa = await baglam.newPage();
  sayfa.on('pageerror', e => hatalar.push('pageerror: ' + e.message));
  sayfa.on('console', m => { if (m.type() === 'error') hatalar.push('console.error: ' + m.text().slice(0, 200)); });
  await sayfa.goto(BASE, { waitUntil: 'load' });
  await sayfa.waitForFunction(() => window.gameState && window.gameState.state, null, { timeout: 45000 });
  await bekle(2000);
  return { sayfa, baglam };
}
const paletle = async (s, komut) => { await s.keyboard.press('Escape'); await bekle(300); await s.keyboard.down('Control'); await s.keyboard.press('k'); await s.keyboard.up('Control'); await bekle(500); await s.click(`.v3-palet-oge[data-palet-id="${komut}"]`); await bekle(1200); };
const panel = s => s.evaluate(() => (document.getElementById('modal-body') || document.body).innerText);
const tasma = s => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.getElementById('modal-body').scrollWidth > document.getElementById('modal-body').clientWidth + 1);

try {
  // ── 1) oyuncu, masaüstü: Ctrl+K ile aç, yaz, 2 görüntü ekle, gönder ──
  const o = await oyuncuSayfasi();
  await paletle(o.sayfa, 'sorunbildir');
  let metin = await panel(o.sayfa);
  kontrol('Ctrl+K paletinden "Sorun bildir" ekranı açılıyor', /Sorun bildir/.test(metin) && /Ne oldu/.test(metin), metin.slice(0, 80).replace(/\n/g, ' '));
  await o.sayfa.waitForFunction(() => /Henüz bildirim göndermedin/.test((document.getElementById('modal-body') || document.body).innerText), null, { timeout: 10000 }).catch(() => {});
  metin = await panel(o.sayfa);
  kontrol('boş başlangıçta önceki bilet yok', /Henüz bildirim göndermedin/.test(metin));
  await o.sayfa.click('[data-e="konu"][data-k="oneri"]');
  await o.sayfa.fill('#gb-mesaj', 'Haritaya bir arama kutusu eklenirse çok iyi olur, şimdi köyleri bulmak zor.');
  await bekle(700);   // oyunun çift dokunuş koruması: bir eylemden sonra 450 ms başka tıklama işlenmez
  await o.sayfa.click('[data-e="konu"][data-k="hata"]');   // yeniden çizim yazdığım mesajı silmemeli
  kontrol('konu gerçekten değişti (Hata seçili)', (await o.sayfa.getAttribute('[data-e="konu"][data-k="hata"]', 'aria-pressed')) === 'true');
  const korunan = await o.sayfa.inputValue('#gb-mesaj');
  kontrol('konu değişince yazılan mesaj kaybolmuyor', korunan.startsWith('Haritaya bir arama kutusu'), korunan.slice(0, 40));
  await o.sayfa.setInputFiles('.ek-dosya-girdi', [resim1, resim2]);
  await o.sayfa.waitForSelector('.ek-resim >> nth=1', { timeout: 15000 });
  const kucukler = await o.sayfa.$$eval('.ek-resim img', ims => ims.map(i => ({ w: i.naturalWidth, src: i.src.slice(0, 22), uzunluk: i.src.length })));
  kontrol('2 ekran görüntüsü küçültülüp eklendi (JPEG, sunucu sınırının altında)', kucukler.length === 2 && kucukler.every(k => k.w > 0 && k.src.startsWith('data:image/jpeg') && k.uzunluk <= 300000), JSON.stringify(kucukler));
  await o.sayfa.screenshot({ path: path.join(EKRAN, 'gb_form_masaustu.png') }).catch(() => {});
  // ilk görüntüyü kaldır, tekrar ekle: sayaç doğru çalışıyor mu
  await bekle(700);
  await o.sayfa.click('[data-e="kaldir"][data-i="0"]');
  kontrol('görüntü kaldırılınca sayaç düşüyor', (await o.sayfa.$$('.ek-resim')).length === 1 && /1\/4/.test(await panel(o.sayfa)));
  await o.sayfa.setInputFiles('.ek-dosya-girdi', [resim1]);
  await o.sayfa.waitForSelector('.ek-resim >> nth=1', { timeout: 15000 });
  await bekle(700);   // oyunun çift dokunuş koruması: bir eylemden sonra 450 ms başka tıklama işlenmez
  await o.sayfa.click('[data-e="gonder"]');
  await o.sayfa.waitForSelector('.ek-bilet-buyuk', { timeout: 15000 });
  metin = await panel(o.sayfa);
  kontrol('gönderince bilet numarası RB-1001 görünüyor', /RB-1001/.test(metin), metin.slice(0, 120).replace(/\n/g, ' '));
  await bekle(1200);
  metin = await panel(o.sayfa);
  kontrol('"Önceki biletlerim"de bilet duruyor (yeni, 📷 2)', /RB-1001/.test(metin) && /Yeni/.test(metin) && /📷 2/.test(metin));
  await o.sayfa.screenshot({ path: path.join(EKRAN, 'gb_bilet_masaustu.png') }).catch(() => {});

  // ── 2) sayfa yenilenince bilet hâlâ orada (veritabanında) ──
  await o.sayfa.reload({ waitUntil: 'load' });
  await o.sayfa.waitForFunction(() => window.gameState && window.gameState.state, null, { timeout: 45000 });
  await bekle(1500);
  await paletle(o.sayfa, 'sorunbildir');
  await bekle(800);
  kontrol('sayfa yenilenince bilet hâlâ listede', /RB-1001/.test(await panel(o.sayfa)));

  // ── 3) yönetici paneli: liste, ayrıntı, görüntüler, cevap ──
  const yBaglam = await tarayici.newContext({ viewport: { width: 1280, height: 900 } });
  const y = await yBaglam.newPage();
  y.on('pageerror', e => hatalar.push('admin pageerror: ' + e.message));
  // 409: "Telegram deneme mesajı" ayarsız sunucuda BİLEREK 409 döndürür (aşağıda denenir); tarayıcı bunu konsola yazar
  y.on('console', m => { if (m.type() === 'error' && !/status of 409/.test(m.text())) hatalar.push('admin console.error: ' + m.text().slice(0, 200)); });
  await y.goto(BASE + '/admin', { waitUntil: 'load' });
  await y.fill('#tok', ADMIN); await y.click('#enter');
  await y.waitForSelector('#gbListe tr[data-no]', { timeout: 15000 });
  const baslik = await y.textContent('#gbBaslik');
  kontrol('panelde liste ve "1 yeni" başlığı', /1 yeni/.test(baslik) && (await y.textContent('#gbListe')).includes('RB-1001'), baslik);
  kontrol('panelde "Telegram bildirimi" kartı: ayarsız sunucuda ⚠️ kapalı', /Telegram bildirimi[\s\S]*kapalı/.test(await y.textContent('#cards')));
  await y.click('#tgDene');
  await y.waitForFunction(() => /ayarlı değil/.test(document.getElementById('tgDurum').textContent), null, { timeout: 8000 });
  kontrol('"Telegram deneme mesajı" düğmesi ayarsızken anlaşılır uyarı veriyor', /TELEGRAM_BOT_TOKEN/.test(await y.textContent('#tgDurum')), await y.textContent('#tgDurum'));
  await y.click('#gbListe tr[data-no="1001"]');
  await y.waitForSelector('#gbAyrinti .gb-resimler img', { timeout: 10000 });
  await bekle(500);
  const yuklenen = await y.$$eval('#gbAyrinti .gb-resimler img', ims => ims.map(i => i.naturalWidth));
  kontrol('panelde 2 görüntü gerçekten yüklendi', yuklenen.length === 2 && yuklenen.every(w => w > 0), JSON.stringify(yuklenen));
  const ayr = await y.textContent('#gbAyrinti');
  kontrol('ayrıntıda mesaj, bağlam ve oyuncu özeti var', /arama kutusu/.test(ayr) && /Oyuncu özeti/.test(ayr) && /Sayfa:/.test(ayr), ayr.slice(0, 160).replace(/\n/g, ' '));
  await y.selectOption('#gbYeniDurum', 'cozuldu');
  await y.fill('#gbCevap', 'Güzel fikir, bir sonraki sürümde arama kutusunu ekliyoruz. Teşekkürler!');
  await y.click('#gbAyrinti button.go');
  await bekle(800);
  kontrol('panelde kaydedildi (durum çözüldü)', /Çözüldü/.test(await y.textContent('#gbListe')) && /Kaydedildi/.test(await y.textContent('#gbAyrinti')));
  await y.screenshot({ path: path.join(EKRAN, 'gb_panel.png') }).catch(() => {});

  // ── 4) oyuncu cevabı görüyor ──
  await o.sayfa.keyboard.press('Escape'); await bekle(300);
  await paletle(o.sayfa, 'sorunbildir');
  await bekle(1200);
  metin = await panel(o.sayfa);
  kontrol('oyuncu sahibin cevabını ve "Çözüldü" durumunu görüyor', /arama kutusunu ekliyoruz/.test(metin) && /Çözüldü/.test(metin), metin.slice(-200).replace(/\n/g, ' '));
  kontrol('masaüstünde yatay taşma yok', !(await tasma(o.sayfa)));
  await o.baglam.close();

  // ── 5) telefon genişliği ──
  const m = await oyuncuSayfasi({ mobil: true });
  // HUD: 359 px ve altında düğmeler "⋯ Daha" menüsünde, üstünde doğrudan görünür; hiçbir düğme ekran dışına taşmamalı
  const hudTasma = () => m.sayfa.evaluate(() => { const h = document.getElementById('v3-hud'); return [...h.querySelectorAll('button')].filter(b => b.offsetParent !== null).some(b => b.getBoundingClientRect().right > window.innerWidth + 1) || h.scrollWidth > h.clientWidth + 1; });
  kontrol('telefonda (390 px) üst çubuk 📮 düğmesiyle taşmıyor', !(await hudTasma()));
  await m.sayfa.screenshot({ path: path.join(EKRAN, 'gb_hud_telefon.png'), clip: { x: 0, y: 0, width: 390, height: 120 } }).catch(() => {});
  kontrol('telefonda (390 px) üst çubukta 📮 yok (yer yok); "Ben" sekmesindeki menüden açılır', !(await m.sayfa.isVisible('#v3-sorun')), await m.sayfa.evaluate(() => `iw=${window.innerWidth} display=${getComputedStyle(document.getElementById('v3-sorun')).display}`));
  await m.sayfa.click('[data-v3-sekme="ben"]'); await bekle(600);
  await m.sayfa.click('[data-v3-git="sorunbildir"]');
  await bekle(1200);
  metin = await panel(m.sayfa);
  kontrol('telefonda HUD "Daha" menüsünden açılıyor ve eski bilet görünüyor', /Sorun bildir/.test(metin) && /RB-1001/.test(metin));
  kontrol('telefonda (390 px) yatay taşma yok', !(await tasma(m.sayfa)));
  await m.sayfa.fill('#gb-mesaj', 'Telefonda deneme: butonlar rahat basılıyor mu?');
  await m.sayfa.setInputFiles('.ek-dosya-girdi', [resim2]);
  await m.sayfa.waitForSelector('.ek-resim', { timeout: 15000 });
  await m.sayfa.screenshot({ path: path.join(EKRAN, 'gb_form_telefon.png') }).catch(() => {});
  const boyutlar = await m.sayfa.$$eval('.ek-konu, [data-e="gonder"], .ek-resim-sil', els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  kontrol('telefonda konu ve gönder düğmeleri parmak boyunda (≥ 40 px)', boyutlar.slice(0, 5).every(h => h >= 40), JSON.stringify(boyutlar));
  await m.baglam.close();
  // dar telefon (340 px): düğmeler "⋯ Daha" menüsünün içinde
  const dar = await tarayici.newContext({ viewport: { width: 340, height: 700 }, hasTouch: true });
  await dar.addInitScript(([k]) => { try { localStorage.setItem(k, '{"atlandi":true}'); } catch { /* */ } }, [`roa_v3_tur_${g.playerId}`]);
  await dar.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, ['adastra_session_v1', JSON.stringify({ token: g.token, playerId: g.playerId })]);
  const dp = await dar.newPage();
  dp.on('pageerror', e => hatalar.push('dar pageerror: ' + e.message));
  await dp.goto(BASE, { waitUntil: 'load' });
  await dp.waitForFunction(() => window.gameState && window.gameState.state, null, { timeout: 45000 });
  await bekle(1500);
  await dp.click('#v3-daha'); await bekle(400);
  kontrol('340 px: "Daha" menüsünde Sorun bildir görünüyor', await dp.isVisible('#v3-sorun'));
  await dp.screenshot({ path: path.join(EKRAN, 'gb_daha_menu_340.png') }).catch(() => {});
  await dp.click('#v3-sorun'); await bekle(1200);
  kontrol('340 px: ekran açılıyor, yatay taşma yok', /Ne oldu/.test(await panel(dp)) && !(await tasma(dp)));
  await dar.close();
  await yBaglam.close();
} catch (e) {
  hataSayisi++;
  console.log('❌ betik hatası: ' + e.stack);
} finally {
  await tarayici.close();
}
kontrol('tarayıcı konsolunda hata yok', hatalar.length === 0, hatalar.slice(0, 4).join(' | '));
console.log(`\nEkran görüntüleri: ${EKRAN} (gb_*.png)`);
console.log(hataSayisi ? `❌ ${hataSayisi} kontrol başarısız` : '✅ geri bildirim tarayıcı denemesi geçti');
process.exit(hataSayisi ? 1 : 0);
