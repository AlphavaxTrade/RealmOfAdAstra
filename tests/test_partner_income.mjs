// Ortak gelir (trade sitesi, 6 Ekim 2026): PARTNER_INCOME_FROM cüzdanından PARTNER_INCOME_TO adresine gelen ADASTRA
// bir kez sayılır ve oyundaki her harcama gibi dağıtılır (%5 yakım, %6 temel gelir, %3 yapımcı, %86 ödül kasaları).
// Başka cüzdanlardan gelenler sayılmaz. Sahte zincirde (ganache) gerçek transferlerle denenir.
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
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const keys = Array.from({ length: 4 }, () => ethers.Wallet.createRandom().privateKey);
const PORT = 20545 + Math.floor(Math.random() * 1000);
const node = ganache.server({ logging: { quiet: true }, wallet: { accounts: keys.map(k => ({ secretKey: k, balance: '0x' + (10n ** 21n).toString(16) })) }, chain: { chainId: 43114 } });
await node.listen(PORT);
try {
  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`, 43114, { staticNetwork: true, cacheTimeout: -1 });
  const [owner, trade, stranger, incomeW] = keys.map(k => new ethers.NonceManager(new ethers.Wallet(k, provider)));
  const c = compile();
  const token = await (await new ethers.ContractFactory(c.MockToken.abi, c.MockToken.bytecode, owner).deploy()).waitForDeployment();
  const tAddr = await token.getAddress();
  const to = (await incomeW.getAddress()).toLowerCase();
  const tradeAddr = (await trade.getAddress()).toLowerCase();
  for (const w of [trade, stranger]) await (await token.mint(await w.getAddress(), ethers.parseUnits('1000000', 18))).wait();

  const cfg = { ...loadConfig({}), dbFile: ':memory:', rpcUrls: [`http://127.0.0.1:${PORT}`], chainId: 43114, tokenAddress: tAddr,
    partnerIncomeFrom: [tradeAddr], partnerIncomeTo: to };
  const db = openDb(':memory:');
  const E = await createEngine(db);
  const chain = createChain(cfg);
  const world = createWorld({ db, engine: E, chain, cfg, log: { warn() {}, error() {} } });

  // İlk tarama başlangıç bloğunu işaretler (geçmiş sayılmaz)
  assert.equal(await world.scanPartnerIncome(), 0);
  const gp = E.globalPool.state, T = E.treasury;
  const before = { spent: gp.totalSpent || 0, burned: gp.totalBurned || 0, creator: gp.creatorRoyaltyTotal || 0, ubi: gp.ubiWeekAccrued || 0,
    dungeon: T.getPool('dungeon'), quest: T.getPool('quest'), carnival: T.getPool('carnival') };

  // Trade sitesinden 10.000 ve 5.000 ADA; yabancı bir cüzdandan 7.777 ADA (sayılmamalı)
  await (await token.connect(trade).transfer(to, ethers.parseUnits('10000', 18))).wait();
  await (await token.connect(stranger).transfer(to, ethers.parseUnits('7777', 18))).wait();
  await (await token.connect(trade).transfer(to, ethers.parseUnits('5000', 18))).wait();

  const got = await world.scanPartnerIncome();
  assert.ok(near(got, 15000), `Yalnız trade sitesinin 15.000 ADA'sı sayıldı (${got})`);
  const A = E.GAME_CONFIG.TREASURY_ALLOCATION;
  assert.ok(near((gp.totalSpent || 0) - before.spent, 15000), 'Harcama olarak kaydedildi');
  assert.ok(near((gp.totalBurned || 0) - before.burned, 15000 * 0.05), '%5 yakım');
  assert.ok(near((gp.creatorRoyaltyTotal || 0) - before.creator, 15000 * 0.03), '%3 yapımcı payı');
  assert.ok(near((gp.ubiWeekAccrued || 0) - before.ubi, 15000 * 0.06), '%6 temel gelir');
  assert.ok(near(T.getPool('dungeon') - before.dungeon, 15000 * 0.86 * A.dungeon), 'Zindan kasası payını aldı');
  assert.ok(near(T.getPool('quest') - before.quest, 15000 * 0.86 * A.quest), 'Görev kasası payını aldı');
  assert.ok(near(T.getPool('carnival') - before.carnival, 15000 * 0.86 * A.carnival), 'Karnaval kasası payını aldı');
  ok('Trade sitesi geliri: yalnız onun cüzdanından gelenler, %5 yakım / %6 temel gelir / %3 yapımcı / %86 kasalar');

  // Aynı ödeme ikinci kez sayılmaz (tarama geri sarılsa bile)
  db.kvSet('chain:partnerBlock', 1);
  const again = await world.scanPartnerIncome();
  assert.equal(again, 0, 'Aynı ödemeler ikinci kez sayılmadı');
  assert.ok(near((gp.totalSpent || 0) - before.spent, 15000));
  const st = world.partnerIncomeStatus();
  assert.ok(st.enabled && st.count === 2 && near(st.totalAda, 15000) && near(st.weekAda, 15000), 'Yönetici paneli özeti');
  ok('Aynı ödeme iki kez sayılmıyor; yönetici paneli özeti doğru');
} finally {
  await node.close();
}
console.log(`\n${passed} ortak gelir kontrolü geçti.`);
process.exit(0);
