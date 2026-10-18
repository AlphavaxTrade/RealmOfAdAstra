// Savaş motoru kuralları ve taktik düzeni: birim yeteneği/mevzi, hedef seçimi (ön saf siperi, delici saldırı), yetenek kilitleri,
// boss fazları, Kolezyum kademeleri, yetenek çeşitliliği ve üç taktik ön ayarı.
// 11 Ekim 2026'da test_skills_and_combat_engine.mjs ve test_combat_presets_and_frontline.mjs'ten baştan yazıldı.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { createUnit, simulateBattle, selectTarget } = await import('../js/combat.js');
const { GameStateManager } = await import('../js/gameState.js');
const { DUNGEON_LEVELS } = await import('../js/bestiary.js');
const { GAME_CONFIG } = await import('../js/config.js');

// 1) Birim: mevzi ve yetenek yükü sınıf kısıtlaması olmadan taşınır
{
  const on = createUnit({ name: 'Öncü', side: 'ally', maxHp: 200, hp: 200, atk: 30, def: 10, spd: 12, row: 'front', skills: ['shieldWall', 'stunStrike'] });
  const arka = createUnit({ name: 'Nişancı', side: 'ally', maxHp: 160, hp: 160, atk: 45, def: 5, spd: 16, row: 'back', skills: ['shockwave', 'fieldMedic'] });
  assert.equal(on.row, 'front');
  assert.equal(arka.row, 'back');
  assert.deepEqual(on.skills, ['shieldWall', 'stunStrike']);
  assert.deepEqual(arka.skills, ['shockwave', 'fieldMedic']);
  assert.equal(on.cooldown, 0, 'yeni birimin bekleme süresi sıfır');
}
console.log('✅ birim yükü');

// 2) Hedef seçimi: ön saf ayaktayken öncelikli, delici saldırı arka safa ulaşır, ön saf düşünce arka saf açılır
{
  const saldirgan = createUnit({ name: 'Oyuncu', side: 'ally', atk: 30 });
  const onSaf = createUnit({ name: 'Şövalye', side: 'enemy', row: 'front', maxHp: 200, hp: 200, atk: 10 });
  const arkaSaf = createUnit({ name: 'Okçu', side: 'enemy', row: 'back', maxHp: 100, hp: 50, atk: 40 });
  const dusmanlar = [onSaf, arkaSaf];
  assert.equal(selectTarget(saldirgan, dusmanlar, () => 0.5).name, 'Şövalye', 'ön saf ayaktayken hedeflenir');
  assert.ok(selectTarget(saldirgan, dusmanlar, () => 0.95), 'sızma şansında da hedef seçilir');
  assert.equal(selectTarget(saldirgan, dusmanlar, () => 0.1, { piercing: true }).name, 'Okçu', 'delici saldırı arka safı seçer');
  onSaf.hp = 0;
  assert.equal(selectTarget(saldirgan, dusmanlar, () => 0.1).name, 'Okçu', 'ön saf düşünce arka saf açılır');

  // delici saldırı en düşük can oranlıyı seçer
  const iki = [createUnit({ name: 'Canavar 1', side: 'enemy', maxHp: 100, hp: 100, atk: 20 }), createUnit({ name: 'Canavar 2', side: 'enemy', maxHp: 100, hp: 60, atk: 20 })];
  assert.equal(selectTarget(saldirgan, iki, () => 0.1, { piercing: true }).name, 'Canavar 2');
}
console.log('✅ hedef seçimi');

// 3) Savaş: tur oynanır, günlük dolar, müttefik yeteneği kullanılır; boss fazları tanımlıdır
{
  const mt = [
    createUnit({ name: 'Savaşçı 1', side: 'ally', maxHp: 300, hp: 300, atk: 35, def: 10, spd: 15, row: 'front', skills: ['shieldWall', 'shockwave'] }),
    createUnit({ name: 'Savaşçı 2', side: 'ally', maxHp: 200, hp: 200, atk: 40, def: 5, spd: 18, row: 'back', skills: ['armorBreaker', 'fieldMedic'] })
  ];
  const dusman = [createUnit({ name: 'Orman Trolü', side: 'enemy', maxHp: 250, hp: 250, atk: 25, def: 8, spd: 10, row: 'front' })];
  const sonuc = simulateBattle({ allies: mt, enemies: dusman, maxRounds: 25 });
  assert.ok(sonuc.rounds.length > 0, 'en az bir tur');
  assert.ok(sonuc.log.length > 0, 'günlük dolu');
  assert.ok(sonuc.log.some((e) => e.type === 'ability' && e.actorSide === 'ally'), 'müttefik yetenek kullanır');

  for (const kat of [9, 18]) {
    const seviye = DUNGEON_LEVELS.find((l) => l.level === kat);
    assert.ok(seviye && seviye.bossPhases, `${kat}. kat bossunun fazları tanımlı`);
  }
  const golyat = DUNGEON_LEVELS.find((l) => l.level === 9);
  const boss = createUnit({ name: golyat.name, side: 'enemy', maxHp: golyat.hp, hp: golyat.hp, atk: golyat.atk, def: golyat.def || 20, spd: golyat.spd || 8, bossPhases: golyat.bossPhases });
  const guclu = [
    createUnit({ name: 'Dev 1', side: 'ally', maxHp: 800, hp: 800, atk: 120, spd: 20, skills: ['armorBreaker', 'shockwave'] }),
    createUnit({ name: 'Dev 2', side: 'ally', maxHp: 800, hp: 800, atk: 120, spd: 20, skills: ['shieldWall', 'bloodFrenzy'] })
  ];
  const bossSavasi = simulateBattle({ allies: guclu, enemies: [boss], maxRounds: 25 });
  assert.ok(bossSavasi.rounds.length > 0);
}
console.log('✅ savaş simülasyonu ve boss fazları');

// 4) Oyuncu tarafı: yetenek kilitleri, Kolezyum kademeleri, yetenek çeşitliliği
{
  const gs = new GameStateManager();
  const asker = { id: 'a', name: 'Aday', level: 9, xp: 0, skills: ['shieldWall'], row: 'front' };
  assert.equal(gs.checkSoldierSkillUnlock(asker).length, 0, 'seviye 9\'da yeni yetenek yok');
  for (const [seviye, yetenek] of [[10, 'shockwave'], [25, 'armorBreaker'], [45, 'fieldMedic'], [65, 'lastStand']]) {
    asker.level = seviye;
    const acilan = gs.checkSoldierSkillUnlock(asker);
    assert.ok(acilan.includes(yetenek) || asker.skills.includes(yetenek), `seviye ${seviye}: ${yetenek}`);
  }

  for (const [puan, kademe] of [[1050, 'bronze'], [1200, 'silver'], [1350, 'gold'], [1600, 'diamond'], [1900, 'champion']]) {
    assert.equal(gs.getColosseumTier(puan).id, kademe, `${puan} puan → ${kademe}`);
  }

  gs.state.soldierUnits = [{ id: 'g', name: 'Gladyatör', level: 15, hp: 250, maxHp: 250, baseAtk: 45, skills: ['shieldWall', 'shockwave'], row: 'front' }];
  gs.state.adAstraBalance = 1e5;   // giriş ücreti ASTRA
  const mac = gs.executeColosseum1v1Match(0);
  assert.equal(typeof mac.isVictory, 'boolean');
  assert.ok(mac.combatLog.length > 0);
  assert.ok(mac.tier && mac.tier.name);
  assert.ok(mac.opponentName);

  // Zafer ödülü ölçeği (karar 12 Ekim 2026): bronz ligde 25 ASTRA (eskiden 2.500'lük taban kasanın %0,02'sine, ~800'e düşüyordu)
  const guclu = { id: 'g2', name: 'Titan', level: 40, hp: 9000, maxHp: 9000, baseAtk: 900, skills: ['shieldWall', 'shockwave'], row: 'front' };
  const taban = GAME_CONFIG.COLOSSEUM.WIN_REWARD_ASTRA;
  assert.equal(taban, 25);
  for (const lig of GAME_CONFIG.COLOSSEUM.LEAGUES) {
    const g2 = new GameStateManager();
    g2.state.soldierUnits = [{ ...guclu }];
    g2.state.adAstraBalance = 1e5;
    g2.state.colosseumStats = { wins: 0, losses: 0, score: 0, rank: 11, rating: lig.minRating };
    g2.getDailyCounters().arenaAda = 0;   // günlük ödül tavanı (13 Ekim 2026 EK-06) ligleri birbirinin sayacına bağlamasın
    const m = g2.executeColosseum1v1Match(0);
    assert.equal(m.isVictory, true, `${lig.id}: çok güçlü asker kazanır`);
    assert.equal(m.rewardAda, Math.round(taban * lig.rewardMult), `${lig.id}: ödül ${taban} × ${lig.rewardMult}`);
    assert.ok(m.rewardAda <= taban * 2, 'hiçbir ligde taban ödülün 2 katını aşmaz');
  }

  gs.state.soldierUnits = [
    { name: 'S1', skills: ['shieldWall'], level: 10, hp: 100 },
    { name: 'S2', skills: ['shockwave'], level: 10, hp: 100 },
    { name: 'S3', skills: ['fieldMedic'], level: 10, hp: 100 },
    { name: 'S4', skills: ['armorBreaker'], level: 10, hp: 100 }
  ];
  const cesit = gs.calculateSquadSkillDiversity();
  assert.ok(cesit.uniqueRoles >= 4);
  assert.ok(cesit.diversityMultiplier > 1);
}
console.log('✅ yetenek kilitleri, kademeler, çeşitlilik');

// 5) Taktik ön ayarları: üç düzen kaydedilir, tek dokunuşla uygulanır, tekil saf değişimi presete yazılır
{
  const gs = new GameStateManager();
  gs.state.soldierUnits = [1, 2, 3, 4].map((n) => gs.createSoldierUnit(n));
  const ayar = gs.getCombatPresets();
  for (const no of [1, 2, 3]) assert.ok(ayar.presets[no], `ön ayar ${no} var`);

  const duzenle = (satirlar) => satirlar.forEach((row, i) => gs.setSoldierRow(i, row));
  duzenle(['front', 'front', 'back', 'back']);
  const p1 = gs.saveCombatPreset(1, 'Taktik 1: Dengeli 2-2');
  assert.equal(p1.success, true);
  assert.equal(p1.preset.name, 'Taktik 1: Dengeli 2-2');
  duzenle(['front', 'front', 'front', 'front']);
  assert.equal(gs.saveCombatPreset(2, 'Taktik 2: Çelik Duvar').success, true);
  duzenle(['front', 'back', 'back', 'back']);
  assert.equal(gs.saveCombatPreset(3, 'Taktik 3: Suikast').success, true);

  const satirlar = () => gs.state.soldierUnits.map((a) => a.row);
  assert.equal(gs.applyCombatPreset(2).success, true);
  assert.equal(gs.state.combatPresets.activePresetId, 2);
  assert.deepEqual(satirlar(), ['front', 'front', 'front', 'front']);
  gs.applyCombatPreset(3);
  assert.deepEqual(satirlar(), ['front', 'back', 'back', 'back']);
  gs.applyCombatPreset(1);
  assert.equal(gs.state.combatPresets.activePresetId, 1);
  assert.deepEqual(satirlar(), ['front', 'front', 'back', 'back']);

  assert.equal(gs.setSoldierRow(0, 'back').success, true);
  gs.saveCombatPreset(1);
  const kayit = gs.getCombatPresets().presets[1];
  assert.equal(kayit.positions[gs.state.soldierUnits[0].id], 'back', 'kaydedilince ön ayar güncellenir');
}
console.log('✅ taktik ön ayarları');

console.log('\n5/5 savaş ve taktik bloğu geçti.');
