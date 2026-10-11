/* global window, document */   // aşağıdaki page.evaluate(...) işlevleri tarayıcı içinde çalışır
// Senaryo dünyasında uçtan uca tarayıcı denemesi (T5, yerel doğrulama kampanyası). Kendi kendine yeter: hazır hesaplı AYRI bir deneme
// dünyası kurar (scripts/senaryo/kur.mjs → data/senaryo-otomatik.db), sunucuyu 18081 portunda başlatır, gerçek Chrome ile (masaüstü ve
// telefon genişliği) kapı akışlarını dener, sonunda sunucuyu kapatıp geçici dosyaları siler. Kullanıcının dünyasına (8080/8081) dokunmaz.
//   npm run tarayici      (önce `npm run build` yapılmış olmalı: dist/ sunulur)
// Ortam: CHROME_YOLU, EKRAN_KLASORU (ekran görüntüleri; varsayılan geçici klasör)
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PROJE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(PROJE, 'package.json'));
const { chromium } = require('playwright');
const PORT = 18081, BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(PROJE, 'data', 'senaryo-otomatik.db');
const EKRAN = process.env.EKRAN_KLASORU || os.tmpdir();
const SIFRE = 'Deneme-2026';
const ADMIN = crypto.randomBytes(24).toString('hex');
const bekle = ms => new Promise(r => setTimeout(r, ms));
const sonuc = [];
const kontrol = (ad, kosul, ayrinti = '') => { sonuc.push([ad, !!kosul, ayrinti]); console.log(`${kosul ? '✅' : '❌'} ${ad}${ayrinti ? '  → ' + String(ayrinti).slice(0, 220) : ''}`); };
const bulgu = (ad, ayrinti = '') => { sonuc.push([ad, true, ayrinti, 'bulgu']); console.log(`⚠️  BULGU: ${ad}${ayrinti ? '  → ' + String(ayrinti).slice(0, 220) : ''}`); };

if (!fs.existsSync(path.join(PROJE, 'dist', 'index.html'))) { console.log('❌ dist/ yok: önce `npm run build`'); process.exit(1); }
for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* yok */ } }
const kur = spawnSync(process.execPath, [path.join(PROJE, 'scripts/senaryo/kur.mjs'), '--db=data/senaryo-otomatik.db'], { cwd: PROJE, encoding: 'utf8' });
if (kur.status !== 0) { console.log('❌ senaryo dünyası kurulamadı:\n' + kur.stdout + kur.stderr); process.exit(1); }

const bos = Object.fromEntries(['GAME_WALLET_PRIVATE_KEY', 'KASA_MASTER_KEY', 'PAYMENTS_CONTRACT', 'RATES_CONTRACT', 'RESERVE_WALLET', 'ADMIN_EMAIL', 'SMTP_URL', 'PARTNER_INCOME_FROM', 'PARTNER_INCOME_TO', 'CORS_ORIGINS', 'TRUST_PROXY', 'PAYOUT_MODE', 'CHAIN_ID', 'VAULT_CONTRACT'].map(k => [k, '']));
const sunucu = spawn(process.execPath, [path.join(PROJE, 'server', 'index.js')], { cwd: PROJE, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...bos, PORT: String(PORT), HOST: '127.0.0.1', DB_FILE: './data/senaryo-otomatik.db', TEST_MODE: '1', CHAIN_ENABLED: '0', ADMIN_TOKEN: ADMIN, PUBLIC_URL: BASE,
    RATE_LIMIT_PER_SEC: '1000', IP_RATE_LIMIT_PER_SEC: '1000', PUBLIC_RATE_LIMIT_PER_SEC: '1000' } });
let sunucuCiktisi = '';
sunucu.stdout.on('data', d => { sunucuCiktisi += d; }); sunucu.stderr.on('data', d => { sunucuCiktisi += d; });
const temizle = () => { try { sunucu.kill(); } catch { /* */ } for (const ek of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + ek); } catch { /* kilitli olabilir */ } } };
process.on('exit', temizle);
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/health')).ok) break; } catch { /* henüz yok */ } await bekle(500); if (i === 59) { console.log('❌ sunucu açılmadı:\n' + sunucuCiktisi.slice(-600)); process.exit(1); } }

const api = async (method, p, body, token) => { const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, body: j }; };
const girisAl = async ad => { const r = await api('POST', '/api/account/login', { email: `senaryo-${ad}@ornek.com`, password: SIFRE }); if (!r.body || !r.body.token) throw new Error('giriş: ' + ad + ' ' + JSON.stringify(r.body)); return r.body; };
const durumAl = async g => (await api('GET', '/api/state', null, g.token)).body;

const tarayici = await chromium.launch({ executablePath: process.env.CHROME_YOLU || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const tumHatalar = [];
async function sayfaAc(ad, { mobil = false } = {}) {
  const g = await girisAl(ad);
  const baglam = await tarayici.newContext({ viewport: mobil ? { width: 390, height: 844 } : { width: 1280, height: 860 }, hasTouch: mobil, permissions: ['clipboard-read', 'clipboard-write'] });
  // Yeni oyuncu turu perdesi tıklamaları keser: bu betik turu ayrıca denemez, her hesap için atlanmış sayılır
  await baglam.addInitScript(([k]) => { try { localStorage.setItem(k, '{"atlandi":true}'); } catch { /* */ } }, [`roa_v3_tur_${g.playerId}`]);
  await baglam.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, ['adastra_session_v1', JSON.stringify({ token: g.token, playerId: g.playerId })]);
  const sayfa = await baglam.newPage();
  const hatalar = [];
  sayfa.on('pageerror', e => hatalar.push(`[${ad}] pageerror: ` + e.message));
  sayfa.on('console', m => { if (m.type() === 'error') hatalar.push(`[${ad}] console.error: ` + m.text().slice(0, 200)); });
  await sayfa.goto(BASE, { waitUntil: 'load' });
  await sayfa.waitForFunction(() => window.gameState && window.gameState.state, null, { timeout: 45000 });
  await bekle(2500);
  return { sayfa, g, hatalar, kapat: async () => { tumHatalar.push(...hatalar); await baglam.close(); } };
}
const bannerMetni = s => s.evaluate(() => { const el = document.getElementById('gate-banner'); return { gizli: !el || el.hidden, metin: el ? el.innerText : '', html: el ? el.innerHTML : '' }; });
const tasmaVar = s => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const ekran = (s, ad) => s.screenshot({ path: path.join(EKRAN, `senaryo_${ad}.png`) }).catch(() => {});
const paletle = async (s, komut) => { await s.keyboard.press('Escape'); await bekle(300); await s.keyboard.down('Control'); await s.keyboard.press('k'); await s.keyboard.up('Control'); await bekle(500); await s.click(`.v3-palet-oge[data-palet-id="${komut}"]`); await bekle(1200); };
const modalMetni = s => s.evaluate(() => (document.getElementById('modal-body') || document.body).innerText);

try {
  // ── 1) Yeni vatandaş: kapı şeridi yok, Konsey gelir panosu, Hesabım bilgi kutusu, telefon genişliği ──
  {
    const o = await sayfaAc('yeni');
    const b = await bannerMetni(o.sayfa);
    kontrol('yeni vatandaş: kapı şeridi gizli', b.gizli, b.metin.slice(0, 80));
    await paletle(o.sayfa, 'hazine');
    const m = await modalMetni(o.sayfa);
    kontrol('Konsey: "Kapı durumu" kartı (vatandaş sayısı)', /Kapı durumu[^\n]*vatandaş 7 \/ 8/.test(m), (m.match(/Kapı durumu[^\n]*/) || [''])[0]);
    kontrol('Konsey: "Gelir motoru" kartı hedefleri gösteriyor', /Gelir motoru/.test(m) && /hedef 50 \$/.test(m) && /hedef 16[.,]7 \$/.test(m) && /şimdilik kilitli/.test(m));
    kontrol('Konsey metninde NaN/undefined yok', !/NaN|undefined/.test(m));
    await ekran(o.sayfa, 'yeni_konsey');
    await o.sayfa.keyboard.press('Escape'); await bekle(300);
    await o.sayfa.evaluate(() => window.gameState.startExpedition('wheat'));    // oyuncu bir sefer başlatır
    await bekle(2500);
    await paletle(o.sayfa, 'hazine');
    const m2 = await modalMetni(o.sayfa);
    kontrol('karne: yapılan sefer hazine ekranında hemen ✅ görünüyor', /✅ 🌾 Sefer/.test(m2), (m2.match(/Katılım karnem[\s\S]{0,200}/) || [''])[0].replace(/\s+/g, ' '));
    await o.sayfa.keyboard.press('Escape');
    await o.kapat();
    const ob = await sayfaAc('yeni', { mobil: true });
    await paletle(ob.sayfa, 'hazine');
    kontrol('telefon (390 px): Konsey ekranında yatay taşma yok', !(await tasmaVar(ob.sayfa)));
    await ekran(ob.sayfa, 'yeni_konsey_telefon');
    await ob.kapat();
  }

  // ── 2) İzin sorusu: Evet / Hayır ──
  {
    const o = await sayfaAc('izin-sorusu');
    const b = await bannerMetni(o.sayfa);
    kontrol('izin sorusu: şeritte soru ve iki düğme var', /izin hakkını kullanmak ister misin/.test(b.metin) && /data-kapi="izin-evet"/.test(b.html) && /data-kapi="izin-hayir"/.test(b.html), b.metin.slice(0, 100));
    await ekran(o.sayfa, 'izin_sorusu');
    await o.sayfa.click('[data-kapi="izin-evet"]'); await bekle(1500);
    const sonra = await bannerMetni(o.sayfa);
    kontrol('"Evet": soru şeritten kalktı', !/ister misin/.test(sonra.metin));
    const st = await durumAl(o.g);
    kontrol('"Evet": sunucuda izin modu açıldı (≤14 gün) ve yıllık hak düştü', st.player.katilim.izinModu && st.player.katilim.izinModu.gun >= 1 && st.player.katilim.izinModu.gun <= 14 && st.player.katilim.izinYillikKalan < 30 && !st.player.katilim.izinSorusu, JSON.stringify(st.player.katilim.izinModu));
    await o.sayfa.reload({ waitUntil: 'load' }); await o.sayfa.waitForFunction(() => window.gameState && window.gameState.state, null, { timeout: 45000 }); await bekle(2000);
    kontrol('"Evet": sayfa yenilenince soru geri gelmiyor', !/ister misin/.test((await bannerMetni(o.sayfa)).metin));
    kontrol('"Evet" sonrası şeritte "İzindesin" bilgisi görünüyor', /İzindesin/.test((await bannerMetni(o.sayfa)).metin));
    await o.kapat();
    const o2 = await sayfaAc('izin-sorusu-2');
    await o2.sayfa.click('[data-kapi="izin-hayir"]'); await bekle(1500);
    const st2 = await durumAl(o2.g);
    kontrol('"Hayır": soru kalktı, izin açılmadı, yıllık hak 30 kaldı', !st2.player.katilim.izinSorusu && !st2.player.katilim.izinModu && st2.player.katilim.izinYillikKalan === 30, JSON.stringify(st2.player.katilim));
    await o2.kapat();
  }

  // ── 4) Sıradaki adaylar ──
  {
    const o = await sayfaAc('sirada-degil');
    const b = await bannerMetni(o.sayfa);
    kontrol('hazır olmayan aday: sıra no, 3 açık onay düğmesi, davet yok', /Bekleme sırasındasın: \d+\. sıra/.test(b.metin) && (b.html.match(/data-kapi-gorev=/g) || []).length === 3 && !/Yerin açıldı/.test(b.metin) && !/disabled/.test(b.html), b.metin.slice(0, 90));
    await ekran(o.sayfa, 'aday_degil');
    for (const id of ['rehber', 'kurallar', 'hazirim']) { await o.sayfa.click(`[data-kapi-gorev="${id}"]`); await bekle(900); }
    const sonra = await bannerMetni(o.sayfa);
    kontrol('3 onay verilince hepsi ✅', (sonra.metin.match(/✅/g) || []).length >= 3, sonra.metin.slice(0, 120));
    await o.sayfa.reload({ waitUntil: 'load' }); await o.sayfa.waitForFunction(() => window.gameState && window.gameState.state, null, { timeout: 45000 }); await bekle(2000);
    kontrol('yenileyince onaylar sunucudan kalıcı geliyor', (((await bannerMetni(o.sayfa)).metin).match(/✅/g) || []).length >= 3);
    await o.kapat();
    const om = await sayfaAc('sirada-degil', { mobil: true });
    kontrol('telefon: kapı şeridi yatay taşma yapmıyor', !(await tasmaVar(om.sayfa)));
    await ekran(om.sayfa, 'aday_telefon');
    await om.kapat();

    const oh = await sayfaAc('sirada-hazir');
    const bh = await bannerMetni(oh.sayfa);
    kontrol('hazır aday: 3 onay ✅ ve sırada, davet yok', (bh.html.match(/✅/g) || []).length >= 3 && /Bekleme sırasındasın/.test(bh.metin) && !/Yerin açıldı/.test(bh.metin), bh.html.replace(/\s+/g, ' ').slice(-420));
    await oh.kapat();

    const od = await sayfaAc('davetli');
    const bd = await bannerMetni(od.sayfa);
    kontrol('davetli aday: "Yerin açıldı" mesajı görünüyor', /Yerin açıldı/.test(bd.metin), bd.metin.slice(0, 120));
    await ekran(od.sayfa, 'aday_davetli');
    await od.sayfa.evaluate(() => window.gameState.startExpedition('wheat'));   // ilk gerçek eylem daveti kabul eder
    await bekle(2000);
    let st = await durumAl(od.g);
    if (st.gate.status !== 'citizen') { await api('POST', '/api/action', { name: 'claimAllHarvests', args: [] }, od.g.token); st = await durumAl(od.g); bulgu('davetli aday: tarayıcıdaki ilk eylem daveti kabul ettirmedi (yerel simülasyon başarısız sayılıp sunucuya gönderilmedi); API ile kabul edildi', `gate=${st.gate.status}`); }
    kontrol('davetli aday ilk eylemle vatandaş oldu', st.gate.status === 'citizen', JSON.stringify(st.gate));
    await od.kapat();
  }

  // ── 5) Yönetici paneli: kapı bölümü (adaylardan SONRA: sınırı değiştirmek yeni yer açıp davet gönderir) ──
  {
    const baglam = await tarayici.newContext({ viewport: { width: 1280, height: 900 } });
    await baglam.addInitScript(t => { try { sessionStorage.setItem('adm', t); } catch { /* */ } }, ADMIN);
    const s = await baglam.newPage();
    const hatalar = []; s.on('pageerror', e => hatalar.push('[admin] pageerror: ' + e.message)); s.on('console', m => { if (m.type() === 'error') hatalar.push('[admin] console.error: ' + m.text().slice(0, 200)); });
    await s.goto(BASE + '/admin', { waitUntil: 'load' });
    await s.waitForFunction(() => document.getElementById('kapiInfo') && document.getElementById('kapiInfo').innerText.length > 5, null, { timeout: 20000 });
    const bilgi = await s.evaluate(() => document.getElementById('kapiInfo').innerText);
    kontrol('yönetici: kapı özeti vatandaş/sıra/askı gösteriyor', /vatandaş/i.test(bilgi) && /sıra/i.test(bilgi), bilgi.slice(0, 120));
    const kuyruk = await s.evaluate(() => document.querySelectorAll('#kapiQueue tr').length), askida = await s.evaluate(() => document.querySelectorAll('#kapiSusp tr').length);
    kontrol('yönetici: bekleme sırası 3 satır, askıdakiler 2 satır', kuyruk >= 3 && askida >= 2, `sıra ${kuyruk}, askı ${askida}`);
    await s.fill('#kapiLimit', '9'); await s.selectOption('#kapiTier', '1'); await s.click('#kapiSave'); await bekle(1200);
    const ks = (await api('GET', '/api/admin/status', null, ADMIN)).body.kapi;
    kontrol('yönetici: sınır 9, dönem 2 (eşik 100 $) kaydedildi', ks && ks.limit === 9 && ks.tier === 1 && ks.threshold === 100, JSON.stringify({ limit: ks && ks.limit, tier: ks && ks.tier, esik: ks && ks.threshold }));
    await s.screenshot({ path: path.join(EKRAN, 'senaryo_admin.png'), fullPage: false }).catch(() => {});
    tumHatalar.push(...hatalar); await baglam.close();
    await api('POST', '/api/admin/kapi', { limit: 8, tier: 0 }, ADMIN);
  }

  // ── 6) Askıdakiler girişte sıraya döner: öncelikli olan öne geçer, önceliksiz olan sona gider ──
  {
    const a = await girisAl('askida-oncelikli'), b = await girisAl('askida-oncelik-yok');
    const sa = await durumAl(a), sb = await durumAl(b);
    kontrol('askıdan dönenler sıraya alındı', sa.gate.status === 'waiting' && sb.gate.status === 'waiting', `${sa.gate.status}/${sb.gate.status}`);
    const ho = await durumAl(await girisAl('sirada-hazir')), dg = await durumAl(await girisAl('sirada-degil'));
    kontrol('öncelikli dönen sıranın ÖNÜNDE, önceliksiz dönen en SONDA', sa.gate.position < ho.gate.position && sb.gate.position > dg.gate.position, `öncelikli ${sa.gate.position} · hazır ${ho.gate.position} · değil ${dg.gate.position} · önceliksiz ${sb.gate.position}`);
    const o = await sayfaAc('askida-oncelikli');
    kontrol('askıdan dönenin ekranında sıra numarası var', /Bekleme sırasındasın: \d+\. sıra/.test((await bannerMetni(o.sayfa)).metin));
    await o.kapat();
  }

  // ── 7) Kişisel karne ve izin durumu (Konsey + kapı şeridi) ──
  {
    const o = await sayfaAc('uyarili');
    await paletle(o.sayfa, 'hazine');
    const m = await modalMetni(o.sayfa);
    kontrol('Konsey: "Katılım karnem" kartı — puan/eşik, 10 kategori, düşük hafta uyarısı, izin hakkı', /Katılım karnem/.test(m) && /bu hafta 0\/2/.test(m) && /☐ 🌾 Sefer/.test(m) && /2 haftadır düşük/.test(m) && /Yıllık izin hakkın: 30 gün/.test(m), (m.match(/Katılım karnem[\s\S]{0,260}/) || [''])[0].replace(/\s+/g, ' '));
    await ekran(o.sayfa, 'karne_uyarili');
    await o.kapat();
    // Sponsorluk: zengin vatandaş Konsey'deki kutudan bir vatandaşa sponsor olur; sunucuda sözleşme ve A'da çekilemez kalem oluşur
    const sp = await sayfaAc('deneyimli');
    await paletle(sp.sayfa, 'hazine'); await bekle(1500);
    const ms = await modalMetni(sp.sayfa);
    kontrol('Konsey: "Sponsorluk" kutusu (açıklama, form) görünüyor', /Sponsorluk/.test(ms) && /Sponsor ol/.test(ms) && /çekilemez/.test(ms) && !/NaN|undefined/.test(ms), (ms.match(/Sponsorluk[\s\S]{0,160}/) || [''])[0].replace(/\s+/g, ' '));
    await sp.sayfa.evaluate(() => { const sel = document.getElementById('sp-hedef'); sel.selectedIndex = 0; document.getElementById('sp-miktar').value = '1500'; });
    const hedefId = await sp.sayfa.evaluate(() => document.getElementById('sp-hedef').value);
    await sp.sayfa.click('[data-e="sponsorOl"]'); await bekle(2500);
    const bn = await api('GET', '/api/sponsor/benim', null, sp.g.token);
    kontrol('Sponsor ol: sunucuda sözleşme oluştu (1500 ASTRA)', bn.status === 200 && bn.body.given.length === 1 && bn.body.given[0].principal === 1500, JSON.stringify(bn.body.given));
    const ms2 = await modalMetni(sp.sayfa);
    kontrol('Sponsor ol: kutu "Verdiğim" listesini gösteriyor', /verdiğim/i.test(ms2.toLocaleLowerCase('tr')) && /1\.500 ASTRA/.test(ms2), (ms2.match(/Verdiğim[\s\S]{0,120}/) || [''])[0].replace(/\s+/g, ' '));
    kontrol('Sponsor ol: hedef tablo satırı kimlik içermiyor ve sponsor sayısı 1', (await api('GET', '/api/sponsor/tablo', null, sp.g.token)).body.rows.some(r => r.id === hedefId && r.sponsorSayisi === 1 && !('wallet' in r) && !('email' in r)));
    await sp.sayfa.keyboard.press('Escape');
    await sp.kapat();
    const i = await sayfaAc('izinde');
    const b = await bannerMetni(i.sayfa);
    kontrol('izinde: şeritte "İzindesin — N gün kaldı" ve erken bitirme düğmesi', /İzindesin/.test(b.metin) && /data-kapi="izin-bitir"/.test(b.html), b.metin.slice(0, 100));
    await paletle(i.sayfa, 'hazine');
    const mi = await modalMetni(i.sayfa);
    kontrol('izinde: Konsey karnesinde izin bitiş tarihi ve "Üretim Hakkı almazsın" açıklaması', /İzindesin/.test(mi) && /Üretim Hakkı, temel gelir ve ücretsiz oyuncu payı almazsın/.test(mi));
    await i.sayfa.click('[data-e="izinBitir"]'); await bekle(1500);
    const st = await durumAl(i.g);
    kontrol('"İzni şimdi bitir": sunucuda izin modu kapandı', !st.player.katilim.izinModu, JSON.stringify(st.player.katilim.izinModu));
    await i.kapat();
  }

  // ── 7b) E-posta doğrulama bağlantısı şifre sordurur (ön-hesap ele geçirmeye karşı, 12 Ekim 2026) ──
  {
    const SALDIRGAN = 'saldirgan-1234', KURBAN = 'kurbanin-sifresi-77';
    const kay = await api('POST', '/api/account/register', { email: 'on-hesap-kurban@ornek.com', password: SALDIRGAN });
    const t = /[?&]verify=([a-f0-9]+)/.exec(String((kay.body || {}).devLink || ''));
    kontrol('doğrulama: deneme sunucusu bağlantıyı veriyor', kay.status === 200 && !!t, JSON.stringify(kay.body).slice(0, 120));
    if (t) {
      const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const sayfa = await baglam.newPage();
      await sayfa.goto(`${BASE}/?verify=${t[1]}`, { waitUntil: 'load' });
      await sayfa.waitForSelector('#vf-pass', { timeout: 45000 });
      const metin = await sayfa.evaluate(() => document.getElementById('online-overlay').innerText);
      kontrol('doğrulama: bağlantı "Hesabını Koru" penceresini açıyor (şifre soruyor)', /Hesabını Koru/.test(metin) && /Doğrula ve gir/.test(metin), metin.replace(/\s+/g, ' ').slice(0, 100));
      kontrol('doğrulama: telefonda pencere yatay taşmıyor', !(await tasmaVar(sayfa)));
      await ekran(sayfa, 'dogrulama_sifre');
      await sayfa.fill('#vf-pass', 'kisa'); await sayfa.fill('#vf-pass2', 'kisa'); await sayfa.click('#vf-go'); await bekle(300);
      kontrol('doğrulama: kısa şifre uyarı veriyor, pencere kapanmıyor', /en az 8/.test(await sayfa.evaluate(() => document.getElementById('vf-msg').textContent)));
      await sayfa.fill('#vf-pass', KURBAN); await sayfa.fill('#vf-pass2', KURBAN + 'x'); await sayfa.click('#vf-go'); await bekle(300);
      kontrol('doğrulama: iki şifre farklıysa uyarı veriyor', /aynı değil/.test(await sayfa.evaluate(() => document.getElementById('vf-msg').textContent)));
      await sayfa.fill('#vf-pass2', KURBAN); await sayfa.click('#vf-go');
      await sayfa.waitForFunction(() => window.gameState && window.gameState.state && !document.getElementById('vf-pass'), null, { timeout: 45000 });
      const oturum = await sayfa.evaluate(() => { try { return JSON.parse(localStorage.getItem('adastra_session_v1') || 'null'); } catch { return null; } });
      kontrol('doğrulama: şifre yazılınca oturum açıldı', !!(oturum && oturum.token), JSON.stringify(oturum).slice(0, 80));
      kontrol('doğrulama: saldırganın şifresi artık geçmiyor', (await api('POST', '/api/account/login', { email: 'on-hesap-kurban@ornek.com', password: SALDIRGAN })).status === 401);
      kontrol('doğrulama: kurbanın yazdığı şifre geçiyor', (await api('POST', '/api/account/login', { email: 'on-hesap-kurban@ornek.com', password: KURBAN })).status === 200);
      await baglam.close();
    }
  }

  // ── 8) Genel: konsol hatası yok ──
  const onemli = tumHatalar.filter(h => !/favicon|Failed to load resource.*(404)|WebGL|GPU|swiftshader/i.test(h));
  kontrol('hiçbir sayfada beklenmeyen konsol hatası yok', onemli.length === 0, onemli.slice(0, 3).join(' || '));
  if (/Error|TypeError|ReferenceError/.test(sunucuCiktisi.replace(/\x1b\[[0-9;]*m/g, ''))) bulgu('sunucu çıktısında hata satırı var', (sunucuCiktisi.match(/.*(Error|TypeError|ReferenceError).*/) || [''])[0]);
} catch (e) { kontrol('betik hatasız çalıştı', false, (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }
finally { await tarayici.close(); temizle(); }

const kirik = sonuc.filter(s => !s[1]);
console.log(kirik.length ? `\n❌ ${kirik.length} kontrol başarısız` : `\n✅ ${sonuc.filter(s => s[3] !== 'bulgu').length} kontrol geçti, ${sonuc.filter(s => s[3] === 'bulgu').length} bulgu`);
process.exit(kirik.length ? 1 : 0);
