import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { ammMarket } from '../js/ammMarket.js';
import { treasury } from '../js/treasury.js';
import { GAME_CONFIG } from '../js/config.js';

console.log('--- 🧪 AMM SERBEST PİYASA, ALET ONARIMI UYARISI VE GÜN SONU BUYBACK TESTİ ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();

// 1. TEST: AMM SERBEST PİYASA YÜKLÜ SATIŞ (TABAN ENGELİ KALDIRILDI)
console.log('\n[1] AMM Serbest Piyasa Yüklü Satış Testi:');
// Kullanıcı yüklü miktarda buğday ve odun satmak istiyor
const largeAmount = 25000;
gs.state.inventory = { wood: largeAmount, iron: largeAmount, wheat: largeAmount };
gs.state.adAstraBalance = 0;

// Önceki fiyata bakalım
const priceBefore = ammMarket.getPrice('wheat');
console.log(`Satış öncesi Buğday Fiyatı: ${priceBefore.toFixed(4)} ASTRA`);

// Yüklü satış yapalım - artık taban koridor hatası fırlatılmamalı
const sellRes = ammMarket.executeSell('wheat', largeAmount, 0.05); // %5 kayma toleransı veya geniş tolerans
console.log('Yüklü Satış Sonucu:', {
  success: sellRes.success,
  adAstraReceived: sellRes.adAstraReceived,
  priceAfter: sellRes.priceAfter,
  effectivePrice: sellRes.effectivePrice
});

assert.equal(sellRes.success, true, 'Yüklü miktarda satış engellenmeden başarıyla gerçekleşmeli');
assert.ok(sellRes.adAstraReceived > 0, 'Kullanıcı satıştan ASTRA kazanmalı');
console.log('✅ Taban koridor engellemesi kaldırıldı, serbest piyasa kuralı devrede.');

// 2. TEST: KRALLIK MERKEZİ ALET ONARIMI VE YETERSİZ ASTRA UYARISI
console.log('\n[2] Krallık Merkezi Alet Onarımı ve Uyarı Metni Testi:');
// Kasada 0 ASTRA var
gs.state.adAstraBalance = 0;
// Aletleri hasarlı yapalım
gs.state.tools.axe.durability = 100;
gs.state.tools.pickaxe.durability = 50;
gs.state.tools.sickle.durability = 0;

const repairRes = gs.repairAllTools();
console.log('Alet Onarım Sonucu (ADA = 0):', repairRes);

assert.equal(repairRes.success, false, 'Yetersiz ASTRA varken onarım başarısız olmalı');
assert.equal(repairRes.hasDamagedTools, true, 'Hasarlı aletlerin varlığı tespit edilmeli');
assert.equal(repairRes.missingAda, true, 'ADA eksikliği bayrağı true olmalı');
assert.equal(repairRes.message, '⚠️ Hesapta yeteri kadar ASTRA yok!', 'Uyarı mesajı doğru olmalı');
console.log('✅ Alet onarımında "Tamir edilecek alet yok" yerine "⚠️ Hesapta yeteri kadar ASTRA yok!" uyarısı verildi.');

// 3. TEST: OTONOM GÜN SONU BUYBACK ÇALIŞMASI
console.log('\n[3] Gün Sonu Otonom AMM Buyback & Yakım Testi:');
// Satış sonrası buğday havuzunun fiyatı genesis fiyatının altına inmiş durumda
const wheatPrice = ammMarket.getPrice('wheat');
console.log(`Buyback öncesi Buğday Fiyatı: ${wheatPrice.toFixed(4)} ASTRA`);

const buybackAnalysis = gs.getAmmBuybackAnalysis(0.15);
console.log('Buyback Analizi:', {
  totalFundToSpend: buybackAnalysis.totalFundToSpend,
  assetsNeedingSupport: buybackAnalysis.assets.filter(a => a.allocatedBudget > 0).map(a => `${a.name}: ${a.allocatedBudget} ASTRA`)
});

// Gün sonu tetikleyicisi
gs.state.lastAmmBuybackDate = '2026-09-17'; // Dünün tarihi
const dailyRes = gs.checkDailyAutonomousBuyback('2026-09-18');
console.log('Gün Sonu Döngüsü Tetiklendi:', dailyRes);
assert.equal(dailyRes.executed, true, 'Gün geçişinde otonom buyback çalışmalı');
if (dailyRes.result && dailyRes.result.executed) {
  console.log('Yakılan Varlıklar:', dailyRes.result.reportItems);
}

// Aynı gün tekrar çağrıldığında çalışmamalı
const secondCall = gs.checkDailyAutonomousBuyback('2026-09-18');
assert.equal(secondCall.executed, false, 'Aynı gün içinde tekrar çalışmamalı');

console.log('✅ Gün sonu otonom buyback motoru testi başarıyla tamamlandı.');
