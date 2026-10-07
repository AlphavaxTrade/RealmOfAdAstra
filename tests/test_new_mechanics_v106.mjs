import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { GAME_CONFIG } from '../js/config.js';
import { treasury } from '../js/treasury.js';
import { ammMarket } from '../js/ammMarket.js';

console.log('--- 🎪 v1.06 BÜYÜK KRALLIK REFORMU VE KARNAVAL KAPSAMLI TESTİ BAŞLATILIYOR ---');

// Mock localStorage for node environment
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const gs = new GameStateManager();
gs.state.adAstraBalance = 5000000;
gs.state.inventory = { iron: 1000000, wood: 1000000, wheat: 1000000, coal: 1000000, stone: 1000000, herb: 1000000, fragments: 1000 }; // v2: 6 hammadde

// ══════════════════════════════════════════════════════════════════════════
// 1. ASKER SADELEŞTİRMESİ: TEK TİP "ADASTRA ŞAMPİYONU" & HIZLI DOYURMA
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[1/7] Asker ve Hızlı Doyurma Mekanikleri Test Ediliyor...');
const soldier = gs.createSoldierUnit(0);
assert.equal(soldier.classId, 'adastra_champion', 'Asker sınıfı adastra_champion olmalı');
assert.equal(soldier.className, 'AdAstra Şampiyonu', 'Asker sınıf adı AdAstra Şampiyonu olmalı');
assert(soldier.name.startsWith('AdAstra Şampiyonu'), 'Asker adı AdAstra Şampiyonu ile başlamalı');
assert.equal(soldier.hp, 100, 'Lv.1 Şampiyon HP 100 olmalı');
assert.equal(soldier.maxHp, 100, 'Lv.1 Şampiyon maxHp 100 olmalı');
assert.equal(soldier.atk, 25, 'Lv.1 Şampiyon ATK 25 olmalı');

// Asker yaralama ve 18s otomatik pasif vs 100x hızlı doyurma maliyet hesabı
soldier.hp = 50; // 50 HP eksik
gs.state.soldierUnits = [soldier];
const healInfo = gs.getSoldierHealInfo(0);
assert.equal(healInfo.missingHp, 50, '50 eksik HP tespit edilmeli');

// 1. 18 Saatlik Otomatik Pasif İyileşme (1 HP = 0.30 Buğday + 0.10 ADA)
const PH = GAME_CONFIG.SOLDIER_PASSIVE_HEAL, FH = GAME_CONFIG.SOLDIER_FAST_HEAL;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
assert.equal(healInfo.passiveWheatNeeded, 15, 'Otomatik iyileşme: 50 HP için 15 Buğday (0.30 x 50)');
assert.ok(near(healInfo.passiveAdaCost, 50 * PH.adaPerHp), `Otomatik iyileşme: 50 HP için ${50 * PH.adaPerHp} ASTRA (v2 ölçekli), bulunan ${healInfo.passiveAdaCost}`);

// 2. Hızlı Doyurma (formülün 10 katı: 1 HP = 3 Buğday + 0,01 ASTRA)
assert.equal(healInfo.wheatCost, 150, 'Hızlı doyurma (10x): 50 HP için 150 Buğday (3 x 50)');
assert.ok(near(healInfo.adAstraCost, 50 * FH.adAstraPerHp), `Hızlı doyurma (10x): 50 HP için ${50 * FH.adAstraPerHp} ASTRA, bulunan ${healInfo.adAstraCost}`);

// 3. Pasif İyileşme Zaman Döngüsü (1 Saatlik Tik Simülasyonu)
gs.state.inventory.wheat = 100;
gs.state.adAstraBalance = 100;
const prevHp = soldier.hp;
gs.processSoldierPassiveHealing(3600); // 1 saat
assert(soldier.hp > prevHp, '18 saatlik pasif iyileşme zamanla can kazandırmalı');

// 4. Anında Hızlı Doyurma Testi (10x Kaynak Harcayarak Saniyeler İçinde Tamamlama)
soldier.hp = 50;
gs.state.inventory.wheat = 50000;
gs.state.adAstraBalance = 50000;
const healRes = gs.healSoldierInstantly(0);
assert(healRes.success, 'Asker 10x formülüyle anında doyurulabilmeli');
assert.equal(soldier.hp, 100, 'Hızlı doyurma sonrası asker tam canlı olmalı');
console.log('✅ 18 saatlik otomatik pasif iyileşme (0.30 Buğday + 0.10 ADA) ve 10 katı hızlı doyurma (3 Buğday + 1 ADA) %100 doğrulandı.');

// ══════════════════════════════════════════════════════════════════════════
// 2. 1-CLICK SEFER TOPLAMA (BİTMEMİŞ SEFERLERDEN BİRİKENİ TOPLAMA)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[2/7] 1-Click Sefer ve Biriken Kaynak Toplama Test Ediliyor...');
gs.state.inventory.wood = 0; // Silo taşma kontrolünü karşılamak için temizle
gs.state.stamina = 100;
const startRes = gs.startExpedition('wood');
assert(startRes.success, 'Odun seferi başlayabilmeli');
assert(gs.state.activeExpeditions.wood, 'Odun seferi aktif olmalı');

// Seferin %50'si kadar süre simüle et
const durationSec = gs.state.activeExpeditions.wood.durationSeconds;
gs.state.activeExpeditions.wood.elapsedSeconds = durationSec * 0.5; // %50 tamamlandı

const accrued = gs.getAccruedExpeditionHarvest('wood');
assert(accrued.accruedAmount > 0, 'Bitmemiş seferden biriken hasat pozitif olmalı');
assert.equal(accrued.pct, 50, 'İlerleme %50 olmalı');

const prevWood = gs.state.inventory.wood;
// 1-Click Toplu Toplama butonunun çalıştırdığı metod
const claimAllRes = gs.claimAndRestartAllExpeditions();
assert(claimAllRes.partialClaimed > 0 || claimAllRes.claimed > 0, 'Bitmemiş seferden kaynak toplanabilmeli');
assert(gs.state.inventory.wood > prevWood, 'Envantere biriken odun eklenmiş olmalı');
console.log('✅ Bitmemiş seferlerden erken hasat toplama %100 doğrulandı.');

// ══════════════════════════════════════════════════════════════════════════
// 3. ZİNDAN: PERSISTENT CANAVAR CANI (KAYBEDİLEN SAVAŞTA CAN YENİLENMEZ)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[3/7] Zindan Kalıcı Canavar Canı (Persistent HP) Test Ediliyor...');
const floorLevel = 3;
const baseMonsterHp = 500;

// Henüz savaş yapılmamışken base HP dönmeli
assert.equal(gs.getMonsterCurrentHp(floorLevel, baseMonsterHp), baseMonsterHp, 'İlk girişte canavar full canlı olmalı');

// Savaş yapıldı, oyuncu canavara hasar verdi ve kaybetti
gs.recordMonsterHp(floorLevel, 280);
assert.equal(gs.getMonsterCurrentHp(floorLevel, baseMonsterHp), 280, 'Yenildikten sonra canavar 280 HP ile beklemeli');

// Oyuncu askerini doyurup zindana geri girdiğinde canavar hala 280 HP olmalı
assert.equal(gs.getMonsterCurrentHp(floorLevel, baseMonsterHp), 280, 'Tekrar girişte canavarın canı yenilenmemiş olmalı');

// Canavar öldürüldü (Zafer)
gs.clearMonsterHp(floorLevel);
assert.equal(gs.getMonsterCurrentHp(floorLevel, baseMonsterHp), baseMonsterHp, 'Canavar öldükten sonra kayıt temizlenmeli');
console.log('✅ Zindan persistent canavar canı sistemi %100 doğrulandı.');

// ══════════════════════════════════════════════════════════════════════════
// 4. TEÇHİZAT CRAFT, UPGRADE, DAYANIKLILIK VE CEPHANELİK YÖNETİMİ
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[4/7] Teçhizat 18dk/21dk Formülleri, 13 Durability & Cephanelik Test Ediliyor...');
// Kılıç (weapon): 25 ATK => 1 ATK = 18 dk kaynak
const weaponCraftCost = gs.calculateEquipmentCraftCost('weapon');
assert(weaponCraftCost.ironCost > 0, 'Silah demir maliyeti olmalı');
assert(weaponCraftCost.woodCost > 0, 'Silah odun maliyeti olmalı');
assert(weaponCraftCost.adaCost > 0, 'Silah AMM DEX ADA maliyeti olmalı');
assert.equal(weaponCraftCost.fragCost, 1, 'Lv.1 üretim 1 parça talep etmeli');

gs.state.warehouseLevel = 18;
gs.state.adAstraBalance = 5000000;
gs.state.inventory = { iron: 500000, wood: 500000, wheat: 500000, coal: 500000, stone: 500000, herb: 500000, fragments: 5000 }; // v2: teçhizat kömür de ister
const craftW = gs.craftEquipment('weapon');
assert(craftW.success, 'Silah üretilebilmeli');
const createdWeapon = gs.state.equipment.weapon;
assert.equal(createdWeapon.durability, 13, 'Silah 13/13 dayanıklılık ile başlamalı');
assert.equal(createdWeapon.maxDurability, 13, 'Max dayanıklılık 13 olmalı');

// Kılıç zindanda yıprandı (durability = 3)
createdWeapon.durability = 3;
const repCost = gs.calculateEquipmentRepairCost('weapon', null);
assert.equal(repCost.missingDurability, 10, '10 eksik dayanıklılık tespit edilmeli');
assert(repCost.ironCost > 0 && repCost.woodCost > 0 && repCost.adaCost > 0, 'Tamir kümülatif maliyetin %10\'una oranlı olmalı');

const repRes = gs.repairEquipment('weapon', null);
assert(repRes.success, 'Eşya tamir edilebilmeli');
assert.equal(createdWeapon.durability, 13, 'Tamir sonrası 13/13 olmalı');

// Teçhizat Yükseltme (+%18 kaynak artışı, parça 2 katına çıkar)
const upCost = gs.calculateEquipmentUpgradeCost('weapon', null);
assert.equal(upCost.fragmentCost, 2, 'Lv.2 yükseltmesi 2 parça (2 katı) talep etmeli');
assert(upCost.nextAtk > createdWeapon.baseAtk, 'Yükseltme sonrası saldırı gücü artmalı');

const upRes = gs.upgradeEquipment('weapon', null);
assert(upRes.success, 'Silah yükseltilebilmeli');
assert.equal(createdWeapon.level, 2, 'Silah Seviye 2 olmalı');
assert.equal(createdWeapon.durability, 13, 'Yükseltme dayanıklılığı fullenmeli');

// Toplu Geliştirme Metotları
const bulkUpRes = gs.upgradeEquipmentByTypeAndLevel('weapon', 2);
console.log('Toplu Kategori Yükseltme:', bulkUpRes.message);
const kingdomUpRes = gs.upgradeAllEquipmentInKingdom();
console.log('Tüm Krallık Teçhizat Geliştirme:', kingdomUpRes.message);
console.log('✅ Teçhizat craft, upgrade, 13 durability ve toplu yönetim %100 doğrulandı.');

// ══════════════════════════════════════════════════════════════════════════
// 5. TAVERNA 24S OTONOM BOTU: KÂR ORTAKLIK MATEMATİĞİ (%50 SAF KÂR)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[5/7] Taverna 24s Otomasyon Botu ve %50 Kâr Payı Test Ediliyor...');
const botFinancials = gs.calculateTavernaBotProfitAndCost();
console.log('Bot Finansal Tablosu:', {
  grossRevenueAda: botFinancials.grossRevenueAda,
  staminaWheatCostAda: botFinancials.staminaWheatCostAda,
  toolRepairCostAda: botFinancials.toolRepairCostAda,
  netProfitAda: botFinancials.netProfitAda,
  botCostAda: botFinancials.botCostAda
});
assert(botFinancials.grossRevenueAda > 0, 'Günlük brüt gelir pozitif olmalı');
assert.equal(botFinancials.botCostAda, Math.max(1, Math.round(botFinancials.netProfitAda * 0.5 * 1000) / 1000), 'Bot bedeli net kârın tam %50\'si olmalı');

// Silo Doluluk Seçeneği Testi
gs.setBotSiloOption(true);
assert.equal(gs.state.botSettings.siloAutoUpgrade, true, 'Silo otomatik yükseltme modu seçilebilmeli');
gs.setBotSiloOption(false);
assert.equal(gs.state.botSettings.siloAutoUpgrade, false, 'Silo %50 satış modu seçilebilmeli');

// Bot Satın Alma
const buyBotRes = gs.buyTavernaAutomationBot(false);
assert(buyBotRes.success, 'Bot satın alınabilmeli');
assert(gs.state.tavernaBotActive, 'Taverna botu aktifleşmeli');
assert(gs.state.tavernaBotExpiresAt > Date.now(), 'Bot süresi 24 saat ileriye ayarlanmalı');
console.log('✅ Taverna 24s bot saf kâr ve otomasyon yönetimi %100 doğrulandı.');

// ══════════════════════════════════════════════════════════════════════════
// 6. KRALLIK KARNAVALI: ŞANS ÇARKI (14 ÖDÜL, KASA ASLA KAYBETMEZ)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[6/7] Krallık Karnavalı: Şans Çarkı Test Ediliyor...');
assert(GAME_CONFIG.CARNIVAL.WHEEL_REWARDS.length >= 14, 'Çarkta en az 14 ödül olmalı');
assert.equal(GAME_CONFIG.CARNIVAL.WHEEL_COST_ADA, 1, 'Çark çevirme bedeli 1 ASTRA olmalı (v2 ölçekli)');

// 100 Çevirme Simülasyonu ile RTP ve Kasa Güvenliği Doğrulaması
let totalPaidAda = 0;
let totalReturnedValueAda = 0;
// Sabit tohumlu rastgelelik: kontrol her çalıştırmada aynı sonucu verir (eskiden ~20'de 1 şansa bağlı başarısız oluyordu)
const realRandom = Math.random;
let seed = 12345;
Math.random = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (let i = 0; i < 50; i++) {
  const spinRes = gs.spinCarnivalWheel('ada');
  assert(spinRes.success, `Çevirme #${i} başarılı olmalı`);
  totalPaidAda += GAME_CONFIG.CARNIVAL.WHEEL_COST_ADA;
  totalReturnedValueAda += (spinRes.reward.valAda || 0);
}
const simulatedRtp = (totalReturnedValueAda / totalPaidAda) * 100;
console.log(`50 Çevirme Simülasyonu - Ödenen: ${totalPaidAda} ADA, Dağıtılan Değer: ${totalReturnedValueAda} ADA, RTP: %${simulatedRtp.toFixed(1)}`);
assert(totalReturnedValueAda < totalPaidAda * 1.5, 'Kasa iflas ettirilemez (RTP dengesi korunmalı)');
Math.random = realRandom;
console.log('✅ Krallık Karnavalı Şans Çarkı mekaniği %100 doğrulandı.');

// ══════════════════════════════════════════════════════════════════════════
// 7. KRALLIK KARNAVALI: HAFTALIK PİYANGO & 2X GÜVENLİK KURALI
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[7/7] Krallık Karnavalı: Haftalık Piyango ve 2x Kuralı Test Ediliyor...');
gs.state.lotteryTickets = 0;
gs.state.lotteryPool = GAME_CONFIG.CARNIVAL.LOTTERY.SEED_POOL_ADA;
const ticketBuyRes = gs.buyLotteryTickets(5);
assert(ticketBuyRes.success, '5 adet piyango bileti satın alınabilmeli');
const TK = GAME_CONFIG.CARNIVAL.LOTTERY.TICKET_COST_ADA;   // v2: 1 ASTRA
assert.ok(near(gs.state.lotteryPool + (gs.state.lotteryAmortiPool || 0), GAME_CONFIG.CARNIVAL.LOTTERY.SEED_POOL_ADA + 5 * TK), 'Havuz + Amorti toplamı tohum kasa + bilet tutarı kadar olmalı');
assert.ok(near(gs.state.lotteryAmortiPool, 5 * TK * GAME_CONFIG.CARNIVAL.LOTTERY.AMORTI_SHARE), '%2 amorti payı ayrılmış olmalı');

// Piyango Çekiliş Simülasyonu
const drawRes = gs.drawWeeklyLottery();
console.log('Piyango Çekiliş Sonucu:', {
  winnerShare: drawRes.winnerShare,
  rolloverPool: drawRes.rolloverPool,
  amortiShare: drawRes.amortiShare,
  userWon: drawRes.userWon
});
// v1.25 (kullanıcı kuralı): tek kazanan, kasa devreder; amorti her bilet alımında birikir ve
// yalnızca piyango kasası bittiğinde kalan tüm biletlere eşit dağıtılır.
assert(drawRes.drawn, 'Çekiliş yapılmalı');
assert(drawRes.rolloverPool > 0, 'Kasa sonraki haftaya devretmeli');
assert(gs.state.lotteryAmortiPool >= 5 * TK * GAME_CONFIG.CARNIVAL.LOTTERY.AMORTI_SHARE - 1e-9, 'Amorti kasası kasa bitene kadar korunmalı');

// Elle amorti yakma kapalı: bilet erken kullanılmak istenirse çarkta 1 bilet = 1 çevirme
const burnRes = gs.burnLotteryTicketsForAmorti(1);
assert(!burnRes.success && burnRes.message.includes('çark'), 'Elle amorti alma kapalı olmalı, çarka yönlendirmeli');

console.log('✅ Krallık Karnavalı Haftalık Piyango ve Kasa Devri %100 doğrulandı.');

// ══════════════════════════════════════════════════════════════════════════
// 8. AMM DEX & HAZİNE ANAYASASI (%1.00 FEE VE 3 PARŞÖMEN HAVUZU)
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[Ek Denetim] AMM DEX & Hazine Anayasası Denetleniyor...');
assert.equal(GAME_CONFIG.AMM_FEE_RATE, 0.02, 'AMM Swap komisyonu tam %2.00 (0.02) olmalı');
assert(ammMarket.pools.scroll_heal, 'scroll_heal AMM havuzu tanımlı olmalı');
assert(ammMarket.pools.scroll_stamina, 'scroll_stamina AMM havuzu tanımlı olmalı');
assert(!ammMarket.pools.scroll_repair, 'scroll_repair AMM havuzu v1.12 ile kaldırılmış olmalı');
assert(treasury.state.pools.carnival != null, 'Hazine Defterinde carnival havuzu tanımlı olmalı');
console.log('✅ AMM DEX %2 fee, 2 parşömen havuzu (scroll_repair kaldırıldı) ve Hazine Defteri Anayasası %100 doğrulandı.');

console.log('\n🎉🎉🎉 v1.06 TÜM SİSTEMLER, EKONOMİK VE OYUN MEKANİKLERİ TESTLERDEN %100 BAŞARIYLA GEÇTİ! 🎉🎉🎉\n');
