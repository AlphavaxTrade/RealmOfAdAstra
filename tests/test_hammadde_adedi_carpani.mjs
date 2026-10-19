// Hammadde talebi x50, arzı x5 (19 Ekim 2026, kullanıcı kararı): pazar fiyatları aynı; geliştirme bedelleri ve en üst silo 50 kat, oyuncunun çıkardığı hammadde (üretim, başlangıç
// envanteri, 1. silo, tekrar eden giderler) 5 kat. Hesabı ASTRA ile hemen fullemek isteyen birkaç balina hammadde fiyatını tavana taşımalı, Konsey'i tek başına bitirememeli.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GAME_CONFIG: C, HAMMADDE_ADEDI_CARPANI: Q, URETIM_CARPANI: U } = await import('../js/config.js');
const { GameStateManager } = await import('../js/gameState.js');
const { AMMMarketEngine } = await import('../js/ammMarket.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const HAM = ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb'];
const yeniPazar = () => { depo.clear(); return new AMMMarketEngine(); };
const yeniOyun = () => { depo.clear(); return new GameStateManager(); };

// 1) Çarpanlar ve ölçeklenen alanlar; fiyatlar ve ASTRA tohumu AYNI
{
  assert.equal(Q, 50);
  assert.equal(U, 5);
  assert.equal(C.HAMMADDE.ORAN, 10);
  const eski = { wheat: 9, stone: 6, wood: 5.4, coal: 4.5, iron: 3.6, herb: 1.2 };
  const fiyat = { wheat: 0.009, stone: 0.012, wood: 0.025, coal: 0.018, iron: 0.04, herb: 0.08 };
  for (const k of HAM) {
    assert.ok(Math.abs(C.BASE_PRODUCTION[k] - eski[k] * U) < 1e-9, `${k} üretimi x${U} (arz)`);
    assert.ok(Math.abs(C.GLOBAL_RESOURCE_CAPS[k].ratePerMinute - eski[k] * U) < 1e-9, `${k} sefer hızı x${U}`);
    const kor = C.AMM_CORRIDORS[k];
    assert.equal(kor.defaultPriceAda, fiyat[k], `${k} pazar fiyatı değişmedi`);
    assert.ok(Math.abs(kor.minPriceAda / kor.defaultPriceAda - 0.5) < 1e-9 && Math.abs(kor.maxPriceAda / kor.defaultPriceAda - 5) < 1e-9, `${k} koridor 0,5x-5x`);
  }
  assert.equal(C.WAREHOUSE.initialCapacities.wheat, 540 * U, '1. silo arz ölçeğinde');
  assert.equal(C.WAREHOUSE.maxCapacities.wheat, 73500 * Q, 'en üst silo talep ölçeğinde');
  assert.equal(C.STARTING_PROFILE.inventory.wheat, 80 * U);
  assert.equal(C.KOY.HOUSE_BASE_COST.wood, 400 * U);
  assert.equal(C.WHEAT_PER_STAMINA, U);
  assert.equal(C.AMM_SEED_ASTRA.raw, 90000000, 'pazar ASTRA tohumu aynı');
  const m = yeniPazar();
  assert.ok(Math.abs(m.getPrice('wheat') - 0.009) < 1e-6, 'buğday pazarda hâlâ 0,009 ASTRA');
  assert.ok(Math.abs(m.pools.wheat.resourceReserve - 90000000 * 0.1330 / 0.009) < 1e8, 'havuzdaki buğday adedi eskisi gibi (~1,3 milyar)');
  ok('arz x5, talep x50, fiyatlar ve havuzlar aynı, koridor 0,5x-5x');
}

// 2) Yeni oyuncu takılmaz: 1->2 seviye bedeli arz ölçeğinde (243 x5), ASTRA payı eski ölçekte (15,8 ASTRA), ilk silo bedeli tutar; ileri seviyeler talep ölçeğine tırmanır
{
  const gs = yeniOyun();
  const r = gs.getNextLevelRequirement();
  assert.ok(Math.abs(r.adAstra - 15.79) < 0.1, `1->2 seviye ASTRA payı eski ölçekte (${r.adAstra})`);
  assert.equal(r.costs.wheat, 243 * U, '1->2 buğday bedeli 243 x5');
  const silo1 = gs.getWarehouseCapacity(1);
  assert.ok(r.costs.wheat <= silo1.wheat && r.costs.iron <= silo1.iron, 'ilk seviye bedeli ilk siloya sığar');
  const u = gs.getWarehouseUpgradeCost(1);
  assert.equal(u.costs.wheat, Math.floor(silo1.wheat * 0.7));
  gs.state.level = 4; const l4 = gs.getNextLevelRequirement().costs.wheat;
  gs.state.level = 12; const l12 = gs.getNextLevelRequirement().costs.wheat;
  gs.state.level = 20; const l20 = gs.getNextLevelRequirement().costs.wheat;
  assert.ok(l12 > l4 * 20 && l20 > l12, `talep seviyeyle tırmanır (Sv.4 ${l4}, Sv.12 ${l12}, Sv.20 ${l20})`);
  ok('yeni oyuncunun ilk adımları arz ölçeğinde; ileri seviyeler talep ölçeğine tırmanır');
}

// 3) Balina senaryosu (19 Ekim 2026, hesap seviyesi her şeyin anahtarı): bir hesabın TAM gelişimi (seviye 80, silo 49, 11 ev, teçhizat 10) pazarın tavana kadar verebileceğinden
//    FAZLA hammadde ister (seviye 50-80 en üst silo kadar bedel ister): kimse hesabını yalnız pazardan alarak fullemeyebilir, açığı kendi üretim hakkıyla kapatır.
//    İlk balina pazarın tavana kadar verdiği her şeyi alır ve fiyatları tavana taşır; ikinci balina neredeyse hiçbir şey alamaz.
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
  assert.ok(tam.wheat > 1e9, `bir hesabın tam gelişimi milyarlarca buğday (${Math.round(tam.wheat)})`);

  const m = yeniPazar();
  const acilis = Object.fromEntries(HAM.map((k) => [k, m.getPrice(k)]));
  const tavanaKadar = (k) => { const h = m.pools[k], tavan = C.AMM_CORRIDORS[k].maxPriceAda; return h.resourceReserve - Math.sqrt(h.adAstraReserve * h.resourceReserve / tavan); };
  for (const k of HAM) assert.ok(tam[k] > tavanaKadar(k), `${k}: bir hesabın tam gelişimi (${Math.round(tam[k])}) pazarın tavana kadar verebileceğinden (${Math.round(tavanaKadar(k))}) fazla`);
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
  const dolar1 = b1.maliyet / 6e6;
  assert.ok(b1.alinamayan > 0 && b1.alinamayan / b1.istenen < 0.6, `ilk balina pazarın verebildiğini alır, gerisini alamaz (alınamayan %${(b1.alinamayan / b1.istenen * 100).toFixed(0)})`);
  assert.ok(dolar1 > 10 && dolar1 < 400, `ilk balina pazardan alabildiği için onlarca dolar öder (${dolar1.toFixed(1)} $)`);
  assert.ok(HAM.every((k) => m.getPrice(k) / acilis[k] >= 3.5), 'ilk balinadan sonra hammadde fiyatları açılışın 3,5 katından fazla (tavan 5x)');
  const b2 = balina();
  assert.ok(b2.alinamayan / b2.istenen > 0.9, `ikinci balinanın isteğinin %90'ından fazlası alınamaz (arz tükendi): ${(b2.alinamayan / b2.istenen * 100).toFixed(0)}%`);
  ok(`1. balina ${dolar1.toFixed(1)} $ (pazarın tavana kadar verdiği her şey), 2. balina alamaz; hesabı fullemek üretim hakkı ister`);
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
  assert.ok(Math.abs(m.calculateResourcesCostAdAstra(kaynak).totalAda - deger / U) < 0.002);
  ok('ASTRA payı = pazar değeri ÷ 5 (arz çarpanı)');
}

console.log(`\n${n} hammadde adedi çarpanı kontrolü geçti.`);
