/* global window, document */   // aşağıdaki page.evaluate(...) işlevleri tarayıcı içinde çalışır
// Pazar fiyat grafiği tarayıcı denemesi (19 Ekim 2026): Al/Sat ekranında grafik kartı, aralık düğmeleri, telefon genişliği, konsol hataları.
// Kendi kendine yeter: ayrı bir deneme dünyası + sunucu (18092); kullanıcının dünyasına dokunmaz. Önce `npm run build`.
//   node scripts/tarayici/pazar-grafik.mjs   Ortam: CHROME_YOLU, EKRAN_KLASORU
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
const PORT = 18092, BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(PROJE, 'data', 'pazar-grafik-tarayici.db');
const EKRAN = process.env.EKRAN_KLASORU || os.tmpdir();
const SIFRE = 'Deneme-2026';
const ADMIN = crypto.randomBytes(24).toString('hex');
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let hataSayisi = 0;
const kontrol = (ad, kosul, ayrinti = '') => { if (!kosul) hataSayisi++; console.log(`${kosul ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + String(ayrinti).slice(0, 200) : ''}`); };

if (!fs.existsSync(path.join(PROJE, 'dist', 'index.html'))) { console.log('❌ dist/ yok: önce `npm run build`'); process.exit(1); }
for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* yok */ } }
const kur = spawnSync(process.execPath, [path.join(PROJE, 'scripts/senaryo/kur.mjs'), '--db=data/pazar-grafik-tarayici.db'], { cwd: PROJE, encoding: 'utf8' });
if (kur.status !== 0) { console.log('❌ senaryo dünyası kurulamadı:\n' + kur.stdout + kur.stderr); process.exit(1); }

const bos = Object.fromEntries(['GAME_WALLET_PRIVATE_KEY', 'KASA_MASTER_KEY', 'PAYMENTS_CONTRACT', 'RATES_CONTRACT', 'RESERVE_WALLET', 'ADMIN_EMAIL', 'SMTP_URL', 'PARTNER_INCOME_FROM', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'].map((k) => [k, '']));
let sunucu = null;
let sunucuCiktisi = '';
async function sunucuKapat() { if (sunucu) { const s = sunucu; sunucu = null; s.kill(); await bekle(1500); } }
async function sunucuBaslat() {
  sunucu = spawn(process.execPath, [path.join(PROJE, 'server', 'index.js')], { cwd: PROJE, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...bos, PORT: String(PORT), HOST: '127.0.0.1', DB_FILE: './data/pazar-grafik-tarayici.db', TEST_MODE: '1', CHAIN_ENABLED: '0', ADMIN_TOKEN: ADMIN, PUBLIC_URL: BASE,
      RATE_LIMIT_PER_SEC: '1000', IP_RATE_LIMIT_PER_SEC: '1000', PUBLIC_RATE_LIMIT_PER_SEC: '1000' } });
  sunucu.stdout.on('data', (d) => { sunucuCiktisi += d; }); sunucu.stderr.on('data', (d) => { sunucuCiktisi += d; });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) return; } catch { /* henüz yok */ } await bekle(500); }
  console.log('❌ sunucu açılmadı:\n' + sunucuCiktisi.slice(-800)); process.exit(1);
}
const temizle = () => { try { if (sunucu) sunucu.kill(); } catch { /* */ } for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* kilitli olabilir */ } } };
process.on('exit', temizle);
await sunucuBaslat();

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
await kayitYaz((gs) => { gs.state.level = 10; gs.state.adAstraBalance = 500000; }, null);

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
  // Pazarda birkaç alım-satım: fiyat geçmişi birkaç nokta bıraksın (sunucu tarafında kayıt dakikada bir yazılır ama bellekte hemen görünür)
  for (const [ad, adet] of [['marketBuy', 250], ['marketSell', 120], ['marketBuy', 60]]) {
    const r = await api('POST', '/api/action', { name: ad, args: ['wheat', adet] }, g.token);
    kontrol(`${ad} ${adet} buğday`, r.status === 200 && r.body.result && r.body.result.success, JSON.stringify(r.body.result || r.body).slice(0, 120));
  }
  const gecmis = await api('GET', '/api/pazar/gecmis?kaynak=wheat&aralik=24s', null, g.token);
  kontrol('GET /api/pazar/gecmis nokta döndürüyor', gecmis.status === 200 && gecmis.body.points && gecmis.body.points.length >= 2, JSON.stringify(gecmis.body).slice(0, 160));
  const yetkisiz = await api('GET', '/api/pazar/gecmis?kaynak=wood', null, null);
  kontrol('girişsiz istek reddediliyor', yetkisiz.status === 401, yetkisiz.status);

  const o = await oyunSayfasi();
  const s = o.sayfa;
  await s.keyboard.press('Escape'); await bekle(300); await s.keyboard.press('5'); await bekle(1500);   // 5 = pazar
  await s.waitForSelector('.ek-fgrafik', { timeout: 15000 });
  kontrol('Al/Sat ekranında fiyat grafiği çiziliyor', !!(await s.$('.ek-fgrafik path')));
  const yazi = await s.evaluate(() => document.querySelector('.ek-fgrafik').closest('.ek-kart').textContent.replace(/\s+/g, ' '));
  kontrol('açılış / en yüksek / en düşük / şimdi görünüyor', /açılış/i.test(yazi) && /en yüksek/i.test(yazi) && /en düşük/i.test(yazi) && /şimdi/i.test(yazi), yazi);
  await s.screenshot({ path: path.join(EKRAN, 'grafik_1_masaustu.png') }).catch(() => {});
  // Fare ile gezdirme: ipucu görünür, fiyat ve zaman yazar; çıkınca kaybolur
  const kap = await s.$('.ek-fgrafik-kap');
  await kap.scrollIntoViewIfNeeded();
  const kutu = await kap.boundingBox();
  await s.mouse.move(kutu.x + kutu.width * 0.5, kutu.y + kutu.height * 0.5);
  await bekle(250);
  const ipucu = await s.evaluate(() => { const e = document.querySelector('.ek-fgrafik-ipucu'); return { gorunur: !e.hidden, metin: e.textContent, cizgi: !document.querySelector('.ek-fgrafik-cizgi').hidden }; });
  kontrol('fare grafiğin üzerine gelince fiyat ipucu görünüyor', ipucu.gorunur && /ASTRA/.test(ipucu.metin) && ipucu.cizgi, ipucu.metin);
  await s.screenshot({ path: path.join(EKRAN, 'grafik_ipucu_masaustu.png') }).catch(() => {});
  await s.mouse.move(kutu.x + kutu.width * 0.5, Math.max(2, kutu.y - 120));
  await bekle(250);
  kontrol('fare çıkınca ipucu kayboluyor', await s.evaluate(() => document.querySelector('.ek-fgrafik-ipucu').hidden));
  await s.click('[data-e="grafikAralik"][data-aralik="7g"]');
  await bekle(1500);
  kontrol('7 gün seçilince düğme aktif oluyor', !!(await s.$('[data-e="grafikAralik"][data-aralik="7g"].is-aktif')));
  await s.click('[data-e="kaynakSec"][data-kaynak="iron"]');
  await bekle(1500);
  kontrol('başka eşyaya geçince grafik yine çiziliyor', !!(await s.$('.ek-fgrafik, .ek-bos')));
  await o.baglam.close();
  const m = await oyunSayfasi({ mobil: true });
  await m.sayfa.keyboard.press('Escape'); await bekle(300); await m.sayfa.keyboard.press('5'); await bekle(1500);
  await m.sayfa.waitForSelector('.ek-fgrafik', { timeout: 15000 });
  kontrol('telefon genişliğinde grafik yatay taşma yapmıyor', !(await tasma(m.sayfa)));
  // Parmakla gezdirme (gerçek dokunma olayları): ipucu görünür, dikey kaydırma bozulmaz
  const mkEl = await m.sayfa.$('.ek-fgrafik-kap');
  await mkEl.scrollIntoViewIfNeeded();
  const mk = await mkEl.boundingBox();
  const cdp = await m.baglam.newCDPSession(m.sayfa);
  const dokun = (tur, f) => cdp.send('Input.dispatchTouchEvent', { type: tur, touchPoints: tur === 'touchEnd' ? [] : [{ x: mk.x + mk.width * f, y: mk.y + mk.height * 0.5 }] });
  await dokun('touchStart', 0.3); await bekle(120); await dokun('touchMove', 0.6); await bekle(250);
  const dokunmaIpucu = await m.sayfa.evaluate(() => { const e = document.querySelector('.ek-fgrafik-ipucu'); return { gorunur: !e.hidden, metin: e.textContent }; });
  kontrol('parmak grafiğin üzerinde gezinince fiyat ipucu görünüyor', dokunmaIpucu.gorunur && /ASTRA/.test(dokunmaIpucu.metin), dokunmaIpucu.metin);
  await m.sayfa.screenshot({ path: path.join(EKRAN, 'grafik_ipucu_telefon.png') }).catch(() => {});
  await dokun('touchEnd', 0.6); await bekle(1600);
  kontrol('parmak kalkınca ipucu kısa süre sonra kayboluyor', await m.sayfa.evaluate(() => document.querySelector('.ek-fgrafik-ipucu').hidden));
  await m.sayfa.screenshot({ path: path.join(EKRAN, 'grafik_2_telefon.png') }).catch(() => {});
  await m.baglam.close();
  kontrol('konsolda sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} catch (e) {
  hataSayisi++;
  console.log('❌ beklenmeyen hata: ' + (e && e.stack || e));
} finally {
  await tarayici.close().catch(() => {});
  temizle();
}
console.log(hataSayisi ? '❌ ' + hataSayisi + ' kontrol başarısız' : '✅ Pazar fiyat grafiği tarayıcı denemesi geçti');
process.exit(hataSayisi ? 1 : 0);
