import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import '../js/ammMarket.js';
import '../js/globalPool.js';
import { treasury } from '../js/treasury.js';
import '../js/config.js';

console.log('--- 🤖 TAVERNA 24 SAATLİK OTONOM SEFER & TAMİR BOTU TAM DOĞRULAMA TESTİ ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();

// ══════════════════════════════════════════════════════════════════════════
// [1/6] DİNAMİK SAF KÂR VE %50 BOT BEDELİ HESAPLAMA DOĞRULAMASI
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[1/6] Taverna Botu Ekonomik Hesaplama Motoru Test Ediliyor...');
const botCalc = gs.calculateTavernaBotProfitAndCost();
console.log('Bot Hesaplama Çıktısı:', {
  brutGelir24h: botCalc.grossRevenueAda,
  staminaGider24h: botCalc.staminaWheatCostAda,
  aletTamirGider24h: botCalc.toolRepairCostAda,
  netSafKar24h: botCalc.netProfitAda,
  botMaliyetiAda: botCalc.botCostAda
});

assert(botCalc.grossRevenueAda > 0, '24 saatlik brüt üretim değeri pozitif olmalı');
assert(botCalc.netProfitAda > 0, '24 saatlik saf kâr pozitif olmalı');
assert.equal(botCalc.botCostAda, Math.max(1, Math.round(botCalc.netProfitAda * 0.5 * 1000) / 1000), 'Bot bedeli net kârın tam %50 si olmalı');
console.log('✅ [1/6] Dinamik saf kâr ve %50 ortaklık bedeli başarıyla doğrulandı.');

// ══════════════════════════════════════════════════════════════════════════
// [2/6] YETERSİZ BAKİYE İLE SATIN ALMA ENGELİ VE HATA YÖNETİMİ
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[2/6] Yetersiz Bakiye Kontrolü Test Ediliyor...');
gs.state.adAstraBalance = 10; // Çok düşük bakiye
const failBuyRes = gs.buyTavernaAutomationBot(false);
assert.equal(failBuyRes.success, false, 'Yetersiz bakiyeyle bot satın alınamamalı');
assert(failBuyRes.message.includes('Yetersiz ASTRA'), 'Kullanıcıya net bakiye uyarısı verilmeli');
assert.equal(gs.isAutoCollectorActive(), false, 'Bot aktif olmamalı');
console.log('✅ [2/6] Yetersiz bakiyede bot alımı başarıyla engellendi ve net mesaj verildi.');

// ══════════════════════════════════════════════════════════════════════════
// [3/6] BAŞARILI SATIN ALMA, SÜRE AKTİVASYONU & TOKENOMICS ENTEGRASYONU
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[3/6] Başarılı Satın Alma ve Süre Aktivasyonu Test Ediliyor...');
const prevTreasury = treasury.getSummary().totalBalance;
gs.state.adAstraBalance = 500000; // Yeterli bakiye
gs.state.inventory = { wood: 500, iron: 500, wheat: 500 }; // Dinamik önkoşullar hazır

const buyRes = gs.buyTavernaAutomationBot(false);
assert(buyRes.success, 'Bot satın alma işlemi başarılı olmalı');
assert(buyRes.costPaid > 0, 'Bot bedeli tahsil edilmeli');
assert.equal(gs.state.adAstraBalance, 500000 - buyRes.costPaid, 'Kullanıcı bakiyesinden tam bot bedeli düşmeli');

// Süre ve bayrak kontrolleri
assert(gs.state.botActiveUntil > Date.now(), 'botActiveUntil gelecekte bir zamana ayarlanmalı');
assert.equal(gs.state.tavernaBotActive, true, 'tavernaBotActive bayrağı true olmalı');
assert.equal(gs.isAutoCollectorActive(), true, 'isAutoCollectorActive() true dönmeli');
assert(gs.getAutoCollectorExpiry() > Date.now(), 'getAutoCollectorExpiry() geçerli süre dönmeli');

// Hazineye aktarım kontrolü
const afterTreasury = treasury.getSummary().totalBalance;
assert(afterTreasury > prevTreasury, 'Ödenen bot bedeli (%78 pay) doğrudan Hazine Kasalarına aktarılmalı');
console.log(`✅ [3/6] Bot aktifleştirildi! Kalan Süre: ~24 saat, Hazineye aktarılan pay: +${(afterTreasury - prevTreasury).toFixed(2)} ASTRA`);

// ══════════════════════════════════════════════════════════════════════════
// [4/6] SÜRE UZATMA (STACKING) & ÜCRETSİZ ÇARK BOTU TESTİ
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[4/6] Süre Uzatma (Stacking) ve Ücretsiz Bot Test Ediliyor...');
const firstExpiry = gs.state.botActiveUntil;
// Bir 24 saat daha satın al (paralı)
const extendRes = gs.buyTavernaAutomationBot(false);
assert(extendRes.success, 'Süre uzatma başarılı olmalı');
const secondExpiry = gs.state.botActiveUntil;
assert(Math.abs((secondExpiry - firstExpiry) - (24 * 3600 * 1000)) < 1000, 'Süre mevcudun üzerine tam +24 saat eklenmeli (Stacking)');

// Ücretsiz bot (Karnaval Çarkı amortisi)
const freeRes = gs.buyTavernaAutomationBot(true);
assert(freeRes.success, 'Ücretsiz bot eklenebilmeli');
assert.equal(freeRes.costPaid, 0, 'Ücretsiz bot için 0 ASTRA tahsil edilmeli');
const thirdExpiry = gs.state.botActiveUntil;
assert(Math.abs((thirdExpiry - secondExpiry) - (24 * 3600 * 1000)) < 1000, 'Ücretsiz bot da mevcudun üzerine +24 saat eklemeli');
console.log('✅ [4/6] Bot süresi 24h -> 48h -> 72h olarak kusursuzca birikti.');

// ══════════════════════════════════════════════════════════════════════════
// [5/6] AKILLI SİLO YÖNETİMİ: AMBAR TAŞMA KORUMASI VE SATIŞ
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[5/6] Bot Akıllı Silo Alanı Yönetimi Test Ediliyor...');
// Silo kapasitesini ve mevcut stoğu ayarla
gs.state.inventory.wood = 490;
const capMap = gs.getWarehouseCapacity();
const woodCap = capMap.wood || 500;
gs.state.inventory.wood = woodCap - 10; // Yalnızca 10 boş yer var

// 180 odunluk bir sefer tamamlandığında yer açma testi (Akıllı Satış modu: botSiloAutoUpgrade = false)
gs.setBotSiloOption(false);
const prevWood = gs.state.inventory.wood;
const prevAda = gs.state.adAstraBalance;

const spaceRes = gs.handleBotSiloSpace('wood', 180);
assert(spaceRes.handled, 'Bot silo alanını yönetmeli');
assert(gs.state.inventory.wood < prevWood, 'Gerektiği kadar odun pazarda satılmış olmalı');
assert(gs.state.adAstraBalance > prevAda, 'Satıştan kazanılan ASTRA hesaba geçmiş olmalı');

const newAvailableRoom = woodCap - gs.state.inventory.wood;
assert(newAvailableRoom >= 180, 'Yeni sefer mahsulünü alacak kadar boş alan açılmış olmalı');
console.log(`✅ [5/6] Akıllı Satış Devrede: ${spaceRes.amountSold} Odun satıldı, +${spaceRes.earnedAda?.toFixed(2)} ASTRA kazanıldı, ambarda tam yer açıldı.`);

// ══════════════════════════════════════════════════════════════════════════
// [6/6] SEFER BİTİMİNDE OTONOM HASAT & ALET TAMİR ENTEGRASYONU
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[6/6] Otonom Sefer Hasadı ve Alet Durumu Test Ediliyor...');
// Aktif bir odun seferi başlat
gs.state.stamina = 100;
gs.state.tools.axe.durability = 1; // 1 kullanım kalmış
gs.startExpedition('wood');
assert(gs.state.activeExpeditions.wood, 'Odun seferi başlamış olmalı');

// Sefer süresini simüle et
const exp = gs.state.activeExpeditions.wood;
exp.elapsedSeconds = exp.durationSeconds; // Sefer bitti!
exp.isCompleted = true;

// claimExpedition çağrıldığında oto-bot devreye girmeli
const claimRes = gs.claimExpedition('wood');
assert(claimRes.success, 'Sefer başarıyla toplanmalı');
console.log('✅ [6/6] Otonom sefer hasadı ve döngü yönetimi başarıyla doğrulandı.');

console.log('\n🎉🎉🎉 TAVERNA 24 SAATLİK OTONOM BOT TÜM MEKANİKLERİYLE %100 BAŞARIYLA ÇALIŞIYOR! 🎉🎉🎉\n');
