// Demirhane: cephanelikteki (depodaki) eşyanın onarımı tam o eşyaya uygulanmalı. Eski ekran yuva adıyla çağırıyordu ve
// aynı yuvadaki KRALLIK eşyasını onarıyordu (depodaki eşya sağlam sanılıp hasarlı kalıyordu).
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: k => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: k => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const g = new GameStateManager();
g.state.adAstraBalance = 1e6;
g.state.inventory.iron = 5000; g.state.inventory.wood = 5000;

const esya = (id, durability) => ({ id, slot: 'helmet', name: 'Deneme Miğferi', icon: '🪖', level: 2, baseAtk: 0, baseHp: 20, atkBonus: 0, hpBonus: 20, durability, maxDurability: 13 });
g.state.equipment.helmet = esya('krallik', 3);       // krallık yuvasındaki eşya da hasarlı
g.state.armoryInventory = [esya('depo', 5)];

const liste = g.getAllArmoryEquipmentList();
const depodaki = liste.find(e => e.source === 'armory');
assert.ok(depodaki, 'depodaki eşya listede olmalı');

const r = g.repairEquipment(depodaki.item, depodaki.soldierIndex ?? null);
assert.ok(r.success, r.message);
assert.equal(g.state.armoryInventory[0].durability, 13, 'depodaki eşya onarılmalı');
assert.equal(g.state.equipment.helmet.durability, 3, 'krallık yuvasındaki eşyaya dokunulmamalı');
console.log('✅ depodaki eşyanın onarımı tam hedef eşyaya uygulanıyor');
