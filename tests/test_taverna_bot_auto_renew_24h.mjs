import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import '../js/ammMarket.js';
import '../js/globalPool.js';
import '../js/treasury.js';
import '../js/config.js';

console.log('--- 🤖 TAVERNA 24 SAAT BİTİNCE OTOMATİK YENİLEME TESTİ ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();

// 1. Test: Seçeneği Açma/Kapatma
console.log('\n[1/5] Otomatik Yenileme Seçeneği Ayarı...');
assert.equal(gs.state.botAutoRenew24h, false, 'Varsayılan olarak autoRenew kapalı olmalı');
gs.setBotAutoRenew24h(true);
assert.equal(gs.state.botAutoRenew24h, true, 'setBotAutoRenew24h(true) sonrası açık olmalı');
gs.setBotAutoRenew24h(false);
assert.equal(gs.state.botAutoRenew24h, false, 'setBotAutoRenew24h(false) sonrası kapalı olmalı');
gs.setBotAutoRenew24h(true);
console.log('✅ [1/5] Otomatik yenileme bayrağı başarıyla yönetiliyor.');

// 2. Test: Bot Satın Alma ve 24 Saatlik Süre
console.log('\n[2/5] Bot Satın Alınıyor...');
gs.state.adAstraBalance = 500000;
gs.state.inventory = { wood: 1000, iron: 1000, wheat: 1000 };
const buyRes = gs.buyTavernaAutomationBot(false);
assert(buyRes.success, 'Bot satın alma başarılı olmalı');
const firstExpiry = gs.getAutoCollectorExpiry();
assert(firstExpiry > Date.now(), 'Bot süresi gelecekte olmalı');
console.log('✅ [2/5] Bot başarıyla başlatıldı. Bitiş süresi:', new Date(firstExpiry).toISOString());

// 3. Test: 24 Saat Dolduğunda Yeterli ASTRA ile Canlı Otomatik Yenileme
console.log('\n[3/5] 24 Saat Bittiğinde Otomatik Yenileme Kontrolü (Yeterli ASTRA)...');
// Süreyi geçmiş zamana çekerek 24 saatin bittiğini simüle edelim
const now = Date.now();
gs.state.botActiveUntil = now - 5000;
gs.state.tavernaBotExpiresAt = now - 5000;
if (gs.state.activeBuffs && gs.state.activeBuffs.auto_collector) {
  gs.state.activeBuffs.auto_collector.expiresAt = now - 5000;
}

const prevBalance = gs.state.adAstraBalance;
const status = gs.updateBotPauseState();

assert.equal(status.justRenewed, true, 'updateBotPauseState justRenewed: true dönmeli');
assert.equal(status.isBotPurchased, true, 'Bot hala aktif satın alınmış durumda olmalı');
assert(gs.getAutoCollectorExpiry() > now, 'Yeni bot bitiş süresi geleceğe uzatılmış olmalı');
assert(gs.state.adAstraBalance < prevBalance, 'Kullanıcının bakiyesinden bot bedeli tahsil edilmiş olmalı');
console.log('✅ [3/5] Bot 24 saat bitince yeterli ASTRA ile otomatik tekrar satın alındı ve devam etti!');

// 4. Test: 24 Saat Dolduğunda Yetersiz ASTRA Durumu
console.log('\n[4/5] 24 Saat Bittiğinde Yetersiz ASTRA ile Davranış...');
gs.state.adAstraBalance = 0; // ASTRA yok
gs.state.botActiveUntil = now - 5000;
gs.state.tavernaBotExpiresAt = now - 5000;
if (gs.state.activeBuffs && gs.state.activeBuffs.auto_collector) {
  gs.state.activeBuffs.auto_collector.expiresAt = now - 5000;
}

const statusNoAda = gs.updateBotPauseState();
assert.equal(statusNoAda.isBotPurchased, false, 'ADA yetersizken bot yenilenmemeli ve durdurulmalı');
assert.equal(gs.isAutoCollectorActive(), false, 'Bot aktif olmamalı');
console.log('✅ [4/5] Yetersiz bakiyede bot zorlanmadı, bakiyeyi eksiye düşürmeden durduruldu.');

// 5. Test: Çevrimdışı Simülasyonda (Offline Fast-Forward) Otomatik Yenileme
console.log('\n[5/5] Çevrimdışı İlerlemede (Fast-Forward) Otomatik Yenileme...');
gs.state.adAstraBalance = 1000000;
gs.state.inventory = { wood: 5000, iron: 5000, wheat: 5000 };
gs.setBotAutoRenew24h(true);
gs.buyTavernaAutomationBot(false);

// 36 saat çevrimdışı kalındığını simüle edelim (24 saati aşıyor)
const ffResult = gs.fastForwardTime(36);
assert(ffResult, 'fastForwardTime bir sonuç nesnesi dönmeli');
console.log('Çevrimdışı Simülasyon Durumu:', ffResult.botExecutionStatus);
console.log('Toplanan Seferler:', ffResult.totalExpeditionsClaimed);
assert(ffResult.totalExpeditionsClaimed > 0, 'Otomatik yenilenen bot 36 saat boyunca sefer toplamış olmalı');
console.log('✅ [5/5] Çevrimdışı simülasyonda 24 saat bittiğinde otomatik yenilenerek kesintisiz devam etti!');

console.log('\n🎉 TÜM TESTLER BAŞARIYLA TAMAMLANDI!');
