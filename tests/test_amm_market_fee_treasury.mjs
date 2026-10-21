import assert from 'node:assert/strict';
import { ammMarket } from '../js/ammMarket.js';
import { globalPool } from '../js/globalPool.js';
import { treasury } from '../js/treasury.js';
import { GAME_CONFIG } from '../js/config.js';
import { GameStateManager } from '../js/gameState.js';

console.log('--- 🧪 AMM MARKET %2 HARCI & TOPLAM KİLİTLİ ÖDÜL KASASI ENTEGRASYON TESTİ ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

// 1. Fee Rate Kontrolü
assert.equal(GAME_CONFIG.AMM_FEE_RATE, 0.02, 'Piyasa harcı tam %2.00 (0.02) olmalı');
console.log('✅ [1/5] GAME_CONFIG.AMM_FEE_RATE = %2.00 doğrulandı.');

// 2. Başlangıç Değerlerini Kaydet
const prevTreasuryBalance = treasury.getSummary().totalBalance;
const prevTotalSpent = globalPool.state.totalSpent || 0;
const prevTotalBurned = globalPool.state.totalBurned || 0;
const prevUbiPool = globalPool.state.ubiPool || 0;

console.log(`Başlangıç Hazine Toplam Kasası: ${prevTreasuryBalance.toLocaleString()} ASTRA`);
console.log(`Başlangıç Toplam Harcanan Token: ${prevTotalSpent.toLocaleString()} ASTRA`);
console.log(`Başlangıç UBI Havuzu: ${prevUbiPool.toLocaleString()} ASTRA`);

// 3. Kullanıcı Senaryosu: 100.000 Odun Satışı
const sellAmount = 100000;
const sellRes = ammMarket.executeSell('wood', sellAmount);

assert(sellRes.success, '100k odun satışı başarılı olmalı');
assert(sellRes.fee > 0, 'Market harcı 0 dan büyük olmalı');

const expectedGross = sellRes.gross;
const expectedFee = expectedGross * 0.02;
const expectedNet = expectedGross - expectedFee;

assert(Math.abs(sellRes.fee - expectedFee) < 0.001, 'Harç brüt satışın tam %2 si olmalı');
assert(Math.abs(sellRes.adAstraReceived - expectedNet) < 0.001, 'Oyuncuya net tutar (brüt - %2 harç) aktarılmalı');
console.log(`✅ [2/5] 100k Odun Satıldı: Brüt ${expectedGross.toFixed(2)} ASTRA, %2 Harç: ${expectedFee.toFixed(2)} ASTRA, Net: ${expectedNet.toFixed(2)} ASTRA`);

// 4. Hazine ve Tokenomics Yansıması Kontrolü
const afterTreasuryBalance = treasury.getSummary().totalBalance;
const afterTotalSpent = globalPool.state.totalSpent || 0;
const afterTotalBurned = globalPool.state.totalBurned || 0;
const afterUbiPool = globalPool.state.ubiPool || 0;

const treasuryIncrease = afterTreasuryBalance - prevTreasuryBalance;
const spentIncrease = afterTotalSpent - prevTotalSpent;
const burnedIncrease = afterTotalBurned - prevTotalBurned;
const ubiIncrease = afterUbiPool - prevUbiPool;

console.log(`Satış Sonrası Hazine Toplam Kasası: ${afterTreasuryBalance.toLocaleString()} ASTRA (Artış: +${treasuryIncrease.toFixed(2)} ASTRA)`);
console.log(`Satış Sonrası UBI Havuzu: ${afterUbiPool.toLocaleString()} ASTRA (Artış: +${ubiIncrease.toFixed(2)} ASTRA)`);
console.log(`Satış Sonrası Toplam Yakılan: ${afterTotalBurned.toLocaleString()} ASTRA (Artış: +${burnedIncrease.toFixed(2)} ASTRA)`);

assert(Math.abs(spentIncrease - expectedFee) < 0.01, 'Harcanan token miktarı tam alınan fee kadar artmalı');
assert(treasuryIncrease > 0, 'Toplam kilitli hazine kasasında ARTIŞ OLMALI!');
assert(Math.abs(treasuryIncrease - (expectedFee * 0.86)) < 0.05, 'Hazine kasaları fee nin tam %86 sı kadar büyümeli');
assert(Math.abs(burnedIncrease - (expectedFee * 0.05)) < 0.05, 'Yakım havuzu fee nin %5 i kadar büyümeli');
assert(Math.abs(ubiIncrease - (expectedFee * 0.06)) < 0.05, 'UBI havuzu fee nin %6 sı kadar büyümeli');
console.log('✅ [3/5] Hazine kasaları, Yakım ve UBI artışları anayasa oranlarıyla %100 doğrulandı.');

// 5. GameStateManager getEconomyAndPoolsSummary() Entegrasyonu
const gs = new GameStateManager();
const eco = gs.getEconomyAndPoolsSummary();
assert(eco.totalPoolsBalance >= afterTreasuryBalance, 'getEconomyAndPoolsSummary() güncel kilitli kasaları yansıtmalı');
console.log(`✅ [4/5] GameStateManager Kilitli Ödül Kasası: ${eco.totalPoolsBalance.toLocaleString()} ASTRA başarıyla okundu.`);

// 6. Alış İşleminde de Harç ve Hammadde Yakımı Doğrulaması
const initialIronCap = globalPool.state.resources.iron.totalCap;
const initialBurnedIron = globalPool.state.totalBurnedResources?.iron || 0;
const buyBeforeTreasury = treasury.getSummary().totalBalance;

const buyRes = ammMarket.executeBuyAmount('iron', 1000);
assert(buyRes.success, 'Alış işlemi başarılı olmalı');
const buyAfterTreasury = treasury.getSummary().totalBalance;
assert(buyAfterTreasury > buyBeforeTreasury, 'Alış işleminde de ödenen %2 harç hazine kasalarını artırmalı');

// 🔥 Hammadde Yakımı Doğrulaması (%2):
assert.equal(buyRes.resourceBurnFee, 20, '1000 demir alımında %2 fee = 20 demir olmalı');
assert.equal(globalPool.state.resources.iron.totalCap, initialIronCap, 'Yakım haftalık çıkarma kotasını küçültmez (21 Ekim 2026)');
assert.equal(globalPool.state.totalBurnedResources.iron, initialBurnedIron + 20, 'Yakılan demir sayacı 20 artmalı');

console.log(`✅ [5/5] Alış işleminde de %2 harç (${buyRes.fee.toFixed(2)} ASTRA) hazine kasasını büyüttü ve %2 hammadde (${buyRes.resourceBurnFee} Demir) yakılıp total arzdan silindi.`);

console.log('🎉 TÜM AMM MARKET %2 HARCI, %2 HAMMADDE YAKIMI VE TOPLAM KİLİTLİ ÖDÜL KASASI TESTLERİ %100 BAŞARIYLA GEÇTİ!');
