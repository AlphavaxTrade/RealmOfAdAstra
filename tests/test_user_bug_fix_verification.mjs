import assert from 'node:assert/strict';
import { globalPool } from '../js/globalPool.js';
import { ammMarket } from '../js/ammMarket.js';
import { treasury } from '../js/treasury.js';
import { GameStateManager } from '../js/gameState.js';
import '../js/config.js';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};
globalThis.ammMarket = ammMarket;
globalThis.treasury = treasury;
globalThis.globalPool = globalPool;
globalThis.sound = { playLevelUp(){}, playClick(){}, playSuccess(){}, playError(){} };

const gs = new GameStateManager();
globalThis.gameState = gs;

console.log('--- 🧪 TEST: Kullanıcının Raporladığı Senaryo ---');
gs.vanillaReset();

// Kullanıcının ambarı dolu (1080 Odun, 720 Demir, 1800 Buğday)
gs.state.inventory = { wood: 1080, iron: 720, wheat: 1800, fragments: 0 };
gs.state.adAstraBalance = 50000;

console.log('Bot Alımı Öncesi:');
console.log('Depo Seviyesi:', gs.state.warehouseLevel);
console.log('Envanter:', gs.state.inventory);
console.log('Bakiye:', gs.state.adAstraBalance);

const pWoodBefore = ammMarket.getPrice('wood');
const pIronBefore = ammMarket.getPrice('iron');
const pWheatBefore = ammMarket.getPrice('wheat');
console.log('Fiyatlar Öncesi: Odun:', pWoodBefore, 'Demir:', pIronBefore, 'Buğday:', pWheatBefore);

// Botu Satın Al
console.log('\n--- Bot Satın Alınıyor (~46.116 ASTRA) ---');
const buyRes = gs.buyTavernaAutomationBot(false);
assert.equal(buyRes.success, true, 'Bot satın alınabilmeli');

console.log('Bot Alımı Sonrası:');
console.log('Depo Seviyesi:', gs.state.warehouseLevel);
console.log('Envanter:', gs.state.inventory);
console.log('Kalan Bakiye:', gs.state.adAstraBalance);

const pWoodAfter = ammMarket.getPrice('wood');
const pIronAfter = ammMarket.getPrice('iron');
const pWheatAfter = ammMarket.getPrice('wheat');
console.log('Fiyatlar Sonrası: Odun:', pWoodAfter, 'Demir:', pIronAfter, 'Buğday:', pWheatAfter);

// DOĞRULAMALAR:
// 1. Bot alındığı saniye henüz hiçbir sefer toplanmadığı için depo seviyesi Seviye 1 kalmalıdır!
assert.equal(gs.state.warehouseLevel, 1, 'Hemen bot alındığı an silo seviye 2 olmamalı, Seviye 1 kalmalı!');

// 2. Kullanıcının kalan parası korunmalı (160 ASTRA gibi bitmiş olmamalı!)
// v1.25: Bot ücreti doğal stamina yenilenmesini de hesaba kattığı için Lv.1'de ~800 ASTRA yüksek (~46.930 ASTRA).
assert.ok(gs.state.adAstraBalance >= 2900, `Kalan bakiye >= 2900 ASTRA olmalı, bulunan: ${gs.state.adAstraBalance}`);

// 3. Fiyatlar bot alındığı an artmamalıdır (çünkü zorla hammadde satın alımı yapılmamıştır)
assert.ok(pWoodAfter <= pWoodBefore, 'Odun fiyatı bot alımında artmamalı');
assert.ok(pIronAfter <= pIronBefore, 'Demir fiyatı bot alımında artmamalı');
assert.ok(pWheatAfter <= pWheatBefore, 'Buğday fiyatı bot alımında artmamalı');

console.log('\n✅ 1. AŞAMA BAŞARILI: Bot alındığı an silo seviye 2 olmuyor, bakiye tükenmiyor ve fiyatlar artmıyor!');

// Şimdi 24 saat simüle edelim (fastForwardTime 24 saat)
console.log('\n--- 2. AŞAMA: 24 Saatlik Simülasyon Çalıştırılıyor ---');
const ffRes = gs.fastForwardTime(24);
console.log('Simülasyon özeti: Yapılan sefer:', ffRes.expeditionsRun, 'Kazanılan XP:', ffRes.totalXpGained);

const pWood24h = ammMarket.getPrice('wood');
const pIron24h = ammMarket.getPrice('iron');
const pWheat24h = ammMarket.getPrice('wheat');
console.log('24 Saat Sonrası Fiyatlar: Odun:', pWood24h, 'Demir:', pIron24h, 'Buğday:', pWheat24h);
console.log('24 Saat Sonrası Bakiye:', gs.state.adAstraBalance);
console.log('24 Saat Sonrası Depo Seviyesi:', gs.state.warehouseLevel);

// Bot satış yaptıkça market fiyatları düşmüş olmalıdır!
assert.ok(pWood24h < pWoodBefore, `Odun fiyatı düşmüş olmalı: ${pWood24h} < ${pWoodBefore}`);
assert.ok(pIron24h < pIronBefore, `Demir fiyatı düşmüş olmalı: ${pIron24h} < ${pIronBefore}`);
assert.ok(pWheat24h < pWheatBefore, `Buğday fiyatı düşmüş olmalı: ${pWheat24h} < ${pWheatBefore}`);

console.log('\n✅ 2. AŞAMA BAŞARILI: 24 saat boyunca seferler yapıldı, hammadde satıldı ve piyasa fiyatları kullanıcının beklediği gibi düştü!');
