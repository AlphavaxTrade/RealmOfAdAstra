// Ödeme kuyruğu GERÇEK (sahte) zincire karşı (T2, yerel doğrulama kampanyası): bugüne kadar processPayouts/reconcilePayouts
// yalnız sahte bir zincir nesnesiyle denenmişti; burada imza + nonce + yayın + onay yolu ganache'ta uçtan uca koşar.
// Denenenler: normal gönderim, yetersiz bakiye → yeniden deneme, yayın kopması → "sending" ASLA ikinci kez gönderilmez,
// reconcile ile toparlanma, başka işlem nonce'u tüketince yeniden sıraya girip TAM BİR KEZ ödenme, eşzamanlı nonce kuyruğu,
// haftalık gönderim sınırı, duraklatma.
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

const keys = Array.from({ length: 3 }, () => ethers.Wallet.createRandom().privateKey);
const PORT = 22545 + Math.floor(Math.random() * 1000);
const node = ganache.server({ logging: { quiet: true }, wallet: { accounts: keys.map(k => ({ secretKey: k, balance: '0x' + (10n ** 21n).toString(16) })) }, chain: { chainId: 43114 } });
await node.listen(PORT);
try {
  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`, 43114, { staticNetwork: true, cacheTimeout: -1 });
  const deployer = new ethers.NonceManager(new ethers.Wallet(keys[0], provider));
  const gameKey = keys[1];
  const gameAddr = new ethers.Wallet(gameKey).address.toLowerCase();
  const c = compile();
  const token = await new ethers.ContractFactory(c.MockToken.abi, c.MockToken.bytecode, deployer).deploy();
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  const bal = a => token.balanceOf(a);
  const P1 = '0x' + '11'.repeat(20), P2 = '0x' + '22'.repeat(20), P3 = '0x' + '33'.repeat(20), DEAD = '0x000000000000000000000000000000000000dEaD';

  let failBroadcast = 0;   // >0 iken sonraki yayınlar kopar
  const providerFactory = u => {
    const p = new ethers.JsonRpcProvider(u, 43114, { staticNetwork: true, cacheTimeout: -1 });
    const orig = p.broadcastTransaction.bind(p);
    p.broadcastTransaction = async raw => { if (failBroadcast > 0) { failBroadcast--; throw new Error('bağlantı koptu (deneme)'); } return orig(raw); };
    return p;
  };
  const cfg = { ...loadConfig({}), dbFile: ':memory:', rpcUrls: [`http://127.0.0.1:${PORT}`], chainId: 43114, tokenAddress: tokenAddr, gameWalletKey: gameKey, payoutMode: 'auto', weeklySendCapAda: 5e7 };
  const db = openDb(':memory:');
  const E = await createEngine(db);
  const chain = createChain(cfg, { providerFactory });
  const world = createWorld({ db, engine: E, chain, cfg, log: { warn() {}, error() {}, log() {} } });
  assert.ok(chain.canSend && chain.gameWallet === gameAddr);

  const add = (kind, to, amount) => Number(db.q.payoutAdd.run(1, kind, to, amount, Date.now()).lastInsertRowid);
  const row = id => db.q.payoutGet.get(id);

  // 1) Normal gönderim: üç tür, zincirde gerçek bakiyeler, imza kaydı, ardışık nonce
  await (await token.mint(gameAddr, ASTRA(100_000))).wait();
  const a = add('withdraw', P1, 1000), b = add('burn', DEAD, 50), cr = add('creator', P2, 30);
  const r1 = await world.processPayouts({ force: true });
  assert.deepEqual([r1.sent, r1.failed], [3, 0]);
  assert.equal(await bal(P1), ASTRA(1000)); assert.equal(await bal(DEAD), ASTRA(50)); assert.equal(await bal(P2), ASTRA(30));
  for (const id of [a, b, cr]) { const r = row(id); assert.equal(r.status, 'sent'); assert.ok(r.tx_hash && r.raw_tx && Number.isInteger(r.tx_nonce)); }
  assert.deepEqual([row(a).tx_nonce, row(b).tx_nonce, row(cr).tx_nonce].map((n, i, arr) => n - arr[0]), [0, 1, 2], 'nonce ardışık');
  assert.equal((await world.processPayouts({ force: true })).sent, 0, 'İkinci tur yeni bir şey göndermez');
  ok('Gerçek zincir: çekim/yakım/yapımcı gönderildi, zincirde bakiyeler doğru, imza kaydı ve ardışık nonce, ikinci tur boş');

  // 2) Yetersiz bakiye: gönderim imzadan önce reddedilir → satır pending + hata; para gelince TAM BİR KEZ gider
  const richBefore = await bal(gameAddr);
  const big = add('withdraw', P3, Number(ethers.formatUnits(richBefore, 18)) + 5000);
  const r2 = await world.processPayouts({ force: true });
  assert.equal(r2.failed, 1);
  assert.equal(row(big).status, 'pending'); assert.ok(row(big).error, 'hata kaydı var'); assert.equal(row(big).tx_hash, null, 'imza atılmadı');
  assert.equal(await bal(P3), 0n);
  await (await token.mint(gameAddr, ASTRA(100_000))).wait();
  const r3 = await world.processPayouts({ force: true });
  assert.equal(r3.sent, 1); assert.equal(row(big).status, 'sent');
  assert.equal(await bal(P3), ethers.parseUnits(String(Number(ethers.formatUnits(richBefore, 18)) + 5000), 18));
  ok('Yetersiz bakiye: ödeme imzalanmadan reddedildi, pending kaldı; bakiye gelince tam bir kez gönderildi');

  // 3) Yayın kopması: imzalandı+kaydedildi ama yayın koptu → "sending", TEKRAR GÖNDERİLMEZ; reconcile aynı işlemi yayar, tek ödeme
  const p3 = add('withdraw', P1, 111);
  const p1Before = await bal(P1);
  failBroadcast = 1;   // (tek RPC var) ilk yayın kopar, sonrakiler düzelir
  const r4 = await world.processPayouts({ force: true });
  assert.equal(r4.failed, 1);
  assert.equal(row(p3).status, 'sending'); assert.ok(row(p3).tx_hash && row(p3).raw_tx, 'imza kaydı var');
  assert.equal(await bal(P1), p1Before, 'Henüz zincirde yok');
  for (let i = 0; i < 3; i++) assert.equal((await world.processPayouts({ force: true })).sent, 0, 'sending satırı yeniden GÖNDERİLMEZ');
  const rc1 = await world.reconcilePayouts();    // aynı ham işlem yeniden yayılır
  const rc2 = await world.reconcilePayouts();    // zincirde görülür → sent
  assert.equal(row(p3).status, 'sent', JSON.stringify([rc1, rc2]));
  assert.equal((await bal(P1)) - p1Before, ASTRA(111), 'Tam bir kez ödendi');
  ok('Yayın koptu: satır "sending" kaldı ve hiç yeniden gönderilmedi; reconcile aynı imzalı işlemi yayıp tek ödeme yaptı');

  // 4) Nonce başka işlemce tüketilirse: reconcile "failed" der → pending → yeniden imzalanır, yine TAM BİR KEZ
  const p4 = add('withdraw', P2, 222);
  const p2Before = await bal(P2);
  failBroadcast = 1;
  await world.processPayouts({ force: true });
  assert.equal(row(p4).status, 'sending');
  const burnedNonce = row(p4).tx_nonce;
  await chain.sendAda(P3, 1);                        // aynı nonce'u başka bir işlem tüketir (4. işlem asla mine olamaz)
  const rc3 = await world.reconcilePayouts();
  assert.equal(rc3.retry, 1, JSON.stringify(rc3)); assert.equal(row(p4).status, 'pending');
  assert.equal(await bal(P2), p2Before, 'İlk imzalı işlem hiç işlenmedi');
  const r5 = await world.processPayouts({ force: true });
  assert.equal(r5.sent, 1); assert.equal(row(p4).status, 'sent');
  assert.ok(row(p4).tx_nonce > burnedNonce, 'Yeni imza yeni nonce ile');
  assert.equal((await bal(P2)) - p2Before, ASTRA(222), 'Tam bir kez ödendi (çift ödeme yok)');
  ok('Nonce tüketilince: reconcile yeniden sıraya aldı, yeni imzayla tam bir kez ödendi');

  // 5) Eşzamanlı gönderimler tek nonce kuyruğundan sırayla gider
  const before = [await bal(P1), await bal(P2), await bal(P3)];
  const hashes = await Promise.all([1, 2, 3, 4, 5, 6].map(i => chain.sendAda([P1, P2, P3][i % 3], i)));
  assert.equal(new Set(hashes).size, 6);
  const after = [await bal(P1), await bal(P2), await bal(P3)];
  assert.deepEqual(after.map((v, i) => v - before[i]), [ASTRA(3 + 6), ASTRA(1 + 4), ASTRA(2 + 5)], 'Altı eşzamanlı gönderimin altısı da tam bir kez');
  ok('Altı eşzamanlı gönderim nonce çakışması olmadan, her biri tam bir kez gitti');

  // 6) Haftalık gönderim sınırı yalnız çekimlere uygulanır; duraklatma her şeyi durdurur
  const since = Number(E.globalPool.state.epochStartTime) || Date.now() - 7 * 86400000;
  const used = db.raw.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM payouts WHERE kind='withdraw' AND status IN ('sent','sending') AND sent_at >= ?").get(since).t;
  cfg.weeklySendCapAda = used + 500;
  const w1 = add('withdraw', P1, 400), w2 = add('withdraw', P1, 400), yk = add('burn', DEAD, 400);
  const r6 = await world.processPayouts({ force: true });
  assert.equal(row(w1).status, 'sent'); assert.equal(row(w2).status, 'pending', 'ikinci çekim sınırı aştı'); assert.match(row(w2).error, /sınır/); assert.equal(row(yk).status, 'sent', 'yakım sınırdan etkilenmez');
  assert.equal(r6.sent, 2);
  cfg.weeklySendCapAda = 5e7;
  world.setPaused(true);
  assert.deepEqual(await world.processPayouts({ force: true }), { skipped: 'paused' });
  assert.equal(row(w2).status, 'pending');
  world.setPaused(false);
  assert.equal((await world.processPayouts({ force: true })).sent, 1);
  assert.equal(row(w2).status, 'sent');
  ok('Haftalık gönderim sınırı yalnız çekimleri tutar (yakım etkilenmez); duraklatılınca hiçbir şey çıkmaz, açılınca devam eder');

  console.log(`\n${passed} ödeme-zincir kontrolü geçti.`);
} finally {
  await node.close();
}
process.exit(0);
