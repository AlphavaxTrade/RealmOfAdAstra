import { GameStateManager } from '../js/gameState.js';
import { globalPool } from '../js/globalPool.js';
import { ammMarket } from '../js/ammMarket.js';
import { treasury } from '../js/treasury.js';
import assert from 'assert';
import { GAME_CONFIG } from '../js/config.js';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

console.log('🧪 Test: Vanilla Reset Sonrası 50k ADA + Bot Alımı & Silo Taşma Koruması');

const gs = new GameStateManager();
gs.vanillaReset();

// 1. Başlangıç Seviye 1 Kontrolleri
assert.strictEqual(gs.state.warehouseLevel, 1, 'Silo seviyesi 1 olmalı');
// v2: başlangıç envanteri ve silo kapasiteleri config'ten (6 hammadde)
const P = GAME_CONFIG.STARTING_PROFILE.inventory;
for (const k of GAME_CONFIG.RESOURCE_KEYS) assert.strictEqual(gs.state.inventory[k], P[k], `Başlangıç ${k} ${P[k]} olmalı`);

const initCap = gs.getWarehouseCapacity();
const W = GAME_CONFIG.WAREHOUSE.initialCapacities;
for (const k of GAME_CONFIG.RESOURCE_KEYS) assert.strictEqual(initCap[k], W[k], `Lv 1 ${k} kapasitesi ${W[k]} olmalı`);

// 2. 50k ADA Yükleme & Bot Satın Alma
gs.state.adAstraBalance = 50000;
const buyRes = gs.buyTavernaAutomationBot(false);
assert(buyRes.success, 'Bot satın alımı başarılı olmalı');
assert(gs.state.adAstraBalance < 50000, 'Bot ücreti ve başlangıç tamponu kasadan düşmeli');

// Bot alımı sonrasında envanterin kapasiteyi aşmadığını doğrula
const postBuyCap = gs.getWarehouseCapacity();
assert(gs.state.inventory.wood <= postBuyCap.wood, 'Bot alımında odun kapasitesi aşılmamalı');
assert(gs.state.inventory.iron <= postBuyCap.iron, 'Bot alımında demir kapasitesi aşılmamalı');
assert(gs.state.inventory.wheat <= postBuyCap.wheat, 'Bot alımında buğday kapasitesi aşılmamalı');

// 3. Ardışık Sefer Döngüleri Simülasyonu
for (let round = 1; round <= 15; round++) {
  for (const n of GAME_CONFIG.RESOURCE_KEYS) {
    if (gs.state.activeExpeditions[n]) {
      gs.state.activeExpeditions[n].elapsedSeconds = 1080;
      gs.state.activeExpeditions[n].isCompleted = true;
    }
  }

  gs.runTavernaAutomationCycle();
  const cap = gs.getWarehouseCapacity();

  assert(gs.state.inventory.wood <= cap.wood, `Round ${round}: Odun (${gs.state.inventory.wood}) kapasiteyi (${cap.wood}) aştı!`);
  assert(gs.state.inventory.iron <= cap.iron, `Round ${round}: Demir (${gs.state.inventory.iron}) kapasiteyi (${cap.iron}) aştı!`);
  assert(gs.state.inventory.wheat <= cap.wheat, `Round ${round}: Buğday (${gs.state.inventory.wheat}) kapasiteyi (${cap.wheat}) aştı!`);
}

// 4. Silo doğal olarak seviye atlamış ve asla taşmamış olmalı
assert(gs.state.warehouseLevel >= 2, 'Silo yeterli kaynak ve ADA finansmanı ile Seviye 2 veya üzerine yükselmeli');
console.log('✅ Tüm testler başarıyla geçti: Silo asla %3000 taşmadı ve Seviye ' + gs.state.warehouseLevel + '\'e yükseldi!');
