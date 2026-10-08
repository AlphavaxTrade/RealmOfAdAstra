// server/index.js GERÇEK SÜREÇ olarak: güvenlik kilitleri ve bozuk ayar başlatmayı durdurur (kurumsal A3.5)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'baslatma-'));

// Yerel server/.env bu testi etkilemesin: ilgili bütün anahtarlar BOŞ dizeyle tanımlanır (index.js tanımlıları ezmez)
const BOS = Object.fromEntries(['GAME_WALLET_PRIVATE_KEY', 'KASA_MASTER_KEY', 'PAYMENTS_CONTRACT', 'RATES_CONTRACT', 'RESERVE_WALLET', 'ADMIN_TOKEN', 'ADMIN_EMAIL', 'SMTP_URL',
  'PARTNER_INCOME_FROM', 'PARTNER_INCOME_TO', 'CORS_ORIGINS', 'PUBLIC_URL', 'TRUST_PROXY', 'PAROLA_HAFIF', 'PAYOUT_MODE', 'CHAIN_ID', 'TEST_MODE', 'SCHEDULER', 'NODE_ENV', 'ADMIN_TOKEN_FILE', 'SMTP_URL_FILE', 'GAME_WALLET_PRIVATE_KEY_FILE', 'KASA_MASTER_KEY_FILE'].map(k => [k, '']));

function calistir(ek, { bekle = 'cik', zaman = 15000 } = {}) {
  return new Promise(resolve => {
    const env = { ...process.env, ...BOS, CHAIN_ENABLED: '0', HOST: '127.0.0.1', PORT: '0', DB_FILE: path.join(gecici, `db-${Math.random().toString(36).slice(2)}.db`), ...ek };
    const p = spawn(process.execPath, ['server/index.js'], { cwd: kok, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let cikti = '';
    const topla = d => { cikti += d.toString(); if (bekle === 'calisiyor' && cikti.includes('sunucusu çalışıyor')) { p.kill(); } };
    p.stdout.on('data', topla); p.stderr.on('data', topla);
    const sayac = setTimeout(() => { p.kill(); }, zaman);
    p.on('close', kod => { clearTimeout(sayac); resolve({ kod, cikti }); });
  });
}

try {
  // 1) Deneme modu + gerçek cüzdan anahtarı / ana anahtar birlikte açılmaz
  {
    const r = await calistir({ TEST_MODE: '1', GAME_WALLET_PRIVATE_KEY: '0x' + 'ab'.repeat(32) });   // gizli-tara: izin
    assert.equal(r.kod, 1, r.cikti);
    assert.match(r.cikti, /TEST_MODE=1 iken GAME_WALLET_PRIVATE_KEY/);
    const r2 = await calistir({ TEST_MODE: '1', KASA_MASTER_KEY: 'cd'.repeat(32) });
    assert.equal(r2.kod, 1, r2.cikti);
    ok('TEST_MODE + gerçek cüzdan anahtarı / ana anahtar → başlamaz');
  }

  // 2) Deneme modu + gerçek ağdaki ödeme sözleşmesi açılmaz (Fuji'de serbest)
  {
    const sozlesme = '0x' + '12'.repeat(20);
    const r = await calistir({ TEST_MODE: '1', PAYMENTS_CONTRACT: sozlesme });
    assert.equal(r.kod, 1, r.cikti);
    assert.match(r.cikti, /gerçek ağdaki ödeme sözleşmesi/);
    const fuji = await calistir({ TEST_MODE: '1', PAYMENTS_CONTRACT: sozlesme, CHAIN_ID: '43113' }, { bekle: 'calisiyor' });
    assert.ok(/sunucusu çalışıyor/.test(fuji.cikti), 'Fuji (43113) denemesine izin verilir: ' + fuji.cikti.slice(0, 300));
    ok('TEST_MODE + ana ağ ödeme sözleşmesi → başlamaz; Fuji serbest');
  }

  // 3) PAROLA_HAFIF gerçek sunucuda reddedilir
  {
    const r = await calistir({ PAROLA_HAFIF: '1' });
    assert.equal(r.kod, 1, r.cikti);
    assert.match(r.cikti, /PAROLA_HAFIF=1 yalnız testler içindir/);
    ok('PAROLA_HAFIF gerçek sunucuda reddedilir');
  }

  // 4) Deneme modunda kullanılmış kayıt dosyası gerçek sunucuda açılmaz
  {
    const dosya = path.join(gecici, 'kullanilmis.db');
    const db = openDb(dosya);
    db.kvSet('world:testModeEver', '1');
    db.close();
    const r = await calistir({ DB_FILE: dosya });
    assert.equal(r.kod, 1, r.cikti);
    assert.match(r.cikti, /deneme modunda kullanılmış/);
    ok('deneme modunda kullanılmış kayıt dosyası gerçek sunucuda açılmaz');
  }

  // 5) Bozuk ayar başlatmayı AÇIK hatayla durdurur
  {
    const r = await calistir({ PORT: 'abc' });
    assert.notEqual(r.kod, 0, r.cikti);
    assert.match(r.cikti, /Ayar hatası: PORT/);
    ok('bozuk PORT → açık ayar hatası, sıfırdan farklı çıkış');
  }

  // 6) Mutlu yol: deneme modu açılır; kısa yönetici şifresi uyarılır
  {
    const r = await calistir({ TEST_MODE: '1', ADMIN_TOKEN: 'kisa' }, { bekle: 'calisiyor' });
    assert.ok(/sunucusu çalışıyor/.test(r.cikti), r.cikti.slice(0, 400));
    assert.match(r.cikti, /DENEME MODU/);
    assert.match(r.cikti, /ADMIN_TOKEN 24 karakterden kısa/);
    // Günlük satırları makine okunur: her dolu satır geçerli JSON ve seviye/zaman taşır (kurumsal A7)
    const kayitlar = r.cikti.split(String.fromCharCode(10)).filter(s => s.trim()).map(s => JSON.parse(s));
    assert.ok(kayitlar.length >= 2 && kayitlar.every(k => k.t && ['debug', 'info', 'warn', 'error'].includes(k.sev) && typeof k.ileti === 'string'), 'her satır JSON kayıt');
    assert.ok(kayitlar.some(k => k.sev === 'warn' && /ADMIN_TOKEN/.test(k.ileti)) && kayitlar.some(k => k.sev === 'info' && /sunucusu çalışıyor/.test(k.ileti)));
    ok('deneme modu açılır; kısa ADMIN_TOKEN uyarılır; günlük satırları geçerli JSON');
  }

  // 7) Üretim doğrulaması (NODE_ENV=production): eksik/yanlış ayar başlamadan açık hata verir (kurumsal A6.2)
  {
    const r = await calistir({ NODE_ENV: 'production', PUBLIC_URL: 'http://oyun.ornek.com', ADMIN_TOKEN: 'kisa' });
    assert.equal(r.kod, 1, r.cikti);
    assert.match(r.cikti, /Üretim yapılandırması geçersiz/);
    for (const k of ['PUBLIC_URL', 'SMTP_URL', 'ADMIN_TOKEN']) assert.ok(r.cikti.includes(k), k + ' hata listesinde olmalı: ' + r.cikti);
    ok('NODE_ENV=production + eksik/yanlış ayar → hepsi listelenerek başlamaz');
  }

  // 8) Doğru üretim yapılandırması açılır; gizli bilgiler DOSYADAN (X_FILE) okunabilir
  {
    const yaz = (ad, icerik) => { const y = path.join(gecici, ad); fs.writeFileSync(y, icerik); return y; };
    const r = await calistir({ NODE_ENV: 'production', PUBLIC_URL: 'https://oyun.ornek.com', TRUST_PROXY: '1', SMTP_URL_FILE: yaz('smtp.txt', 'smtp://k:s@127.0.0.1:2525'),
      ADMIN_TOKEN_FILE: yaz('yonetici.txt', 'y'.repeat(48)) }, { bekle: 'calisiyor' });
    assert.ok(/sunucusu çalışıyor/.test(r.cikti), r.cikti.slice(0, 600));
    assert.ok(!r.cikti.includes('y'.repeat(48)), 'gizli değer çıktıya yazılmamalı');
    ok('doğru üretim yapılandırması açılır (gizli bilgiler dosyadan), değerler günlüğe yazılmaz');
  }
} finally { fs.rmSync(gecici, { recursive: true, force: true }); }

console.log(`\n${passed}/8 başlatma kilidi testi geçti`);
