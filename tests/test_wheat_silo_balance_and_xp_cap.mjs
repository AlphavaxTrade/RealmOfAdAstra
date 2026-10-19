import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { globalPool } from '../js/globalPool.js';
import { GAME_CONFIG } from '../js/config.js';
import { treasury } from '../js/treasury.js';

console.log('--- 🧪 BUĞDAY SİLO DENGELEMESİ, XP TANKI VE HAZİNE HAVUZLARI TESTİ ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();

// 1. TEST: BUĞDAY SİLO KAPASİTESİ DENGELEMESİ
console.log('\n[1] Buğday Silo Kapasitesi ve Dolum Süresi Dengelemesi:');
const capLvl1 = gs.getWarehouseCapacity(1);
console.log('Level 1 Kapasiteler:', capLvl1);

// Odun: 18/dk = 1080/saat -> Kapasite 1080 (Tam 1 saat)
// Demir: 12/dk = 720/saat -> Kapasite 720 (Tam 1 saat)
// Buğday: 30/dk = 1800/saat -> Kapasite 1800 (Tam 1 saat - Önceden 900 idi ve 30 dakikada taşıyordu)
// v2: her hammadde için Lv.1 silo = 1 saatlik üretim (config.WAREHOUSE.initialCapacities)
const W = GAME_CONFIG.WAREHOUSE.initialCapacities;
for (const k of GAME_CONFIG.RESOURCE_KEYS) assert.equal(capLvl1[k], W[k], `Level 1 ${k} kapasitesi ${W[k]} olmalı`);

const capLvl18 = gs.getWarehouseCapacity(18);
console.log('Level 18 Kapasiteler:', capLvl18);
assert.equal(capLvl18.wheat, GAME_CONFIG.WAREHOUSE.maxCapacities.wheat, 'Level 18 Buğday kapasitesi config tavanı olmalı');

console.log('✅ Buğday silo kapasitesi diğer kaynaklarla (tam 1 saatlik üretim) kusursuz dengelendi.');

// 2. TEST: XP TANKI HARD CAP (TAŞMA VE BİRİKTİRME ENGELİ)
console.log('\n[2] XP Tankı Hard Cap (Taşma Engeli):');
gs.state.level = 3;
const nextLvl = gs.getNextLevelRequirement();
const reqXp = nextLvl.xp;
console.log(`Seviye 3 -> 4 için Gereken XP: ${reqXp}`);

// XP'yi tank sınırına kadar dolduralım
gs.state.currentXp = reqXp - 50;
gs.addXp(100); // 50 XP yeterli, +50 XP fazlalık var

console.log(`Doldurulduktan sonra XP: ${gs.state.currentXp} / ${reqXp}`);
assert.equal(gs.state.currentXp, reqXp, 'XP tankı tam dolduğunda reqXp değerini aşmamalı');

// Tank doluyken yeni sefer veya zindandan XP gelsin (+500 XP)
gs.addXp(500);
console.log(`Tank doluyken 500 XP daha eklendikten sonra XP: ${gs.state.currentXp} / ${reqXp}`);
assert.equal(gs.state.currentXp, reqXp, 'Kullanıcı hesabı yükseltmediği sürece XP tankı 2000/2000 gibi sabit kalmalı, taşmamalı');

console.log('✅ XP tankı taşma engeli başarıyla doğrulandı.');

// 3. TEST: SİLO YÜKSELTME HARCAMALARININ HAVUZLARA DAĞILIMI
console.log('\n[3] Silo Yükseltme ASTRA Harcamalarının Havuzlara Dağılımı:');
gs.state.adAstraBalance = 100000;
gs.state.inventory = Object.fromEntries(GAME_CONFIG.RESOURCE_KEYS.map(k => [k, 50000]));   // v2: 6 hammadde
gs.state.warehouseLevel = 1;
const ubiBefore = globalPool.state.ubiPool || 0;

const upCost = gs.getWarehouseUpgradeCost(1);
console.log('Silo Seviye 1->2 ASTRA Maliyeti:', upCost.adAstra);

const upRes = gs.upgradeWarehouse();
assert.equal(upRes.success, true, 'Silo yükseltme başarılı olmalı');

const ubiAfter = globalPool.state.ubiPool || 0;
console.log(`UBI Havuzu: Önce = ${ubiBefore.toFixed(2)}, Sonra = ${ubiAfter.toFixed(2)} (+${(ubiAfter - ubiBefore).toFixed(2)} ASTRA)`);
assert.ok(ubiAfter > ubiBefore, 'Silo yükseltme ASTRA harcamasından %6 UBI havuzuna aktarılmalıdır');

const hazineOzeti = treasury.getSummary();
console.log('Hazine kasaları:', hazineOzeti.pools.map(p => `${p.name}: ${p.balance.toFixed(2)} ASTRA`));
assert.ok(hazineOzeti.pools.length >= 8, 'hazine defterinde 8 kasa olmalı');
assert.ok(globalPool.state.ubiPool > 0, 'UBI havuzunda bakiye görünmeli');

console.log('✅ Silo yükseltme ASTRA dağıtımı ve Hazine/UBI havuz görünürlüğü doğrulandı.');
