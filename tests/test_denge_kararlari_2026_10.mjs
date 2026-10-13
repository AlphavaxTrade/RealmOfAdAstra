// 13 Ekim 2026 denge kararları: (R11) Dünya Bossu ekranı gerçek haftalık havuzu gösterir, (R16) Fatih Ödülü kodlandı.
// (R7 Konsey stoğu ve R10 çelik payı için bkz. test_hammadde_kullanim_plani.mjs)
import assert from 'node:assert/strict';

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

let gecen = 0;
const ok = (ad) => { gecen++; console.log(`✅ ${ad}`); };
const yeni = () => {
  depo.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  return new GameStateManager();
};

// R11: haftalık havuz kasanın %3'ü; kasadaki toplam ayrıca görünür; tahmin havuzu aşamaz
{
  const gs = yeni();
  const oran = GAME_CONFIG.WORLD_BOSS.WEEKLY_DISTRIBUTION_RATE;
  const kasa = treasury.getPool('worldBoss');
  const boss = gs.getWorldBossInfo();
  assert.equal(boss.weeklyAdaPool, Math.round(kasa * oran), 'haftalık havuz = kasanın %3\'ü');
  assert.equal(boss.vaultAda, Math.round(kasa), 'kasadaki toplam ayrıca');
  assert.ok(boss.weeklyAdaPool < boss.vaultAda / 10, 'havuz kasanın çok küçük bir parçası');

  // Tahmin: havuzdan büyük olamaz; hasar boss canına eşitse tüm havuz
  assert.equal(gs.estimateWorldBossReward(boss.maxBossHp), boss.weeklyAdaPool);
  assert.equal(gs.estimateWorldBossReward(boss.maxBossHp * 10), boss.weeklyAdaPool, 'hasar bosstan büyükse havuzu aşamaz');
  assert.equal(gs.estimateWorldBossReward(boss.maxBossHp / 10), Math.floor(boss.weeklyAdaPool / 10));
  assert.equal(gs.estimateWorldBossReward(0), 0);

  // Sunucu geçen haftanın toplam hasarını yazdıysa o payda alınır (payın gerçekte bölüşüldüğü toplam)
  boss.realmDamage = boss.maxBossHp * 4;
  assert.equal(gs.estimateWorldBossReward(boss.maxBossHp), Math.floor(boss.weeklyAdaPool / 4), 'toplam krallık hasarına oranlanır');
  ok('Dünya Bossu: haftalık havuz kasanın %3\'ü, tahmin havuzu aşmaz');
}

// R16: Fatih Ödülü — harcanan − zindandan kazanılan, en çok referans ordu bedeli; hesap başına bir kez; kasadan çıkar
{
  const gs = yeni();
  const tavan = gs.getFatihTavani();
  let beklenen = 0;
  for (let n = 1; n <= 18; n++) beklenen += gs.getSoldierCost(n);
  assert.equal(tavan, Math.round(beklenen * 1000) / 1000, 'tavan 18 askerin toplam bedeli');

  // Gerçek harcama yolları sayaca yazılır
  gs.state.adAstraBalance = 1e6;
  const k0 = gs.getFatihOduluBilgisi().harcanan;
  const alim = gs.buySoldierUnit();
  assert.equal(alim.success, true, alim.message);
  const k1 = gs.getFatihOduluBilgisi().harcanan;
  assert.ok(k1 > k0, 'asker alımı sayaca yazıldı');
  gs.state.warehouseLevel = gs.getWarehouseMaxLevel();
  const kap = gs.getWarehouseCapacity();
  for (const k of ['wood', 'iron', 'coal', 'stone']) gs.state.inventory[k] = Math.floor(kap[k] * 0.5);
  gs.state.inventory.fragments = 100;
  const dovme = gs.craftEquipment('weapon');
  assert.equal(dovme.success, true, dovme.message);
  const k2 = gs.getFatihOduluBilgisi().harcanan;
  assert.ok(k2 > k1, 'dövme sayaca yazıldı');
  const yuk = gs.upgradeEquipment('weapon');
  assert.equal(yuk.success, true, yuk.message);
  const k3 = gs.getFatihOduluBilgisi().harcanan;
  assert.ok(k3 > k2, 'yükseltme sayaca yazıldı');

  // Ödül: harcanan 50.000, zindandan kazanılan 8.000 → 42.000 (tavanın altında)
  const g2 = yeni();
  g2._orduHarcamasiYaz(50000);
  g2._zindanKazanciYaz(8000);
  const kasaOnce = treasury.getPool('fatih');
  const bakiyeOnce = g2.state.adAstraBalance;
  const bilgi = g2.getFatihOduluBilgisi();
  assert.equal(bilgi.beklenen, 42000);
  const r = g2._fatihOduluVer();
  assert.equal(r.odul, 42000, 'kalan fark ödenir');
  assert.equal(g2.state.adAstraBalance - bakiyeOnce, 42000, 'bakiyeye geçti');
  assert.equal(kasaOnce - treasury.getPool('fatih'), 42000, 'Fatih kasasından çıktı (yoktan para yok)');
  assert.equal(g2._fatihOduluVer(), null, 'ikinci kez verilmez');
  assert.equal(g2.getFatihOduluBilgisi().alindi, true);

  // Tavan: çok harcayan referans bedeli aşamaz
  const g3 = yeni();
  g3._orduHarcamasiYaz(g3.getFatihTavani() * 5);
  const r3 = g3._fatihOduluVer();
  assert.ok(r3.odul <= Math.floor(g3.getFatihTavani()) + 1, 'tavanı aşmaz');

  // Zindandan harcamasını tamamen çıkaran hiçbir şey almaz
  const g4 = yeni();
  g4._orduHarcamasiYaz(1000);
  g4._zindanKazanciYaz(5000);
  assert.equal(g4._fatihOduluVer().odul, 0);
  assert.equal(g4.getFatihOduluBilgisi().alindi, true, 'hak harcandı (ödül 0)');
  ok('Fatih Ödülü: harcanan − kazanılan, tavanlı, bir kez, kasadan');
}

// R16: gerçek zindan savaşı akışı: 18. kat zaferi ödülü verir, başka kat vermez
{
  const gs = yeni();
  gs._orduHarcamasiYaz(30000);
  const kat9 = gs.settleDungeonBattle({ level: 9, rewardXp: 1, isBoss: true }, [], { victory: true, allies: [], enemies: [] }, { weaponWear: false, rewarded: true });
  assert.equal(kat9.fatihOdulu, undefined, '9. katta Fatih Ödülü yok');
  assert.equal(gs.getFatihOduluBilgisi().alindi, false);
  const kat18 = gs.settleDungeonBattle({ level: 18, rewardXp: 1, isBoss: true }, [], { victory: true, allies: [], enemies: [] }, { weaponWear: false, rewarded: true });
  assert.ok(kat18.fatihOdulu && kat18.fatihOdulu.odul > 0, '18. katta ilk zafer ödülü verir');
  const tekrar = gs.settleDungeonBattle({ level: 18, rewardXp: 1, isBoss: true }, [], { victory: true, allies: [], enemies: [] }, { weaponWear: false, rewarded: true });
  assert.equal(tekrar.fatihOdulu, null, 'ikinci 18. kat zaferinde yok');
  ok('zindan savaşı sonucu: yalnız 18. kat ilk zaferinde Fatih Ödülü');
}

console.log(`\n${gecen}/3 denge kararı bloğu geçti.`);
