// v1.25 — Bot güvenlik payı ve hasat sırası
// 1) Bot, toplanmayı bekleyen hasadı varken pazardan gereksiz alım yapmaz.
// 2) Silo yükselt modunda 24 saat boyunca kasadaki güvenlik payı tamir masraflarıyla da erimez.
import assert from 'node:assert/strict';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const { HAMMADDE_ADEDI_CARPANI: Q } = await import('../js/config.js');
const { GameStateManager } = await import('../js/gameState.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

const fresh = () => {
  localStorage.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  return new GameStateManager();
};
const botOn = (gs, hours = 24) => {
  const t = Date.now() + hours * 3600e3;
  gs.state.botActiveUntil = t; gs.state.tavernaBotActive = true; gs.state.tavernaBotExpiresAt = t;
};

// 1) Depoda 40 demir var, biten demir seferinde 216 demir bekliyor → pazardan demir alınmamalı
{
  const gs = fresh();
  gs.state.adAstraBalance = 5000;
  gs.state.inventory = { wood: 300 * Q, iron: 40 * Q, wheat: 500 * Q, fragments: 0 };   // v2: Lv.1 silo 324/216/540
  botOn(gs);
  gs.startExpedition('iron');
  const exp = gs.state.activeExpeditions.iron;
  exp.elapsedSeconds = exp.durationSeconds;
  exp.isCompleted = true;
  let buys = 0;
  const b0 = ammMarket.executeBuyAmount.bind(ammMarket);
  ammMarket.executeBuyAmount = (k, a) => { buys++; return b0(k, a); };
  gs.runTavernaAutomationCycle();
  ammMarket.executeBuyAmount = b0;
  assert.equal(buys, 0, 'Hasat beklerken pazardan alım yapılmamalı');
  assert.ok(gs.state.inventory.iron >= 40 + 50, `Hasat depoya girmeli (demir ${gs.state.inventory.iron}; 18 dk sefer ~64 demir, tamir birkaçını kullanır)`);
  console.log('✅ Bot hasattan önce pazardan alım yapmıyor');
}

// 2) Silo yükselt modunda 24 saat: kasa güvenlik payının altına inmez
{
  const gs = fresh();
  gs.state.adAstraBalance = 5000;
  gs.state.inventory = { wood: 300 * Q, iron: 200 * Q, wheat: 500 * Q, stone: 300 * Q, coal: 250 * Q, herb: 60 * Q, fragments: 0 };   // v2: kapasite içinde
  gs.setBotSiloOption(true);
  gs.buyTavernaAutomationBot(true);
  const level0 = gs.state.warehouseLevel;
  gs.fastForwardTime(24);
  const reserve = gs.getBotAdaReserve();
  assert.ok(gs.state.warehouseLevel > level0, 'Bot siloyu büyütmeye devam etmeli');
  assert.ok(gs.state.adAstraBalance >= reserve - 1, `Kasada güvenlik payı kalmalı (kalan ${gs.state.adAstraBalance.toFixed(0)}, pay ${reserve})`);
  console.log(`✅ Silo modunda 24 saat sonra kasada ${gs.state.adAstraBalance.toFixed(0)} ASTRA kaldı (pay ${reserve}), silo ${level0} → ${gs.state.warehouseLevel}`);
}
