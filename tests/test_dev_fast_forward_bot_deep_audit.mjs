import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import '../js/ammMarket.js';
import '../js/globalPool.js';
import '../js/treasury.js';
import '../js/config.js';

console.log('--- 🧪 TEST MENÜSÜ SAATİ İLERİ SARMA (FAST-FORWARD) DERİN DENETİMİ ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();

// =========================================================================
// [1/4] TEST MENÜSÜNDEN +1 SAAT İLERİ SARMA VE CANLI OYUNUN DEVAMI
// =========================================================================
console.log('\n[1/4] Test Menüsü: +1 Saat İleri Sarma Test Ediliyor...');
gs.state.adAstraBalance = 500000;
gs.state.inventory = { wood: 1000, iron: 1000, wheat: 1000 };
gs.buyTavernaAutomationBot(false);

const initialExpiry = gs.getAutoCollectorExpiry();
const initialExpHours = (initialExpiry - Date.now()) / (3600 * 1000);
console.log(`Bot Başlatıldı: Kalan Süre ~${initialExpHours.toFixed(1)} saat`);
assert.ok(initialExpHours >= 23.9, 'Bot süresi 24 saat civarı olmalı');

// Test menüsündeki "+1 Saat İlerlet" buton eylemi
const report1h = gs.fastForwardTime(1);
console.log('+1 Saat İleri Sarma Raporu:', {
  durum: report1h.botExecutionStatus,
  toplananSeferler: report1h.totalExpeditionsClaimed,
  odunKazanci: report1h.woodGain,
  demirKazanci: report1h.ironGain,
  bugdayKazanci: report1h.wheatGain,
  kalanSure: report1h.botRemainingText
});

assert.equal(report1h.botExecutionStatus, 'ran', 'Bot aktif çalışmış olmalı');
assert.ok(report1h.totalExpeditionsClaimed > 0, 'Seferler tamamlanmış olmalı');

const expiryAfter1h = gs.getAutoCollectorExpiry();
const remainingHoursAfter1h = (expiryAfter1h - Date.now()) / (3600 * 1000);
console.log(`+1 Saat Sonrası Kalan Bot Süresi: ~${remainingHoursAfter1h.toFixed(2)} saat`);
assert.ok(remainingHoursAfter1h <= 23.1 && remainingHoursAfter1h >= 22.8, 'Kalan bot süresi tam 1 saat eksilmiş olmalı (~23 saat)');

const repairCostAfter1h = gs.getAllRepairCost();
console.log('+1 Saat Sonrası Aletlerin Durumu (Tamir Maliyeti):', repairCostAfter1h);
assert.equal(repairCostAfter1h.count, 0, 'Tüm aletler tam sağlam teslim edilmiş olmalı!');

// Canlı Oyun Akışının Devamı: İleri sardıktan sonra oyun tick'leri devam ettiğinde bot sağlıklı çalışıyor mu?
console.log('İleri sarma sonrasında canlı oyun döngüsü (tick) devam ettiriliyor...');
for (let i = 0; i < 5; i++) {
  gs.regenerateStamina(1);
  gs.updateExpeditions(1);
  const pauseSt = gs.updateBotPauseState();
  assert.equal(pauseSt.isPaused, false, 'Canlı tick esnasında bot duraklamamalı');
  gs.runTavernaAutomationCycle();
}
console.log('✅ [1/4] +1 Saat İleri sarma ve ardından canlı oyun akışı kusursuz çalıştı.');

// =========================================================================
// [2/4] TEST MENÜSÜNDEN +6 SAAT İLERİ SARMA (UZUN VADELİ OTONOM ÇALIŞMA)
// =========================================================================
console.log('\n[2/4] Test Menüsü: +6 Saat İleri Sarma Test Ediliyor...');
const report6h = gs.fastForwardTime(6);
console.log('+6 Saat İleri Sarma Raporu:', {
  durum: report6h.botExecutionStatus,
  toplananSeferler: report6h.totalExpeditionsClaimed,
  kalanSure: report6h.botRemainingText
});

assert.equal(report6h.botExecutionStatus, 'ran', 'Bot 6 saat boyunca kesintisiz çalışmış olmalı');
assert.ok(report6h.totalExpeditionsClaimed >= 15, '6 saatte en az 15 sefer tamamlanmış olmalı');

const remainingHoursAfter6h = (gs.getAutoCollectorExpiry() - Date.now()) / (3600 * 1000);
console.log(`+6 Saat Sonrası Kalan Bot Süresi: ~${remainingHoursAfter6h.toFixed(2)} saat`);
assert.ok(remainingHoursAfter6h <= 17.2 && remainingHoursAfter6h >= 16.8, 'Kalan süre ~17 saat olmalı');

const repairCostAfter6h = gs.getAllRepairCost();
assert.equal(repairCostAfter6h.count, 0, '6 saatlik yoğun seferlerden sonra da tüm aletler tamir edilmiş olmalı!');
console.log('✅ [2/4] +6 Saat İleri sarma ve ardışık sefer döngüleri başarıyla tamamlandı.');

// =========================================================================
// [3/4] +18 SAAT İLERİ SARMA & OTOMATİK YENİLEME (24 SAATİN AŞILMASI)
// =========================================================================
console.log('\n[3/4] Test Menüsü: +24 Saatlik Sınırı Aşan İleri Sarma ve Oto-Yenileme Testi...');
// Kalan süremiz ~17 saat. Şimdi +18 saat sararsak toplam 25 saat geçmiş olacak ve 24 saat aşılacak!
gs.setBotAutoRenew24h(true); // Otomatik yenileme açık
const report18h = gs.fastForwardTime(18);

console.log('+18 Saat Sonrası Rapor:', {
  durum: report18h.botExecutionStatus,
  toplananSeferler: report18h.totalExpeditionsClaimed,
  kalanSure: report18h.botRemainingText
});

assert.equal(report18h.botExecutionStatus, 'ran', 'Bot otomatik yenilenerek kesintisiz çalışmaya devam etmiş olmalı');
assert.equal(gs.hasPurchasedBot(), true, 'Bot süresi bittiği an kasadaki ASTRA ile yenilenip aktif kalmalı');
const expiryAfterRenew = gs.getAutoCollectorExpiry();
assert.ok(expiryAfterRenew > Date.now(), 'Yeni 24 saatlik periyottan kalan süre gelecekte olmalı');
console.log('✅ [3/4] 24 saatlik sınır aşıldığında bot otomatik satın alınıp kesintisiz devam etti!');

// =========================================================================
// [4/4] DONDURULMUŞ (PAUSED) BOT İLE İLERİ SARMA (SÜRE KORUMA DOĞRULAMASI)
// =========================================================================
console.log('\n[4/4] Dondurulmuş Bot İle İleri Sarma (Süre Kaybı Olmama Testi)...');
// Botu dondurmak için depoyu ve ASTRA'yı sıfırlayalım
gs.state.inventory = { wood: 0, iron: 0, wheat: 0 };
gs.state.adAstraBalance = 0;
const pauseSt = gs.updateBotPauseState();
assert.equal(pauseSt.isPaused, true, 'Kaynaklar 0 iken bot duraklatılmalı');
assert.equal(gs.isBotPaused(), true, 'Bot duraklatılmış (paused) olmalı');

const pausedRemainingBefore = gs.state.botPausedRemainingMs;
console.log(`Dondurulan Kalan Süre: ${(pausedRemainingBefore / 3600000).toFixed(2)} saat`);

// Test menüsünden +6 saat ileri saralım
const reportPausedFF = gs.fastForwardTime(6);
console.log('Dondurulmuşken +6 Saat Sarma Raporu:', reportPausedFF.botExecutionStatus);
assert.equal(reportPausedFF.botExecutionStatus, 'paused', 'Bot dondurulmuş olarak raporlanmalı');

const pausedRemainingAfter = gs.state.botPausedRemainingMs;
console.log(`6 Saat İleri Sardıktan Sonra Dondurulan Süre: ${(pausedRemainingAfter / 3600000).toFixed(2)} saat`);
assert.equal(pausedRemainingAfter, pausedRemainingBefore, 'Dondurulan bot süresi 1 milisaniye bile AZALMAMALI!');

// Kaynakları tekrar verelim ve uyandıralım
gs.state.inventory = { wood: 500, iron: 500, wheat: 500 };
gs.state.adAstraBalance = 50000;
const resumeSt = gs.updateBotPauseState();
assert.equal(resumeSt.justResumed, true, 'Kaynaklar gelince bot dondurulduğu yerden uyanmalı');
assert.equal(gs.isBotPaused(), false, 'Bot artık çalışıyor olmalı');

console.log('✅ [4/4] Dondurulmuş bot ile saatler sarılsa dahi sürenin eksilmediği ve uyanınca devam ettiği kanıtlandı!');

console.log('\n🎉 TEST MENÜSÜ İLERİ SARMA DERİN DENETİMİ %100 BAŞARIYLA GEÇTİ!');
