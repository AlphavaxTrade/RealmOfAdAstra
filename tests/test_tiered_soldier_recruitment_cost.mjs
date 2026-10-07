import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GameStateManager } from '../js/gameState.js';
import { GAME_CONFIG } from '../js/config.js';

// Mock localStorage
const localStorageMock = (function() {
  let store = {};
  return {
    getItem: function(key) { return store[key] || null; },
    setItem: function(key, value) { store[key] = value.toString(); },
    clear: function() { store = {}; },
    removeItem: function(key) { delete store[key]; }
  };
})();
global.localStorage = localStorageMock;

describe('⚔️ Kademeli Artan Asker Satın Alma Maliyeti Testi', () => {
  let gameState;

  beforeEach(() => {
    localStorage.clear();
    gameState = new GameStateManager();
    gameState.state.soldierUnits = [];
  });

  it('1. İlk askerin (1. asker) satın alma maliyeti tam olarak 5.000 $ADASTRA olmalı', () => {
    const cost1 = gameState.getSoldierCost(1);
    assert.strictEqual(cost1, GAME_CONFIG.SOLDIER_COST_BASE, 'İlk asker maliyeti taban (v2: 50 ASTRA) olmalıdır');
  });

  it('2. Daha fazla asker aldıkça maliyet kademeli olarak artmalı (cost(n) > cost(n-1))', () => {
    const cost1 = gameState.getSoldierCost(1);
    const cost2 = gameState.getSoldierCost(2);
    const cost3 = gameState.getSoldierCost(3);
    const cost5 = gameState.getSoldierCost(5);
    const cost10 = gameState.getSoldierCost(10);
    const cost18 = gameState.getSoldierCost(18);

    assert.strictEqual(cost1, GAME_CONFIG.SOLDIER_COST_BASE);
    assert.strictEqual(cost18, GAME_CONFIG.SOLDIER_18_TARGET_COST, '18. asker maliyeti hedef (v2: 18.000 ASTRA) olmalıdır');
    assert.ok(cost2 > cost1, `2. asker (${cost2}) 1. askerden (${cost1}) pahalı olmalı`);
    assert.ok(cost3 > cost2, `3. asker (${cost3}) 2. askerden (${cost2}) pahalı olmalı`);
    assert.ok(cost5 > cost3, `5. asker (${cost5}) 3. askerden (${cost3}) pahalı olmalı`);
    assert.ok(cost10 > cost5, `10. asker (${cost10}) 5. askerden (${cost5}) pahalı olmalı`);
    assert.ok(cost18 > cost10, `18. asker (${cost18}) 10. askerden (${cost10}) pahalı olmalı`);

    console.log('📊 Kademeli Asker Maliyetleri Tablosu:');
    console.log(`- 1. Asker: ${cost1.toLocaleString()} ADA`);
    console.log(`- 2. Asker: ${cost2.toLocaleString()} ADA`);
    console.log(`- 3. Asker: ${cost3.toLocaleString()} ADA`);
    console.log(`- 5. Asker: ${cost5.toLocaleString()} ADA`);
    console.log(`- 10. Asker: ${cost10.toLocaleString()} ADA`);
    console.log(`- 18. Asker: ${cost18.toLocaleString()} ADA (1.8 Milyon ADA)`);
  });

  it('3. buySoldierUnit fonksiyonu ilk askeri alırken tam 5.000 ADA tahsil etmeli', () => {
    const base = GAME_CONFIG.SOLDIER_COST_BASE;
    gameState.state.adAstraBalance = 2 * base;
    assert.strictEqual(gameState.state.soldierUnits.length, 0);

    const res = gameState.buySoldierUnit();
    assert.strictEqual(res.success, true, 'İlk asker satın alınabilmeli');
    assert.strictEqual(res.cost, base, 'Satın alma maliyeti taban kadar olmalı');
    assert.strictEqual(gameState.state.adAstraBalance, base, 'Kalan bakiye taban kadar olmalı');
    assert.strictEqual(gameState.state.soldierUnits.length, 1, 'Ordu boyutu 1 olmalı');

    // Şimdi 2. askeri almaya çalışsın: 5.000 ADA'sı var ama 2. asker ~11.900 ADA
    const cost2 = gameState.getSoldierCost(2);
    const res2 = gameState.buySoldierUnit();
    assert.strictEqual(res2.success, false, 'Bakiye yetersiz olduğu için 2. asker alınamamalı');
    assert.ok(res2.message.includes(cost2.toLocaleString()), 'Hata mesajı yeni kademe maliyetini içermeli');
  });
});
