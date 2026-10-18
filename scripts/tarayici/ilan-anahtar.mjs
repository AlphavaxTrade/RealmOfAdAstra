/* global window, document */   // aşağıdaki page.evaluate(...) işlevleri tarayıcı içinde çalışır
// İlan Pazarı anahtar denemesi (19 Ekim 2026): takas havuzunda Anahtar yok; toplu ilan (adet + birim fiyat), onay, geri çekme, telefon genişliği.
// Kendi kendine yeter: ayrı bir deneme dünyası + sunucu (18090); kullanıcının dünyasına dokunmaz. Önce `npm run build`.
//   node scripts/tarayici/ilan-anahtar.mjs   Ortam: CHROME_YOLU, EKRAN_KLASORU
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const PORT = 18090, BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(PROJE, 'data', 'ilan-anahtar-tarayici.db');
const EKRAN = process.env.EKRAN_KLASORU || os.tmpdir();
const SIFRE = 'Deneme-2026';
const ADMIN = crypto.randomBytes(24).toString('hex');
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let hataSayisi = 0;
const kontrol = (ad, kosul, ayrinti = '') => { if (!kosul) hataSayisi++; console.log(`${kosul ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + String(ayrinti).slice(0, 200) : ''}`); };

if (!fs.existsSync(path.join(PROJE, 'dist', 'index.html'))) { console.log('❌ dist/ yok: önce `npm run build`'); process.exit(1); }
for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* yok */ } }
const kur = spawnSync(process.execPath, [path.join(PROJE, 'scripts/senaryo/kur.mjs'), '--db=data/ilan-anahtar-tarayici.db'], { cwd: PROJE, encoding: 'utf8' });
if (kur.status !== 0) { console.log('❌ senaryo dünyası kurulamadı:\n' + kur.stdout + kur.stderr); process.exit(1); }

const bos = Object.fromEntries(['GAME_WALLET_PRIVATE_KEY', 'KASA_MASTER_KEY', 'PAYMENTS_CONTRACT', 'RATES_CONTRACT', 'RESERVE_WALLET', 'ADMIN_EMAIL', 'SMTP_URL', 'PARTNER_INCOME_FROM', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'].map((k) => [k, '']));
let sunucu = null;
let sunucuCiktisi = '';
async function sunucuKapat() { if (sunucu) { const s = sunucu; sunucu = null; s.kill(); await bekle(1500); } }
async function sunucuBaslat() {
  sunucu = spawn(process.execPath, [path.join(PROJE, 'server', 'index.js')], { cwd: PROJE, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...bos, PORT: String(PORT), HOST: '127.0.0.1', DB_FILE: './data/ilan-anahtar-tarayici.db', TEST_MODE: '1', CHAIN_ENABLED: '0', ADMIN_TOKEN: ADMIN, PUBLIC_URL: BASE,
      RATE_LIMIT_PER_SEC: '1000', IP_RATE_LIMIT_PER_SEC: '1000', PUBLIC_RATE_LIMIT_PER_SEC: '1000' } });
  sunucu.stdout.on('data', (d) => { sunucuCiktisi += d; }); sunucu.stderr.on('data', (d) => { sunucuCiktisi += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) return; } catch { /* henüz yok */ } await bekle(500); }
  console.log('❌ sunucu açılmadı:\n' + sunucuCiktisi.slice(-800)); process.exit(1);
}
const temizle = () => { try { if (sunucu) sunucu.kill(); } catch { /* */ } for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* kilitli olabilir */ } } };
process.on('exit', temizle);
await sunucuBaslat();

const paletle = async (s, komut) => { await s.keyboard.press('Escape'); await bekle(300); await s.keyboard.down('Control'); await s.keyboard.press('k'); await s.keyboard.up('Control'); await bekle(500); await s.click(`.v3-palet-oge[data-palet-id="${komut}"]`); await bekle(1200); };
const tasma = (s) => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.getElementById('modal-body').scrollWidth > document.getElementById('modal-body').clientWidth + 1);
const api = async (method, p, body, token) => { const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const giris = await api('POST', '/api/account/login', { email: 'senaryo-yeni@ornek.com', password: SIFRE });
if (!giris.body.token) { console.log('❌ giriş yapılamadı: ' + JSON.stringify(giris.body)); process.exit(1); }
const g = giris.body;

// Oyuncunun kaydı ve Karnaval kasası doğrudan veritabanına yazılır. Sunucu oyuncuyu bellekte tuttuğu için yazmadan önce kapatılır, sonra yeniden açılır.
const { openDb } = await import(pathToFileURL(path.join(PROJE, 'server/db.js')).href);
const { createEngine } = await import(pathToFileURL(path.join(PROJE, 'server/engine.js')).href);
async function kayitYaz(fn, kasa) {
  await sunucuKapat();
  const veritabani = openDb(DB);
  const motor = await createEngine(veritabani, { testMode: true });
  motor.mutatePlayer(g.playerId, fn);
  if (kasa != null) { motor.treasury.state.pools.carnival = kasa; motor.treasury.save(); }
  try { veritabani.close(); } catch { /* */ }
  await sunucuBaslat();
}
await kayitYaz((gs) => { gs.state.level = 10; gs.state.adAstraBalance = 100; gs.state.arenaKeys = 5; }, 1e6);

const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const hatalar = [];
async function oyunSayfasi({ mobil = false } = {}) {
  const baglam = await tarayici.newContext({ viewport: mobil ? { width: 390, height: 844 } : { width: 1280, height: 860 }, hasTouch: mobil });
  await baglam.addInitScript(([k]) => { try { localStorage.setItem(k, '{"atlandi":true}'); } catch { /* */ } }, [`roa_v3_tur_${g.playerId}`]);
  await baglam.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, ['adastra_session_v1', JSON.stringify({ token: g.token, playerId: g.playerId })]);
  const sayfa = await baglam.newPage();
  sayfa.on('pageerror', (e) => hatalar.push('pageerror: ' + e.message));
  sayfa.on('console', (m) => { if (m.type() === 'error') hatalar.push('console.error: ' + m.text().slice(0, 200)); });
  await sayfa.goto(BASE, { waitUntil: 'load' });
  await sayfa.waitForFunction(() => window.gameState && window.gameState.state, null, { timeout: 45000 });
  await bekle(1800);
  return { sayfa, baglam };
}

try {
  const o = await oyunSayfasi();
  const s = o.sayfa;
  await paletle(s, 'pazar');
  await s.click('[data-e="bolum"][data-sekme="ilan"]');
  await s.waitForSelector('#anahtar-adet', { timeout: 15000 });
  await bekle(500);
  await s.screenshot({ path: path.join(EKRAN, 'ilan_1.png') }).catch(() => {});
  const takas = await s.evaluate(() => window.ammMarket ? Object.keys(window.ammMarket.pools) : []);
  kontrol('takas havuzunda Anahtar ve Pandora kutusu yok', !takas.includes('keys') && !takas.includes('boxes'), takas.join(','));
  const form = await s.evaluate(() => document.body.innerText);
  kontrol('Anahtar sat formu ve eldeki adet görünüyor', form.toLocaleLowerCase('tr').includes('anahtar sat (elinde 5)'), form.toLocaleLowerCase('tr').slice(form.toLocaleLowerCase('tr').indexOf('anahtar sat'), form.toLocaleLowerCase('tr').indexOf('anahtar sat') + 40));
  await s.fill('#anahtar-adet', '3');
  await s.fill('#anahtar-fiyat', '7');
  await s.click('[data-e="ilanAnahtarSat"]');
  await s.waitForSelector('[data-v3-tamam]', { timeout: 10000 });
  const onay = await s.evaluate(() => document.querySelector('.v3-onay').innerText);
  kontrol('onay penceresi adet, birim ve toplam fiyatı yazıyor', onay.includes('3 anahtar') && onay.includes('7') && onay.includes('21'), onay.split(String.fromCharCode(10)).join(' | '));
  await s.click('[data-v3-tamam]');
  await s.waitForFunction(() => (window.gameState.state.arenaKeys || 0) === 2, null, { timeout: 15000 });
  await bekle(1200);
  const metin = await s.evaluate(() => document.body.innerText);
  kontrol('ilan "Senin ilanların" altında 3 adet, tanesi 7 ASTRA olarak görünüyor', metin.includes('Anahtar · 3 adet') && metin.includes('Tanesi 7 ASTRA'), metin.slice(metin.indexOf('Senin ilanların'), metin.indexOf('Senin ilanların') + 160));
  await s.screenshot({ path: path.join(EKRAN, 'ilan_2.png') }).catch(() => {});
  await s.reload({ waitUntil: 'load' });
  await s.waitForFunction(() => window.gameState && window.gameState.state, null, { timeout: 45000 });
  await bekle(1500);
  const yenilenmis = await s.evaluate(() => window.gameState.state.arenaKeys || 0);
  kontrol('sayfa yenilenince anahtar sayısı korunuyor (ilanda 3, elde 2)', yenilenmis === 2, String(yenilenmis));
  await paletle(s, 'pazar');
  await s.click('[data-e="bolum"][data-sekme="ilan"]');
  await s.waitForSelector('[data-e="ilanCek"]', { timeout: 15000 });
  await bekle(1800);
  await s.click('[data-e="ilanCek"]');
  await bekle(2500);
  await s.waitForFunction(() => (window.gameState.state.arenaKeys || 0) === 5, null, { timeout: 15000 });
  kontrol('ilan geri çekilince 3 anahtar geri geldi', true);
  await o.baglam.close();
  const m = await oyunSayfasi({ mobil: true });
  await paletle(m.sayfa, 'pazar');
  await m.sayfa.click('[data-e="bolum"][data-sekme="ilan"]');
  await m.sayfa.waitForSelector('#anahtar-adet', { timeout: 15000 }); await bekle(500);
  await m.sayfa.screenshot({ path: path.join(EKRAN, 'ilan_3_telefon.png') }).catch(() => {});
  kontrol('telefon genişliğinde İlanlar yatay taşmıyor', !(await tasma(m.sayfa)));
  await m.baglam.close();
  kontrol('konsolda sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} catch (e) {
  hataSayisi++;
  console.log('❌ beklenmeyen hata: ' + (e && e.stack || e));
} finally {
  await tarayici.close().catch(() => {});
  temizle();
}
console.log(hataSayisi ? '❌ ' + hataSayisi + ' kontrol başarısız' : '✅ Anahtar ilanı tarayıcı denemesi geçti');
process.exit(hataSayisi ? 1 : 0);
