// Silo seviye sınırı (19 Ekim 2026, kullanıcı kararı "silo 12 çok az"): Universe öncesi de 18. seviyeye kadar açık;
// ama seviye atlama bedelinin tavanı ESKİ (12. silo) kapasitesinde kalır: silo büyüyünce seviye atlamak yavaşlamaz.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const yeni = () => { depo.clear(); return new GameStateManager(); };

// 1) Universe öncesi (aşama 0) silo 18. seviyeye kadar yükseltilebilir
{
  GAME_CONFIG.UNIVERSE_STAGE = 0;
  const gs = yeni();
  assert.equal(gs.getWarehouseMaxLevel(), 49, 'en üst silo seviyesi 49 (19 Ekim 2026)');
  const k12 = gs.getWarehouseCapacity(12), k18 = gs.getWarehouseCapacity(18);
  assert.ok(k18.wheat >= 5 * k12.wheat && k18.stone >= 4.5 * k12.stone, `18. silo 12.'nin ~5 katı olmalı (${k18.wheat} / ${k12.wheat})`);
  gs.state.warehouseLevel = 12;
  const maliyet = gs.getWarehouseUpgradeCost(12);
  assert.ok(maliyet && maliyet.nextLevel === 13, '12 → 13 yükseltme artık mümkün');
  assert.ok(gs.getWarehouseUpgradeCost(18), "18. seviyeden sonrası da var (49'a kadar)");
  assert.equal(gs.getWarehouseUpgradeCost(49), null, '49. seviyeden sonrası yok');
  // 49. seviye: 18. seviyenin ~10 katı, 19-49 arası her seviye x1,08
  assert.ok(Math.abs(gs.getWarehouseCapacity(49).wheat / gs.getWarehouseCapacity(18).wheat - Math.pow(1.08, 31)) < 0.01 * Math.pow(1.08, 31), '49. silo = 18. silo x1,08^31');
  // 12→13 yükseltme: şart ve bedel %70 (yeni kural)
  const u = gs.getWarehouseUpgradeCost(12);
  assert.equal(u.fillShare, 0.7, 'doluluk şartı %70');
  assert.equal(u.costs.wheat, Math.floor(gs.getWarehouseCapacity(12).wheat * 0.7), "bedel silonun %70'ini dolduran miktar");
  assert.equal(u.fills.wheat, Math.round(gs.getWarehouseCapacity(12).wheat * 0.7), 'şart: %70 dolu');
  ok('silo 49. seviyeye kadar açık; şart ve bedel %70 (12. seviye buğday 12.976 → 18. 73.500 → 49. ~798 bin)');
}

// 2) Seviye bedeli tavanı eski sınırda (12. silo × %80) kalır; hiçbir seviye bedeli bunu aşmaz
{
  GAME_CONFIG.UNIVERSE_STAGE = 0;
  const gs = yeni();
  const tavan = gs.getLevelUpCostCeiling();
  const k18 = gs.getWarehouseCapacity(18);
  const pay = GAME_CONFIG.LEVEL_UP_SILO_SHARE;
  for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) {
    assert.equal(tavan[k], Math.floor(k18[k] * pay), `${k}: tavan 18. silonun %80'i (silo 49'a açılsa da tavan 18. silodan hesaplanır: bedeller sınırsız büyümez)`);
  }
  for (const L of [10, 12, 20, 40, 80]) {
    gs.state.level = L;
    const r = gs.getNextLevelRequirement();
    for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron']) assert.ok((r.costs[k] || 0) <= tavan[k], `Sv.${L} ${k} bedeli tavanı aşmaz`);
  }
  ok('seviye bedeli tavanı 18. silonun %80 kapasitesinde (x5 kararı); hiçbir seviye bedeli bunu aşmaz');
}

// 3) Universe aşaması 3: tavan en üst siloya geçer (eski davranış korunur)
{
  GAME_CONFIG.UNIVERSE_STAGE = 3;
  const gs = yeni();
  const tavan = gs.getLevelUpCostCeiling();
  const k18 = gs.getWarehouseCapacity(18);
  assert.equal(tavan.wheat, Math.floor(k18.wheat * GAME_CONFIG.LEVEL_UP_SILO_SHARE));
  GAME_CONFIG.UNIVERSE_STAGE = 0;
  ok('Universe aşaması 3: seviye bedeli tavanı en üst siloya göre (eski davranış)');
}

console.log(`\n${n} silo seviye sınırı kontrolü geçti.`);
