// v2 — Yük İskelesi: Hazırlık Deposu (R6/F) ve Universe aşaması (R3)
// Aşama 0'da kapalı; aşama 1'de depoya koyma (kişi başı 4 haftalık Üretim Hakkı, dünya 10 M ASTRA değeri),
// %10 kesintiyle geri alma, hazırlık yüzdesi; sunucuda aşamayı yalnız yönetici değiştirir ve dünya görüntüsünde gelir.
import assert from 'node:assert/strict';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const { GameStateManager } = await import('../js/gameState.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');
const { GAME_CONFIG } = await import('../js/config.js');

const U = GAME_CONFIG.UZAY_LIMANI;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const fresh = () => {
  localStorage.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  const gs = new GameStateManager();
  gs.state.warehouseLevel = gs.getWarehouseMaxLevel();
  return gs;
};

// 1) Aşama 0: depo kapalı
{
  GAME_CONFIG.UNIVERSE_STAGE = 0;
  const gs = fresh();
  const st = gs.getPrepDepotStatus();
  assert.equal(st.open, false);
  gs.state.inventory.wood = 1000;
  const r = gs.depositToPrepDepot({ wood: 100 });
  assert.equal(r.success, false);
  assert.ok(/kapalı/.test(r.message));
  assert.equal(gs.state.inventory.wood, 1000, 'Hiçbir şey alınmadı');
  ok('Aşama 0: Hazırlık Deposu kapalı');
}

// 2) Aşama 1: koyma, sınırlar (kişi başı 4 haftalık hak), silodan düşme, dünya toplamı
{
  GAME_CONFIG.UNIVERSE_STAGE = 1;
  const gs = fresh();
  const st0 = gs.getPrepDepotStatus();
  assert.equal(st0.open, true);
  const woodRow = st0.rows.find(r => r.key === 'wood');
  assert.ok(near(woodRow.cap, Math.floor(gs.getUretimHakki('wood').weekly * U.PREP_DEPOT_WEEKS_CAP)), 'Sınır = 4 haftalık Üretim Hakkı');
  gs.state.inventory.wood = woodRow.cap + 500;
  const r = gs.depositToPrepDepot({ wood: woodRow.cap + 500 });
  assert.equal(r.success, true, r.message);
  assert.equal(r.put.wood, woodRow.cap, 'Sınırın üstü alınmaz');
  assert.equal(gs.state.inventory.wood, 500, 'Konan miktar silodan düştü');
  const st1 = gs.getPrepDepotStatus();
  assert.equal(st1.rows.find(x => x.key === 'wood').stored, woodRow.cap);
  assert.ok(near(st1.value, woodRow.cap * woodRow.price, 1e-3), 'Değer = miktar × fiyat');
  assert.ok(near(globalPool.getPrepDepotTotal(), st1.value, 1e-3), 'Dünya toplamına yazıldı');
  const again = gs.depositToPrepDepot({ wood: 10 });
  assert.equal(again.success, false, 'Sınır dolunca daha konamaz');
  ok('Aşama 1: koyma, kişi başı sınır, silodan düşme, dünya toplamı');
}

// 3) Dünya toplamı 10 M ASTRA değeri: yer kalmazsa konamaz
{
  GAME_CONFIG.UNIVERSE_STAGE = 1;
  const gs = fresh();
  globalPool.addPrepDepotValue(U.PREP_DEPOT_TOTAL_ASTRA);
  gs.state.inventory.iron = 100;
  const r = gs.depositToPrepDepot({ iron: 100 });
  assert.equal(r.success, false);
  assert.equal(gs.state.inventory.iron, 100);
  ok('Dünya toplamı dolunca depoya konamaz');
}

// 4) Geri alma: %10 kesinti yakılır, kalan siloya; dünya toplamı düşer
{
  GAME_CONFIG.UNIVERSE_STAGE = 1;
  const gs = fresh();
  gs.state.inventory.stone = 1000;
  const put = gs.depositToPrepDepot({ stone: 1000 });
  assert.equal(put.success, true);
  const burned0 = Number(globalPool.state.totalBurnedResources?.stone) || 0;
  const r = gs.withdrawFromPrepDepot('stone', 1000);
  assert.equal(r.success, true, r.message);
  assert.equal(r.fee, Math.ceil(1000 * U.PREP_DEPOT_CANCEL_FEE));
  assert.equal(r.back, 1000 - r.fee);
  assert.equal(gs.state.inventory.stone, 1000 - r.fee, 'Kesinti düşülmüş hali siloda');
  assert.equal(gs.getPrepDepotStatus().rows.find(x => x.key === 'stone').stored, 0);
  assert.ok(near(globalPool.getPrepDepotTotal(), 0, 1e-3), 'Dünya toplamı geri düştü');
  assert.ok((Number(globalPool.state.totalBurnedResources?.stone) || 0) - burned0 >= r.fee - 1e-6, 'Kesinti yakıldı');
  assert.equal(gs.withdrawFromPrepDepot('stone', 5).success, false, 'Boş depodan alınamaz');
  ok('Geri alma: %10 kesinti yakılır, kalan siloya');
}

// 5) Hazırlık yüzdesi: depo doluluğu %20 ağırlıkla sayılır
{
  GAME_CONFIG.UNIVERSE_STAGE = 1;
  const gs = fresh();
  const p0 = gs.getUniversePrepProgress();
  assert.ok(p0.pct >= 0 && p0.pct <= 100);
  assert.ok(near(p0.parts.depot, 0));
  for (const k of GAME_CONFIG.RESOURCE_KEYS) { const cap = gs.getPrepDepotStatus().rows.find(x => x.key === k).cap; gs.state.inventory[k] = cap; gs.depositToPrepDepot({ [k]: cap }); }
  const p1 = gs.getUniversePrepProgress();
  assert.ok(near(p1.parts.depot, 1, 1e-6), 'Depo tam dolu');
  assert.ok(p1.pct - p0.pct >= Math.round(U.PROGRESS_WEIGHTS.depot * 100) - 1, 'Yüzde depo ağırlığı kadar arttı');
  ok('Hazırlık yüzdesi depo doluluğunu sayar');
}

// 6) Sunucu: Universe aşamasını yalnız yönetici değiştirir; dünya görüntüsüyle oyuncuya gider; kayıt yeniden açılışta kalır
{
  GAME_CONFIG.UNIVERSE_STAGE = 0;
  const { openDb } = await import('../server/db.js');
  const { createEngine } = await import('../server/engine.js');
  const { createWorld } = await import('../server/world.js');
  const { createApp } = await import('../server/app.js');
  const { loadConfig } = await import('../server/config.js');
  const { createMailer } = await import('../server/mailer.js');
  const { createAccounts } = await import('../server/accounts.js');
  const cfg = { ...loadConfig({}), dbFile: ':memory:', adminToken: 'yonetici-test-anahtari-uzun-1234567890', serveDist: false, rateLimitPerSec: 1000, publicRateLimitPerSec: 1000, ipRateLimitPerSec: 1000, testMode: true };
  const db = openDb(':memory:');
  const engine = await createEngine(db, { testMode: true });
  const quiet = { log() {}, warn() {}, error() {} };
  const mailer = createMailer({ db, cfg, log: quiet });
  const accounts = createAccounts({ db, cfg, mailer, verifyMessage: () => '0x0' });
  const world = createWorld({ db, engine, chain: null, accounts, mailer, cfg, log: quiet });
  const app = createApp({ db, engine, world, accounts, chain: null, cfg, log: quiet });
  const server = app.server().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, token) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  try {
    const lastLink = kind => { const m = db.kvJson('dev:outbox', [])[0]; const r = new RegExp('[?&]' + kind + '=([a-f0-9]+)').exec(m ? m.text : ''); return r && r[1]; };
    await call('POST', '/api/account/register', { email: 'ayse@ornek.com', password: 'gizli-sifre-123' });
    const v = await call('POST', '/api/account/verify', { token: lastLink('verify') });
    const tok = v.body.token;
    assert.equal((await call('POST', '/api/admin/universe-stage', { stage: 1 })).status, 401, 'Yönetici anahtarı olmadan olmaz');
    assert.equal((await call('POST', '/api/admin/universe-stage', { stage: 7 }, cfg.adminToken)).status, 400, 'Geçersiz aşama');
    const s0 = await call('GET', '/api/state', null, tok);
    assert.equal(s0.body.world.universeStage, 0);
    const dep0 = await call('POST', '/api/action', { name: 'depositToPrepDepot', args: [{ wood: 10 }] }, tok);
    assert.equal(dep0.body.result.success, false, 'Aşama 0: sunucuda da kapalı');
    const set = await call('POST', '/api/admin/universe-stage', { stage: 1 }, cfg.adminToken);
    assert.equal(set.status, 200, JSON.stringify(set.body));
    const s1 = await call('GET', '/api/state', null, tok);
    assert.equal(s1.body.world.universeStage, 1, 'Dünya görüntüsünde aşama');
    const st = await call('GET', '/api/admin/status', null, cfg.adminToken);
    assert.equal(st.body.universeStage, 1);
    engine.mutatePlayer(v.body.playerId, gs => { gs.state.inventory.wood = 50; });
    const dep1 = await call('POST', '/api/action', { name: 'depositToPrepDepot', args: [{ wood: 10 }] }, tok);
    assert.equal(dep1.status, 200, JSON.stringify(dep1.body));
    assert.equal(dep1.body.result.success, true, dep1.body.result.message);
    assert.equal(dep1.body.player.hazirlikDepo.items.wood, 10, 'Depo kayıtta saklanır');
    assert.equal(dep1.body.player.inventory.wood, 40);
    const wd = await call('POST', '/api/action', { name: 'withdrawFromPrepDepot', args: ['wood', 10] }, tok);
    assert.equal(wd.body.result.success, true, wd.body.result.message);
    assert.equal(wd.body.player.inventory.wood, 49, '1 odun kesinti');
    // Yeniden açılış: aşama kv'den gelir
    const world2 = createWorld({ db, engine, chain: null, accounts, mailer, cfg, log: quiet });
    assert.equal(world2.universeStage(), 1, 'Aşama kayıttan okunur');
    ok('Sunucu: aşama yalnız yönetici, dünya görüntüsünde, kayıtta kalıcı; depo işlemleri sunucuda');
  } finally { server.close(); }
}

console.log(`\n${passed}/6 Hazırlık Deposu testi geçti`);
