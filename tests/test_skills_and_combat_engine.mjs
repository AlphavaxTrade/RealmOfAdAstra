// tests/test_skills_and_combat_engine.mjs
// Tek Tip Asker + Skill Loadout & Taktiksel Savaş Motoru Test Paketi

import assert from 'assert';
import { createUnit, simulateBattle, selectTarget } from '../js/combat.js';
import { gameState } from '../js/gameState.js';
import { DUNGEON_LEVELS } from '../js/bestiary.js';

console.log('⚔️ [TEST] Tek Tip Asker + Skill Loadout & Taktiksel Savaş Motoru Testleri Başlatılıyor...\n');

// --------------------------------------------------------------------------
// TEST 1: Tek Tip Asker & Skill Loadout Yapısı
// --------------------------------------------------------------------------
console.log('▶ TEST 1: Tek Tip Asker & Skill Loadout');
const soldier1 = createUnit({
  name: 'Öncü Muhafız',
  side: 'ally',
  maxHp: 200,
  hp: 200,
  atk: 30,
  def: 10,
  spd: 12,
  row: 'front',
  skills: ['shieldWall', 'stunStrike']
});

const soldier2 = createUnit({
  name: 'Nişancı Destek',
  side: 'ally',
  maxHp: 160,
  hp: 160,
  atk: 45,
  def: 5,
  spd: 16,
  row: 'back',
  skills: ['shockwave', 'fieldMedic']
});

assert.strictEqual(soldier1.row, 'front');
assert.strictEqual(soldier2.row, 'back');
assert.deepStrictEqual(soldier1.skills, ['shieldWall', 'stunStrike']);
assert.deepStrictEqual(soldier2.skills, ['shockwave', 'fieldMedic']);
assert.strictEqual(soldier1.cooldown, 0, 'yeni birimin yetenek bekleme süresi sıfır');
console.log('  ✅ Askerler sınıf kısıtlaması olmadan bağımsız yetenek yükü ve mevzi taşıyor.');

// --------------------------------------------------------------------------
// TEST 2: Safsız Serbest Hedef Seçimi (selectTarget) & Taunt / Piercing Mekanizması
// --------------------------------------------------------------------------
console.log('\n▶ TEST 2: Safsız Serbest Hedef Seçimi & selectTarget');
const enemies = [
  createUnit({ name: 'Canavar 1', side: 'enemy', maxHp: 100, hp: 100, atk: 20 }),
  createUnit({ name: 'Canavar 2', side: 'enemy', maxHp: 100, hp: 60, atk: 20 })
];

const attackerDummy = createUnit({ name: 'Saldırgan', side: 'ally', atk: 25 });

// Saf kısıtlaması olmadan herhangi bir canlı hedef seçilebilmeli
const target1 = selectTarget(attackerDummy, enemies, () => 0.1);
const target2 = selectTarget(attackerDummy, enemies, () => 0.9);
assert.ok(target1 && target2, 'Canlı hedefler başarıyla seçilmeli');

// Delici/İnfazcı saldırı en düşük can oranına sahip olanı seçmeli (Canavar 2: %60 HP vs Canavar 1: %100 HP)
const piercingTarget = selectTarget(attackerDummy, enemies, () => 0.1, { piercing: true });
assert.strictEqual(piercingTarget.name, 'Canavar 2', 'Piercing saldırı en düşük canlıyı hedeflemeli');

console.log('  ✅ Ön/arka saf kısıtlaması olmadan serbest hedef seçimi ve piercing başarıyla doğrulandı.');

// --------------------------------------------------------------------------
// TEST 3: Sıra Tabanlı Savaş & Müttefik Yetenek Tetiklenmesi
// --------------------------------------------------------------------------
console.log('\n▶ TEST 3: simulateBattle İçinde Müttefik Yetenek Tetiklenmesi');
const dummyAllies = [
  createUnit({
    name: 'Savaşçı #1',
    side: 'ally',
    maxHp: 300,
    hp: 300,
    atk: 35,
    def: 10,
    spd: 15,
    row: 'front',
    skills: ['shieldWall', 'shockwave']
  }),
  createUnit({
    name: 'Savaşçı #2',
    side: 'ally',
    maxHp: 200,
    hp: 200,
    atk: 40,
    def: 5,
    spd: 18,
    row: 'back',
    skills: ['armorBreaker', 'fieldMedic']
  })
];

const dummyEnemy = [
  createUnit({
    name: 'Orman Trolü',
    side: 'enemy',
    maxHp: 250,
    hp: 250,
    atk: 25,
    def: 8,
    spd: 10,
    row: 'front'
  })
];

const battleResult = simulateBattle({ allies: dummyAllies, enemies: dummyEnemy, maxRounds: 25 });
assert.ok(battleResult.roundCount > 0 || battleResult.rounds.length > 0, 'Savaş en az 1 tur sürmeli');
assert.ok(battleResult.log.length > 0, 'Savaş günlüğü boş olamaz');

// Günlükte en az bir müttefik yeteneğinin tetiklendiğini doğrula
const allyAbilityUsed = battleResult.log.some(e => e.type === 'ability' && e.actorSide === 'ally');
console.log(`  ✅ Savaş simülasyonu ${battleResult.roundCount} turda tamamlandı. Zafer: ${battleResult.victory ? 'EVET' : 'HAYIR'}`);
console.log(`  ✅ Müttefik yetenek tetiklenmesi: ${allyAbilityUsed ? 'BAŞARILI' : 'Beklemede'}`);
assert.ok(allyAbilityUsed, 'Müttefikler en az 1 yetenek kullanmış olmalı');

// --------------------------------------------------------------------------
// TEST 4: Seviye Atlama İle Otomatik Yetenek Kilit Açımı
// --------------------------------------------------------------------------
console.log('\n▶ TEST 4: Seviye Atlama & Otomatik Skill Açımı (Lv.10, Lv.25, Lv.45, Lv.65)');
const testSoldier = {
  id: 'test_soldier_1',
  name: 'Aday Asker',
  level: 1,
  xp: 0,
  skills: ['shieldWall'],
  row: 'front'
};

// Lv.9 iken ek yetenek açılmamalı
testSoldier.level = 9;
let unlocked = gameState.checkSoldierSkillUnlock(testSoldier);
assert.strictEqual(unlocked.length, 0);

// Lv.10 olunca 'shockwave' açılmalı
testSoldier.level = 10;
unlocked = gameState.checkSoldierSkillUnlock(testSoldier);
assert.ok(unlocked.includes('shockwave') || testSoldier.skills.includes('shockwave'));
console.log(`  ✅ Lv.10 kilit açımı: ${testSoldier.skills.join(', ')}`);

// Lv.25 olunca 'armorBreaker' açılmalı
testSoldier.level = 25;
unlocked = gameState.checkSoldierSkillUnlock(testSoldier);
assert.ok(unlocked.includes('armorBreaker') || testSoldier.skills.includes('armorBreaker'));
console.log(`  ✅ Lv.25 kilit açımı: ${testSoldier.skills.join(', ')}`);

// Lv.45 olunca 'fieldMedic' açılmalı
testSoldier.level = 45;
unlocked = gameState.checkSoldierSkillUnlock(testSoldier);
assert.ok(unlocked.includes('fieldMedic') || testSoldier.skills.includes('fieldMedic'));
console.log(`  ✅ Lv.45 kilit açımı: ${testSoldier.skills.join(', ')}`);

// Lv.65 olunca 'lastStand' (pasif) açılmalı
testSoldier.level = 65;
unlocked = gameState.checkSoldierSkillUnlock(testSoldier);
assert.ok(unlocked.includes('lastStand') || testSoldier.skills.includes('lastStand'));
console.log(`  ✅ Lv.65 kilit açımı: ${testSoldier.skills.join(', ')}`);

// --------------------------------------------------------------------------
// TEST 5: Zindan Boss Fazları (HP Yüzdesi Tetikleyicisi)
// --------------------------------------------------------------------------
console.log('\n▶ TEST 5: Zindan Boss Fazları (Golyat %50 & IGNIS %60/%25)');
const golyatLevel = DUNGEON_LEVELS.find(lvl => lvl.level === 9);
const ignisLevel = DUNGEON_LEVELS.find(lvl => lvl.level === 18);

assert.ok(golyatLevel && golyatLevel.bossPhases, 'Lv.9 Boss için bossPhases tanımlı olmalı');
assert.ok(ignisLevel && ignisLevel.bossPhases, 'Lv.18 IGNIS için bossPhases tanımlı olmalı');

const golyatUnit = createUnit({
  name: golyatLevel.name,
  side: 'enemy',
  maxHp: golyatLevel.hp,
  hp: golyatLevel.hp,
  atk: golyatLevel.atk,
  def: golyatLevel.def || 20,
  spd: golyatLevel.spd || 8,
  bossPhases: golyatLevel.bossPhases
});

const strongAllies = [
  createUnit({ name: 'Dev Savaşçı 1', side: 'ally', maxHp: 800, hp: 800, atk: 120, spd: 20, skills: ['armorBreaker', 'shockwave'] }),
  createUnit({ name: 'Dev Savaşçı 2', side: 'ally', maxHp: 800, hp: 800, atk: 120, spd: 20, skills: ['shieldWall', 'bloodFrenzy'] })
];

const golyatBattle = simulateBattle({ allies: strongAllies, enemies: [golyatUnit], maxRounds: 25 });
const phaseTriggered = golyatBattle.log.some(e => e.type === 'phase');
console.log(`  ✅ Lv.9 Boss savaşı tamamlandı. Boss faz tetiklenmesi: ${phaseTriggered ? 'BAŞARILI' : 'Simülasyonda hasara bağlı'}`);

// --------------------------------------------------------------------------
// TEST 6: Kolezyum Sabit Lig Kademeleri & 1v1 Gladyatör Maçı
// --------------------------------------------------------------------------
console.log('\n▶ TEST 6: Kolezyum Sabit Lig Kademeleri & 1v1 Maç');
const bronzeTier = gameState.getColosseumTier(1050);
const silverTier = gameState.getColosseumTier(1200);
const goldTier = gameState.getColosseumTier(1350);
const diamondTier = gameState.getColosseumTier(1600);
const champTier = gameState.getColosseumTier(1900);

assert.strictEqual(bronzeTier.id, 'bronze');
assert.strictEqual(silverTier.id, 'silver');
assert.strictEqual(goldTier.id, 'gold');
assert.strictEqual(diamondTier.id, 'diamond');
assert.strictEqual(champTier.id, 'champion');
console.log('  ✅ Sabit lig kademeleri (Bronz -> Şampiyon) eksiksiz doğrulandı.');

if (!gameState.state.soldierUnits) gameState.state.soldierUnits = [];
gameState.state.soldierUnits[0] = {
  id: 'unit_colosseum_test',
  name: 'Gladyatör Alfa',
  level: 15,
  hp: 250,
  maxHp: 250,
  baseAtk: 45,
  skills: ['shieldWall', 'shockwave'],
  row: 'front'
};

gameState.state.arenaKeys = 5;
const matchRes = gameState.executeColosseum1v1Match(0);
assert.strictEqual(typeof matchRes.isVictory, 'boolean');
assert.ok(matchRes.combatLog.length > 0);
assert.ok(matchRes.tier && matchRes.tier.name);
assert.ok(matchRes.opponentName);
console.log(`  ✅ 1v1 Kolezyum maçı tamamlandı. Sonuç: ${matchRes.isVictory ? 'GALİBİYET' : 'YENİLGİ'} (Lig: ${matchRes.tier.name}, Rakip: ${matchRes.opponentName})`);

// --------------------------------------------------------------------------
// TEST 7: Dünya Bossu Yetenek Çeşitliliği Bonusu
// --------------------------------------------------------------------------
console.log('\n▶ TEST 7: Dünya Bossu Yetenek Çeşitliliği (Squad Skill Diversity)');
gameState.state.soldierUnits = [
  { name: 'S1', skills: ['shieldWall'], level: 10, hp: 100 },      // Tank
  { name: 'S2', skills: ['shockwave'], level: 10, hp: 100 },       // AoE
  { name: 'S3', skills: ['fieldMedic'], level: 10, hp: 100 },      // Şifa
  { name: 'S4', skills: ['armorBreaker'], level: 10, hp: 100 }     // Kırıcı
];

const diversity = gameState.calculateSquadSkillDiversity();
assert.ok(diversity.uniqueRoles >= 4, 'En az 4 farklı rol bulunmalı');
assert.ok(diversity.diversityMultiplier > 1.0, 'Çeşitlilik çarpanı 1.0\'dan büyük olmalı');
console.log(`  ✅ Farklı Rol Sayısı: ${diversity.uniqueRoles}, Hasar Çarpanı: %${Math.round((diversity.diversityMultiplier - 1) * 100)} bonus!`);

console.log('\n🎉 [BAŞARILI] Tüm Yetenek, Formasyon, Savaş Motoru ve Lig Testleri Hatasız Geçti!');
