// Asker adı değiştirme kuralları ve boştaki seviye 1 eşyaların hurdaya çevrilmesi (parça + demir, rapor dökümü).
// 11 Ekim 2026'da test_soldier_rename.mjs ve test_scrap_equipment_modal_and_rewards.mjs'ten baştan yazıldı.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');

// 1) Ad değiştirme
{
  const gs = new GameStateManager();
  gs.state.soldierUnits = [
    { id: 1, name: 'AdAstra Piyadesi', level: 1, hp: 100, maxHp: 100, baseAtk: 20, skills: ['shieldWall'] },
    { id: 2, name: 'AdAstra Okçusu', level: 10, hp: 120, maxHp: 120, baseAtk: 28, skills: ['shieldWall', 'shockwave'] }
  ];
  const r = gs.renameSoldierUnit(0, 'Kuzey Muhafızı');
  assert.equal(r.success, true);
  assert.equal(gs.state.soldierUnits[0].name, 'Kuzey Muhafızı');
  assert.equal(r.oldName, 'AdAstra Piyadesi');
  assert.equal(r.newName, 'Kuzey Muhafızı');
  assert.equal(gs.renameSoldierUnit(0, '   ').success, false, 'boş ad reddedilir');
  assert.equal(gs.renameSoldierUnit(0, 'BuCokUzunBirAskerIsmiOlduguIcinReddedilmeli').success, false, '24 karakterden uzun ad reddedilir');
  assert.equal(gs.renameSoldierUnit(99, 'Yeni İsim').success, false, 'olmayan asker');
  assert.equal(gs.state.soldierUnits[0].name, 'Kuzey Muhafızı', 'reddedilen denemeler adı değiştirmez');
  assert.equal(gs.state.soldierUnits[1].name, 'AdAstra Okçusu', 'diğer asker etkilenmez');
}
console.log('✅ asker adı');

// 2) Hurda: boştaki seviye 1 eşyalar parçaya ve demire döner, üst seviye ve askerdeki eşya korunur
{
  const gs = new GameStateManager();
  const s = gs.state;
  const parca = s.inventory.fragments || 0;
  const demir = s.inventory.iron || 0;
  s.armoryInventory = [
    { id: 'w1', name: 'Paslı Kılıç', slot: 'weapon', level: 1, icon: '🗡️' },
    { id: 'h1', name: 'Demir Miğfer', slot: 'helmet', level: 1, icon: '🪖' },
    { id: 'a1', name: 'Eski Zırh', slot: 'armor', level: 1, icon: '🛡️' },
    { id: 'w2', name: 'Usta Kılıcı', slot: 'weapon', level: 2, icon: '⚔️' }
  ];
  const r = gs.scrapAllLowTierEquipment(1);
  assert.equal(r.success, true);
  assert.equal(r.scrappedCount, 3);
  assert.equal(r.gainedFragments, 6, 'eşya başına 2 parça');
  assert.equal(r.gainedIron, 30, 'eşya başına 10 demir');
  assert.deepEqual(r.scrappedItems.map((e) => e.name), ['Paslı Kılıç', 'Demir Miğfer', 'Eski Zırh']);
  assert.deepEqual(s.armoryInventory.map((e) => e.name), ['Usta Kılıcı'], 'seviye 2 korunur');
  assert.equal(s.inventory.fragments, parca + 6);
  assert.equal(s.inventory.iron, demir + 30);

  // askerin üzerindeki eşya hurdaya girmez
  const asker = gs.createSoldierUnit(1);
  asker.equipment = { weapon: { name: 'Kuşanılmış Kılıç', slot: 'weapon', level: 1, icon: '🗡️' } };
  s.soldierUnits = [asker];
  s.armoryInventory = [];
  const bos = gs.scrapAllLowTierEquipment(1);
  assert.equal(bos.success, false);
  assert.equal(bos.scrappedCount, 0);
  assert.equal(asker.equipment.weapon.name, 'Kuşanılmış Kılıç', 'askerdeki eşya silinmez');
}
console.log('✅ hurda');

console.log('\n2/2 asker adı ve hurda bloğu geçti.');
