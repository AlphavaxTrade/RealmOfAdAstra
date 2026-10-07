// ASTRA oranları (kullanıcı kararı 6 Ekim 2026): bütün oranlar RealmRates sözleşmesinde; değişiklik 24 saat sonra geçerli,
// oyun sunucusu sözleşmeden okuyup oyuna uygular. Ayrıca denetim düzeltmeleri: kendi kendine iyileşmedeki ASTRA artık
// kasalara gidiyor; kullanılan kutu/anahtar/parça/parşömen yakım kaydına giriyor. Sahte zincirde (ganache) denenir.
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { compile } from '../contracts/compile.mjs';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createChain } from '../server/chain.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';
import { WEEKLY_RULES } from '../server/economy.js';
import { ratesFromConfig, validateRates, toNamed, toArray, moneyFlows, RATE_COUNT, DEFAULT_RATES } from '../js/economy/rates.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const keys = Array.from({ length: 2 }, () => ethers.Wallet.createRandom().privateKey);
const PORT = 21545 + Math.floor(Math.random() * 1000);
const node = ganache.server({ logging: { quiet: true }, wallet: { accounts: keys.map(k => ({ secretKey: k, balance: '0x' + (10n ** 21n).toString(16) })) }, chain: { chainId: 43114 } });
await node.listen(PORT);
try {
  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`, 43114, { staticNetwork: true, cacheTimeout: -1 });
  const [owner, stranger] = keys.map(k => new ethers.Wallet(k, provider));   // düz cüzdan: reddedilen denemeler sıra numarasını kaydırmasın
  const c = compile();

  const db = openDb(':memory:');
  const E = await createEngine(db);
  const initial = ratesFromConfig(E.GAME_CONFIG, WEEKLY_RULES);
  assert.equal(initial.length, RATE_COUNT);
  assert.equal(validateRates(initial), null, 'Oyunun bugünkü oranları geçerli');
  assert.deepEqual(initial, DEFAULT_RATES, 'Panelde gösterilen başlangıç oranları oyunun ayarlarıyla aynı');
  const n0 = toNamed(initial);
  assert.deepEqual([n0.burn, n0.creator, n0.ubi, n0.pools], [500, 300, 600, 8600]);
  assert.deepEqual([n0.wheelCarnival, n0.dungeonGate, n0.lotteryAmorti, n0.marketFee, n0.withdrawFee, n0.withdrawFeeUbi], [8000, 10000, 200, 200, 300, 7000]);
  ok('Başlangıç oranları oyunun bugünkü ayarlarıyla aynı (%5/%3/%6/%86, çark %80, harç %100, piyango %2, pazar %2, çekim %3)');

  // ── Sözleşme ──
  const rates = await (await new ethers.ContractFactory(c.RealmRates.abi, c.RealmRates.bytecode, owner).deploy(initial)).waitForDeployment();
  const rAddr = await rates.getAddress();
  assert.deepEqual((await rates.active()).map(Number), initial);
  const bad1 = toNamed(initial); bad1.burn = 600;                     // toplam %101
  await assert.rejects(rates.propose(toArray(bad1)), /BadSpendSplit|revert/);
  const bad2 = toNamed(initial); bad2.dungeon += 100;
  await assert.rejects(rates.propose(toArray(bad2)), /BadPoolSplit|revert/);
  const bad3 = toNamed(initial); bad3.marketFee = 1500;                // en fazla %10
  await assert.rejects(rates.propose(toArray(bad3)), /RateTooHigh|revert/);
  await assert.rejects(rates.connect(stranger).propose(initial), /NotOwner|revert/);
  ok('Sözleşme: toplamı %100 olmayan, sınırı aşan ve sahibi olmayanın önerisi reddediliyor');

  const want = toNamed(initial);
  Object.assign(want, { burn: 1000, ubi: 500, pools: 8200, wheelCarnival: 7000, dungeonGate: 5000, marketFee: 300, withdrawFee: 400, withdrawFeeUbi: 5000, rent: 200 });
  const next = toArray(want);
  await (await rates.propose(next)).wait();
  assert.deepEqual((await rates.active()).map(Number), initial, 'Hemen geçerli olmaz');
  const [pend, at] = await rates.pending();
  assert.deepEqual(pend.map(Number), next);
  assert.ok(Number(at) > 0);
  await assert.rejects(rates.finalize(), /NotYet|revert/);
  ok('Öneri hemen geçerli olmuyor; bekleyen öneri ve zamanı herkese görünüyor');

  // ── Sunucu: sözleşmeden okur, oyuna uygular ──
  const cfg = { ...loadConfig({}), dbFile: ':memory:', rpcUrls: [`http://127.0.0.1:${PORT}`], chainId: 43114, ratesContract: rAddr };
  const world = createWorld({ db, engine: E, chain: createChain(cfg), cfg, log: { warn() {}, error() {} } });
  await world.syncRates();
  assert.ok(near(E.GAME_CONFIG.TOKEN_BURN_RATE, 0.05) && near(WEEKLY_RULES.fee, 0.03), '24 saat dolmadan eski oranlar');
  assert.ok(world.ratesStatus().pending, 'Panel bekleyen öneriyi görüyor');

  await provider.send('evm_increaseTime', [24 * 3600 + 5]);
  await provider.send('evm_mine', []);
  assert.deepEqual((await rates.active()).map(Number), next, '24 saat sonra yeni oranlar geçerli (finalize çağrılmadan da)');
  await world.syncRates();
  const G = E.GAME_CONFIG;
  assert.ok(near(G.TOKEN_BURN_RATE, 0.10) && near(G.UBI_POOL_RATE, 0.05) && near(G.TOKEN_REWARD_POOL_RATE, 0.82));
  assert.ok(near(G.CARNIVAL.WHEEL_CARNIVAL_SHARE, 0.7) && near(G.DUNGEON_GATE_POOL_SHARE, 0.5) && near(G.AMM_FEE_RATE, 0.03));
  assert.ok(near(WEEKLY_RULES.fee, 0.04) && near(WEEKLY_RULES.feeUbiShare, 0.5) && near(WEEKLY_RULES.rent, 0.02));
  assert.deepEqual(E.worldSnapshot().rates, next, 'Oyunculara giden dünya görüntüsünde yeni oranlar');
  ok('Sunucu 24 saat sonra yeni oranları sözleşmeden okuyup oyuna, haftalık çekim kurallarına ve oyuncu ekranına uyguluyor');

  // Yeni oranla dağıtım
  const gp = E.globalPool.state, T = E.treasury;
  const b = { spent: gp.totalSpent || 0, burned: gp.totalBurned || 0, ubi: gp.ubiWeekAccrued || 0, dungeon: T.getPool('dungeon') };
  E.globalPool.recordTokenSpend(10000);
  assert.ok(near((gp.totalBurned || 0) - b.burned, 1000), '%10 yakım');
  assert.ok(near((gp.ubiWeekAccrued || 0) - b.ubi, 500), '%5 temel gelir');
  assert.ok(near(T.getPool('dungeon') - b.dungeon, 10000 * 0.82 * want.dungeon / 10000), 'Zindan kasası yeni paydan');
  ok('Harcamalar yeni oranlarla bölünüyor (%10 yakım, %5 temel gelir, %82 kasalar)');
  const st = world.ratesStatus();
  assert.equal(st.source, 'contract');
  assert.ok(st.flows.length >= 8 && st.flows[0].where.includes('%10 yakım'), st.flows[0].where);
  const gate = moneyFlows(next).find(f => f.area.startsWith('Zindan')).where.split(' · ')[0];
  const gateTotal = 50 + 50 * 0.82 * want.dungeon / 10000;
  assert.equal(gate, `%${(Math.round(gateTotal * 100) / 100).toLocaleString('tr-TR')} zindan kasası (%50 doğrudan)`, gate);
  assert.ok(db.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'rates-changed'").get().n >= 1, 'Değişiklik olay kaydına yazıldı');
  ok('"ADA nereye gidiyor" listesi ve olay kaydı yeni oranları gösteriyor');

  // Geri çekme
  await (await rates.propose(initial)).wait();
  await (await rates.cancel()).wait();
  assert.equal(Number((await rates.pending())[1]), 0);
  await assert.rejects(rates.cancel(), /NothingPending|revert/);
  ok('Bekleyen öneri geri çekilebiliyor');

  // ── Denetim: kendi kendine iyileşmedeki ASTRA kasalara gidiyor ──
  const P = '0x' + '1'.repeat(40);
  E.withPlayer(P, gs => {
    gs.state.adAstraBalance = 1000;
    gs.state.inventory.wheat = 10000;
    gs.state.soldierUnits = [gs.createSoldierUnit(1)];
    gs.state.soldierUnits[0].maxHp = 100;
    gs.state.soldierUnits[0].hp = 10;
  });
  const before = gp.totalSpent || 0;
  let spentAda = 0;
  E.withPlayer(P, gs => {
    const a0 = gs.state.adAstraBalance;
    gs.processSoldierPassiveHealing(86400);
    spentAda = a0 - gs.state.adAstraBalance;
  });
  assert.ok(spentAda > 0.01, `iyileşme ASTRA harcadı (${spentAda})`);
  assert.ok(near((gp.totalSpent || 0) - before, spentAda, 0.02), `harcanan ASTRA deftere girdi (${(gp.totalSpent || 0) - before} / ${spentAda})`);
  ok('Kendi kendine iyileşmede harcanan ASTRA artık kaybolmuyor, her harcama gibi dağıtılıyor');

  // ── Kullanılan kutu ve anahtar yakım kaydına giriyor ──
  E.withPlayer(P, gs => {
    gs.state.lockedBoxes = 1; gs.state.arenaKeys = 1;
    const r = gs.unboxMysteryBox();
    assert.ok(r && r.success !== false, r && r.message);
    assert.equal(gs.state.burnedItems.boxes, 1);
    assert.equal(gs.state.burnedItems.keys, 1);
  });
  assert.ok((gp.totalBurnedItems.boxes || 0) >= 1 && (gp.totalBurnedItems.keys || 0) >= 1);
  ok('Açılan kutu ve kullanılan anahtar yakım kaydında (oyuncu ve dünya)');
} finally {
  await node.close();
}
console.log(`\n${passed} oran sözleşmesi kontrolü geçti.`);
process.exit(0);
