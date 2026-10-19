// Pazar fiyat seviyesi x50 (19 Ekim 2026, kullanıcı kararı): hesabı ASTRA ile hemen fullemek isteyen birkaç balina hammadde fiyatını tavana taşımalı,
// Konsey'i tek başına bitirememeli; eski ölçekli kayıtlar yüklemede kendiliğinden çevrilmeli.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GAME_CONFIG: C, PAZAR_FIYAT_SEVIYESI: K } = await import('../js/config.js');
const { AMMMarketEngine, havuzOlcekle, eskiOlcekliMi } = await import('../js/ammMarket.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const HAM = ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb'];
const yeniPazar = () => { depo.clear(); return new AMMMarketEngine(); };

// 1) Koridor: açılış eski fiyat x K, taban 0,5x, tavan 5x; havuz ASTRA'sı aynı, mal adedi K kat az
{
  assert.equal(K, 50);
  const eskiAcilis = { wheat: 0.009, stone: 0.012, wood: 0.025, coal: 0.018, iron: 0.04, herb: 0.08 };
  const m = yeniPazar();
  for (const k of HAM) {
    const c = C.AMM_CORRIDORS[k];
    assert.ok(Math.abs(c.defaultPriceAda - eskiAcilis[k] * K) < 1e-9, `${k} açılış fiyatı x${K}`);
    assert.ok(Math.abs(c.minPriceAda / c.defaultPriceAda - 0.5) < 1e-6 && Math.abs(c.maxPriceAda / c.defaultPriceAda - 5) < 1e-6, `${k} koridor 0,5x-5x`);
    assert.ok(Math.abs(m.getPrice(k) / c.defaultPriceAda - 1) < 1e-4, `${k} havuzu açılış fiyatında`);
  }
  const astra = HAM.reduce((s, k) => s + m.pools[k].adAstraReserve, 0);
  assert.ok(Math.abs(astra - C.AMM_SEED_ASTRA.raw) < HAM.length, 'altı hammaddenin ASTRA tohumu 90 M (aynı)');
  assert.ok(m.pools.wheat.resourceReserve < 30e6, 'buğday adedi eskisinin 1/50\'si (~26,6 M)');
  ok(`koridor açılış x${K}, taban 0,5x, tavan 5x; ASTRA tohumu aynı`);
}

// 2) Eski ölçekli kayıt yüklemede çevrilir (mal adedi / K, ASTRA aynı); ikinci yükleme değiştirmez; fiyat geçmişi de çevrilir
{
  const m0 = yeniPazar();
  const eski = JSON.parse(JSON.stringify(m0.pools));
  for (const k of HAM) eski[k].resourceReserve = eski[k].resourceReserve * K;   // eski ölçek: adet K kat fazla, fiyat K kat düşük
  const { writeJSON } = await import('../js/storage.js');
  writeJSON('adastra_amm_pools_v12', eski);
  writeJSON('adastra_amm_pools_v12_hist', { wheat: [[Date.now() - 3600000, 0.009], [Date.now() - 1800000, 0.0095]], iron: [[Date.now() - 1000, 3]] });
  const m = new AMMMarketEngine();
  for (const k of HAM) {
    assert.ok(Math.abs(m.getPrice(k) / C.AMM_CORRIDORS[k].defaultPriceAda - 1) < 1e-3, `${k} eski kayıt yeni ölçeğe çevrildi`);
    assert.equal(m.pools[k].adAstraReserve, m0.pools[k].adAstraReserve, `${k} ASTRA'sı değişmedi`);
  }
  assert.ok(Math.abs(m.history.wheat[0][1] - 0.45) < 1e-9, 'eski ölçekli fiyat geçmişi çevrildi');
  assert.equal(m.history.iron[0][1], 3, 'zaten yeni ölçekteki seri değişmez');
  m.savePools();
  const m2 = new AMMMarketEngine();
  assert.equal(m2.pools.iron.resourceReserve, m.pools.iron.resourceReserve, 'ikinci yükleme tekrar çevirmez');
  assert.equal(eskiOlcekliMi('iron', 2), false);
  assert.equal(eskiOlcekliMi('iron', 0.04), true);
  assert.equal(havuzOlcekle('iron', { resourceReserve: 100, adAstraReserve: 5000 }).resourceReserve, 100, 'fiyatı 50 olan havuza dokunulmaz');
  ok('eski ölçekli pazar kaydı ve fiyat geçmişi yüklemede çevrilir; tekrar çevrilmez');
}

// 3) Balina senaryosu: bir hesabın tam gelişimi (seviye 80, silo 49, 11 ev, teçhizat 10) kadar hammaddeyi pazardan alan ilk balina yaklaşık 6 dolar öder
//    (6 M ASTRA = 1 dolar), ikincisi fiyatı tavana taşır, üçüncüsü neredeyse hiçbir şey alamaz (arz tükenir: gerisini ücretsiz oyuncular satar)
{
  const m = yeniPazar();
  const tam = { wheat: 10749030, stone: 4466260, wood: 4296331, coal: 3324036, iron: 3045473, herb: 886396 };
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
  assert.equal(C.OTORITE.BASE_UNITS, 8000000);
  assert.ok(C.KONSEY_PROJELERI.every((p) => p.units === 24000000));
  assert.ok(projeler > enFazla, `5 proje (${projeler.toLocaleString('tr-TR')} birim) pazarın tavana kadar verebileceğinden (${Math.round(enFazla).toLocaleString('tr-TR')}) fazla: Konsey ortak iştir`);
  ok('Konsey projeleri pazardan tek kişiyle bitirilemez (120 M birim > ~50 M alınabilir)');
}

console.log(`\n${n} pazar fiyat seviyesi kontrolü geçti.`);
