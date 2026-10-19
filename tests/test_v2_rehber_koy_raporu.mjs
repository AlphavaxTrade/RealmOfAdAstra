// v2 — Rehber görevleri yeni binaları kapsar (ev, otla iyileştirme, geri dönüşüm, Konsey katkısı);
// "Sen yokken olanlar" raporunda köy olayları (yenen buğday, doğan köylü, açlıktan göç).
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
const { GAME_CONFIG, URETIM_CARPANI: U } = await import('../js/config.js');

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const fresh = () => { localStorage.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset(); const gs = new GameStateManager(); gs.state.warehouseLevel = gs.getWarehouseMaxLevel(); return gs; };
const done = (gs, id) => !!(gs.state.onboarding && gs.state.onboarding[id] && gs.state.onboarding[id].done);
const K = GAME_CONFIG.KOY;

// 1) Rehber listesi yeni görevleri içerir
{
  const ids = GAME_CONFIG.ONBOARDING_QUESTS.map(q => q.id);
  for (const id of ['first_house', 'first_herb_heal', 'first_recycle', 'first_konsey']) assert.ok(ids.includes(id), id);
  const gs = fresh();
  assert.equal(gs.getOnboardingStatus().total, GAME_CONFIG.ONBOARDING_QUESTS.length);
  ok('Rehber görevleri: 4 yeni görev listede');
}

// 2) Ev yapınca, otla iyileştirince, geri dönüştürünce, Konsey'e verince görev tamamlanır
{
  const gs = fresh();
  gs.state.level = 5;
  Object.assign(gs.state.inventory, { wood: 5000 * U, stone: 5000 * U, iron: 5000 * U, coal: 5000 * U, herb: 500 * U, wheat: 5000 * U });
  gs.checkOnboardingProgress();
  assert.equal(done(gs, 'first_house'), false);
  assert.equal(gs.buildHouse().success, true);
  gs.checkOnboardingProgress();
  assert.equal(done(gs, 'first_house'), true, 'İkinci ev → görev');

  gs.state.soldierUnits = [{ id: 's1', name: 'Er', hp: 10, maxHp: 100, level: 1, equipment: {}, skills: ['shieldWall'] }];
  gs.state.adAstraBalance = 100;
  gs.state.inventory.herb = 100 * U;
  const h = gs.healSoldierWithHerb(0);
  assert.equal(h.success, true, h.message);
  gs.checkOnboardingProgress();
  assert.equal(done(gs, 'first_herb_heal'), true, 'Otla iyileştirme → görev');

  gs.state.armoryInventory = [{ id: 'w1', slot: 'weapon', name: 'Kılıç', icon: '🗡️', level: 1, baseAtk: 25, baseHp: 0, atkBonus: 25, hpBonus: 0, durability: 13, maxDurability: 13 }];
  const r = gs.recycleEquipment({ source: 'armory', armoryIndex: 0 });
  assert.equal(r.success, true, r.message);
  gs.checkOnboardingProgress();
  assert.equal(done(gs, 'first_recycle'), true, 'Geri dönüşüm → görev');

  const c = gs.contributeToOtorite({ stone: 100 });
  assert.equal(c.success, true, c.message);
  gs.checkOnboardingProgress();
  assert.equal(done(gs, 'first_konsey'), true, 'Konsey katkısı → görev');
  ok('Yeni binalardaki ilk işler rehber görevini tamamlar');
}

// 3) Çevrimdışı rapor: köy olayları (yenen buğday, doğum) ve açlıkta göç
{
  const gs = fresh();
  gs.state.inventory.wheat = 5000;
  const v = gs.getVillageInfo();
  gs.state.lastSeenAt = Date.now() - 2 * 86400000;
  const rep = gs.processOfflineProgress(2 * 86400, Date.now() - 2 * 86400000);
  assert.ok(rep.village, 'Raporda köy bölümü var');
  assert.ok(rep.village.eaten >= v.villagers * (K.WHEAT_PER_VILLAGER_DAY ?? 2) * 2 - 1, `2 günde yenen buğday (${rep.village.eaten})`);
  assert.equal(rep.village.lost, 0);
  ok('Rapor: yenen buğday ve köy bilgisi');

  const gs2 = fresh();
  gs2.state.inventory.wheat = 0;
  gs2.state.lastSeenAt = Date.now() - 6 * 86400000;
  const rep2 = gs2.processOfflineProgress(6 * 86400, Date.now() - 6 * 86400000);
  assert.ok(rep2.village && rep2.village.lost > 0, 'Buğdaysız 6 gün: göç raporda');
  assert.ok(gs2.state.offlineReport && gs2.state.offlineReport.village.lost > 0, 'Göç olunca rapor oyuncuya gösterilir');
  ok('Rapor: açlıktan göç bildirilir');
}

console.log(`\n${passed}/4 rehber / köy raporu testi geçti`);
