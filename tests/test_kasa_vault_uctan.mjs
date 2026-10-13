// Kasa modu (VAULT_CONTRACT) uçtan uca — yerel sahte zincirde (ganache), gerçek sunucu kodu + gerçek OyunKasasi sözleşmesi.
// Oyunun çekim/yakım/yapımcı ödemeleri düz cüzdandan DEĞİL kasadan çıkar; oyun cüzdanı yalnız "dağıtıcı" anahtardır.
// Denenenler: açılış denetimi uyuşmazlığında para çıkmaz, normal ödemeler (ref = satır no), tek ödeme tavanına göre
// parçalama (toplam tam), günlük bütçe dolunca bekleme ve ertesi gün TAM BİR KEZ tamamlanma, acil fren, yapımcı adresi
// uyuşmazlığı, yayın kopması + reconcile (çift ödeme yok), dağıtıcı anahtarı değişince sunucunun durması, günlük denetim.
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { compile } from '../contracts/compile.mjs';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createChain } from '../server/chain.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const ASTRA = v => ethers.parseUnits(String(v), 18);
const fromWei = v => Number(ethers.formatUnits(v, 18));

const keys = Array.from({ length: 4 }, () => ethers.Wallet.createRandom().privateKey);
const PORT = 23545 + Math.floor(Math.random() * 1000);
const node = ganache.server({ logging: { quiet: true }, wallet: { accounts: keys.map(k => ({ secretKey: k, balance: '0x' + (10n ** 21n).toString(16) })) }, chain: { chainId: 43114 } });
await node.listen(PORT);
try {
  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`, 43114, { staticNetwork: true, cacheTimeout: -1 });
  const owner = new ethers.NonceManager(new ethers.Wallet(keys[0], provider));
  const gameKey = keys[1];
  const gameAddr = new ethers.Wallet(gameKey).address.toLowerCase();
  const otherKey = keys[2];
  const c = compile();
  const dep = async (n, ...a) => { const k = await new ethers.ContractFactory(c[n].abi, c[n].bytecode, owner).deploy(...a); await k.waitForDeployment(); return k; };
  const kasaIface = new ethers.Interface(c.OyunKasasi.abi);

  const db = openDb(':memory:');
  const E = await createEngine(db);
  const CREATOR = String(E.GAME_CONFIG.CREATOR_WALLET_ADDRESS).toLowerCase();
  const baseCfg = loadConfig({});
  const DEAD = baseCfg.deadAddress;
  const token = await dep('MockToken');
  const tokenAddr = await token.getAddress();
  const kasa = await dep('OyunKasasi', tokenAddr, DEAD, { dagitici: gameAddr, creator: CREATOR, singleDrawBps: 200, dailyLimitBps: 1000 });
  const kAddr = (await kasa.getAddress()).toLowerCase();
  await (await token.mint(await owner.getAddress(), ASTRA(1_000_000))).wait();
  await (await token.connect(owner).approve(kAddr, ethers.MaxUint256)).wait();
  await (await kasa.connect(owner).deposit(ASTRA(1_000_000))).wait();
  const bal = a => token.balanceOf(a);

  let failBroadcast = 0;
  const providerFactory = u => {
    const p = new ethers.JsonRpcProvider(u, 43114, { staticNetwork: true, cacheTimeout: -1 });
    const orig = p.broadcastTransaction.bind(p);
    p.broadcastTransaction = async raw => { if (failBroadcast > 0) { failBroadcast--; throw new Error('bağlantı koptu (deneme)'); } return orig(raw); };
    return p;
  };
  const mkCfg = extra => ({ ...baseCfg, dbFile: ':memory:', rpcUrls: [`http://127.0.0.1:${PORT}`], chainId: 43114, tokenAddress: tokenAddr, gameWalletKey: gameKey, payoutMode: 'auto', weeklySendCapAda: 5e7, vaultContract: kAddr, vaultMaxDailyBps: 1000, ...extra })   // bu testin sayıları %10 günlük sınıra göre kurulu; üretim varsayılanı %5 (bölüm 1b);
  const mkWorld = cfg => createWorld({ db, engine: E, chain: createChain(cfg, { providerFactory }), cfg, log: { warn() {}, error() {}, log() {} } });
  const cfg = mkCfg({});
  const world = mkWorld(cfg);
  const P1 = '0x' + '11'.repeat(20), P2 = '0x' + '22'.repeat(20), P3 = '0x' + '33'.repeat(20);
  const add = (kind, to, amount, epoch = 1) => Number(db.q.payoutAdd.run(epoch, kind, to, amount, Date.now()).lastInsertRowid);
  const row = id => db.q.payoutGet.get(id);
  const rowsOf = epoch => db.raw.prepare('SELECT * FROM payouts WHERE epoch = ? ORDER BY id').all(epoch);

  // 1) Açılış denetimi: dağıtıcı oyun cüzdanı değilse sunucu kasadan HİÇBİR ŞEY göndermez
  {
    const kotu = await dep('OyunKasasi', tokenAddr, DEAD, { dagitici: new ethers.Wallet(otherKey).address, creator: CREATOR, singleDrawBps: 200, dailyLimitBps: 1000 });
    const w2 = mkWorld(mkCfg({ vaultContract: (await kotu.getAddress()).toLowerCase() }));
    const id = add('withdraw', P1, 10, 99);
    const r = await w2.processPayouts({ force: true });
    assert.match(String(r.skipped), /dağıtıcı anahtar oyun cüzdanı değil/, JSON.stringify(r));
    assert.equal(row(id).status, 'pending'); assert.equal(await bal(P1), 0n);
    db.raw.prepare('DELETE FROM payouts WHERE id = ?').run(id);
    ok('Açılış denetimi: kasadaki dağıtıcı oyun cüzdanı değilse hiçbir ödeme çıkmıyor (satır pending kalıyor)');
  }

  // 1b) Denetim K3 (14 Ekim 2026): zincirdeki kasa kararlaştırılan sınırdan (günlük %5, tek ödeme %2) gevşekse sunucu kasadan ödeme yapmaz
  {
    const gevsek = mkWorld(mkCfg({ vaultMaxDailyBps: undefined }));          // üretim varsayılanı: %5. Bu testin kasası %10 ile kurulu.
    const id = add('withdraw', P1, 10, 98);
    const r = await gevsek.processPayouts({ force: true });
    assert.match(String(r.skipped), /günlük çekim sınırı %10 .kararlaştırılan en çok %5./, JSON.stringify(r));
    assert.equal(row(id).status, 'pending'); assert.equal(await bal(P1), 0n);
    db.raw.prepare('DELETE FROM payouts WHERE id = ?').run(id);
    ok('Kasa sınırı denetimi: günlük sınırı %10 olan kasadan (karar %5) hiçbir ödeme çıkmıyor');
  }

  // 2) Normal ödemeler: kasadan, ref = satır numarası; oyun cüzdanı token tutmuyor
  const a = add('withdraw', P1, 1000, 2), b = add('burn', DEAD, 500, 2), cr = add('creator', CREATOR, 300, 2);
  const kasaBefore = await bal(kAddr);
  const r2 = await world.processPayouts({ force: true });
  assert.deepEqual([r2.sent, r2.failed], [3, 0], JSON.stringify(r2));
  assert.equal(await bal(P1), ASTRA(1000)); assert.equal(await bal(DEAD), ASTRA(500)); assert.equal(await bal(CREATOR), ASTRA(300));
  assert.equal(kasaBefore - (await bal(kAddr)), ASTRA(1800));
  assert.equal(await bal(gameAddr), 0n, 'Oyun cüzdanı hiç token tutmuyor');
  for (const [id, ad] of [[a, 'PlayerPaid'], [b, 'Burned'], [cr, 'CreatorPaid']]) {
    const rc = await provider.getTransactionReceipt(row(id).tx_hash);
    const ev = rc.logs.map(l => { try { return kasaIface.parseLog(l); } catch { return null; } }).find(x => x && x.name === ad);
    assert.ok(ev, ad + ' olayı'); assert.equal(BigInt(ev.args.ref), BigInt(id), 'ref = ödeme satırı numarası');
  }
  ok('Kasa modu: çekim/yakım/yapımcı kasadan çıktı (ref = satır no), oyun cüzdanı token tutmuyor');

  // 3) Tek ödeme tavanından büyük çekim: işlem anında parçalanır, toplam tam, her parça canlı tavanı aşmaz
  add('withdraw', P1, 50_000, 3);
  const p1Before = await bal(P1);
  const r3 = await world.processPayouts({ force: true });
  const parcalar = rowsOf(3);
  assert.ok(parcalar.length >= 3, 'birden çok parça: ' + parcalar.length);
  assert.ok(parcalar.every(r => r.status === 'sent'), JSON.stringify(parcalar.map(r => [r.amount, r.status])));
  assert.equal(Math.round(parcalar.reduce((s, r) => s + r.amount, 0) * 100) / 100, 50_000, 'Parçaların toplamı tam');
  assert.equal((await bal(P1)) - p1Before, ASTRA(50_000), 'Oyuncu tam 50.000 aldı');
  assert.ok(parcalar[0].amount <= 20_000 && parcalar[0].amount > 15_000, 'ilk parça ≈ kasanın %2\'si: ' + parcalar[0].amount);
  assert.equal(r3.sent, parcalar.length);
  ok(`Tavandan büyük çekim ${parcalar.length} parçaya bölündü (${parcalar.map(r => Math.round(r.amount)).join(' + ')}), toplam tam 50.000, oyuncuya tam bir kez`);

  // 4) Günlük bütçe: dolunca kalan bekler (pending), 24 saat sonra tam bir kez tamamlanır
  add('withdraw', P2, 200_000, 4);
  const p2Before = await bal(P2);
  const r4 = await world.processPayouts({ force: true });
  assert.equal(r4.skipped, 'vault-budget', JSON.stringify(r4));
  const gonderilen = (await bal(P2)) - p2Before;
  assert.ok(gonderilen > 0n && gonderilen < ASTRA(200_000), 'Bir kısmı gitti, kalan bekliyor: ' + fromWei(gonderilen));
  const kalanRow = rowsOf(4).find(r => r.status === 'pending');
  assert.ok(kalanRow && /günlük ödeme bütçesi dolu/.test(kalanRow.error), 'kalan satır bütçe mesajıyla bekliyor');
  assert.ok((await kasa.dailyRemaining()) < ASTRA(10_000), 'Günlük bütçe fiilen tükendi');
  assert.equal((await world.processPayouts({ force: true })).sent, 0, 'Aynı gün tekrar denense de bütçe yok');
  for (let i = 0; i < 6 && rowsOf(4).some(r => r.status === 'pending'); i++) {
    await provider.send('evm_increaseTime', [24 * 3600 + 60]); await provider.send('evm_mine', []);
    await world.processPayouts({ force: true });
  }
  const son = rowsOf(4);
  assert.ok(son.every(r => r.status === 'sent'), JSON.stringify(son.map(r => [r.amount, r.status])));
  assert.equal(Math.round(son.reduce((s, r) => s + r.amount, 0) * 100) / 100, 200_000);
  assert.equal((await bal(P2)) - p2Before, ASTRA(200_000), 'Oyuncu günler içinde tam 200.000 aldı, fazla/eksik yok');
  ok(`Günlük bütçe dolunca kalan bekledi; günler sonra tam bir kez tamamlandı (${son.length} parça, toplam tam 200.000)`);

  // 5) Acil fren: durmuşken hiçbir şey çıkmaz, açılınca bir kez gider
  await provider.send('evm_increaseTime', [24 * 3600 + 60]); await provider.send('evm_mine', []);
  await (await kasa.connect(owner).setPaused(true)).wait();
  const fr = add('withdraw', P3, 100, 5);
  const r5 = await world.processPayouts({ force: true });
  assert.equal(r5.skipped, 'vault-paused'); assert.equal(row(fr).status, 'pending'); assert.match(row(fr).error, /durdurulmuş/); assert.equal(await bal(P3), 0n);
  const hc = await world.checkHotWallet();
  assert.equal(hc.vault, true); assert.ok(hc.problems.some(p => /durdurulmuş/.test(p)), 'günlük denetim durmuş kasayı bildiriyor');
  await (await kasa.connect(owner).setPaused(false)).wait();
  assert.equal((await world.processPayouts({ force: true })).sent, 1);
  assert.equal(await bal(P3), ASTRA(100));
  ok('Acil fren: durmuşken para çıkmıyor ve denetim bildiriyor; açılınca tam bir kez gönderiliyor');

  // 6) Yapımcı adresi kasadakiyle uyuşmazsa ve kasa modunda olmayan türde satır bekler, para çıkmaz
  const yanlis = add('creator', P1, 40, 6), yedek = add('reserve', P1, 40, 6);
  const p1b = await bal(P1);
  await world.processPayouts({ force: true });
  assert.equal(row(yanlis).status, 'pending'); assert.match(row(yanlis).error, /Yapımcı adresi/);
  assert.equal(row(yedek).status, 'pending'); assert.match(row(yedek).error, /Kasa modunda bu ödeme türü yok/);
  assert.equal(await bal(P1), p1b);
  db.raw.prepare('DELETE FROM payouts WHERE epoch = 6').run();
  const hw = await world.checkHotWallet();
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM payouts WHERE kind = 'reserve'").get().n, 0, 'Kasa modunda yedek cüzdana aktarım kuyruğa girmez');
  assert.ok(hw.gameAvax > 0 && hw.walletAda > 0 && hw.vaultOk, 'günlük denetim: kasa uygun, dağıtıcının AVAX\'ı var');
  ok('Yapımcı adresi uyuşmazlığı ve kasada olmayan "reserve" türü bekliyor, para çıkmıyor; yedek aktarımı kuyruğa girmiyor');

  // 7) Yayın kopması: "sending", yeniden gönderilmez; reconcile aynı imzalı işlemi yayıp TEK ödeme yapar
  const kes = add('withdraw', P3, 77, 7);
  const p3b = await bal(P3);
  failBroadcast = 1;
  const r7 = await world.processPayouts({ force: true });
  assert.equal(r7.failed, 1); assert.equal(row(kes).status, 'sending'); assert.ok(row(kes).tx_hash);
  for (let i = 0; i < 3; i++) assert.equal((await world.processPayouts({ force: true })).sent, 0);
  await world.reconcilePayouts(); await world.reconcilePayouts();
  assert.equal(row(kes).status, 'sent'); assert.equal((await bal(P3)) - p3b, ASTRA(77), 'Tam bir kez');
  ok('Kasa modunda yayın koptu: satır yeniden gönderilmedi, reconcile ile tek ödeme (çift ödeme yok)');

  // 7b) Toz: tavan/adım kırpmasından artan 0,01 ASTRA'dan küçük kalan gönderilmez, olay olarak kaydedilir (satır kırpılan tutarla kapanır)
  {
    const once = await bal(P3);
    const toz = add('withdraw', P3, 100.004, 9);
    const rt = await mkWorld(cfg).processPayouts({ force: true });
    assert.deepEqual([rt.sent, rt.failed], [1, 0], JSON.stringify(rt));
    assert.equal((await bal(P3)) - once, ASTRA(100), 'yalnız 100,00 ASTRA gitti (0,004 toz)');
    assert.equal(row(toz).amount, 100); assert.equal(row(toz).status, 'sent');
    assert.ok(db.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'payout-dust'").get().n >= 1, 'toz olayı kaydedildi');
    ok('Toz: 0,01 ASTRA altı artık gönderilmez, olay kaydedilir; satır gönderilen tutarla kapanır');
  }

  // 8) Sahip dağıtıcıyı değiştirirse (24 saat sonra) sunucu ödemeyi durdurur — yeni anahtar tanımlanana kadar
  await (await kasa.connect(owner).proposeConfig({ dagitici: new ethers.Wallet(otherKey).address, creator: CREATOR, singleDrawBps: 200, dailyLimitBps: 1000 })).wait();
  const hala = add('withdraw', P3, 5, 8);
  assert.equal((await mkWorld(cfg).processPayouts({ force: true })).sent, 1, '24 saat dolmadan eski dağıtıcı çalışıyor');
  await provider.send('evm_increaseTime', [24 * 3600 + 60]); await provider.send('evm_mine', []);
  const yeni = add('withdraw', P3, 6, 8);
  const r8 = await mkWorld(cfg).processPayouts({ force: true });
  assert.match(String(r8.skipped), /dağıtıcı anahtar oyun cüzdanı değil/); assert.equal(row(yeni).status, 'pending');
  assert.equal(row(hala).status, 'sent');
  ok('Dağıtıcı anahtarı değişince (24 saat sonra) sunucu kasadan ödemeyi durduruyor; öncesinde sorunsuz çalışıyor');

  console.log(`\n${passed} kasa modu uçtan uca kontrolü geçti.`);
} finally {
  await node.close();
}
process.exit(0);
