// Ödeme akıllı sözleşmesi (contracts/RealmPayments.sol) — bilgisayardaki sahte zincirde (ganache)
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { compile } from '../contracts/compile.mjs';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const c = compile();
const chainProvider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 6, defaultBalance: 1000 }, chain: { chainId: 43114 } });
// cacheTimeout: -1 → ethers aynı isteği 250 ms önbellekler; hızlı makinede "ödeme öncesi" ve "sonrası" bakiye okuması aynı önbellekten gelip fark 0 çıkıyordu (CI yakaladı)
const provider = new ethers.BrowserProvider(chainProvider, undefined, { cacheTimeout: -1 });
const [owner, treasury, feeRx, player, player2, attacker] = await Promise.all([0, 1, 2, 3, 4, 5].map(i => provider.getSigner(i)));
const addr = s => s.getAddress();

const deploy = async (name, signer, ...args) => {
  const f = new ethers.ContractFactory(c[name].abi, c[name].bytecode, signer);
  const k = await f.deploy(...args);
  await k.waitForDeployment();
  return k;
};
// Hata adını, zincirin döndürdüğü hata verisinden (biçimi sağlayıcıya göre değişir) bulur
const expectRevert = async (p, errName) => {
  try { const tx = await p; await tx.wait(); } catch (e) {
    if (!errName) return;
    if (e.revert && e.revert.name === errName) return;
    const seen = new Set();
    const text = JSON.stringify(e, (k, v) => (typeof v === 'object' && v !== null ? (seen.has(v) ? undefined : (seen.add(v), v)) : typeof v === 'bigint' ? v.toString() : v));
    for (const hex of text.match(/0x[0-9a-fA-F]{8,}/g) || []) {
      try { if (payIface.parseError(hex)?.name === errName) return; } catch { /* başka veri */ }
    }
    throw new Error(`Beklenen hata ${errName}, gelen: ${String(e.shortMessage || e.message).slice(0, 200)}`);
  }
  throw new Error('İşlem başarısız olmalıydı: ' + errName);
};

const FEE_GAS = 90000n;
const token = await deploy('MockToken', owner);
const pay = await deploy('RealmPayments', owner, await token.getAddress(), await addr(treasury), await addr(feeRx), FEE_GAS);
const payIface = pay.interface;
const ASTRA = v => ethers.parseUnits(String(v), 18);
await (await token.mint(await addr(player), ASTRA(1_000_000))).wait();
await (await token.mint(await addr(player2), ASTRA(1_000_000))).wait();
const pp = pay.connect(player), tp = token.connect(player);
const gasPrice = ethers.parseUnits('25', 'gwei');
const ref1 = ethers.id('teklif-1');

// 1) İzin vermeden ödeme yapılamaz
await expectRevert(pp.pay(ASTRA(100), ref1, { value: gasPrice * FEE_GAS, gasPrice }), 'TokenTransferFailed');
await (await tp.approve(await pay.getAddress(), ethers.MaxUint256)).wait();
ok('İzin (approve) olmadan ödeme yapılamıyor');

// 2) Doğru ödeme: ADASTRA hazineye, AVAX komisyon cüzdanına, sözleşmede para kalmaz
const feeBefore = await provider.getBalance(await addr(feeRx));
const tx = await pp.pay(ASTRA(5000), ref1, { value: gasPrice * FEE_GAS, gasPrice });
const rc = await tx.wait();
assert.equal(await token.balanceOf(await addr(treasury)), ASTRA(5000), 'ADASTRA hazineye gitti');
assert.equal((await provider.getBalance(await addr(feeRx))) - feeBefore, gasPrice * FEE_GAS, 'Komisyon cüzdanına gitti');
assert.equal(await provider.getBalance(await pay.getAddress()), 0n, 'Sözleşmede AVAX kalmaz');
assert.equal(await token.balanceOf(await pay.getAddress()), 0n, 'Sözleşmede ADASTRA kalmaz');
const ev = rc.logs.map(l => { try { return payIface.parseLog(l); } catch { return null; } }).find(x => x && x.name === 'Paid');
assert.ok(ev && ev.args.payer === await addr(player) && ev.args.ref === ref1 && ev.args.amount === ASTRA(5000), 'Ödeme olayı (Paid) doğru');
const used = rc.gasUsed;
console.log(`   ölçüm: bir ödemenin gerçek gazı ${used} → komisyon ayarı ${FEE_GAS} (ağ ücretinin ~%${Number(FEE_GAS * 100n / used)}'i)`);
ok('Ödeme: ADASTRA hazineye, ağ ücreti kadar AVAX komisyona; sözleşme para tutmuyor');

// 3) Düşük komisyon, aynı referans, sıfır miktar reddedilir; başka oyuncu aynı referansı kullanabilir
await expectRevert(pp.pay(ASTRA(1), ethers.id('teklif-2'), { value: gasPrice * FEE_GAS - 1n, gasPrice }), 'FeeTooLow');
await expectRevert(pp.pay(ASTRA(1), ref1, { value: gasPrice * FEE_GAS, gasPrice }), 'RefAlreadyUsed');
await expectRevert(pp.pay(0, ethers.id('teklif-3'), { value: gasPrice * FEE_GAS, gasPrice }), 'ZeroAmount');
await (await token.connect(player2).approve(await pay.getAddress(), ethers.MaxUint256)).wait();
await (await pay.connect(player2).pay(ASTRA(10), ref1, { value: gasPrice * FEE_GAS, gasPrice })).wait();
ok('Düşük komisyon, tekrar referans ve sıfır ödeme reddediliyor; referans oyuncuya özel');

// 4) EIP-1559 işlemi: en yüksek ücretle hesaplanan komisyon yeterli
const maxFee = ethers.parseUnits('40', 'gwei');
await (await pp.pay(ASTRA(3), ethers.id('teklif-4'), { value: maxFee * FEE_GAS, maxFeePerGas: maxFee, maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei') })).wait();
ok('Yeni tip (EIP-1559) işlemde de ödeme geçiyor');

// 5) Doğrudan AVAX gönderimi reddedilir
await expectRevert(player.sendTransaction({ to: await pay.getAddress(), value: 1n }));
ok('Sözleşmeye doğrudan AVAX gönderilemiyor');

// 6) Yönetim: yalnız sahip; durdurma; iki adımlı sahiplik
await expectRevert(pay.connect(attacker).setPaused(true), 'NotOwner');
await expectRevert(pay.connect(attacker).setConfig(await addr(attacker), await addr(attacker), 0), 'NotOwner');
await (await pay.setPaused(true)).wait();
await expectRevert(pp.pay(ASTRA(1), ethers.id('teklif-5'), { value: gasPrice * FEE_GAS, gasPrice }), 'PaymentsPaused');
await (await pay.setPaused(false)).wait();
await expectRevert(pay.setConfig(await addr(treasury), await addr(feeRx), 2_000_000), 'FeeGasTooHigh');
await (await pay.transferOwnership(await addr(player2))).wait();
assert.equal(await pay.owner(), await addr(owner), 'Kabul edilmeden sahiplik geçmez');
await expectRevert(pay.connect(attacker).acceptOwnership(), 'NotOwner');
await (await pay.connect(player2).acceptOwnership()).wait();
assert.equal(await pay.owner(), await addr(player2));
ok('Yönetim: yalnız sahip değiştirebilir, durdurma çalışıyor, sahiplik iki adımlı');

console.log(`\n${passed} sözleşme kontrolü geçti.`);
process.exit(0);
