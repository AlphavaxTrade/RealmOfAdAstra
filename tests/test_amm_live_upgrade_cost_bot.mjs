import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { ammMarket } from '../js/ammMarket.js';
import '../js/globalPool.js';

console.log('--- 🧪 AMM DEX CANLI YÜKSELTME MALİYETİ & OTOMATİK BOT TESTİ BAŞLATILIYOR ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();
gs.state.adAstraBalance = 1000000;
gs.state.currentXp = 10000;
gs.state.inventory = { iron: 50000, wood: 50000, wheat: 50000, stone: 50000, coal: 50000, herb: 50000, fragments: 500 }; // v2: 6 hammadde

// 1. Hesap Seviyesi Yükseltme Maliyeti ve AMM DEX Değeri Kontrolü
const lvlReq = gs.getNextLevelRequirement();
console.log(`Seviye ${lvlReq.level} için gereken kaynaklar: ${lvlReq.wood} Odun, ${lvlReq.iron} Demir, ${lvlReq.wheat} Buğday`);
console.log(`Hesaplanan AMM DEX AdAstra Bedeli: ${lvlReq.adAstra} ASTRA`);

assert(lvlReq.wood > 0 && lvlReq.iron > 0 && lvlReq.wheat > 0, 'Kaynak miktarları pozitif olmalı');
assert(lvlReq.adAstra > 0, 'AdAstra yükseltme maliyeti pozitif olmalı');

const expectedLevelAmm = ammMarket.calculateResourcesAdAstraValue({
  wood: lvlReq.wood,
  iron: lvlReq.iron,
  wheat: lvlReq.wheat
});
assert.equal(lvlReq.adAstra, expectedLevelAmm.totalAda, 'Seviye atlama ASTRA maliyeti AMM DEX toplam pazar değerine eşit olmalı');
console.log('✅ Seviye Atlama ASTRA maliyeti AMM DEX pazar değeriyle %100 örtüşüyor!');

// 2. Silo Yükseltme Maliyeti ve AMM DEX Değeri Kontrolü
const whCost = gs.getWarehouseUpgradeCost();
console.log(`Silo Seviye ${whCost.nextLevel} için gereken kaynaklar: ${whCost.wood} Odun, ${whCost.iron} Demir, ${whCost.wheat} Buğday`);
console.log(`Hesaplanan Silo AMM DEX AdAstra Bedeli: ${whCost.adAstra} ASTRA`);

assert(whCost.wood > 0 && whCost.iron > 0 && whCost.wheat > 0, 'Silo kaynak miktarları pozitif olmalı');
assert(whCost.adAstra > 0, 'Silo AdAstra yükseltme maliyeti pozitif olmalı');

// v2: silo yükseltmesi 6 hammadde ister (whCost.costs)
const expectedWhAmm = ammMarket.calculateResourcesAdAstraValue(whCost.costs);
assert.equal(whCost.adAstra, expectedWhAmm.totalAda, 'Silo yükseltme ASTRA maliyeti AMM DEX toplam pazar değerine eşit olmalı');
console.log('✅ Silo yükseltme ASTRA maliyeti AMM DEX pazar değeriyle %100 örtüşüyor!');

// 3. Saniye Başı Çalışan Otomatik Canlı Bot (tickUpgradeCostBot) Kontrolü
const botResult = gs.tickUpgradeCostBot(1.0);
assert(botResult, 'Bot sonuç üretmeli');
assert(botResult.warehouse, 'Bot silo maliyetini hesaplamalı');
assert(botResult.accountLevel, 'Bot hesap seviyesi maliyetini hesaplamalı');
assert.equal(botResult.warehouse.adAstra, whCost.adAstra, 'Botun silo ASTRA hesabı güncel olmalı');
assert.equal(botResult.accountLevel.adAstra, lvlReq.adAstra, 'Botun hesap seviyesi ASTRA hesabı güncel olmalı');
console.log('✅ Otomatik Canlı Bot saniyelik hesaplamayı başarıyla güncelledi!');

// 4. Seviye Atlama Eylemi ve Bakiye Düşüşü
const initialAda = gs.state.adAstraBalance;
const lvlUpRes = gs.levelUp();
assert(lvlUpRes.success, 'Seviye atlama başarılı olmalı');
assert.equal(gs.state.level, 2, 'Hesap seviyesi 2 olmalı');
assert.equal(gs.state.adAstraBalance, initialAda - lvlReq.adAstra, 'Tam olarak AMM DEX pazar değeri kadar AdAstra düşülmeli');
console.log('✅ Seviye atlama sırasında AMM DEX pazar değeri kadar ASTRA hesaptan tahsil edildi!');

// 5. Silo Yükseltme Eylemi ve Bakiye Düşüşü
const beforeWhAda = gs.state.adAstraBalance;
const whRes = gs.upgradeWarehouse();
assert(whRes.success, 'Silo yükseltme başarılı olmalı');
assert.equal(gs.state.warehouseLevel, 2, 'Silo seviyesi 2 olmalı');
assert.equal(gs.state.adAstraBalance, beforeWhAda - whCost.adAstra, 'Tam olarak Silo AMM DEX pazar değeri kadar AdAstra düşülmeli');
console.log('✅ Silo yükseltme sırasında AMM DEX pazar değeri kadar ASTRA hesaptan tahsil edildi!');

console.log('🎉 TÜM AMM DEX CANLI MALİYET VE OTOMATİK BOT DOĞRULAMA TESTLERİ BAŞARIYLA TAMAMLANDI!');
