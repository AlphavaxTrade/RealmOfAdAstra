// Tek dokunuşla toplama (19 Ekim 2026): Üretim Hakkı dolunca biten sefer toplanmaz; bunu oyuncuya söylemek için sonuçta hakBekleyen listesi döner
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
const gs = new GameStateManager();
gs.state.stamina = gs.getMaxStamina();

const basla = gs.startExpedition('wood');
assert.equal(basla.success, true, basla.message);
const sefer = gs.state.activeExpeditions.wood;
sefer.isCompleted = true;   // süre bitti kabul

// Hak bitti: bugün çıkarılabilir miktar yok
const gercek = gs.getUretimHakki.bind(gs);
gs.getUretimHakki = (k) => ({ ...gercek(k), canTake: 0, nextReleaseAt: Date.now() + 5 * 3600 * 1000 });
const r = gs.claimAndRestartAllExpeditions();
assert.equal(r.claimed, 0, 'hak yokken sefer toplanmaz');
assert.equal(r.hakBekleyen.length, 1, 'neden toplanmadığı sonuçta bildirilir');
assert.equal(r.hakBekleyen[0].ad, 'Odun');
assert.match(r.hakBekleyen[0].bekle, /sa|dk/, 'yeni hakkın ne zaman açılacağı yazılır');
assert.ok(gs.state.activeExpeditions.wood, 'mahsul seferde bekler, kaybolmaz');
console.log('✅ toplu toplama: hak dolunca neden toplanmadığı sonuçta bildirilir, mahsul kaybolmaz');
console.log('\n1 toplu toplama kontrolü geçti.');
