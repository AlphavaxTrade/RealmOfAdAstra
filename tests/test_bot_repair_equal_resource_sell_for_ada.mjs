import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { ammMarket } from '../js/ammMarket.js';
import { globalPool } from '../js/globalPool.js';
import { treasury } from '../js/treasury.js';
import { GAME_CONFIG } from '../js/config.js';

console.log('--- 🤖 ALET ONARIMINDA EŞİT KAYNAK SATIŞI İLE ASTRA TEMİNİ TESTİ ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();

// 1. Durum Kurulumu:
// Kasada 0 ASTRA var! Yeteri kadar ASTRA kesinlikle yok.
gs.state.adAstraBalance = 0;

// Depoda eşit ve bol kaynak var
// v1.25: 3.000'er kaynak silo Lv.1'e sığmaz (fazlası eskiden sessizce siliniyordu); silo Lv.8 kullanılıyor.
gs.state.warehouseLevel = gs.getWarehouseMaxLevel();   // v2: 3.000'er kaynak ancak en üst siloya sığar
gs.state.inventory = Object.fromEntries(GAME_CONFIG.RESOURCE_KEYS.map(k => [k, 3000]));

// Bot aktif
gs.state.tavernaBotActive = true;
gs.state.botActiveUntil = Date.now() + 24 * 3600 * 1000;
gs.state.tavernaBotExpiresAt = gs.state.botActiveUntil;

// Aletleri aşındır
const maxAxe = GAME_CONFIG.TOOLS.axe.maxDurability || 4320;
gs.state.tools.axe.durability = maxAxe - 300; // 300 dakika hasar

const repCost = gs.calculateRepairCost('axe');
console.log('Balta Onarım İhtiyacı:', {
  woodCost: repCost.woodCost,
  ironCost: repCost.ironCost,
  adAstraCost: repCost.adAstraCost,
  kullaniciAda: gs.state.adAstraBalance
});

assert(repCost.adAstraCost > 0, 'Onarım için pozitif ASTRA gerekmeli');
assert.equal(gs.state.adAstraBalance, 0, 'Başlangıçta hesapta hiç ASTRA olmamalı');

const prevWood = gs.state.inventory.wood;
const prevIron = gs.state.inventory.iron;
const prevWheat = gs.state.inventory.wheat;

// 2. Aleti onarmayı dene (repairTool veya runTavernaAutomationCycle)
console.log('\n[1/2] Alet Onarımı Tetikleniyor (Hesapta 0 ASTRA Varken)...');
const repairRes = gs.repairTool('axe');

console.log('Onarım Sonucu:', repairRes);
assert.equal(repairRes.success, true, 'Bot ASTRA açığını kaynak satarak kapattığı için onarım başarılı olmalı!');
assert.equal(gs.state.tools.axe.durability, maxAxe, 'Balta %100 tam onarılmış olmalı!');

// 3. Eşit Satış Kontrolü:
const woodDiff = prevWood - gs.state.inventory.wood - repCost.woodCost; // repCost.woodCost tamirde harcandı
const ironDiff = prevIron - gs.state.inventory.iron - repCost.ironCost; // repCost.ironCost tamirde harcandı
const wheatDiff = prevWheat - gs.state.inventory.wheat; // Buğday sadece satışta harcandı

console.log('ADA Finansmanı İçin Satılan Kaynak Miktarları:', {
  satilanOdun: woodDiff,
  satilanDemir: ironDiff,
  satilanBugday: wheatDiff
});

assert(woodDiff > 0, 'Odun satılmış olmalı');
assert(ironDiff > 0, 'Demir satılmış olmalı');
assert(wheatDiff > 0, 'Buğday satılmış olmalı');
assert.equal(woodDiff, ironDiff, 'Odun ve Demir TAMAMEN EŞİT miktarda satılmış olmalı!');
assert.equal(ironDiff, wheatDiff, 'Demir ve Buğday TAMAMEN EŞİT miktarda satılmış olmalı!');

console.log('✅ [1/2] Bot, alet onarımı için ihtiyaç duyduğu ASTRA kadar kaynaklardan TAMAMEN EŞİT miktarda sattı!');

// 4. Otonom Sefer Döngüsü Sırasında Toplu Test:
console.log('\n[2/2] Otonom Sefer Döngüsünde (runTavernaAutomationCycle) Test Ediliyor...');
gs.state.adAstraBalance = 0; // Tekrar 0 ASTRA yapalım
gs.state.tools.pickaxe.durability = maxAxe - 200;
gs.state.tools.sickle.durability = maxAxe - 200;

const prePickCost = gs.getAllRepairCost();
console.log('Döngü Öncesi Tamir Maliyeti:', prePickCost);
assert(prePickCost.count > 0, 'Hasarlı alet bulunmalı');

const cycleRes = gs.runTavernaAutomationCycle();
console.log('Döngü Logları:', cycleRes.actions);

const postPickCost = gs.getAllRepairCost();
console.log('Döngü Sonrası Tamir Maliyeti:', postPickCost);
assert.equal(postPickCost.count, 0, 'Döngü sonrasında tüm aletler başarıyla onarılmış olmalı!');

console.log('\n🎉 TÜM TESTLER %100 BAŞARIYLA GEÇTİ!');
