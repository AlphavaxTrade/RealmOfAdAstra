// server/config.js: varsayılanlar, ortamdan okuma, bozuk değerlerde AÇIK hata (kurumsal A3.2)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, dogrula } from '../server/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

// 1) Boş ortamda güvenli varsayılanlar
{
  const c = loadConfig({});
  assert.equal(c.port, 8080);
  assert.equal(c.host, '0.0.0.0');
  assert.equal(c.testMode, false, 'deneme modu varsayılan KAPALI');
  assert.equal(c.chainEnabled, true);
  assert.equal(c.chainId, 43114);
  assert.equal(c.payoutMode, 'manual', 'anahtar yoksa ödemeler yönetici onayında');
  assert.equal(c.adminToken, '');
  assert.equal(c.trustProxy, false);
  assert.equal(c.legacyDeposits, false);
  assert.equal(c.serveDist, true);
  assert.deepEqual(c.corsOrigins, []);
  assert.ok(c.rpcUrls.length >= 2, 'birden çok zincir RPC adresi (yedekli)');
  assert.equal(c.sessionDays, 30);
  assert.equal(c.publicUrl, 'http://localhost:8080');
  ok('boş ortamda güvenli varsayılanlar');
}

// 2) Ortamdan okuma ve türetilmiş değerler
{
  const c = loadConfig({ PORT: '3000', TEST_MODE: '1', GAME_WALLET_PRIVATE_KEY: '  0xabc  ', TRUST_PROXY: '1', CHAIN_ENABLED: '0',
    CORS_ORIGINS: 'https://a.example/, https://b.example , http://yanlis adres, ftp://x', RATE_LIMIT_PER_SEC: '7',
    PARTNER_INCOME_FROM: '0x' + 'AB'.repeat(20) + ',degil', PUBLIC_URL: ' https://oyun.example ' });
  assert.equal(c.port, 3000);
  assert.equal(c.testMode, true);
  assert.equal(c.gameWalletKey, '0xabc', 'boşluklar kırpılır');
  assert.equal(c.payoutMode, 'auto', 'anahtar varsa otomatik ödeme');
  assert.equal(c.trustProxy, true);
  assert.equal(c.chainEnabled, false);
  assert.deepEqual(c.corsOrigins, ['https://a.example', 'https://b.example'], 'sondaki / atılır, geçersiz adresler elenir');
  assert.equal(c.rateLimitPerSec, 7);
  assert.deepEqual(c.partnerIncomeFrom, ['0x' + 'ab'.repeat(20)], 'adresler küçük harfe çevrilir, geçersizler elenir');
  assert.equal(c.publicUrl, 'https://oyun.example');
  assert.equal(loadConfig({ PAYOUT_MODE: 'manual', GAME_WALLET_PRIVATE_KEY: '0x1' }).payoutMode, 'manual', 'açık PAYOUT_MODE varsayılanı ezer');
  ok('ortam değişkenleri okunur; kırpma, süzme ve türetme doğru');
}

// 3) Boş değer = varsayılan; bozuk sayı = AÇIK hata (sessiz NaN değil)
{
  assert.equal(loadConfig({ PORT: '' }).port, 8080, 'boş dize varsayılan sayılır');
  for (const [anahtar, kotu] of [['PORT', 'abc'], ['PORT', '80x'], ['CHAIN_ID', 'avax'], ['SESSION_DAYS', 'NaN'], ['RATE_LIMIT_PER_SEC', 'Infinity'], ['MIN_WITHDRAW_ADA', '1,5']]) {
    assert.throws(() => loadConfig({ [anahtar]: kotu }), err => err.message.includes(anahtar), `${anahtar}=${kotu} açık hata vermeli`);
  }
  for (const p of ['-1', '65536', '1e9']) assert.throws(() => loadConfig({ PORT: p }), /PORT/, 'port aralığı 0-65535: ' + p);
  assert.equal(loadConfig({ PORT: '0' }).port, 0, '0 = işletim sistemi boş port seçer (testlerde kullanılır)');
  ok('boş değer varsayılan; bozuk sayı ve port aralığı açık hata verir');
}

// 4) Docker/systemd gizli bilgi dosyaları: X_FILE (kurumsal A6.1)
{
  const NL = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
  const dizin = fs.mkdtempSync(path.join(os.tmpdir(), 'gizli-'));
  const yaz = (ad, icerik) => { const y = path.join(dizin, ad); fs.writeFileSync(y, icerik); return y; };
  try {
    const anahtar = '0x' + 'ab'.repeat(32);   // gizli-tara: izin
    const c = loadConfig({
      GAME_WALLET_PRIVATE_KEY_FILE: yaz('anahtar', anahtar + NL),
      ADMIN_TOKEN_FILE: yaz('yonetici', ' ' + 'k'.repeat(40) + ' ' + CRLF),
      KASA_MASTER_KEY_FILE: yaz('kasa', 'cd'.repeat(32)),
      SMTP_URL_FILE: yaz('smtp', 'smtp://kullanici:sifre@posta.ornek.com:587' + NL)
    });
    assert.equal(c.gameWalletKey, anahtar, 'dosya içeriği okunur, sondaki satır sonu/boşluk kırpılır');
    assert.equal(c.adminToken, 'k'.repeat(40));
    assert.equal(c.kasaMasterKey, 'cd'.repeat(32));
    assert.equal(c.smtpUrl, 'smtp://kullanici:sifre@posta.ornek.com:587');
    assert.equal(c.payoutMode, 'auto', 'dosyadan gelen anahtar da otomatik ödeme modunu açar');
    // Normal değişken yine çalışır
    assert.equal(loadConfig({ ADMIN_TOKEN: 'x'.repeat(30) }).adminToken, 'x'.repeat(30));
    // Hata durumları: aynı anda ikisi, olmayan dosya, boş dosya
    assert.throws(() => loadConfig({ ADMIN_TOKEN: 'a', ADMIN_TOKEN_FILE: yaz('y2', 'b') }), /ADMIN_TOKEN.*ADMIN_TOKEN_FILE.*birlikte/);
    assert.throws(() => loadConfig({ KASA_MASTER_KEY_FILE: path.join(dizin, 'yok') }), /KASA_MASTER_KEY_FILE.*okunamadı/);
    assert.throws(() => loadConfig({ ADMIN_TOKEN_FILE: yaz('bos', '  ' + NL) }), /ADMIN_TOKEN_FILE.*boş/);
    // Hata mesajı gizli içeriği SIZDIRMAZ
    try { loadConfig({ ADMIN_TOKEN: 'a', ADMIN_TOKEN_FILE: yaz('y3', 'cok-gizli-icerik') }); } catch (e) { assert.ok(!e.message.includes('cok-gizli-icerik')); }
    ok('X_FILE: dosyadan gizli bilgi okunur (kırpılır), çift kaynak/eksik/boş dosya açık hata, mesaj sızdırmaz');
  } finally { fs.rmSync(dizin, { recursive: true, force: true }); }
}

// 5) Üretimde başlatma doğrulaması (kurumsal A6.2): eksik/yanlış ayar sessizce çalışmaz, başlamadan açık hata verir
{
  const iyi = { NODE_ENV: 'production', PUBLIC_URL: 'https://oyun.ornek.com', TRUST_PROXY: '1', ADMIN_TOKEN: 'a'.repeat(48), SMTP_URL: 'smtp://k:s@posta.ornek.com:587', DB_FILE: '/data/realm.db',   // gizli-tara: izin
    GAME_WALLET_PRIVATE_KEY: '0x' + 'ab'.repeat(32), KASA_MASTER_KEY: 'cd'.repeat(32), PAYMENTS_CONTRACT: '0x' + '12'.repeat(20), RESERVE_WALLET: '0x' + '34'.repeat(20), YEDEK_KLASORU: '/yedek' };   // gizli-tara: izin
  const d0 = dogrula(loadConfig(iyi), iyi);
  assert.deepEqual(d0.hatalar, [], 'tam ayarlı üretim yapılandırması hatasız: ' + d0.hatalar.join('; '));
  assert.deepEqual(d0.uyarilar, []);
  const dene = ek => { const e = { ...iyi, ...ek }; for (const k of Object.keys(ek)) if (ek[k] === null) delete e[k]; return dogrula(loadConfig(e), e); };
  const hata = (ek, desen) => { const d = dene(ek); assert.ok(d.hatalar.some(h => desen.test(h)), JSON.stringify(ek).slice(0, 60) + ' → hatalar: ' + JSON.stringify(d.hatalar)); };
  hata({ PUBLIC_URL: 'http://oyun.ornek.com' }, /PUBLIC_URL.*https/);
  hata({ ADMIN_TOKEN: 'kisa' }, /ADMIN_TOKEN.*24/);
  hata({ SMTP_URL: null }, /SMTP_URL/);
  hata({ DB_FILE: ':memory:' }, /DB_FILE/);
  hata({ KASA_MASTER_KEY: 'kisa' }, /KASA_MASTER_KEY.*64/);
  hata({ KASA_MASTER_KEY: null }, /KASA_MASTER_KEY.*PAYMENTS_CONTRACT/);
  hata({ GAME_WALLET_PRIVATE_KEY: '0x123' }, /GAME_WALLET_PRIVATE_KEY.*biçim/);
  hata({ RESERVE_WALLET: 'adres-degil' }, /RESERVE_WALLET/);
  hata({ TEST_MODE: '1' }, /TEST_MODE.*üretim/i);
  hata({ YEDEK_ANAHTAR: 'kisa' }, /YEDEK_ANAHTAR.*64/);
  hata({ TRUST_PROXY: null }, /TRUST_PROXY/);   // https ama TRUST_PROXY yok: herkes tek adres görünür, giriş kilidi küresel olur
  assert.throws(() => loadConfig({ YEDEK_ARALIK_DK: '0' }), /YEDEK_ARALIK_DK/, 'yedek aralığı 1-1440 dakika');
  // Uyarılar (başlamayı engellemez)
  assert.ok(dene({ RESERVE_WALLET: null }).uyarilar.some(u => /RESERVE_WALLET/.test(u)));
  assert.ok(dene({ ADMIN_TOKEN: null }).uyarilar.some(u => /ADMIN_TOKEN/.test(u)), 'yönetici şifresi yoksa panel kapalı: uyarı');
  assert.ok(dene({ YEDEK_KLASORU: null }).uyarilar.some(u => /YEDEK_KLASORU/.test(u)), 'yedek klasörü yoksa otomatik yedek kapalı: uyarı');
  // NODE_ENV=production DEĞİLSE (geliştirme/deneme) hiçbir üretim kuralı uygulanmaz
  const gelistirme = { PUBLIC_URL: 'http://localhost:8080', DB_FILE: ':memory:' };
  assert.deepEqual(dogrula(loadConfig(gelistirme), gelistirme), { hatalar: [], uyarilar: [] });
  ok('üretim doğrulaması: zorunlu ayarlar, biçimler, uyarılar; geliştirmede kural yok');
}

console.log(`${passed}/5 yapılandırma testi geçti`);
