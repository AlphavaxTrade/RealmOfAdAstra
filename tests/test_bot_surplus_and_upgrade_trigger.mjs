import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { ammMarket } from '../js/ammMarket.js';
import { GAME_CONFIG } from '../js/config.js';

console.log('--- 🤖 TEST: BOT ARTIK MAHSULÜN MARKETTE SATILMASI VE HER SEFER SONU SİLO YÜKSELTME TETİKLEMESİ ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();
const cap = gs.getWarehouseCapacity();
const woodCap = cap.wood; // 1080

// Botu aktif yapalım
gs.state.tavernaBotActive = true;
gs.state.botActiveUntil = Date.now() + 86400000;
gs.state.botSiloAutoUpgrade = true;

// =========================================================================
// TEST 1: Adım 1 - Biten sefer ambarı doldurup artıyorsa, artan miktarı sat, 
// seferin hepsini al ve seferi tamamen sonlandır (delete expedition).
// =========================================================================
console.log('\n[TEST 1] Artan mahsulün AMM DEX pazarında anında satılması');

// v2: boş yer 50 (kapasite 324); 18 dk sefer 97 odun getirir
gs.state.inventory.wood = woodCap - 50;
gs.state.inventory.iron = 50;
gs.state.inventory.wheat = 50;
const yield1 = Math.floor(gs.getResourceRatePerMinute('wood') * 18);
const initialAda = 1000;
gs.state.adAstraBalance = initialAda;

// Seferde 324 odun var
gs.state.activeExpeditions.wood = {
  nodeId: 'wood',
  isCompleted: true,
  durationMinutes: 18,
  durationHours: 0.3,
  durationSeconds: 1080,
  elapsedSeconds: 1080,
  claimedAmount: 0
};

const claimRes = gs.claimExpedition('wood');

console.log('Claim sonucu:', claimRes);

// Beklentiler:
// 1. Silodaki 200 boş yer dolmalı -> inventory.wood = 1080
assert.equal(gs.state.inventory.wood, woodCap, 'Ambar tam %100 (1080 odun) dolmuş olmalı');

// 2. Artan 124 odun AMM pazarında satılmış olmalı
assert.equal(claimRes.botSurplusSold, yield1 - 50, `Artan ${yield1 - 50} odun bot tarafından markette satılmış olmalı`);
assert.ok(claimRes.botSurplusAdaEarned > 0, 'Satıştan ADA kazanılmış olmalı');
assert.ok(gs.state.adAstraBalance > initialAda, 'Oyuncunun ADA bakiyesi artmış olmalı');

// 3. Sefer tamamen tüketilmiş ve silinmiş olmalı (sıradaki sefer anında başlatılabilsin diye)
assert.equal(claimRes.stillRemaining, 0, 'Seferde bekleyen miktar 0 olmalı');
assert.equal(gs.state.activeExpeditions.wood, undefined, 'Sefer silinmiş olmalı (delete activeExpeditions)');

console.log('✅ TEST 1 BAŞARILI: 200 yer varken 324 odun geldiğinde 124 markette satıldı, ambar fulllendi, sefer temizlendi!');

// =========================================================================
// TEST 2: Adım 4 A Seçeneği 2. Bölüm - Her sefer bitiminde siloyu kontrol et,
// depolar %80 doluluğa ulaşmış fakat ADA eksikse %80 üzerindeki fazlalıklardan
// satarak ADA'yı finanse et ve siloyu Seviye Atlat!
// =========================================================================
console.log('\n[TEST 2] %80 Barajında ADA Finansmanı ve Otomatik Seviye Atlama');

// Silo Seviye 1
gs.state.botSiloAutoUpgrade = true;
gs.state.warehouseLevel = 1;
const cap1 = gs.getWarehouseCapacity(1);

// %80 barajları: wood: 864 (1080 * 0.8), iron: 576 (720 * 0.8), wheat: 1440 (1800 * 0.8)
// Depoları %80'in üzerine koyalım (fazlalık olsun: 1050 wood, 700 iron, 1700 wheat)
// v1.25: Bot yükseltmeden sonra kasada en az 500 ADA güvenlik payı bırakır; bu yüzden açık ~1.130 ADA.
// Depolar tam dolu: %80 üstü fazlalık ~1.440 ADA eder ve açığı kapatır.
// v2: 6 depo da tam dolu; %80 üstündeki fazlalık (~7 ASTRA) satılarak açık kapatılacak
for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = cap1[k];
const need = gs.getWarehouseUpgradeCost().adAstra + gs.getBotAdaReserve();
gs.state.adAstraBalance = Math.max(0, need - 4); // 4 ASTRA açık

const costBefore = gs.getWarehouseUpgradeCost();
console.log('Silo Yükseltme Durumu Öncesi:');
console.log(`- Gerekli ADA: ${costBefore.adAstra}`);
console.log(`- Mevcut ADA: ${gs.state.adAstraBalance}`);
console.log(`- %80 Doluluk Sağlandı mı?: ${costBefore.is80PercentFull}`);

// Şimdi tetikleyelim
const upRes = gs.tryAutoUpgradeWarehouseWithAdaFinancing();
console.log('Yükseltme Finansman Sonucu:', upRes);

// Beklentiler:
// 1. Silo Seviye 2'ye yükselmiş olmalı!
assert.equal(gs.state.warehouseLevel, 2, 'Silo Seviye 2 olmalı');
assert.ok(upRes.upgraded, 'Yükseltme başarılı olmalı');

console.log('✅ TEST 2 BAŞARILI: %80 üstü fazlalıklardan ADA finanse edilerek Silo Seviye 2 yapıldı!');
