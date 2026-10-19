// v2 (7 Ekim 2026) — Köy Evleri, Şifahane, Demirhane geri dönüşümü, roket görevi, Sirius Konseyi (Otorite + projeler), Genesis hakkı
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

const K = GAME_CONFIG.KOY, O = GAME_CONFIG.OTORITE, S = GAME_CONFIG.SIFAHANE, U = GAME_CONFIG.UZAY_LIMANI;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const fresh = () => {
  localStorage.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  const gs = new GameStateManager();
  gs.state.warehouseLevel = gs.getWarehouseMaxLevel();
  return gs;
};
const DAY = 86400;

// 1) Köy: başlangıç, beslenme, emek, büyüme, açlık
{
  const gs = fresh();
  const v0 = gs.getVillageInfo();
  assert.equal(v0.houses, K.START_HOUSES);
  assert.equal(v0.villagers, K.START_VILLAGERS);
  assert.equal(v0.capacity, K.START_HOUSES * K.VILLAGERS_PER_HOUSE);
  assert.ok(near(v0.bonus, Math.floor(K.START_VILLAGERS / 10) * K.PROD_BONUS_PER_10), 'Her 10 köylü +%1 üretim');
  assert.equal(v0.soldierCap, K.START_VILLAGERS, 'Her asker 1 köylü');
  gs.state.inventory.wheat = 100;
  const r = gs.processVillage(DAY);
  assert.ok(near(r.eaten, K.START_VILLAGERS * K.WHEAT_PER_VILLAGER_DAY), '10 köylü günde 20 buğday yer');
  assert.ok(near(gs.state.inventory.wheat, 100 - 20), 'Buğday depodan düştü');
  assert.ok(near(gs.getVillageInfo().labor, K.START_VILLAGERS * K.LABOR_PER_VILLAGER_DAY, 1), 'Günde köylü başına 1 emek');
  assert.equal(r.grew, 0, 'Kapasite doluyken büyüme yok');
  // Ev: hesap seviyesi sınırı, bedel, kapasite ve büyüme
  assert.equal(gs.buildHouse().success, false, 'Seviye 1 iken 2. ev yapılamaz (ev ≤ seviye)');
  gs.state.level = 5;
  const cost2 = gs.getHouseCost(2);
  assert.deepEqual(cost2, K.HOUSE_BASE_COST, '2. ev taban bedel');
  assert.deepEqual(gs.getHouseCost(3), Object.fromEntries(Object.entries(K.HOUSE_BASE_COST).map(([k, v]) => [k, Math.round(v * K.HOUSE_COST_MULT)])), '3. ev ×1,2');
  assert.equal(gs.buildHouse().success, false, 'Malzeme yokken yapılamaz');
  for (const [k, n] of Object.entries(cost2)) gs.state.inventory[k] = n;
  const b = gs.buildHouse();
  assert.ok(b.success, b.message);
  assert.equal(gs.getVillageInfo().houses, 2);
  assert.equal(gs.getVillageInfo().capacity, 2 * K.VILLAGERS_PER_HOUSE);
  assert.equal(gs.state.inventory.wood, 0, 'Ev bedeli yakıldı');
  gs.state.inventory.wheat = 1000;
  const g = gs.processVillage(DAY);
  assert.ok(near(g.grew, K.START_VILLAGERS * K.GROWTH_PER_DAY, 1e-9), 'Yer açılınca günde %2 büyüme');
  // Açlık: 3 gün sonra günde %5 göç
  gs.state.inventory.wheat = 0;
  gs.processVillage(DAY);
  assert.ok(gs.getVillageInfo().starving, 'Buğday bitince açlık başlar');
  const before = gs.getVillageInfo().villagersExact;
  gs.processVillage(2 * DAY);
  gs.processVillage(DAY);
  assert.ok(gs.getVillageInfo().villagersExact < before, '3 günden sonra köylüler göç eder');
  gs.state.inventory.wheat = 500;
  gs.processVillage(DAY);
  assert.equal(gs.getVillageInfo().starving, false, 'Buğday gelince açlık biter');
  ok('Köy Evleri: beslenme, emek, ev yapımı, büyüme, açlık');
}

// 2) Asker köylü ister; üretim bonusu dakikalık üretime işler
{
  const gs = fresh();
  gs.state.adAstraBalance = 1e6;
  gs.state.dungeonMode = 1; gs.state.dungeonProgress = 18;   // zindan asker hakkı 13: bu test köylü sınırını sınar, zindan hakkını değil
  for (let i = 0; i < K.START_VILLAGERS; i++) assert.ok(gs.buySoldierUnit().success, `${i + 1}. asker`);
  const r = gs.buySoldierUnit();
  assert.equal(r.success, false);
  assert.match(r.message, /köylü/);
  const mult = gs.getVillageProductionMultiplier('wood');
  assert.ok(near(mult, 1 + gs.getVillageInfo().bonus), 'Köylü bonusu');
  assert.ok(near(gs.getResourceRatePerMinute('wood'), GAME_CONFIG.BASE_PRODUCTION.wood * gs.getLevelProductionMultiplier(1) * mult, 1e-9), 'Dakikalık üretim bonusla');
  ok('Her asker bir köylü ister; köylü bonusu üretime işler');
}

// 3) Şifahane: hemen iyileştirmenin tek yolu; 1 ot = HP_PER_HERB can, ASTRA payı can başına ADA_PER_HP, buğday yok
{
  const gs = fresh();
  gs.state.adAstraBalance = 1e6;
  gs.buySoldierUnit();
  const s = gs.state.soldierUnits[0];
  s.maxHp = 100; s.hp = 50;
  const info = gs.getHerbHealInfo(0);
  assert.equal(info.herbsNeeded, Math.ceil(50 / S.HP_PER_HERB));
  assert.ok(near(info.herbAdaCost, 50 * S.ADA_PER_HP * gs.getAdaPriceMultiplier(), 1e-2), 'ASTRA payı can başına ADA_PER_HP × fiyat çarpanı');
  gs.state.inventory.herb = 3;
  assert.equal(gs.healSoldierWithHerb(0).success, false, 'Ot yetmezse olmaz');
  gs.state.inventory.herb = info.herbsNeeded;
  const wheat0 = gs.state.inventory.wheat, ada0 = gs.state.adAstraBalance;
  const r = gs.healSoldierWithHerb(0);
  assert.ok(r.success, r.message);
  assert.equal(s.hp, 100);
  assert.equal(gs.state.inventory.herb, 0);
  assert.equal(gs.state.inventory.wheat, wheat0, 'Buğday harcanmaz');
  assert.ok(near(ada0 - gs.state.adAstraBalance, info.herbAdaCost, 1e-6), 'ASTRA payı tam ödenir');
  ok('Şifahane: otla iyileştirme');
}

// 3b) Şifahane bedeli EKRANDA GÖRÜNEN (savaş ölçeği) cana göredir: teçhizatlı asker daha çok ot yakar; kısmi iyileştirme eldeki otla yetinir
{
  const gs = fresh();
  gs.state.adAstraBalance = 1e6;
  gs.buySoldierUnit();
  const s = gs.state.soldierUnits[0];
  s.maxHp = 150; s.hp = 88;
  const ciplak = gs.getHerbHealInfo(0);
  assert.equal(ciplak.missingBattleHp, 62, 'teçhizatsız: savaş ölçeği = taban');
  s.equipment = { armor: { name: 'z', slot: 'armor', durability: 13, maxDurability: 13, atkBonus: 0, hpBonus: 500 } };
  const savas = gs.getSoldierBattleStart(0);
  const donanimli = gs.getHerbHealInfo(0);
  assert.equal(donanimli.battleMaxHp, savas.maxHp);
  assert.equal(donanimli.missingBattleHp, savas.maxHp - savas.hp, 'eksik can ekrandaki can farkıdır');
  assert.equal(donanimli.herbsNeeded, Math.ceil(donanimli.missingBattleHp / S.HP_PER_HERB), '1 ot = HP_PER_HERB can (ekrandaki sayıyla)');
  assert.ok(donanimli.herbsNeeded > ciplak.herbsNeeded * 3, 'güçlü teçhizat iyileştirmeyi daha çok ot yakan yapar');
  assert.ok(near(donanimli.herbAdaCost, donanimli.missingBattleHp * S.ADA_PER_HP * gs.getAdaPriceMultiplier(), 1e-2), 'ASTRA payı: eksik can × ADA_PER_HP');

  // Kısmi iyileştirme: ot yetmiyorsa kismi olmadan reddedilir, kismi ile eldeki kadarı iyileştirir ve ASTRA oranlanır
  const hp0 = s.hp, ada0 = gs.state.adAstraBalance;
  gs.state.inventory.herb = Math.floor(donanimli.herbsNeeded / 2);
  assert.equal(gs.healSoldierWithHerb(0).success, false, 'kısmi izni yoksa ot yetmezse olmaz');
  const k = gs.healSoldierWithHerb(0, { kismi: true });
  assert.equal(k.success, true, k.message);
  assert.equal(k.partial, true);
  assert.equal(gs.state.inventory.herb, 0, 'eldeki ot harcandı');
  assert.ok(s.hp > hp0 && s.hp < 150, 'can arttı ama tam değil');
  const oran = k.herbsUsed / donanimli.herbsNeeded;
  assert.ok(near(ada0 - gs.state.adAstraBalance, donanimli.herbAdaCost * oran, 2e-3), 'ASTRA payı da oranlandı');
  // kalanını tamamla
  const kalan = gs.getHerbHealInfo(0);
  gs.state.inventory.herb = kalan.herbsNeeded;
  const t = gs.healSoldierWithHerb(0, { kismi: true });
  assert.equal(t.success && !t.partial, true, 'kalan ot yetince tam iyileşir');
  assert.equal(s.hp, 150);
  ok('Şifahane: bedel ekrandaki cana göre, teçhizat çarpar, kısmi iyileştirme');
}

// 4) Demirhane geri dönüşümü: %70 hammadde geri, eşya yok olur
{
  const gs = fresh();
  gs.state.adAstraBalance = 1e6;
  gs.state.inventory = { ...gs.state.inventory, iron: 3000, wood: 3000, coal: 2000, fragments: 50 };   // silo kapasitesi içinde
  assert.ok(gs.craftEquipment('weapon').success, 'Silah dövülür');
  const item = gs.state.equipment.weapon;
  const val = gs.getRecycleValue(item);
  const cum = gs.getCumulativeEquipmentResourceCost(item);
  assert.equal(val.wood, Math.floor(cum.totalWood * GAME_CONFIG.RECYCLE_RETURN_RATE));
  assert.equal(val.iron, Math.floor(cum.totalIron * GAME_CONFIG.RECYCLE_RETURN_RATE));
  const w0 = gs.state.inventory.wood, i0 = gs.state.inventory.iron;
  const r = gs.recycleEquipment({ source: 'kingdom', slotKey: 'weapon' });
  assert.ok(r.success, r.message);
  assert.equal(gs.state.equipment.weapon, null, 'Eşya yok oldu');
  assert.equal(gs.state.inventory.wood - w0, val.wood);
  assert.equal(gs.state.inventory.iron - i0, val.iron);
  assert.equal(gs.recycleEquipment({ source: 'kingdom', slotKey: 'weapon' }).success, false);
  ok('Demirhane: geri dönüşüm %70');
}

// 5) Roket görevi: seviye ve parçalar
{
  const gs = fresh();
  assert.equal(gs.buildRocket().success, false, 'Seviye 1 ve parça yokken olmaz');
  gs.state.level = U.ROCKET_MIN_LEVEL;
  for (const [k, n] of Object.entries(U.ROCKET_PARTS)) { if (k === 'adAstra') gs.state.adAstraBalance = n + 1; else gs.state.inventory[k] = n; }
  const st = gs.getRocketStatus();
  assert.ok(st.canBuild, JSON.stringify(st));
  const r = gs.buildRocket();
  assert.ok(r.success, r.message);
  assert.equal(gs.state.rocketReady, true);
  assert.ok(near(gs.state.adAstraBalance, 1), 'ASTRA parçası düştü');
  assert.equal(gs.state.inventory.iron, 0, 'Demir parçası düştü');
  assert.equal(gs.buildRocket().success, false, 'İkinci roket yok');
  ok('Uzay Limanı: roket görevi');
}

// 6) Madencilik Otoritesi: altı hammaddeli karışım, katkı, seviye atlayınca kapasite +%5 ve çalışma süresi; çelik payı kömürle ödenir
{
  const gs = fresh();
  const st0 = globalPool.getOtoriteStatus();
  assert.equal(st0.level, 0);
  assert.equal(st0.units, O.BASE_UNITS);
  assert.equal(st0.need.stone, Math.round(O.BASE_UNITS * O.MIX.stone));
  assert.ok(near(Object.values(O.MIX).reduce((t, v) => t + v, 0), 1, 1e-9), 'karışım toplamı %100');
  assert.deepEqual(Object.keys(O.MIX).sort(), [...GAME_CONFIG.RESOURCE_KEYS].sort(), 'karışım altı hammaddenin hepsini içerir');
  assert.ok(O.MIX.coal >= 0.2, 'çelik payı kömürle ödenir');
  assert.equal(O.STEEL_SHARE, undefined, 'ASTRA ile ödenen çelik payı kalktı');
  const cap0 = globalPool.state.resources.wood.baseCap;
  gs.state.inventory.stone = 1000;
  const c = gs.contributeToOtorite({ stone: 400 });
  assert.ok(c.success, c.message);
  assert.equal(gs.state.inventory.stone, 600, 'Verilen taş depodan düştü');
  assert.equal(globalPool.getOtoriteStatus().progress.stone, 400);
  assert.ok(gs.getContributionInfo().week > 0, 'Katkı puanı yazıldı');
  const kBefore = treasury.getPool('uoaTohum');
  const r = globalPool.contributeOtorite(st0.need);
  assert.equal(r.completed, true, 'Karışım tamamlanınca seviye atlar');
  assert.equal(globalPool.uretimParams().otoriteLevel, 1);
  assert.ok(near(globalPool.state.resources.wood.baseCap, Math.floor(cap0 * (1 + O.PER_LEVEL_BONUS) * (globalPool.otoriteWork(1).minutes / globalPool.otoriteWork(0).minutes)), 2), 'Kapasite +%5 ve daha uzun çalışma');
  assert.equal(treasury.getPool('uoaTohum'), kBefore, 'Konsey kasasından kimseye ödeme çıkmadı (çelik payı kasadan değil kömürden)');
  assert.equal(globalPool.getOtoriteStatus().units, Math.round(O.BASE_UNITS * O.LEVEL_MULT), '2. seviye ×1,4');
  ok('Madencilik Otoritesi: altı hammaddeli karışım, katkı, seviye ve kapasite');
}

// 7) Konsey projeleri: sırayla, hammadde + emek, bonus uygulanır
{
  const gs = fresh();
  const p0 = globalPool.getProjectStatus();
  assert.equal(p0.active.id, GAME_CONFIG.KONSEY_PROJELERI[0].id);
  gs._village().labor = 100;
  gs.state.inventory.stone = 500;
  const c = gs.contributeToProject({ stone: 200 }, 60);
  assert.ok(c.success, c.message);
  assert.equal(gs.state.inventory.stone, 300);
  assert.equal(gs.getVillageInfo().labor, 40, 'Emek düştü');
  const st = globalPool.getProjectStatus();
  assert.equal(st.progress.stone, 200);
  assert.equal(st.labor, 60);
  const dur0 = gs.getExpeditionDurationMinutes(20);
  const r = globalPool.contributeProject(st.need, p0.active.labor);
  assert.equal(r.completed, true);
  assert.equal(globalPool.getProjectStatus().active.id, GAME_CONFIG.KONSEY_PROJELERI[1].id, 'Sıradaki proje açıldı');
  assert.ok(near(globalPool.getProjectBonus('expeditionTime'), -0.02), 'Köprü bonusu');
  assert.ok(gs.getExpeditionDurationMinutes(20) < dur0, 'Sefer süresi kısaldı');
  const capBefore = gs.getWarehouseCapacity(1).wood;
  const g = globalPool.getProjectStatus();
  globalPool.contributeProject(g.need, g.active.labor);
  assert.ok(near(gs.getWarehouseCapacity(1).wood, Math.round(capBefore * 1.05)), 'Büyük Ambar: silo +%5');
  ok('Konsey projeleri: katkı, sıra, bonuslar');
}

// 8) Genesis NFT hakkı: gezegen satın alma hakkı. 15 Ekim 2026: Genesis Yolu şartları (seviye, hesap yaşı, Krallık Yolu, Fatih,
// 4 hafta Altın katkı, 18 eser uyanmış, 3 yıllık önden katkı, açık mühür yeri) ve dolar sabit mühür; ayrıntı tests/test_genesis_yolu.mjs
{
  const gs = fresh();
  const s = gs.state;
  gs._dunya = { astraUsd: 1e-6, genesisAcik: 100, hesapAcilis: gs._now() - 200 * 86400000 };
  s.level = 30;
  s.onboardingSections = { [GAME_CONFIG.ONBOARDING_FINAL.id]: { claimed: true } };
  s.fatih = { harcanan: 0, kazanilan: 0, alindi: true, odul: 0, at: 0 };
  const altin = GAME_CONFIG.URETIM_HAKKI.TIERS.find(t => t.id === 'gold').min * gs.getAdaPriceMultiplier();
  gs._contribution().gecmis = [altin, altin, altin, altin];
  for (const a of s.collectionArtifacts) { a.discovered = true; a.uyandi = true; }
  s.genesisKatki = { harcananUsd: 200, yakilanUsd: 0, cekilenUsd: 0 };
  s.adAstraBalance = gs.genesisMuhurBedeli() + 1;
  const r = gs.mintGenesisNft();
  assert.ok(r.success, r.message);
  assert.ok(gs.hasGrant('universe_planet_purchase'), 'Genesis = gezegen satın alma hakkı');
  const gs2 = new GameStateManager();
  assert.ok(gs2.hasGrant('universe_planet_purchase'), 'Hak kayıttan geri yüklenir');
  ok('Genesis NFT hakkı kaydedildi');
}

console.log(`\n${passed} Köy/Konsey kontrolü geçti.`);
