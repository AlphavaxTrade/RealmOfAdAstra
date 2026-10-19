// Teçhizat yükseltme ASTRA bedeli (20 Ekim 2026): hammaddenin pazar değeri x seviyeye bağlı çarpan; ham madde adetleri değişmez (silo kapasitesine sığma kuralı).
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: (k) => { depo.delete(k); } };
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');
ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
const gs = new GameStateManager();
gs.state.level = 60;
const tarif = GAME_CONFIG.EQUIPMENT_RECIPES.weapon;
const AC = GAME_CONFIG.EQUIPMENT_UPGRADE_ASTRA;
const maliyet = (sv) => gs.calculateEquipmentUpgradeCost({ slot: 'weapon', level: sv - 1, baseAtk: tarif.baseAtk, baseHp: 0 });

let onceki = 0;
let toplam = 0;
for (let sv = 2; sv <= 10; sv++) {
  const c = maliyet(sv);
  const ham = ammMarket.calculateResourcesCostAdAstra({ wood: c.woodCost, iron: c.ironCost, coal: c.coalCost, stone: c.stoneCost }).totalAda;
  const beklenen = ham * AC.BASE * Math.pow(AC.GROWTH, sv - 2);
  assert.ok(Math.abs(c.adAstraCost - beklenen) <= Math.max(0.002, beklenen * 1e-6), `sv ${sv}: ASTRA bedeli = hammadde değeri x çarpan (${c.adAstraCost} / ${beklenen})`);
  assert.ok(c.adAstraCost > onceki, `sv ${sv}: bedel her basamakta artar`);
  onceki = c.adAstraCost;
  toplam += c.adAstraCost;
}
assert.ok(maliyet(2).adAstraCost < 200, 'ilk basamak yeni oyuncu için ucuz kalır');
assert.ok(toplam > 250000 && toplam < 400000, `1→10 toplam ASTRA ~320 bin (${Math.round(toplam)})`);
console.log('✅ teçhizat yükseltme ASTRA bedeli: çarpan, artış, toplam');
console.log('\n1 teçhizat ASTRA bedeli kontrolü geçti.');
