// Ordu sınırları (config ORDU_SINIRI, 30 Eylül 2026 kararı 5):
//   1) asker seviyesi hesap seviyesini geçemez: XP birikir, hesap seviyesi artınca asker seviye atlar
//   2) asker hakkı = geçilen zindan katı + 1 (varsayılan KAPALI; açıkken sayıyı sınırlar)
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

let toplam = 0;
const ok = (ad) => { toplam++; console.log(`✅ ${ad}`); };
const yeni = () => {
  depo.clear();
  ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  gs.state.adAstraBalance = 1e8;
  gs.state.village = { houses: 10, villagers: 100, labor: 0, lastGrowthAt: 0, starvingSince: 0 };
  return gs;
};

// Varsayılanlar
assert.equal(GAME_CONFIG.ORDU_SINIRI.ASKER_SEVIYESI_HESAP_SEVIYESINI_GECEMEZ, true);
assert.equal(GAME_CONFIG.ORDU_SINIRI.ASKER_HAKKI_ZINDAN_KATINA_BAGLI, false);

// 1) Asker seviyesi hesap seviyesini geçemez
{
  const gs = yeni();
  gs.buySoldierUnit();
  gs.state.level = 1;
  const r = gs.addSoldierXp(0, 100000);
  assert.equal(gs.state.soldierUnits[0].level, 1, 'hesap seviyesi 1 iken asker seviye atlamaz');
  assert.equal(r.leveledUp, false);
  assert.ok(gs.state.soldierUnits[0].xp >= 100000, 'XP kaybolmaz, birikir');

  gs.state.level = 5;
  gs.addSoldierXp(0, 0);
  assert.equal(gs.state.soldierUnits[0].level, 5, 'hesap seviyesi 5: asker 5. seviyede durur');
  assert.ok(gs.state.soldierUnits[0].xp > 0, 'kalan XP birikmeye devam eder');
  ok('Asker seviyesi hesap seviyesini geçmez; XP birikir ve hesap seviyesi artınca işlenir');
}

// 1b) Hesap seviye atlayınca birikmiş asker XP'si işlenir (gerçek levelUp yolu)
{
  const gs = yeni();
  gs.buySoldierUnit();
  gs.state.level = 1;
  gs.addSoldierXp(0, 100000);
  const g = gs.getNextLevelRequirement();
  gs.state.currentXp = g.xp;
  for (const k of Object.keys(g.costs)) gs.state.inventory[k] = (gs.state.inventory[k] || 0) + g.costs[k];
  gs.state.adAstraBalance += g.adAstra;
  const lv = gs.levelUp();
  assert.equal(lv.success, true, lv.message);
  assert.equal(gs.state.soldierUnits[0].level, 2, 'hesap 2. seviyeye çıkınca asker de 2. seviyeye çıkar');
  ok('Hesap seviye atlayınca biriken asker XP\'si seviyeye dönüşür');
}

// 1c) Kayıtta hesap seviyesini aşmış asker düşürülmez
{
  const gs = yeni();
  gs.buySoldierUnit();
  gs.state.soldierUnits[0].level = 40;
  gs.state.level = 3;
  gs.addSoldierXp(0, 10);
  assert.equal(gs.state.soldierUnits[0].level, 40, 'mevcut seviye düşürülmez');
  ok('Eski kayıttaki yüksek seviyeli asker düşürülmez');
}

// 2) Asker hakkı zindan katına bağlı: varsayılan kapalı
{
  const gs = yeni();
  gs.state.dungeonProgress = 1;
  let n = 0;
  while (n < 12 && gs.buySoldierUnit().success) n += 1;
  assert.ok(n >= 10, `kapalıyken yalnız köylü ve ASTRA sınırlar (${n})`);
  ok('Zindan katı sınırı varsayılan kapalı: asker yalnız ASTRA ve köylüyle sınırlı');
}

// 2b) Açıkken hak = geçilen kat + 1
{
  const gs = yeni();
  GAME_CONFIG.ORDU_SINIRI.ASKER_HAKKI_ZINDAN_KATINA_BAGLI = true;
  try {
    gs.state.dungeonProgress = 1;
    assert.equal(gs.buySoldierUnit().success, true, '1. asker alınır');
    const red = gs.buySoldierUnit();
    assert.equal(red.success, false, 'zindanda ilerlemeden 2. asker alınamaz');
    assert.match(red.message, /hakkın dolu/);
    gs.state.dungeonProgress = 2;
    assert.equal(gs.buySoldierUnit().success, true, '1. kat geçilince 2. asker açılır');
    assert.equal(gs.buySoldierUnit().success, false, '3. asker için 2. katı da geçmek gerekir');
    gs.state.dungeonProgress = 18;
    let n = 2;
    while (n < 30 && gs.buySoldierUnit().success) n += 1;
    assert.equal(n, 18, 'son katta en çok 18 asker');
  } finally {
    GAME_CONFIG.ORDU_SINIRI.ASKER_HAKKI_ZINDAN_KATINA_BAGLI = false;
  }
  ok('Zindan katı sınırı açıkken asker hakkı = geçilen kat + 1 (18 askerde biter)');
}

console.log(`\n${toplam} ordu sınırı kontrolü geçti.`);
process.exit(0);
