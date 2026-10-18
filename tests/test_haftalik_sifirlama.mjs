// Haftalık sıfırlama zamanı (Pazartesi 00:01 TSİ) ve "ilk güne dön" (vanilla reset) sonrası başlangıç durumu:
// haftalık kota, pazar havuzları koridor fiyatında, hazine tohumları, piyango, dünya bossu, Kolezyum, zindan.
// 11 Ekim 2026'da test_weekly_reset_and_vanilla.mjs'ten baştan yazıldı.
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

// 1) Sıfırlama anı: Pazartesi 00:01 TSİ = Pazar 21:01 UTC; geçildiyse sonraki hafta
{
  const sonraki = (iso) => new Date(globalPool.getNextWeeklyResetTRT(new Date(iso).getTime())).toISOString();
  assert.equal(sonraki('2026-09-13T12:00:00Z'), '2026-09-13T21:01:00.000Z', 'Pazar öğleden sonra → aynı gecenin 00:01 TSİ\'si');
  assert.equal(sonraki('2026-09-13T21:00:30Z'), '2026-09-13T21:01:00.000Z', '00:01\'den 30 saniye önce → 30 saniye sonra');
  assert.equal(sonraki('2026-09-13T21:02:00Z'), '2026-09-20T21:01:00.000Z', '00:01 geçildi → sonraki hafta');
}
console.log('✅ sıfırlama zamanı');

// 2) Vanilla reset: haftalık kota tam, havuzlar koridor fiyatında, tohumlar yerinde
const gs = new GameStateManager();
{
  for (const [k, miktar] of [['wood', 80000], ['wheat', 200000], ['iron', 50000]]) {
    globalPool.harvest(k, miktar);
    assert.ok(globalPool.state.resources[k].remaining < GAME_CONFIG.GLOBAL_RESOURCE_CAPS[k].totalCap, `${k} kotası eksilmiş`);
  }
  gs.vanillaReset();
  for (const k of ['wood', 'wheat', 'iron']) {
    assert.equal(globalPool.state.resources[k].remaining, GAME_CONFIG.GLOBAL_RESOURCE_CAPS[k].totalCap, `${k} kotası tam kapasiteye döner`);
  }

  const p = ammMarket.pools;
  for (const k of ['wheat', 'wood', 'iron']) {
    const fiyat = p[k].adAstraReserve / p[k].resourceReserve;
    assert.ok(Math.abs(fiyat - GAME_CONFIG.AMM_CORRIDORS[k].defaultPriceAda) < 0.01, `${k} havuzu koridor fiyatında`);
  }
  assert.ok(p.fragments.adAstraReserve > 0, 'parça havuzu fonlu');
  assert.ok(!p.boxes && !p.keys, 'Pandora kutusu ve Anahtar havuzları kaldırıldı');

  const tohum = GAME_CONFIG.TREASURY_SEED;
  for (const [kasa, miktar] of Object.entries(tohum)) assert.equal(treasury.state.pools[kasa], miktar, `${kasa} kasası tohumda`);
  assert.equal(
    Object.values(treasury.state.pools).reduce((a, v) => a + v, 0),
    Object.values(tohum).reduce((a, v) => a + v, 0),
    'kasa toplamı tohum toplamına eşit'
  );

  assert.equal(gs.state.lotteryPool, GAME_CONFIG.CARNIVAL.LOTTERY.SEED_POOL_ADA);
  assert.equal(gs.state.lotteryTickets, 0);
}
console.log('✅ ilk güne dönüş: kota, havuzlar, kasalar, piyango');

// 3) Dünya bossu, Kolezyum ve zindan sıfırlanır
{
  const wb = gs.getWorldBossInfo();
  assert.equal(wb.bossHp, 1000000);
  assert.equal(wb.maxBossHp, 1000000);
  // Haftanın havuzu kasanın %3'üdür (eskiden ekran kasanın tamamını havuz diye gösteriyordu); kasadaki toplam ayrıca durur
  assert.equal(wb.weeklyAdaPool, Math.round(GAME_CONFIG.TREASURY_SEED.worldBoss * GAME_CONFIG.WORLD_BOSS.WEEKLY_DISTRIBUTION_RATE));
  assert.equal(wb.vaultAda, GAME_CONFIG.TREASURY_SEED.worldBoss);
  assert.equal(wb.userStaked, false);
  assert.equal(wb.userDamage, 0);
  assert.equal(wb.claimableRewardAda, 0);

  const kol = gs.state.colosseumStats;
  assert.deepEqual([kol.wins, kol.losses, kol.score, kol.rating], [0, 0, 0, 1000]);
  assert.equal(gs.state.colosseumLeaderboard, undefined, 'sahte bot sıralaması yok');

  assert.equal(gs.state.dungeonProgress, 1);
  assert.equal(Object.keys(gs.state.dungeonMonsterCurrentHp || {}).length, 0);
}
console.log('✅ dünya bossu, Kolezyum, zindan');

console.log('\n3/3 haftalık sıfırlama bloğu geçti.');
