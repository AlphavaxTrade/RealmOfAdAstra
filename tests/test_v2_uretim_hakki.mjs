// v2 (7 Ekim 2026) — Üretim Hakkı: Sirius Çıkarma Kapasitesi, kişisel haftalık pay, termostat, ortak kasa %5
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

const R = GAME_CONFIG.RESOURCE_KEYS;
const U = GAME_CONFIG.URETIM_HAKKI;
const O = GAME_CONFIG.OTORITE;
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

// 1) Dünya kapasitesi = taban × Otorite çalışma dakikası × kota (0,40) × ağırlık toplamı (1) — config ile aynı
{
  fresh();
  const minutes = O.HOURS_BASE * 60 * O.DAYS_BASE;
  for (const k of R) {
    const expect = Math.floor(GAME_CONFIG.BASE_PRODUCTION[k] * minutes * U.QPP_START + 1e-6);
    assert.equal(globalPool.computeWeekCapacity(k), expect, `${k} haftalık kapasite formülden`);
    assert.equal(GAME_CONFIG.GLOBAL_RESOURCE_CAPS[k].totalCap, expect, `${k} config kapasitesi formülle aynı`);
    assert.equal(globalPool.state.resources[k].baseCap, expect, `${k} hafta tabanı`);
  }
  ok('Sirius kapasitesi: taban × 20 saat × 6 gün × kota 0,40 × ağırlık toplamı (config ile aynı)');
}

// 2) Oyuncu ağırlığı: seviye (1 + 0,025 × sv, en çok ×2) × katkı kademesi × aktiflik (ilk hafta 1)
{
  const gs = fresh();
  const w1 = gs.getUretimWeight();
  assert.ok(near(w1.levelFactor, 1 + U.LEVEL_WEIGHT_PER_LEVEL), 'Sv.1 seviye çarpanı');
  assert.equal(w1.tier.id, 'none');
  assert.equal(w1.activity, 1, 'Yeni oyuncu ilk hafta tam aktif sayılır');
  assert.ok(near(w1.weight, 1 + U.LEVEL_WEIGHT_PER_LEVEL, 1e-3));
  gs.state.level = 81;
  assert.ok(near(gs.getUretimWeight().levelFactor, U.LEVEL_WEIGHT_MAX), 'Seviye çarpanı ×2 ile sınırlı');
  gs.state.level = 1;
  // Geçen haftanın katkısı kademeyi belirler
  gs.state.contribution = { total: 600, week: 0, lastWeek: 600, epochId: globalPool.state.epochId, buyCredit: {} };
  const t = gs.getContributionTier();
  assert.equal(t.id, 'gold', '600 puan → Altın');
  assert.ok(near(gs.getUretimWeight().weight, (1 + U.LEVEL_WEIGHT_PER_LEVEL) * t.mult, 1e-3));
  // Aktiflik: 8 gün önce başlamış, son 7 günde 2 aktif gün → 2/7 (en az 0,25)
  gs.state.contribution = null;
  const DAY = 86400000, now = Date.now();
  gs.state.uretim = { epochId: globalPool.state.epochId, used: {}, since: now - 8 * DAY, activeDays: [Math.floor((now - DAY) / DAY), Math.floor((now - 3 * DAY) / DAY)] };
  assert.ok(near(gs.getUretimActivity(), Math.max(U.ACTIVITY_MIN, 2 / 7), 1e-9), 'Aktiflik = son 7 günde aktif gün / 7');
  gs.state.uretim.activeDays = [];
  assert.equal(gs.getUretimActivity(), U.ACTIVITY_MIN, 'Aktiflik tabanı 0,25');
  ok('Oyuncu ağırlığı: seviye × katkı kademesi × aktiflik');
}

// 3) Kişisel hak: haftalık = ağırlık × kişi başı pay; gün gün 1/7 açılır; dünya kapasitesiyle sınırlı
{
  const gs = fresh();
  const h = gs.getUretimHakki('wood');
  const perWeight = globalPool.weeklyRightPerWeight('wood');
  assert.equal(h.weekly, Math.floor(perWeight * gs.getUretimWeight().weight), 'Haftalık hak = ağırlık × kişi başı pay');
  assert.equal(h.released, Math.floor(h.weekly * (globalPool.getEpochDayIndex() + 1) / 7), 'Bugüne kadar açılan 1/7 adımlarıyla');
  assert.equal(h.used, 0);
  assert.ok(h.canTake <= globalPool.getResourceInfo('wood').availableToday, 'Dünya kapasitesi aşılamaz');
  assert.ok(h.canTake > 0);
  ok('Kişisel hak: haftalık pay, günlük açılış, dünya tavanı');
}

// 4) Hasat hakla sınırlanır; ortak kasa %5; hak dolunca mahsul seferde bekler; ertesi gün yeni hak
{
  const gs = fresh();
  // Haftanın 1. günü (1/7 açık) olarak sabitle: hak silodan küçük olsun ki sınırlayan hak olsun
  const realNow = globalPool.getTrustedTime.bind(globalPool);
  const start = globalPool.state.epochEndTime - 7 * 86400000 + 3600000;
  globalPool.getTrustedTime = () => start;
  const h0 = gs.getUretimHakki('wood');
  assert.equal(h0.dayIndex, 0);
  assert.ok(h0.canTake < gs.getWarehouseCapacity().wood - (gs.state.inventory.wood || 0), 'Hak silo boşluğundan küçük (sınırlayan hak)');
  const big = h0.canTake * 3; // hakkın 3 katı mahsul
  gs.state.activeExpeditions.wood = { nodeId: 'wood', durationMinutes: 18, durationSeconds: 1080, elapsedSeconds: 1080, isCompleted: true, claimedAmount: 0, ratePerMinute: big / 18 };
  const konseyToplam = () => (globalPool.getKonseyStock().wood || 0) + ((globalPool.getOtoriteStatus().progress.wood) || 0) + ((globalPool.getProjectStatus().progress.wood) || 0);
  const konsey0 = konseyToplam();
  const inv0 = gs.state.inventory.wood || 0;
  const r1 = gs.claimExpedition('wood');
  assert.ok(r1.success && r1.isQuotaWait, 'Hak kadar toplanır, kalanı bekler');
  const used1 = gs.getUretimHakki('wood').used;
  assert.ok(used1 <= h0.canTake && used1 >= h0.canTake - 2, `Kullanılan hak ≈ bugünkü hak (${used1} / ${h0.canTake})`);
  assert.equal(r1.harvestedAmount, gs.state.inventory.wood - inv0, 'Toplanan mahsulün tamamı siloya girdi');
  assert.equal(konseyToplam() - konsey0, r1.konseyShare, 'Ortak kasaya %5 girdi (stok + otomatik aktarılan yapı ilerlemesi)');
  assert.ok(near(r1.konseyShare, Math.floor(r1.harvestedAmount * O.COMMON_CHEST_RATE), 1), 'Ortak kasa payı çıkarılanın %5i');
  assert.ok(gs.state.activeExpeditions.wood, 'Sefer bekliyor');
  const r2 = gs.claimExpedition('wood');
  assert.equal(r2.success, false);
  assert.equal(r2.isQuotaWait, true, 'Hak dolunca toplanamaz');
  assert.match(r2.message, /Üretim Hakkın doldu/);
  // Ertesi gün: yeni 1/7 açılır
  globalPool.getTrustedTime = () => start + 86400000 + 1000;
  const h1 = gs.getUretimHakki('wood');
  assert.ok(h1.released > h0.released, 'Ertesi gün açılan hak büyür');
  const r3 = gs.claimExpedition('wood');
  assert.ok(r3.success, 'Yeni hakla toplama sürer');
  globalPool.getTrustedTime = realNow;
  ok('Hasat hakla sınırlı, ortak kasa %5, bekleyen mahsul ertesi gün toplanıyor');
}

// 5) Termostat: fiyat/açılış oranına göre kota ±%10, 0,05-1,0 arasında
{
  fresh();
  const prev = { ...globalPool.state, uretim: { ...globalPool.nextUretim(null), priceRatio: { wood: 1.5, iron: 0.5, wheat: 1.0 } } };
  const next = globalPool.nextUretim(prev.uretim);
  assert.ok(near(next.qpp.wood, Math.round(U.QPP_START * (1 + U.TERMO_STEP) * 1000) / 1000), 'Pahalı → kota +%10');
  assert.ok(near(next.qpp.iron, Math.round(U.QPP_START * (1 - U.TERMO_STEP) * 1000) / 1000), 'Ucuz → kota −%10');
  assert.ok(near(next.qpp.wheat, U.QPP_START), 'Açılışta → değişmez');
  let u = { ...globalPool.nextUretim(null), qpp: Object.fromEntries(R.map(k => [k, U.QPP_MAX])), priceRatio: { wood: 2 } };
  assert.equal(globalPool.nextUretim(u).qpp.wood, U.QPP_MAX, 'Üst sınır 1,0');
  u = { ...globalPool.nextUretim(null), qpp: Object.fromEntries(R.map(k => [k, U.QPP_MIN])), priceRatio: { wood: 0.1 } };
  assert.equal(globalPool.nextUretim(u).qpp.wood, U.QPP_MIN, 'Alt sınır 0,05');
  // Yeni hafta kapasitesi yeni kotayla
  const ep = globalPool.createNewEpoch(prev);
  assert.ok(near(ep.resources.wood.baseCap, Math.floor(globalPool.weeklyRightPerWeight('wood', globalPool.uretimParams(ep.uretim)))), 'Yeni hafta tabanı yeni kotayla');
  ok('Termostat: pahalı kaynakta kota artar, ucuzda azalır, sınırlar korunur');
}

// 6) Ağırlık toplamı değişince kapasite yeniden hesaplanır (çıkarılan ve yakılan korunur)
{
  fresh();
  globalPool.harvest('wood', 1000);
  globalPool.recordResourceBurn('wood', 500);
  const baseBefore = globalPool.state.resources.wood.baseCap;
  globalPool.setSumWeight(10);
  const after = globalPool.state.resources.wood;
  assert.equal(after.baseCap, globalPool.computeWeekCapacity('wood'), 'Taban 10 oyuncu ağırlığıyla');
  assert.equal(after.baseCap, baseBefore * 10);
  assert.equal(after.harvested, 1000, 'Çıkarılan korunur');
  assert.equal(after.totalCap, after.baseCap - 500, 'Yakılan korunur');
  assert.equal(after.remaining, after.totalCap - 1000);
  ok('Kapasite yeniden hesaplanıyor: ağırlık toplamı ×10 → taban ×10');
}

// 7) Hafta dönünce kullanılan hak sıfırlanır; fiyat anlık görüntüsü kaydedilir
{
  const gs = fresh();
  gs._recordUretimUse('wood', 100);
  assert.equal(gs.getUretimHakki('wood').used, 100);
  globalPool.state.epochId += 1;
  assert.equal(gs.getUretimHakki('wood').used, 0, 'Yeni haftada kullanılan hak sıfır');
  const ratios = gs.snapshotPriceRatios(true);
  assert.ok(ratios && near(ratios.wood, 1, 0.01), 'Açılış fiyatında oran 1');
  assert.ok(near(globalPool.state.uretim.priceRatio.wood, ratios.wood), 'Oran dünya durumuna yazıldı');
  ok('Hafta dönüşü ve fiyat anlık görüntüsü');
}

console.log(`\n${passed} Üretim Hakkı kontrolü geçti.`);
