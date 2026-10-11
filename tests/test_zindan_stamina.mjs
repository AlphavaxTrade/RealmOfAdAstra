// Zindan stamina bedeli: asker başına (5 + kat) formülü, giriş kontrolü ve düşüm; yetersiz staminada hiçbir şey değişmez.
// 11 Ekim 2026'da test_dungeon_stamina_and_levels.mjs'ten baştan yazıldı.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');

const tablo = GAME_CONFIG.DUNGEON_STAMINA_COST_PER_SOLDIER;
assert.equal(tablo.BASE_PER_SOLDIER, 5);
for (let kat = 1; kat <= 18; kat++) assert.equal(tablo[kat], 5 + kat, `kat ${kat} asker başı bedeli`);
console.log('✅ 18 katın bedel tablosu formüle uyuyor');

const gs = new GameStateManager();
assert.equal(gs.getDungeonStaminaCost(1, 1), 6);
assert.equal(gs.getDungeonStaminaCost(1, 3), 18);
assert.equal(gs.getDungeonStaminaCost(10, 2), 30);
assert.equal(gs.getDungeonStaminaCost(18, 3), 69);
assert.equal(gs.getDungeonStaminaCost(1, 0), 0);
console.log('✅ bedel kata ve ordu boyutuna göre');

gs.state.stamina = 50;
const uygun = gs.canEnterDungeon(1, 3);
assert.deepEqual([uygun.canEnter, uygun.cost, uygun.current], [true, 18, 50]);
const dus = gs.deductDungeonStamina(1, 3);
assert.equal(dus.success, true);
assert.equal(dus.cost, 18);
assert.equal(gs.state.stamina, 32);

const yetmez = gs.canEnterDungeon(18, 2);   // 46 gerekir, 32 var
assert.equal(yetmez.canEnter, false);
assert.equal(yetmez.missing, 14);
assert.equal(gs.deductDungeonStamina(18, 2).success, false);
assert.equal(gs.state.stamina, 32, 'başarısız düşümde stamina değişmez');
console.log('✅ giriş kontrolü ve düşüm');

gs.vanillaReset();
assert.equal(gs.state.stamina, 100, 'ilk güne dönünce stamina 100');
assert.equal(gs.getDungeonStaminaCost(1, 1), 6);
console.log('✅ ilk güne dönüş sonrası');

console.log('\n4/4 zindan stamina bloğu geçti.');
