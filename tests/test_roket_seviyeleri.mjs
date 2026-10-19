// Roket seviyeleri (19 Ekim 2026): roket Realm'dan UOA'ya geçiş rampasıdır; seviye 1-5, hız / taşıma / mürettebat artar, bedel çok pahalıdır, fırlatma UOA açılana kadar kilitli.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG: C } = await import('../js/config.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const U = C.UZAY_LIMANI;
const yeni = () => {
  depo.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  gs.state.warehouseLevel = gs.getWarehouseMaxLevel();
  gs.state.level = U.ROCKET_MIN_LEVEL;
  gs.state.adAstraBalance = 1e8;
  return gs;
};
const doldur = (gs, carp) => {
  for (const [k, v] of Object.entries(U.ROCKET_PARTS)) if (k !== 'adAstra') gs.state.inventory[k] = v * carp + 1;
};

// 1) Yapılandırma: 5 seviye, hız kısalır, taşıma ve mürettebat artar, bedel hızla büyür
{
  const L = U.ROCKET_LEVELS;
  assert.equal(L.length, 5);
  for (let i = 1; i < L.length; i++) {
    assert.ok(L[i].travelHours < L[i - 1].travelHours, `seviye ${i + 1} daha hızlı`);
    assert.ok(L[i].cargo > L[i - 1].cargo && L[i].crew > L[i - 1].crew, `seviye ${i + 1} daha çok taşır`);
    assert.ok(L[i].parts > L[i - 1].parts && L[i].adAstra > L[i - 1].adAstra, `seviye ${i + 1} daha pahalı`);
  }
  assert.ok(L[4].parts * U.ROCKET_PARTS.iron <= 12000000, 'en pahalı seviye bile en üst siloya sığar (demir)');
  ok('5 roket seviyesi: hız artar, taşıma + mürettebat artar, bedel hızla büyür, en üst siloya sığar');
}

// 2) Yap, sonra seviye seviye yükselt; eksik malzemede reddedilir; en üstte durur
{
  const gs = yeni();
  assert.equal(gs.upgradeRocket().success, false, 'roket yokken yükseltilemez');
  doldur(gs, 1);
  assert.equal(gs.buildRocket().success, true);
  let st = gs.getRocketStatus();
  assert.equal(st.rocketLevel, 1);
  assert.equal(st.spec.crew, U.ROCKET_LEVELS[0].crew);
  assert.equal(gs.buildRocket().success, false, 'ikinci roket yok');
  for (let lv = 2; lv <= 5; lv++) {
    const eksik = gs.upgradeRocket();
    assert.equal(eksik.success, false, `seviye ${lv}: malzeme yokken reddedilir`);
    doldur(gs, U.ROCKET_LEVELS[lv - 1].parts);
    const bak0 = gs.state.adAstraBalance;
    const r = gs.upgradeRocket();
    assert.equal(r.success, true, r.message);
    assert.equal(gs.getRocketStatus().rocketLevel, lv);
    assert.ok(Math.abs((bak0 - gs.state.adAstraBalance) - U.ROCKET_LEVELS[lv - 1].adAstra) < 1e-6, `seviye ${lv} ASTRA bedeli düştü`);
  }
  st = gs.getRocketStatus();
  assert.equal(st.next, null, 'en üstte sıradaki seviye yok');
  assert.equal(gs.upgradeRocket().success, false, 'en üst seviyeden öteye geçilmez');
  assert.equal(st.launchOpen, false, 'UOA kapalıyken fırlatma kilitli');
  assert.match(st.launchReason, /UOA/);
  ok('roket yapılır, seviye 2-5 yükseltilir (malzeme + ASTRA düşer), en üstte durur, fırlatma kilitli');
}

// 3) Mürettebat: köylü + asker toplamı; seviye taşıma sınırını belirler; seviye kayıtla kalıcı
{
  const gs = yeni();
  doldur(gs, 1); gs.buildRocket();
  gs.state.soldierUnits = Array.from({ length: 4 }, (_, i) => gs.createSoldierUnit(i + 1));
  const st = gs.getRocketStatus();
  assert.ok(st.crewNow >= 4 + 10 - 1, 'köylü + asker sayılır');
  assert.equal(st.crewFits, Math.min(st.crewNow, 10), 'seviye 1 en çok 10 kişi taşır');
  gs.saveState();
  const gs2 = new GameStateManager();
  assert.equal(gs2.getRocketStatus().rocketLevel, 1, 'seviye kayıttan geri gelir');
  ok('mürettebat köylü + asker; seviye kalıcı');
}

// 4) Hızlı al planı sıradaki seviyenin eksiğini çıkarır
{
  const gs = yeni();
  doldur(gs, 1); gs.buildRocket();
  for (const k of Object.keys(gs.state.inventory)) if (k !== 'fragments') gs.state.inventory[k] = 0;
  const plan = gs.getQuickBuyPlan('rocketup');
  assert.ok(plan.items.length >= 3, 'eksik hammaddeler listelendi');
  assert.ok(plan.extraAda === U.ROCKET_LEVELS[1].adAstra, 'seviye 2 ASTRA bedeli işin kendi bedeli olarak eklendi');
  ok('hızlı al planı sıradaki seviyeyi hesaplar');
}

console.log(`\n${n} roket seviyesi kontrolü geçti.`);
