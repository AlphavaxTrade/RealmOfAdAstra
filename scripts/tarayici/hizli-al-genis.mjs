/* global window, document */   // aşağıdaki page.evaluate(...) işlevleri tarayıcı içinde çalışır
// Hızlı al (yeni türler) tarayıcı denemesi (19 Ekim 2026): Silo ekranında teçhizat parçası satırı, Köy evi ve alet tamiri için "Eksikleri al" düğmeleri.
// Kendi kendine yeter: ayrı bir deneme dünyası + sunucu (18091); kullanıcının dünyasına dokunmaz. Önce `npm run build`.
//   node scripts/tarayici/hizli-al-genis.mjs   Ortam: CHROME_YOLU, EKRAN_KLASORU
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
const PORT = 18089, BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(PROJE, 'data', 'hizli-al-genis-tarayici.db');
const EKRAN = process.env.EKRAN_KLASORU || os.tmpdir();
const SIFRE = 'Deneme-2026';
const ADMIN = crypto.randomBytes(24).toString('hex');
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let hataSayisi = 0;
const kontrol = (ad, kosul, ayrinti = '') => { if (!kosul) hataSayisi++; console.log(`${kosul ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + String(ayrinti).slice(0, 200) : ''}`); };

if (!fs.existsSync(path.join(PROJE, 'dist', 'index.html'))) { console.log('❌ dist/ yok: önce `npm run build`'); process.exit(1); }
for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* yok */ } }
const kur = spawnSync(process.execPath, [path.join(PROJE, 'scripts/senaryo/kur.mjs'), '--db=data/hizli-al-genis-tarayici.db'], { cwd: PROJE, encoding: 'utf8' });
if (kur.status !== 0) { console.log('❌ senaryo dünyası kurulamadı:\n' + kur.stdout + kur.stderr); process.exit(1); }

const bos = Object.fromEntries(['GAME_WALLET_PRIVATE_KEY', 'KASA_MASTER_KEY', 'PAYMENTS_CONTRACT', 'RATES_CONTRACT', 'RESERVE_WALLET', 'ADMIN_EMAIL', 'SMTP_URL', 'PARTNER_INCOME_FROM', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'].map((k) => [k, '']));
let sunucu = null;
let sunucuCiktisi = '';
async function sunucuKapat() { if (sunucu) { const s = sunucu; sunucu = null; s.kill(); await bekle(1500); } }
async function sunucuBaslat() {
  sunucu = spawn(process.execPath, [path.join(PROJE, 'server', 'index.js')], { cwd: PROJE, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...bos, PORT: String(PORT), HOST: '127.0.0.1', DB_FILE: './data/hizli-al-genis-tarayici.db', TEST_MODE: '1', CHAIN_ENABLED: '0', ADMIN_TOKEN: ADMIN, PUBLIC_URL: BASE,
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
await kayitYaz((gs) => {
  gs.state.level = 10; gs.state.adAstraBalance = 50000; gs.state.warehouseLevel = 6;
  for (const k of ['iron', 'wood', 'coal', 'stone']) gs.state.inventory[k] = 0;   // ev için hiçbir malzeme yok
  gs.state.inventory.fragments = 7;
  gs.state.tools.axe.durability = 0;                                                  // balta kırık
}, 1e6);

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
  // 1) Silo: teçhizat parçası satırı
  await paletle(s, 'silo');
  const silo = await s.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  kontrol('Silo ekranında Teçhizat parçası satırı ve doluluğu görünüyor', /Teçhizat parçası 7 \/ \d/.test(silo), silo.slice(silo.indexOf('Ambarlar'), silo.indexOf('Ambarlar') + 160));
  await s.screenshot({ path: path.join(EKRAN, 'hizli_1_silo.png') }).catch(() => {});
  // 2) Köy evi: eksikleri al ve ev yap
  await paletle(s, 'koy');
  const ev0 = await s.evaluate(() => window.gameState.getVillageInfo().houses);
  const evDugme = await s.$('[data-e="evHizli"]');
  kontrol('malzeme yokken "Eksikleri al ve ev yap" düğmesi var', !!evDugme);
  const evYazi = evDugme ? await evDugme.textContent() : '';
  kontrol('düğme bedeli ASTRA olarak yazıyor', /ASTRA/.test(evYazi), evYazi);
  await s.screenshot({ path: path.join(EKRAN, 'hizli_2_koy.png') }).catch(() => {});
  await evDugme.click();
  await s.waitForSelector('[data-v3-tamam]', { timeout: 10000 });
  const evOnay = await s.evaluate(() => document.querySelector('.v3-onay').innerText);
  kontrol('onay penceresi alınacak malzemeleri listeliyor', /Odun/i.test(evOnay) && /Taş/i.test(evOnay), evOnay.split(/\s*\n\s*/).join(' | '));
  await s.click('[data-v3-tamam]');
  await s.waitForFunction((n) => window.gameState.getVillageInfo().houses > n, ev0, { timeout: 20000 });
  kontrol('ev yapıldı (ev sayısı arttı)', true);
  // 3) Alet tamiri
  await s.keyboard.press('Escape'); await bekle(300); await s.keyboard.press('1'); await bekle(1200);   // 1 = odun bölgesi (balta)
  const aletDugme = await s.$('[data-e="onarHizli"]');
  kontrol('kırık baltada "Eksikleri al ve onar" düğmesi var', !!aletDugme);
  if (aletDugme) {
    await s.screenshot({ path: path.join(EKRAN, 'hizli_3_alet.png') }).catch(() => {});
    await aletDugme.click();
    await s.waitForSelector('[data-v3-tamam]', { timeout: 10000 });
    await s.click('[data-v3-tamam]');
    await s.waitForFunction(() => window.gameState.state.tools.axe.durability > 0, null, { timeout: 20000 });
    kontrol('balta onarıldı', true);
  }
  await o.baglam.close();
  const m = await oyunSayfasi({ mobil: true });
  await paletle(m.sayfa, 'silo');
  kontrol('telefon genişliğinde Silo yatay taşmıyor', !(await tasma(m.sayfa)));
  await m.baglam.close();
  kontrol('konsolda sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} catch (e) {
  hataSayisi++;
  console.log('❌ beklenmeyen hata: ' + (e && e.stack || e));
} finally {
  await tarayici.close().catch(() => {});
  temizle();
}
console.log(hataSayisi ? '❌ ' + hataSayisi + ' kontrol başarısız' : '✅ Hızlı al (yeni türler) tarayıcı denemesi geçti');
process.exit(hataSayisi ? 1 : 0);
