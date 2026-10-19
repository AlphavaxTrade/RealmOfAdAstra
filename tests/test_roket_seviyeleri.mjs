// Roket planı (19 Ekim 2026, kullanıcı kararı): roket ROA'dan UOA'ya geçiş RAMPASIDIR. Roketini yapmayan UOA'ya geçemez; roket çok pahalıdır (1 yıl aktif oyun) ve KADEMELİ katkıyla inşa edilir;
// seviye 1-5: hız, taşıma kapasitesi (Hazırlık Deposu) ve mürettebat (köylü + asker) artar; fırlatma UOA açılana kadar kilitli.
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
const HAM = ['iron', 'coal', 'stone', 'wood'];
const yeni = () => {
  depo.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  gs.state.warehouseLevel = gs.getWarehouseMaxLevel();
  gs.state.level = U.ROCKET_MIN_LEVEL;
  gs.state.adAstraBalance = 1e9;
  return gs;
};
// Roketin o anki hedef seviyesinin bütün kalan bedelini envantere koyar (silo sınırı dışında: doğrudan yazılır)
const doldur = (gs) => {
  const st = gs.getRocketStatus();
  const rows = st.ready ? st.next.parts : st.build.rows;
  for (const r of rows) if (r.key !== 'adAstra') gs.state.inventory[r.key] = (gs.state.inventory[r.key] || 0) + r.remain;
};

// 1) Yapılandırma: 5 seviye, hız kısalır, taşıma + mürettebat artar, bedel hızla büyür; ilk roket "1 yıl aktif oyun" ölçeğinde
{
  const L = U.ROCKET_LEVELS;
  assert.equal(L.length, 5);
  for (let i = 1; i < L.length; i++) {
    assert.ok(L[i].travelHours < L[i - 1].travelHours, `seviye ${i + 1} daha hızlı`);
    assert.ok(L[i].cargo > L[i - 1].cargo && L[i].crew > L[i - 1].crew, `seviye ${i + 1} daha çok taşır`);
    assert.ok(L[i].parts > L[i - 1].parts && L[i].adAstra > L[i - 1].adAstra, `seviye ${i + 1} daha pahalı`);
  }
  assert.ok(U.ROCKET_MIN_LEVEL >= 10, 'roket için hesap seviyesi en az 10 (1 yıllık F2P)');
  // Bir hesabın yıllık çıkarma hakkı: seviye 10 civarı kişisel limit (haftalık) x 52. İlk roketin hammaddesi bunun en az yarısı kadar olmalı (1 yıl biriktirme).
  const gs = yeni(); gs.state.level = 10;
  for (const k of HAM) {
    const yillik = gs.getUretimHakki(k).weekly * 52;
    assert.ok(U.ROCKET_PARTS[k] >= yillik * 0.3 && U.ROCKET_PARTS[k] <= yillik * 1.2, `${k}: ilk roket (${U.ROCKET_PARTS[k]}) yıllık çıkarmanın (${yillik}) %30-120'si`);
  }
  assert.ok(U.ROCKET_PARTS.adAstra >= 100000, 'ilk roketin ASTRA bedeli büyük');
  ok('5 roket seviyesi: hız artar, taşıma + mürettebat artar, bedel hızla büyür, ilk roket yıllık çıkarma ölçeğinde');
}

// 2) İnşaat kademeli: hesap seviyesi şartı, kısmi katkı, kalan bedeli aşmaz, tamamlanınca roket hazır
{
  const gs = yeni();
  gs.state.level = U.ROCKET_MIN_LEVEL - 1;
  gs.state.inventory.iron = 1e6;
  assert.equal(gs.contributeToRocket({ iron: 1000 }).success, false, 'hesap seviyesi yetmiyor');
  gs.state.level = U.ROCKET_MIN_LEVEL;
  gs.state.inventory.iron = 600000;   // silo sınırı: katkı için yalnız elindeki
  const bak = gs.state.adAstraBalance;
  let r = gs.contributeToRocket({ iron: 500000, adAstra: 100000 });
  assert.equal(r.success, true, r.message);
  assert.equal(r.completed, false);
  let st = gs.getRocketStatus();
  assert.equal(st.ready, false);
  const demir = st.build.rows.find((x) => x.key === 'iron');
  assert.equal(demir.done, 500000);
  assert.equal(gs.state.inventory.iron, 100000, 'katkı envanterden düşer (yakılır)');
  assert.equal(Math.round(bak - gs.state.adAstraBalance), 100000, 'ASTRA bedeli harcanır');
  // kalan bedeli aşamaz
  gs.state.inventory.iron = 5e6;
  r = gs.contributeToRocket({ iron: 5e6 });
  assert.equal(gs.getRocketStatus().build.rows.find((x) => x.key === 'iron').done, U.ROCKET_PARTS.iron, 'demir bedeli doldu, fazlası alınmadı');
  assert.equal(gs.state.inventory.iron, 5e6 - (U.ROCKET_PARTS.iron - 500000), 'yalnız kalan demir alındı');
  assert.equal(gs.getRocketStatus().ready, false, 'diğer kalemler eksik: roket hazır değil');
  // kalanları doldur
  doldur(gs);
  r = gs.contributeToRocket(Object.fromEntries([...HAM.map((k) => [k, 1e9]), ['adAstra', 1e9]]));
  assert.equal(r.success, true, r.message);
  assert.equal(r.completed, true, 'hepsi dolunca roket tamamlanır');
  st = gs.getRocketStatus();
  assert.equal(st.ready, true);
  assert.equal(st.rocketLevel, 1);
  assert.equal(st.spec.crew, U.ROCKET_LEVELS[0].crew);
  assert.equal(gs.buildRocket().success, false, 'ikinci roket yok');
  ok('roket kademeli inşa edilir: seviye şartı, kısmi katkı, kalan bedeli aşmaz, dolunca tamamlanır');
}

// 3) Seviye seviye yükselt (hepsi katkıyla); en üstte durur; ASTRA bedeli artar
{
  const gs = yeni();
  doldur(gs); gs.contributeToRocket(Object.fromEntries([...HAM.map((k) => [k, 1e9]), ['adAstra', 1e9]]));
  assert.equal(gs.getRocketStatus().rocketLevel, 1);
  for (let lv = 2; lv <= 5; lv++) {
    const once = gs.getRocketStatus();
    assert.equal(once.next.spec.level, lv);
    const bak = gs.state.adAstraBalance;
    doldur(gs);
    const r = gs.upgradeRocket();
    assert.equal(r.success, true, r.message);
    const st = gs.getRocketStatus();
    assert.equal(st.rocketLevel, lv, `seviye ${lv}`);
    assert.ok(bak - gs.state.adAstraBalance >= U.ROCKET_LEVELS[lv - 1].adAstra - 1, `seviye ${lv}: ASTRA bedeli ödendi`);
    assert.equal(st.spec.travelHours, U.ROCKET_LEVELS[lv - 1].travelHours);
  }
  assert.equal(gs.upgradeRocket().success, false, 'en üst seviyede yükseltme yok');
  assert.equal(gs.getRocketStatus().next, null);
  ok('roket seviye 1 → 5 yükseltilir; en üstte durur');
}

// 4) Mürettebat: roketin kapasitesi kadar köylü + asker; elindekini aşamaz
{
  const gs = yeni();
  assert.equal(gs.setRocketCrew(1, 0).success, false, 'roket yokken mürettebat seçilemez');
  doldur(gs); gs.contributeToRocket(Object.fromEntries([...HAM.map((k) => [k, 1e9]), ['adAstra', 1e9]]));
  gs._village().villagers = 50;
  gs.state.soldierUnits = []; for (let i = 0; i < 3; i++) gs.buySoldierUnit();
  const cap = U.ROCKET_LEVELS[0].crew;
  assert.equal(gs.setRocketCrew(51, 0).success, false, 'elindeki köylüden fazlası seçilemez');
  assert.equal(gs.setRocketCrew(0, gs.state.soldierUnits.length + 1).success, false, 'elindeki askerden fazlası seçilemez');
  assert.equal(gs.setRocketCrew(cap, 1).success, false, 'kapasiteyi aşamaz');
  gs._village().villagers = Math.max(gs._village().villagers, cap + 5);
  const as = gs.state.soldierUnits.length;
  assert.ok(as >= 1, 'en az bir asker alındı');
  const r = gs.setRocketCrew(cap - as, as);
  assert.equal(r.success, true, r.message);
  assert.equal(gs.getRocketStatus().crew.total, cap);
  ok('mürettebat (köylü + asker) roketin kapasitesiyle sınırlı');
}

// 5) UOA pasaportu: roketi olmayan geçemez; roketi olanın bilgileri
{
  const gs = yeni();
  let p = gs.getUoaPassport();
  assert.equal(p.allowed, false);
  assert.match(p.reason, /Roketini yapmayan/);
  doldur(gs); gs.contributeToRocket(Object.fromEntries([...HAM.map((k) => [k, 1e9]), ['adAstra', 1e9]]));
  p = gs.getUoaPassport();
  assert.equal(p.allowed, true);
  assert.equal(p.rocketLevel, 1);
  assert.equal(p.cargoCap, U.ROCKET_LEVELS[0].cargo);
  assert.equal(p.crewCap, U.ROCKET_LEVELS[0].crew);
  assert.equal(p.universeOpen, false, 'UOA açılana kadar fırlatma kilitli');
  ok('UOA pasaportu: roketi olmayan geçemez, roketi olanın seviyesi, taşıma ve mürettebatı yazılı');
}

// 6) Hazırlık Deposu: yük roketle taşınır (roket şart, toplam yük taşıma kapasitesini aşamaz)
{
  const prev = C.UNIVERSE_STAGE;
  C.UNIVERSE_STAGE = 1;
  const gs = yeni();
  gs.state.inventory.wood = 1000;
  const bak = gs.depositToPrepDepot({ wood: 100 });
  assert.equal(bak.success, false, 'roketsiz yük konmaz');
  assert.match(bak.message, /roketini yap/);
  doldur(gs); gs.contributeToRocket(Object.fromEntries([...HAM.map((k) => [k, 1e9]), ['adAstra', 1e9]]));
  const dp = gs.getPrepDepotStatus();
  assert.equal(dp.cargoCap, U.ROCKET_LEVELS[0].cargo);
  gs.state.inventory.wood = 1000;
  assert.equal(gs.depositToPrepDepot({ wood: 100 }).success, true, 'roket varken yük konur');
  assert.equal(gs.getPrepDepotStatus().cargoUsed, 100);
  C.UNIVERSE_STAGE = prev;
  ok('Hazırlık Deposu: yük roketle taşınır (roket şart, taşıma kapasitesiyle sınırlı)');
}

// 7) Hızlı katkı: ASTRA bütçesi pazardan hammadde alıp roket inşaatına yatırır
{
  const gs = yeni();
  for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) gs.state.inventory[k] = 0;
  const bak = gs.state.adAstraBalance;
  const plan = gs.rocketHizliPlan(200000);
  assert.equal(plan.ok, true, plan.reason);
  const r = gs.rocketHizliKatki(200000);
  assert.equal(r.success, true, r.message);
  assert.ok(r.spent > 0 && r.spent <= 200000 + 1, `bütçe aşılmadı (${r.spent})`);
  assert.ok(bak - gs.state.adAstraBalance >= r.spent - 1, 'ASTRA düştü');
  const st = gs.getRocketStatus();
  assert.ok(st.build.pct > 0, `inşaat ilerledi (%${st.build.pct})`);
  assert.ok(st.build.rows.filter((x) => x.key !== 'adAstra').some((x) => x.done > 0), 'hammadde yatırıldı');
  assert.equal(st.build.rows.find((x) => x.key === 'adAstra').done, 0, 'ASTRA bedeli ayrıca yatırılır');
  ok('roket hızlı katkı: bütçe pazardan hammadde alır ve hemen yatırır');
}

console.log(`\n${n} roket rampası kontrolü geçti.`);
