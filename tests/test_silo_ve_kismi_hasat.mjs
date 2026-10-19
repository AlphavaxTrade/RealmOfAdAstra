// Silo ve bot: sefer mahsulü silodan büyükse kısmi toplama (kalan seferde bekler), botun silo yönetimi
// (yükselt modunda tam sefer kadar yer açma, %80 barajı, sat modunda %50 rezerv).
// 11 Ekim 2026'da test_smart_silo_and_partial_expeditions.mjs'ten (sahte pazar ve havuz nesneleri olmadan) baştan yazıldı.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

depo.clear();
ammMarket.resetPools();
globalPool.vanillaReset();
treasury.reset();
const gs = new GameStateManager();
const s = gs.state;

// Seviye 1 silo = bir saatlik üretim; 18 dakikalık odun seferi bu kadar odun getirir
s.warehouseLevel = 1;
const kap = gs.getWarehouseCapacity(1);
const mahsul = Math.floor(gs.getResourceRatePerMinute('wood') * 18);
const bitmisSefer = () => ({ nodeId: 'wood', durationMinutes: 18, durationSeconds: 1080, elapsedSeconds: 1080, isCompleted: true, claimedAmount: 0 });

// 1) Silo yetmiyorsa kısmi toplanır, kalan seferde bekler
{
  const yer = 50;
  s.inventory.wood = kap.wood - yer;
  s.activeExpeditions = { wood: bitmisSefer() };
  const r = gs.claimExpedition('wood');
  assert.equal(r.success, true);
  assert.equal(r.isPartialSiloFill, true);
  assert.equal(r.harvestedAmount, yer, 'siloda boş olan kadar toplanır');
  assert.equal(s.inventory.wood, kap.wood, 'silo dolar');
  assert.ok(s.activeExpeditions.wood, 'mahsul beklediği için sefer silinmez');
  assert.equal(r.stillRemaining, mahsul - yer);

  // 2) Yer açılınca kalan toplanır, sefer kapanır
  const kalan = mahsul - yer;
  s.inventory.wood = kap.wood - mahsul;
  const r2 = gs.claimExpedition('wood');
  assert.equal(r2.success, true);
  assert.equal(r2.isPartialSiloFill, false);
  assert.equal(r2.harvestedAmount, kalan);
  assert.equal(s.inventory.wood, kap.wood - mahsul + kalan);
  assert.equal(s.activeExpeditions.wood, undefined, 'sefer tamamen bitince silinir');
}
console.log('✅ kısmi toplama ve kalan mahsul');

// 3) Bot, yükselt modunda gelecek mahsul kadar yer açar (fazlasını satarak)
{
  s.warehouseLevel = 1;
  gs.setBotSiloOption(true);
  gs.buyTavernaAutomationBot(true);
  s.inventory.wood = kap.wood - 50;
  const r = gs.handleBotSiloSpace('wood', 150);
  assert.equal(r.handled, true);
  assert.equal(r.action, 'sold');
  assert.equal(r.amountSold, 100, '150 yer için 100 odun satılır (50 zaten boştu)');
  assert.equal(kap.wood - s.inventory.wood, 150, 'siloda tam 150 odunluk yer kalır');
}
console.log('✅ bot gelen mahsul kadar yer açar');

// 4) Yükselt modunda ASTRA eksikse %80 barajının üzerindeki fazlalık satılır, baraj delinmez
{
  s.warehouseLevel = 1;
  s.level = 2;   // silo hesap seviyesini geçemez (19 Ekim 2026): 1 -> 2 yükseltilebilsin
  gs.setBotSiloOption(true);
  for (const k of GAME_CONFIG.RESOURCE_KEYS) s.inventory[k] = Math.round(kap[k] * 0.8) + Math.max(5, Math.floor(kap[k] * 0.1));
  s.adAstraBalance = 0;
  const maliyet = gs.getWarehouseUpgradeCost();
  assert.equal(maliyet.is80PercentFull, true);
  assert.equal(maliyet.canAffordCost, false);
  const r = gs.handleBotSiloSpace('wood', 10);
  assert.equal(r.handled, true);
  assert.ok(r.action === 'sold_for_ada' || r.action === 'upgraded', r.action);
  assert.ok(s.adAstraBalance > 0 || r.action === 'upgraded', 'satıştan ASTRA kazanılmalı');
  assert.ok(s.inventory.wood >= maliyet.fills.wood, '%80 barajı delinmemeli');
}
console.log('✅ ASTRA açığında %80 barajı korunur');

// 5) Sat modunda silonun yarısı rezerv kalır, fazlası satılır
{
  s.warehouseLevel = 1;
  gs.setBotSiloOption(false);
  const yarim = Math.floor(kap.wood * 0.5);
  s.inventory.wood = yarim + 88;
  const r = gs.handleBotSiloSpace('wood', 50);
  assert.equal(r.handled, true);
  assert.equal(r.action, 'sold');
  assert.equal(r.amountSold, 88);
  assert.equal(s.inventory.wood, yarim);
}
console.log('✅ sat modunda yarım silo rezerv');

console.log('\n4/4 silo ve kısmi hasat bloğu geçti.');
