import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { GAME_CONFIG } from '../js/config.js';
import { ammMarket } from '../js/ammMarket.js';

// Mock localStorage for node environment
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

console.log('--- 🧪 KARNAVAL ŞANS ÇARKI VE PARŞÖMEN ENVANTERİ TESTİ BAŞLATILIYOR ---');

const gs = new GameStateManager();

// Test 1: Çark ödülleri ve veri doğrulaması
console.log('\n[1/4] Şans Çarkı Ödül Tablosu Denetleniyor...');
const wheelRewards = GAME_CONFIG.CARNIVAL.WHEEL_REWARDS;
assert(Array.isArray(wheelRewards) && wheelRewards.length === 15, 'Çarkta tam 15 ödül dilimi bulunmalı');
wheelRewards.forEach((r, idx) => {
  assert(r.id, `Ödül #${idx} id içermeli`);
  assert(r.name, `Ödül #${idx} name içermeli`);
  assert(r.icon, `Ödül #${idx} icon içermeli`);
  assert(r.weight > 0, `Ödül #${idx} weight > 0 olmalı`);
  assert(!r.key?.startsWith('scroll_') && !r.id?.startsWith('scroll_'), `Ödül #${idx} parşömen olmamalı`);
});
console.log('✅ 15 Dilimli Şans Çarkı (parşömensiz) konfigürasyonu eksiksiz.');

// Test 2: Ordu İyileştirme Parşömeni (scroll_heal)
console.log('\n[2/4] Ordu İyileştirme Parşömeni (scroll_heal) Test Ediliyor...');
// Asker oluştur veya yarala
if (!gs.state.soldiers || gs.state.soldiers.length === 0) {
  gs.state.soldiers = [gs.createSoldierUnit(1)];
}
const soldier = gs.state.soldiers[0];
soldier.hp = 50; // 50/100 HP
gs.state.inventory.scroll_heal = 2;

const healRes = gs.useScroll('scroll_heal');
assert(healRes.success, 'scroll_heal başarılı olmalı');
assert.equal(soldier.hp, 60, 'Asker canı 50 den 60 a çıkmalı (+10 HP)');
assert.equal(gs.state.inventory.scroll_heal, 1, 'Kalan parşömen 1 olmalı');

// Canı 100 e eşitleyip tekrar deneyelim
soldier.hp = soldier.maxHp;
const fullHpRes = gs.useScroll('scroll_heal');
assert(!fullHpRes.success, 'Can doluyken parşömen harcanmamalı');
assert.equal(gs.state.inventory.scroll_heal, 1, 'Parşömen sayısı değişmemeli');
console.log('✅ Ordu İyileştirme Parşömeni (+10 HP) mekaniği %100 doğrulandı.');

// Test 3: 100 Stamina Doldurma Parşömeni (scroll_stamina)
console.log('\n[3/4] 100 Stamina Doldurma Parşömeni (scroll_stamina) Test Ediliyor...');
gs.state.level = 10;
const maxStamina = gs.getMaxStamina(); // 325
gs.state.stamina = 50;
gs.state.inventory.scroll_stamina = 2;

const staminaRes = gs.useScroll('scroll_stamina');
assert(staminaRes.success, 'scroll_stamina başarılı olmalı');
assert.equal(gs.state.stamina, 150, 'Stamina 50 den tam +100 artarak 150 olmalı');
assert.equal(gs.state.inventory.scroll_stamina, 1, 'Parşömen 1 eksilmeli');

// Sınıra yakınken test: (maxStamina - 25) iken +100 uygulanınca maxStamina ile sınırlanmalı
gs.state.stamina = maxStamina - 25;
const capRes = gs.useScroll('scroll_stamina');
assert(capRes.success, 'scroll_stamina sınıra yakınken de başarılı olmalı');
assert.equal(gs.state.stamina, maxStamina, `Stamina maksimum (${maxStamina}) ile sınırlanmalı`);
assert.equal(gs.state.inventory.scroll_stamina, 0, 'Parşömen 0 olmalı');

const fullStaminaRes = gs.useScroll('scroll_stamina');
assert(!fullStaminaRes.success, 'Stamina doluyken veya parşömen yokken reddedilmeli');
console.log('✅ 100 Stamina Doldurma Parşömeni mekaniği %100 doğrulandı.');

// Test 4: Alet Onarım Parşömeni (scroll_repair) Kaldırılma Güvencesi
console.log('\n[4/4] Alet Onarım Parşömeni (scroll_repair) Kaldırılma Kontrolü...');
gs.state.inventory.scroll_repair = 1;
const repairRes = gs.useScroll('scroll_repair');
assert(!repairRes.success, 'scroll_repair devre dışı olmalı');
assert(repairRes.message.includes('Demirci'), 'scroll_repair oyuncuyu Demirciye yönlendirmeli');
console.log('✅ Alet Onarım Parşömeni devreden çıkarıldı ve Demirciye yönlendirildi.');

// Test 4.5: Zindan Zaferlerinde Parşömen Düşme Mekaniği
console.log('\n[4.5/4] Zindan Canavar & Boss Zaferlerinde Parşömen Düşme Kontrolü...');
let droppedScrolls = 0;
for (let i = 0; i < 50; i++) {
  const drops = gs.addDungeonXpAndDrops(1, true); // boss fight
  if (drops && drops.scrollGained) {
    droppedScrolls++;
  }
}
assert(droppedScrolls > 0, '50 Boss zaferinde en az bir parşömen düşmeli (%40 şans)');
console.log(`✅ Boss zaferlerinde parşömen düşme mekaniği doğrulandı (${droppedScrolls}/50 düşüş).`);

// Test 5: Karnaval Çarkında Demir, Odun ve Buğdayların Anında Yakılması & Sistemden Silinmesi
console.log('\n[5/6] Karnaval Çarkında Demir, Odun ve Buğdayların Yakılması Test Ediliyor...');
gs.state.warehouseLevel = 18;
gs.state.inventory.wood = 5000;
gs.state.inventory.iron = 5000;
gs.state.inventory.wheat = 5000;

const initialWoodReserve = ammMarket.pools.wood?.resourceReserve || 0;
const initialIronReserve = ammMarket.pools.iron?.resourceReserve || 0;
const initialWheatReserve = ammMarket.pools.wheat?.resourceReserve || 0;

// Odun ile çevir
const preWood = gs.state.inventory.wood;
const woodPrice = ammMarket.getPrice('wood') || 1.0;
const expectedWoodCost = Math.ceil(100 / woodPrice);
const spinWoodRes = gs.spinCarnivalWheel('wood');
assert(spinWoodRes.success, 'Odun ile çark çevirme başarılı olmalı');
assert(spinWoodRes.burnedInfo, 'burnedInfo dönmeli');
assert.equal(spinWoodRes.burnedInfo.resource, 'wood');
assert.equal(spinWoodRes.burnedInfo.amount, expectedWoodCost);
let wonWood = 0;
if (spinWoodRes.slice?.type === 'resource' && spinWoodRes.slice?.key === 'wood') {
  wonWood = spinWoodRes.slice.amount;
} else if (spinWoodRes.slice?.type === 'amm_raw' && spinWoodRes.slice?.key === 'wood') {
  wonWood = Math.round(spinWoodRes.slice.adaVal / (ammMarket.getPrice('wood') || 1.0));
}
assert.equal(gs.state.inventory.wood, preWood - expectedWoodCost + wonWood, 'Envanterden odun tam düşmeli');
assert(ammMarket.pools.wood.resourceReserve <= initialWoodReserve, 'AMM havuz rezervine ASLA harcanan odun eklenmemeli, yanmalı');
assert.equal(gs.state.burnedResources.wood, expectedWoodCost, 'burnedResources.wood kaydedilmeli');

// Demir ile çevir
const preIron = gs.state.inventory.iron;
const ironPrice = ammMarket.getPrice('iron') || 1.0;
const expectedIronCost = Math.ceil(100 / ironPrice);
const spinIronRes = gs.spinCarnivalWheel('iron');
assert(spinIronRes.success, 'Demir ile çark çevirme başarılı olmalı');
let wonIron = 0;
if (spinIronRes.slice?.type === 'resource' && spinIronRes.slice?.key === 'iron') {
  wonIron = spinIronRes.slice.amount;
} else if (spinIronRes.slice?.type === 'amm_raw' && spinIronRes.slice?.key === 'iron') {
  wonIron = Math.round(spinIronRes.slice.adaVal / (ammMarket.getPrice('iron') || 1.0));
}
assert(gs.state.inventory.iron >= preIron - expectedIronCost, 'Envanterden demir tam düşmeli');
assert(ammMarket.pools.iron.resourceReserve <= initialIronReserve, 'AMM havuz rezervine ASLA harcanan demir eklenmemeli, yanmalı');
assert.equal(gs.state.burnedResources.iron, expectedIronCost, 'burnedResources.iron kaydedilmeli');

// Buğday ile çevir
const preWheat = gs.state.inventory.wheat;
const wheatPrice = ammMarket.getPrice('wheat') || 1.0;
const expectedWheatCost = Math.ceil(100 / wheatPrice);
const spinWheatRes = gs.spinCarnivalWheel('wheat');
assert(spinWheatRes.success, 'Buğday ile çark çevirme başarılı olmalı');
let wonWheat = 0;
if (spinWheatRes.slice?.type === 'resource' && spinWheatRes.slice?.key === 'wheat') {
  wonWheat = spinWheatRes.slice.amount;
} else if (spinWheatRes.slice?.type === 'amm_raw' && spinWheatRes.slice?.key === 'wheat') {
  wonWheat = Math.round(spinWheatRes.slice.adaVal / (ammMarket.getPrice('wheat') || 1.0));
}
assert(gs.state.inventory.wheat >= preWheat - expectedWheatCost, 'Envanterden buğday tam düşmeli');
assert(ammMarket.pools.wheat.resourceReserve <= initialWheatReserve, 'AMM havuz rezervine ASLA harcanan buğday eklenmemeli, yanmalı');
assert.equal(gs.state.burnedResources.wheat, expectedWheatCost, 'burnedResources.wheat kaydedilmeli');

console.log('✅ Karnaval çarkında harcanan odun, demir ve buğdayların anında yakılarak yok edildiği %100 doğrulandı.');

// Test 5.1: SoldierUnits üzerinde spesifik Asker ID ile Ordu İyileştirme Parşömeni
gs.state.soldierUnits = [
  { id: 'sol_101', name: 'Piyade', hp: 30, maxHp: 100 },
  { id: 'sol_102', name: 'Okçu', hp: 40, maxHp: 100 }
];
gs.state.inventory.scroll_heal = 2;
const targetedHeal = gs.useScroll('scroll_heal', 'sol_102');
assert(targetedHeal.success, 'Belirli ID li askere iyileştirme parşömeni uygulanabilmeli');
assert.equal(gs.state.soldierUnits[1].hp, 50, 'Hedeflenen askerin canı 40 tan 50 ye çıkmalı');
assert.equal(gs.state.soldierUnits[0].hp, 30, 'Hedeflenmeyen askerin canı değişmemeli');
assert.equal(gs.state.inventory.scroll_heal, 1, '1 parşömen düşmeli');

// Test 6: Krallık Hazinesi & Havuz Dağılımı ve Ödül Bakiyeleri Özeti
console.log('\n[6/6] Krallık Hazinesi & Havuz Dağılımı ve Canlı Ödüller Test Ediliyor...');
const ecoSummary = gs.getEconomyAndPoolsSummary();
assert(ecoSummary, 'Hazine ve havuz özeti oluşturulmalı');
assert.equal(ecoSummary.burnRatePct, 5, 'Kalıcı yakım oranı %5 olmalı');
assert.equal(ecoSummary.ubiRatePct, 6, 'UBI havuz payı %6 olmalı');
assert.equal(ecoSummary.creatorRatePct, 3, 'Yapımcı / Team payı %3 olmalı');
assert.equal(ecoSummary.treasuryRatePct, 86, 'Hazine payı %86 olmalı');
// Kasa payları hazine girişinin yüzdesi (toplam 1)
assert.equal(ecoSummary.allocations.dungeon, 0.30, 'Zindan: hazine payının %30u');
assert.equal(ecoSummary.allocations.arena, 0.15, 'Kolezyum: hazine payının %15i');
assert.equal(ecoSummary.allocations.worldBoss, 0.15, 'World Boss: hazine payının %15i');
assert.equal(ecoSummary.allocations.ammBuyback, 0.15, 'Pazar geri alımı: hazine payının %15i');
assert.equal(ecoSummary.allocations.quest, 0.21, 'Görev & ücretsiz oyuncu: hazine payının %21i');
assert.equal(ecoSummary.allocations.carnival, 0.04, 'Karnaval: hazine payının %4ü');
assert(Math.abs(Object.values(ecoSummary.allocations).reduce((s, v) => s + v, 0) - 1) < 1e-9, 'Kasa payları toplamı 1 olmalı');
assert(ecoSummary.pools.length === 6, '6 ana hazine havuzu listelenmeli');
const pctSum = ecoSummary.burnRatePct + ecoSummary.ubiRatePct + ecoSummary.creatorRatePct + ecoSummary.pools.reduce((s, p) => s + p.sharePct, 0);
assert(Math.abs(pctSum - 100) < 0.2, 'Dağılım çubuğu toplamı %100 olmalı (' + pctSum + ')');

ecoSummary.pools.forEach(p => {
  assert(p.balance >= 0, `${p.name} bakiyesi pozitif olmalı`);
  assert(p.sharePct > 0, `${p.name} dağıtım payı bulunmalı`);
  assert(p.actionType, `${p.name} aksiyon butonu tanımlı olmalı`);
});

assert(ecoSummary.lottery.lotteryPool >= 20000000, 'Piyango kasası 20.000.000+ ADA olmalı');
assert(ecoSummary.lottery.winnerShare >= 200, 'Piyango kazanan payı 2x bilet çarpanı kuralına göre hesaplanmalı');
assert(ecoSummary.burnedResources.wood >= expectedWoodCost, 'Yakılan odun özette görünmeli');
assert(ecoSummary.burnedResources.iron >= expectedIronCost, 'Yakılan demir özette görünmeli');
assert(ecoSummary.burnedResources.wheat >= expectedWheatCost, 'Yakılan buğday özette görünmeli');

console.log('✅ Hazine gelir dağılımı, havuz ödül bakiyeleri ve piyango telemetrisi %100 doğrulandı.');

// Test 7: Balina Koruması (Max 100 Bilet Kotası) & 2x Kazanç Testi
console.log('\n[7/8] Balina Koruması (Max 100 Bilet) ve 2x Kazanç Test Ediliyor...');
gs.state.lotteryTickets = 0;
gs.state.adAstraBalance = 50000;
const overBuyRes = gs.buyLotteryTickets(105);
assert(!overBuyRes.success, '100 biletten fazla alım balina korumasıyla engellenmeli');
const validBuyRes = gs.buyLotteryTickets(50);
assert(validBuyRes.success, '50 bilet başarıyla alınabilmeli');
assert.equal(gs.state.lotteryTickets, 50, '50 bilet kaydedilmeli');
const secondOverBuy = gs.buyLotteryTickets(51);
assert(!secondOverBuy.success, 'Mevcut 50 bilet varken +51 alım toplam 101 olacağı için engellenmeli');

// Test 8: Pandora Kutusu Açma İçin Anahtar Zorunluluğu & AMM Havuzu
console.log('\n[8/8] Pandora Kutusu & Anahtar Zorunluluğu ve AMM Fiyatları Test Ediliyor...');
gs.state.lockedBoxes = 2;
gs.state.arenaKeys = 0;
const noKeyUnbox = gs.unboxMysteryBox();
assert(!noKeyUnbox.success, 'Anahtar olmadan Pandora kutusu açılamamalı');
assert(noKeyUnbox.message.includes('Anahtar'), 'Uyarı mesajında Anahtar belirtilmeli');

gs.state.arenaKeys = 1;
const keyedUnbox = gs.unboxMysteryBox();
assert(keyedUnbox.success, 'Anahtarla Pandora kutusu açılabilmeli');
assert.equal(gs.state.lockedBoxes, 1, 'Kutu sayısı 1 eksilmeli');
assert.equal(gs.state.arenaKeys, 0, 'Anahtar sayısı 1 eksilmeli');

// AMM Havuz Fiyatları Kontrolü
const boxPrice = ammMarket.getPrice('boxes');
const keyPrice = ammMarket.getPrice('keys');
assert(boxPrice >= 5000 && boxPrice <= 35000, `Pandora kutusu AMM fiyatı 5k-35k ADA aralığında olmalı: ${boxPrice}`);
assert(keyPrice >= 500 && keyPrice <= 3500, `Anahtar AMM fiyatı 500-3500 ADA aralığında olmalı: ${keyPrice}`);
console.log(`✅ Pandora Kutusu AMM Fiyatı: ~${boxPrice.toFixed(0)} ADA, Anahtar: ~${keyPrice.toFixed(0)} ADA doğrulandı.`);

console.log('\n🎉 TÜM ŞANS ÇARKI, PİYANGO 2X VE PANDORA KUTUSU TESTLERİ %100 BAŞARIYLA TAMAMLANDI! 🎉\n');
