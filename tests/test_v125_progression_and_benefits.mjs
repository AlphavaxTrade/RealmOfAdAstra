// v1.25 — İlk oturumda menülerin adım adım açılması + seviye faydasının hesaplanması
import assert from 'node:assert/strict';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const { GameStateManager } = await import('../js/gameState.js');

// 1) Yeni oyuncu: temel alanlar açık, gelişmiş bölümler kilitli
{
  const gs = new GameStateManager();
  gs.vanillaReset();
  for (const open of ['forest', 'mine', 'farm', 'warehouse', 'tavern']) {
    assert.equal(gs.isFeatureUnlocked(open), true, `${open} baştan açık olmalı`);
  }
  for (const locked of ['market', 'blacksmith', 'barracks', 'carnival', 'dungeon', 'colosseum', 'battlefield']) {
    const lock = gs.getFeatureLock(locked);
    assert.ok(lock && lock.reason, `${locked} yeni oyuncuda kilitli olmalı ve nedeni yazmalı`);
  }

  // İlk hasat → pazar açılır
  gs.state.tools.axe.totalGathered = 324;
  gs.checkOnboardingProgress();
  assert.equal(gs.isFeatureUnlocked('market'), true, 'İlk hasattan sonra pazar açılmalı');

  // Üç alan birden → kışla ve demirci açılır
  gs.startExpedition('wood'); gs.startExpedition('iron'); gs.startExpedition('wheat');
  gs.checkOnboardingProgress();
  assert.equal(gs.isFeatureUnlocked('barracks'), true);
  assert.equal(gs.isFeatureUnlocked('blacksmith'), true);

  // Seviye 2 → karnaval
  gs.state.level = 2;
  assert.equal(gs.isFeatureUnlocked('carnival'), true);

  // İlk asker → zindan; ilk zafer → kolezyum ve savaş alanı
  gs.state.soldierUnits = [gs.createSoldierUnit(1)];
  assert.equal(gs.isFeatureUnlocked('dungeon'), true);
  assert.equal(gs.isFeatureUnlocked('colosseum'), false);
  gs.state.dungeonProgress = 2;
  assert.equal(gs.isFeatureUnlocked('colosseum'), true);
  assert.equal(gs.isFeatureUnlocked('battlefield'), true);
  console.log('✅ Menüler adım adım açılıyor');
}

// 2) Zaten ilerlemiş hesap: hiçbir şey kilitli değil
{
  const gs = new GameStateManager();
  gs.vanillaReset();
  gs.state.level = 5;
  for (const z of ['market', 'blacksmith', 'barracks', 'carnival', 'dungeon', 'colosseum', 'battlefield']) {
    assert.equal(gs.isFeatureUnlocked(z), true, `Sv.5 hesapta ${z} açık olmalı`);
  }
  console.log('✅ İlerlemiş hesapta her şey açık');
}

// 3) Seviye faydası: üretim artar, stamina buğdayı azalır, UBI Sv.3'te başlar
{
  const gs = new GameStateManager();
  const b1 = gs.getLevelBenefits(1), b2 = gs.getLevelBenefits(2), b3 = gs.getLevelBenefits(3);
  assert.ok(b2.productionBonusPct > b1.productionBonusPct, 'Üretim bonusu artmalı');
  // 5 Ekim 2026: 1.000 hammadde başına stamina buğdayı her seviyede yalnız ~%1 iner (buğday tüketimi korunur)
  for (let L = 1; L < 81; L++) {
    const x = gs.getLevelBenefits(L), y = gs.getLevelBenefits(L + 1);
    const drop = 1 - y.wheatPer1000 / x.wheatPer1000;
    assert.ok(drop > 0.002 && drop < 0.02, `Sv.${L}→${L + 1} buğday verimi küçük adımla iyileşmeli (%${(drop * 100).toFixed(2)})`);
    assert.ok(gs.getMaxStamina(L) >= 3 * gs.getExpeditionStaminaCost(L), `Sv.${L}: 3 sefer aynı anda başlatılabilmeli`);
  }
  assert.ok(Math.abs(gs.getLevelBenefits(81).wheatPer1000 / b1.wheatPer1000 - Math.pow(0.99, 80)) < 0.02, '81. seviyede 1.000 hammadde başına buğday ≈ 194 × 0,99^80');
  assert.ok(b2.maxStamina > b1.maxStamina);
  assert.equal(b2.ubiEligible, false);
  assert.equal(b3.ubiEligible, true);
  assert.ok(b3.ubiWeight > 2 && b3.ubiWeight < 2.1);
  console.log(`✅ Seviye faydası: 1.000 hammadde başına buğday ${b1.wheatPer1000}→${b2.wheatPer1000} (Sv.1→2), üretim +%${b2.productionBonusPct}`);
}
