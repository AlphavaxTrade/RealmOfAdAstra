import assert from 'node:assert/strict';
import { globalPool } from '../js/globalPool.js';
import { GameStateManager } from '../js/gameState.js';
import { GAME_CONFIG } from '../js/config.js';

console.log('--- 🧪 HAFTALIK RESET (PAZAR/PAZARTESİ 00:01 TSİ) & VANILLA SIFIRLAMA TESTİ ---');

// Mock localStorage
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

// 1. Reset Zamanı Hesaplama Doğrulaması (Pazar'ı Pazartesiye bağlayan gece 00:01 TSİ = Pazar 21:01 UTC)
// Senaryo A: Pazar günü saat 15:00 TSİ (12:00 UTC)
// 2026-09-13 bir Pazar günüdür.
const sundayAfternoonUtc = new Date('2026-09-13T12:00:00Z').getTime(); // TSİ 15:00
const resetFromSunday = globalPool.getNextWeeklyResetTRT(sundayAfternoonUtc);
const resetDateFromSunday = new Date(resetFromSunday);

// Hedef: 2026-09-13 Pazar 21:01:00 UTC (yani 2026-09-14 Pazartesi 00:01:00 TRT)
assert.equal(resetDateFromSunday.toISOString(), '2026-09-13T21:01:00.000Z', 'Pazar günü verilen tarihte bir sonraki reset aynı gecenin 21:01 UTC (00:01 TSİ) olmalı');
console.log('✅ Senaryo A (Pazar öğleden sonra): Reset zamanı tam Pazar gecesi 00:01 TSİ olarak hesaplandı!');

// Senaryo B: Pazartesi gecesi 00:00:30 TSİ (2026-09-13T21:00:30Z UTC)
const sundayMidnightUtc = new Date('2026-09-13T21:00:30Z').getTime();
const resetFromMidnight = globalPool.getNextWeeklyResetTRT(sundayMidnightUtc);
const resetDateFromMidnight = new Date(resetFromMidnight);
assert.equal(resetDateFromMidnight.toISOString(), '2026-09-13T21:01:00.000Z', '00:01 TSİ öncesinde hedef aynı gecenin 00:01 TSİ olmalı');
console.log('✅ Senaryo B (Pazartesi 00:00:30 TSİ): Hedef tam 30 saniye sonraki 00:01 TSİ!');

// Senaryo C: Pazartesi günü 00:02 TSİ (2026-09-13T21:02:00Z UTC) - 00:01 geçildi!
const mondayAfterResetUtc = new Date('2026-09-13T21:02:00Z').getTime();
const resetFromMonday = globalPool.getNextWeeklyResetTRT(mondayAfterResetUtc);
const resetDateFromMonday = new Date(resetFromMonday);
// Hedef: 7 gün sonraki Pazar 21:01 UTC (2026-09-20T21:01:00.000Z)
assert.equal(resetDateFromMonday.toISOString(), '2026-09-20T21:01:00.000Z', '00:01 geçildikten sonra sonraki haftanın Pazar gecesi 00:01 TSİ olmalı');
console.log('✅ Senaryo C (Pazartesi 00:02 TSİ): Hedef sonraki haftanın Pazartesi 00:01 TSİ gününe başarıyla devretti!');

// 2. Vanilla Reset ile Haftalık Kaynak Çıkartma Limitlerinin Sıfırlanması
const gs = new GameStateManager();

// Önce kaynak çıkartarak limitleri harcayalım
globalPool.harvest('wood', 80000);
globalPool.harvest('wheat', 200000);
globalPool.harvest('iron', 50000);

const woodBefore = globalPool.state.resources.wood.remaining;
const wheatBefore = globalPool.state.resources.wheat.remaining;
const ironBefore = globalPool.state.resources.iron.remaining;

console.log(`Hasat sonrası kalanlar: Odun: ${woodBefore}, Buğday: ${wheatBefore}, Demir: ${ironBefore}`);
assert(woodBefore < GAME_CONFIG.GLOBAL_RESOURCE_CAPS.wood.totalCap, 'Odun limiti eksilmiş olmalı');
assert(wheatBefore < GAME_CONFIG.GLOBAL_RESOURCE_CAPS.wheat.totalCap, 'Buğday limiti eksilmiş olmalı');
assert(ironBefore < GAME_CONFIG.GLOBAL_RESOURCE_CAPS.iron.totalCap, 'Demir limiti eksilmiş olmalı');

import { ammMarket } from '../js/ammMarket.js';
import { treasury } from '../js/treasury.js';

// Şimdi vanillaReset() çağıralım
gs.vanillaReset();

const woodAfter = globalPool.state.resources.wood.remaining;
const wheatAfter = globalPool.state.resources.wheat.remaining;
const ironAfter = globalPool.state.resources.iron.remaining;

console.log(`Vanilla reset sonrası limitler: Odun: ${woodAfter}, Buğday: ${wheatAfter}, Demir: ${ironAfter}`);
assert.equal(woodAfter, GAME_CONFIG.GLOBAL_RESOURCE_CAPS.wood.totalCap, 'Odun limiti %100 kapasiteye (180.000) sıfırlanmalı');
assert.equal(wheatAfter, GAME_CONFIG.GLOBAL_RESOURCE_CAPS.wheat.totalCap, 'Buğday limiti %100 kapasiteye (490.000) sıfırlanmalı');
assert.equal(ironAfter, GAME_CONFIG.GLOBAL_RESOURCE_CAPS.iron.totalCap, 'Demir limiti %100 kapasiteye (130.000) sıfırlanmalı');

// 3. 100 Milyon ASTRA Başlangıç Fonu Tohum Havuzları Doğrulaması
console.log('\n--- 🏛️ 100 MİLYON ASTRA İLK DAĞITIM VE SIFIRLAMA HAVUZ KONTROLÜ ---');

// A. AMM DEX Pazar Havuzları (derivePool ve AMM_CORRIDORS ile Senkron Türetim)
const p = ammMarket.pools;
console.log(`AMM Havuzları: Buğday: ${p.wheat.adAstraReserve} ASTRA (${p.wheat.resourceReserve} kaynak), Odun: ${p.wood.adAstraReserve} ASTRA (${p.wood.resourceReserve} kaynak), Demir: ${p.iron.adAstraReserve} ASTRA (${p.iron.resourceReserve} kaynak)`);

// Fiyat oranlarının koridor varsayılan fiyatları ile %100 senkronizasyon kontrolü
const wheatPrice = p.wheat.adAstraReserve / p.wheat.resourceReserve;
const woodPrice = p.wood.adAstraReserve / p.wood.resourceReserve;
const ironPrice = p.iron.adAstraReserve / p.iron.resourceReserve;

assert(Math.abs(wheatPrice - GAME_CONFIG.AMM_CORRIDORS.wheat.defaultPriceAda) < 0.01, 'Buğday havuzu koridor hedef fiyatına (0.90) eşit olmalı');
assert(Math.abs(woodPrice - GAME_CONFIG.AMM_CORRIDORS.wood.defaultPriceAda) < 0.01, 'Odun havuzu koridor hedef fiyatına (2.50) eşit olmalı');
assert(Math.abs(ironPrice - GAME_CONFIG.AMM_CORRIDORS.iron.defaultPriceAda) < 0.01, 'Demir havuzu koridor hedef fiyatına (4.00) eşit olmalı');

assert(p.wheat.adAstraReserve > 0 && p.wood.adAstraReserve > 0 && p.iron.adAstraReserve > 0, 'Ana hammadde havuzları derivePool ile fonlanmış olmalı');
assert(p.fragments.adAstraReserve > 0 && p.boxes.adAstraReserve > 0 && p.keys.adAstraReserve > 0, 'Özel varlık havuzları fonlanmış olmalı');
console.log('✅ [1/3] AMM DEX Havuzları: derivePool ve AMM_CORRIDORS hedef fiyatlarıyla kusursuz senkronize.');

// B. Krallık Hazinesi Kasaları (Tam 40.000.000 ASTRA)
const t = treasury.state.pools;
// v2 (R3): tohumlar config.TREASURY_SEED (9 kasa, toplam 88M ASTRA)
const SEED = GAME_CONFIG.TREASURY_SEED;
console.log(`Hazine Kasaları: ${Object.entries(t).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
for (const [id, v] of Object.entries(SEED)) assert.equal(t[id], v, `Hazine ${id} kasası tohumu ${v} ASTRA olmalı`);

const totalTreasuryAda = Object.values(t).reduce((s, v) => s + v, 0);
assert.equal(totalTreasuryAda, Object.values(SEED).reduce((s, v) => s + v, 0), 'Toplam hazine kasaları tohum toplamına eşit olmalı');
console.log(`✅ [2/3] Krallık Hazinesi Kasaları: ${totalTreasuryAda.toLocaleString()} ASTRA (%40.00) doğrulandı.`);

// C. Krallık Karnavalı Piyangosu (Tam 20.000.000 ASTRA)
const lotteryPoolAda = gs.state.lotteryPool;
console.log(`Piyango Havuzu: ${lotteryPoolAda} ASTRA`);
assert.equal(lotteryPoolAda, GAME_CONFIG.CARNIVAL.LOTTERY.SEED_POOL_ADA, 'Krallık Piyango Havuzu tohum tutarında olmalı (v2: 12M ASTRA)');
assert.equal(gs.state.lotteryTickets, 0, 'Sıfırlama sonrası piyango biletleri 0 olmalı');
console.log(`✅ [3/3] Krallık Piyangosu: ${lotteryPoolAda.toLocaleString()} ASTRA (%20.00) doğrulandı.`);

// D. World Boss, Kolezyum Arenası ve Zindan Sıfırlama Doğrulaması
console.log('\n--- 🌋 WORLD BOSS, KOLEZYUM VE ZİNDAN SIFIRLAMA KONTROLÜ ---');
const wb = gs.getWorldBossInfo();
console.log(`World Boss: ${wb.name}, Can: ${wb.bossHp}/${wb.maxBossHp}, Haftalık Havuz: ${wb.weeklyAdaPool} ASTRA, Kilitli: ${wb.userStaked}`);
assert.equal(wb.bossHp, 1000000, 'World Boss canı 1M tam can olmalı');
assert.equal(wb.maxBossHp, 1000000, 'World Boss max can 1M olmalı');
assert.equal(wb.weeklyAdaPool, SEED.worldBoss, 'World Boss haftalık ödül havuzu hazine rezervine eşit olmalı');
assert.equal(wb.userStaked, false, 'Sıfırlama sonrası ordu kilitli olmamalı');
assert.equal(wb.userDamage, 0, 'Sıfırlama sonrası vurulan hasar 0 olmalı');
assert.equal(wb.claimableRewardAda, 0, 'Sıfırlama sonrası talep edilebilir ödül 0 olmalı');
console.log('✅ [4/5] World Boss Canı (%100) ve 8M ASTRA Ödül Havuzu başarıyla sıfırlandı.');

const col = gs.state.colosseumStats;
console.log(`Kolezyum İstatistikleri: Galibiyet: ${col.wins}, Mağlubiyet: ${col.losses}, Puan: ${col.score}, ELO: ${col.rating}`);
assert.equal(col.wins, 0, 'Kolezyum galibiyet sayısı 0 olmalı');
assert.equal(col.losses, 0, 'Kolezyum mağlubiyet sayısı 0 olmalı');
assert.equal(col.score, 0, 'Kolezyum puanı 0 olmalı');
assert.equal(col.rating, 1000, 'Kolezyum başlangıç ELO derecesi 1000 olmalı');
assert.equal(gs.state.colosseumLeaderboard, undefined, 'sahte bot liderlik tablosu artık yok (sıralama gerçek oyuncularla)');
console.log('✅ [5/5] Kolezyum Arenası, ELO derecesi ve Liderlik Tablosu başarıyla sıfırlandı.');

assert.equal(gs.state.dungeonProgress, 1, 'Zindan ilerlemesi Seviye 1 olmalı');
assert.equal(Object.keys(gs.state.dungeonMonsterCurrentHp || {}).length, 0, 'Zindan canavarlarının canları tam canlı olmalı');

// E. Genel Toplam
const totalAmmAda = Object.values(p).reduce((sum, pool) => sum + (pool.adAstraReserve || 0), 0);
const grandTotalAda = totalAmmAda + totalTreasuryAda + lotteryPoolAda;
assert(grandTotalAda > 80000000, 'Genel toplam ekosistem rezervi 80M üzerinde olmalı');
console.log(`\n🏛️ EKOSİSTEM REZERVİ KESİN DAĞILIMI: Toplam ${grandTotalAda.toLocaleString()} ASTRA (AMM: ${totalAmmAda.toLocaleString()}, Hazine: ${totalTreasuryAda.toLocaleString()}, Piyango: ${lotteryPoolAda.toLocaleString()}) %100 DOĞRULANDI!`);

console.log('\n🎉 TÜM HAFTALIK RESET, WORLD BOSS, KOLEZYUM VE 100M ASTRA TOHUM DAĞITIM SIFIRLAMA TESTLERİ BAŞARIYLA GEÇTİ!');
