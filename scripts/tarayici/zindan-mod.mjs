/* global window, document */   // aşağıdaki page.evaluate(...) işlevleri tarayıcı içinde çalışır
// Zindan modları ve Denge İzleme uçtan uca tarayıcı denemesi (18 Ekim 2026). Kendi kendine yeter: hazır hesaplı AYRI bir deneme dünyası kurar
// (scripts/senaryo/kur.mjs → data/zm-tarayici.db), sunucuyu 18083 portunda başlatır, gerçek Chrome ile:
//   hesap son boss'u yenmiş → Ctrl+K "Zindan modu" → geçiş kartı → hammadde katkıları (silo sınırı yüzünden birkaç turda) → "Zor moda geç" → onay
//   → mod değişti, hak 8 → yönetici panelinde "Denge İzleme" bölümü (görüntü al, rapor, tablolar) ; telefon genişliğinde yatay taşma
// Kullanıcının dünyasına dokunmaz. Önce `npm run build` (dist/ sunulur).   node scripts/tarayici/zindan-mod.mjs   Ortam: CHROME_YOLU, EKRAN_KLASORU
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
const DB = path.join(PROJE, 'data', 'zm-tarayici.db');
const EKRAN = process.env.EKRAN_KLASORU || os.tmpdir();
const SIFRE = 'Deneme-2026';
const ADMIN = crypto.randomBytes(24).toString('hex');
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let hataSayisi = 0;
const kontrol = (ad, kosul, ayrinti = '') => { if (!kosul) hataSayisi++; console.log(`${kosul ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + String(ayrinti).slice(0, 200) : ''}`); };

if (!fs.existsSync(path.join(PROJE, 'dist', 'index.html'))) { console.log('❌ dist/ yok: önce `npm run build`'); process.exit(1); }
for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* yok */ } }
const kur = spawnSync(process.execPath, [path.join(PROJE, 'scripts/senaryo/kur.mjs'), '--db=data/zm-tarayici.db'], { cwd: PROJE, encoding: 'utf8' });
if (kur.status !== 0) { console.log('❌ senaryo dünyası kurulamadı:\n' + kur.stdout + kur.stderr); process.exit(1); }

const bos = Object.fromEntries(['GAME_WALLET_PRIVATE_KEY', 'KASA_MASTER_KEY', 'PAYMENTS_CONTRACT', 'RATES_CONTRACT', 'RESERVE_WALLET', 'ADMIN_EMAIL', 'SMTP_URL', 'PARTNER_INCOME_FROM', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'].map((k) => [k, '']));
const sunucu = spawn(process.execPath, [path.join(PROJE, 'server', 'index.js')], { cwd: PROJE, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...bos, PORT: String(PORT), HOST: '127.0.0.1', DB_FILE: './data/zm-tarayici.db', TEST_MODE: '1', CHAIN_ENABLED: '0', ADMIN_TOKEN: ADMIN, PUBLIC_URL: BASE,
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
durumYaz((gs) => {
  gs.state.level = 30; gs.state.warehouseLevel = 12; gs.state.adAstraBalance = 1e5; gs.state.dungeonProgress = 19; gs.state.dungeonMode = 0;
  gs.state.village = { houses: 20, villagers: 200, labor: 0, lastGrowthAt: 0, starvingSince: 0 };
  const eski = GAME_CONFIG.ORDU_SINIRI; GAME_CONFIG.ORDU_SINIRI = { ASKER_SEVIYESI_HESAP_SEVIYESINI_GECEMEZ: false, ASKER_HAKKI_ZINDAN_KATINA_BAGLI: false };
  try { for (let i = 0; i < 3; i++) gs.buySoldierUnit(); } finally { GAME_CONFIG.ORDU_SINIRI = eski; }
});
// Silo, test modunun geliştirici işlemleriyle (API) doldurulur: sunucu oyuncu kaydını bellekte önbelleğe alır, dışarıdan veritabanına yazılan değişiklik görünmez
const SILO_12 = { wood: 5668, iron: 3980, coal: 4723, stone: 6298 };
const siloyuDoldur = async () => { for (const [k, v] of Object.entries(SILO_12)) await api('POST', '/api/action', { name: 'setDevResource', args: [k, v] }, g.token); };

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
  let o = await oyunSayfasi();
  await paletle(o.sayfa, 'zindanmod');
  let metin = await panel(o.sayfa);
  kontrol('Ctrl+K ile "Zindan modu" ekranı açılıyor', /Normal mod/.test(metin) && /Sonraki mod: Zor/.test(metin), metin.slice(0, 70).replace(/\n/g, ' '));
  kontrol('Normal mod kartı: ödül çarpanı ×1, tüm katlar bitti', /Tüm 6 kat bitti/.test(metin) && /ASTRA ödül çarpanı\s*×1/.test(metin));
  kontrol('geçiş kartı: Zor mod, bedel ve "geri dönmez" uyarısı', /Sonraki mod: Zor/.test(metin) && /geri dönmez/.test(metin) && /ASTRA bedeli/.test(metin));
  await o.sayfa.screenshot({ path: path.join(EKRAN, 'zm_gecis_masaustu.png') }).catch(() => {});

  // hammadde katkıları: silo sınırı yüzünden birkaç turda (gerçek oyuncu günlere yayar)
  let tamam = false;
  for (let tur = 0; tur < 14 && !tamam; tur++) {
    await siloyuDoldur();
    await o.sayfa.reload({ waitUntil: 'load' });
    await o.sayfa.waitForFunction(() => window.gameState && window.gameState.state, null, { timeout: 45000 });
    await bekle(1500);
    await paletle(o.sayfa, 'zindanmod');
    const t = await panel(o.sayfa);
    if (/tamam ✅[\s\S]*tamam ✅[\s\S]*tamam ✅[\s\S]*tamam ✅/.test(t)) { tamam = true; break; }
    await o.sayfa.click('[data-e="katkiHepsi"]');
    await bekle(900);
  }
  metin = await panel(o.sayfa);
  kontrol('4 hammaddenin katkısı tamamlandı (silo sınırı yüzünden birkaç turda)', /tamam ✅[\s\S]*tamam ✅[\s\S]*tamam ✅[\s\S]*tamam ✅/.test(metin));
  kontrol('"Zor moda geç" düğmesi açıldı (ASTRA yeter)', (await o.sayfa.getAttribute('[data-e="gec"]', 'disabled')) === null && /Bakiyen yeter/.test(metin));
  await o.sayfa.screenshot({ path: path.join(EKRAN, 'zm_gecis_hazir.png') }).catch(() => {});

  await bekle(700);
  await o.sayfa.click('[data-e="gec"]');
  await o.sayfa.waitForSelector('[data-v3-tamam]', { timeout: 8000 });
  await o.sayfa.screenshot({ path: path.join(EKRAN, 'zm_onay.png') }).catch(() => {});
  await o.sayfa.click('[data-v3-tamam]');
  await bekle(1800);
  const durum = await o.sayfa.evaluate(() => ({ mod: window.gameState.state.dungeonMode, ilerleme: window.gameState.state.dungeonProgress, hak: window.gameState.getAskerHakki().hak }));
  kontrol('geçiş oldu: Zor mod, zindan baştan, asker hakkı 8', durum.mod === 1 && durum.ilerleme === 1 && durum.hak === 8, JSON.stringify(durum));
  metin = await panel(o.sayfa);
  kontrol('ekran yeni modu gösteriyor (Zor, sonraki Uzman)', /Zor mod/.test(metin) && /Sonraki mod: Uzman/.test(metin) && /×1,5/.test(metin), metin.slice(0, 90).replace(/\n/g, ' '));
  // sunucu da aynı modda (sayfa yenilenince durur)
  await o.sayfa.reload({ waitUntil: 'load' });
  await o.sayfa.waitForFunction(() => window.gameState && window.gameState.state, null, { timeout: 45000 });
  kontrol('sayfa yenilenince mod sunucudan Zor olarak geliyor', (await o.sayfa.evaluate(() => window.gameState.state.dungeonMode)) === 1);
  await paletle(o.sayfa, 'kisla');
  metin = await panel(o.sayfa);
  kontrol('Kışla: asker hakkı bilgisi (3 / 8) görünüyor', /3 \/ 8/.test(metin), (metin.match(/Zindan asker hakkın[^\n]*/) || [''])[0]);
  kontrol('masaüstünde yatay taşma yok', !(await tasma(o.sayfa)));
  await o.baglam.close();

  // ── yönetici paneli: Denge İzleme ──
  const yBaglam = await tarayici.newContext({ viewport: { width: 1280, height: 900 } });
  const y = await yBaglam.newPage();
  y.on('pageerror', (e) => hatalar.push('admin pageerror: ' + e.message));
  y.on('console', (m) => { if (m.type() === 'error' && !/status of 409/.test(m.text())) hatalar.push('admin console.error: ' + m.text().slice(0, 200)); });
  await y.goto(BASE + '/admin', { waitUntil: 'load' });
  await y.fill('#tok', ADMIN); await y.click('#enter');
  await y.waitForSelector('#dgOzet', { timeout: 15000 });
  await y.click('#dgGoruntu');
  await y.waitForFunction(() => /Görüntü alındı/.test(document.getElementById('dgDurum').textContent), null, { timeout: 8000 });
  await bekle(600);
  const ozet = await y.textContent('#dgOzet');
  kontrol('panelde Denge İzleme özet kartları (oyuncu sayısı, kazanç/harcama)', /Oyuncu \/ aktif/.test(ozet) && /Kazanç \/ harcama/.test(ozet), ozet.slice(0, 100));
  kontrol('işlemler tablosunda mod katkısı ve mod geçişi sayıldı', /Mod geçişi\s*1/.test((await y.textContent('#dgIslem')).replace(/\s+/g, ' ')) || /Mod geçişi/.test(await y.textContent('#dgIslem')));
  const dagilim = await y.textContent('#dgDagilim');
  kontrol('dağılım görüntüsünde mod ve asker sayısı var', /Mod/.test(dagilim) && /Asker sayısı/.test(dagilim), dagilim.slice(0, 120));
  await y.selectOption('#dgPencere', 'ay'); await bekle(800);
  kontrol('ay penceresi: 30 gün', /30 gün/.test(await y.textContent('#dgDurum')));
  await y.screenshot({ path: path.join(EKRAN, 'zm_panel_denge.png'), fullPage: false }).catch(() => {});
  await yBaglam.close();

  // ── telefon genişliği ──
  const m = await oyunSayfasi({ mobil: true });
  await m.sayfa.click('[data-v3-sekme="savas"]'); await bekle(600);
  await m.sayfa.click('[data-v3-git="zindanmod"]'); await bekle(1200);
  metin = await panel(m.sayfa);
  kontrol('telefonda Savaş menüsünden Zindan modu açılıyor', /Zor mod/.test(metin));
  kontrol('telefonda (390 px) yatay taşma yok', !(await tasma(m.sayfa)));
  await m.sayfa.screenshot({ path: path.join(EKRAN, 'zm_telefon.png') }).catch(() => {});
  await m.baglam.close();
} catch (e) {
  hataSayisi++;
  console.log('❌ betik hatası: ' + e.stack);
} finally {
  await tarayici.close();
  try { db2.close(); } catch { /* */ }
}
kontrol('tarayıcı konsolunda hata yok', hatalar.length === 0, hatalar.slice(0, 4).join(' | '));
console.log(`\nEkran görüntüleri: ${EKRAN} (zm_*.png)`);
console.log(hataSayisi ? `❌ ${hataSayisi} kontrol başarısız` : '✅ zindan modu + denge izleme tarayıcı denemesi geçti');
process.exit(hataSayisi ? 1 : 0);
