// 14 Ekim 2026 denetimi, 2. tur ön yüz borçları (E-2): seviye ekranında silo ipucu, günlük ödeme tavanı mesajları
// (zindan + kolezyum). Kural oyundadır (getNextLevelRequirement, getDungeonDayStatus, günlük sayaç); burada yalnız
// oyunun söylediği değerlerin ekrana doğru cümleyle çıktığı sınanır. Düzeltmeden ÖNCEki kodda düşer (ekranda cümle yoktu).
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
let say = 0;
const tamam = (ad) => { say++; console.log('✅ ' + ad); };

const { seviyeSiloIpucu } = await import('../js/ui/seviye-ipucu.js');
const { odemeOnizlemeNotu, odemeSinirNotu } = await import('../js/ui/kazanc-yazisi.js');

// ── 1) Silo ipucu verisi (saf) ────────────────────────────────────────────
{
  const kap = { stone: 5000, wood: 9000, wheat: null };
  // bedel silodan büyük, ham bedel daha da büyüktü
  const ip = seviyeSiloIpucu({ costs: { stone: 6000, wood: 100, wheat: 1e9 }, uncappedCosts: { stone: 8000 }, siloLevelNeeded: 7 }, 3, kap);
  assert.equal(ip.siloYetmiyor, true);
  assert.deepEqual(ip.sigmayan, ['stone'], 'kapasitesiz (null) kalem hiçbir zaman sığmayan sayılmaz');
  assert.equal(ip.hedefSeviye, 7);
  assert.deepEqual(ip.kirpilan, [{ k: 'stone', ham: 8000, bedel: 6000 }]);
  // her şey sığıyor
  const iyi = seviyeSiloIpucu({ costs: { stone: 100 }, uncappedCosts: {}, siloLevelNeeded: 1 }, 1, kap);
  assert.equal(iyi.siloYetmiyor, false);
  assert.deepEqual(iyi.kirpilan, []);
  // en büyük silo bile tutmuyor (siloLevelNeeded null)
  const hic = seviyeSiloIpucu({ costs: { stone: 6000 }, uncappedCosts: {}, siloLevelNeeded: null }, 3, kap);
  assert.equal(hic.siloYetmiyor, true);
  assert.equal(hic.hedefSeviye, null);
  // eksik veri çökertmez
  assert.equal(seviyeSiloIpucu(null, 1, null).siloYetmiyor, false);
}
tamam('E-2: seviye silo ipucu verisi (sığmayan kalem, kırpılan ham bedel, hedef silo seviyesi)');

// ── 2) Ödeme tavanı cümleleri (saf) ───────────────────────────────────────
{
  assert.equal(odemeOnizlemeNotu(50, 25, 125), null, 'yeterli pay varken not yok');
  const bos = odemeOnizlemeNotu(0, 25, 125);
  assert.equal(bos.ton, 'kotu');
  assert.match(bos.metin, /ödeme tavanın doldu/);
  assert.match(bos.metin, /125 ASTRA/, 'günlük tavan yazılır');
  assert.match(bos.metin, /00:00/);
  const az = odemeOnizlemeNotu(10, 25);
  assert.equal(az.ton, 'uyari');
  assert.match(az.metin, /10 ASTRA/);
  assert.equal(odemeOnizlemeNotu(0, 0), null, 'ödülü olmayan savaşta (antrenman) tavan notu çıkmaz');
  assert.equal(odemeOnizlemeNotu(NaN, 25, 125).ton, 'kotu', 'bozuk değer "doldu" sayılır, NaN yazılmaz');
  assert.ok(!/NaN|undefined/.test(odemeOnizlemeNotu(NaN, 25).metin));

  const dolu = 'Bu haftaki ödeme payı doldu; Pazartesi yenilenir.';
  assert.equal(odemeSinirNotu({ haftalikDoldu: true, gunlukKalan: 0, haftalikMesaj: dolu }), dolu, 'haftalık pay önce');
  assert.match(odemeSinirNotu({ azaldi: true, gunlukKalan: 0 }), /Bugünkü ödeme tavanın doldu; ödül azaldı/);
  assert.match(odemeSinirNotu({ azaldi: false, gunlukKalan: 0 }), /tavanına ulaştın/);
  assert.match(odemeSinirNotu({ azaldi: true, gunlukKalan: 12 }), /Pazartesi/, 'günlük pay kalmışsa azalma haftalık sınırdandır');
  assert.equal(odemeSinirNotu({ azaldi: false, gunlukKalan: 12 }), '');
}
tamam('E-2: günlük ödeme tavanı cümleleri (önizleme ve sonuç notu)');

// ── 3) Ekranlar ───────────────────────────────────────────────────────────
{
  const { GameStateManager } = await import('../js/gameState.js');
  const { GAME_CONFIG } = await import('../js/config.js');
  const { globalPool } = await import('../js/globalPool.js');
  const { ammMarket } = await import('../js/ammMarket.js');
  const { treasury } = await import('../js/treasury.js');
  const ekran = await import('../js/ui/ekran/index.js');
  const bul = (id) => ekran.ekranlar().find((e) => e.id === id);
  const baglam = (gameState) => ({
    gameState, GAME_CONFIG, globalPool, ammMarket, treasury, online: { active: false },
    bildir() {}, hudYenile() {}, kilit: () => null
  });
  const metin = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // a) karakter ekranı: oyun "silo bedeli tutmuyor, 6. seviye gerek" derse ekran bunu söyler ve silo düğmesi sunar
  {
    depo.clear();
    const gs = new GameStateManager();
    const gercek = gs.getNextLevelRequirement.bind(gs);
    const temiz = metin(bul('karakter').govde(baglam(gs), {}));
    assert.ok(!/Silon bu bedeli tutamıyor/.test(temiz), 'yeni hesapta (bedel sığıyor) ipucu çıkmaz');
    gs.getNextLevelRequirement = () => {
      const r = gercek();
      return { ...r, costs: { ...r.costs, stone: 999999 }, uncappedCosts: { stone: 1500000 }, siloLevelNeeded: 6 };
    };
    const html = bul('karakter').govde(baglam(gs), {});
    const t = metin(html);
    assert.match(t, /Silon bu bedeli tutamıyor/);
    assert.match(t, /6\. seviyeye/);
    assert.match(t, /1\.500\.000 yerine 999\.999/, 'kırpılan bedelin ham değeri açıklanır');
    assert.ok(/data-e="git"[^>]*data-hedef="silo"/.test(html), 'Siloya git düğmesi');
    assert.equal(typeof bul('karakter').eylemler.git, 'function');
    assert.deepEqual(bul('karakter').eylemler.git(baglam(gs), { dataset: { hedef: 'silo' } }), { git: 'silo' });
  }

  // b) savaşa hazırlık (zindan): günlük ödeme payı bitmişse giriş kartı söyler
  {
    depo.clear();
    const gs = new GameStateManager();
    const sayac = gs.getDailyCounters();
    sayac.dungeonBudget = 0;   // kasanın bugünkü bütçesi/kişi tavanı tükendi
    sayac.dungeonPaid = 0;
    const e = bul('savashazirlik');
    const html = e.govde(baglam(gs), e.ornekSecenekler()[0]);
    assert.match(metin(html), /Bugünkü ödeme tavanın doldu/);
    assert.ok(!/NaN|undefined/.test(metin(html)));
  }

  // b2) harçsız girişler bitmiş ve ödeme payı dolmuşsa giriş engellidir: kart tek, tutarlı bir mesaj verir ("deneyim ve ganimet sürer" demez)
  {
    depo.clear();
    const gs = new GameStateManager();
    const sayac = gs.getDailyCounters();
    sayac.dungeonRuns = GAME_CONFIG.DUNGEON.DAILY_RUNS;
    sayac.dungeonBudget = 0;
    sayac.dungeonPaid = 0;
    const e = bul('savashazirlik');
    const yazi = metin(e.govde(baglam(gs), e.ornekSecenekler()[0]));
    assert.match(yazi, /ödeme payını doldurdun/, 'engel mesajı var');
    assert.ok(!/deneyim ve ganimet sürer/.test(yazi), 'engelliyken çelişen "ganimet sürer" cümlesi yok');
    assert.ok(!/ödeme tavanın doldu/.test(yazi), 'aynı şeyi söyleyen ikinci uyarı yok');
  }

  // d) demirhane: cephanelik boşken toplu işlem düğmeleri pasif (eskiden "uygun teçhizat bulunamadı" hatası veriyordu)
  {
    depo.clear();
    const gs = new GameStateManager();
    const html = bul('demirhane').govde(baglam(gs), { sekme: 'esyalar', kategori: 'all', sirala: 'level_desc', grupYuva: 'weapon', grupSeviye: 1 });
    for (const eylem of ['giydir', 'hepsiniGelistir', 'ozelGrup']) {
      const i = html.indexOf(`data-e="${eylem}"`);
      assert.ok(i > 0, `${eylem} düğmesi çizildi`);
      const etiket = html.slice(html.lastIndexOf('<button', i), html.indexOf('>', i));
      assert.ok(etiket.includes(' disabled'), `${eylem}: eşya yokken pasif`);
    }
  }

  // c) kolezyum düellosu: günlük ödül tavanı satırı ve doldu uyarısı
  {
    depo.clear();
    const gs = new GameStateManager();
    gs.state.level = 30; gs.state.adAstraBalance = 250000; gs.state.stamina = 5000; gs.state.arenaKeys = 6;
    for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 4000;
    gs.buySoldierUnit();
    const e = bul('kolezyum');
    const cap = GAME_CONFIG.COLOSSEUM.DAILY_REWARD_CAP_ASTRA;
    const once = metin(e.govde(baglam(gs), { sekme: 'duel', sampiyon: 0 }));
    assert.match(once, /Bugünkü ASTRA ödül tavanı/);
    assert.ok(!/ödeme tavanın doldu/.test(once), 'tavan dolmadan uyarı çıkmaz');
    gs.getDailyCounters().arenaAda = cap;
    const sonra = metin(e.govde(baglam(gs), { sekme: 'duel', sampiyon: 0 }));
    assert.match(sonra, /Bugünkü ödeme tavanın doldu/);
    assert.ok(sonra.split('.').join('').includes(`${cap} / ${cap}`), 'kullanılan / tavan yazılır');
  }
}
tamam('E-2: karakter (silo ipucu), savaşa hazırlık ve kolezyum ekranları ödeme tavanını söyler');

console.log(`\n${say}/3 ön yüz denetim (2. tur) testi geçti`);
process.exit(0);
