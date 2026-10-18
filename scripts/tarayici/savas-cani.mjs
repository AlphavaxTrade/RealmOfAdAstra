/* global window, document */   // aşağıdaki page.evaluate(...) işlevleri tarayıcı içinde çalışır
// Savaş canı tarayıcı denemesi (18 Ekim 2026): teçhizatlı, tam sağlıklı askerler zindan savaşına TOPLAM canla başlıyor mu (eski hata: kayıtlı taban canla başlıyordu,
// çubuk 313 gösterirken 100 ile). Kendi kendine yeter: ayrı bir deneme dünyası + sunucu (18083); kullanıcının dünyasına dokunmaz. Önce `npm run build`.
//   node scripts/tarayici/savas-cani.mjs   Ortam: CHROME_YOLU, EKRAN_KLASORU
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
const PORT = 18083, BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(PROJE, 'data', 'sc-tarayici.db');
const EKRAN = process.env.EKRAN_KLASORU || os.tmpdir();
const SIFRE = 'Deneme-2026';
const ADMIN = crypto.randomBytes(24).toString('hex');
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let hataSayisi = 0;
const kontrol = (ad, kosul, ayrinti = '') => { if (!kosul) hataSayisi++; console.log(`${kosul ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + String(ayrinti).slice(0, 200) : ''}`); };

if (!fs.existsSync(path.join(PROJE, 'dist', 'index.html'))) { console.log('❌ dist/ yok: önce `npm run build`'); process.exit(1); }
for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* yok */ } }
const kur = spawnSync(process.execPath, [path.join(PROJE, 'scripts/senaryo/kur.mjs'), '--db=data/sc-tarayici.db'], { cwd: PROJE, encoding: 'utf8' });
if (kur.status !== 0) { console.log('❌ senaryo dünyası kurulamadı:\n' + kur.stdout + kur.stderr); process.exit(1); }

const bos = Object.fromEntries(['GAME_WALLET_PRIVATE_KEY', 'KASA_MASTER_KEY', 'PAYMENTS_CONTRACT', 'RATES_CONTRACT', 'RESERVE_WALLET', 'ADMIN_EMAIL', 'SMTP_URL', 'PARTNER_INCOME_FROM', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'].map((k) => [k, '']));
const sunucu = spawn(process.execPath, [path.join(PROJE, 'server', 'index.js')], { cwd: PROJE, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...bos, PORT: String(PORT), HOST: '127.0.0.1', DB_FILE: './data/sc-tarayici.db', TEST_MODE: '1', CHAIN_ENABLED: '0', ADMIN_TOKEN: ADMIN, PUBLIC_URL: BASE,
    RATE_LIMIT_PER_SEC: '1000', IP_RATE_LIMIT_PER_SEC: '1000', PUBLIC_RATE_LIMIT_PER_SEC: '1000' } });
let sunucuCiktisi = '';
sunucu.stdout.on('data', (d) => { sunucuCiktisi += d; }); sunucu.stderr.on('data', (d) => { sunucuCiktisi += d; });
const temizle = () => { try { sunucu.kill(); } catch { /* */ } for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* kilitli olabilir */ } } };
process.on('exit', temizle);
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch { /* henüz yok */ } await bekle(500); if (i === 59) { console.log('❌ sunucu açılmadı:\n' + sunucuCiktisi.slice(-800)); process.exit(1); } }

const api = async (method, p, body, token) => { const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const giris = await api('POST', '/api/account/login', { email: 'senaryo-yeni@ornek.com', password: SIFRE });
if (!giris.body.token) { console.log('❌ giriş yapılamadı: ' + JSON.stringify(giris.body)); process.exit(1); }
const g = giris.body;

// Oyuncunun kaydı doğrudan veritabanından değiştirilir (sunucu her istekte kaydı yeniden okur): aynı projenin motoru ikinci bir bağlantıyla kullanılır
const { openDb } = await import(pathToFileURL(path.join(PROJE, 'server/db.js')).href);
const { createEngine } = await import(pathToFileURL(path.join(PROJE, 'server/engine.js')).href);
const { GAME_CONFIG } = await import(pathToFileURL(path.join(PROJE, 'js/config.js')).href);
const db2 = openDb(DB);
const motor = await createEngine(db2, { testMode: true });
const durumYaz = (fn) => motor.mutatePlayer(g.playerId, fn);
const YUVALAR = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
durumYaz((gs) => {
  gs.state.level = 30; gs.state.warehouseLevel = 12; gs.state.adAstraBalance = 1e5; gs.state.dungeonProgress = 1; gs.state.dungeonMode = 0; gs.state.stamina = 1e6;
  gs.state.village = { houses: 20, villagers: 200, labor: 0, lastGrowthAt: 0, starvingSince: 0 };
  const eski = GAME_CONFIG.ORDU_SINIRI; GAME_CONFIG.ORDU_SINIRI = { ASKER_SEVIYESI_HESAP_SEVIYESINI_GECEMEZ: false, ASKER_HAKKI_ZINDAN_KATINA_BAGLI: false };
  try { for (let i = 0; i < 2; i++) gs.buySoldierUnit(); } finally { GAME_CONFIG.ORDU_SINIRI = eski; }
  for (const a of gs.state.soldierUnits) {   // tam sağlıklı (taban can) + 5 parça teçhizat
    a.hp = a.maxHp; a.equipment = {};
    for (const y of YUVALAR) a.equipment[y] = { slot: y, level: 5, baseAtk: 10, baseHp: 40, atkBonus: 20, hpBonus: 60, durability: 13, maxDurability: 13, name: 'Deneme ' + y };
  }
});
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
const paletle = async (s, komut) => { await s.keyboard.press('Escape'); await bekle(300); await s.keyboard.down('Control'); await s.keyboard.press('k'); await s.keyboard.up('Control'); await bekle(500); await s.click(`.v3-palet-oge[data-palet-id="${komut}"]`); await bekle(1200); };
const panel = (s) => s.evaluate(() => (document.getElementById('modal-body') || document.body).innerText);
const tasma = (s) => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.getElementById('modal-body').scrollWidth > document.getElementById('modal-body').clientWidth + 1);


try {
  const o = await oyunSayfasi();
  const s = o.sayfa;
  // gerçek oyuncu yolu: Ctrl+K → Zindan → 1. katın ilk odası → Savaşa hazırlık → Savaşı başlat
  await paletle(s, 'zindan');
  await bekle(800);
  await s.screenshot({ path: path.join(EKRAN, 'sc_1_zindan.png') }).catch(() => {});
  await s.click('[data-e="oda"][data-oda="0"]');
  await bekle(800);
  await s.click('button:has-text("Savaşa hazırlan")');
  await bekle(1000);
  const metin = await panel(s);
  await s.screenshot({ path: path.join(EKRAN, 'sc_2_hazirlik.png') }).catch(() => {});
  kontrol('savaş hazırlık ekranı açıldı', !!(await s.$('[data-e="basla"]')), metin.slice(0, 80).replace(/\n/g, ' '));

  const onceki = await s.evaluate(() => window.gameState.state.soldierUnits.map((a) => ({ hp: a.hp, maxHp: a.maxHp })));
  const toplamlar = await s.evaluate(() => window.gameState.state.soldierUnits.map((_, i) => window.gameState.getSoldierFullStats(i).totalMaxHp));
  kontrol('önkoşul: teçhizat can ekliyor ve askerler tam sağlıklı (kayıtlı can = taban)', toplamlar.every((t, i) => t > onceki[i].maxHp * 1.5 && onceki[i].hp === onceki[i].maxHp), JSON.stringify({ onceki, toplamlar }));

  await s.click('[data-e="basla"]');
  await s.waitForSelector('.unit-hp-text', { timeout: 10000 });   // arena ilk durumu çizer; olaylar 480 ms aralıkla oynar
  const baslangic = await s.evaluate(() => [...document.querySelectorAll('.unit-hp-text')].map((e) => e.textContent.trim()));
  await s.screenshot({ path: path.join(EKRAN, 'sc_3_savas_basi.png') }).catch(() => {});
  console.log('   arena can yazıları (savaş başı):', JSON.stringify(baslangic));
  const askerYazilari = baslangic.filter((t) => { const b = Number(t.split('/')[1]); return b === toplamlar[0] || b === toplamlar[1]; });
  // en fazla bir iki vuruş işlenmiş olabilir (savaş hemen oynamaya başlar): eski hatada asker 100/500'le başlardı
  kontrol('savaş başında askerler TOPLAM canla (çubuğun tamamına yakın) başlıyor; eskiden 100/500', askerYazilari.length >= 2 && askerYazilari.every((t) => { const [a, b] = t.split('/').map(Number); return a > 100 && a >= 0.85 * b; }), JSON.stringify(askerYazilari));

  // savaş bitsin: "Anında Bitir"
  const bitir = await s.$('text=Anında Bitir');
  if (bitir) await bitir.click();
  await bekle(1500);
  await s.screenshot({ path: path.join(EKRAN, 'sc_4_savas_sonu.png') }).catch(() => {});
  const sonra = await s.evaluate(() => window.gameState.state.soldierUnits.map((a) => ({ hp: a.hp, maxHp: a.maxHp })));
  kontrol('savaştan sonra kayıtlı can taban ölçeğinde (≤ taban) ve en az 1', sonra.every((a) => a.hp >= 1 && a.hp <= a.maxHp), JSON.stringify(sonra));
  const yenilendi = await s.evaluate(() => window.gameState.state.dungeonProgress);
  kontrol('1. canavar yenildi, ilerleme 2', yenilendi >= 2, String(yenilendi));

  // sayfa yenilenince can korunuyor (sunucu kaydı)
  await s.reload({ waitUntil: 'load' });
  await s.waitForFunction(() => window.gameState && window.gameState.state, null, { timeout: 45000 });
  await bekle(1500);
  const yenilenmis = await s.evaluate(() => window.gameState.state.soldierUnits.map((a) => ({ hp: a.hp, maxHp: a.maxHp })));
  kontrol('sayfa yenilenince askerlerin canı aynı', JSON.stringify(yenilenmis.map((a) => Math.round(a.hp))) === JSON.stringify(sonra.map((a) => Math.round(a.hp))), JSON.stringify(yenilenmis));

  // telefon genişliğinde savaş ekranı taşmıyor
  const m = await oyunSayfasi({ mobil: true });
  await paletle(m.sayfa, 'zindan'); await bekle(600);
  kontrol('telefon genişliğinde zindan ekranı yatay taşmıyor', !(await tasma(m.sayfa)));
  await m.baglam.close();
  kontrol('konsolda sayfa hatası yok', hatalar.length === 0, hatalar.slice(0, 3).join(' | '));
} catch (e) {
  hataSayisi++;
  console.log('❌ beklenmeyen hata: ' + (e && e.stack || e));
} finally {
  await tarayici.close().catch(() => {});
  temizle();
}
console.log(hataSayisi ? `\n❌ ${hataSayisi} kontrol başarısız` : '\n✅ savaş canı tarayıcı denemesi geçti');
process.exit(hataSayisi ? 1 : 0);
