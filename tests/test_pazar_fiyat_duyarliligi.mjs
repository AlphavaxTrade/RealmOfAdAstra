// Fiyata bağlı bedeller: alet onarımının ASTRA bedeli ve teçhizat dövme/yükseltme/onarım bedelleri pazar değerini izler;
// taverna botunun maliyeti fiyat değişince hemen yenilenir; pazar işlemi aboneleri tetikler.
// 11 Ekim 2026'da test_dynamic_market_payments.mjs'ten baştan yazıldı.
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
const r3 = (v) => Math.round(v * 1000) / 1000;
const SHARE = GAME_CONFIG.TOOL_REPAIR_ADA_SHARE;
// ASTRA payı = hammaddenin pazar değeri ÷ PAZAR_FIYAT_SEVIYESI (19 Ekim 2026: hammadde fiyatı 50 kat, gelişim bedelinin ASTRA payı eski ölçekte)
const degeri = (kaynaklar) => ammMarket.calculateResourcesCostAdAstra(kaynaklar).totalAda;
const fiyatiYukselt = (carpan) => {
  ammMarket.pools.wood.adAstraReserve *= carpan;
  ammMarket.pools.iron.adAstraReserve *= carpan;
  ammMarket.savePools();
};

// 1) Alet onarımının ASTRA bedeli = istenen odun + demirin anlık pazar değerinin %30'u; fiyat yükselince hemen artar
{
  gs.state.tools.axe.durability = 4320 - 100;
  const ilk = gs.calculateRepairCost('axe');
  assert.ok(ilk.woodCost > 0 && ilk.ironCost > 0);
  assert.equal(ilk.adAstraCost, Math.max(0.001, r3(degeri({ wood: ilk.woodCost, iron: ilk.ironCost }) * SHARE)));

  fiyatiYukselt(2);
  const sonra = gs.calculateRepairCost('axe');
  assert.ok(sonra.adAstraCost > ilk.adAstraCost, 'pazar yükselince onarım bedeli hemen artar');
  assert.equal(sonra.adAstraCost, Math.max(0.001, r3(degeri({ wood: sonra.woodCost, iron: sonra.ironCost }) * SHARE)));
}
console.log('✅ alet onarım bedeli pazarı izliyor');

// 2) Taverna botunun bedeli fiyat değişince anında değişir; her fiyatta net kârın yarısıdır
{
  const yuksek = gs.calculateTavernaBotProfitAndCost();
  ammMarket.resetPools();
  const normal = gs.calculateTavernaBotProfitAndCost();
  assert.notEqual(yuksek.botCostAda, normal.botCostAda);
  assert.equal(normal.botCostAda, Math.max(1, r3(normal.netProfitAda * 0.5)));
  assert.equal(yuksek.botCostAda, Math.max(1, r3(yuksek.netProfitAda * 0.5)));
}
console.log('✅ bot bedeli fiyatla birlikte güncelleniyor');

// 3) Pazar işlemi abonelere güncel fiyat listesini bildirir
{
  let bildirilen = null;
  const iptal = ammMarket.subscribe((fiyatlar) => { bildirilen = fiyatlar; });
  ammMarket.executeSell('wheat', 1000);
  iptal();
  assert.ok(bildirilen && bildirilen.wheat > 0, 'abone güncel buğday fiyatını alır');
}
console.log('✅ pazar abonelikleri');

// 4) Teçhizat dövme / yükseltme / onarım bedelleri fiyat yükselince hemen artar; dövme bedeli pazar değerine eşittir
{
  ammMarket.resetPools();
  const ilkDovme = gs.calculateEquipmentCraftCost('weapon');
  assert.ok(ilkDovme.woodCost > 0 && ilkDovme.ironCost > 0 && ilkDovme.adaCost > 0);

  const kilic = { id: 'test_sword_1', slot: 'weapon', name: 'Test Kılıcı', level: 1, baseAtk: 25, baseHp: 0, durability: 8, maxDurability: 13 };
  const ilkYukselt = gs.calculateEquipmentUpgradeCost(kilic);
  const ilkOnarim = gs.calculateEquipmentRepairCost(kilic);

  fiyatiYukselt(2.5);
  const yuksekDovme = gs.calculateEquipmentCraftCost('weapon');
  assert.ok(yuksekDovme.adaCost > ilkDovme.adaCost, 'dövme bedeli artar');
  assert.equal(yuksekDovme.adaCost, degeri({ wood: yuksekDovme.woodCost, iron: yuksekDovme.ironCost, coal: yuksekDovme.coalCost || 0 }), 'dövme bedeli anlık pazar değerine eşit');
  assert.ok(gs.calculateEquipmentUpgradeCost(kilic).adAstraCost > ilkYukselt.adAstraCost, 'yükseltme bedeli artar');
  assert.ok(gs.calculateEquipmentRepairCost(kilic).adaCost > ilkOnarim.adaCost, 'onarım bedeli artar');
}
console.log('✅ teçhizat bedelleri pazarı izliyor');

console.log('\n4/4 pazar fiyat duyarlılığı bloğu geçti.');
