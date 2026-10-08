// Savaş sonucu animasyondan önce işlenir; arena yalnızca gerçek sonucu oynatır.
// (Önceden zindanda yenilgi sırasında sayfa yenilenirse bedel ödenmiyordu; kolezyumda arena
// kendi rastgele savaşını oynattığı için ekrandaki sonuç ödül ve ELO ile çelişebiliyordu.)
import assert from 'node:assert/strict';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const { GameStateManager } = await import('../js/gameState.js');
const { simulateBattle } = await import('../js/combat.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');

const fresh = () => {
  localStorage.clear();
  ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  gs.state.adAstraBalance = 1e7;
  gs.state.stamina = 1000;
  return gs;
};
const reload = () => new GameStateManager();
let passed = 0;
const ok = (name) => { passed++; console.log(`✅ ${name}`); };

const fight = (gs, monster, indices) => {
  const entry = gs.beginDungeonEntry(monster.level, !!monster.isBoss, { soldierCount: indices.length });
  const setup = gs.buildDungeonBattleUnits(monster, indices);
  const sim = simulateBattle({ allies: setup.allies, enemies: setup.enemies, seed: 42, bossPhases: setup.bossPhases });
  const outcome = gs.settleDungeonBattle(monster, indices, sim, entry);
  return { sim, outcome, entry };
};

// 1) Yenilgi: can kaybı, silah aşınması ve canavarın kalan canı hemen kaydedilir
{
  const gs = fresh();
  gs.buySoldierUnit();
  gs.state.soldierUnits[0].equipment = { weapon: { durability: 13, maxDurability: 13 } };
  gs.state.dailyCounters = { ...gs.getDailyCounters(), dungeonEntries: 1, dungeonRuns: 1 }; // silah aşınsın
  const monster = { level: 3, name: 'Gölge Kurdu', hp: 600, atk: 75, rewardXp: 130 };
  const { sim, outcome } = fight(gs, monster, [0]);
  assert.equal(sim.victory, false, 'Tek asker 3. katı kazanamamalı');
  assert.equal(outcome.victory, false);
  // Animasyon hiç bitmeden sayfa yenilendi: kayıt yine sonucu içermeli
  const after = reload();
  assert.ok(after.state.soldierUnits[0].hp < 100, 'Can kaybı kayıtta olmalı');
  assert.equal(after.state.soldierUnits[0].equipment.weapon.durability, 12, 'Silah aşınması kayıtta olmalı');
  assert.equal(after.getMonsterCurrentHp(3, 600), outcome.remainingEnemyHp, 'Canavarın kalan canı kayıtta olmalı');
  ok('Zindan yenilgisi sayfa yenilense de kayıtta kalır');
}

// 2) Zafer: ödül, ilerleme ve askerin canı hemen kaydedilir
{
  const gs = fresh();
  for (let i = 0; i < 3; i++) gs.buySoldierUnit();
  const monster = { level: 1, name: 'Bataklık Balçığı', hp: 200, atk: 30, rewardXp: 40 };
  const adaBefore = gs.state.adAstraBalance;
  const { sim, outcome } = fight(gs, monster, [0, 1, 2]);
  assert.equal(sim.victory, true);
  assert.equal(outcome.victory, true);
  const after = reload();
  assert.ok(after.state.dungeonProgress >= 2, 'Kat ilerlemesi kayıtta olmalı');
  assert.ok(Math.abs(after.state.adAstraBalance - adaBefore - outcome.adaReward) < 1e-9, 'ADA ödülü kayıtta olmalı');   // ödül artık kesirli olabilir: kayan nokta farkı payı
  assert.ok(outcome.adaReward > 0);
  ok('Zindan zaferi ve ödülü animasyondan önce kaydedilir');
}

// 3) Günün ilk girişinde silah aşınmaz
{
  const gs = fresh();
  for (let i = 0; i < 3; i++) gs.buySoldierUnit();
  gs.state.soldierUnits.forEach(s => { s.equipment = { weapon: { durability: 13, maxDurability: 13 } }; });
  const { outcome, entry } = fight(gs, { level: 1, name: 'x', hp: 200, atk: 30, rewardXp: 1 }, [0, 1, 2]);
  assert.equal(entry.weaponWear, false);
  assert.equal(outcome.weaponsWorn.length, 0);
  assert.ok(gs.state.soldierUnits.every(s => s.equipment.weapon.durability === 13));
  ok('İlk girişte silah aşınması uygulanmaz');
}

// 4) Kolezyum: arena için dönen kayıt, verilen ödül ve ELO ile aynı sonucu taşır
{
  const gs = fresh();
  gs.buySoldierUnit();
  gs.state.arenaKeys = 50;
  let wins = 0, losses = 0;
  for (let i = 0; i < 8; i++) {
    gs.state.soldierUnits[0].hp = gs.state.soldierUnits[0].maxHp;
    const startHp = gs.state.soldierUnits[0].hp;
    const res = gs.executeColosseum1v1Match(0);
    assert.equal(res.success, true, res.message);
    assert.equal(!!res.replay.victory, res.isVictory, 'Oynatılan kayıt gerçek sonuçla aynı olmalı');
    assert.equal(res.championStartHp, startHp, 'Arena savaşa başlangıç canıyla başlamalı');
    assert.equal(res.replay.allies[0].uid, res.allyUid);
    assert.equal(res.replay.enemies[0].uid, res.enemyUid);
    assert.equal(gs.state.soldierUnits[0].hp, Math.max(1, Math.round(res.replay.allies[0].hp)), 'Şampiyonun canı kayıttaki sonuçla aynı olmalı');
    if (res.isVictory) { wins++; assert.ok(res.rewardAda > 0); } else { losses++; assert.equal(res.rewardAda, 0); }
  }
  ok(`Kolezyum: arena gerçek sonucu oynatır (${wins} zafer, ${losses} yenilgi, ödüller tutarlı)`);
}

console.log(`\n${passed} savaş sonucu testi geçti.`);
