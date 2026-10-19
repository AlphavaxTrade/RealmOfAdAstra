// 11 Ekim 2026 oyun kuralları taramasından düzeltilen bulguların gerileme testleri:
// kısmi toplamada alet aşınması ve XP, bütçe dolunca kaybolan görev ödülü, geri dönüşümde ödenmemiş kömür,
// bölünemez varlıklar (kutu, anahtar, parça), saniyelik pasif iyileşmede hayalet yakım, bot paketi imzası.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

const yeni = () => {
  depo.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  const gs = new GameStateManager();
  gs.state.level = 8;
  gs.state.stamina = 5000;
  gs.state.adAstraBalance = 100000;
  gs.state.warehouseLevel = 6;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 100;
  return gs;
};
// addXp'e verilen toplam XP'yi sayar
const xpIzle = (gs) => {
  const kayit = { toplam: 0 };
  const orijinal = gs.addXp.bind(gs);
  gs.addXp = (n) => { kayit.toplam += n; return orijinal(n); };
  return kayit;
};

// 1) Seferi kısmi sonra tam toplamak aleti aşındırır ve toplam XP seferin tam XP'sini aşmaz
{
  const normal = yeni();
  normal.startExpedition('wood');
  normal.state.activeExpeditions.wood.ratePerMinute = 0.2;   // küçük mahsul: silo ve Üretim Hakkı sınırına takılmasın
  normal.state.inventory.wood = 0;
  normal.state.activeExpeditions.wood.elapsedSeconds = normal.state.activeExpeditions.wood.durationSeconds;
  normal.state.activeExpeditions.wood.isCompleted = true;
  const tam = xpIzle(normal);
  const baltaOnce = normal.state.tools.axe.durability;
  assert.equal(normal.claimExpedition('wood').success, true);
  const normalAsinma = baltaOnce - normal.state.tools.axe.durability;
  assert.ok(normalAsinma > 0, 'normal toplamada alet aşınır');

  const hileli = yeni();
  hileli.startExpedition('wood');
  const sefer = hileli.state.activeExpeditions.wood;
  sefer.ratePerMinute = 0.2;
  hileli.state.inventory.wood = 0;
  const toplamXp = hileli.getAccruedExpeditionHarvest('wood').totalXp;
  const izle = xpIzle(hileli);
  const balta = hileli.state.tools.axe.durability;
  // sefer yarıdayken iki kısmi toplama, sonra tamamlanınca kısmi + tam
  sefer.elapsedSeconds = sefer.durationSeconds * 0.4;
  hileli.claimPartialExpedition('wood');
  sefer.elapsedSeconds = sefer.durationSeconds * 0.8;
  hileli.claimPartialExpedition('wood');
  sefer.elapsedSeconds = sefer.durationSeconds;
  sefer.isCompleted = true;
  hileli.claimPartialExpedition('wood');       // geri kalan mahsulün hepsi kısmi yolla alınır
  const son = hileli.claimExpedition('wood');
  assert.equal(son.success, true);
  assert.equal(hileli.state.activeExpeditions.wood, undefined, 'sefer kapanır');
  assert.equal(balta - hileli.state.tools.axe.durability, normalAsinma, 'kısmi yolla toplayan da aynı aşınmayı öder');
  assert.ok(izle.toplam <= toplamXp, `toplam XP seferin tam XP'sini aşmamalı: ${izle.toplam} <= ${toplamXp}`);
  assert.ok(izle.toplam >= toplamXp - 1, `seferin XP'sinin hepsi verilmeli: ${izle.toplam} / ${toplamXp}`);
  assert.equal(tam.toplam, toplamXp, 'normal toplamada XP seferin tam XP\'si');
}
console.log('✅ kısmi toplama: alet aşınır, XP şişmez');

// 2) Haftalık ödeme payı dolunca görev ödülü "alındı" sayılmaz
{
  const gs = yeni();
  gs.state.onboarding = { first_house: { done: true, claimed: false } };
  const kapali = GAME_CONFIG.ONBOARDING_QUESTS.find((q) => q.id === 'first_house');
  assert.ok(kapali && kapali.rewardAda > 0);
  // haftalık ödeme payı tükendi
  treasury.state.pools.quest = 1e6;
  treasury.state.weekBudget = { ...(treasury.state.weekBudget || {}), quest: 5 };
  treasury.state.weekSpent = { ...(treasury.state.weekSpent || {}), quest: 5 };
  const bakiye = gs.state.adAstraBalance;
  const r = gs.claimOnboardingReward('first_house');
  assert.equal(r.success, false, 'bütçe doluyken ödül verilmez');
  assert.equal(r.budgetFull, true);
  assert.equal(gs.state.onboarding.first_house.claimed, false, 'bütçe doluyken ödül işaretlenmez');
  assert.equal(gs.state.adAstraBalance, bakiye);
  // yeni haftada (bütçe açılınca) aynı ödül alınabilir
  treasury.state.weekSpent = {};
  const sonra = gs.claimOnboardingReward('first_house');
  assert.equal(sonra.success, true, JSON.stringify(sonra));
  assert.ok(sonra.granted > 0);
}
console.log('✅ bütçe dolunca görev ödülü kaybolmaz');

// 3) Geri dönüşüm, eşyaya GERÇEKTEN harcanan kömürün ve taşın %70'ini verir (ne eksik ne fazla)
// (13 Ekim 2026'dan önce yükseltme kömür/taş istemiyordu; iade yalnız dövme kömürüne bağlıydı. 11 Ekim'deki hata, ödenmemiş
// kömürün iade edilmesiydi: bu test aynı hata sınıfını yakalar.)
{
  const gs = yeni();
  const s = gs.state;
  s.level = 30; s.warehouseLevel = 18;   // 19 Ekim 2026: teçhizat seviyesi hesap seviyesine bağlı
  const kapasite = gs.getWarehouseCapacity();   // silo sınırını aşan stok kırpılır; ölçümü bozmasın diye sınır içinde başla
  for (const k of GAME_CONFIG.RESOURCE_KEYS) s.inventory[k] = kapasite[k];
  s.inventory.fragments = 2000;
  s.adAstraBalance = 5e6;
  const harcanan = { coal: 0, stone: 0 };
  const dene = (islem) => {
    const once = { coal: s.inventory.coal, stone: s.inventory.stone };
    const r = islem();
    harcanan.coal += once.coal - s.inventory.coal;
    harcanan.stone += once.stone - s.inventory.stone;
    return r;
  };
  assert.equal(dene(() => gs.craftEquipment('weapon')).success, true);
  const kilic = s.equipment.weapon;
  const oran = GAME_CONFIG.RECYCLE_RETURN_RATE ?? 0.7;
  assert.equal(harcanan.stone, 0, 'dövme taş istemez');
  assert.equal(gs.getRecycleValue(kilic).coal, Math.floor(harcanan.coal * oran), "seviye 1: iade dövme kömürünün yüzde 70'i");
  assert.equal(gs.getRecycleValue(kilic).stone, 0, 'seviye 1: taş harcanmadı, iade yok');
  for (let i = 0; i < 8; i++) assert.equal(dene(() => gs.upgradeEquipment('weapon')).success, true);
  assert.ok(kilic.level > 3, 'eşya yükseltildi');
  assert.ok(harcanan.coal > 0 && harcanan.stone > 0, 'yükseltmeler kömür ve taş harcadı');
  const deger = gs.getRecycleValue(kilic);
  // Eşya başına yuvarlama farkı birkaç birimi geçmez; asıl koşul: harcananın %70'ini aşmaz
  assert.ok(deger.coal <= Math.floor(harcanan.coal * oran) + 1, `kömür iadesi harcananın %70'ini aşmamalı: ${deger.coal} <= ${harcanan.coal * oran}`);
  assert.ok(deger.coal >= Math.floor(harcanan.coal * oran) - 8, `kömür iadesi harcananın %70'ine yakın olmalı: ${deger.coal}`);
  assert.ok(deger.stone <= Math.floor(harcanan.stone * oran) + 1, `taş iadesi harcananın %70'ini aşmamalı: ${deger.stone} <= ${harcanan.stone * oran}`);
  assert.ok(deger.stone >= Math.floor(harcanan.stone * oran) - 8, `taş iadesi harcananın %70'ine yakın olmalı: ${deger.stone}`);
}
console.log("✅ geri dönüşüm harcanan kömür ve taşın %70'ini veriyor");

// 4) Bölünemez varlıklar ve parça için silo sınırı
{
  const gs = yeni();
  const s = gs.state;
  s.adAstraBalance = 1e6;
  for (const k of ['fragments']) {
    const al = gs.marketBuy(k, 0.01);
    assert.equal(al.success, false, `${k}: kesirli alım reddedilir`);
    assert.match(al.message, /tam sayı/);
  }
  s.inventory.fragments = 0;
  const kap = gs.getWarehouseCapacity().fragments;
  const fazla = gs.marketBuy('fragments', kap + 50);
  assert.equal(fazla.success, false, 'parça silo sınırını aşamaz');
  assert.equal(s.inventory.fragments, 0);
}
console.log('✅ bölünemez varlıklar ve parça silo sınırı');

// 5) Saniyelik pasif iyileşme: tek adımla aynı sonucu verir, bedel kesilip can artmadan kalmaz
{
  const adimli = yeni();
  const toplu = yeni();
  for (const gs of [adimli, toplu]) {
    const a = gs.createSoldierUnit(1);
    a.hp = 50;
    gs.state.soldierUnits = [a];
    gs.state.inventory.wheat = 100;
    gs.state.adAstraBalance = 100;
  }
  for (let i = 0; i < 600; i++) adimli.processSoldierPassiveHealing(1);
  toplu.processSoldierPassiveHealing(600);
  const hp1 = adimli.state.soldierUnits[0].hp;
  const hp2 = toplu.state.soldierUnits[0].hp;
  assert.ok(hp1 > 50, `saniyelik adımlarda can artmalı: ${hp1}`);
  assert.ok(Math.abs(hp1 - hp2) < 0.01, `adımlı ${hp1} ≈ toplu ${hp2}`);
  const harcanan1 = 100 - adimli.state.inventory.wheat;
  const harcanan2 = 100 - toplu.state.inventory.wheat;
  assert.ok(Math.abs(harcanan1 - harcanan2) < 0.02, `buğday bedeli aynı: ${harcanan1} ≈ ${harcanan2}`);
}
console.log('✅ saniyelik pasif iyileşme tutarlı');

// 6) Bot paketi: istemci imzası (useFree, saat) sunucu şablonunda da geçerli
{
  const { validateArgs } = await import('../server/actions.js');
  assert.equal(validateArgs('buyTavernaAutomationBot', [false, 24]), null);
  assert.equal(validateArgs('buyTavernaAutomationBot', [false]), null);
  assert.ok(validateArgs('buyTavernaAutomationBot', [24]), 'saat tek başına artık geçersiz (ilk argüman bool)');
  assert.equal(validateArgs('repairEquipment', [{ source: 'armory', armoryIndex: 0 }]), null, 'cephanelik eşyası konumla onarılır');
  assert.equal(validateArgs('repairEquipment', ['weapon', 1]), null);
  assert.ok(validateArgs('repairEquipment', [{ name: 'x', slot: 'weapon' }]), 'eşya nesnesi gönderilemez');
}
console.log('✅ işlem şablonları istemciyle uyumlu');

console.log('\n6/6 kural tarama düzeltmesi bloğu geçti.');
