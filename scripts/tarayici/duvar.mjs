/* global window, document */   // aşağıdaki page.evaluate(...) işlevleri tarayıcı içinde çalışır
// Savunma Duvarı: gerçek tarayıcıda (Chrome + Playwright) uçtan uca deneme. ELLE çalıştırılır (npm test'e girmez): yerel DENEME sunucusu açık olmalı
// (OYUN-SUNUCUSU-BASLAT.bat, http://127.0.0.1:8080, TEST_MODE) ve deneme hesabı olmalı. Konsey projelerini bitirip deneyen senaryoyu koşar,
// SONUNDA projeleri başa alır (dünyayı ve hesapları sıfırlamaz). Kullanım: node scripts/tarayici/duvar.mjs
// Ortam: OYUN_ADRESI (varsayılan http://127.0.0.1:8080), DENEME_EPOSTA, DENEME_PAROLA, CHROME_YOLU, EKRAN_KLASORU (ekran görüntüleri)
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const BASE = process.env.OYUN_ADRESI || 'http://127.0.0.1:8080';
const EKRAN = process.env.EKRAN_KLASORU || os.tmpdir();
const bekle = ms => new Promise(r => setTimeout(r, ms));
const sonuc = [];
const kontrol = (ad, kosul, ayrinti = '') => { sonuc.push([ad, !!kosul, ayrinti]); console.log(`${kosul ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + ayrinti : ''}`); };

const giris = await (await fetch(BASE + '/api/account/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.DENEME_EPOSTA || 'deneme@alphavax.com', password: process.env.DENEME_PAROLA || 'Deneme-2026' }) })).json();
if (!giris.token) { console.log('❌ giriş yapılamadı'); process.exit(1); }

const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const baglam = await tarayici.newContext({ viewport: { width: 1280, height: 860 } });
await baglam.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, ['adastra_session_v1', JSON.stringify({ token: giris.token, playerId: giris.playerId })]);
await baglam.addInitScript(() => { try { localStorage.setItem('roa_arayuz', 'eski'); } catch { /* */ } });   // bu betik ESKİ test menüsünü (T tuşu, dev-modal) kullanır; yeni arayüz (v3) varsayılan olduğundan eskiye sabitlenir
const sayfa = await baglam.newPage();
const hatalar = [];
sayfa.on('pageerror', e => hatalar.push('pageerror: ' + e.message));
sayfa.on('console', m => { if (m.type() === 'error') hatalar.push('console.error: ' + m.text().slice(0, 200)); });

const durum = () => sayfa.evaluate(() => ({ oran: window.gameState.getWorldBossEarlyUnstakeRate(), biten: window.globalPool.getProjectStatus().done.length, aktif: (window.globalPool.getProjectStatus().active || {}).id || null }));
const yukle = async () => { await sayfa.waitForFunction(() => window.gameState && window.gameState.state && window.globalPool, null, { timeout: 45000 }); await bekle(4000); };
const menuAc = async () => {
  if (await sayfa.evaluate(() => !document.getElementById('dev-modal').classList.contains('hidden'))) return;
  await sayfa.keyboard.press('t'); await bekle(500);
};
const menuTikla = async (eylem, miktar) => { await menuAc(); const d = sayfa.locator(`[data-dev-action="${eylem}"]${miktar ? `[data-amount="${miktar}"]` : ''}`); await d.scrollIntoViewIfNeeded().catch(() => {}); await d.click({ timeout: 8000 }); await bekle(2500); };
const paletle = async ad => { await sayfa.keyboard.press('Escape'); await bekle(300); await sayfa.keyboard.press('Control+k'); await bekle(500); await sayfa.keyboard.type(ad); await bekle(400); await sayfa.locator('.cmd-palette-item').first().click(); await bekle(1400); };
const modalMetni = () => sayfa.evaluate(() => (document.getElementById('modal-body') || document.body).innerText);

try {
  await sayfa.goto(BASE, { waitUntil: 'load' }); await yukle();
  kontrol('oyun açıldı, yeni kural istemcide var', await sayfa.evaluate(() => typeof window.gameState.getWorldBossEarlyUnstakeRate === 'function'));

  // A) Temiz başlangıç: projeleri başa al (düğme)
  await menuTikla('reset-council');
  let d = await durum();
  kontrol('"Projeleri başa al" düğmesi çalıştı: 0 proje, ceza %18', d.biten === 0 && d.oran === 0.18 && d.aktif === 'bridge', JSON.stringify(d));

  // B) 4 projeyi tek tek bitir (düğmeye 4 kez tıkla): sıra Savunma Duvarı'nda, ceza hâlâ %18
  for (let i = 0; i < 4; i++) await menuTikla('finish-council', 1);
  d = await durum();
  kontrol('4 tıkla 4 proje bitti, sıra Savunma Duvarı\'nda, ceza hâlâ %18', d.biten === 4 && d.aktif === 'wall' && d.oran === 0.18, JSON.stringify(d));

  // C) Konsey ekranında AÇIK proje kartı: yeni açıklama görünüyor
  await sayfa.keyboard.press('Escape'); await bekle(300);
  await paletle('hazine');
  const konsey = await modalMetni();
  kontrol('Konsey ekranı açıldı', /Sirius Konseyi/.test(konsey));
  const kart = (konsey.match(/Savunma Duvar[^\n]*[\s\S]{0,260}/) || [''])[0].replace(/\s+/g, ' ');
  kontrol('açık proje kartında yeni açıklama (%18 yerine %12), eski "hasarı" yok', /erken çekilme cezası %18 yerine %12/.test(konsey) && !/hasarı %10/.test(konsey), kart.slice(0, 200));
  await sayfa.screenshot({ path: path.join(EKRAN, 'duvar_konsey.png') });

  // D) 5. projeyi bitir: ceza %12; sunucuya kaydedildi mi? (yenile)
  await sayfa.keyboard.press('Escape'); await bekle(600);
  await menuTikla('finish-council', 1);
  d = await durum();
  kontrol('5. proje bitti: ceza %12', d.biten === 5 && d.oran === 0.12, JSON.stringify(d));
  await sayfa.keyboard.press('Escape'); await bekle(300);
  await sayfa.reload({ waitUntil: 'load' }); await yukle();
  d = await durum();
  kontrol('sayfa yenilenince sunucudan: 5 proje bitik, ceza %12', d.biten === 5 && d.oran === 0.12, JSON.stringify(d));

  // E) Dünya Bossu: asker al, orduyu kilitle, "Erken Çek" düğmesi %12
  const hazir = await sayfa.evaluate(async () => { const gs = window.gameState; const c = []; await gs.addDevAdAstra(5_000_000); for (let i = 0; i < 2; i++) { const r = await gs.buySoldierUnit(); c.push(r && r.success ? 'asker+' : (r && r.message) || '?'); } return c; });
  console.log('   hazırlık →', hazir.join(' | '));
  await paletle('hazine');
  const boss = sayfa.locator('.btn-treasury-action[data-action="boss"]');
  kontrol('Hazine ekranında World Boss düğmesi var', await boss.count() > 0);
  await boss.first().click(); await bekle(1200);
  const kilit = sayfa.locator('#btn-stake-army-boss');
  if (await kilit.count() && await kilit.isEnabled()) { await kilit.click(); await bekle(2500); }
  const dg = sayfa.locator('#btn-emergency-unstake-boss');
  kontrol('kilitli orduda "Erken Çek" düğmesi görünüyor', await dg.count() === 1);
  if (await dg.count()) {
    const yazi = (await dg.innerText()).replace(/\s+/g, ' ').trim(), ipucu = await dg.getAttribute('title');
    kontrol('düğme %12 cezayı gösteriyor (%18 yok)', /%12 Ceza/.test(yazi) && !/%18/.test(yazi), yazi);
    kontrol('ipucu: ceza Savunma Duvarı sayesinde düştü', /%12/.test(ipucu) && /Savunma Duvarı/.test(ipucu), ipucu);
    await sayfa.screenshot({ path: path.join(EKRAN, 'duvar_boss.png') });
    // F) Erken çek: gerçekten %12 kesiliyor mu?
    const once = await sayfa.evaluate(() => window.gameState.state.adAstraBalance);
    const tahmin = await sayfa.evaluate(() => window.gameState.calculateUserWorldBossPower().estimatedAda);
    await dg.click(); await bekle(3000);
    const sonra = await sayfa.evaluate(() => window.gameState.state.adAstraBalance);
    const beklenen = Math.max(1, Math.round(tahmin * 0.12));
    kontrol('erken çekilince bakiyeden tam %12 kesildi (sunucu hesabıyla)', Math.abs((once - sonra) - beklenen) <= 1, `tahmini kazanç=${tahmin}, kesilen=${once - sonra}, beklenen=${beklenen}`);
  }
} catch (e) { kontrol('betik hatasız çalıştı', false, e.message.split('\n')[0]); }
finally {
  // GERİ AL: dünyayı denemeden önceki hâline getir (Konsey projeleri başa)
  try { await sayfa.keyboard.press('Escape'); await bekle(300); await menuTikla('reset-council'); const s = await durum(); kontrol('temizlik: Konsey projeleri başa alındı, ceza %18', s.biten === 0 && s.oran === 0.18, JSON.stringify(s)); } catch (e) { kontrol('temizlik yapılamadı', false, e.message.split('\n')[0]); }
  await tarayici.close();
}

const onemli = hatalar.filter(h => !/favicon|Failed to load resource.*(404)|WebGL|GPU|swiftshader/i.test(h));
kontrol('konsolda beklenmeyen hata yok', onemli.length === 0, onemli.slice(0, 3).join(' || '));
const kirik = sonuc.filter(s => !s[1]);
console.log(kirik.length ? `\n❌ ${kirik.length} kontrol başarısız` : `\n✅ ${sonuc.length} kontrol geçti`);
process.exit(kirik.length ? 1 : 0);
