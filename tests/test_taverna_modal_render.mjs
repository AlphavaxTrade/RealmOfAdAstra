import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

console.log('--- 🧪 TAVERNA HESAPLAMA VE EKRAN VERİSİ TESTİ BAŞLATILIYOR ---');

const gs = new GameStateManager();
const botCalc = gs.calculateTavernaBotProfitAndCost();

console.log('Taverna Bot Finansal Çıktıları:', botCalc);

// app.js tarafından okunan tüm alanlar tanımlı ve sayısal olmalı
assert(botCalc.dailyGrossValAda > 0, 'dailyGrossValAda > 0 olmalı');
assert(botCalc.dailyStaminaCostAda > 0, 'dailyStaminaCostAda > 0 olmalı');
assert(botCalc.dailyWheatNeededForStamina > 0, 'dailyWheatNeededForStamina > 0 olmalı');
assert(botCalc.dailyToolRepairAda > 0, 'dailyToolRepairAda > 0 olmalı');
assert(botCalc.dailyNetProfitAda > 0, 'dailyNetProfitAda > 0 olmalı');
assert(botCalc.dailyBotCostAda > 0, 'dailyBotCostAda > 0 olmalı');

// toLocaleString() çağrıları asla hata fırlatmamalı
assert.doesNotThrow(() => {
  botCalc.dailyGrossValAda.toLocaleString();
  botCalc.dailyStaminaCostAda.toLocaleString();
  botCalc.dailyToolRepairAda.toLocaleString();
  botCalc.dailyNetProfitAda.toLocaleString();
  botCalc.dailyBotCostAda.toLocaleString();
}, 'Taverna modalı render edilirken toLocaleString() hatası alınmamalı');

// AdAstra ile stamina doldurma devre dışı olmalı; sadece buğday ile doldurulabilir
assert.equal(typeof gs.instantRefillStamina, 'undefined', 'ASTRA ile stamina doldurma yolu hiç olmamalı');

// Buğday ile doldurma mekanizması sorunsuz çalışmalı
gs.state.stamina = 10;
gs.state.inventory.wheat = 1000;
const wheatRefillRes = gs.refillStaminaToMaxWithWheat();
assert.equal(wheatRefillRes.success, true, 'Buğday ile stamina doldurma başarılı olmalı');
assert(gs.state.stamina > 10, 'Stamina buğday ile artmış olmalı');

console.log('✅ Taverna ekranı, bot hesaplaması ve buğdaylı stamina kuralı %100 doğrulandı.');
