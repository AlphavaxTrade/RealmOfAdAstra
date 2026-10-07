import assert from 'node:assert/strict';
import { GameStateManager } from '../js/gameState.js';
import { GAME_CONFIG } from '../js/config.js';
import { ammMarket } from '../js/ammMarket.js';
import { treasury } from '../js/treasury.js';

// Mock localStorage for node environment
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

console.log('--- 🧪 KARNAVAL HAZİNE BUYBACK & 3 AMORTİ BİLETİ TESTİ BAŞLATILIYOR ---');

const gs = new GameStateManager();
treasury.state.pools.carnival = 5000000; // 5 Milyon ADA Karnaval Kasası

// Test 1: Config Kontrolü (3 Adet = 1 Çevirme)
console.log('\n[1/5] Config Amorti Bilet Tanımı Denetleniyor...');
const shardReward = GAME_CONFIG.CARNIVAL.WHEEL_REWARDS.find(r => r.type === 'ticket_shard');
assert(shardReward, 'ticket_shard ödülü bulunmalı');
assert(shardReward.name.includes('3 Adet = 1 Çevirme'), 'Ödül adında 3 Adet = 1 Çevirme belirtilmeli');
console.log('✅ Config amorti bilet tanımı 3 Adet = 1 Çevirme olarak doğrulandı.');

// Test 2: 3 Amorti Bilet Parçası Döngüsü
console.log('\n[2/5] 3 Adet Amorti Bilet Parçası ile 1 Çevirme Kazanımı Test Ediliyor...');
gs.state.wheelTicketShards = 0;
gs.state.lotteryTickets = 0;

// 1. Parça
const mockShardReward = { id: 'wheel_ticket_shard', name: 'Amorti Çark Bileti (3 Adet = 1 Çevirme)', icon: '🎟️', type: 'ticket_shard', amount: 1 };
const origRewards = GAME_CONFIG.CARNIVAL.WHEEL_REWARDS;

// Çarkı zorla ticket_shard verecek şekilde mocklayıp test edelim
GAME_CONFIG.CARNIVAL.WHEEL_REWARDS = [mockShardReward];
gs.state.adAstraBalance = 1000;

const spin1 = gs.spinCarnivalWheel('ada');
assert(spin1.success, 'Çark çevirme başarılı olmalı');
assert.equal(gs.state.wheelTicketShards, 1, '1. parçada bilet parçası 1 olmalı');
assert.equal(gs.state.lotteryTickets, 0, '1. parçada henüz bilet verilmemeli');

const spin2 = gs.spinCarnivalWheel('ada');
assert(spin2.success, 'Çark çevirme başarılı olmalı');
assert.equal(gs.state.wheelTicketShards, 2, '2. parçada bilet parçası 2 olmalı');
assert.equal(gs.state.lotteryTickets, 0, '2. parçada henüz bilet verilmemeli');

const spin3 = gs.spinCarnivalWheel('ada');
assert(spin3.success, 'Çark çevirme başarılı olmalı');
assert.equal(gs.state.wheelTicketShards, 0, '3. parçada parçalar sıfırlanmalı (-3)');
assert.equal(gs.state.lotteryTickets, 1, '3. parçada tam +1 Piyango/Çark Bileti kazanılmalı');
assert(spin3.rewardSummaryText.includes('+1 Çark Çevirme / Piyango Bileti'), 'Özet metninde bilet kazanımı belirtilmeli');
console.log('✅ 3 Parça = 1 Çark/Piyango Bileti tam olarak doğrulandı.');

// Test 3: ADA Ödülü - Karnaval Hazine Kasasından Karşılanması
console.log('\n[3/5] ADA Ödüllerinin Karnaval Hazine Kasasından Karşılanması Test Ediliyor...');
const preCarnivalAda = treasury.state.pools.carnival;
const preUserAda = gs.state.adAstraBalance;
const mockAdaReward = { id: 'ada_200', name: '200 $ADASTRA Nakit Ödül', icon: '🟣', type: 'ada', amount: 200, valAda: 200 };
GAME_CONFIG.CARNIVAL.WHEEL_REWARDS = [mockAdaReward];

const spinAda = gs.spinCarnivalWheel('ada');
assert(spinAda.success, 'ADA ödüllü çark başarılı olmalı');
// 100 ADA çevirme ücretinden Karnaval hazinesine %10 pay (+10 ADA) girer, 200 ADA ödül çıkar: net -190 ADA (veya -200 payout)
assert.equal(treasury.state.outflow.carnival >= 200, true, 'Karnaval kasasından en az 200 ADA çıkış (outflow) kaydedilmeli');
// Kullanıcı 100 ödedi, 200 kazandı -> net +100
assert.equal(gs.state.adAstraBalance, preUserAda - gs.getWheelCostAda() + 200, 'Kullanıcıya hazineden 200 ASTRA aktarılmalı (çevirme bedeli düşülür)');
assert(spinAda.rewardSummaryText.includes('Karnaval Hazinesinden Karşılandı'), 'Açıklamada hazineden karşılandığı belirtilmeli');
console.log('✅ ADA ödülü havadan basılmadı, doğrudan Karnaval Hazine Kasasından ödendi.');

// Test 4: Hammadde Ödülü - AMM DEX Buyback ve Teslimat
console.log('\n[4/5] Hammadde Ödüllerinin AMM DEX Buyback Mekanizması Test Ediliyor...');
const preOutflowCarnival = treasury.state.outflow?.carnival || 0;
const preAmmWoodAda = ammMarket.pools.wood.adAstraReserve;
const preAmmWoodRes = ammMarket.pools.wood.resourceReserve;
const preAmmWoodPrice = ammMarket.getPrice('wood');
const preUserWood = gs.state.inventory.wood || 0;

// v2 ölçeği: 5 ASTRA ≈ 200 odun (Lv.1 silo 324 odun alır; taşan kısım pazara geri satılırdı)
const mockWoodReward = { id: 'raw_5_wood', name: '5 ASTRA Değerinde Odun', icon: '🌲', type: 'amm_raw', key: 'wood', adaVal: 5, valAda: 5 };
GAME_CONFIG.CARNIVAL.WHEEL_REWARDS = [mockWoodReward];

const spinWood = gs.spinCarnivalWheel('ada');
assert(spinWood.success, 'Hammadde ödülü başarılı olmalı');
assert.ok(spinWood.buybackInfo, 'buybackInfo nesnesi üretilmeli');
assert.equal(treasury.state.outflow.carnival, preOutflowCarnival + spinWood.buybackInfo.adaSpent, 'Karnaval kasasından buyback tutarı outflow kaydedilmeli');
// v1.25: %2 hammadde yakımı gerçek — havuzdan ödül miktarı + %2'si çıkar (yakılan kısım kimseye gitmez)
assert.ok(Math.abs(ammMarket.pools.wood.resourceReserve - (preAmmWoodRes - spinWood.buybackInfo.amount * 1.02)) < 1e-3, 'AMM DEX havuzundan fiziki hammadde (+%2 yakım) satın alınmalı');
assert.equal(gs.state.inventory.wood, preUserWood + spinWood.buybackInfo.amount, 'Satın alınan odun kullanıcı envanterine teslim edilmeli');
assert.ok(spinWood.buybackInfo.newPrice > preAmmWoodPrice, `Odun market fiyatı artmalı! Eski: ${preAmmWoodPrice}, Yeni: ${spinWood.buybackInfo.newPrice}`);
assert.ok(spinWood.buybackInfo.priceDelta > 0, 'Fiyat artışı pozitif olmalı');
assert(spinWood.rewardSummaryText.includes('Karnaval AMM Buyback'), 'Açıklamada Karnaval AMM Buyback belirtilmeli');
console.log(`✅ Hammadde havadan basılmadı; Karnaval Hazinesi bütçesiyle AMM pazarından fiziki buyback yapıldı! Odun Fiyatı: ${preAmmWoodPrice.toFixed(4)} -> ${spinWood.buybackInfo.newPrice.toFixed(4)} ADA (+%${spinWood.buybackInfo.priceDeltaPct.toFixed(2)})`);

// Test 5: Teçhizat Parçaları & Pandora Kutu Anahtarları Buyback
console.log('\n[5/5] Teçhizat Parçaları ve Kutu Anahtarları Buyback Test Ediliyor...');
const preOutflowKeys = treasury.state.outflow?.carnival || 0;
const preUserKeys = gs.state.arenaKeys || 0;
const preKeyPrice = ammMarket.getPrice('keys') || 1000.0;
const mockKeyReward = { id: 'box_key', name: '1 Pandora Kutusu Anahtarı', icon: '🔑', type: 'key', amount: 1, valAda: 1000 };
GAME_CONFIG.CARNIVAL.WHEEL_REWARDS = [mockKeyReward];

const spinKey = gs.spinCarnivalWheel('ada');
assert(spinKey.success, 'Anahtar ödülü başarılı olmalı');
assert.ok(spinKey.buybackInfo, 'buybackInfo nesnesi üretilmeli');
assert.equal(treasury.state.outflow.carnival, preOutflowKeys + spinKey.buybackInfo.adaSpent, 'Karnaval kasasından anahtar bedeli outflow kaydedilmeli');
assert.equal(gs.state.arenaKeys, preUserKeys + 1, 'Kullanıcıya 1 Pandora Kutusu Anahtarı teslim edilmeli');
assert.ok(spinKey.buybackInfo.newPrice > preKeyPrice, `Anahtar market fiyatı artmalı! Eski: ${preKeyPrice}, Yeni: ${spinKey.buybackInfo.newPrice}`);
assert(spinKey.rewardSummaryText.includes('Karnaval AMM Buyback'), 'Açıklamada buyback yapıldığı belirtilmeli');
console.log(`✅ Anahtar fiziki buyback ile fiyata yukarı yönlü etki etti: ${preKeyPrice.toFixed(1)} -> ${spinKey.buybackInfo.newPrice.toFixed(1)} ADA`);

// Teçhizat Parçası Testi
const preOutflowFrag = treasury.state.outflow?.carnival || 0;
const preUserFrag = gs.state.inventory.fragments || 0;
const preFragPrice = ammMarket.getPrice('fragments') || 45.0;
const mockFragReward = { id: 'frag_10', name: '10 Teçhizat Parçası', icon: '🧩', type: 'resource', key: 'fragments', amount: 10, valAda: 450 };
GAME_CONFIG.CARNIVAL.WHEEL_REWARDS = [mockFragReward];

const spinFrag = gs.spinCarnivalWheel('ada');
assert(spinFrag.success, 'Teçhizat parçası ödülü başarılı olmalı');
assert.ok(spinFrag.buybackInfo, 'buybackInfo nesnesi üretilmeli');
assert.equal(treasury.state.outflow.carnival, preOutflowFrag + spinFrag.buybackInfo.adaSpent, 'Karnaval kasasından teçhizat parçası bedeli outflow kaydedilmeli');
assert.equal(gs.state.inventory.fragments, preUserFrag + 10, 'Kullanıcıya 10 Teçhizat Parçası teslim edilmeli');
assert.ok(spinFrag.buybackInfo.newPrice > preFragPrice, `Teçhizat parçası fiyatı artmalı! Eski: ${preFragPrice}, Yeni: ${spinFrag.buybackInfo.newPrice}`);
assert(spinFrag.rewardSummaryText.includes('Karnaval AMM Buyback'), 'Açıklamada buyback yapıldığı belirtilmeli');
console.log(`✅ Parça fiziki buyback ile fiyata yukarı yönlü etki etti: ${preFragPrice.toFixed(2)} -> ${spinFrag.buybackInfo.newPrice.toFixed(2)} ADA`);

// Restore original rewards
GAME_CONFIG.CARNIVAL.WHEEL_REWARDS = origRewards;

// Test 6: AMM / DEX İşlemlerinde %2 Hammadde Yakımı ve Sayaç Doğrulaması
console.log('\n[6/6] AMM / DEX İşlemlerinde %2 Hammadde Yakımı Test Ediliyor...');
const preAmmBurned = ammMarket.getBurnedResources();
// 1000 Odun satışı yapalım -> %2 fee = 20 odun yakılmalı
const sellRes = ammMarket.executeSell('wood', 1000);
assert(sellRes.success, 'Odun satışı başarılı olmalı');
assert.equal(sellRes.resourceBurnFee, 20, '1000 Odun satışından tam 20 Odun yakılmalı');

const postAmmBurned = ammMarket.getBurnedResources();
assert.equal(Math.round(postAmmBurned.wood), Math.round(preAmmBurned.wood + 20), 'AMM yakılan odun sayacı 20 artmalı');

// 500 Demir alımı yapalım -> %2 fee = 10 demir yakılmalı
const buyRes = ammMarket.executeBuyAmount('iron', 500);
assert(buyRes.success, 'Demir alımı başarılı olmalı');
assert.equal(buyRes.resourceBurnFee, 10, '500 Demir alımından tam 10 Demir yakılmalı');

const postBuyAmmBurned = ammMarket.getBurnedResources();
assert.equal(Math.round(postBuyAmmBurned.iron), Math.round(preAmmBurned.iron + 10), 'AMM yakılan demir sayacı 10 artmalı');

// getEconomyAndPoolsSummary çıktısı kontrolü
const eco = gs.getEconomyAndPoolsSummary();
assert(eco.ammBurnedResources, 'Özette ammBurnedResources bulunmalı');
assert.equal(Math.round(eco.ammBurnedResources.wood), Math.round(postBuyAmmBurned.wood), 'Özetteki yakılan odun AMM ile eşleşmeli');
assert.equal(Math.round(eco.ammBurnedResources.iron), Math.round(postBuyAmmBurned.iron), 'Özetteki yakılan demir AMM ile eşleşmeli');
// Test 7: Piyango kazancı yalnızca gerçekten kazanan oyuncuya ödenir (v1.25)
// Eski sürüm kazanma şartı aramıyordu: bileti olan herkes "2 katını çek" ile bilet bedelinin 2 katını
// alabiliyordu (sonsuz para açığı). Artık kazanç haftalık çekilişte ayrılır, sonra çekilir.
console.log('\n[7/7] Piyango: Kazanmadan çekim reddi, kazanınca 2 katı ödeme Test Ediliyor...');
gs.state.lotteryTickets = 10;
gs.state.lotteryPool = 20000000;
gs.state.lotteryPendingPayout = 0;
const userPreAda = gs.state.adAstraBalance;

// Kazanmadan çekim denemesi reddedilmeli
const noWinRes = gs.claimWinnerLotteryPayout();
assert(!noWinRes.success, 'Çekiliş kazanılmadan 2 katı ödeme yapılmamalı');
assert.equal(gs.state.adAstraBalance, userPreAda, 'Kazanmadan bakiye değişmemeli');
assert.equal(gs.state.lotteryTickets, 10, 'Biletler yanmamalı');

// Çekilişi kazanan senaryo (şans %100'e sabitlenir)
const prize = 10 * gs.getLotteryRules().ticketPrice * 2;   // v2: bilet 1 ASTRA → 10 bilet için 2 katı = 20 ASTRA
const origRandom = Math.random;
Math.random = () => 0;
const drawRes = gs.drawWeeklyLottery();
Math.random = origRandom;
assert(drawRes.userWon, 'Sabitlenmiş şansla çekiliş kazanılmalı');
assert.equal(drawRes.wonAmount, prize, `10 bilet için 2 katı = ${prize} ASTRA ayrılmalı`);
assert.equal(gs.state.lotteryPendingPayout, prize, 'Kazanç çekilmeyi beklemeli');
assert.equal(gs.state.lotteryTickets, 0, 'Kazanan biletler kullanılmış olmalı');
assert.equal(gs.state.adAstraBalance, userPreAda, 'Kazanç çekilene kadar bakiyeye eklenmemeli');

const winnerRes = gs.claimWinnerLotteryPayout();
assert(winnerRes.success, 'Kazanç çekilebilmeli');
assert.equal(winnerRes.payoutAda, prize, `${prize} ASTRA ödenmeli`);
assert.equal(gs.state.adAstraBalance, userPreAda + prize, `Kullanıcıya +${prize} ASTRA aktarılmalı`);
assert.equal(gs.state.lotteryPendingPayout, 0, 'Bekleyen kazanç sıfırlanmalı');

// Aynı kazanç ikinci kez çekilememeli
const winnerRes2 = gs.claimWinnerLotteryPayout();
assert(!winnerRes2.success, 'Aynı kazanç ikinci kez çekilememeli');
console.log('✅ Piyango kazancı yalnızca kazanana ve yalnızca bir kez ödeniyor.');

console.log('\n🎉 TÜM KARNAVAL HAZİNE BUYBACK, 3 AMORTİ BİLETİ, AMM YAKIM VE TALİHLİ KASADAN ÇEKİM TESTLERİ %100 BAŞARIYLA TAMAMLANDI! 🎉\n');
