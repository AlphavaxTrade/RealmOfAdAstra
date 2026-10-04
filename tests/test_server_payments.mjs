// Cüzdandan ödeme — uçtan uca: teklif → sözleşmeye ödeme (sahte zincir, ganache) → sunucu doğrular → işlem yapılır
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { compile } from '../contracts/compile.mjs';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createChain } from '../server/chain.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';
import { createPayments } from '../server/payments.js';
import { loadConfig } from '../server/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const PORT = 18545 + Math.floor(Math.random() * 1000);
const keys = Array.from({ length: 5 }, () => ethers.Wallet.createRandom().privateKey);
const node = ganache.server({ logging: { quiet: true }, wallet: { accounts: keys.map(k => ({ secretKey: k, balance: '0x' + (10n ** 21n).toString(16) })) }, chain: { chainId: 43114 } });
await node.listen(PORT);
try {
  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`, 43114, { staticNetwork: true, cacheTimeout: -1 });
  const [owner, treasury, feeRx, playerW, otherW] = keys.map(k => new ethers.NonceManager(new ethers.Wallet(k, provider)));
  const signMsg = (i, m) => new ethers.Wallet(keys[i]).signMessage(m);
  const c = compile();
  const dep = async (n, ...a) => { const k = await new ethers.ContractFactory(c[n].abi, c[n].bytecode, owner).deploy(...a); await k.waitForDeployment(); return k; };
  const token = await dep('MockToken');
  const FEE_GAS = 100000n;
  const pay = await dep('RealmPayments', await token.getAddress(), await treasury.getAddress(), await feeRx.getAddress(), FEE_GAS);
  for (const w of [playerW, otherW]) {
    await (await token.mint(await w.getAddress(), ethers.parseUnits('1000000', 18))).wait();
    await (await token.connect(w).approve(await pay.getAddress(), ethers.MaxUint256)).wait();
  }

  const cfg = { ...loadConfig({}), dbFile: ':memory:', rpcUrls: [`http://127.0.0.1:${PORT}`], chainId: 43114,
    tokenAddress: await token.getAddress(), paymentsContract: (await pay.getAddress()).toLowerCase(), payFeeGas: 100000 };
  const db = openDb(':memory:');
  const E = await createEngine(db);
  const chain = createChain(cfg);
  const mailer = createMailer({ db, cfg, log: { log() {} } });
  const accounts = createAccounts({ db, cfg, mailer, verifyMessage: (m, s) => ethers.verifyMessage(m, s) });
  const payments = createPayments({ db, engine: E, accounts, chain, cfg, log: { error() {} } });
  const lastLink = kind => { const m = db.kvJson('dev:outbox', [])[0]; return new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(m.text)[1]; };

  // Hesap + bağlı cüzdan (oyuncunun ganache hesabı)
  const reg = await accounts.register('odeme@ornek.com', 'gizli-sifre-123');
  const pid = reg.playerId;
  accounts.verifyEmail(lastLink('verify'));
  const playerAddr = (await playerW.getAddress()).toLowerCase();
  const msg = accounts.walletNonce(pid, playerAddr).message;
  assert.ok((await accounts.walletLink(pid, await signMsg(3, msg))).ok);
  accounts.walletConfirm(lastLink('wallet'));
  assert.equal(accounts.activeWallet(pid), playerAddr);
  E.withPlayer(pid, () => null);

  // 1) Teklif: 0 ADA'lı oyuncu asker almak ister
  const qt = payments.quote(pid, 'buySoldierUnit', []);
  assert.ok(qt.ok && qt.needPayment, JSON.stringify(qt));
  assert.ok(qt.amountAda >= qt.cost && qt.cost >= 5000, 'Eksik tutar askerin bedeli kadar (+%2 pay)');
  assert.equal(E.readPlayer(pid).soldierUnits.length, 0, 'Teklif (deneme çalıştırması) hiçbir şeyi değiştirmedi');
  ok('Teklif: işlemin tutarı ölçüldü, deneme çalıştırması geri alındı');

  // 2) Sözleşmeye ödeme ve doğrulama
  const gasPrice = (await provider.getFeeData()).gasPrice;
  const payTx = await pay.connect(playerW).pay(ethers.parseUnits(String(qt.amountAda), 18), qt.ref, { value: gasPrice * FEE_GAS, gasPrice });
  await payTx.wait();
  const cf = await payments.confirm(pid, qt.ref, payTx.hash);
  assert.ok(cf.ok, JSON.stringify(cf));
  assert.ok(cf.result.success, cf.result.message);
  const st = E.readPlayer(pid);
  assert.equal(st.soldierUnits.length, 1, 'Asker alındı');
  assert.ok(Math.abs(st.adAstraBalance - (qt.amountAda - qt.cost)) < 1, 'Fazla ödenen küçük kısım bakiyede kaldı');
  assert.equal(await token.balanceOf(await treasury.getAddress()), ethers.parseUnits(String(qt.amountAda), 18), 'ADASTRA oyun hazinesine gitti');
  ok('Cüzdandan ödeme zincirden doğrulandı, işlem yapıldı, ADASTRA hazineye gitti');

  // 3) Aynı ödeme ikinci kez kullanılamaz
  assert.equal(payments.confirm(pid, qt.ref, payTx.hash).then ? (await payments.confirm(pid, qt.ref, payTx.hash)).ok : false, false, 'Aynı teklif tekrar kullanılamaz');
  const qt2 = payments.quote(pid, 'buySoldierUnit', []);
  assert.equal((await payments.confirm(pid, qt2.ref, payTx.hash)).ok, false, 'Eski ödeme yeni teklife kullanılamaz');
  ok('Aynı ödeme iki kez kullanılamıyor');

  // 4) Başka cüzdandan ödeme kabul edilmez
  const t2 = await pay.connect(otherW).pay(ethers.parseUnits(String(qt2.amountAda), 18), qt2.ref, { value: gasPrice * FEE_GAS, gasPrice });
  await t2.wait();
  const bad = await payments.confirm(pid, qt2.ref, t2.hash);
  assert.equal(bad.ok, false);
  assert.ok(/bağlı cüzdan/.test(bad.error), bad.error);
  ok('Hesaba bağlı olmayan cüzdandan yapılan ödeme kabul edilmiyor');

  // 5) Eksik ödeme kabul edilmez
  const qt3 = payments.quote(pid, 'buySoldierUnit', []);
  const t3 = await pay.connect(playerW).pay(ethers.parseUnits(String(qt3.amountAda - 100), 18), qt3.ref, { value: gasPrice * FEE_GAS, gasPrice });
  await t3.wait();
  const low = await payments.confirm(pid, qt3.ref, t3.hash);
  assert.equal(low.ok, false);
  assert.ok(/az/.test(low.error), low.error);
  assert.equal(E.readPlayer(pid).soldierUnits.length, 1, 'Eksik ödemeyle asker verilmedi');
  ok('Teklifin altında ödeme kabul edilmiyor');

  // 5b) Kurtarma: oyuncu öder ama tarayıcıyı kapatır (sunucuya bildirmez) → tarama parayı bulup bakiyeye ekler
  const qtR = payments.quote(pid, 'buySoldierUnit', []);
  const balR = E.readPlayer(pid).adAstraBalance;
  const tR = await pay.connect(playerW).pay(ethers.parseUnits(String(qtR.amountAda), 18), qtR.ref, { value: gasPrice * FEE_GAS, gasPrice });
  await tR.wait();
  db.kvSet('chain:payBlock', 1);
  const found = await payments.scanPaid();
  assert.ok(found >= 1, 'Tarama ödemeyi buldu');
  // Önceki adımlarda onaylanmamış (başka cüzdandan / eksik) ama zincirde gerçekten ödenmiş paralar da bakiyeye eklenir: para kaybolmaz
  assert.ok(E.readPlayer(pid).adAstraBalance >= balR + qtR.amountAda - 1e-6, 'Ödenen ADA bakiyeye eklendi');
  assert.equal(db.raw.prepare('SELECT status FROM pay_quotes WHERE ref = ?').get(qtR.ref).status, 'credited');
  assert.ok(E.readPlayer(pid).pendingNotices.some(n => /bakiyene eklendi/.test(n.message)), 'Oyuncuya bildirim gitti');
  const late = await payments.confirm(pid, qtR.ref, tR.hash);
  assert.equal(late.ok, false, 'Sonradan onay ikinci kez para eklemez');
  assert.equal(await payments.scanPaid(), 0, 'Tarama aynı ödemeyi iki kez eklemez');
  ok('Kurtarma: bildirilmemiş ödeme zincirden bulunup bir kez bakiyeye eklendi');

  // 6) Bakiye yetiyorsa teklif ödeme istemez
  E.mutatePlayer(pid, gs => { gs.state.adAstraBalance = 1e7; });
  assert.equal(payments.quote(pid, 'buySoldierUnit', []).needPayment, false, 'Kazanılmış bakiye yetince cüzdan istenmez');
  ok('Kazanılmış bakiye yetince cüzdandan ödeme istenmiyor');
} finally {
  await node.close();
}
console.log(`\n${passed} cüzdan ödemesi kontrolü geçti.`);
process.exit(0);
