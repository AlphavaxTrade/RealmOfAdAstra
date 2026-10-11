// Alet dayanıklılığı yüklemede değişmemeli (eski hata: 100 ve altı değerler yüzde sanılıp 43,2 ile çarpılıyor,
// neredeyse kırık alet her yüklemede bedavaya yenileniyordu).
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: k => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: k => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');

const a = new GameStateManager();
const tam = a.state.tools.axe.durability;
assert.ok(tam > 1000, 'yeni oyuncunun aleti tam dayanıklılıkta');

for (const deger of [0, 1, 40, 100, 101, 2500]) {
  a.state.tools.axe.durability = deger;
  a.saveState();
  const b = new GameStateManager();
  assert.equal(b.state.tools.axe.durability, deger, `${deger} dakikalık dayanıklılık yüklemede değişti`);
}

// Dayanıklılığı hiç yazılmamış alet tam sayılır
a.state.tools.pickaxe = { totalGathered: 5 };
a.saveState();
const c = new GameStateManager();
assert.equal(c.state.tools.pickaxe.durability, tam);
assert.equal(c.state.tools.pickaxe.totalGathered, 5);
console.log('✅ alet dayanıklılığı yüklemede korunuyor');
