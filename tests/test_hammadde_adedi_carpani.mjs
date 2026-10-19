// Hammadde adedi x50 (19 Ekim 2026, kullanıcı kararı): pazar fiyatları aynı, oyundaki her hammadde miktarı (üretim, silo, bedeller, ev, Konsey, başlangıç envanteri) 50 kat.
// Hesabı ASTRA ile hemen fullemek isteyen birkaç balina hammadde fiyatını tavana taşımalı, Konsey'i tek başına bitirememeli; ücretsiz oyuncunun hızı değişmemeli.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GAME_CONFIG: C, HAMMADDE_ADEDI_CARPANI: Q } = await import('../js/config.js');
const { GameStateManager } = await import('../js/gameState.js');
const { AMMMarketEngine } = await import('../js/ammMarket.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const HAM = ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb'];
const yeniPazar = () => { depo.clear(); return new AMMMarketEngine(); };
const yeniOyun = () => { depo.clear(); return new GameStateManager(); };

// 1) Çarpan ve ölçeklenen alanlar; fiyatlar ve ASTRA tohumu AYNI
{
  assert.equal(Q, 50);
  const eski = { wheat: 9, stone: 6, wood: 5.4, coal: 4.5, iron: 3.6, herb: 1.2 };
  const fiyat = { wheat: 0.009, stone: 0.012, wood: 0.025, coal: 0.018, iron: 0.04, herb: 0.08 };
  for (const k of HAM) {
    assert.ok(Math.abs(C.BASE_PRODUCTION[k] - eski[k] * Q) < 1e-9, `${k} üretimi x${Q}`);
    assert.ok(Math.abs(C.GLOBAL_RESOURCE_CAPS[k].ratePerMinute - eski[k] * Q) < 1e-9, `${k} sefer hızı x${Q}`);
    const kor = C.AMM_CORRIDORS[k];
    assert.equal(kor.defaultPriceAda, fiyat[k], `${k} pazar fiyatı değişmedi`);
    assert.ok(Math.abs(kor.minPriceAda / kor.defaultPriceAda - 0.5) < 1e-9 && Math.abs(kor.maxPriceAda / kor.defaultPriceAda - 5) < 1e-9, `${k} koridor 0,5x-5x`);
  }
  assert.equal(C.WAREHOUSE.initialCapacities.wheat, 540 * Q);
  assert.equal(C.WAREHOUSE.maxCapacities.wheat, 73500 * Q);
  assert.equal(C.STARTING_PROFILE.inventory.wheat, 80 * Q);
  assert.equal(C.KOY.HOUSE_BASE_COST.wood, 400 * Q);
  assert.equal(C.WHEAT_PER_STAMINA, Q);
  assert.equal(C.AMM_SEED_ASTRA.raw, 90000000, 'pazar ASTRA tohumu aynı');
  const m = yeniPazar();
  assert.ok(Math.abs(m.getPrice('wheat') - 0.009) < 1e-6, 'buğday pazarda hâlâ 0,009 ASTRA');
  assert.ok(Math.abs(m.pools.wheat.resourceReserve - 90000000 * 0.1330 / 0.009) < 1e8, 'havuzdaki buğday adedi eskisi gibi (~1,3 milyar)');
  ok('hammadde adetleri x50, fiyatlar ve havuzlar aynı, koridor 0,5x-5x');
}

// 2) Ücretsiz oyuncunun hızı değişmez: 1->2 seviye bedelinin ASTRA payı eski ölçekte (15,8 ASTRA), hammadde x50, ev/silo oranları aynı
{
  const gs = yeniOyun();
  const r = gs.getNextLevelRequirement();
  assert.ok(Math.abs(r.adAstra - 15.79) < 0.1, `1->2 seviye ASTRA payı eski ölçekte (${r.adAstra})`);
  assert.equal(r.costs.wheat, 12150, '1->2 buğday bedeli 243 x50');
  const silo1 = gs.getWarehouseCapacity(1);
  assert.ok(r.costs.wheat <= silo1.wheat && r.costs.iron <= silo1.iron, 'ilk seviye bedeli ilk siloya sığar (oran korunmuş)');
  const u = gs.getWarehouseUpgradeCost(1);
  assert.equal(u.costs.wheat, Math.floor(silo1.wheat * 0.7));
  ok('yeni oyuncunun ilk adımları aynı oranda: seviye bedeli ilk siloya sığar, ASTRA payı eski');
}

// 3) Balina senaryosu: bir hesabın tam gelişimi (seviye 80, silo 49, 11 ev, teçhizat 10) kadar hammaddeyi pazardan alan ilk balina yaklaşık 6 dolar öder
//    (6 M ASTRA = 1 dolar), ikincisi fiyatı tavana taşır, üçüncüsü neredeyse hiçbir şey alamaz (arz tükenir: gerisini ücretsiz oyuncular satar)
{
  const gs = yeniOyun();
  const tam = Object.fromEntries(HAM.map((k) => [k, 0]));
  const ekle = (c) => { for (const k of HAM) tam[k] += Number((c || {})[k] || 0); };
  for (let L = 1; L <= 80; L++) { gs.state.level = L; ekle(gs.getNextLevelRequirement().costs); }
  for (let L = 1; L < gs.getWarehouseMaxLevel(); L++) { const u = gs.getWarehouseUpgradeCost(L); if (u) ekle(u.costs); }
  for (let h = 2; h <= 12; h++) ekle(gs.getHouseCost(h));
  for (const slot of ['weapon', 'armor', 'helmet', 'boots', 'shield']) {
    for (let l = 1; l < C.EQUIPMENT_MAX_LEVEL; l++) {
      const u = gs.calculateEquipmentUpgradeCost({ slot, level: l, baseAtk: 25, baseHp: 0, durability: 13, maxDurability: 13, name: 'x' });
      tam.wood += u.woodCost || 0; tam.iron += u.ironCost || 0;
    }
  }
  assert.ok(tam.wheat > 5e8 && tam.wheat < 6e8, `bir hesabın tam gelişimi ~537 M buğday (${Math.round(tam.wheat)})`);

  const m = yeniPazar();
  const acilis = Object.fromEntries(HAM.map((k) => [k, m.getPrice(k)]));
  const balina = () => {
    let maliyet = 0, alinamayan = 0, istenen = 0;
    for (const k of HAM) {
      let kalan = tam[k]; istenen += tam[k];
      while (kalan > 0) {
        const q = Math.min(kalan, Math.max(1, Math.floor(m.getSingleTradeCap(k) / 1.03)));
        const tahmin = m.getEstimatedCostForBuy(k, q);
        const r = m.executeBuyAmount(k, q);
        if (!r || !r.success) { alinamayan += kalan; break; }
        maliyet += tahmin; kalan -= q;
      }
    }
    return { maliyet, alinamayan, istenen };
  };
  const b1 = balina();
  assert.equal(b1.alinamayan, 0, 'ilk balina istediğinin hepsini alır');
  const dolar1 = b1.maliyet / 6e6;
  assert.ok(dolar1 > 3 && dolar1 < 12, `tek hesabın tam gelişimi birkaç dolar (${dolar1.toFixed(2)} $)`);
  const b2 = balina();
  assert.ok(HAM.every((k) => m.getPrice(k) / acilis[k] >= 3.5), 'iki balinadan sonra hammadde fiyatları açılışın 3,5 katından fazla (tavan 5x)');
  const b3 = balina();
  assert.ok(b3.alinamayan / b3.istenen > 0.8, `üçüncü balinanın isteğinin %80'inden fazlası alınamaz (arz tükendi): ${(b3.alinamayan / b3.istenen * 100).toFixed(0)}%`);
  assert.ok(b2.maliyet > b1.maliyet * 0.8, 'ikinci balina da yüksek fiyattan öder');
  ok(`1. balina ${dolar1.toFixed(1)} $, 2. balina fiyatı tavana taşır, 3. balina alamaz (arz tükendi)`);
}

// 4) Konsey: tek kişi pazardan alarak tüm projeleri bitiremez (toplam proje birimi, tavana kadar alınabilecek toplam hammaddeden fazla)
{
  const m = yeniPazar();
  const enFazla = HAM.reduce((s, k) => {
    const h = m.pools[k], tavan = C.AMM_CORRIDORS[k].maxPriceAda;
    return s + (h.resourceReserve - Math.sqrt(h.adAstraReserve * h.resourceReserve / tavan));
  }, 0);
  const projeler = C.KONSEY_PROJELERI.reduce((s, p) => s + p.units, 0);
  assert.equal(C.OTORITE.BASE_UNITS, 400000000, 'Otorite 1. seviye 8 M x50');
  assert.ok(C.KONSEY_PROJELERI.every((p) => p.units === 1200000000), 'her proje 24 M x50');
  assert.ok(projeler > enFazla, `5 proje (${projeler.toLocaleString('tr-TR')} birim) pazarın tavana kadar verebileceğinden (${Math.round(enFazla).toLocaleString('tr-TR')}) fazla: Konsey ortak iştir`);
  ok('Konsey projeleri pazardan tek kişiyle bitirilemez');
}

// 5) Gelişim bedelinin ASTRA payı ve katkı puanı eski ölçekte (hammadde pazar değeri ÷ 50)
{
  const m = yeniPazar();
  const kaynak = { wood: 5000, iron: 2000 };
  const deger = m.calculateResourcesAdAstraValue(kaynak).totalAda;
  assert.ok(Math.abs(m.calculateResourcesCostAdAstra(kaynak).totalAda - deger / Q) < 0.002);
  ok('ASTRA payı = pazar değeri ÷ 50');
}

console.log(`\n${n} hammadde adedi çarpanı kontrolü geçti.`);
