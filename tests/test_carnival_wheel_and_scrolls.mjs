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

// Test 5: Karnaval Çarkı hammaddeyle (kullanıcı kararı 4 Ekim 2026): ödenen hammaddenin YARISI yakılır,
// YARISI pazarda satılır ve gelen ASTRA Karnaval kasasına girer.
console.log('\n[5/6] Karnaval Çarkında hammadde ödemesi: yarısı yakılır, yarısı satılıp Karnaval kasasına...');
gs.state.warehouseLevel = 18;
for (const res of ['wood', 'iron', 'wheat']) {
  gs.state.inventory[res] = 5000;
  const price = ammMarket.getPrice(res) || 1.0;
  const cost = Math.ceil(gs.getWheelCostAda() / price);   // v2: çark 1 ASTRA
  const burnedBefore = (gs.state.burnedResources && gs.state.burnedResources[res]) || 0;
  const r = gs.spinCarnivalWheel(res);
  assert(r.success, res + ' ile çark çevirme başarılı olmalı');
  const bi = r.burnedInfo;
  assert(bi && bi.resource === res, 'burnedInfo dönmeli');
  assert.equal(bi.amount + bi.soldQty, cost, 'Yakılan + satılan = ödenen hammadde');
  assert.equal(bi.soldQty, Math.floor(cost / 2), 'Yarısı pazarda satıldı');
  assert(bi.carnivalIn > 0, 'Satıştan gelen ASTRA Karnaval kasasına girdi');
  assert.equal(gs.state.burnedResources[res] - burnedBefore, bi.amount, 'Kalan yarı yakıldı');
  let won = 0;
  if (r.slice?.type === 'amm_raw' && r.slice?.key === res) won = Math.round(r.slice.adaVal / (ammMarket.getPrice(res) || 1.0));
  assert(gs.state.inventory[res] >= 5000 - cost, 'Envanterden ödeme düştü');
  if (!won) assert.equal(gs.state.inventory[res], 5000 - cost, 'Envanterden tam ödeme düştü');
}
console.log('✅ Hammaddeyle çark: yarısı yakıldı, yarısı satılıp Karnaval kasasına girdi.');

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
// v2 (R3): 8 kasa — zindan 27, kolezyum 14, boss 12, geri alım 15, görev 18, karnaval 4, Fatih 5, Konsey 5
assert.equal(ecoSummary.allocations.dungeon, 0.27, 'Zindan: hazine payının %27si');
assert.equal(ecoSummary.allocations.arena, 0.14, 'Kolezyum: hazine payının %14ü');
assert.equal(ecoSummary.allocations.worldBoss, 0.12, 'World Boss: hazine payının %12si');
assert.equal(ecoSummary.allocations.ammBuyback, 0.15, 'Pazar geri alımı: hazine payının %15i');
assert.equal(ecoSummary.allocations.quest, 0.18, 'Görev & ücretsiz oyuncu: hazine payının %18i');
assert.equal(ecoSummary.allocations.carnival, 0.04, 'Karnaval: hazine payının %4ü');
assert.equal(ecoSummary.allocations.fatih, 0.05, 'Fatih Ödülü: hazine payının %5i');
assert.equal(ecoSummary.allocations.konsey, 0.05, 'Sirius Konseyi: hazine payının %5i');
assert(Math.abs(Object.values(ecoSummary.allocations).reduce((s, v) => s + v, 0) - 1) < 1e-9, 'Kasa payları toplamı 1 olmalı');
assert(ecoSummary.pools.length === Object.keys(GAME_CONFIG.TREASURY_SEED).length, 'Bütün hazine kasaları listelenmeli (Universe rezervi dahil)');
const pctSum = ecoSummary.burnRatePct + ecoSummary.ubiRatePct + ecoSummary.creatorRatePct + ecoSummary.pools.reduce((s, p) => s + p.sharePct, 0);
assert(Math.abs(pctSum - 100) < 0.2, 'Dağılım çubuğu toplamı %100 olmalı (' + pctSum + ')');

ecoSummary.pools.forEach(p => {
  assert(p.balance >= 0, `${p.name} bakiyesi pozitif olmalı`);
  assert(p.sharePct > 0 || p.locked, `${p.name} dağıtım payı bulunmalı (kilitli Universe rezervi hariç)`);
  assert(p.actionType, `${p.name} aksiyon butonu tanımlı olmalı`);
});

assert(ecoSummary.lottery.lotteryPool >= GAME_CONFIG.CARNIVAL.LOTTERY.SEED_POOL_ADA, 'Piyango kasası tohum tutarının altında olmamalı');
assert(ecoSummary.lottery.winnerShare >= 2 * gs.getLotteryRules().ticketPrice, 'Piyango kazanan payı 2x bilet çarpanı kuralına göre hesaplanmalı');
assert(ecoSummary.burnedResources.wood > 0, 'Yakılan odun özette görünmeli');
assert(ecoSummary.burnedResources.iron > 0, 'Yakılan demir özette görünmeli');
assert(ecoSummary.burnedResources.wheat > 0, 'Yakılan buğday özette görünmeli');

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
const C = GAME_CONFIG.AMM_CORRIDORS;
assert(boxPrice >= C.boxes.minPriceAda && boxPrice <= C.boxes.maxPriceAda, `Pandora kutusu pazar fiyatı koridor içinde olmalı: ${boxPrice}`);
assert(keyPrice >= C.keys.minPriceAda && keyPrice <= C.keys.maxPriceAda, `Anahtar pazar fiyatı koridor içinde olmalı: ${keyPrice}`);
console.log(`✅ Pandora Kutusu AMM Fiyatı: ~${boxPrice.toFixed(0)} ASTRA, Anahtar: ~${keyPrice.toFixed(0)} ASTRA doğrulandı.`);

console.log('\n🎉 TÜM ŞANS ÇARKI, PİYANGO 2X VE PANDORA KUTUSU TESTLERİ %100 BAŞARIYLA TAMAMLANDI! 🎉\n');
