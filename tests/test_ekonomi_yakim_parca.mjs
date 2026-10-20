// Ekonomi panosu "Yakılan hammaddeler": teçhizat parçası da görünür (20 Ekim 2026 geri bildirimi: parçalar listede yoktu)
import assert from 'node:assert/strict';
const depo = new Map();
globalThis.localStorage = { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: (k) => { depo.delete(k); } };
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { globalPool } = await import('../js/globalPool.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { treasury } = await import('../js/treasury.js');
const ekran = await import('../js/ui/ekran/index.js');

ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
const gs = new GameStateManager();
gs.state.level = 12; gs.state.adAstraBalance = 1e6; gs.state.warehouseLevel = 6;
gs.state.inventory.fragments = 50; gs.state.inventory.iron = 5000; gs.state.inventory.wood = 5000; gs.state.inventory.coal = 5000;
const b = { gameState: gs, GAME_CONFIG, globalPool, ammMarket, treasury, online: { active: false }, bildir() {}, hudYenile() {}, kilit: () => null };
const govde = () => ekran.ekranlar().find((e) => e.id === 'ekonomi').govde(b, { sekme: 'genel' });
const yakimBolumu = (html) => { const m = html.match(/<details[^>]*data-k="yakim"[^>]*>([\s\S]*?)<\/details>/); assert.ok(m, 'yakılan bölümü var'); return m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '); };

const once = yakimBolumu(govde());
assert.match(once, /Teçhizat parçası\s*0/i, 'parça satırı var, 0 yakılmış');
const r = gs.craftEquipment('boots');
assert.ok(r.success, r.message);
const sonra = yakimBolumu(govde());
const yakilan = Number((sonra.match(/Teçhizat parçası\s*([\d.]+)/i) || [])[1].replace(/\./g, ''));
assert.ok(yakilan >= 1, `dövme parçayı yaktı ve panoda görünüyor: ${sonra}`);
assert.equal(yakilan, (globalPool.state.totalBurnedItems || {}).fragments, 'gösterilen sayı havuz kaydıyla aynı');
console.log('✅ yakılan parçalar Ekonomi panosunda');
console.log('\n1 ekonomi yakım kontrolü geçti.');
