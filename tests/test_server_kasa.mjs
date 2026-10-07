// Oyun Kasası — 1) taklit kasa ile motor katmanı (önce kazanılmış bakiye, sonra kasa) ve kurallar
//               2) sahte zincirde (ganache) gerçek kasa: oyuna aktarım sözleşmeden, komisyon, ASTRA/AVAX çekimi
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { compile } from '../contracts/compile.mjs';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createChain } from '../server/chain.js';
import { createMailer } from '../server/mailer.js';
import { createAccounts } from '../server/accounts.js';
import { createKasa } from '../server/kasa.js';
import { loadConfig } from '../server/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const keys = Array.from({ length: 5 }, () => ethers.Wallet.createRandom().privateKey);
const PORT = 19545 + Math.floor(Math.random() * 1000);
const node = ganache.server({ logging: { quiet: true }, wallet: { accounts: keys.map(k => ({ secretKey: k, balance: '0x' + (10n ** 21n).toString(16) })) }, chain: { chainId: 43114 } });
await node.listen(PORT);
try {
  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`, 43114, { staticNetwork: true, cacheTimeout: -1 });
  const [owner, treasury, feeRx, playerW] = keys.map(k => new ethers.NonceManager(new ethers.Wallet(k, provider)));
  const c = compile();
  const dep = async (n, ...a) => { const k = await new ethers.ContractFactory(c[n].abi, c[n].bytecode, owner).deploy(...a); await k.waitForDeployment(); return k; };
  const token = await dep('MockToken');
  const pay = await dep('RealmPayments', await token.getAddress(), await treasury.getAddress(), await feeRx.getAddress(), 100000n);

  const base = { ...loadConfig({}), dbFile: ':memory:', rpcUrls: [`http://127.0.0.1:${PORT}`], chainId: 43114, tokenAddress: await token.getAddress(),
    paymentsContract: (await pay.getAddress()).toLowerCase(), payFeeGas: 100000, kasaMinAvax: 0.003, kasaMinSettle: 50 };
  const db = openDb(':memory:');
  const E = await createEngine(db);
  const mailer = createMailer({ db, cfg: base, log: { log() {} } });
  const accounts = createAccounts({ db, cfg: base, mailer, verifyMessage: (m, s) => ethers.verifyMessage(m, s) });
  const lastLink = kind => new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(db.kvJson('dev:outbox', [])[0].text)[1];
  const reg = await accounts.register('kasa@ornek.com', 'gizli-sifre-123');
  const pid = reg.playerId;
  accounts.verifyEmail(lastLink('verify'));
  const playerAddr = (await playerW.getAddress()).toLowerCase();
  await accounts.walletLink(pid, await new ethers.Wallet(keys[3]).signMessage(accounts.walletNonce(pid, playerAddr).message));
  accounts.walletConfirm(lastLink('wallet'));

  // ── 1) Taklit kasa (deneme sunucusu düzeni) ─────────────────────────────
  {
    const sim = createKasa({ db, accounts, cfg: { ...base, testMode: true }, log: { warn() {} } });
    E.setKasa(sim);
    assert.ok(sim.enabled && sim.simulated);
    // Yaralı asker, buğday var; kazanılmış bakiye 3 ASTRA; kasada 1000 ASTRA
    E.withPlayer(pid, gs => {
      gs.state.adAstraBalance = 20000; gs.buySoldierUnit();
      gs.state.adAstraBalance = 0.03; gs.state.lockedAda = 0;   // v2 ölçeği: iyileşme 0,001 ASTRA/HP
      gs.state.inventory.wheat = 5000;
      gs.state.soldierUnits[0].hp = 10;
    });
    sim.simulateDeposit(pid, 1000, 0);
    assert.equal(sim.available(pid), 1000);
    // 20 saat sonra oyuncu döner: pasif iyileşme ASTRA harcar
    E.mutatePlayer(pid, gs => { gs.state.lastSeenAt = Date.now() - 20 * 3600000; });
    E.withPlayer(pid, () => null);
    const st = E.readPlayer(pid), ks = sim.status(pid);
    assert.ok(st.soldierUnits[0].hp > 10, 'Asker oyuncu yokken iyileşti');
    assert.equal(st.adAstraBalance, 0, 'Önce kazanılmış bakiye harcandı');
    assert.ok(ks.pending > 0 && ks.pending < 50, `Kalanı kasadan (aktarılmayı bekleyen: ${ks.pending})`);
    assert.ok(near(ks.available, 1000 - ks.pending), 'Kasada kullanılabilir = bakiye − bekleyen');
    assert.ok(ks.usageToday > 0 && ks.daysLeft > 0, 'Günlük harcama ve bitiş tahmini');
    ok('Oyuncu yokken: önce kazanılmış bakiye, sonra kasa; panel tahmini');

    // Tıklamalı işlem kasayı kullanmaz
    const r = E.act(pid, 'buySoldierUnit', []);
    assert.equal(r.result.success, false, 'Tıklamalı işlem kasadan ödenmez');
    ok('Tıklamalı işlemler kasaya dokunmuyor (kazanılmış bakiye ya da cüzdan)');

    // Aktarım ve çekim kuralları
    sim.consume(pid, 60);
    assert.equal(sim.queueSettlements(), 1, '50 ASTRA eşiği aşılınca aktarım sıraya girer');
    await sim.processOps();
    const k2 = sim.status(pid);
    assert.ok(near(k2.pending, 0, 0.01) && k2.ada < 1000 - 60 + 1e-6, 'Aktarım yapıldı, kasadan düştü (kuruş altı kalan bekler)');
    assert.equal(sim.withdraw(pid, 'ADA', 1e9).ok, false, 'Kasadakinden fazlası çekilemez');
    const w = sim.withdraw(pid, 'ADA', 100);
    assert.ok(w.ok, w.error);
    await sim.processOps();
    assert.ok(near(sim.status(pid).ada, k2.ada - 100), 'Kasadan çekim');
    ok('Kasadan oyuna aktarım ve kasadan çekim kuralları');
    E.setKasa(null);
  }

  // ── 2) Gerçek kasa, sahte zincirde ─────────────────────────────────────
  {
    db.raw.exec('DELETE FROM kasa; DELETE FROM kasa_ops; DELETE FROM kasa_usage;');
    const chain = createChain(base);
    const real = createKasa({ db, chain, accounts, cfg: { ...base, testMode: false, kasaMasterKey: 'ab'.repeat(32) }, log: { warn() {} } });
    assert.ok(real.enabled && !real.simulated);
    const row = real.ensure(pid);
    assert.ok(/^0x[0-9a-f]{40}$/.test(row.address), 'Oyuncuya kasa adresi açıldı');
    assert.ok(!JSON.stringify(db.raw.prepare('SELECT * FROM kasa').all()).includes('0x' + 'ab'.repeat(32)), 'Ana anahtar kayıtta yok');
    // Oyuncu kasasına 1.000 ASTRA ve 0,1 AVAX yatırır
    await (await token.mint(row.address, ethers.parseUnits('1000', 18))).wait();
    await (await owner.sendTransaction({ to: row.address, value: ethers.parseEther('0.1') })).wait();
    await real.refresh(pid);
    assert.ok(near(real.status(pid).ada, 1000) && near(real.status(pid).avax, 0.1));
    assert.equal(real.available(pid), 1000);
    // Harcama birikir, saatlik aktarım sözleşmeden geçer
    const feeBefore = await provider.getBalance(await feeRx.getAddress());
    real.consume(pid, 120);
    real.queueSettlements();
    await real.processOps();
    assert.equal(await token.balanceOf(await treasury.getAddress()), ethers.parseUnits('120', 18), 'Aktarılan ASTRA oyun hazinesine gitti');
    assert.ok((await provider.getBalance(await feeRx.getAddress())) > feeBefore, 'AVAX komisyonu geldi');
    const ks = real.status(pid);
    assert.ok(near(ks.ada, 880, 1e-6) && near(ks.pending, 0), 'Kasada 880 ASTRA kaldı');
    ok('Gerçek kasa: harcama sözleşmeden oyuna aktarıldı, komisyon alındı');
    // Oyuncu kasasındaki ASTRA'yı ve AVAX'ı kendi cüzdanına çeker (kesintisiz)
    const wa = real.withdraw(pid, 'ADA', 500);
    assert.ok(wa.ok, wa.error);
    await real.processOps();
    assert.equal(await token.balanceOf(playerAddr), ethers.parseUnits('500', 18), 'ADA bağlı cüzdana geldi (kesintisiz)');
    const avaxBefore = await provider.getBalance(playerAddr);
    const wv = real.withdraw(pid, 'AVAX', 0.05);
    assert.ok(wv.ok, wv.error);
    await real.processOps();
    assert.equal((await provider.getBalance(playerAddr)) - avaxBefore, ethers.parseEther('0.05'), 'AVAX bağlı cüzdana geldi');
    assert.equal(real.withdraw(pid, 'AVAX', 1).ok, false, 'Gaz payı bırakılmadan AVAX çekilemez');
    ok('Gerçek kasa: ASTRA ve AVAX bağlı cüzdana çekildi');
    // AVAX biterse kasa kullanılmaz
    db.raw.prepare('UPDATE kasa SET avax = 0.001 WHERE player = ?').run(pid);
    assert.equal(real.available(pid), 0, 'İşlem ücreti için AVAX yoksa kasa kullanılmaz');
    assert.equal(real.status(pid).avaxLow, true);
    ok('Kasada AVAX bitince kasa durur ve panel uyarır');
  }
} finally {
  await node.close();
}
console.log(`\n${passed} Oyun Kasası kontrolü geçti.`);
process.exit(0);
