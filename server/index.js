// Realm of AdAstra sunucusu — başlatma
// Kullanım: node server/index.js   (ayarlar ortam değişkenlerinden ya da server/.env dosyasından; bkz. server/.env.example)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, dogrula } from './config.js';
import { openDb } from './db.js';
import { createEngine } from './engine.js';
import { createChain } from './chain.js';
import { createWorld } from './world.js';
import { createApp } from './app.js';
import { createArena } from './arena.js';
import { createMailer } from './mailer.js';
import { createGeriBildirim } from './geri-bildirim.js';
import { createAccounts } from './accounts.js';
import { createPayments } from './payments.js';
import { createKasa } from './kasa.js';
import { etkinCarpan } from './economy.js';
import { createKapi } from './kapi.js';
import { createPazar } from './pazar.js';
import { createSponsor } from './sponsor.js';
import { createLogger } from './log.js';
import { olumculKur } from './olumcul.js';
import { createKapanis } from './kapanis.js';
import { createUyari } from './uyari.js';
import { izlemeKur } from './izleme.js';

// server/.env varsa oku (KEY=değer satırları; ortamda zaten tanımlı olanlar ezilmez)
const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Yapılandırılmış günlük (JSON satırı; LOG_LEVEL debug|info|warn|error, LOG_FORMAT json|duz). Ayar okunamasa bile hata günlüğe yazılabilsin diye
// config'ten ÖNCE kurulur. Ölümcül hata işleyicisi de burada: açılıştaki bir çökme de kayda geçer ve süreç 1 koduyla çıkar.
const log = createLogger({ seviye: process.env.LOG_LEVEL, bicim: process.env.LOG_FORMAT });
const izleme = await izlemeKur({ dsn: process.env.SENTRY_DSN, ortam: process.env.NODE_ENV, log });
olumculKur({ log, izleme });

let cfg;
try { cfg = loadConfig(); } catch (err) { log.error('⛔ ' + err.message); process.exit(1); }

// 🔒 Güvenlik kilitleri: deneme modu gerçek para ile asla birlikte çalışmaz
const stopWith = msg => { log.error('⛔ ' + msg); process.exit(1); };
{
  const d = dogrula(cfg, process.env);   // üretimde (NODE_ENV=production) eksik/yanlış ayar → başlamadan açık hata (docs/kurumsal/ORTAM.md)
  for (const u of d.uyarilar) log.warn('⚠️  ' + u);
  if (d.hatalar.length) { log.error('⛔ Üretim yapılandırması geçersiz:', { hatalar: d.hatalar }); for (const h of d.hatalar) log.error('   - ' + h); process.exit(1); }
}
if (cfg.testMode && (cfg.gameWalletKey || cfg.kasaMasterKey)) stopWith('TEST_MODE=1 iken GAME_WALLET_PRIVATE_KEY ya da KASA_MASTER_KEY kullanılamaz (deneme menüsü gerçek parayı tehlikeye atar).');
if (cfg.testMode && cfg.paymentsContract && cfg.chainId === 43114) stopWith('TEST_MODE=1 iken gerçek ağdaki ödeme sözleşmesi kullanılamaz (Fuji için CHAIN_ID=43113).');
if (cfg.testMode && cfg.vaultContract && cfg.chainId === 43114) stopWith('TEST_MODE=1 iken gerçek ağdaki Oyun Kasası sözleşmesi kullanılamaz (Fuji için CHAIN_ID=43113).');
if (!cfg.testMode && process.env.PAROLA_HAFIF === '1') stopWith('PAROLA_HAFIF=1 yalnız testler içindir (parola özetini zayıflatır); gerçek sunucuda kullanılamaz.');
if (cfg.adminToken && cfg.adminToken.length < 24) log.warn('⚠️  ADMIN_TOKEN 24 karakterden kısa: yönetici paneli KAPALI. (openssl rand -hex 32)');

const db = openDb(cfg.dbFile);
// Deneme modunda kullanılmış bir kayıt dosyası (hileyle eklenmiş ASTRA içerebilir) gerçek sunucuda açılamaz
if (cfg.testMode) db.kvSet('world:testModeEver', '1');
else if (db.kvGet('world:testModeEver') === '1') stopWith(`Bu kayıt dosyası (${cfg.dbFile}) deneme modunda kullanılmış. Gerçek sunucu için yeni bir kayıt dosyası kullan.`);

const engine = await createEngine(db, { testMode: cfg.testMode });
const chain = cfg.chainEnabled ? createChain(cfg) : null;
const { ethers } = await import('ethers');
const mailer = createMailer({ db, cfg, log });
const uyari = createUyari({ mailer, cfg, log });
const accounts = createAccounts({ db, cfg, mailer, verifyMessage: (m, s) => ethers.verifyMessage(m, s) });
const arena = createArena({ db, engine, botWhenEmpty: cfg.testMode });
if (cfg.testMode) log.warn('🧪 DENEME MODU: test menüsü ve bot rakip açık. Gerçek sunucuda TEST_MODE kullanmayın!');
const kasa = createKasa({ db, chain, accounts, cfg, log,
  priceMultiplier: () => etkinCarpan(db.kvJson('world:economy', {})),   // bedel çarpanı: en büyüğü(fiyat çarpanı, oyun içi endeks)
  notify: (pid, msg) => engine.mutatePlayer(pid, gs => gs.pushNotice(msg, 'info')) });
engine.setKasa(kasa);
if (!kasa.enabled) log.warn('🏦 Oyun Kasası kapalı (KASA_MASTER_KEY ve PAYMENTS_CONTRACT gerekli).');
else if (kasa.simulated) log.warn('🏦 Deneme modu: Oyun Kasası taklit (zincire bağlı değil; gerçek ASTRA yatırılamaz).');
const kapi = createKapi({ db, engine, accounts, mailer, cfg, log });
const pazar = createPazar({ db, engine, log });
const sponsor = createSponsor({ db, engine, kapi, accounts, log });
const world = createWorld({ db, engine, chain, arena, accounts, kasa, mailer, kapi, pazar, sponsor, cfg, log });
if (cfg.chainEnabled && !cfg.testMode && !/^0x[0-9a-fA-F]{40}$/.test(cfg.reserveWallet)) log.warn('🧊 RESERVE_WALLET yok: oyun cüzdanındaki fazla ASTRA yedek (donanım) cüzdana aktarılmaz. Önerilir!');
const payments = createPayments({ db, engine, accounts, chain, kasa, cfg, log });
const geriBildirim = createGeriBildirim({ db, engine, kapi, mailer, cfg, log });   // 📮 "Sorun bildir" biletleri; sahibe e-posta (ADMIN_EMAIL)
const app = createApp({ db, engine, world, accounts, payments, kasa, arena, kapi, pazar, sponsor, geriBildirim, chain, cfg, log });
if (!cfg.paymentsContract) log.warn(cfg.testMode ? '💳 Ödeme sözleşmesi yok: deneme modunda cüzdan ödemesi taklit edilir.' : '💳 PAYMENTS_CONTRACT yok: cüzdandan ödeme kapalı.');
if (!cfg.smtpUrl) log.warn('📧 SMTP_URL yok: e-postalar gönderilmez, sunucu günlüğüne yazılır (deneme düzeni).');

if (!cfg.adminToken) log.warn('⚠️  ADMIN_TOKEN tanımlı değil: yönetici paneli kapalı.');
if (chain && !chain.canSend) log.warn('⚠️  GAME_WALLET_PRIVATE_KEY yok: çekimler yönetici onayı bekler (PAYOUT_MODE=manual).');

const server = app.server();
server.listen(cfg.port, cfg.host, () => {
  log.info(`✅ Realm of AdAstra sunucusu çalışıyor: http://localhost:${cfg.port}  (ödeme modu: ${cfg.payoutMode}, oyun cüzdanı: ${chain?.gameWallet || 'yok'})`);
});

// Dünya zamanlayıcısı: her dakika (hafta değişimi, piyasa, yatırma, ödemeler). Üst üste 2 tur hata verirse yöneticiye e-posta (saatte en çok 1).
let turSozu = null, taramaSozu = null, ardisikHata = 0;
const loop = () => {
  turSozu = world.tick().then(() => { ardisikHata = 0; }).catch(err => {
    ardisikHata++;
    log.error('Zamanlayıcı hatası:', err);
    izleme.yakala(err, { is: 'zamanlayici' });
    if (ardisikHata >= 2) uyari.bildir('zamanlayici', 'Dünya zamanlayıcısı üst üste hata veriyor', `Son hata: ${err?.message || err}. Ardışık hatalı tur: ${ardisikHata}`);
  });
  return turSozu;
};
const ilkTur = setTimeout(loop, 3000);
const turAraligi = setInterval(loop, 60000);
// Cüzdan ödemesi kurtarma taraması (2 dakikada bir)
const taramaAraligi = setInterval(() => { taramaSozu = payments.scanPaid().catch(err => log.warn('Ödeme taraması:', err.message)); }, 120000);

// Düzgün kapanış (SIGTERM = systemd/Docker durdurması, SIGINT = Ctrl+C): yarıdaki istekler ve tur biter, veritabanı en son kapanır
const kapanis = createKapanis({ server, db, log, beklemeMs: 10000,
  durdur: [() => clearTimeout(ilkTur), () => clearInterval(turAraligi), () => clearInterval(taramaAraligi)],
  bekleyenler: () => [turSozu, taramaSozu] });
const sinyalleKapat = ad => () => kapanis.kapat(ad).then(async () => { await izleme.bosalt(); process.exit(0); });
process.on('SIGINT', sinyalleKapat('SIGINT'));
process.on('SIGTERM', sinyalleKapat('SIGTERM'));
