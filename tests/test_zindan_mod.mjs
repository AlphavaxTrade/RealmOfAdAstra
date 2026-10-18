// Zindan modları (Normal → Zor → Uzman → Cehennem; 18 Ekim 2026): geçiş kuralları, çarpanlar, canavar tabloları, asker hakkı, sunucu işlemleri.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: (k) => { depo.delete(k); } };
const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');
const { getDungeonEntry, getFloorMonsters, DUNGEON_LEVELS, MOD_CANAVARLARI } = await import('../js/bestiary.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');
const { askerHakki } = await import('../js/economy/ordu-hakki.js');
const { validateArgs, ACTIONS } = await import('../server/actions.js');

let toplam = 0;
const ok = (ad) => { toplam++; console.log(`✅ ${ad}`); };
const yeni = () => {
  depo.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  gs.state.adAstraBalance = 1e9;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 1e7;
  return gs;
};
const MODLAR = GAME_CONFIG.ZINDAN_MODLARI;
const gecerli = (ad, args) => validateArgs(ad, args) == null;   // geçerliyse null, değilse hata metni

// 1) Yapılandırma: 4 mod, çarpanlar artıyor, geçiş bedelleri artıyor, XP çarpanı yok
{
  assert.deepEqual(MODLAR.map((m) => m.id), ['normal', 'zor', 'uzman', 'cehennem']);
  assert.equal(MODLAR[0].odulCarpani, 1); assert.equal(MODLAR[0].gecis, null);
  const toplamHam = (m) => Object.values(m.gecis.hammadde).reduce((a, b) => a + b, 0);
  for (let i = 1; i < MODLAR.length; i++) {
    assert.ok(MODLAR[i].odulCarpani > MODLAR[i - 1].odulCarpani, 'ödül çarpanı artar');
    assert.ok(MODLAR[i].dusmeCarpani >= MODLAR[i - 1].dusmeCarpani, 'düşme çarpanı azalmaz');
    if (i > 1) { assert.ok(MODLAR[i].gecis.astra > MODLAR[i - 1].gecis.astra, 'ASTRA bedeli artar'); assert.ok(toplamHam(MODLAR[i]) > toplamHam(MODLAR[i - 1]), 'hammadde bedeli artar'); }
    for (const k of Object.keys(MODLAR[i].gecis.hammadde)) assert.ok(GAME_CONFIG.RESOURCE_KEYS.includes(k), 'bedel yalnız oyunun hammaddeleri: ' + k);
  }
  assert.ok(MODLAR.every((m) => !('xpCarpani' in m)), 'XP çarpanı yok: hesap seviyesi tempo eğrisi bozulmasın');
  ok('4 mod; ödül/düşme çarpanı ve geçiş bedeli artıyor; XP çarpanı yok');
}

// 2) Canavar tabloları: her modda 18 canavar, aynı kimlik/yetenek/XP; mod arttıkça can artar; yeni mod önceki modun sonundan güçlü başlar
{
  for (const m of [1, 2, 3]) {
    assert.equal(Object.keys(MOD_CANAVARLARI[m] || {}).length, 18, `mod ${m}: 18 canavar`);
    for (const t of DUNGEON_LEVELS) {
      const e = getDungeonEntry(t.level, m);
      assert.equal(e.name, t.name); assert.deepEqual(e.abilities, t.abilities); assert.equal(e.rewardXp, t.rewardXp); assert.equal(e.floor, t.floor);
      assert.ok(e.hp > 0 && e.atk > 0 && Number.isInteger(e.hp) && Number.isInteger(e.atk));
      assert.ok(e.hp > getDungeonEntry(t.level, m - 1).hp, `mod ${m} canavar ${t.level}: önceki moddan daha canlı`);
    }
    assert.ok(getDungeonEntry(1, m).hp > getDungeonEntry(18, m - 1).hp * 0.9, `mod ${m} ilk canavarı, önceki modun final bossuna yakın ya da üstünde başlar`);
    // boss, yenilebilir kalmak için komşusundan biraz az canlı olabilir (savaş ortasında kalkan/öfke fazları etkin canı artırır) ama belirgin az değil
    for (const L of [9, 18]) assert.ok(getDungeonEntry(L, m).hp >= 0.85 * getDungeonEntry(L - 1, m).hp, `mod ${m} boss ${L} komşusunun %85'inden az canlı olmasın`);
  }
  assert.equal(getDungeonEntry(5), getDungeonEntry(5, 0), 'Normal mod aynı kayıt');
  assert.equal(getDungeonEntry(5, 99).hp, getDungeonEntry(5, 0).hp, 'bilinmeyen mod Normal sayılır');
  assert.deepEqual(getFloorMonsters(2, 1).map((m) => m.level), [4, 5, 6]);
  assert.equal(getFloorMonsters(2, 1)[0].hp, getDungeonEntry(4, 1).hp);
  ok('canavar tabloları: 3 mod × 18 canavar; mod arttıkça güçlenir; kimlik, yetenek ve ödül XP\'si aynı');
}

// 3) Ödül çarpanı yalnız ASTRA'ya; XP aynı; Normal mod ödülü değişmedi
{
  const gs = yeni();
  const taban = gs.getDungeonBaseReward(5, false, 0);
  assert.equal(taban.ada, 4.5); assert.equal(taban.xp, 1000);
  for (let m = 1; m < MODLAR.length; m++) {
    const r = gs.getDungeonBaseReward(5, false, m);
    assert.equal(r.ada, Math.round(4.5 * MODLAR[m].odulCarpani * 1000) / 1000, `mod ${m} ASTRA`);
    assert.equal(r.xp, taban.xp, `mod ${m} XP değişmez`);
  }
  gs.state.dungeonMode = 2;
  assert.equal(gs.getDungeonBaseReward(5).ada, Math.round(4.5 * 2.25 * 1000) / 1000, 'mod verilmezse oyuncunun modu');
  assert.ok(gs.getDungeonGateFee(5) > 0.9, 'kapı harcı da ödülle birlikte büyür');
  ok('ASTRA ödülü mod çarpanıyla büyür, XP büyümez; Normal mod ödülü aynı');
}

// 4) Savaş oyuncunun modundaki canavarla yapılır
{
  const gs = yeni();
  gs.state.dungeonProgress = 1; gs.state.dungeonMode = 0;
  gs.buySoldierUnit(); gs.buySoldierUnit();
  const normal = gs.fightDungeon(1, [0, 1]);
  assert.equal(normal.success, true); assert.equal(normal.monster.hp, 200);
  const gs2 = yeni();
  gs2.state.dungeonMode = 1; gs2.state.dungeonProgress = 1;
  for (let i = 0; i < 8; i++) assert.equal(gs2.buySoldierUnit().success, true, `${i + 1}. asker (Zor modun hakkı 8)`);
  const zor = gs2.fightDungeon(1, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(zor.success, true); assert.equal(zor.monster.hp, getDungeonEntry(1, 1).hp);
  assert.ok(zor.monster.hp > 50 * normal.monster.hp, 'Zor 1. canavar Normal 1. canavardan çok daha güçlü');
  ok('fightDungeon oyuncunun modundaki canavar tablosunu kullanıyor');
}

// 5) Geçiş: önkoşullar sırayla (son boss → hammadde → ASTRA), sonra mod +1
{
  const gs = yeni();
  let b = gs.getDungeonModeInfo();
  assert.deepEqual([b.mod, b.ad, b.bitti, b.enYuksekMod], [0, 'Normal', false, false]);
  assert.equal(gs.advanceDungeonMode().success, false);
  assert.match(gs.advanceDungeonMode().message, /son canavarını \(Sv\.18\)/);
  assert.match(gs.contributeToDungeonGate({ wood: 100 }).message, /son canavarını/);

  gs.state.dungeonProgress = 18;   // 18. canavar henüz yenilmedi
  assert.equal(gs.getDungeonModeInfo().bitti, false);
  gs.state.dungeonProgress = 19;   // Sv.18 yenildi
  b = gs.getDungeonModeInfo();
  assert.equal(b.bitti, true); assert.equal(b.gecis.hedefAd, 'Zor'); assert.equal(b.gecis.yapilabilir, false); assert.equal(b.gecis.yeniAskerHakki, 8);
  assert.match(gs.advanceDungeonMode().message, /Hammadde katkısı tamamlanmadı/);

  // katkı: envanter ve kalan ihtiyaçla sınırlı, yakılır, kayıtlı
  const need = MODLAR[1].gecis.hammadde;
  gs.state.inventory.wood = 1500;
  const r1 = gs.contributeToDungeonGate({ wood: 1e9, bilinmeyen: 5, iron: -3 });
  assert.equal(r1.success, true); assert.deepEqual(r1.given, { wood: 1500 });
  assert.equal(gs.state.inventory.wood, 0, 'yakıldı');
  assert.equal(gs.getDungeonModeInfo().gecis.verilen.wood, 1500);
  assert.equal(gs.getDungeonModeInfo().gecis.kalan.wood, need.wood - 1500);
  assert.equal(gs.contributeToDungeonGate({ wood: 10 }).success, false, 'envanter boş: verilecek yok');
  assert.equal(gs.contributeToDungeonGate({ iron: 0 }).success, false);
  for (const k of Object.keys(need)) gs.state.inventory[k] = 1e7;
  gs.state.inventory.wheat = 1e7;
  const r2 = gs.contributeToDungeonGate({ wood: 1e9, iron: 1e9, coal: 1e9, stone: 1e9, wheat: 1e9 });
  assert.equal(r2.success, true);
  assert.equal(r2.given.wood, need.wood - 1500, 'fazlası alınmaz: kalan ihtiyaç kadar');
  assert.equal(r2.given.wheat, undefined, 'bu modun bedelinde olmayan hammadde yakılmaz');
  assert.equal(gs.state.dungeonGate.verilen.wheat, undefined, 'bedelde olmayan hammadde katkı kaydına girmez');
  b = gs.getDungeonModeInfo();
  assert.equal(b.gecis.hammaddeTamam, true); assert.equal(b.gecis.yapilabilir, true);
  assert.equal(gs.contributeToDungeonGate({ wood: 5 }).success, false, 'katkı tamamlandıktan sonra yenisi alınmaz');

  // ASTRA yetmezse geçilmez
  const bakiye = gs.state.adAstraBalance, bedel = b.gecis.astra;
  gs.state.adAstraBalance = bedel - 1;
  assert.match(gs.advanceDungeonMode().message, /ASTRA gerekli/);
  gs.state.adAstraBalance = bakiye;
  gs.state.dungeonMonsterCurrentHp = { 3: 50 };
  const g = gs.advanceDungeonMode();
  assert.equal(g.success, true, g.message);
  assert.equal(gs.state.dungeonMode, 1); assert.equal(gs.state.dungeonProgress, 1);
  assert.deepEqual(gs.state.dungeonMonsterCurrentHp, {}, 'canavarların kalan canı sıfırlanır');
  assert.equal(gs.state.adAstraBalance, bakiye - bedel);
  assert.equal(g.hak, 8); assert.equal(gs.getAskerHakki().hak, 8);
  b = gs.getDungeonModeInfo();
  assert.deepEqual([b.mod, b.ad, b.bitti], [1, 'Zor', false]);
  assert.equal(b.gecis.hedefAd, 'Uzman'); assert.equal(b.gecis.verilen.wood, 0, 'önceki modun katkısı yeni moda sızmaz');
  assert.match(g.message, /Zor moda geçtin/);
  ok('geçiş: son boss → hammadde katkısı (yakılır, kalanı aşmaz) → ASTRA → mod+1, zindan baştan, hak 8, katkılar sıfırlanır');
}

// 6) Üç geçişle Cehennem; en yüksek modda geçiş yok; hak birikir
{
  const gs = yeni();
  for (let hedef = 1; hedef <= 3; hedef++) {
    gs.state.dungeonProgress = 19;
    const need = MODLAR[hedef].gecis.hammadde;
    for (const k of Object.keys(need)) gs.state.inventory[k] = 1e7;   // (oyunda envanter silo sınırında kırpılır: gerçek oyuncu günlere yayarak verir)
    gs.contributeToDungeonGate(Object.fromEntries(Object.keys(need).map((k) => [k, need[k]])));
    const r = gs.advanceDungeonMode();
    assert.equal(r.success, true, r.message);
    assert.equal(gs.getAskerHakki().hak, askerHakki({ ilerleme: 1, mod: hedef }));
  }
  assert.equal(gs.state.dungeonMode, 3);
  const b = gs.getDungeonModeInfo();
  assert.equal(b.enYuksekMod, true); assert.equal(b.gecis, null);
  gs.state.dungeonProgress = 19;
  assert.match(gs.advanceDungeonMode().message, /en yüksek mod/);
  assert.match(gs.contributeToDungeonGate({ wood: 1 }).message, /en yüksek mod/);
  ok('Cehennem\'e üç geçişle çıkılır; hak 8 → 14 → 20; en yüksek modda geçiş yok');
}

// 7) Bozuk/eski kayıt: mod alanı yok ya da bozuk → Normal; katkı kaydı eski hedefe aitse sıfırlanır
{
  const gs = yeni();
  delete gs.state.dungeonMode; gs.state.dungeonProgress = 19;
  assert.equal(gs.getDungeonModeInfo().mod, 0);
  gs.state.dungeonMode = 'saçma'; assert.equal(gs.getDungeonModeInfo().mod, 0);
  gs.state.dungeonMode = 99; assert.equal(gs.getDungeonModeInfo().mod, 3, 'üst sınır');
  gs.state.dungeonMode = -4; assert.equal(gs.getDungeonModeInfo().mod, 0);
  gs.state.dungeonMode = 0; gs.state.dungeonGate = { hedef: 3, verilen: { wood: 99999 } };
  assert.equal(gs.getDungeonModeInfo().gecis.verilen.wood, 0, 'başka hedef moda ait katkı sayılmaz');
  gs.state.dungeonGate = 'bozuk'; assert.equal(gs.getDungeonModeInfo().gecis.verilen.wood, 0);
  ok('eksik/bozuk mod alanı Normal sayılır; başka hedef moda ait katkı kaydı yok sayılır');
}

// 8) Sunucu işlem listesi: yeni işlemler tanımlı ve doğrulanıyor; tek savaşa en çok 25 asker
{
  assert.ok(ACTIONS.advanceDungeonMode && ACTIONS.contributeToDungeonGate);
  assert.ok(!ACTIONS.advanceDungeonMode.random && !ACTIONS.contributeToDungeonGate.random, 'şansa bağlı değil');
  assert.ok(gecerli('advanceDungeonMode', []));
  assert.ok(gecerli('contributeToDungeonGate', [{ wood: 100, iron: 5 }]));
  for (const kotu of [[{ bilinmeyen: 5 }], [{ wood: -1 }], [{ wood: 'x' }], [null], [[1]], []]) assert.ok(!gecerli('contributeToDungeonGate', kotu), JSON.stringify(kotu));
  const idx = (n) => Array.from({ length: n }, (_, i) => i);
  assert.ok(gecerli('fightDungeon', [1, idx(25)]), '25 asker kabul');
  assert.ok(!gecerli('fightDungeon', [1, idx(26)]), '26 asker reddedilir');
  ok('yeni işlemler listede ve doğrulanıyor; tek savaşa en çok 25 asker');
}

console.log(`\n${toplam} zindan modu kontrolü geçti.`);
process.exit(0);
