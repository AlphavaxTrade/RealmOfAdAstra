import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GameStateManager } from '../js/gameState.js';
import { globalPool } from '../js/globalPool.js';
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

describe('🔥 Evrensel Hammadde Yakımı (Resource Burn) ve Total Arzdan Düşüş Testi', () => {
  let gameState;

  beforeEach(() => {
    localStorage.clear();
    globalPool.state = globalPool.createNewEpoch();
    gameState = new GameStateManager();
  });

  it('1. Stamina buğday ile doldurulduğunda harcanan buğday anında yakılmalı ve total arzdan silinmeli', () => {
    const initialWheatCap = globalPool.state.resources.wheat.totalCap;
    const initialBurnedWheat = gameState.state.burnedResources.wheat || 0;

    gameState.state.stamina = 50;
    gameState.state.inventory.wheat = 1000;

    const res = gameState.refillStaminaExact(20);
    assert.strictEqual(res.success, true);
    assert.ok(res.wheatUsed > 0, 'Buğday kullanılmış olmalı');

    const burnedWheat = gameState.state.burnedResources.wheat;
    assert.strictEqual(burnedWheat, initialBurnedWheat + res.wheatUsed, 'Kullanıcının yaktığı buğday artmalı');

    // Total arz kontrolü:
    const newWheatCap = globalPool.state.resources.wheat.totalCap;
    assert.strictEqual(newWheatCap, initialWheatCap - res.wheatUsed, 'Küresel total buğday arzı (totalCap) eksilmeli');
    assert.strictEqual(globalPool.state.totalBurnedResources.wheat, res.wheatUsed, 'Küresel yakım sayacı artmalı');
  });

  it('2. Alet tamir edildiğinde harcanan odun ve demir yakılmalı ve total arzdan silinmeli', () => {
    const initialWoodCap = globalPool.state.resources.wood.totalCap;
    const initialIronCap = globalPool.state.resources.iron.totalCap;

    gameState.state.tools.axe.durability = 4000; // Az hasarlı balta (320 dk eksik)
    gameState.state.inventory.wood = 5000;
    gameState.state.inventory.iron = 5000;
    gameState.state.adAstraBalance = 100000;

    const cost = gameState.calculateRepairCost('axe');
    assert.ok(cost.woodCost > 0);
    assert.ok(cost.ironCost > 0);

    const res = gameState.repairTool('axe');
    assert.strictEqual(res.success, true);

    assert.strictEqual(gameState.state.burnedResources.wood, cost.woodCost, 'Yakılan odun kaydedilmeli');
    assert.strictEqual(gameState.state.burnedResources.iron, cost.ironCost, 'Yakılan demir kaydedilmeli');

    assert.strictEqual(globalPool.state.resources.wood.totalCap, initialWoodCap - cost.woodCost, 'Odun total arzdan silinmeli');
    assert.strictEqual(globalPool.state.resources.iron.totalCap, initialIronCap - cost.ironCost, 'Demir total arzdan silinmeli');
  });

  it('3. Silo (Ambar) yükseltildiğinde odun, demir ve buğday yakılmalı ve total arzdan silinmeli', () => {
    // v2: silo 6 hammadde ister; hepsi yakılır ve total arzdan düşer
    const keys = Object.keys(globalPool.state.resources);
    const initialCaps = Object.fromEntries(keys.map(k => [k, globalPool.state.resources[k].totalCap]));

    gameState.state.warehouseLevel = 1;
    for (const k of keys) gameState.state.inventory[k] = 50000;
    gameState.state.adAstraBalance = 100000;

    const cost = gameState.getWarehouseUpgradeCost(1);
    for (const k of cost.keys) assert.ok(cost.costs[k] > 0, `${k} bedeli pozitif olmalı`);

    const res = gameState.upgradeWarehouse();
    assert.strictEqual(res.success, true, res.message);

    for (const k of cost.keys) {
      assert.strictEqual(gameState.state.burnedResources[k], cost.costs[k], `${k} yakımı kaydedilmeli`);
      assert.strictEqual(globalPool.state.resources[k].totalCap, initialCaps[k] - cost.costs[k], `${k} total arzdan silinmeli`);
    }
  });

  it('4. Asker anında iyileştirildiğinde buğday yakılmalı ve total arzdan silinmeli', () => {
    const initialWheatCap = globalPool.state.resources.wheat.totalCap;

    const unit = gameState.createSoldierUnit(1);
    unit.hp = 10;
    unit.maxHp = 100;
    gameState.state.soldierUnits = [unit];
    gameState.state.inventory.wheat = 5000;
    gameState.state.adAstraBalance = 5000;

    const info = gameState.getSoldierHealInfo(0);
    assert.ok(info.wheatNeeded > 0);

    const res = gameState.instantHealSoldierUnit(0);
    assert.strictEqual(res.success, true);

    assert.strictEqual(gameState.state.burnedResources.wheat, info.wheatNeeded);
    assert.strictEqual(globalPool.state.resources.wheat.totalCap, initialWheatCap - info.wheatNeeded);
  });
});
