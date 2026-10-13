// Ücretli / yakımlı token (her transferde %10 kesilir): sözleşmeler ve sunucu gerçek zincirde (ganache) nasıl davranır?
// Denetim 2026-10 ikinci tur. Önceki turda yalnız SAHTE makbuzla denenmişti; burada gerçek sözleşme + gerçek sunucu kodu.
//   A) OyunKasasi: giriş ve çıkış TAM miktarla gerçekleşmezse geri alınır (AmountMismatch); hiçbir şey sessizce eksik gitmez
//   B) RealmPayments + sunucu: bildirilen 100, hazineye 90 ulaşır → kredi 90 (confirm teklifin altında olduğu için reddeder,
//      kurtarma taraması ulaşanı kredilendirir; teklif kadar ulaşacak şekilde ödeyen normal akışla tamamlanır)
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
const ASTRA = v => ethers.parseUnits(String(v), 18);
const sayi = v => Number(ethers.formatUnits(v, 18));
const DEAD = '0x000000000000000000000000000000000000dEaD';

const PORT = 28545 + Math.floor(Math.random() * 1000);
const keys = Array.from({ length: 7 }, () => ethers.Wallet.createRandom().privateKey);
const node = ganache.server({ logging: { quiet: true }, wallet: { accounts: keys.map(k => ({ secretKey: k, balance: '0x' + (10n ** 21n).toString(16) })) }, chain: { chainId: 43114 } });
await node.listen(PORT);
try {
  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`, 43114, { staticNetwork: true, cacheTimeout: -1 });
  // Geri alınan işlemler olacağı için düz Wallet (NonceManager başarısız işlemde sıra numarasını yine artırıp sonrakileri sonsuza dek bekletir)
  const [owner, treasury, feeRx, playerW, dagitici, creator, alici] = keys.map(k => new ethers.Wallet(k, provider));
  const c = compile();
  const dep = async (n, ...a) => { const k = await new ethers.ContractFactory(c[n].abi, c[n].bytecode, owner).deploy(...a); await k.waitForDeployment(); return k; };
  const kasaIface = new ethers.Interface(c.OyunKasasi.abi);
  const addr = async s => (await s.getAddress());

  // Hata adı (ganache özel hata verisini farklı biçimlerde döndürür)
  const hataAdi = e => {
    if (e.revert && e.revert.name) return { ad: e.revert.name, args: e.revert.args };
    const seen = new Set();
    const text = JSON.stringify(e, (k, v) => (typeof v === 'object' && v !== null ? (seen.has(v) ? undefined : (seen.add(v), v)) : typeof v === 'bigint' ? v.toString() : v));
    for (const hex of text.match(/0x[0-9a-fA-F]{8,}/g) || []) { try { const p = kasaIface.parseError(hex); if (p) return { ad: p.name, args: p.args }; } catch { /* başka veri */ } }
    return null;
  };
  const geriAlinmali = async (p, ad) => {
    try { await (await p).wait(); } catch (e) {
      const h = hataAdi(e);
      assert.ok(h && h.ad === ad, `Beklenen ${ad}, gelen: ${h ? h.ad : String(e.shortMessage || e.message).slice(0, 160)}`);
      return h;
    }
    throw new Error('İşlem geri alınmalıydı: ' + ad);
  };

  // ═══ A) OyunKasasi + ücretli token ═══
  {
    const fee = await dep('FeeToken');
    const feeAddr = await addr(fee);
    const kasa = await dep('OyunKasasi', feeAddr, DEAD, { dagitici: await addr(dagitici), creator: await addr(creator), singleDrawBps: 200, dailyLimitBps: 1000 });
    const kAddr = await addr(kasa);
    await (await fee.mint(await addr(playerW), ASTRA(1_000_000))).wait();
    await (await fee.connect(playerW).approve(kAddr, ethers.MaxUint256)).wait();

    // Giriş: 100.000 yatırılırsa kasaya 90.000 girer → sözleşme geri alır, olay yalan söylemez, hiçbir şey hareket etmez
    const girisOnce = await fee.balanceOf(await addr(playerW));
    const h = await geriAlinmali(kasa.connect(playerW).deposit(ASTRA(100000)), 'AmountMismatch');
    assert.deepEqual([sayi(h.args[0]), sayi(h.args[1])], [100000, 90000], 'beklenen 100.000, gerçekte 90.000');
    assert.equal(await fee.balanceOf(kAddr), 0n);
    assert.equal(await fee.balanceOf(await addr(playerW)), girisOnce, 'yatıran hiçbir şey kaybetmedi (işlem geri alındı)');
    ok('OyunKasasi: ücretli token ile yatırma AmountMismatch ile geri alınır (kasaya 90.000 girecekken 100.000 bildirilemez), yatıran kaybetmez');

    // Kasaya ücretsiz yoldan (ilk dolum) token girmiş say: hesapta 90.000 var, dağıtıcı ödeme yapmaya çalışır
    // (ücretli tokenı yalnız doğrudan transferle sokmak mümkün: deposit reddeder)
    await (await fee.connect(playerW).transfer(kAddr, ASTRA(100000))).wait();
    assert.equal(await fee.balanceOf(kAddr), ASTRA(90000), 'doğrudan transferde 90.000 ulaştı');
    const d = kasa.connect(dagitici);
    const alAdr = await addr(alici), cr = await addr(creator);
    const once = { kasa: await fee.balanceOf(kAddr), alici: await fee.balanceOf(alAdr), dead: await fee.balanceOf(DEAD), cr: await fee.balanceOf(cr) };
    const h1 = await geriAlinmali(d.payPlayer(alAdr, ASTRA(1000), ethers.id('p1')), 'AmountMismatch');
    assert.deepEqual([sayi(h1.args[0]), sayi(h1.args[1])], [1000, 900], 'kasadan 1000 düşer ama alıcıya yalnız 900 ulaşır');
    ok('OyunKasasi: oyuncuya ödeme ücretli token ile geri alınır');
    await geriAlinmali(d.burn(ASTRA(500), ethers.id('b1')), 'AmountMismatch');
    await geriAlinmali(d.payCreator(ASTRA(500), ethers.id('c1')), 'AmountMismatch');
    const sonra = { kasa: await fee.balanceOf(kAddr), alici: await fee.balanceOf(alAdr), dead: await fee.balanceOf(DEAD), cr: await fee.balanceOf(cr) };
    assert.deepEqual(sonra, once, 'geri alınan üç çıkışta da hiçbir bakiye değişmedi');
    assert.equal(await kasa.spentInWindow(), 0n, 'başarısız ödemeler günlük pencereye yazılmadı');
    ok('OyunKasasi: yakım ve yapımcı payı da ücretli token ile geri alınır; bakiyeler ve günlük pencere sağlam');
  }

  // ═══ A2) Normal token: ek denetim hiçbir şeyi bozmaz (kasa + yakım + yapımcı + sınırlar) ═══
  {
    const tok = await dep('MockToken');
    const kasa = await dep('OyunKasasi', await addr(tok), DEAD, { dagitici: await addr(dagitici), creator: await addr(creator), singleDrawBps: 200, dailyLimitBps: 1000 });
    const kAddr = await addr(kasa);
    await (await tok.mint(await addr(playerW), ASTRA(500000))).wait();
    await (await tok.connect(playerW).approve(kAddr, ethers.MaxUint256)).wait();
    await (await kasa.connect(playerW).deposit(ASTRA(100000))).wait();
    assert.equal(await tok.balanceOf(kAddr), ASTRA(100000));
    const d = kasa.connect(dagitici);
    await (await d.payPlayer(await addr(alici), ASTRA(1000), ethers.id('n1'))).wait();
    await (await d.burn(ASTRA(500), ethers.id('n2'))).wait();
    await (await d.payCreator(ASTRA(250), ethers.id('n3'))).wait();
    assert.equal(await tok.balanceOf(await addr(alici)), ASTRA(1000));
    assert.equal(await tok.balanceOf(DEAD), ASTRA(500));
    assert.equal(await tok.balanceOf(await addr(creator)), ASTRA(250));
    assert.equal(await tok.balanceOf(kAddr), ASTRA(98250));
    assert.equal(await kasa.spentInWindow(), ASTRA(1750));
    ok('OyunKasasi: normal tokenda giriş/çıkış ve sınır muhasebesi aynı (ek bakiye denetimi sonucu değiştirmez)');
  }

  // ═══ B) RealmPayments + sunucu + ücretli token ═══
  {
    const fee = await dep('FeeToken');
    const FEE_GAS = 100000n;
    const pay = await dep('RealmPayments', await addr(fee), await addr(treasury), await addr(feeRx), FEE_GAS);
    const payAddr = await addr(pay);
    await (await fee.mint(await addr(playerW), ASTRA(10_000_000))).wait();
    await (await fee.connect(playerW).approve(payAddr, ethers.MaxUint256)).wait();
    const cfg = { ...loadConfig({}), dbFile: ':memory:', rpcUrls: [`http://127.0.0.1:${PORT}`], chainId: 43114, tokenAddress: await addr(fee),
      paymentsContract: payAddr.toLowerCase(), payFeeGas: 100000, treasuryAddress: (await addr(treasury)).toLowerCase(), legacyDeposits: false };
    const chain = createChain(cfg);
    const gasPrice = (await provider.getFeeData()).gasPrice;
    const odeme = async (miktar, ref) => { const tx = await pay.connect(playerW).pay(ASTRA(miktar), ref, { value: gasPrice * FEE_GAS, gasPrice }); await tx.wait(); return tx.hash; };

    // 1) Sunucunun doğrulayıcısı: sözleşme 100 bildirir, hazineye 90 ulaşır → kredi 90
    const trBefore = await fee.balanceOf(await addr(treasury));
    const ref1 = ethers.id('ucretli-1');
    const hash1 = await odeme(100, ref1);
    assert.equal((await fee.balanceOf(await addr(treasury))) - trBefore, ASTRA(90), 'hazineye 90 ulaştı');
    const v = await chain.verifyPayment(hash1, ref1);
    assert.equal(v.declared, 100, 'sözleşmenin bildirdiği 100');
    assert.equal(v.amount, 90, 'kredilenecek: gerçekten ulaşan 90');
    assert.equal(v.payer, (await addr(playerW)).toLowerCase());
    ok('verifyPayment (gerçek zincir): sözleşme 100 bildirir, hazineye 90 ulaşır → kredi 90');

    // 2) Uçtan uca: teklif → ödeme (teklif tutarı kadar) → onay reddedilir (ulaşan < teklif); kurtarma taraması ulaşanı yazar
    const db = openDb(':memory:');
    const E = await createEngine(db);
    const mailer = createMailer({ db, cfg, log: { log() {} } });
    const accounts = createAccounts({ db, cfg, mailer, verifyMessage: (m, s) => ethers.verifyMessage(m, s) });
    const payments = createPayments({ db, engine: E, accounts, chain, cfg, log: { error() {} } });
    const lastLink = kind => { const t = db.kvJson('dev:outbox', [])[0].text; const k = kind + '='; return /^[a-f0-9]+/.exec(t.slice(t.indexOf(k) + k.length))[0]; };
    const reg = await accounts.register('ucretli@ornek.com', 'gizli-sifre-123');
    const pid = reg.playerId;
    await accounts.verifyEmail(lastLink('verify'), 'gizli-sifre-123');
    const playerAddr = (await addr(playerW)).toLowerCase();
    await accounts.walletLink(pid, await new ethers.Wallet(keys[3]).signMessage(accounts.walletNonce(pid, playerAddr).message));
    accounts.walletConfirm(lastLink('wallet'));
    E.withPlayer(pid, () => null);

    const qt = payments.quote(pid, 'buySoldierUnit', []);
    assert.ok(qt.ok && qt.needPayment, JSON.stringify(qt));
    const bal0 = E.readPlayer(pid).adAstraBalance;
    const hash2 = await odeme(qt.amountAda, qt.ref);
    const red = await payments.confirm(pid, qt.ref, hash2);
    assert.equal(red.ok, false, 'teklif tutarı kadar GÖNDERİLDİ ama %10 kesildiği için ulaşan teklifin altında: onay reddedilir');
    assert.match(red.error, /az/);
    assert.equal(E.readPlayer(pid).soldierUnits.length, 0, 'işlem yapılmadı');
    assert.equal(E.readPlayer(pid).adAstraBalance, bal0, 'onay reddedilince bakiye değişmez');
    db.kvSet('chain:payBlock', 1);
    assert.ok((await payments.scanPaid()) >= 1, 'kurtarma taraması ödemeyi buldu');
    const kredi = E.readPlayer(pid).adAstraBalance - bal0;
    assert.ok(Math.abs(kredi - qt.amountAda * 0.9) < 1e-6, `bakiyeye GERÇEKTEN ulaşan eklendi (${kredi} ≈ ${qt.amountAda * 0.9}), bildirilen ${qt.amountAda} değil`);
    assert.ok(kredi < qt.amountAda, 'bedava ASTRA yok');
    assert.equal(await payments.scanPaid(), 0, 'aynı ödeme iki kez eklenmez');
    ok('Uçtan uca: teklif tutarı gönderilince onay reddedilir, kurtarma ulaşan %90\'ı bir kez bakiyeye ekler (bedava ASTRA yok, para kaybolmaz)');

    // 3) Ulaşan miktarı karşılayacak kadar fazla gönderen oyuncu normal akışla tamamlar; kredi ulaşan kadar
    const qt2 = payments.quote(pid, 'buySoldierUnit', []);
    assert.ok(qt2.ok && qt2.needPayment, 'ilk ödemeden kalan bakiye teklifi karşılamıyor: ' + JSON.stringify(qt2));
    const gonder = Math.ceil(qt2.amountAda / 0.9) + 1;
    const hash3 = await odeme(gonder, qt2.ref);
    const balOnce = E.readPlayer(pid).adAstraBalance;
    const cf = await payments.confirm(pid, qt2.ref, hash3);
    assert.ok(cf.ok, JSON.stringify(cf));
    assert.ok(Math.abs(cf.paid - gonder * 0.9) < 1e-6, `kredi ulaşan miktar (${cf.paid} ≈ ${gonder * 0.9})`);
    assert.equal(E.readPlayer(pid).soldierUnits.length, 1, 'işlem yapıldı');
    assert.ok(Math.abs(E.readPlayer(pid).adAstraBalance - (balOnce + gonder * 0.9 - qt2.cost)) < 1, 'bakiye = önceki + ulaşan − bedel');
    ok('Ulaşan miktar teklifi karşılıyorsa normal akış tamamlanır; kredi ulaşan kadardır (gönderilen değil)');
  }
} finally {
  await node.close();
}
console.log(`\n${passed} ücretli token kontrolü geçti.`);
process.exit(0);
