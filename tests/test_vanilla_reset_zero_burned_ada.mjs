import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { globalPool } from '../js/globalPool.js';
import { treasury } from '../js/treasury.js';

console.log('--- 🧪 VANILLA RESET: TOPLAM YAKILAN ASTRA SIFIRLAMA TESTİ ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();

// 1. Önce oyunda yakım ve harcama oluşturalım
globalPool.recordTokenSpend(10000);
treasury.deposit(5000);

const ecoBefore = gs.getEconomyAndPoolsSummary();
console.log('Sıfırlama Öncesi İstatistikler:');
console.log(`- Toplam Yakılan ASTRA: ${ecoBefore.lifetimeBurnedAda} ASTRA`);
console.log(`- Toplam Giren (Inflow): ${ecoBefore.totalDeposited} ASTRA`);
assert.ok(ecoBefore.lifetimeBurnedAda > 0, 'Sıfırlama öncesi yakılan ASTRA 0 dan büyük olmalı');

// 2. Şimdi vanillaReset() çalıştıralım
console.log('\n[2] vanillaReset() çağrılıyor...');
gs.vanillaReset();

const ecoAfter = gs.getEconomyAndPoolsSummary();
console.log('Vanilla Reset Sonrası İstatistikler:');
console.log(`- Toplam Yakılan ASTRA: ${ecoAfter.lifetimeBurnedAda} ASTRA`);
console.log(`- Toplam Giren (Inflow): ${ecoAfter.totalDeposited} ASTRA`);
console.log(`- Dağıtılan Ödüller (Outflow): ${ecoAfter.totalWithdrawn} ASTRA`);
console.log(`- GlobalPool Total Burned: ${globalPool.state.totalBurned} ASTRA`);
console.log(`- Treasury Lifetime Burned: ${treasury.state.lifetimeBurned} ASTRA`);

assert.equal(ecoAfter.lifetimeBurnedAda, 0, 'Vanilla reset sonrası Toplam Yakılan ASTRA tam 0 olmalıdır!');
assert.equal(globalPool.state.totalBurned, 0, 'globalPool.state.totalBurned tam 0 olmalıdır!');
assert.equal(treasury.state.lifetimeBurned, 0, 'treasury.state.lifetimeBurned tam 0 olmalıdır!');
assert.equal(ecoAfter.totalDeposited, 0, 'Toplam giren bakiye tam 0 olmalıdır!');
assert.equal(ecoAfter.totalWithdrawn, 0, 'Dağıtılan ödüller tam 0 olmalıdır!');

console.log('✅ Vanilla reset sonrası Toplam Yakılan ASTRA 0 ASTRA olarak başarıyla doğrulandı!');
