// Harita ortak parçaları: bölge verisi, süre yazısı ve canlı durum kuralları (3B vadi ile 2B yedek harita aynı kuralları kullanır).
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: k => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: k => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { TOWN_ZONES, kaynakBolgeleri, sureYazisi, bolgeDurumlari } = await import('../js/ui/harita-ortak.js');

// Veri: her bölgenin tekil kimliği, konumu ve rengi var; konumlar harita içinde
{
  const kimlikler = new Set();
  for (const z of TOWN_ZONES) {
    assert.ok(!kimlikler.has(z.id), `tekil kimlik: ${z.id}`);
    kimlikler.add(z.id);
    assert.ok(z.px > 0 && z.px < 1 && z.py > 0 && z.py < 1 && z.pr > 0 && z.pr < 0.2, `${z.id} konumu`);
    assert.match(z.color, /^#[0-9a-f]{6}$/i);
    assert.ok(z.name && z.icon && z.sub, `${z.id} adı, simgesi ve açıklaması`);
  }
  // 6 hammadde bölgesinin hepsi haritada
  const bolgeler = kaynakBolgeleri();
  assert.equal(Object.keys(bolgeler).length, GAME_CONFIG.RESOURCE_KEYS.length);
  for (const b of Object.keys(bolgeler)) assert.ok(kimlikler.has(b), `hammadde bölgesi haritada: ${b}`);
  console.log(`✅ ${TOWN_ZONES.length} bölge, 6 hammadde bölgesi haritada`);
}

// Süre yazısı
assert.equal(sureYazisi(65), '01:05');
assert.equal(sureYazisi(3725), '1s 02d');
assert.equal(sureYazisi(-5), '00:00');
console.log('✅ süre yazısı');

// Durumlar
{
  const gs = new GameStateManager();
  const d = bolgeDurumlari(gs, ammMarket, GAME_CONFIG);
  for (const z of TOWN_ZONES) assert.ok(d[z.id] && typeof d[z.id].text === 'string', `${z.id} durumu var`);
  for (const b of Object.keys(kaynakBolgeleri())) {
    if (!d[b].locked) assert.match(d[b].text, /Boşta/, `${b} yeni oyuncuda boşta`);
  }
  assert.ok(d.market.locked || /ASTRA$/.test(d.market.text), 'pazar fiyatı ya da kilit nedeni');
  assert.equal(JSON.stringify(d).includes('NaN'), false, 'durumlarda NaN yok');
  assert.equal(JSON.stringify(d).includes('undefined'), false, 'durumlarda undefined yok');

  // Silo doluluğu 6 hammaddenin en doluluna bakar (eskiden yalnız odun/demir/buğday)
  const kap = gs.getWarehouseCapacity();
  gs.state.inventory.herb = kap.herb;
  gs.getFeatureLock = () => null;   // kural denemesi: kilit mesajı levhayı örtmesin
  const dolu = bolgeDurumlari(gs, ammMarket, GAME_CONFIG);
  assert.match(dolu.warehouse.text, /%100 dolu/);
  assert.equal(dolu.warehouse.tone, 'warn');
  console.log('✅ bölge durumları (silo 6 hammaddeye bakar)');
}

// Sefer durumları
{
  const gs = new GameStateManager();
  const bolge = Object.entries(kaynakBolgeleri()).find(([, k]) => k === 'wood')[0];
  gs.getFeatureLock = () => null;
  gs.state.activeExpeditions = { wood: { elapsedSeconds: 30, durationSeconds: 120, isCompleted: false } };
  assert.equal(bolgeDurumlari(gs, ammMarket, GAME_CONFIG)[bolge].text, '⏳ 01:30 · %25');
  gs.state.activeExpeditions = { wood: { elapsedSeconds: 120, durationSeconds: 120, isCompleted: true } };
  assert.equal(bolgeDurumlari(gs, ammMarket, GAME_CONFIG)[bolge].text, '✅ Hazır · topla');
  console.log('✅ sefer durumu: süre, yüzde, hazır');
}
