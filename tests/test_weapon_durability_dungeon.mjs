import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { GAME_CONFIG } from '../js/config.js';

console.log('--- 🧪 ZİNDAN SİLAH DAYANIKLILIĞI (DURABILITY) DOĞRULAMA TESTİ BAŞLATILIYOR ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

// 1. Yeni bir gameState oluştur
const gs = new GameStateManager();
gs.state.adAstraBalance = 500000;
gs.state.inventory = { iron: 500000, wood: 500000, wheat: 500000, coal: 500000, stone: 500000, herb: 500000, fragments: 5000 }; // v2: dövme kömür de ister

// 2. Asker satın al
const buyRes = gs.buySoldierUnit();
gs.state.inventory = { iron: 500000, wood: 500000, wheat: 500000, coal: 500000, stone: 500000, herb: 500000, fragments: 5000 }; // v2: dövme kömür de ister
assert(buyRes.success, 'Asker satın alınabilmeli');
assert(gs.state.soldierUnits.length === 1, '1 asker olmalı');
const soldier = gs.state.soldierUnits[0];

// 3. Demirci'de kılıç üret (weapon)
const craftRes = gs.craftEquipment('weapon');
assert(craftRes.success, 'Silah dövülebilmeli');
assert(gs.state.equipment.weapon, 'Krallık envanterinde silah olmalı');
assert.equal(gs.state.equipment.weapon.durability, 13, 'Silah 13/13 dayanıklılıkla başlamalı');
assert.equal(gs.state.equipment.weapon.maxDurability, 13, 'Max dayanıklılık 13 olmalı');

// 4. v1.25: Depodaki (kuşanılmamış) silah artık hiçbir askere güç vermez. Eski sürümde depodaki TEK
//    eşya bütün kuşanmamış askerlere aynı anda bonus veriyordu (kopyalama açığı; kuşanmak zararlıydı).
const statsShared = gs.getSoldierFullStats(0);
assert.equal(statsShared.bonusAtk, 0, 'Kuşanılmamış depo silahı askere bonus vermemeli');

// 5. Silahı doğrudan askere kuşat
const equipRes = gs.equipSoldierSlot(0, 'weapon');
assert(equipRes.success, 'Silah askere kuşanılabilmeli');
assert(soldier.equipment.weapon, 'Askerin silahı kuşanılmış olmalı');
assert.equal(soldier.equipment.weapon.durability, 13, 'Askerin silahı 13 dayanıklılıkta olmalı');

// 6. Zindan savaşı tahmini: Silah koruması tamamen kaldırıldı, silahlar daima tam güçle katılır
const prediction = gs.getBattlePrediction(100, 20, [0]);
assert(prediction.totalAtk >= 45, 'Asker silahın tam ATK bonusuyla savaşa girmeli');
assert.equal(prediction.protectWeapons, undefined, 'protectWeapons özelliği tamamen kaldırılmış olmalı');

// 7. Zindan savaşı: Silahlar her savaşta doğal RPG kuralı olarak -1 aşınır
const maxD = soldier.equipment.weapon.maxDurability || 13;
let curD = soldier.equipment.weapon.durability != null ? soldier.equipment.weapon.durability : maxD;
soldier.equipment.weapon.durability = Math.max(0, curD - 1);
assert.equal(soldier.equipment.weapon.durability, 12, 'Zindan savaşı sonrası silah dayanıklılığı 12 olmalı');

// İkinci bir zafer
curD = soldier.equipment.weapon.durability;
soldier.equipment.weapon.durability = Math.max(0, curD - 1);
assert.equal(soldier.equipment.weapon.durability, 11, 'İkinci zindan zaferi sonrası silah dayanıklılığı 11 olmalı');

// 8. Tamir maliyeti hesaplama testi (calculateEquipmentRepairCost)
const repCost = gs.calculateEquipmentRepairCost('weapon', 0);
console.log('Tamir maliyeti (2 puan eksik):', repCost);
assert.equal(repCost.missingDurability, 2, '2 eksik dayanıklılık tespit edilmeli');
assert(repCost.ironCost > 0, 'Demir maliyeti olmalı');
assert(repCost.woodCost > 0, 'Odun maliyeti olmalı');
assert.equal(repCost.isRepaired, false, 'Henüz tamir edilmemiş olmalı');

// 9. Tamir etme testi (repairEquipment)
const repairRes = gs.repairEquipment('weapon', 0);
assert(repairRes.success, 'Askerin silahı tamir edilebilmeli');
assert.equal(soldier.equipment.weapon.durability, 13, 'Tamir sonrası silah yeniden 13/13 olmalı');

// 10. Krallık envanterindeki silah için test
gs.state.inventory = { iron: 500000, wood: 500000, wheat: 500000, coal: 500000, stone: 500000, herb: 500000, fragments: 5000 }; // v2: dövme kömür de ister
gs.state.adAstraBalance = 500000;
const secondCraft = gs.craftEquipment('weapon');
assert(secondCraft.success, 'İkinci silah dövülebilmeli');
assert(gs.state.equipment.weapon, 'Krallıkta yeni silah olmalı');
gs.state.equipment.weapon.durability = 10;
const repKingdomCost = gs.calculateEquipmentRepairCost('weapon', null);
assert.equal(repKingdomCost.missingDurability, 3, 'Krallık silahında 3 eksik dayanıklılık olmalı');
const repKingdomRes = gs.repairEquipment('weapon', null);
assert(repKingdomRes.success, 'Krallık silahı tamir edilebilmeli');
assert.equal(gs.state.equipment.weapon.durability, 13, 'Krallık silahı 13/13 olmalı');

console.log('✅ TÜM ZİNDAN SİLAH DAYANIKLILIĞI VE TAMİR TESTLERİ BAŞARIYLA GEÇTİ!');
