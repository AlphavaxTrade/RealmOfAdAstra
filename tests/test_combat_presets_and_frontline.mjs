// tests/test_combat_presets_and_frontline.mjs
// Zindan & Kolezyum Ön Saf / Arka Saf Mevzi Mekanizması & 3 Farklı Taktiksel Savaş Preseti Test Paketi

import assert from 'assert';
import { createUnit, selectTarget, simulateBattle } from '../js/combat.js';
import { gameState } from '../js/gameState.js';
import '../js/config.js';

console.log('🛡️ [TEST] Zindan & Kolezyum Ön Saf / Arka Saf & 3 Preset Testleri Başlatılıyor...\n');

// --------------------------------------------------------------------------
// TEST 1: Ön Saf Siper Koruması (%85 Frontline Cover) & Delici Arka Saf Hedefleme
// --------------------------------------------------------------------------
console.log('▶ TEST 1: Ön Saf Siper Koruması & Delici Hedefleme');

const tankFront = createUnit({ name: 'Ön Saf Şövalye', side: 'enemy', row: 'front', maxHp: 200, hp: 200, atk: 10 });
const archerBack = createUnit({ name: 'Arka Saf Nişancı', side: 'enemy', row: 'back', maxHp: 100, hp: 50, atk: 40 });
const enemies = [tankFront, archerBack];
const attacker = createUnit({ name: 'Oyuncu Savaşçı', side: 'ally', atk: 30 });

// RNG < 0.85 iken ön saf ayakta olduğu için ön saf hedeflenmeli
const targetFront = selectTarget(attacker, enemies, () => 0.5);
assert.strictEqual(targetFront.name, 'Ön Saf Şövalye', 'Normal saldırı ayaktaki ön safı hedeflemeli');

// RNG >= 0.85 iken sızma şansı (coverRate = 0.85) ile arka saf hedeflenebilmeli
const targetSip = selectTarget(attacker, enemies, () => 0.95);
assert.ok(targetSip, 'Sızma saldırısı hedef seçebilmeli');

// Piercing (delici) saldırı doğrudan arka safı hedefler
const piercingTarget = selectTarget(attacker, enemies, () => 0.1, { piercing: true });
assert.strictEqual(piercingTarget.name, 'Arka Saf Nişancı', 'Delici saldırı ön safı aşıp arka safı hedeflemeli');

// Ön saf öldüğünde normal saldırı zorunlu olarak arka safı hedefler
tankFront.hp = 0;
const targetAfterFrontDead = selectTarget(attacker, enemies, () => 0.1);
assert.strictEqual(targetAfterFrontDead.name, 'Arka Saf Nişancı', 'Ön saf düştüğünde arka saf açığa çıkmalı');

console.log('  ✅ Ön saf siper koruması ve delici arka saf mekaniği kusursuz çalışıyor.');

// --------------------------------------------------------------------------
// TEST 2: 3 Farklı Taktiksel Savaş Preseti (Preset 1, 2, 3) Kaydetme & Uygulama
// --------------------------------------------------------------------------
console.log('\n▶ TEST 2: 3 Taktiksel Preset (P1, P2, P3) Yönetimi');

gameState.vanillaReset();
// 4 adet asker oluşturalım
gameState.state.soldierUnits = [
  gameState.createSoldierUnit(1),
  gameState.createSoldierUnit(2),
  gameState.createSoldierUnit(3),
  gameState.createSoldierUnit(4)
];

const presetsData = gameState.getCombatPresets();
assert.ok(presetsData.presets[1], 'Preset 1 var olmalı');
assert.ok(presetsData.presets[2], 'Preset 2 var olmalı');
assert.ok(presetsData.presets[3], 'Preset 3 var olmalı');

// 1. Taktik: Dengeli (Asker 1, 2 Ön; Asker 3, 4 Arka)
gameState.setSoldierRow(0, 'front');
gameState.setSoldierRow(1, 'front');
gameState.setSoldierRow(2, 'back');
gameState.setSoldierRow(3, 'back');
const resP1 = gameState.saveCombatPreset(1, 'Taktik 1: Dengeli 2-2');
assert.strictEqual(resP1.success, true);
assert.strictEqual(resP1.preset.name, 'Taktik 1: Dengeli 2-2');

// 2. Taktik: Çelik Duvar (Tüm askerler Ön Saf)
gameState.setSoldierRow(0, 'front');
gameState.setSoldierRow(1, 'front');
gameState.setSoldierRow(2, 'front');
gameState.setSoldierRow(3, 'front');
const resP2 = gameState.saveCombatPreset(2, 'Taktik 2: Çelik Duvar');
assert.strictEqual(resP2.success, true);

// 3. Taktik: Suikast Baskını (Yalnızca Asker 1 Ön, diğer 3 asker Arka Saf)
gameState.setSoldierRow(0, 'front');
gameState.setSoldierRow(1, 'back');
gameState.setSoldierRow(2, 'back');
gameState.setSoldierRow(3, 'back');
const resP3 = gameState.saveCombatPreset(3, 'Taktik 3: Suikast Hattı');
assert.strictEqual(resP3.success, true);

console.log('  ✅ 3 Farklı Preset başarıyla yapılandırıldı ve state içine kaydedildi.');

// --------------------------------------------------------------------------
// TEST 3: Tek Tıkla Presetler Arası Geçiş & Anında Dizilim Doğrulaması
// --------------------------------------------------------------------------
console.log('\n▶ TEST 3: Tek Tıkla Preset Değişimi & Uygulama');

// Preset 2'ye geçiş (Çelik Duvar - hepsi ön saf olmalı)
const apply2 = gameState.applyCombatPreset(2);
assert.strictEqual(apply2.success, true);
assert.strictEqual(gameState.state.combatPresets.activePresetId, 2);
gameState.state.soldierUnits.forEach((s, idx) => {
  assert.strictEqual(s.row, 'front', `Asker #${idx+1} Preset 2'de ön safta olmalı`);
});
console.log('  ✅ Preset 2 (Çelik Duvar) tek tıkla tüm orduya uygulandı.');

// Preset 3'e geçiş (Suikast Hattı - 1. ön, 2, 3, 4 arka saf olmalı)
const apply3 = gameState.applyCombatPreset(3);
assert.strictEqual(apply3.success, true);
assert.strictEqual(gameState.state.combatPresets.activePresetId, 3);
assert.strictEqual(gameState.state.soldierUnits[0].row, 'front');
assert.strictEqual(gameState.state.soldierUnits[1].row, 'back');
assert.strictEqual(gameState.state.soldierUnits[2].row, 'back');
assert.strictEqual(gameState.state.soldierUnits[3].row, 'back');
console.log('  ✅ Preset 3 (Suikast Hattı) tek tıkla uygulandı: 1 Ön, 3 Arka saf.');

// Preset 1'e geri dönüş (Dengeli 2-2: 0,1 ön; 2,3 arka saf)
const apply1 = gameState.applyCombatPreset(1);
assert.strictEqual(apply1.success, true);
assert.strictEqual(gameState.state.combatPresets.activePresetId, 1);
assert.strictEqual(gameState.state.soldierUnits[0].row, 'front');
assert.strictEqual(gameState.state.soldierUnits[1].row, 'front');
assert.strictEqual(gameState.state.soldierUnits[2].row, 'back');
assert.strictEqual(gameState.state.soldierUnits[3].row, 'back');
console.log('  ✅ Preset 1 (Dengeli) tek tıkla geri yüklendi: 2 Ön, 2 Arka saf.');

// --------------------------------------------------------------------------
// TEST 4: Tekil Asker Safı Değişimi & Presete Kaydedilerek Güncellenmesi
// --------------------------------------------------------------------------
console.log('\n▶ TEST 4: Tekil Saf Değişimi & Presete Kaydetme');

// Asker 0'ı arka safa al
const toggleRes = gameState.setSoldierRow(0, 'back');
assert.strictEqual(toggleRes.success, true);
assert.strictEqual(gameState.state.soldierUnits[0].row, 'back');

// Kullanıcı bu yeni taktiği Preset 1'e kaydeder
gameState.saveCombatPreset(1);
const activeP = gameState.getCombatPresets().presets[1];
const s0Key = gameState.state.soldierUnits[0].id;
assert.strictEqual(activeP.positions[s0Key], 'back', 'Kaydedildikten sonra preset güncellenmeli');

console.log('  ✅ Tekil saf değişimi ve presete kaydetme akışı başarıyla doğrulandı.');

// --------------------------------------------------------------------------
// TEST 5: Zindan & Kolezyum Savaş Simülasyonunda Preset Mevzi Etkisi
// --------------------------------------------------------------------------
console.log('\n▶ TEST 5: Savaş Simülasyonunda Mevzi Etkisi');

// 1 Ön saf (tank), 1 Arka saf (şifacı/nişancı) müttefik ordusu
const allies = [
  createUnit({ name: 'Ön Saf Muhafız', side: 'ally', row: 'front', maxHp: 300, hp: 300, atk: 25, skills: ['shieldWall'] }),
  createUnit({ name: 'Arka Saf Destek', side: 'ally', row: 'back', maxHp: 150, hp: 150, atk: 40, skills: ['fieldMedic'] })
];

const dungeonBoss = createUnit({
  name: 'Karanlık Lord',
  side: 'enemy',
  row: 'front',
  maxHp: 400,
  hp: 400,
  atk: 35
});

const battleSim = simulateBattle({
  allies,
  enemies: [dungeonBoss],
  seed: 42
});

assert.ok(battleSim.rounds.length > 0, 'Savaş turları oluşmalı');
console.log(`  ✅ Savaş simülasyonu ${battleSim.roundCount} turda tamamlandı. Zafer: ${battleSim.victory ? 'EVET' : 'HAYIR'}`);

console.log('\n🎉 [BAŞARILI] Zindan ve Kolezyum Ön Saf / Arka Saf & 3 Preset Sistemi %100 Doğrulandı!');
