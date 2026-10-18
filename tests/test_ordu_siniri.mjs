// Ordu sınırları (config ORDU_SINIRI, 30 Eylül 2026 kararı 5):
//   1) asker seviyesi hesap seviyesini geçemez: XP birikir, hesap seviyesi artınca asker seviye atlar
//   2) asker hakkı = geçilen zindan katı + 1 (18 Ekim 2026'dan beri AÇIK; Normal mod 2-7, modlarda birikir; var olan asker silinmez)
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
const { askerHakki, KAT_SAYISI, ENFAZLA_SEVIYE } = await import('../js/economy/ordu-hakki.js');

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
assert.equal(GAME_CONFIG.ORDU_SINIRI.ASKER_HAKKI_ZINDAN_KATINA_BAGLI, true);

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

// 2) Saf hesap: hak = (önceki modlarda geçilen kat) + bu moddaki kat + 1
{
  const hakOf = (ilerleme, mod = 0) => askerHakki({ ilerleme, mod });
  assert.deepEqual([1, 2, 3].map((p) => hakOf(p)), [2, 2, 2], '1. kat: 2 asker');
  assert.deepEqual([4, 5, 6].map((p) => hakOf(p)), [3, 3, 3], '2. kat: 3 asker');
  assert.deepEqual([7, 8, 9].map((p) => hakOf(p)), [4, 4, 4], '3. kat: 4 asker');
  assert.deepEqual([10, 13, 16, 18].map((p) => hakOf(p)), [5, 6, 7, 7], '4., 5., 6. kat: 5, 6, 7 asker');
  assert.equal(hakOf(19), 7, 'son canavar yenilince (ilerleme 19) hak 7 kalır, taşmaz');
  assert.deepEqual([0, -3, 'x', null, undefined].map((p) => hakOf(p)), [2, 2, 2, 2, 2], 'bozuk ilerleme 1. kata çekilir');
  assert.deepEqual([[1, 1], [18, 1], [1, 2], [18, 2], [1, 3], [18, 3]].map(([p, m]) => hakOf(p, m)), [8, 13, 14, 19, 20, 25], 'modlar 6 kat ekler: Zor 8-13, Uzman 14-19, Cehennem 20-25');
  assert.equal(KAT_SAYISI, 6); assert.equal(ENFAZLA_SEVIYE, 18);
  ok('Asker hakkı hesabı: Normal 2-7, Zor 8-13, Uzman 14-19, Cehennem 20-25; bozuk girdiler güvenli');
}

// 2b) Açıkken yeni asker alımı hakla sınırlı; getAskerHakki doğru bilgi verir
{
  const gs = yeni();
  gs.state.dungeonProgress = 1;
  assert.deepEqual({ ...gs.getAskerHakki() }, { hak: 2, kat: 1, mod: 0, acik: true });
  assert.equal(gs.buySoldierUnit().success, true, '1. asker alınır');
  assert.equal(gs.buySoldierUnit().success, true, '2. asker alınır (1. katta hak 2)');
  const red = gs.buySoldierUnit();
  assert.equal(red.success, false, '1. katta 3. asker alınamaz');
  assert.match(red.message, /hakkın dolu: 2 asker.*1\. kattasın/);
  gs.state.dungeonProgress = 4;   // 1. kat geçildi → 2. kat
  assert.equal(gs.buySoldierUnit().success, true, '2. katta 3. asker açılır');
  assert.equal(gs.buySoldierUnit().success, false);
  gs.state.dungeonProgress = 18;
  let n = 3;
  while (n < 30 && gs.buySoldierUnit().success) n += 1;
  assert.equal(n, 7, 'Normal modda en çok 7 asker');
  gs.state.dungeonProgress = 19;
  assert.equal(gs.buySoldierUnit().success, false, 'zindan bitince de hak 7 kalır (modlar sonraki adım)');
  gs.state.dungeonMode = 1;   // Zor mod: hak birikir
  gs.state.dungeonProgress = 1;
  assert.equal(gs.getAskerHakki().hak, 8);
  assert.equal(gs.buySoldierUnit().success, true, 'Zor modun başında 8. asker alınır');
  ok('Yeni asker alımı hakla sınırlı: 1. kat 2 … 6. kat 7 asker; modlarda hak birikir');
}

// 2c) Var olan asker silinmez, hak düşse de (eski kayıtlar korunur): hak dolu olan oyuncu yalnız yeni alamaz
{
  const gs = yeni();
  GAME_CONFIG.ORDU_SINIRI.ASKER_HAKKI_ZINDAN_KATINA_BAGLI = false;
  try { for (let i = 0; i < 10; i++) assert.equal(gs.buySoldierUnit().success, true); } finally { GAME_CONFIG.ORDU_SINIRI.ASKER_HAKKI_ZINDAN_KATINA_BAGLI = true; }
  assert.equal(gs.state.soldierUnits.length, 10);
  gs.state.dungeonProgress = 1;
  assert.equal(gs.buySoldierUnit().success, false, 'hakkın üstünde yeni asker alınmaz');
  assert.equal(gs.state.soldierUnits.length, 10, '10 askerin hiçbiri silinmedi');
  assert.equal(gs.getSoldierFullStats(9) !== null, true, 'fazla asker hâlâ savaşır');
  ok('Hakkın üstündeki var olan asker silinmez; yalnız yeni alım kapanır');
}

// 2d) Kural kapalıyken (ayar) yalnız ASTRA ve köylü sınırlar
{
  const gs = yeni();
  GAME_CONFIG.ORDU_SINIRI.ASKER_HAKKI_ZINDAN_KATINA_BAGLI = false;
  try {
    gs.state.dungeonProgress = 1;
    let n = 0;
    while (n < 12 && gs.buySoldierUnit().success) n += 1;
    assert.ok(n >= 10, `kapalıyken yalnız köylü ve ASTRA sınırlar (${n})`);
    assert.equal(gs.getAskerHakki().acik, false);
  } finally { GAME_CONFIG.ORDU_SINIRI.ASKER_HAKKI_ZINDAN_KATINA_BAGLI = true; }
  ok('Kural ayardan kapatılabilir: o zaman asker yalnız ASTRA ve köylüyle sınırlı');
}

console.log(`\n${toplam} ordu sınırı kontrolü geçti.`);
process.exit(0);
