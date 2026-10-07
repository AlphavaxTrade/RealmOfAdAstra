import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { ammMarket } from '../js/ammMarket.js';

console.log('--- 🤖 24s OTOMASYON BOTU: AKILLI SİLO ALANI (%5 MARJLI MİNİMAL SATIŞ) TESTİ ---');

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
const woodLimit = cap.wood;

console.log(`Mevcut Seviye 1 Silo Odun Kapasitesi: ${woodLimit}`);

// 1. Silo Yeterli Olduğunda Satış Yapılmaması Kontrolü
gs.setBotSiloOption(true);
gs.state.inventory.wood = Math.floor(woodLimit * 0.3);
const harvestYield1 = Math.floor(woodLimit * 0.4); // toplam %70 <= kapasite
const res1 = gs.handleBotSiloSpace('wood', harvestYield1);
assert.equal(res1.handled, true, 'Silo yeterli olunca handled: true olmalı');
assert.equal(res1.neededSell, 0, 'Silo yeterli olunca satış yapılmamalı');
assert.equal(gs.state.inventory.wood, Math.floor(woodLimit * 0.3), 'Envanter değişmemeli');
console.log('✅ 1. Test Başarılı: Silo kapasitesi yeterliyken gereksiz satış yapılmadı.');

// 2. Silo Yükseltme Modunda (botSiloAutoUpgrade = true) Yetersiz Alanda Tam Hasat Kadar Yer Açma Kontrolü
gs.setBotSiloOption(true);
assert.equal(gs.state.botSiloAutoUpgrade, true, 'Bot silo seçeneği Silo Yükseltme olmalı');

// Siloyu limite çok yaklaştırıyoruz: boş yer 20
gs.state.inventory.wood = woodLimit - 20;
const harvestYield2 = 100; // Gelecek hasat: 100
// Boş yer 20, açık 80. Tam 80 odun satılmalı ki hasat 100 eklenince depo tam dolsun!
const needSell2 = harvestYield2 - 20;
const initWood = gs.state.inventory.wood;
const initAda = gs.state.adAstraBalance || 0;

const res2 = gs.handleBotSiloSpace('wood', harvestYield2);
assert.equal(res2.handled, true, 'İşlem başarılı olmalı');
assert.equal(res2.action, 'sold', 'Aksiyon sold olmalı');
assert.equal(res2.amountSold, needSell2, `Satılan miktar tam ${needSell2} olmalı, gerçekleşen: ${res2.amountSold}`);
assert.equal(gs.state.inventory.wood, initWood - needSell2, 'Envanterden tam gereken kadar odun düşülmeli');
assert(gs.state.adAstraBalance > initAda, 'Satıştan ADA kazanılmış olmalı');

// Hasat eklendiğinde tam 1080 (100% kapasite) olmalı:
const afterHarvestWood = gs.state.inventory.wood + harvestYield2;
assert.equal(afterHarvestWood, woodLimit, `Hasat sonrası (${afterHarvestWood}) ambar tam %100 (${woodLimit}) olmalı!`);
console.log('✅ 2. Test Başarılı: Siloyu Yükselt modunda sefer için tam gereken miktar (120) satıldı ve ambar %100 oldu!');

// 3. claimExpedition İçinde Otomatik Tetiklenme Kontrolü
gs.state.activeBuffs['auto_collector'] = { expiresAt: Date.now() + 86400000 };
assert(gs.isAutoCollectorActive(), 'Otomasyon botu aktif olmalı');

// Siloyu tekrar doldur: Odun tam kapasitede olsun
gs.state.inventory.wood = woodLimit;
gs.state.activeExpeditions['wood'] = {
  nodeId: 'wood',
  durationMinutes: 10,
  durationSeconds: 600,
  elapsedSeconds: 600,
  claimedSeconds: 0,
  isCompleted: true
};

const claimRes = gs.claimExpedition('wood');
assert.equal(claimRes.success, true, 'claimExpedition bot sayesinde siloyu boşaltıp başarıyla tamamlanmalı');
assert(claimRes.amount > 0, 'Odun toplanmış olmalı');
assert(gs.state.inventory.wood <= woodLimit, 'Hasat sonrası odun siloyu taşırmamalı');
console.log('✅ 3. Test Başarılı: claimExpedition bot aktifken silodaki taşmayı otomatik çözdü ve seferi kesintisiz tamamladı!');

// 4. Kaynakları Sat Modu (botSiloAutoUpgrade = false): Silo Yarısı (%50) Rezerv Koruma
gs.setBotSiloOption(false);
assert.equal(gs.state.botSiloAutoUpgrade, false, 'Bot Kaynakları Sat moduna alındı');
const halfCap = Math.floor(woodLimit * 0.5);
gs.state.inventory.wood = Math.floor(woodLimit * 0.77); // Yarısından fazla
const sellModeRes = gs.handleBotSiloSpace('wood', 100);
assert.equal(sellModeRes.handled, true, 'Kaynak Satış Modu devreye girmeli');
assert.equal(sellModeRes.action, 'sold', 'Satış gerçekleşmeli');
assert.equal(gs.state.inventory.wood, halfCap, `Envanter tam silo yarısına (${halfCap}) inmiş olmalı!`);
console.log('✅ 4. Test Başarılı: Kaynakları Sat modunda silonun yarısı (%50) rezerv korundu, fazlalık satıldı!');

console.log('🎉 TÜM 24s BOT AKILLI SİLO SATIŞ TESTLERİ %100 BAŞARIYLA TAMAMLANDI!');
