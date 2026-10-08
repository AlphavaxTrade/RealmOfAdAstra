// KARAR 5 (ikili çekim tavanı) ve KARAR 6 (tek fiyat çarpanı k) — E-planı, 8 Ekim 2026.
//  k = son günlerin piyasa değeri / 30 günlük zirve, 0,5–1,5; kilit açılma tabanına (haftalık %1 × k) ve çekim tavanına (× k) uygulanır.
//  Çekim tavanı = max(bugünkü kuralın %20'si, min(bugünkü kural × k, son 4 haftadaki dış alımın %50'si)).
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';
import { priceFactorK, dualWithdrawCap, netTokenFlow, withdrawCapTokens } from '../server/economy.js';
import { gameState } from '../js/gameState.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const DAY = 86400000;

// 1) k: sınırlar ve veri yokluğu
{
  assert.equal(priceFactorK({ cur: 80, peak: 100 }), 0.8);
  assert.equal(priceFactorK({ cur: 10, peak: 100 }), 0.5, 'alt sınır 0,5');
  assert.equal(priceFactorK({ cur: 300, peak: 100 }), 1.5, 'üst sınır 1,5');
  assert.equal(priceFactorK({}), 1, 'veri yoksa 1');
  assert.equal(priceFactorK({ cur: 5, peak: 0 }), 1);
  ok('k: cur/peak oranı 0,5–1,5 aralığına sıkıştırılır; veri yoksa 1');
}

// 2) İkili tavan
{
  const base = 1000;
  assert.equal(dualWithdrawCap({ baseCap: base, k: 1, externalBuy: 0 }), 200, 'dış alım sıfır: bugünkü kuralın %20\'si (çekim kilitlenmez)');
  assert.equal(dualWithdrawCap({ baseCap: base, k: 1, externalBuy: 1e9 }), 1000, 'dış alım çok büyük: bugünkü kural');
  assert.equal(dualWithdrawCap({ baseCap: base, k: 1, externalBuy: 1200 }), 600, 'orta: dış alımın %50\'si');
  assert.equal(dualWithdrawCap({ baseCap: base, k: 0.5, externalBuy: 1e9 }), 500, 'k çekim tavanını da ölçekler');
  assert.equal(dualWithdrawCap({ baseCap: base, k: 0.5, externalBuy: 100 }), 200, 'taban k\'den etkilenmez (bugünkü kuralın %20\'si)');
  assert.equal(dualWithdrawCap({ baseCap: 0, k: 1, externalBuy: 5 }), 0);
  ok('İkili tavan: dış alım yokken %20 taban, çokken bugünkü kural, arada dış alımın yarısı; k tavanı ölçekler');
}

// 3) Net token akışı
{
  const eg = (s) => ({ graduated: false, curveSupply: s });
  assert.equal(netTokenFlow(eg(100), eg(160)), 60, 'eğride arz artışı = net alım');
  assert.equal(netTokenFlow(eg(160), eg(100)), -60, 'satım negatif');
  const dx = (r) => ({ graduated: true, poolTokenReserve: r });
  assert.equal(netTokenFlow(dx(1000), dx(900)), 100, 'havuzdan token çıkması = alım');
  assert.equal(netTokenFlow(eg(100), dx(900)), 0, 'geçiş anı ölçülmez');
  assert.equal(netTokenFlow(null, eg(1)), 0);
  ok('netTokenFlow: eğri ve havuz için alım +, satım −; geçişte ve ilk ölçümde 0');
}

// 4) Dünya: günlük akış kutuları, 4 hafta penceresi, ortak gelir payı, canlı tavan
{
  const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true, weeklySendCapAda: 1e12 };
  const db = openDb(':memory:');
  const engine = await createEngine(db, { testMode: true });
  let T = Date.UTC(2026, 9, 8, 12);
  const clock = () => T;
  let supply = 1e9, mcap = 1000;
  const chain = {
    gameWallet: '0x' + '11'.repeat(20), canSend: true,
    async readMarket() { return { at: T, graduated: false, supply, dead: 0, curveSupply: supply, priceAvax: 1e-8, avaxUsd: 10, priceUsd: 1e-7, mcapUsd: mcap, walletAda: 1e12 }; },
    async latestBlock() { return 1; }
  };
  const world = createWorld({ db, engine, chain, cfg, clock, log: { warn() {}, error() {} } });
  const base = () => withdrawCapTokens({ graduated: false, curveSupply: supply });

  await world.snapshotMarket();                       // ilk ölçüm: akış 0
  assert.equal(world.externalBuy(), 0);
  assert.ok(near(world.currentCap(), base() * 0.2, 1), 'dış alım yok: tavan = bugünkü kuralın %20\'si');

  T += 2 * DAY; supply += 4e6;                        // 4 milyon token net alım
  await world.snapshotMarket();
  assert.ok(near(world.externalBuy(), 4e6, 1), 'net alım ölçüldü');
  const want = Math.max(base() * 0.2, Math.min(base(), 4e6 * 0.5));
  assert.ok(near(world.currentCap(), want, 1), `tavan = max(%20 taban, min(kural, alımın %50'si)): ${world.currentCap()} ≈ ${want}`);

  db.raw.prepare('INSERT INTO partner_income (tx_hash, log_index, sender, amount, block, at) VALUES (?, ?, ?, ?, ?, ?)').run('0xaa', 0, '0xbb', 1e6, 1, T);
  assert.ok(near(world.externalBuy(), 5e6, 1), 'trade sitesi payı dış alıma eklenir');

  T += 30 * DAY;                                      // 4 haftalık pencere dışına çıktı
  assert.equal(world.externalBuy(), 0, '28 günden eski alım ve ortak gelir sayılmaz');

  supply -= 3e6; T += DAY;                            // satım: negatif net akış, dış alım 0'ın altına inmez
  await world.snapshotMarket();
  assert.equal(world.externalBuy(), 0);
  ok('Dünya: akış günlük kutularda tutulur, pencere 28 gün, ortak gelir eklenir, tavan canlı hesaplanır');

  // k: fiyat zirveden düşünce
  mcap = 1000; T += DAY; await world.snapshotMarket();
  mcap = 600; T += DAY; await world.snapshotMarket();
  const k = world.econ().k;
  assert.ok(k >= 0.5 && k < 1, `fiyat düşünce k 1'in altında: ${k}`);
  ok(`Dünya: fiyat zirvenin altına inince k = ${k}`);

}

// 5) Kilit açılma tabanı k ile ölçeklenir; giriş günü primi sabit
{
  const run = k => {
    gameState.vanillaReset();
    gameState.state.adAstraBalance = 100000; gameState.state.lockedAda = 100000;
    gameState.state.unlockK = k;
    gameState._calendarNow = () => 1e12;
    gameState.state.lockUnlock = { lastAt: 1e12 - 7 * DAY, activeDay: new Date(1e12 + 3 * 3600 * 1000).toISOString().slice(0, 10) };   // bugünkü giriş primi zaten işlendi
    gameState.processLockedUnlock();
    return 100000 - gameState.state.lockedAda;       // bu hafta açılan miktar
  };
  const k1 = run(1), k05 = run(0.5);
  assert.ok(near(k1, 1000, 1), `k=1: haftalık %1 açılır (${k1})`);
  assert.ok(near(k05, 500, 1), `k=0,5: haftalık %0,5 açılır (${k05})`);
  const f = (() => { gameState.state.unlockK = 0.5; return gameState.getLockedUnlockForecast(); })();
  assert.ok(near(f.weeklyBasePct, 0.5, 1e-9) && near(f.weeklyActivePct, 1.4, 1e-9), 'tahmin ekranı: taban ×k, giriş primi %1,4 sabit');
  ok('Kilit açılma: taban haftalık %1 × k; giriş günü primi (%1,4) k\'den etkilenmez');
}

console.log(`\n${passed} KARAR 5/6 kontrolü geçti.`);
process.exit(0);
