// Konsey "hızlı katkı" (19 Ekim 2026): ASTRA bütçesiyle eksik hammaddeler pazardan alınıp Otorite'ye / etkin projeye yatırılır.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const yeni = () => {
  depo.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  const gs = new GameStateManager();
  gs.state.warehouseLevel = gs.getWarehouseMaxLevel();
  gs.state.adAstraBalance = 5e6;
  return gs;
};
const doluluk = (st) => Object.values(st.progress).reduce((s, v) => s + v, 0);

// 1) Plan: bütçe kalan ihtiyaca değer ağırlığıyla bölünür, toplam bütçeyi aşmaz
{
  const gs = yeni();
  const plan = gs.konseyHizliPlan('otorite', 100000);
  assert.equal(plan.ok, true);
  assert.ok(plan.items.length >= 5, 'altı hammaddenin çoğu planda');
  assert.ok(plan.total <= 100000, `plan bütçeyi aşmaz (${plan.total})`);
  assert.ok(plan.total > 70000, `bütçenin çoğu kullanılır (${plan.total})`);
  ok('plan: bütçe kalan ihtiyaca bölünür ve aşılmaz');
}

// 2) Otorite'ye hızlı katkı: ASTRA düşer, ilerleme artar, envanter değişmez (hepsi yatırılır), katkı puanı yazılır
{
  const gs = yeni();
  const once = { ...gs.state.inventory };
  const bak0 = gs.state.adAstraBalance;
  const st0 = doluluk(globalPool.getOtoriteStatus());
  const r = gs.konseyHizliKatki('otorite', 200000);
  assert.equal(r.success, true, r.message);
  assert.ok(r.spent > 100000 && r.spent <= 200000, `bütçe içinde harcandı (${r.spent})`);
  assert.ok(Math.abs((bak0 - gs.state.adAstraBalance) - r.spent) < 1, 'bakiye harcanan kadar düştü');
  assert.ok(doluluk(globalPool.getOtoriteStatus()) > st0, 'Otorite ilerledi');
  for (const k of Object.keys(once)) assert.ok(Math.abs((gs.state.inventory[k] || 0) - (once[k] || 0)) < 1e-6 + 1, `${k}: alınan hammadde envanterde kalmadı`);
  assert.ok(gs.getContributionInfo().week >= 0);
  ok('Otorite hızlı katkı: ASTRA harcandı, ilerleme arttı, envanter değişmedi');
}

// 3) Proje'ye hızlı katkı + geçersiz girdiler
{
  const gs = yeni();
  const r = gs.konseyHizliKatki('proje', 150000);
  assert.equal(r.success, true, r.message);
  assert.ok(doluluk(globalPool.getProjectStatus()) > 0, 'proje ilerledi');
  assert.equal(gs.konseyHizliKatki('baska', 100).success, false);
  assert.equal(gs.konseyHizliKatki('otorite', 0).success, false);
  assert.equal(gs.konseyHizliKatki('otorite', -5).success, false);
  const fakir = yeni(); fakir.state.adAstraBalance = 0;
  assert.equal(fakir.konseyHizliKatki('otorite', 100).success, false, 'ASTRA yoksa katkı yok');
  ok('proje hızlı katkı çalışır; geçersiz hedef, sıfır / eksi / yok bakiye reddedilir');
}

// 4) Çok büyük bütçe fiyatı tavana taşır ama koridoru aşmaz; bütçe bitmeden duran tur sonsuz döngüye girmez
{
  const gs = yeni();
  gs.state.adAstraBalance = 5e7;
  const r = gs.konseyHizliKatki('proje', 5e7);
  assert.ok(r.success, r.message);
  for (const k of ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb']) assert.ok(ammMarket.getPrice(k) <= ammMarket.getCorridor(k).maxPriceAda * 1.0001, `${k} fiyatı koridor tavanını aşmadı`);
  ok('büyük bütçede fiyat koridor tavanında kalır, döngü biter');
}

// 5) Katkı durumu görünür: hızlı katkı puan yazar, kademe geçen haftaya bakar, hafta sonunda olacak kademe gösterilir, mesaj ne kazandığını söyler
{
  const gs = yeni();
  const s0 = gs.getContributionStanding();
  assert.equal(s0.week, 0);
  assert.equal(s0.atWeekEnd.id, 'none');
  const r = gs.konseyHizliKatki('otorite', 1000);
  assert.equal(r.success, true, r.message);
  const s = gs.getContributionStanding();
  assert.ok(s.week > 200, `1000 ASTRA ~290 puan yazar (${s.week})`);
  assert.equal(s.now.id, 'none', 'şu anki kademe geçen haftaya bakar, hemen değişmez');
  assert.equal(s.atWeekEnd.id, 'silver', 'hafta dönümünde Gümüş olacak');
  assert.ok(s.next && s.next.name === 'Altın' && s.next.need > 0, 'sıradaki kademe ve kalan puan');
  assert.match(r.message, /Katkı puanı \+\d+/, 'mesaj kazanılan puanı söyler');
  assert.match(r.message, /Gümüş olacak/, 'mesaj kademenin ne zaman işleyeceğini söyler');
  assert.match(r.message, /Şu an %0,0\d+ dolu/, 'küçük ilerleme %0 diye yuvarlanmaz');
  ok('katkı durumu: puan, şimdiki / hafta sonu kademesi ve sıradaki eşik görünür');
}

console.log(`\n${n} Konsey hızlı katkı kontrolü geçti.`);
