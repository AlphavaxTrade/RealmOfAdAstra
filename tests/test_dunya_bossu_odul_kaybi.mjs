// Dünya Bossu: önceki savaştan kalan talep edilebilir ödül, ordu yeniden kilitlenip erken çekilince silinmemeli
// (eski hata: kasadan çoktan çekilmiş ASTRA oyuncunun hesabına hiç geçmeden yok oluyordu).
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: k => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: k => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const g = new GameStateManager();
g.state.adAstraBalance = 1e6;
g.state.dungeonProgress = 7;   // 3. kat: asker hakkı 4 (zindan asker hakkı kuralı, js/economy/ordu-hakki.js)
for (let i = 0; i < 3; i++) assert.ok(g.buySoldierUnit().success);

assert.ok(g.stakeArmyForWorldBoss().success);
const savas = g.executeSundayAutoWorldBossBattle({ force: true });
assert.ok(savas.success && savas.rewardAda > 0, 'savaş ödül vermeli');
const beklenen = g.state.worldBoss.claimableRewardAda;
assert.equal(beklenen, savas.rewardAda);

// Ödülü almadan ordu yeniden kilitlenir, sonra erken çekilir
assert.ok(g.stakeArmyForWorldBoss().success);
const cekilme = g.emergencyUnstakeWorldBossArmy();
assert.ok(cekilme.success);
assert.equal(g.state.worldBoss.claimableRewardAda, beklenen, 'erken çekilme önceki ödülü silmemeli');

// Ödül hâlâ alınabilir
const bakiyeOnce = g.state.adAstraBalance;
const talep = g.claimWorldBossReward();
assert.ok(talep.success);
assert.equal(g.state.adAstraBalance - bakiyeOnce, beklenen);
console.log('✅ erken çekilme önceki savaşın ödülünü silmiyor');
