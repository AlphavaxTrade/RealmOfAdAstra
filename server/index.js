// Realm of Astra sunucusu — başlatma
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
const db = openDb(cfg.dbFile);
const engine = await createEngine(db, { testMode: cfg.testMode });
const chain = cfg.chainEnabled ? createChain(cfg) : null;
const { ethers } = await import('ethers');
const mailer = createMailer({ db, cfg });
const accounts = createAccounts({ db, cfg, mailer, verifyMessage: (m, s) => ethers.verifyMessage(m, s) });
const arena = createArena({ db, engine, botWhenEmpty: cfg.testMode });
if (cfg.testMode) console.warn('🧪 DENEME MODU: test menüsü ve bot rakip açık. Gerçek sunucuda TEST_MODE kullanmayın!');
const world = createWorld({ db, engine, chain, arena, accounts, cfg });
const app = createApp({ db, engine, world, accounts, arena, chain, cfg });
if (!cfg.smtpUrl) console.warn('📧 SMTP_URL yok: e-postalar gönderilmez, sunucu günlüğüne yazılır (deneme düzeni).');

if (!cfg.adminToken) console.warn('⚠️  ADMIN_TOKEN tanımlı değil: yönetici paneli kapalı.');
if (chain && !chain.canSend) console.warn('⚠️  GAME_WALLET_PRIVATE_KEY yok: çekimler yönetici onayı bekler (PAYOUT_MODE=manual).');

app.server().listen(cfg.port, cfg.host, () => {
  console.log(`✅ Realm of Astra sunucusu çalışıyor: http://localhost:${cfg.port}  (ödeme modu: ${cfg.payoutMode}, oyun cüzdanı: ${chain?.gameWallet || 'yok'})`);
});

// Dünya zamanlayıcısı: her dakika (hafta değişimi, piyasa, yatırma, ödemeler)
const loop = () => world.tick().catch(err => console.error('Zamanlayıcı hatası:', err));
setTimeout(loop, 3000);
setInterval(loop, 60000);

const stop = () => { console.log('Sunucu kapanıyor…'); db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
