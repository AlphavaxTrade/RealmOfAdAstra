// Ekonomi 1. aşama (kullanıcı kararı, 30 Eylül 2026) — token modeli: scripts/model/token_economy_model.mjs
//  • Harcama bölünüşü: %5 yakım, %3 telif, %6 UBI, %86 hazine; hazine 6 kasaya (görev kasası yeni)
//  • Kilitli bakiye: kazancın %20'si serbest, %80'i kilitli; harcamada önce kilitli kısım, +%20 ek açılma;
//    haftada %1 taban + oyuna girilen günler için ek açılma
//  • Katkı puanı: ADA harcaması ×1, hammadde yakımı ve net hammadde satışı ×0,5 (al-sat puan getirmez)
//  • ADA fiyat çarpanı: sabit fiyatlar ve ödüller ölçeklenir, haftada en fazla %5 değişir
import assert from 'node:assert/strict';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const { GameStateManager } = await import('../js/gameState.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');
const { GAME_CONFIG } = await import('../js/config.js');

const fresh = () => {
  localStorage.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  const gs = new GameStateManager();
  gs.state.lockedAda = 0;
  gs.state.contribution = null;
  return gs;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const r3 = v => Math.round(v * 1000) / 1000;   // v2: ASTRA fiyatları 3 basamağa yuvarlanır
let passed = 0;
const ok = (name) => { passed++; console.log(`✅ ${name}`); };

// 1) Harcama bölünüşü ve 6 kasa
{
  fresh();
  const A = GAME_CONFIG.TREASURY_ALLOCATION;
  const before = Object.fromEntries(Object.keys(A).map(id => [id, treasury.getPool(id)]));
  const res = globalPool.recordTokenSpend(10000);
  assert.equal(res.burned, 500);
  assert.equal(res.creatorRoyalty, 300);
  assert.equal(res.ubiShare, 600);
  assert.equal(res.treasuryShare, 8600);
  // v2 (R3): 8 kasa — zindan 27, kolezyum 14, boss 12, geri alım 15, görev 18, karnaval 4, Fatih 5, Konsey 5
  assert.deepEqual(A, { dungeon: 0.27, arena: 0.14, worldBoss: 0.12, ammBuyback: 0.15, quest: 0.18, carnival: 0.04, fatih: 0.05, konsey: 0.05 });
  const expect = Object.fromEntries(Object.entries(A).map(([id, s]) => [id, 8600 * s]));
  for (const [id, v] of Object.entries(expect)) {
    assert.ok(near(treasury.getPool(id) - before[id], v, 1e-3), `${id} kasasına ${v} ADA girmeli`);
  }
  assert.equal(GAME_CONFIG.CREATOR_WALLET_ADDRESS, '0x58DBCF66bdd7BfA9da98aDba1965b3794321087C');
  ok('Harcama bölünüşü %5/%3/%6/%86, hazine 8 kasaya doğru bölünüyor');
}

// 2) Kazanç %20 serbest / %80 kilitli; harcamada önce kilitli kısım + %20 ek açılma
{
  const gs = fresh();
  gs.state.adAstraBalance = 1000;
  gs._onAdaEarned(1000);
  gs.state.adAstraBalance = 1000;               // yalnız kazanç (başlangıç bakiyesi 0 sayılır)
  let lk = gs.getLockedBalanceInfo();
  assert.ok(near(lk.locked, 800) && near(lk.free, 200), 'Kazancın %80i kilitli olmalı');

  gs.state.adAstraBalance -= 300;
  gs._onAdaSpent(300);
  lk = gs.getLockedBalanceInfo();
  assert.ok(near(lk.locked, 440), `300 harcama: 800-300-60 = 440 kilitli kalmalı (${lk.locked})`);
  assert.ok(near(lk.free, 260), `Serbest 200 + 60 açılan = 260 olmalı (${lk.free})`);

  // Kilitli kısımdan fazla harcama serbest kısmı azaltır, kilit negatif olmaz
  gs.state.adAstraBalance -= 600;
  gs._onAdaSpent(600);
  lk = gs.getLockedBalanceInfo();
  assert.ok(lk.locked >= 0 && lk.locked <= lk.total, 'Kilitli kısım 0 ile bakiye arasında kalmalı');
  assert.equal(lk.locked, 0);
  ok('Kilitli bakiye: %20 serbest, harcamada önce kilitli kısım ve %20 ek açılma');
}

// 3) Gerçek oyun akışları: zindan ödülü kilitlenir, asker alımı önce kilitli kısımdan düşer
{
  const gs = fresh();
  gs.state.adAstraBalance = 0;
  const ada0 = gs.state.adAstraBalance;
  gs.addDungeonXpAndDrops(1, false);
  const won = gs.state.adAstraBalance - ada0;
  assert.ok(won > 0, 'Zindan ödülü alınmalı');
  assert.ok(near(gs.state.lockedAda, won * 0.8, 1e-6), 'Zindan ödülünün %80i kilitli olmalı');

  gs.state.adAstraBalance += 100000;             // cüzdandan yatırım gibi: serbest
  const lockedBefore = gs.state.lockedAda;
  const cost = gs.getSoldierCost(1);
  const r = gs.buySoldierUnit();
  assert.ok(r.success, r.message);
  assert.ok(near(gs.state.lockedAda, Math.max(0, lockedBefore - cost - cost * 0.2)), 'Asker alımı önce kilitli kısımdan düşmeli');
  ok('Zindan ödülü kilitleniyor, asker alımı önce kilitli bakiyeyi kullanıyor');
}

// 4) Katkı puanı: ADA harcaması ×1; al-sat puan getirmez; kendi ürününü satmak ×0,5; hammadde yakımı ×0,5
{
  const gs = fresh();
  gs.state.adAstraBalance = 50000;
  gs.state.adAstraBalance -= 1000;
  gs._onAdaSpent(1000);
  assert.equal(gs.getContributionInfo().week, 1000, 'Harcanan her ADA 1 puan');

  const cap = gs.getWarehouseCapacity().wheat;
  gs.state.inventory.wheat = 0;
  const buy = gs.marketBuy('wheat', Math.min(200, cap));
  assert.ok(buy.success, buy.message);
  const afterBuy = gs.getContributionInfo().week;
  assert.equal(afterBuy, 1000, 'Pazardan hammadde almak puan vermemeli');
  const sell = gs.marketSell('wheat', gs.state.inventory.wheat);
  assert.ok(sell.success, sell.message);
  assert.ok(gs.getContributionInfo().week - afterBuy < 1, 'Alınan hammaddeyi geri satmak puan getirmemeli');

  gs.state.inventory.wood = 500;
  const before = gs._contribution().week;
  const sold = gs.marketSell('wood', 500);
  assert.ok(sold.success, sold.message);
  assert.ok(near(gs._contribution().week - before, sold.adAstraReceived * 0.5, 1e-6), 'Kendi ürününü satmak ×0,5 puan');

  const price = ammMarket.getPrice('iron');
  const b2 = gs._contribution().week;
  gs.burnResource('iron', 100);
  assert.ok(near(gs._contribution().week - b2, 100 * price * 0.5, 1e-6), 'Hammadde yakımı ×0,5 puan');
  ok('Katkı puanı: harcama ×1, net satış ve yakım ×0,5, al-sat puansız');
}

// 5) Haftalık katkı sıfırlanır, geçen hafta saklanır
{
  const gs = fresh();
  gs._addContribution(700);
  globalPool.state.epochId += 1;
  const c = gs.getContributionInfo();
  assert.equal(c.week, 0);
  assert.equal(c.lastWeek, 700);
  assert.equal(c.total, 700);
  ok('Katkı puanı haftalık sıfırlanıyor, toplam korunuyor');
}

// 6) Zamanla kilit açılması: 7 günde taban %1; yeni gün girişinde ek %0,2
{
  const gs = fresh();
  gs.state.adAstraBalance = 10000;
  gs.state.lockedAda = 10000;
  const now = gs._calendarNow();
  const today = new Date(now + 3 * 3600 * 1000).toISOString().slice(0, 10);
  gs.state.lockUnlock = { lastAt: now - 7 * 86400000, activeDay: today };
  gs.processLockedUnlock();
  assert.ok(near(gs.state.lockedAda, 9900, 0.01), `7 günde %1 açılmalı (${gs.state.lockedAda})`);
  gs.state.lockUnlock.activeDay = '2000-01-01';
  gs.processLockedUnlock();
  assert.ok(near(gs.state.lockedAda, 9900 * (1 - 0.014 / 7), 0.01), 'Oyuna girilen yeni gün ek %0,2 açmalı');
  const again = gs.state.lockedAda;
  gs.processLockedUnlock();
  assert.ok(near(gs.state.lockedAda, again, 1e-9), 'Aynı gün ikinci kez açılma olmamalı');
  ok('Zamanla kilit açılması: haftada %1 taban + günlük giriş payı');
}

// 7) ADA fiyat çarpanı: haftada en fazla %5, sabit fiyat ve ödüller ölçeklenir
{
  const gs = fresh();
  const soldier1 = gs.getSoldierCost(1);
  const reward5 = gs.getDungeonBaseReward(5).ada;
  const ticket = gs.getLotteryRules().ticketPrice;
  assert.equal(gs.getAdaPriceMultiplier(), 1);

  gs.setAdaPriceMultiplierTarget(2);
  gs.processPriceMultiplierWeek();                 // ilk çağrı yalnız haftayı kaydeder
  assert.equal(gs.getAdaPriceMultiplier(), 1);
  globalPool.state.epochId += 1;
  gs.processPriceMultiplierWeek();
  assert.equal(gs.getAdaPriceMultiplier(), 1.05, 'Bir haftada en fazla %5 artmalı');
  assert.equal(gs.getSoldierCost(1), r3(soldier1 * 1.05));
  assert.equal(gs.getDungeonBaseReward(5).ada, reward5, 'v2: ödüller sabit ASTRA, fiyat çarpanı yalnız bedellere');
  assert.equal(gs.getLotteryRules().ticketPrice, r3(ticket * 1.05));
  assert.equal(gs.getWheelCostAda(), r3(GAME_CONFIG.CARNIVAL.WHEEL_COST_ADA * 1.05));

  globalPool.state.epochId += 30;                   // 30 hafta sonra hedefe ulaşır ve geçmez
  gs.processPriceMultiplierWeek();
  assert.equal(gs.getAdaPriceMultiplier(), 2);

  gs.setAdaPriceMultiplierTarget(1);
  globalPool.state.epochId += 1;
  gs.processPriceMultiplierWeek();
  assert.equal(gs.getAdaPriceMultiplier(), 1.9, 'Aşağı yönde de haftada en fazla %5');
  ok('Fiyat çarpanı haftada ≤%5 ilerliyor; asker, bilet ve çark bedeli ölçekleniyor, ödüller sabit');
}

// 8) Görev ödülü görev kasasından ve çarpanla; ekranda görünen ödül = alınan ödül
{
  const gs = fresh();
  gs.state.adaPriceMultiplier = 1.5;
  gs.startExpedition('wood');
  gs.checkOnboardingProgress();
  const shown = gs.getOnboardingStatus().quests.find(q => q.id === 'first_expedition').rewardAda;
  const questBefore = treasury.getPool('quest');
  const r = gs.claimOnboardingReward('first_expedition');
  assert.ok(r.success);
  assert.equal(shown, GAME_CONFIG.ONBOARDING_QUESTS.find(q => q.id === 'first_expedition').rewardAda, 'v2: görev ödülü sabit (çarpan uygulanmaz)');
  assert.equal(r.granted, shown, 'Alınan ödül ekranda görünenle aynı olmalı');
  assert.ok(near(questBefore - treasury.getPool('quest'), r.granted), 'Ödül görev kasasından çıkmalı');
  assert.ok(near(gs.state.lockedAda, r.granted * 0.8), 'Görev ödülünün %80i kilitli');
  ok('Görev ödülü görev kasasından, sabit ve kilitli');
}

// 9) Eski kayıt: kilitli alan yoksa mevcut bakiye serbest sayılır; kayıt sonrası alanlar korunur
{
  localStorage.clear();
  localStorage.setItem('adastra_player_save_v6', JSON.stringify({ adAstraBalance: 5000 }));
  const gs = new GameStateManager();
  const lk = gs.getLockedBalanceInfo();
  assert.equal(lk.locked, 0);
  assert.equal(lk.free, 5000);
  gs._onAdaEarned(1000);
  gs.state.adAstraBalance += 1000;
  gs.saveState();
  const gs2 = new GameStateManager();
  assert.ok(near(gs2.state.lockedAda, 800), 'Kilitli bakiye kayıttan geri yüklenmeli');
  ok('Eski kayıtlar serbest başlar, kilitli bakiye kaydediliyor');
}

console.log(`\n${passed} ekonomi 1. aşama kontrolü geçti.`);
