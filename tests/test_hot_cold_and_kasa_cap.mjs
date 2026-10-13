// Sunucu ele geçirilirse kayıp küçük kalsın (kullanıcı kararı 4 Ekim 2026):
//  1) Oyun Kasası üst sınırı: fazlası oyuncunun bağlı cüzdanına kendiliğinden döner
//  2) Oyun cüzdanında (sıcak) yalnız bir haftalık ihtiyaç kalır; fazlası yedek (donanım) cüzdana gider, azalınca uyarı
//  3) Ödeme sözleşmesinin sahibi sıcak cüzdansa panel uyarır
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';
import { createKasa } from '../server/kasa.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const db = openDb(':memory:');
const E = await createEngine(db);
const RESERVE = '0x' + 'cd'.repeat(20);
const GAME = '0x' + '11'.repeat(20);
const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true, kasaCapDays: 30, kasaCapFloorAda: 20000,
  reserveWallet: RESERVE, hotWalletWeeks: 1, hotWalletMinAda: 0, adminEmail: 'yonetici@ornek.com', payoutMode: 'auto' };
const mailer = createMailer({ db, cfg, log: { log() {} } });
const accounts = createAccounts({ db, cfg, mailer, verifyMessage: (m, s) => ethers.verifyMessage(m, s) });
const lastLink = kind => new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(db.kvJson('dev:outbox', [])[0].text)[1];
async function newPlayer(email, withWallet) {
  const r = await accounts.register(email, 'gizli-sifre-123');
  await accounts.verifyEmail(lastLink('verify'), 'gizli-sifre-123');
  if (withWallet) {
    const w = ethers.Wallet.createRandom();
    await accounts.walletLink(r.playerId, await w.signMessage(accounts.walletNonce(r.playerId, w.address).message));
    accounts.walletConfirm(lastLink('wallet'));
  }
  E.withPlayer(r.playerId, () => null);
  return r.playerId;
}

// ── 1) Kasa üst sınırı ──────────────────────────────────────────────────
{
  const notes = [];
  let mult = 1;
  const kasa = createKasa({ db, accounts, cfg, log: { warn() {} }, priceMultiplier: () => mult, notify: (p, m) => notes.push([p, m]) });
  const a = await newPlayer('kasa-a@ornek.com', true);
  const b = await newPlayer('kasa-b@ornek.com', false);
  kasa.simulateDeposit(a, 100000, 0.1);
  kasa.simulateDeposit(b, 100000, 0.1);
  assert.equal(kasa.capOf(a), 20000, 'Harcaması olmayan yeni oyuncuda alt sınır geçerli');
  assert.equal(kasa.enforceCaps(), 1, 'Yalnız bağlı cüzdanı olan oyuncu için iade açıldı');
  assert.equal(kasa.enforceCaps(), 0, 'Bekleyen iade varken ikinci iade açılmaz');
  await kasa.processOps();
  assert.ok(near(kasa.status(a).ada, 20000), 'Fazla (80.000 ASTRA) bağlı cüzdana döndü, kasada sınır kadar kaldı');
  assert.ok(kasa.status(a).ops.some(o => o.kind === 'return_ada' && o.status === 'sent'));
  assert.ok(notes.length === 1 && notes[0][0] === a && /geri gönderiliyor/.test(notes[0][1]), 'Oyuncuya bildirim');
  const sb = kasa.status(b);
  assert.ok(near(sb.ada, 100000) && sb.overCap && !sb.hasWallet, 'Cüzdansız oyuncunun parası kasada kalır, panel uyarır');
  // Sınır günlük harcamayla büyür: günde 2.000 ASTRA harcayan oyuncunun sınırı ≈ 30 günlük harcaması
  db.raw.prepare('UPDATE kasa SET created = ? WHERE player = ?').run(Date.now() - 14 * 86400000, a);
  for (let d = 0; d < 14; d++) db.raw.prepare('INSERT INTO kasa_usage (player, day, ada) VALUES (?, ?, ?)').run(a, new Date(Date.now() - d * 86400000 + 3 * 3600000).toISOString().slice(0, 10), 2000);
  assert.ok(near(kasa.capOf(a), 60000, 1), 'Sınır = günlük ortalama × 30');
  kasa.simulateDeposit(a, 41000, 0);                 // 61.000: sınırın %5'inden az fazla → kırıntı için işlem açılmaz
  assert.equal(kasa.enforceCaps(), 0, 'Küçük fazlalık için işlem açılmaz');
  mult = 5;                                          // fiyat çarpanı alt sınırı da büyütür
  assert.equal(kasa.capOf(b), 100000);
  ok('Oyun Kasası üst sınırı: fazlası bağlı cüzdana döner, alt sınır, harcamaya göre büyüme, kırıntı yok');
}

// ── 2) Sıcak / soğuk cüzdan ─────────────────────────────────────────────
{
  let walletAda = 5e6;
  let owner = GAME;
  const chain = {
    gameWallet: GAME, canSend: true,
    async readMarket() { return { at: Date.now(), graduated: false, supply: 2.1e9, dead: 1e8, curveSupply: 2.1e9, priceAvax: 1e-8, avaxUsd: 10, priceUsd: 2e-7, mcapUsd: 400, walletAda }; },
    async readPaymentsAdmin() { return { owner: owner.toLowerCase(), pendingOwner: '0x' + '0'.repeat(40), paused: false, treasury: GAME, feeReceiver: RESERVE }; }
  };
  const world = createWorld({ db, engine: E, chain, accounts, mailer, cfg: { ...cfg, testMode: false, contractOwner: '' }, log: { warn() {}, error() {} } });
  const ep = Number(E.globalPool.state.epochId);
  // Geçmiş: son haftalarda en yüksek haftalık gönderim 1.000.000 ASTRA
  db.q.payoutAdd.run(ep - 1, 'withdraw', '0x' + 'aa'.repeat(20), 800000, Date.now());
  db.q.payoutAdd.run(ep - 1, 'burn', cfg.deadAddress, 200000, Date.now());
  db.q.payoutAdd.run(ep - 2, 'withdraw', '0x' + 'aa'.repeat(20), 300000, Date.now());
  db.raw.exec("UPDATE payouts SET status = 'sent'");
  const st = await world.checkHotWallet();
  assert.equal(st.weekly, 1000000, 'Haftalık ihtiyaç = son haftaların en yüksek gönderimi');
  assert.equal(st.swept, 4000000, 'Fazlası (4.000.000 ASTRA) yedek cüzdana');
  const row = db.raw.prepare("SELECT * FROM payouts WHERE kind = 'reserve'").get();
  assert.ok(row && row.address === RESERVE && row.amount === 4000000 && row.status === 'pending', 'Aktarım, güvenli ödeme sırasına girdi');
  assert.equal((await world.checkHotWallet()).swept, 0, 'Bekleyen aktarım varken ikincisi açılmaz');
  // Bu haftaki çekim talepleri ihtiyaca eklenir
  db.raw.exec("UPDATE payouts SET status = 'sent' WHERE kind = 'reserve'");
  walletAda = 1.5e6;
  db.raw.prepare('UPDATE players SET pending_withdraw = 2000000 WHERE address = (SELECT address FROM players LIMIT 1)').run();
  const low = await world.checkHotWallet();
  assert.equal(low.need, 2000000, 'Bekleyen talepler en yüksek geçmiş haftayı aşınca ihtiyaç onlar');
  assert.ok(low.low && low.swept === 0, 'Az: aktarım yok, uyarı var');
  assert.ok(db.kvJson('dev:outbox', []).some(m => m.to === 'yonetici@ornek.com' && /azaldı/.test(m.subject) && /500\.000/.test(m.text)), 'Yöneticiye "yedek cüzdandan 500.000 ASTRA gönder" e-postası');
  const mails = db.kvJson('dev:outbox', []).length;
  await world.checkHotWallet();
  assert.equal(db.kvJson('dev:outbox', []).length, mails, 'Uyarı e-postası günde en çok bir kez');
  ok('Sıcak/soğuk cüzdan: fazlası yedek cüzdana, ihtiyaç hesabı, azalınca yöneticiye uyarı');

  // ── 3) Sözleşme sahibi denetimi
  assert.equal(low.contract.ownerIsHot, true, 'Sahip oyun cüzdanıysa SICAK uyarısı');
  assert.equal(low.contract.ownerOk, false);
  owner = '0x' + 'ee'.repeat(20);
  const w2 = createWorld({ db, engine: E, chain, accounts, mailer, cfg: { ...cfg, testMode: false, contractOwner: owner }, log: { warn() {}, error() {} } });
  const s2 = await w2.checkHotWallet();
  assert.equal(s2.contract.ownerOk, true, 'Sahip beklenen donanım cüzdanı');
  ok('Ödeme sözleşmesinin sahibi denetleniyor (sıcak cüzdan uyarısı)');

  // ── 4) Bekleyen hazine/komisyon adresi değişikliği (24 saat gecikmeli, K5): panelde görünür, yöneticiye bir kez e-posta
  const yeni = '0x' + '66'.repeat(20);
  const atAnl = Date.now() + 20 * 3600000;
  const chain2 = { ...chain, async readPaymentsAdmin() { return { owner, pendingOwner: '0x' + '0'.repeat(40), paused: false, treasury: GAME, feeReceiver: RESERVE, configPending: { treasury: yeni, feeReceiver: RESERVE, at: atAnl } }; } };
  const w3 = createWorld({ db, engine: E, chain: chain2, accounts, mailer, cfg: { ...cfg, testMode: false, contractOwner: owner }, log: { warn() {}, error() {} } });
  const s3 = await w3.checkHotWallet();
  assert.equal(s3.contract.configPending.treasury, yeni, 'bekleyen öneri durum bilgisinde');
  assert.ok(db.kvJson('dev:outbox', []).some(m => m.to === 'yonetici@ornek.com' && /adres değişikliği önerildi/.test(m.subject) && m.text.includes(yeni)), 'yöneticiye "adres değişikliği önerildi" e-postası');
  await w3.checkHotWallet();
  assert.equal(db.kvJson('dev:outbox', []).filter(m => /adres değişikliği önerildi/.test(m.subject)).length, 1, 'aynı öneri için e-posta tek kez');
  ok('Bekleyen hazine/komisyon adresi değişikliği panele yansır ve yöneticiye tek kez e-postalanır');
}

console.log(`\n${passed} sıcak/soğuk cüzdan ve kasa sınırı kontrolü geçti.`);
process.exit(0);
