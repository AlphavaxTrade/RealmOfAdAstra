import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import '../js/config.js';

console.log('--- 🧪 SINIRSIZ SİLAH ÜRETİMİ & CEPHANELİK (ARMORY) TESTİ BAŞLATILIYOR ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();
gs.state.warehouseLevel = 18;
gs.state.adAstraBalance = 2000000;
gs.state.inventory = { iron: 500000, wood: 500000, wheat: 500000, coal: 500000, stone: 500000, herb: 500000, fragments: 5000 }; // v2: teçhizat kömür de ister

// 1. İlk silahı üret (Krallık ana yuvasına girmeli)
const c1 = gs.craftEquipment('weapon');
assert(c1.success, '1. Silah üretilebilmeli');
assert(gs.state.equipment.weapon, '1. Silah krallık ana yuvasında olmalı');

// 2. İKİNCİ silahı üret (Eski sistemde hata veriyordu, şimdi Cephanelik Deposu\'na girmeli!)
const c2 = gs.craftEquipment('weapon');
assert(c2.success, '2. Silah üretilebilmeli (Sınırsız üretim engelsiz çalışmalı)');
assert.equal(gs.state.armoryInventory.length, 1, '2. Silah armoryInventory deposuna eklenmeli');
assert.equal(gs.state.armoryInventory[0].slot, 'weapon', 'Cephanelikteki eşya silah olmalı');

// 3. ÜÇÜNCÜ bir kask (helmet) ve DÖRDÜNCÜ bir zırh (armor) üret
gs.craftEquipment('helmet'); // krallık ana yuvasına
gs.craftEquipment('helmet'); // cephaneliğe
gs.craftEquipment('armor');  // krallık ana yuvasına
gs.craftEquipment('armor');  // cephaneliğe

assert.equal(gs.state.armoryInventory.length, 3, 'Cephanelikte 3 adet boşta eşya olmalı (1 silah, 1 miğfer, 1 zırh)');

// 4. getAllArmoryEquipmentList() doğrulaması
const allList = gs.getAllArmoryEquipmentList();
console.log(`Toplam kayıtlı teçhizat sayısı: ${allList.length}`);
assert(allList.length >= 6, 'Toplamda en az 6 teçhizat listelenmeli (3 krallık + 3 cephanelik)');

// 5. upgradeAnyEquipment() testi (Cephanelikteki boşta silahı Lv.1 -> Lv.2 yap)
gs.state.inventory = { iron: 500000, wood: 500000, wheat: 500000, coal: 500000, stone: 500000, herb: 500000, fragments: 5000 }; // v2: teçhizat kömür de ister
gs.state.adAstraBalance = 2000000;
const upRes = gs.upgradeAnyEquipment({ source: 'armory', armoryIndex: 0 });
assert(upRes.success, 'Cephanelikteki eşya tek tıkla seviye atlayabilmeli');
assert.equal(gs.state.armoryInventory[0].level, 2, 'Cephanelikteki silah Seviye 2 olmalı');

// 6. Asker satın al ve cephanelikteki Seviye 2 kılıcı doğrudan askere kuşandır
const bRes = gs.buySoldierUnit();
assert(bRes.success, 'Asker satın alınabilmeli');
const sIdx = 0;
const soldier = gs.state.soldierUnits[0];

const equipRes = gs.equipSoldierFromDepot(sIdx, { source: 'armory', slotKey: 'weapon', armoryIndex: 0 });
assert(equipRes.success, 'Cephanelikteki silah doğrudan askere kuşandırılabilmeli');
assert(soldier.equipment.weapon, 'Asker silahı kuşanmış olmalı');
assert.equal(soldier.equipment.weapon.level, 2, 'Asker Seviye 2 silahı kuşanmış olmalı');

// 7. unequipSoldierToArmory() testi
const unequipRes = gs.unequipSoldierToArmory(sIdx, 'weapon');
assert(unequipRes.success, 'Silah askerden çıkarılıp cephaneliğe aktarılabilmeli');
assert.equal(soldier.equipment.weapon, null, 'Askerin silah yuvası boşalmalı');
const returnedWeapon = gs.state.armoryInventory.find(e => e.slot === 'weapon' && e.level === 2);
assert(returnedWeapon, 'Seviye 2 silah cephaneliğe geri dönmüş olmalı');

// 8. Toplu Onarım Testi (repairAllEquipmentInKingdom)
returnedWeapon.durability = 5;
gs.state.equipment.weapon.durability = 8;
const repAllRes = gs.repairAllEquipmentInKingdom();
assert(repAllRes.success, 'Tüm krallık ve cephanelik teçhizatı tek tıkla onarılabilmeli');
assert.equal(returnedWeapon.durability, 13, 'Cephanelikteki silah 13/13 olmalı');
assert.equal(gs.state.equipment.weapon.durability, 13, 'Krallık silahı 13/13 olmalı');

// 9. autoEquipBest() entegrasyon testi
const autoRes = gs.autoEquipBest();
assert(autoRes.success, 'autoEquipBest cephanelik deposundan askere en iyi teçhizatı takabilmeli');
assert(soldier.equipment.weapon, 'Asker otomatik olarak en iyi silahı kuşanmış olmalı');
assert.equal(soldier.equipment.weapon.level, 2, 'Asker en yüksek seviyeli (Lv.2) silahı kuşanmış olmalı');

console.log('✅ TÜM SINIRSIZ CEPHANELİK (ARMORY) VE BİRLEŞİK YÖNETİM TESTLERİ BAŞARIYLA GEÇTİ!');
