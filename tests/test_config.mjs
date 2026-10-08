// server/config.js: varsayılanlar, ortamdan okuma, bozuk değerlerde AÇIK hata (kurumsal A3.2)
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config.js';

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

console.log(`\n${passed}/3 yapılandırma testi geçti`);
