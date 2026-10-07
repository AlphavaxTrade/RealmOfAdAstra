// Sunucu (2. aşama) — uçtan uca akış, sahte zincirle (gerçek para hareket etmez)
// Hesap (e-posta/şifre, doğrulama, cüzdan bağlama + 48 saat kuralı) → oyun işlemleri → hile denemeleri reddedilir → yatırma → çekim talebi →
// haftalık hesaplaşma (çekim havuzu, ücret, hak kirası, ücretsiz havuz, yakım, yapımcı payı) → ödeme gönderimi
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts, totpCode } from '../server/accounts.js';
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
const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: false, payoutMode: 'auto', rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000, weeklySendCapAda: 5e7, minWithdrawAda: 100, legacyDeposits: true };
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
let now = Date.now();
const clock = () => now;
const mailer = createMailer({ db, cfg, log: { log() {} } });
const accounts = createAccounts({ db, cfg, mailer, clock, verifyMessage: (m, s) => ethers.verifyMessage(m, s) });
const world = createWorld({ db, engine, chain, accounts, cfg, log: { warn() {}, error() {} } });
const app = createApp({ db, engine, world, accounts, chain, cfg, log: { error() {} } });
const lastLink = kind => { const m = db.kvJson('dev:outbox', [])[0]; const r = new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(m ? m.text : ''); return r && r[1]; };
const server = app.server().listen(0);
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, p, body, token) => {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
async function register(email) {
  const r = await call('POST', '/api/account/register', { email, password: 'gizli-sifre-123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(!r.body.token && !r.body.playerId, 'Kayıtta oturum açılmaz (e-posta onayıyla girilir)');
  const v = await call('POST', '/api/account/verify', { token: lastLink('verify') });
  assert.equal(v.status, 200, 'E-posta doğrulandı');
  assert.ok(v.body.token, 'Onay bağlantısı oyuncuyu oyuna sokar');
  return { token: v.body.token, pid: v.body.playerId };
}
async function linkWallet(token, wallet) {
  const n = await call('POST', '/api/account/wallet/nonce', { address: wallet.address }, token);
  const l = await call('POST', '/api/account/wallet/link', { signature: await wallet.signMessage(n.body.message) }, token);
  assert.equal(l.status, 200, JSON.stringify(l.body));
  const c = await call('POST', '/api/account/wallet/confirm', { token: lastLink('wallet') });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  return c.body;
}

try {
  // Hesap: kayıt, hatalı bilgiler, giriş, kilit, şifre sıfırlama
  const alice = ethers.Wallet.createRandom(), bob = ethers.Wallet.createRandom(), bob2 = ethers.Wallet.createRandom(), eve = ethers.Wallet.createRandom();
  assert.equal((await call('POST', '/api/account/register', { email: 'bozuk', password: 'gizli-sifre-123' })).status, 400, 'Geçersiz e-posta');
  assert.equal((await call('POST', '/api/account/register', { email: 'k@s.com', password: 'kisa' })).status, 400, 'Kısa şifre');
  const { token: tA, pid: pidA } = await register('alice@ornek.com');
  const { token: tB, pid: pidB } = await register('bob@ornek.com');
  // Kayıt ekranı e-postanın kayıtlı olup olmadığını ele vermez: aynı yanıt, yeni hesap açılmaz, sahibine uyarı gider
  const accCount = () => db.raw.prepare('SELECT COUNT(*) AS n FROM accounts').get().n;
  const nBefore = accCount();
  const dupReg = await call('POST', '/api/account/register', { email: 'ALICE@ornek.com', password: 'baska-sifre-999' });
  const fresh = await call('POST', '/api/account/register', { email: 'yeni@ornek.com', password: 'gizli-sifre-123' });
  assert.equal(dupReg.status, 200);
  assert.deepEqual(Object.keys(dupReg.body).sort(), Object.keys(fresh.body).sort(), 'Var olan ve yeni e-postaya aynı yanıt');
  assert.equal(dupReg.body.message, fresh.body.message);
  assert.equal(accCount(), nBefore + 1, 'Aynı e-postayla ikinci hesap açılmadı');
  assert.ok(db.kvJson('dev:outbox', []).some(m => m.to === 'alice@ornek.com' && /zaten bir hesab/.test(m.subject)), 'Hesap sahibine "zaten hesabın var" e-postası gitti');
  // Doğrulanmamış hesap şifreyle giremez ve yanıt yanlış şifreyle aynıdır
  const unv = await call('POST', '/api/account/login', { email: 'yeni@ornek.com', password: 'gizli-sifre-123' });
  const wrong = await call('POST', '/api/account/login', { email: 'yeni@ornek.com', password: 'yanlis-sifre-0' });
  assert.equal(unv.status, 401);
  assert.equal(unv.body.error, wrong.body.error, 'Doğrulanmamış hesap ile yanlış şifre aynı yanıtı alır');
  const rv = await call('POST', '/api/account/resend', { email: 'yeni@ornek.com' });
  const rvNone = await call('POST', '/api/account/resend', { email: 'hic-yok@ornek.com' });
  assert.equal(rv.body.message, rvNone.body.message, 'Yeniden gönderme de hesap varlığını ele vermez');
  assert.equal((await call('POST', '/api/account/login', { email: 'alice@ornek.com', password: 'yanlis-sifre' })).status, 401, 'Yanlış şifre');
  assert.equal((await call('POST', '/api/account/login', { email: 'alice@ornek.com', password: 'gizli-sifre-123' })).status, 200, 'Doğru şifre');
  for (let i = 0; i < 10; i++) await call('POST', '/api/account/login', { email: 'eve@ornek.com', password: 'tahmin' + i });
  const lockedLogin = await call('POST', '/api/account/login', { email: 'eve@ornek.com', password: 'tahmin' });
  assert.ok(/15 dakika/.test(lockedLogin.body.error), '10 hatalı denemeden sonra kilit');
  const fg = await call('POST', '/api/account/forgot', { email: 'yok@ornek.com' });
  assert.equal(fg.status, 200, 'Olmayan e-posta için de aynı yanıt (hesap varlığı ele verilmez)');
  await call('POST', '/api/account/forgot', { email: 'bob@ornek.com' });
  const rs = await call('POST', '/api/account/reset', { token: lastLink('reset'), password: 'yeni-sifre-456' });
  assert.equal(rs.status, 200);
  assert.equal((await call('GET', '/api/account/me', null, tB)).status, 401, 'Şifre sıfırlanınca eski oturumlar kapanır');
  const relog = await call('POST', '/api/account/login', { email: 'bob@ornek.com', password: 'yeni-sifre-456' });
  const tB2 = relog.body.token;
  ok('Hesap: kayıt, doğrulama, hatalı girişler, kilit, şifre sıfırlama');
  ok('Kayıt ekranı e-postanın kayıtlı olup olmadığını ele vermiyor; doğrulanmamış hesap giremiyor');

  // 🛡️ İki adımlı doğrulama (Muhafız Mührü)
  {
    const { token: tC } = await register('carol@ornek.com');
    const step = () => Math.floor(now / 30000);
    const su = await call('POST', '/api/account/2fa/setup', null, tC);
    assert.equal(su.status, 200);
    assert.ok(/^otpauth:\/\/totp\//.test(su.body.uri) && su.body.qr.startsWith('data:image/svg+xml;base64,'), 'Kare kod ve uygulama bağlantısı');
    assert.equal((await call('POST', '/api/account/2fa/enable', { code: '000000' }, tC)).status, 400, 'Yanlış kodla açılmaz');
    const en = await call('POST', '/api/account/2fa/enable', { code: totpCode(su.body.secret, step()) }, tC);
    assert.equal(en.status, 200, JSON.stringify(en.body));
    assert.equal(en.body.backupCodes.length, 10, '10 yedek kod');
    assert.ok(db.kvJson('dev:outbox', []).some(m => m.to === 'carol@ornek.com' && /AÇILDI/.test(m.subject)), 'Açılınca e-posta bildirimi');
    assert.equal((await call('GET', '/api/account/me', null, tC)).body.twoFactor, true);
    // Giriş: şifre doğru → kod istenir; aynı kod ikinci kez kullanılamaz
    const l1 = await call('POST', '/api/account/login', { email: 'carol@ornek.com', password: 'gizli-sifre-123' });
    assert.ok(l1.body.need2fa && l1.body.ticket && !l1.body.token, 'Şifre tek başına yetmez');
    assert.equal((await call('POST', '/api/account/login2fa', { ticket: l1.body.ticket, code: totpCode(su.body.secret, step()) })).status, 401, 'Az önce kullanılan kod tekrar kullanılamaz');
    now += 30000;
    const l2 = await call('POST', '/api/account/login2fa', { ticket: l1.body.ticket, code: totpCode(su.body.secret, step()) });
    assert.equal(l2.status, 200, JSON.stringify(l2.body));
    const tC2 = l2.body.token;
    // Yedek kod bir kez geçer
    const l3 = await call('POST', '/api/account/login', { email: 'carol@ornek.com', password: 'gizli-sifre-123' });
    assert.equal((await call('POST', '/api/account/login2fa', { ticket: l3.body.ticket, code: en.body.backupCodes[0] })).status, 200, 'Yedek kodla giriş');
    const l4 = await call('POST', '/api/account/login', { email: 'carol@ornek.com', password: 'gizli-sifre-123' });
    assert.equal((await call('POST', '/api/account/login2fa', { ticket: l4.body.ticket, code: en.body.backupCodes[0] })).status, 401, 'Aynı yedek kod ikinci kez geçmez');
    // Para ve cüzdan işlemleri kod ister
    const wNo = await call('POST', '/api/withdraw', { amount: 100 }, tC2);
    assert.ok(wNo.status === 403 && wNo.body.need2fa, 'Çekim kod ister');
    const cw = ethers.Wallet.createRandom();
    const cn = await call('POST', '/api/account/wallet/nonce', { address: cw.address }, tC2);
    const sig = await cw.signMessage(cn.body.message);
    const lNo = await call('POST', '/api/account/wallet/link', { signature: sig }, tC2);
    assert.ok(lNo.status === 403 && lNo.body.need2fa, 'Cüzdan bağlama kod ister');
    now += 30000;
    const lOk = await call('POST', '/api/account/wallet/link', { signature: sig, code: totpCode(su.body.secret, step()) }, tC2);
    assert.equal(lOk.status, 200, 'Kodla cüzdan bağlama: ' + JSON.stringify(lOk.body));
    // 5 yanlış koddan sonra kilit
    for (let i = 0; i < 5; i++) await call('POST', '/api/withdraw', { amount: 100, code: '11111' + i }, tC2);
    now += 30000;
    const lockd = await call('POST', '/api/withdraw', { amount: 100, code: totpCode(su.body.secret, step()) }, tC2);
    assert.ok(/15 dakika/.test(lockd.body.error), '5 yanlış koddan sonra 15 dakika kilit');
    now += 16 * 60000;
    // Kapatma da kod ister
    assert.equal((await call('POST', '/api/account/2fa/disable', {}, tC2)).status, 403);
    const off = await call('POST', '/api/account/2fa/disable', { code: totpCode(su.body.secret, step()) }, tC2);
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal((await call('GET', '/api/account/me', null, tC2)).body.twoFactor, false);
    ok('Muhafız Mührü: kare kod, giriş kodu, tekrar kullanım engeli, yedek kodlar, para/cüzdan işlemleri, kilit, kapatma');
  }

  // Cüzdan bağlama: sahte imza reddedilir; ilk bağlama e-posta onayıyla hemen; değişiklik 48 saat bekler
  const nn = await call('POST', '/api/account/wallet/nonce', { address: eve.address }, tB2);
  const forged = await call('POST', '/api/account/wallet/link', { signature: await bob.signMessage(nn.body.message) }, tB2);
  assert.equal(forged.status, 400, 'Başka cüzdanın imzası geçmez');
  const first = await linkWallet(tB2, bob);
  assert.equal(first.immediate, true, 'İlk cüzdan onaydan hemen sonra etkin');
  assert.equal((await call('GET', '/api/account/me', null, tB2)).body.wallet, bob.address.toLowerCase());
  const n2 = await call('POST', '/api/account/wallet/nonce', { address: bob.address }, tA);
  const dup = await call('POST', '/api/account/wallet/link', { signature: await bob.signMessage(n2.body.message) }, tA);
  assert.equal(dup.status, 400, 'Bir cüzdan iki hesaba bağlanamaz');
  ok('Cüzdan bağlama: imza kanıtı, e-posta onayı, tek hesap kuralı');
  assert.equal((await call('GET', '/api/state')).status, 401, 'Girişsiz istek reddedilir');
  const s0 = await call('GET', '/api/state', null, tA);
  assert.equal(s0.status, 200);
  assert.equal(s0.body.player.adAstraBalance, 0, 'Yeni hesap 0 ASTRA ile başlar');
  assert.equal(s0.body.player.inventory.wood, 0, 'Yeni hesap 0 kaynakla başlar');
  engine.mutatePlayer(pidA, gs => { gs.state.adAstraBalance = 250; });
  engine.mutatePlayer(pidB, gs => { gs.state.adAstraBalance = 250; });
  ok('Girişsiz istek reddediliyor; yeni hesap 0 ASTRA ve 0 kaynakla başlıyor');

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
  const bobStart = (await call('GET', '/api/state', null, tB2)).body.player.adAstraBalance;
  depositLogs = [{ txHash: '0xdep1', logIndex: 0, from: bob.address.toLowerCase(), amount: 50000, block: 900 }];
  await world.scanDeposits();
  const sB = await call('GET', '/api/state', null, tB2);
  assert.equal(sB.body.player.adAstraBalance, bobStart + 50000);
  assert.ok(sB.body.player.lockedAda < 250, 'Yatırılan ASTRA serbest (kilitsiz)');
  await world.scanDeposits();
  assert.equal((await call('GET', '/api/state', null, tB2)).body.player.adAstraBalance, bobStart + 50000, 'Aynı yatırma iki kez işlenmez');
  ok('Yatırma zincirden bulunup bir kez, serbest bakiye olarak işleniyor');

  // Katkı puanı: Bob harcar (asker alır), Alice az harcar
  const buy = await call('POST', '/api/action', { name: 'buySoldierUnit', args: [] }, tB2);
  assert.ok(buy.body.result.success, buy.body.result.message);
  // Çekim talebi
  const tooMuch = await call('POST', '/api/withdraw', { amount: 1e9 }, tB2);
  assert.equal(tooMuch.body.success, false, 'Serbest bakiyeden fazlası istenemez');
  const wreq = await call('POST', '/api/withdraw', { amount: 30000 }, tB2);
  assert.ok(wreq.body.success, wreq.body.message);
  const afterReq = (await call('GET', '/api/state', null, tB2)).body.player;
  assert.equal(afterReq.pendingWithdrawAda, 30000);
  const spendPending = await call('POST', '/api/withdraw', { amount: afterReq.adAstraBalance + 1 }, tB2);
  assert.equal(spendPending.body.success, false, 'Çekime ayrılan ASTRA tekrar kullanılamaz');
  ok('Çekim talebi serbest bakiyeden ayrılıyor, fazlası reddediliyor');

  const noWallet = await call('POST', '/api/withdraw', { amount: 100 }, tA);
  assert.equal(noWallet.body.success, false, 'Cüzdanı bağlı olmayan çekim talebi veremez');
  // Bob cüzdanını değiştirmek ister: onaydan sonra 48 saat eski cüzdan geçerli
  const ch = await linkWallet(tB2, bob2);
  assert.ok(ch.activeAt - Date.now() > 47 * 3600000, 'Değişiklik 48 saat sonra etkin');
  assert.equal(accounts.activeWallet(pidB), bob.address.toLowerCase(), 'Bu sürede ödemeler eski cüzdana');
  ok('Cüzdan değişikliği: 48 saat bekleme, ödemeler o sürede eski cüzdana; cüzdansız çekim yok');

  // Ortak piyango: iki oyuncu bilet alır; kasa ve toplam bilet ortak
  const poolBefore = engine.lottery().pool;
  const lA = await call('POST', '/api/action', { name: 'buyLotteryTickets', args: [1] }, tA);
  assert.ok(lA.body.result.success, lA.body.result.message);
  const lB = await call('POST', '/api/action', { name: 'buyLotteryTickets', args: [3] }, tB2);
  assert.ok(lB.body.result.success, lB.body.result.message);
  assert.equal(engine.lottery().totalTickets, 4, 'Ortak toplam bilet 4');
  assert.ok(engine.lottery().pool > poolBefore, 'Bilet parası ortak kasaya girdi');
  assert.equal(lB.body.player.lotteryPool, engine.lottery().pool, 'Oyuncu ortak kasayı görüyor');
  ok('Ortak piyango: biletler ve kasa bütün oyuncular için tek');

  // Haftalık hesaplaşma: hafta değişir
  const aliceBeforeWeek = (await call('GET', '/api/state', null, tA)).body.player.adAstraBalance;
  await world.tick();                                      // ilk tur: hafta kaydı
  const epochBefore = engine.globalPool.state.epochId;
  // Ücretsiz pay şartları (4 Ekim 2026): en az 3. seviye + haftalık katkı eşiği. Alice sağlar, Carol'ın katkısı yetmez.
  const carolPid = 'acc:' + db.raw.prepare("SELECT id FROM accounts WHERE email = 'carol@ornek.com'").get().id;
  for (const [pid, week] of [[pidA, 3], [carolPid, 0.5]]) {   // v2 ölçeği: eşik 1 puan
    engine.mutatePlayer(pid, gs => { gs.state.level = 3; gs.state.contribution = { total: week, week, lastWeek: 0, epochId: epochBefore, buyCredit: {} }; });
  }
  engine.globalPool.state.epochEndTime = Date.now() - 1000;
  engine.globalPool.saveState();
  await world.tick();
  assert.equal(engine.globalPool.state.epochId, epochBefore + 1, 'Yeni hafta açıldı');
  const summary = world.econ().lastWeekly;
  assert.ok(summary && summary.epoch === epochBefore, 'Kapanan hafta hesaplaşıldı');
  const wB = await call('GET', '/api/wallet', null, tB2);
  const hist = wB.body.withdraw.history[0];
  assert.ok(hist && hist.total > 0, 'Bob\'un çekimi karşılandı');
  assert.ok(near(hist.net, hist.total - hist.fee - hist.rent, 1e-6));
  const payB = sent.find(s => s.to.toLowerCase() === bob.address.toLowerCase());
  assert.ok(payB && near(payB.amount, Math.floor(hist.net * 100) / 100, 0.01), 'Net tutar Bob\'un cüzdanına gönderildi');
  const bAfter = (await call('GET', '/api/state', null, tB2)).body.player;
  assert.equal(bAfter.pendingWithdrawAda, 0);
  assert.ok(near(bAfter.withdrawnAda, hist.total));
  ok('Haftalık hesaplaşma: çekim havuzdan karşılanıp zincire gönderildi, ücret ve kira düşüldü');

  // Ücretsiz oyuncu havuzu Alice'e (hiç yatırma yapmamış, bu hafta oynamış)
  assert.equal(summary.faucet.players, 1, 'Ücretsiz oyuncu yalnız Alice (Carol katkı eşiğinin altında; Bob yatırdı; yeni@ doğrulanmadı)');
  const aAfter = (await call('GET', '/api/state', null, tA)).body.player;
  assert.ok(summary.faucet.perPlayer > 0 && aAfter.adAstraBalance >= aliceBeforeWeek + summary.faucet.perPlayer - 1 && aAfter.faucetStreak.weeks === 1, 'Alice ücretsiz havuz payını aldı, serisi başladı');
  // Yakım ve yapımcı payı zincire
  const burnTx = sent.find(s => s.to === cfg.deadAddress);
  const creatorTx = sent.find(s => s.to === engine.GAME_CONFIG.CREATOR_WALLET_ADDRESS);
  assert.ok(burnTx && burnTx.amount > 0, 'Yakım ölü adrese gönderildi');
  assert.ok(creatorTx && creatorTx.amount > 0, 'Yapımcı payı 0x58DB… cüzdanına gönderildi');
  assert.equal(creatorTx.to, '0x58DBCF66bdd7BfA9da98aDba1965b3794321087C');
  ok('Ücretsiz oyuncu payı, yakım ve yapımcı payı dağıtıldı');

  // Piyango çekilişi: tek kazanan, ödülünü çeker
  const lot = summary.lottery;
  const addrs = { [pidA]: tA, [pidB]: tB2 };
  assert.ok(lot && addrs[lot.winner], 'Kazanan gerçek oyunculardan biri');
  const winTok = addrs[lot.winner];
  const loseTok = winTok === tA ? tB2 : tA;
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
  const p = await call('POST', '/api/admin/pause', { paused: true }, 'yonetici-test-anahtari-uzun-1234567890');
  assert.equal(p.body.paused, true);
  const wPaused = await call('POST', '/api/withdraw', { amount: 100 }, tA);
  assert.equal(wPaused.body.success, false, 'Durdurulunca çekim talebi alınmaz');
  const st = await call('GET', '/api/admin/status', null, 'yonetici-test-anahtari-uzun-1234567890');
  assert.equal(st.status, 200);
  assert.ok(st.body.players.total >= 2);
  ok('Çift ödeme yok; durdurma anahtarı ve yönetici yetkisi çalışıyor');

  // HTTP sertleştirme: bozuk adres sunucuyu düşürmez, klasör dışına çıkılamaz, yönetici şifresi deneme sınırı, başlıklar
  const raw = async (p, opts = {}) => { const r = await fetch(base + p, opts); return { status: r.status, headers: r.headers, text: await r.text() }; };
  const bad = await raw('/%E0%A4%A');
  assert.ok(bad.status === 400 || bad.status === 404, 'Bozuk adres düzgün reddedilir');
  assert.equal((await call('GET', '/api/health')).status, 200, 'Sunucu ayakta');
  const trav = await raw('/..%2fserver%2f.env.example');
  assert.ok(!/GAME_WALLET_PRIVATE_KEY/.test(trav.text), 'Oyun klasörü dışındaki dosya verilmez');
  const h = await raw('/api/health');
  assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(h.headers.get('x-frame-options'), 'Çerçeve koruması');
  for (let i = 0; i < 10; i++) await call('GET', '/api/admin/status', null, 'yanlis-sifre-' + i);
  const blocked = await call('GET', '/api/admin/status', null, 'yonetici-test-anahtari-uzun-1234567890');
  assert.equal(blocked.status, 429, '10 yanlış yönetici denemesinden sonra doğru şifre bile bekletilir');
  const notFound = await call('GET', '/api/__proto__');
  assert.equal(notFound.status, 404, 'Özel adlar yol olarak kabul edilmez');
  ok('Sunucu kapısı: bozuk istek, klasör dışı, yönetici şifre denemesi, güvenlik başlıkları');

  // 48 saat dolunca yeni cüzdan etkinleşir
  now += 49 * 3600000;
  assert.equal(accounts.activeWallet(pidB), bob2.address.toLowerCase(), '48 saat sonra yeni cüzdan etkin');
  assert.equal((await call('GET', '/api/account/me', null, tB2)).body.pendingWallet, null);
  ok('48 saat sonra yeni cüzdan etkinleşiyor');
} finally {
  server.close();
}
console.log(`\n${passed} sunucu kontrolü geçti.`);
process.exit(0);
