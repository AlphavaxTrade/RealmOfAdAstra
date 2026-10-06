// Realm of AdAstra sunucusu — başlatma
// Kullanım: node server/index.js   (ayarlar ortam değişkenlerinden ya da server/.env dosyasından; bkz. server/.env.example)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createEngine } from './engine.js';
import { createChain } from './chain.js';
import { createWorld } from './world.js';
import { createApp } from './app.js';
import { createArena } from './arena.js';
import { createMailer } from './mailer.js';
import { createAccounts } from './accounts.js';
import { createPayments } from './payments.js';
import { createKasa } from './kasa.js';

// server/.env varsa oku (KEY=değer satırları; ortamda zaten tanımlı olanlar ezilmez)
const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const cfg = loadConfig();

// 🔒 Güvenlik kilitleri: deneme modu gerçek para ile asla birlikte çalışmaz
const stopWith = msg => { console.error('⛔ ' + msg); process.exit(1); };
if (cfg.testMode && (cfg.gameWalletKey || cfg.kasaMasterKey)) stopWith('TEST_MODE=1 iken GAME_WALLET_PRIVATE_KEY ya da KASA_MASTER_KEY kullanılamaz (deneme menüsü gerçek parayı tehlikeye atar).');
if (cfg.testMode && cfg.paymentsContract && cfg.chainId === 43114) stopWith('TEST_MODE=1 iken gerçek ağdaki ödeme sözleşmesi kullanılamaz (Fuji için CHAIN_ID=43113).');
if (cfg.adminToken && cfg.adminToken.length < 24) console.warn('⚠️  ADMIN_TOKEN 24 karakterden kısa: yönetici paneli KAPALI. (openssl rand -hex 32)');

const db = openDb(cfg.dbFile);
// Deneme modunda kullanılmış bir kayıt dosyası (hileyle eklenmiş ADA içerebilir) gerçek sunucuda açılamaz
if (cfg.testMode) db.kvSet('world:testModeEver', '1');
else if (db.kvGet('world:testModeEver') === '1') stopWith(`Bu kayıt dosyası (${cfg.dbFile}) deneme modunda kullanılmış. Gerçek sunucu için yeni bir kayıt dosyası kullan.`);

// Beklenmeyen bir hata sunucuyu düşürmesin (günlüğe yazılır)
process.on('unhandledRejection', err => console.error('Yakalanmamış hata:', err));
const engine = await createEngine(db, { testMode: cfg.testMode });
const chain = cfg.chainEnabled ? createChain(cfg) : null;
const { ethers } = await import('ethers');
const mailer = createMailer({ db, cfg });
const accounts = createAccounts({ db, cfg, mailer, verifyMessage: (m, s) => ethers.verifyMessage(m, s) });
const arena = createArena({ db, engine, botWhenEmpty: cfg.testMode });
if (cfg.testMode) console.warn('🧪 DENEME MODU: test menüsü ve bot rakip açık. Gerçek sunucuda TEST_MODE kullanmayın!');
const kasa = createKasa({ db, chain, accounts, cfg,
  priceMultiplier: () => Number(db.kvJson('world:economy', {}).priceMultiplier) || 1,
  notify: (pid, msg) => engine.mutatePlayer(pid, gs => gs.pushNotice(msg, 'info')) });
engine.setKasa(kasa);
if (!kasa.enabled) console.warn('🏦 Oyun Kasası kapalı (KASA_MASTER_KEY ve PAYMENTS_CONTRACT gerekli).');
else if (kasa.simulated) console.warn('🏦 Deneme modu: Oyun Kasası taklit (zincire bağlı değil; gerçek ADA yatırılamaz).');
const world = createWorld({ db, engine, chain, arena, accounts, kasa, mailer, cfg });
if (cfg.chainEnabled && !cfg.testMode && !/^0x[0-9a-fA-F]{40}$/.test(cfg.reserveWallet)) console.warn('🧊 RESERVE_WALLET yok: oyun cüzdanındaki fazla ADA yedek (donanım) cüzdana aktarılmaz. Önerilir!');
const payments = createPayments({ db, engine, accounts, chain, kasa, cfg });
const app = createApp({ db, engine, world, accounts, payments, kasa, arena, chain, cfg });
if (!cfg.paymentsContract) console.warn(cfg.testMode ? '💳 Ödeme sözleşmesi yok: deneme modunda cüzdan ödemesi taklit edilir.' : '💳 PAYMENTS_CONTRACT yok: cüzdandan ödeme kapalı.');
if (!cfg.smtpUrl) console.warn('📧 SMTP_URL yok: e-postalar gönderilmez, sunucu günlüğüne yazılır (deneme düzeni).');

if (!cfg.adminToken) console.warn('⚠️  ADMIN_TOKEN tanımlı değil: yönetici paneli kapalı.');
if (chain && !chain.canSend) console.warn('⚠️  GAME_WALLET_PRIVATE_KEY yok: çekimler yönetici onayı bekler (PAYOUT_MODE=manual).');

app.server().listen(cfg.port, cfg.host, () => {
  console.log(`✅ Realm of AdAstra sunucusu çalışıyor: http://localhost:${cfg.port}  (ödeme modu: ${cfg.payoutMode}, oyun cüzdanı: ${chain?.gameWallet || 'yok'})`);
});

// Dünya zamanlayıcısı: her dakika (hafta değişimi, piyasa, yatırma, ödemeler)
const loop = () => world.tick().catch(err => console.error('Zamanlayıcı hatası:', err));
setTimeout(loop, 3000);
setInterval(loop, 60000);
// Cüzdan ödemesi kurtarma taraması (2 dakikada bir)
setInterval(() => payments.scanPaid().catch(err => console.warn('Ödeme taraması:', err.message)), 120000);

const stop = () => { console.log('Sunucu kapanıyor…'); db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
