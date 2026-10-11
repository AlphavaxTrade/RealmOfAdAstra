import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { ammMarket } from '../js/ammMarket.js';
import '../js/treasury.js';
import '../js/config.js';
import { isoWeekKey } from '../js/gameState/ozet.js';

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

// 3. TEST: OTONOM HAFTALIK BUYBACK ÇALIŞMASI
// v2 düzeltmesi (E-planı S2, 8 Ekim 2026): motor artık GÜNDE değil HAFTADA bir çalışır (eskiden günde %15 kasayı
// kararın ~35 katı hızında eritiyordu); işaret ISO hafta anahtarıdır (lastAmmBuybackWeek), takvim günü değil.
console.log('\n[3] Haftalık Otonom AMM Buyback & Yakım Testi:');
// Satış sonrası buğday havuzunun fiyatı genesis fiyatının altına inmiş durumda
const wheatPrice = ammMarket.getPrice('wheat');
console.log(`Buyback öncesi Buğday Fiyatı: ${wheatPrice.toFixed(4)} ASTRA`);

const buybackAnalysis = gs.getAmmBuybackAnalysis(0.15);
console.log('Buyback Analizi:', {
  totalFundToSpend: buybackAnalysis.totalFundToSpend,
  assetsNeedingSupport: buybackAnalysis.assets.filter(a => a.allocatedBudget > 0).map(a => `${a.name}: ${a.allocatedBudget} ASTRA`)
});

// Hafta geçişi tetikleyicisi: işaret 7 gün önceki (kesin başka ISO hafta) bir anda bırakılır
gs.state.lastAmmBuybackWeek = isoWeekKey(new Date('2026-09-11').getTime());
const weeklyRes = gs.checkWeeklyAutonomousBuyback('2026-09-18');
console.log('Haftalık Döngü Tetiklendi:', weeklyRes);
assert.equal(weeklyRes.executed, true, 'Hafta geçişinde otonom buyback çalışmalı');
if (weeklyRes.result && weeklyRes.result.executed) {
  console.log('Yakılan Varlıklar:', weeklyRes.result.reportItems);
}

// Aynı hafta tekrar çağrıldığında çalışmamalı
const secondCall = gs.checkWeeklyAutonomousBuyback('2026-09-18');
assert.equal(secondCall.executed, false, 'Aynı hafta içinde tekrar çalışmamalı');

console.log('✅ Haftalık otonom buyback motoru testi başarıyla tamamlandı.');
