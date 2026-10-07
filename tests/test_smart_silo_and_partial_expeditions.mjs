// tests/test_smart_silo_and_partial_expeditions.mjs
import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { GAME_CONFIG } from '../js/config.js';

console.log('--- 🧪 KAPSAMLI AKILLI SİLO, ASTRA FİNANSMANI & KISMİ SEFER BEKLETME TESTİ BAŞLATILIYOR ---');

// Mock AMM Market (v2 fiyatları: koridor varsayılanları, ×0,01 ölçek)
const mockAmmMarket = {
  getPrice(nodeId) {
    return (GAME_CONFIG.AMM_CORRIDORS[nodeId] || {}).defaultPriceAda || 0.01;
  },
  executeSell(nodeId, amount) {
    const p = this.getPrice(nodeId);
    const gross = amount * p;
    const fee = gross * 0.02;
    const net = gross - fee;
    return { success: true, adAstraReceived: net, amountSold: amount };
  },
  getEstimatedAdAstraForSell(nodeId, amount) {
    const p = this.getPrice(nodeId);
    return amount * p * 0.98;
  },
  calculateResourcesAdAstraValue(resources) {
    let totalAda = 0;
    const breakdown = {};
    for (const [k, v] of Object.entries(resources)) {
      const p = this.getPrice(k);
      const val = v * p * 0.98;
      breakdown[k] = val;
      totalAda += val;
    }
    return { totalAda: Math.round(totalAda * 1000) / 1000, breakdown };
  }
};
globalThis.ammMarket = mockAmmMarket;

// Mock Sound & GlobalPool
globalThis.sound = { playHarvest() {}, playBreakWarning() {}, playLevelUp() {}, playError() {} };
globalThis.globalPool = {
  harvest(nodeId, amount) { return amount; },
  recordTokenSpend(amount) {}
};

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();
const R = GAME_CONFIG.RESOURCE_KEYS;

// v2 ölçeği: Seviye 1 silo = 1 saatlik üretim (odun 324); 18 dakikalık odun seferi 97 odun getirir
gs.state.warehouseLevel = 1;
const cap1 = gs.getWarehouseCapacity(1);
const yieldWood = Math.floor(gs.getResourceRatePerMinute('wood') * 18);

// [TEST 1] Kısmi Toplama & Seferde Bekletme Mekaniği (Manuel / Temel Akış)
console.log('\n[1/5] Kısmi Toplama & Seferde Bekletme Test Ediliyor...');
const room1 = 50;
gs.state.inventory.wood = cap1.wood - room1; // Siloda 50 boş yer var

gs.state.activeExpeditions = {
  wood: {
    nodeId: 'wood',
    durationMinutes: 18,
    durationSeconds: 1080,
    elapsedSeconds: 1080,
    isCompleted: true,
    claimedAmount: 0
  }
};

const claim1 = gs.claimExpedition('wood');
assert.equal(claim1.success, true, 'Kısmi toplama başarılı olmalı');
assert.equal(claim1.isPartialSiloFill, true, 'Kısmi silo doldurma bayrağı aktif olmalı');
assert.equal(claim1.harvestedAmount, room1, `Silodaki ${room1} boş yer kadar toplanmalı`);
assert.equal(gs.state.inventory.wood, cap1.wood, 'Silo tam dolmalı');
assert(gs.state.activeExpeditions.wood != null, 'Seferde hala mahsul beklediği için sefer silinmemeli');
assert.equal(claim1.stillRemaining, yieldWood - room1, `Kalan ${yieldWood - room1} odun seferde beklemeli`);
console.log(`✅ [1/5] Başarılı: ${yieldWood} Odunun ${room1}'si depoya alındı, kalan ${claim1.stillRemaining} Odun seferde bekletiliyor.`);

// [TEST 2] Kalan Mahsulün Yer Açılınca Toplanması ve Seferin Temizlenmesi
console.log('\n[2/5] Kalan Mahsulün Toplanması ve Seferin Kapanması Test Ediliyor...');
const rest1 = yieldWood - room1;
gs.state.inventory.wood = cap1.wood - yieldWood; // kalanın hepsine yetecek yer açıldı
const claim2 = gs.claimExpedition('wood');
assert.equal(claim2.success, true, 'İkinci claim başarılı olmalı');
assert.equal(claim2.isPartialSiloFill, false, 'Kalan odun tamamen toplandığı için sefer tamamlanmalı');
assert.equal(claim2.harvestedAmount, rest1, 'Kalan odunun tamamı depoya girmeli');
assert.equal(gs.state.inventory.wood, cap1.wood - yieldWood + rest1, 'Depo: açılan yer + kalan');
assert.equal(gs.state.activeExpeditions.wood, undefined, 'Sefer tamamen bittiği için silinmeli');
console.log('✅ [2/5] Başarılı: Kalan Odun yer açılınca toplandı ve sefer başarıyla temizlendi.');

// [TEST 3] Bot: Siloyu Yükselt Modu - Yer Yetersizliğinde Tam Sefer Kadar Yer Açma
console.log('\n[3/5] Bot: Siloyu Yükselt Modunda Yetersiz Yerde Tam Sefer Kadar Yer Açma Test Ediliyor...');
gs.state.warehouseLevel = 1;
gs.setBotSiloOption(true); // Siloyu Yükselt modu
gs.buyTavernaAutomationBot(true); // Bot aktif

// Siloda 50 boş yer olsun; seferden 150 odun gelmesi gereksin
gs.state.inventory.wood = cap1.wood - 50;
const botSpace1 = gs.handleBotSiloSpace('wood', 150);
assert.equal(botSpace1.handled, true);
assert.equal(botSpace1.action, 'sold');
// Siloda 50 yer vardı, 150 yer açmak için 100 satılmalı!
assert.equal(botSpace1.amountSold, 100, 'Tam 150 yer açılması için 100 odun satılmalı');
assert.equal(gs.state.inventory.wood, cap1.wood - 150, 'Depoda tam 150 odunluk boş yer kalmalı');
const newRoom = cap1.wood - gs.state.inventory.wood;
assert.equal(newRoom, 150, 'Siloda artık tam 150 odunluk boş yer olmalı!');
console.log('✅ [3/5] Başarılı: 150 Odunluk hasat için tam 100 Odun satıldı ve ambarda tam 150 boş yer açıldı.');

// [TEST 4] Bot: Siloyu Yükselt Modu - ASTRA Eksikliğinde %80 Üzerini Satıp ASTRA Biriktirme
console.log('\n[4/5] Bot: %80 Dolulukta ASTRA Eksikliği İçin Fazlalığı Satma Test Ediliyor...');
gs.state.warehouseLevel = 1;
gs.setBotSiloOption(true);

// 6 depoyu da %80 barajının üzerine çıkaralım
for (const k of R) gs.state.inventory[k] = Math.round(cap1[k] * 0.8) + Math.max(5, Math.floor(cap1[k] * 0.1));
gs.state.adAstraBalance = 0;    // 0 ASTRA var, yükseltme için ASTRA eksik!

const upCost = gs.getWarehouseUpgradeCost();
assert.equal(upCost.is80PercentFull, true, 'Depolar %80 dolu olmalı');
assert.equal(upCost.canAffordCost, false, 'ASTRA yetersiz olmalı');

// Bot devreye girdiğinde ASTRA açığını kapatmak için %80 üzerindeki fazlalığı satmalı!
const adaFundingRes = gs.handleBotSiloSpace('wood', 10);
assert.equal(adaFundingRes.handled, true);
assert(adaFundingRes.action === 'sold_for_ada' || adaFundingRes.action === 'upgraded');
assert(gs.state.adAstraBalance > 0 || adaFundingRes.action === 'upgraded', 'Satıştan ASTRA kazanılmış olmalı');
assert(gs.state.inventory.wood >= upCost.reqWoodFill, '%80 barajı ASLA delinmemeli');
console.log(`✅ [4/5] Başarılı: ASTRA eksikliği için %80 barajı korunarak fazlalık satıldı (+${gs.state.adAstraBalance.toFixed(3)} ASTRA). Depo: ${gs.state.inventory.wood} (Baraj: ${upCost.reqWoodFill})`);

// [TEST 5] Bot: Kaynakları Sat Modu (botSiloAutoUpgrade = false) - Silonun %50'sini Koruyup Fazlasını Satma
console.log('\n[5/5] Bot: Kaynakları Sat Modunda %50 Rezerve Koruma Test Ediliyor...');
gs.state.warehouseLevel = 1;
gs.setBotSiloOption(false); // Kaynakları Sat modu

const half = Math.floor(cap1.wood * 0.5);
gs.state.inventory.wood = half + 88; // Yarısının 88 üzerinde
const sellModeRes = gs.handleBotSiloSpace('wood', 50);
assert.equal(sellModeRes.handled, true);
assert.equal(sellModeRes.action, 'sold');
assert.equal(sellModeRes.amountSold, 88, 'Silonun yarısının üzerindeki 88 odun satılmalı');
assert.equal(gs.state.inventory.wood, half, 'Depoda tam silonun yarısı kalmalı');
console.log(`✅ [5/5] Başarılı: Kaynakları Sat modunda silonun yarısı (${half} Odun) rezerve korundu, fazlalık satıldı.`);

console.log('\n🎉 TÜM AKILLI SİLO, ASTRA FİNANSMANI VE KISMİ SEFER BEKLETME TESTLERİ %100 BAŞARIYLA GEÇTİ! 🎉');
