// Hammadde kullanım planı (13 Ekim 2026, docs/v2/HAMMADDE_KULLANIM_PLANI.md): altı hammaddenin hepsinin kullanım alanı vardır.
// Bu test planın kurallarını kilitler: seviye atlama bedelinin altı hammaddeyi kapsaması, alet onarımının %25 toplam yükü,
// teçhizat yükseltme/onarımının kömür ve taş istemesi, Konsey karışımlarının altı hammaddeli olması ve ortak stoğun
// kendiliğinden aktarılması, ayrıca model ölçümünde her hammaddenin talebinin hedef bantta kalması.
import assert from 'node:assert/strict';

// Model ölçümü önce (kendi sahte deposunu kurar); sonraki bölümler kendi deposunu verir
const { haftalikOlcum, SEVIYELER } = await import('../scripts/model/hammadde_kullanim.mjs');
const olcumler = SEVIYELER.map(haftalikOlcum);

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');
const { ammMarket } = await import('../js/ammMarket.js');

const K = GAME_CONFIG.RESOURCE_KEYS;
let gecen = 0;
const ok = (ad) => { gecen++; console.log(`✅ ${ad}`); };
const yeni = () => {
  depo.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  const gs = new GameStateManager();
  gs.state.warehouseLevel = gs.getWarehouseMaxLevel();
  for (const k of K) gs.state.inventory[k] = 0;
  return gs;
};

// 1) Seviye atlama: altı hammadde, hepsi kendi üretim hızıyla orantılı (hiçbiri ayrıcalıklı değil).
//    Silo tavanına kırpılan seviyelerde (Sv.9 sonrası; 13 Ekim 2026 denetimi EK-01) orantı bozulur: o durum
//    tests/test_denetim_2026_10_ekonomi.mjs'te "bedel = min(ham, silo tavanı)" olarak denetlenir.
{
  const gs = yeni();
  for (const seviye of [1, 5, 8]) {
    gs.state.level = seviye;
    const r = gs.getNextLevelRequirement();
    assert.deepEqual(Object.keys(r.costs).sort(), [...K].sort(), 'bedel altı hammaddeyi kapsar');
    const oranlar = K.map((k) => r.costs[k] / GAME_CONFIG.BASE_PRODUCTION[k]);
    const ort = oranlar.reduce((t, v) => t + v, 0) / oranlar.length;
    for (const o of oranlar) assert.ok(Math.abs(o - ort) / ort < 0.02, `bedel üretim hızıyla orantılı (seviye ${seviye}): ${oranlar.map((x) => x.toFixed(2))}`);
    assert.equal(r.wood, r.costs.wood, 'eski alan adları durur');
  }
  ok('seviye atlama bedeli altı hammaddeyi üretim hızıyla orantılı kapsıyor');
}

// 2) Seviye atlama gerçekten altısını da düşer; biri eksikse reddeder
{
  const gs = yeni();
  gs.state.level = 5;
  const r = gs.getNextLevelRequirement();
  gs.state.currentXp = r.xp;
  gs.state.adAstraBalance = 1e6;
  for (const k of K) gs.state.inventory[k] = r.costs[k] + 7;
  gs.state.inventory.stone = r.costs.stone - 1;            // yalnız taş eksik
  const red = gs.levelUp();
  assert.equal(red.success, false);
  assert.match(red.message, /Taş/, 'eksik hammadde adı söylenir');
  assert.equal(gs.state.level, 5);
  gs.state.inventory.stone = r.costs.stone + 7;
  const once = { ...gs.state.inventory };
  const al = gs.levelUp();
  assert.equal(al.success, true, al.message);
  for (const k of K) assert.equal(once[k] - gs.state.inventory[k], r.costs[k], `${k} bedeli düştü`);
  ok('seviye atlama altı hammaddeyi düşer, biri eksikse neyin eksik olduğunu söyler');
}

// 3) Alet onarımı: altı aletin toplam yükü, dakikalık odun ve demir üretiminin %25'idir (eskiden üçe bölündüğü için %50'ydi)
{
  const gs = yeni();
  const odunHizi = gs.getResourceRatePerMinute('wood');
  const demirHizi = gs.getResourceRatePerMinute('iron');
  let odun = 0, demir = 0;
  for (const alet of Object.values(GAME_CONFIG.TOOLS)) {
    gs.state.tools[alet.id].durability = 0;
    const b = gs.calculateRepairCost(alet.id);
    odun += b.woodCostPerMin; demir += b.ironCostPerMin;
  }
  assert.ok(Math.abs(odun - odunHizi * 0.25) < 0.03, `odun: altı aletin toplamı %25 (${odun.toFixed(3)} ≈ ${(odunHizi * 0.25).toFixed(3)})`);
  assert.ok(Math.abs(demir - demirHizi * 0.25) < 0.03, `demir: altı aletin toplamı %25 (${demir.toFixed(3)} ≈ ${(demirHizi * 0.25).toFixed(3)})`);
  ok('alet onarımı toplam yükü %25 (alet sayısına bölünür)');
}

// 4) Teçhizat: yükseltme kömür ve taş ister, onarım kömür ister; yetmeyince reddedilir; geri dönüşüm harcananın %70'i
{
  const gs = yeni();
  gs.state.adAstraBalance = 1e6;
  const kap = gs.getWarehouseCapacity();   // silo sınırını aşan stok kırpılır: sınır içinde kal
  const bol = (k) => Math.floor(kap[k] * 0.9);
  for (const k of ['wood', 'iron', 'coal', 'stone']) gs.state.inventory[k] = bol(k);
  gs.state.inventory.fragments = 200;
  assert.equal(gs.craftEquipment('weapon').success, true);
  const kilic = gs.state.equipment.weapon;
  const yuk = gs.calculateEquipmentUpgradeCost('weapon');
  assert.ok(yuk.coalCost > 0 && yuk.stoneCost > 0, 'yükseltme kömür ve taş ister');
  gs.state.inventory.coal = yuk.coalCost - 1;
  assert.match(gs.upgradeEquipment('weapon').message, /Kömür/, 'kömür yetmeyince reddeder');
  gs.state.inventory.coal = bol('coal'); gs.state.inventory.stone = yuk.stoneCost - 1;
  assert.match(gs.upgradeEquipment('weapon').message, /Taş/, 'taş yetmeyince reddeder');
  gs.state.inventory.stone = bol('stone');
  const komurOnce = gs.state.inventory.coal, tasOnce = gs.state.inventory.stone;
  assert.equal(gs.upgradeEquipment('weapon').success, true);
  assert.equal(komurOnce - gs.state.inventory.coal, yuk.coalCost, 'kömür düştü');
  assert.equal(tasOnce - gs.state.inventory.stone, yuk.stoneCost, 'taş düştü');

  kilic.durability = 3;
  const onar = gs.calculateEquipmentRepairCost('weapon');
  assert.ok(onar.coalCost > 0, 'onarım kömür ister');
  gs.state.inventory.coal = 0;
  assert.match(gs.repairEquipment('weapon').message, /Kömür/);
  gs.state.inventory.coal = bol('coal');
  assert.equal(gs.repairEquipment('weapon').success, true);
  ok('teçhizat yükseltme ve onarımı kömür (ve taş) ister');
}

// 5) Konsey karışımları: altı hammaddeli, toplam %100, ASTRA ile ödenen çelik payı yok
{
  const O = GAME_CONFIG.OTORITE;
  const topla = (m) => Object.values(m).reduce((t, v) => t + v, 0);
  assert.ok(Math.abs(topla(O.MIX) - 1) < 1e-9);
  assert.deepEqual(Object.keys(O.MIX).sort(), [...K].sort());
  assert.equal(O.STEEL_SHARE, undefined);
  assert.equal(O.STEEL_ASTRA_PER_UNIT, undefined);
  for (const p of GAME_CONFIG.KONSEY_PROJELERI) {
    assert.ok(Math.abs(topla(p.mix) - 1) < 1e-9, `${p.id}: karışım %100`);
    for (const k of Object.keys(p.mix)) assert.ok(K.includes(k), `${p.id}: bilinmeyen hammadde ${k}`);
  }
  // her hammadde en az bir projede ve Otorite'de var: hiçbiri Konsey'de dışarıda kalmaz
  for (const k of K) {
    assert.ok(O.MIX[k] > 0, `${k} Otorite karışımında`);
    assert.ok(GAME_CONFIG.KONSEY_PROJELERI.some((p) => p.mix[k] > 0), `${k} bir projede`);
  }
  ok('Konsey karışımları altı hammaddeli ve %100; çelik payı kömürdür');
}

// 6) Konsey ortak stoğu kendiliğinden aktarılır: yarısı Otorite'ye, yarısı etkin projeye; karışımda olmayan stokta kalır
{
  yeni();
  const once = globalPool.getOtoriteStatus();
  const pj0 = globalPool.getProjectStatus();
  globalPool.addKonseyStock('stone', 1000);
  globalPool.addKonseyStock('coal', 400);
  globalPool.addKonseyStock('herb', 51);
  const aktarilan = globalPool.konseyStokuKullan();
  assert.deepEqual(aktarilan, { stone: 1000, coal: 400, herb: 51 }, 'hepsi aktarıldı');
  const ot = globalPool.getOtoriteStatus();
  const pj = globalPool.getProjectStatus();
  assert.equal(ot.progress.stone + pj.progress.stone, 1000, 'taş bölüşüldü');
  assert.equal(ot.progress.stone, 500, 'yarısı Otorite\'ye');
  assert.equal(ot.progress.coal, 200);
  assert.equal(globalPool.getKonseyStock().stone, 0, 'stok boşaldı');
  assert.equal(once.progress.stone || 0, 0);
  assert.equal(pj0.progress.stone || 0, 0);

  // Etkin projede olmayan bir hammadde (Köprü karışımında şifalı ot yok): stok yalnız Otorite'ye aktarılır
  const kopruHerb = (pj.need.herb || 0);
  assert.equal(kopruHerb, 0, 'ilk projede (Köprü) şifalı ot yok');
  assert.equal(pj.progress.herb || 0, 0, 'ota projeye aktarılmadı');
  assert.equal(ot.progress.herb, 51, 'şifalı otun tamamı Otorite\'ye gitti (projede yeri yok)');
  ok('Konsey stoğu Otorite ve etkin projeye kendiliğinden aktarılır');
}

// 7) Ortak stok tamamlanmayı da tetikler: bir seviyenin bütün karışımı stoktan dolunca Otorite yükselir, kasadan ödeme çıkmaz
{
  yeni();
  const st = globalPool.getOtoriteStatus();
  const kasa0 = treasury.getPool('uoaTohum');
  for (const [k, n] of Object.entries(st.need)) globalPool.addKonseyStock(k, n * 2 + 2);   // yarısı Otorite'ye gider: tam yetsin
  globalPool.konseyStokuKullan();
  assert.equal(globalPool.uretimParams().otoriteLevel, 1, 'stoktan Otorite 1. seviyeye çıktı');
  assert.equal(treasury.getPool('uoaTohum'), kasa0, 'UOA tohumundan ödeme çıkmadı');
  ok('stok aktarımı seviye tamamlanmasını tetikler, kasadan ödeme çıkmaz');
}

// 8) Model ölçümü: her hammaddenin haftalık talebi tam üretimin %40-100'ü arasında (hiçbiri atıl ya da kıtlık değil).
//    13 Ekim 2026 denetimi EK-01: seviye bedeli artık ulaşılabilir silonun %80'ini aşamıyor. Eskiden Sv.12+ için hesaplanan
//    talep hayalet idi (oyuncu o bedeli siloda tutamıyordu). Bedel kırpılan seviyelerde (Sv.10+) taş / kömür / şifalı ot
//    talebi bandın altına iner. 14 Ekim 2026 ikinci tur KARARI: bu KABUL edilmiş bir durumdur (HAMMADDE_KULLANIM_PLANI bölüm 8):
//    kota termostatı kotayı kısar, fiyat açılışta kalır (denge modeli N=50/200/1000: fiyat endeksi ≥ 0,87). Bu yüzden bant artık
//    "gevşek taban" değil, üç somut kuralla kilitlidir:
//      (i)   Sv.10 ve altında (gerçek motorlu yıllık simülasyonda ortalama Sv.5, en çok Sv.7) her hammadde TAM bandın içindedir.
//      (ii)  Bandın altına inen her kalem seviye bedelinin silo kırpmasından gelir (siloKirpilan) ve termostatın kısma payı korunur:
//            denge kotası (başlangıç kotası × talep/hak) taban kotanın (QPP_MIN) en az 2,5 katıdır.
//      (iii) Ölçülen değerler sabitlenir: Sv.20 ve Sv.40'ta 0,22 / 0,12'nin altına inmez; daha da düşüren bir kural değişikliği
//            bu testi bozar ve yeniden karar ister.
{
  const U = GAME_CONFIG.URETIM_HAKKI;
  const kabul = { 20: 0.22, 40: 0.12 };   // ölçülen en düşük: Sv.20 → 0,25 (kömür), Sv.40 → 0,14 (kömür); ~0,03 pay
  for (const o of olcumler) {
    for (const k of K) {
      const r = o.oranUretim[k];
      assert.ok(r <= 1.0, `seviye ${o.seviye} ${k}: talep/üretim ${r.toFixed(2)} 1,00'ı aşıyor (kalıcı kıtlık)`);
      if (o.seviye <= 10) assert.ok(r >= 0.40, `seviye ${o.seviye} ${k}: talep/üretim ${r.toFixed(2)} 0,40 bandının altında (Sv.10 ve altı tam bantta olmalı)`);
      if (r < 0.40) {
        assert.ok(o.siloKirpilan.includes(k), `seviye ${o.seviye} ${k}: talep/üretim ${r.toFixed(2)} bandın altında ve nedeni seviye bedelinin silo kırpması değil`);
        assert.ok(r >= (kabul[o.seviye] ?? 0.25), `seviye ${o.seviye} ${k}: talep/üretim ${r.toFixed(2)} kabul edilen düzeyin altında (${kabul[o.seviye]})`);
        const denge = o.oranHak[k] * U.QPP_START;
        assert.ok(denge >= 2.5 * U.QPP_MIN, `seviye ${o.seviye} ${k}: denge kotası ${denge.toFixed(3)} taban kotanın (${U.QPP_MIN}) 2,5 katından az: termostat kısacak yer bulamaz`);
      }
      // hak üzerinden: başlangıç kotası 0,40 ile talep hakkın 3,5 katını geçmez; termostat (haftada +%10) en çok 13 haftada yetişir
      assert.ok(o.oranHak[k] <= 3.5, `seviye ${o.seviye} ${k}: talep/hak ${o.oranHak[k].toFixed(2)} (>3,5)`);
      assert.ok(o.haftaDenge[k] <= 13, `seviye ${o.seviye} ${k}: kota dengesi ${o.haftaDenge[k].toFixed(0)} hafta`);
    }
  }
  const bandiciCikanlar = olcumler.filter((o) => K.some((k) => o.oranUretim[k] < 0.40)).map((o) => o.seviye);
  ok(`model: talep / üretim her seviyede ≤ 1,00; Sv.≤10 tam bantta; 0,40 altı (Sv. ${bandiciCikanlar.join(', ') || '-'}) yalnız silo kırpması yüzünden ve denge kotası ≥ 2,5 × taban`);
}

// 9) Çark: yeni üç hammadde sık gelen dilimlerde (pazardan alınan hammadde ödülü onlara talep yaratır)
{
  const dilimler = GAME_CONFIG.CARNIVAL.WHEEL_REWARDS.filter((d) => d.type === 'amm_raw');
  const sik = dilimler.filter((d) => d.weight >= 500).map((d) => d.key).sort();
  assert.deepEqual(sik, ['coal', 'herb', 'stone'], 'sık gelen hammadde dilimleri yeni üç hammadde');
  assert.equal(GAME_CONFIG.CARNIVAL.WHEEL_REWARDS.length, 18, '18 dilim (17 + Şans Sayacı)');
  ok('çark: yeni hammaddeler sık gelen dilimlerde, dilim sayısı aynı');
}

console.log(`\n${gecen}/9 hammadde kullanım planı bloğu geçti.`);
