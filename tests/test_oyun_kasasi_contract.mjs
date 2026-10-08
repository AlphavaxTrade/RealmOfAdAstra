// Oyun Kasası akıllı sözleşmesi (contracts/OyunKasasi.sol, E-planı Bölüm 3.1a, 8 Ekim 2026) — sahte zincirde (ganache)
// Kullanıcı kararı: içeri giren ASTRA bir daha HİÇBİR ZAMAN kişisel bir cüzdana çekilemez. Üç izinli çıkış yolu
// (oyuncuya ödeme, yakım, sabit yapımcı payı) dışında hiçbir fonksiyon yok; sahibin tek yetkisi durdur/devam et.
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { compile } from '../contracts/compile.mjs';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const c = compile();
const chainProvider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 6, defaultBalance: 1000 }, chain: { chainId: 43114 } });
const provider = new ethers.BrowserProvider(chainProvider, undefined, { cacheTimeout: -1 });
const [owner, dagitici, creator, player, stranger, attacker] = await Promise.all([0, 1, 2, 3, 4, 5].map(i => provider.getSigner(i)));
const addr = s => s.getAddress();

const deploy = async (name, signer, ...args) => {
  const f = new ethers.ContractFactory(c[name].abi, c[name].bytecode, signer);
  const k = await f.deploy(...args);
  await k.waitForDeployment();
  return k;
};
const expectRevert = async (p, errName) => {
  try { const tx = await p; await tx.wait(); } catch (e) {
    if (!errName) return;
    if (e.revert && e.revert.name === errName) return;
    const seen = new Set();
    const text = JSON.stringify(e, (k, v) => (typeof v === 'object' && v !== null ? (seen.has(v) ? undefined : (seen.add(v), v)) : typeof v === 'bigint' ? v.toString() : v));
    for (const hex of text.match(/0x[0-9a-fA-F]{8,}/g) || []) {
      try { if (kasaIface.parseError(hex)?.name === errName) return; } catch { /* başka veri */ }
    }
    throw new Error(`Beklenen hata ${errName}, gelen: ${String(e.shortMessage || e.message).slice(0, 200)}`);
  }
  throw new Error('İşlem başarısız olmalıydı: ' + errName);
};

const DEAD = '0x000000000000000000000000000000000000dEaD';
const ASTRA = v => ethers.parseUnits(String(v), 18);
const token = await deploy('MockToken', owner);
const initial = { dagitici: await addr(dagitici), creator: await addr(creator), singleDrawBps: 200, dailyLimitBps: 1000 };   // %2 tek ödeme, %10 günlük
const kasa = await deploy('OyunKasasi', owner, await token.getAddress(), DEAD, initial);
const kasaIface = kasa.interface;
const kasaAddr = await kasa.getAddress();

// 0) Sözleşmede HİÇBİR çekim/geri alma fonksiyonu yok — ABI'de ara, hiçbiri bulunamasın
const names = c.OyunKasasi.abi.filter(x => x.type === 'function').map(x => x.name);
assert.ok(!names.some(n => /withdraw|cek|rescue|recover|sweep|drain/i.test(n)), `Şüpheli fonksiyon adı bulundu: ${names.join(',')}`);
assert.deepEqual(names.filter(n => /pay|burn/i.test(n)).sort(), ['burn', 'payCreator', 'payPlayer'].sort(), 'Yalnız üç çıkış fonksiyonu var');
ok('ABI taraması: çekim/geri alma anlamına gelebilecek hiçbir fonksiyon yok, yalnız 3 izinli çıkış var');

// 1) Para girişi: approve + deposit, sözleşme bakiyesine gerçekten gider, Deposited olayı doğru
await (await token.mint(await addr(player), ASTRA(1_000_000))).wait();
await expectRevert(kasa.connect(player).deposit(ASTRA(1000)), 'TokenTransferFailed');   // izin yok
await (await token.connect(player).approve(kasaAddr, ethers.MaxUint256)).wait();
const dtx = await (await kasa.connect(player).deposit(ASTRA(200000))).wait();
assert.equal(await token.balanceOf(kasaAddr), ASTRA(200000), '200.000 ASTRA kasada');
const dep = dtx.logs.map(l => { try { return kasaIface.parseLog(l); } catch { return null; } }).find(x => x && x.name === 'Deposited');
assert.ok(dep && dep.args.from === await addr(player) && dep.args.amount === ASTRA(200000));
ok('Giriş: izinsiz yatıramaz, izin verince kasaya gerçekten geçiyor, olay doğru');

// 2) Üç izinli çıkış: yalnız dağıtıcı çağırabilir, doğru adreslere gider
await expectRevert(kasa.connect(stranger).payPlayer(await addr(player), ASTRA(100), ethers.id('r1')), 'NotDagitici');
await expectRevert(kasa.connect(stranger).burn(ASTRA(100), ethers.id('r2')), 'NotDagitici');
await expectRevert(kasa.connect(stranger).payCreator(ASTRA(100), ethers.id('r3')), 'NotDagitici');
const ptx = await (await kasa.connect(dagitici).payPlayer(await addr(player), ASTRA(100), ethers.id('odul-1'))).wait();
assert.equal(await token.balanceOf(await addr(player)), ASTRA(800100), 'Oyuncunun eski bakiyesi + ödül');
const pev = ptx.logs.map(l => { try { return kasaIface.parseLog(l); } catch { return null; } }).find(x => x && x.name === 'PlayerPaid');
assert.ok(pev && pev.args.to === await addr(player) && pev.args.amount === ASTRA(100));
await (await kasa.connect(dagitici).burn(ASTRA(50), ethers.id('yakim-1'))).wait();
assert.equal(await token.balanceOf(DEAD), ASTRA(50), 'Yakım ölü adrese gitti');
await (await kasa.connect(dagitici).payCreator(ASTRA(30), ethers.id('yapimci-1'))).wait();
assert.equal(await token.balanceOf(await addr(creator)), ASTRA(30), 'Yapımcı payı sabit cüzdana gitti');
ok('Başkası ödeme tetikleyemiyor; dağıtıcı üç yoldan (oyuncu/yakım/yapımcı) doğru adreslere gönderebiliyor');

// 3) Tek ödeme tavanı: kasanın %singleDrawBps'inden (şu an %2) fazlası tek seferde gidemez
const bal1 = await token.balanceOf(kasaAddr);
const cap1 = await kasa.singleDrawCap();
assert.equal(cap1, bal1 * 200n / 10000n);
await expectRevert(kasa.connect(dagitici).payPlayer(await addr(player), cap1 + 1n, ethers.id('asiri-1')), 'DrawTooLarge');
await (await kasa.connect(dagitici).payPlayer(await addr(player), cap1, ethers.id('tam-tavan'))).wait();
ok(`Tek ödeme tavanı doğru uygulanıyor (kasanın %2'si = ${ethers.formatUnits(cap1, 18)} ASTRA); üstü reddediliyor`);

// 4) Günlük toplam tavan: art arda ödemelerle tek-ödeme tavanını aşıp aşmadığını sınar (yüzlerce küçük ödeme bile 24 saatte kasanın %10'unu geçemez)
// Not: bakiye her ödemeyle küçüldüğü için hem tek-ödeme hem günlük tavan da küçülür; döngü her adımda sözleşmenin
// o anki CANLI değerlerini (singleDrawCap/dailyRemaining) okuyarak ilerler, önceden sabitlenmiş bir yüzde kullanmaz.
let adim = 0;
for (;;) {
  const step = await kasa.singleDrawCap();
  const remaining = await kasa.dailyRemaining();
  if (step > remaining) break;   // bir sonraki tam-tavan ödeme günlük sınırı aşar
  await (await kasa.connect(dagitici).payPlayer(await addr(player), step, ethers.id('seri-' + adim++))).wait();
}
const remaining = await kasa.dailyRemaining();
if (remaining > 0n) await expectRevert(kasa.connect(dagitici).payPlayer(await addr(player), remaining + 1n, ethers.id('tasma')), 'DailyLimitExceeded');
else await expectRevert(kasa.connect(dagitici).payPlayer(await addr(player), 1n, ethers.id('tasma')), 'DailyLimitExceeded');
ok('Günlük toplam tavan (kasanın %10\'u): tek ödeme tavanının altında kalan ardışık ödemeler bile toplamda aşamıyor');

// 5) 24 saat sonra pencere sıfırlanır
await provider.send('evm_increaseTime', [24 * 3600 + 5]);
await provider.send('evm_mine', []);
assert.ok((await kasa.dailyRemaining()) > 0n, 'Yeni günde tekrar ödeme yapılabilir');
await (await kasa.connect(dagitici).payPlayer(await addr(player), 1n, ethers.id('yeni-gun'))).wait();
ok('24 saat sonra günlük pencere sıfırlanıyor');

// 6) Acil fren: durunca üç çıkış da kilitlenir, para hiçbir yere gitmez; yalnız sahip durdurabilir
await expectRevert(kasa.connect(attacker).setPaused(true), 'NotOwner');
await (await kasa.setPaused(true)).wait();
await expectRevert(kasa.connect(dagitici).payPlayer(await addr(player), 1n, ethers.id('duruyken-1')), 'IsPaused');
await expectRevert(kasa.connect(dagitici).burn(1n, ethers.id('duruyken-2')), 'IsPaused');
await expectRevert(kasa.connect(dagitici).payCreator(1n, ethers.id('duruyken-3')), 'IsPaused');
assert.ok(await kasa.paused());
// Giriş (deposit) durdurulmuş halde de çalışır — kasıtlı: para girişini kısıtlamaya gerek yok, yalnız çıkışı
await (await kasa.connect(player).deposit(ASTRA(1))).wait();
await (await kasa.setPaused(false)).wait();
await (await kasa.connect(dagitici).payPlayer(await addr(player), 1n, ethers.id('acildiktan-sonra'))).wait();
ok('Acil fren: yalnız sahip durdurabilir, duruyken üç çıkış da kilitleniyor (giriş engellenmiyor), açılınca normale dönüyor');

// 7) Yakım her zaman sabit ölü adrese gider — ayara göre değişmez (immutable)
assert.equal(await kasa.deadAddress(), DEAD);
ok('Yakım adresi değiştirilemez (immutable), config ile ayarlanamıyor');

// 8) Ayar değişikliği (dağıtıcı/yapımcı/tavanlar): yalnız sahip önerebilir, 24 saat sonra geçerli, bu arada eski ayar çalışır
await expectRevert(kasa.connect(attacker).proposeConfig({ dagitici: await addr(attacker), creator: await addr(creator), singleDrawBps: 200, dailyLimitBps: 1000 }), 'NotOwner');
await expectRevert(kasa.proposeConfig({ dagitici: ethers.ZeroAddress, creator: await addr(creator), singleDrawBps: 200, dailyLimitBps: 1000 }), 'ZeroAddress');
await expectRevert(kasa.proposeConfig({ dagitici: await addr(dagitici), creator: await addr(creator), singleDrawBps: 1001, dailyLimitBps: 1000 }), 'LimitTooHigh');
await expectRevert(kasa.proposeConfig({ dagitici: await addr(dagitici), creator: await addr(creator), singleDrawBps: 200, dailyLimitBps: 3001 }), 'LimitTooHigh');
const newCfg = { dagitici: await addr(attacker), creator: await addr(creator), singleDrawBps: 200, dailyLimitBps: 1000 };
await (await kasa.proposeConfig(newCfg)).wait();
assert.equal((await kasa.current()).dagitici, await addr(dagitici), 'Hemen geçerli olmuyor — eski dağıtıcı hâlâ çalışıyor');
await (await kasa.connect(dagitici).payPlayer(await addr(player), 1n, ethers.id('gecis-oncesi'))).wait();
await expectRevert(kasa.connect(attacker).payPlayer(await addr(player), 1n, ethers.id('erken')), 'NotDagitici');
await provider.send('evm_increaseTime', [24 * 3600 + 5]);
await provider.send('evm_mine', []);
assert.equal((await kasa.activeConfig()).dagitici, await addr(attacker), '24 saat sonra yeni dağıtıcı aktif');
await (await kasa.connect(attacker).payPlayer(await addr(player), 1n, ethers.id('gecis-sonrasi'))).wait();
await expectRevert(kasa.connect(dagitici).payPlayer(await addr(player), 1n, ethers.id('eski-artik-calismaz')), 'NotDagitici');
ok('Dağıtıcı/ayar değişikliği önerildikten 24 saat sonra geçerli oluyor — saldırgan sahip anahtarını ele geçirse bile hemen boşaltamaz');

// 9) Bekleyen öneri geri çekilebilir
await (await kasa.proposeConfig({ dagitici: await addr(dagitici), creator: await addr(creator), singleDrawBps: 200, dailyLimitBps: 1000 })).wait();
await (await kasa.cancelConfig()).wait();
await provider.send('evm_increaseTime', [24 * 3600 + 5]);
await provider.send('evm_mine', []);
assert.equal((await kasa.activeConfig()).dagitici, await addr(attacker), 'Geri çekilen öneri uygulanmadı, önceki (attacker) ayar sürüyor');
ok('Bekleyen ayar değişikliği önerisi geri çekilebiliyor');

// 10) Doğrudan AVAX gönderimi reddedilir (receive/fallback yok)
await expectRevert(player.sendTransaction({ to: kasaAddr, value: 1n }));
ok('Sözleşmeye doğrudan AVAX gönderilemiyor (payable fonksiyon yok)');

// 11) Sahiplik iki adımlı
await (await kasa.transferOwnership(await addr(player))).wait();
assert.equal(await kasa.owner(), await addr(owner), 'Kabul edilmeden sahiplik geçmez');
await expectRevert(kasa.connect(attacker).acceptOwnership(), 'NotOwner');
await (await kasa.connect(player).acceptOwnership()).wait();
assert.equal(await kasa.owner(), await addr(player));
await expectRevert(kasa.setPaused(true), 'NotOwner');   // eski sahip artık yetkisiz
ok('Sahiplik iki adımda devredilir; devredilince eski sahip yetkisini kaybeder');

console.log(`\n${passed} sözleşme kontrolü geçti.`);
process.exit(0);
