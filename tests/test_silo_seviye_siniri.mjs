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
  assert.equal(gs.getWarehouseMaxLevel(), 18, 'en üst silo seviyesi 18');
  const k12 = gs.getWarehouseCapacity(12), k18 = gs.getWarehouseCapacity(18);
  assert.ok(k18.wheat >= 5 * k12.wheat && k18.stone >= 4.5 * k12.stone, `18. silo 12.'nin ~5 katı olmalı (${k18.wheat} / ${k12.wheat})`);
  gs.state.warehouseLevel = 12;
  const maliyet = gs.getWarehouseUpgradeCost(12);
  assert.ok(maliyet && maliyet.nextLevel === 13, '12 → 13 yükseltme artık mümkün');
  assert.equal(gs.getWarehouseUpgradeCost(18), null, '18. seviyeden sonrası yok');
  ok('Universe öncesi silo 18. seviyeye kadar açık (12. seviye buğday 12.976 → 18. seviye 73.500)');
}

// 2) Seviye bedeli tavanı eski sınırda (12. silo × %80) kalır; hiçbir seviye bedeli bunu aşmaz
{
  GAME_CONFIG.UNIVERSE_STAGE = 0;
  const gs = yeni();
  const tavan = gs.getLevelUpCostCeiling();
  const k12 = gs.getWarehouseCapacity(12);
  const pay = GAME_CONFIG.LEVEL_UP_SILO_SHARE;
  for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) {
    assert.equal(tavan[k], Math.floor(k12[k] * pay), `${k}: tavan 12. silonun %80'i kalır (silo büyüdü diye seviye bedeli büyümez)`);
  }
  for (const L of [10, 12, 20, 40, 80]) {
    gs.state.level = L;
    const r = gs.getNextLevelRequirement();
    for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron']) assert.ok((r.costs[k] || 0) <= tavan[k], `Sv.${L} ${k} bedeli tavanı aşmaz`);
  }
  ok('seviye bedeli tavanı 12. silonun %80 kapasitesinde kalır (seviye atlama yavaşlamaz)');
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
