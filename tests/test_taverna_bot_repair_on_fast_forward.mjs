import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import '../js/ammMarket.js';
import '../js/globalPool.js';
import '../js/treasury.js';
import { GAME_CONFIG } from '../js/config.js';

console.log('--- 🤖 TAVERNA BOTU ALETLERİ OTOMATİK ONARMA TESTİ ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();

// 1. Durum: Kaynakları ve bakiyeyi yükle
// v1.25: Silo Lv.1 en fazla 1.080 odun tutar; eski test 5.000 odun koyup silonun fazlasını sessizce
// silmesine güveniyordu. Gerçekçi olsun diye silo Lv.6 (3.966 odun / 2.707 demir) kullanılıyor.
gs.state.warehouseLevel = 6;
gs.state.adAstraBalance = 100000;
gs.state.inventory = { wood: 5000, iron: 5000, wheat: 5000 };

// Bot satın al
const buyRes = gs.buyTavernaAutomationBot(false);
assert(buyRes.success, 'Bot satın alınmalı');

// 2. Aletleri kasıtlı olarak aşındır (kullanıcının ekranındaki gibi dayanıklılık düşüşü)
const maxAxe = GAME_CONFIG.TOOLS.axe.maxDurability || 4320;
const maxPick = GAME_CONFIG.TOOLS.pickaxe.maxDurability || 4320;
const maxSickle = GAME_CONFIG.TOOLS.sickle.maxDurability || 4320;

gs.state.tools.axe.durability = maxAxe - 200;
gs.state.tools.pickaxe.durability = maxPick - 300;
gs.state.tools.sickle.durability = maxSickle - 250;

const preCost = gs.getAllRepairCost();
console.log('Aşınma sonrası tamir maliyeti:', preCost);
assert(preCost.count > 0, 'Aşınmış alet olmalı');

// 3. runTavernaAutomationCycle çalıştırıldığında bot aletleri onarmalı
const cycleRes = gs.runTavernaAutomationCycle();
console.log('Bot döngüsü aksiyonları:', cycleRes.actions);

const postCost = gs.getAllRepairCost();
console.log('Döngü sonrası tamir maliyeti:', postCost);
assert.equal(postCost.count, 0, 'Bot döngüsü sonrası tüm aletler tamir edilmiş olmalı');
assert.equal(gs.state.tools.axe.durability, maxAxe, 'Balta tam sağlam olmalı');
assert.equal(gs.state.tools.pickaxe.durability, maxPick, 'Kazma tam sağlam olmalı');
assert.equal(gs.state.tools.sickle.durability, maxSickle, 'Orak tam sağlam olmalı');
console.log('✅ [1/2] runTavernaAutomationCycle hasarlı aletleri otomatik onardı!');

// 4. fastForwardTime(1) ile 1 saat ileri sarma testi
console.log('\n[2/2] 1 Saat İleri Sarma (fastForwardTime) Test Ediliyor...');
// Seferler başlasın ve 1 saat boyunca çalışsın
const ffResult = gs.fastForwardTime(1);
console.log('1 Saat İleri Sarma Raporu:', {
  botExecutionStatus: ffResult.botExecutionStatus,
  totalExpeditionsClaimed: ffResult.totalExpeditionsClaimed
});

const ffRepairCost = gs.getAllRepairCost();
console.log('1 Saat İleri Sarma Sonrası Tamir Maliyeti:', ffRepairCost);
assert.equal(ffRepairCost.count, 0, '1 saat ileri sarma sonrasında aletler tamir edilmiş olmalı!');
console.log('✅ [2/2] 1 saat ileri sarma sonrası tüm aletler tam sağlam teslim edildi!');

console.log('\n🎉 TÜM TESTLER BAŞARIYLA TAMAMLANDI!');
