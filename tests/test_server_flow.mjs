// Sunucu (2. aşama) — uçtan uca akış, sahte zincirle (gerçek para hareket etmez)
// Giriş (cüzdan imzası) → oyun işlemleri → hile denemeleri reddedilir → yatırma → çekim talebi →
// haftalık hesaplaşma (çekim havuzu, ücret, hak kirası, ücretsiz havuz, yakım, yapımcı payı) → ödeme gönderimi
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { allocateWithdrawals, withdrawCapTokens, brakeState, faucetWeekly, nextMultiplier } from '../server/economy.js';

let passed = 0;
const ok = name => { passed++; console.log(`✅ ${name}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── 1) Saf kurallar ──────────────────────────────────────────────────────
{
  const cap = withdrawCapTokens({ graduated: false, curveSupply: 2.1325e9 });
  assert.ok(near(cap, 2.1325e9 * (1 - Math.sqrt(0.98)), 1), 'Eğri: %2 fiyat düşüşü miktarı');
  const capDex = withdrawCapTokens({ graduated: true, poolTokenReserve: 1e9 });
  assert.ok(near(capDex, 1e9 * (1 / Math.sqrt(0.98) - 1), 1));

  // A: puan 100, 1000 ister · B: puan 100, hiç istemez (hakkını kiraya verir) · C: puan 200, 300 ister
  const al = allocateWithdrawals([
    { id: 'A', requested: 1000, score: 100 },
    { id: 'B', requested: 0, score: 100 },
    { id: 'C', requested: 300, score: 200 }
  ], 1000);
  const r = Object.fromEntries(al.rows.map(x => [x.id, x]));
  assert.ok(near(r.A.own, 250) && near(r.C.own, 500));
  assert.ok(near(r.C.granted, 300) && near(r.C.extra, 0), 'C kendi hakkının içinde');
  // Kullanılmayan: B 250 + C 200 = 450; A'nın fazladan ihtiyacı 750 → 450 kiralar
  assert.ok(near(r.A.extra, 450) && near(r.A.total, 700) && near(r.A.returned, 300));
  assert.ok(near(r.A.fee, 700 * 0.03) && near(r.A.rent, 450 * 0.015));
  const rent = Object.fromEntries(al.rentPayouts.map(x => [x.id, x.amount]));
  assert.ok(near(rent.B, 6.75 * 250 / 450) && near(rent.C, 6.75 * 200 / 450), 'Kira kullanılmayan paya göre');
  assert.ok(near(al.totals.feeToUbi, 21 * 0.7 + 9 * 0.7) && near(al.totals.feeBurn, 30 * 0.3));
  const brakeFee = allocateWithdrawals([{ id: 'A', requested: 100, score: 1 }], 1000, { brake: true });
  assert.ok(near(brakeFee.rows[0].fee, 6), 'Frende ücret %6');

  const day = 86400000, t0 = Date.UTC(2026, 9, 1);
  const hist = Array.from({ length: 30 }, (_, i) => ({ at: t0 + i * day, mcapUsd: i < 27 ? 10000 : 7000 }));
  const b1 = brakeState(hist, {}, t0 + 29 * day);
  assert.equal(b1.on, true, 'Zirvenin %75 altı: fren açılır');
  const hist2 = hist.concat([{ at: t0 + 30 * day, mcapUsd: 9500 }, { at: t0 + 31 * day, mcapUsd: 9500 }, { at: t0 + 32 * day, mcapUsd: 9500 }]);
  assert.equal(brakeState(hist2, b1, t0 + 32 * day).on, false, 'Zirvenin %85 üstü: fren kapanır');

  const f = faucetWeekly({ mcapUsd: 20000, priceUsd: 2e-7, freePlayers: 100, questPool: 1e12 });
  assert.ok(near(f.usdPerPlayerMonth, 2, 0.01), '20 bin $ piyasa değeri, 100 kişi: kişi başı ayda 2 $');
  assert.ok(near(faucetWeekly({ mcapUsd: 1e9, priceUsd: 1, freePlayers: 10, questPool: 1e12 }).usdPerPlayerMonth, 100, 0.05), 'Kişi başı en fazla 100 $ (kuruş yuvarlaması)');

  assert.equal(nextMultiplier({ current: 1, priceUsd: 0.5, launchPriceUsd: 1, runwayMonths: 24 }), 1.05, 'Fiyat yarıya düşünce çarpan haftada %5 artar');
  assert.equal(nextMultiplier({ current: 1, priceUsd: 4, launchPriceUsd: 1, runwayMonths: 6 }), 1, 'Kasa ömrü 12 aydan kısa: çarpan düşmez');
  assert.equal(nextMultiplier({ current: 1, priceUsd: 4, launchPriceUsd: 1, runwayMonths: 24 }), 0.95);
  ok('Saf kurallar: çekim havuzu, hak kirası, ücret, fren, ücretsiz havuz, çarpan');
}

// ── 2) Uçtan uca ─────────────────────────────────────────────────────────
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test', serveDist: false, payoutMode: 'auto', rateLimitPerSec: 1000, weeklySendCapAda: 5e7, minWithdrawAda: 100 };
const db = openDb(':memory:');
const engine = await createEngine(db);
const GAME_WALLET = '0x' + '11'.repeat(20);
const sent = [];
let depositLogs = [];
const chain = {
  gameWallet: GAME_WALLET, canSend: true,
  async readMarket() { return { at: Date.now(), graduated: false, supply: 2.1325e9, dead: 1.65e8, curveSupply: 2.1325e9, priceAvax: 1.76e-8, avaxUsd: 11.3, priceUsd: 2e-7, mcapUsd: 400, walletAda: 2e8 }; },
  async latestBlock() { return 1000; },
  async scanDeposits() { const l = depositLogs; depositLogs = []; return l; },
  async sendAda(to, amount) { sent.push({ to, amount }); return '0xhash' + sent.length; }
};
const world = createWorld({ db, engine, chain, cfg, log: { warn() {}, error() {} } });
const app = createApp({ db, engine, world, chain, cfg, verifyLogin: (m, s) => ethers.verifyMessage(m, s).toLowerCase(), log: { error() {} } });
const server = app.server().listen(0);
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, body, token) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
async function login(wallet) {
  const n = await call('POST', '/api/auth/nonce', { address: wallet.address });
  const signature = await wallet.signMessage(n.body.message);
  const v = await call('POST', '/api/auth/verify', { address: wallet.address, signature });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return v.body.token;
}

try {
  // Giriş
  const alice = ethers.Wallet.createRandom(), bob = ethers.Wallet.createRandom(), eve = ethers.Wallet.createRandom();
  const n = await call('POST', '/api/auth/nonce', { address: eve.address });
  const forged = await bob.signMessage(n.body.message);
  assert.equal((await call('POST', '/api/auth/verify', { address: eve.address, signature: forged })).status, 401, 'Başkasının imzası geçmez');
  const tA = await login(alice), tB = await login(bob);
  assert.equal((await call('GET', '/api/state')).status, 401, 'Girişsiz istek reddedilir');
  const s0 = await call('GET', '/api/state', null, tA);
  assert.equal(s0.status, 200);
  assert.equal(s0.body.player.adAstraBalance, 250, 'Başlangıç ADA\'sı görev kasasından');
  ok('Cüzdan imzasıyla giriş; sahte imza ve girişsiz istek reddediliyor');

  // Oyun işlemleri ve hile denemeleri
  const ex = await call('POST', '/api/action', { name: 'startExpedition', args: ['wood'] }, tA);
  assert.equal(ex.status, 200);
  assert.ok(ex.body.result.success, ex.body.result.message);
  assert.ok(ex.body.player.activeExpeditions.wood, 'Sefer sunucuda başladı');
  for (const [name, args] of [['cheatAddResources', [0, 0, 0, 0, 1e9]], ['setDevAdAstra', [1e9]], ['addDevAdAstra', [1e9]], ['vanillaReset', []], ['__proto__', []], ['constructor', []]]) {
    const r = await call('POST', '/api/action', { name, args }, tA);
    assert.equal(r.status, 400, `${name} reddedilmeli`);
  }
  const freeBot = await call('POST', '/api/action', { name: 'buyTavernaAutomationBot', args: [99999] }, tA);
  assert.equal(freeBot.body.result.success, false, 'İzin verilmeyen bot paketi reddedilir');
  const badArg = await call('POST', '/api/action', { name: 'marketSell', args: ['adAstra', 5] }, tA);
  assert.equal(badArg.status, 400, 'Geçersiz hammadde adı reddedilir');
  const itemObj = await call('POST', '/api/action', { name: 'upgradeEquipment', args: [{ slot: 'weapon', level: 99 }] }, tA);
  assert.equal(itemObj.status, 400, 'Tarayıcı eşya nesnesi gönderemez');
  const bal = (await call('GET', '/api/state', null, tA)).body.player.adAstraBalance;
  assert.ok(bal <= 250, 'Hile denemeleri bakiyeyi artırmadı');
  ok('Beyaz liste: hile/test düğmeleri, bedava bot, geçersiz bilgi ve sahte eşya reddediliyor');

  // Yatırma (Bob yatırır; Alice ücretsiz oyuncu kalır)
  const bobStart = (await call('GET', '/api/state', null, tB)).body.player.adAstraBalance;
  depositLogs = [{ txHash: '0xdep1', logIndex: 0, from: bob.address.toLowerCase(), amount: 50000, block: 900 }];
  await world.scanDeposits();
  const sB = await call('GET', '/api/state', null, tB);
  assert.equal(sB.body.player.adAstraBalance, bobStart + 50000);
  assert.ok(sB.body.player.lockedAda < 250, 'Yatırılan ADA serbest (kilitsiz)');
  await world.scanDeposits();
  assert.equal((await call('GET', '/api/state', null, tB)).body.player.adAstraBalance, bobStart + 50000, 'Aynı yatırma iki kez işlenmez');
  ok('Yatırma zincirden bulunup bir kez, serbest bakiye olarak işleniyor');

  // Katkı puanı: Bob harcar (asker alır), Alice az harcar
  const buy = await call('POST', '/api/action', { name: 'buySoldierUnit', args: [] }, tB);
  assert.ok(buy.body.result.success, buy.body.result.message);
  // Çekim talebi
  const tooMuch = await call('POST', '/api/withdraw', { amount: 1e9 }, tB);
  assert.equal(tooMuch.body.success, false, 'Serbest bakiyeden fazlası istenemez');
  const wreq = await call('POST', '/api/withdraw', { amount: 30000 }, tB);
  assert.ok(wreq.body.success, wreq.body.message);
  const afterReq = (await call('GET', '/api/state', null, tB)).body.player;
  assert.equal(afterReq.pendingWithdrawAda, 30000);
  const spendPending = await call('POST', '/api/withdraw', { amount: afterReq.adAstraBalance + 1 }, tB);
  assert.equal(spendPending.body.success, false, 'Çekime ayrılan ADA tekrar kullanılamaz');
  ok('Çekim talebi serbest bakiyeden ayrılıyor, fazlası reddediliyor');

  // Ortak piyango: iki oyuncu bilet alır; kasa ve toplam bilet ortak
  const poolBefore = engine.lottery().pool;
  const lA = await call('POST', '/api/action', { name: 'buyLotteryTickets', args: [1] }, tA);
  assert.ok(lA.body.result.success, lA.body.result.message);
  const lB = await call('POST', '/api/action', { name: 'buyLotteryTickets', args: [3] }, tB);
  assert.ok(lB.body.result.success, lB.body.result.message);
  assert.equal(engine.lottery().totalTickets, 4, 'Ortak toplam bilet 4');
  assert.ok(engine.lottery().pool > poolBefore, 'Bilet parası ortak kasaya girdi');
  assert.equal(lB.body.player.lotteryPool, engine.lottery().pool, 'Oyuncu ortak kasayı görüyor');
  ok('Ortak piyango: biletler ve kasa bütün oyuncular için tek');

  // Haftalık hesaplaşma: hafta değişir
  const aliceBeforeWeek = (await call('GET', '/api/state', null, tA)).body.player.adAstraBalance;
  await world.tick();                                      // ilk tur: hafta kaydı
  const epochBefore = engine.globalPool.state.epochId;
  engine.globalPool.state.epochEndTime = Date.now() - 1000;
  engine.globalPool.saveState();
  await world.tick();
  assert.equal(engine.globalPool.state.epochId, epochBefore + 1, 'Yeni hafta açıldı');
  const summary = world.econ().lastWeekly;
  assert.ok(summary && summary.epoch === epochBefore, 'Kapanan hafta hesaplaşıldı');
  const wB = await call('GET', '/api/wallet', null, tB);
  const hist = wB.body.withdraw.history[0];
  assert.ok(hist && hist.total > 0, 'Bob\'un çekimi karşılandı');
  assert.ok(near(hist.net, hist.total - hist.fee - hist.rent, 1e-6));
  const payB = sent.find(s => s.to.toLowerCase() === bob.address.toLowerCase());
  assert.ok(payB && near(payB.amount, Math.floor(hist.net * 100) / 100, 0.01), 'Net tutar Bob\'un cüzdanına gönderildi');
  const bAfter = (await call('GET', '/api/state', null, tB)).body.player;
  assert.equal(bAfter.pendingWithdrawAda, 0);
  assert.ok(near(bAfter.withdrawnAda, hist.total));
  ok('Haftalık hesaplaşma: çekim havuzdan karşılanıp zincire gönderildi, ücret ve kira düşüldü');

  // Ücretsiz oyuncu havuzu Alice'e (hiç yatırma yapmamış, bu hafta oynamış)
  assert.equal(summary.faucet.players, 1, 'Yalnız Alice ücretsiz oyuncu');
  const aAfter = (await call('GET', '/api/state', null, tA)).body.player;
  assert.ok(summary.faucet.perPlayer > 0 && aAfter.adAstraBalance >= aliceBeforeWeek + summary.faucet.perPlayer - 1, 'Alice ücretsiz havuz payını aldı');
  // Yakım ve yapımcı payı zincire
  const burnTx = sent.find(s => s.to === cfg.deadAddress);
  const creatorTx = sent.find(s => s.to === engine.GAME_CONFIG.CREATOR_WALLET_ADDRESS);
  assert.ok(burnTx && burnTx.amount > 0, 'Yakım ölü adrese gönderildi');
  assert.ok(creatorTx && creatorTx.amount > 0, 'Yapımcı payı 0x58DB… cüzdanına gönderildi');
  assert.equal(creatorTx.to, '0x58DBCF66bdd7BfA9da98aDba1965b3794321087C');
  ok('Ücretsiz oyuncu payı, yakım ve yapımcı payı dağıtıldı');

  // Piyango çekilişi: tek kazanan, ödülünü çeker
  const lot = summary.lottery;
  const addrs = { [alice.address.toLowerCase()]: tA, [bob.address.toLowerCase()]: tB };
  assert.ok(lot && addrs[lot.winner], 'Kazanan gerçek oyunculardan biri');
  const winTok = addrs[lot.winner];
  const loseTok = winTok === tA ? tB : tA;
  const winSt = (await call('GET', '/api/state', null, winTok)).body.player;
  const loseSt = (await call('GET', '/api/state', null, loseTok)).body.player;
  assert.ok(winSt.lotteryPendingPayout > 0 && winSt.lotteryTickets === 0, 'Kazananın ödülü bekliyor, biletleri kilitlendi');
  assert.ok(!(loseSt.lotteryPendingPayout > 0) && loseSt.lotteryTickets > 0, 'Kaybedenin biletleri sonraki haftaya devretti');
  const claim = await call('POST', '/api/action', { name: 'claimWinnerLotteryPayout', args: [] }, winTok);
  assert.ok(claim.body.result.success, claim.body.result.message);
  assert.ok(near(claim.body.player.adAstraBalance - winSt.adAstraBalance, winSt.lotteryPendingPayout, 0.01), 'Ödül bakiyeye geçti');
  ok('Haftalık ortak çekiliş: tek kazanan, kaybedenin biletleri devrediyor, ödül çekiliyor');

  // Tekrar çalıştırma çift ödeme yapmaz
  const nSent = sent.length;
  await world.tick();
  await world.processPayouts({ force: true });
  assert.equal(sent.length, nSent, 'Aynı hafta ikinci kez ödenmez');
  // Durdurma anahtarı
  const unauth = await call('POST', '/api/admin/pause', { paused: true }, tA);
  assert.equal(unauth.status, 401, 'Oyuncu yönetici komutu kullanamaz');
  const p = await call('POST', '/api/admin/pause', { paused: true }, 'yonetici-test');
  assert.equal(p.body.paused, true);
  const wPaused = await call('POST', '/api/withdraw', { amount: 100 }, tA);
  assert.equal(wPaused.body.success, false, 'Durdurulunca çekim talebi alınmaz');
  const st = await call('GET', '/api/admin/status', null, 'yonetici-test');
  assert.equal(st.status, 200);
  assert.ok(st.body.players.total >= 2);
  ok('Çift ödeme yok; durdurma anahtarı ve yönetici yetkisi çalışıyor');
} finally {
  server.close();
}
console.log(`\n${passed} sunucu kontrolü geçti.`);
process.exit(0);
