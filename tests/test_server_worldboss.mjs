// Sunucu — ortak dünya bossu: bütün kilitli ordular aynı bossa vurur, kasanın haftalık %10'u hasara göre bölünür
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';

const db = openDb(':memory:');
const E = await createEngine(db);
const world = createWorld({ db, engine: E, cfg: { ...loadConfig({}), dbFile: ':memory:' }, log: { warn() {}, error() {} } });

const P = ['0x' + 'd4'.repeat(20), '0x' + 'e5'.repeat(20), '0x' + 'f6'.repeat(20)];
for (const [i, a] of P.entries()) {
  db.q.playerAdd.run(a, Date.now(), Date.now());
  E.withPlayer(a, () => null);
  E.mutatePlayer(a, gs => { gs.state.adAstraBalance += 200000; gs.state.level = 5; gs.state.dungeonProgress = 7; });   // 3. kat: asker hakkı 4
  for (let k = 0; k <= i; k++) assert.ok(E.act(a, 'buySoldierUnit', []).result.success);   // 1, 2, 3 asker
}
// İlk ikisi ordusunu kilitler, üçüncüsü kilitlemez
for (const a of P.slice(0, 2)) assert.ok(E.act(a, 'stakeArmyForWorldBoss', []).result.success);

const pool = E.treasury.getPool('worldBoss');
const t = E.gs.getWorldBossSchedule(Date.now()).lastBattleTime;
const info = world.runWorldBoss(t);
assert.equal(info.fighters, 2, 'Yalnız kilitli ordular savaşır');
assert.ok(info.paid <= Math.floor(pool * 0.10) && info.paid > 0, 'Dağıtılan, kasanın %10\'unu geçmez');
const b0 = E.readPlayer(P[0]).worldBoss, b1 = E.readPlayer(P[1]).worldBoss;
assert.ok(b1.userDamage > b0.userDamage, '2 askerli ordu daha çok hasar verir');
assert.ok(Math.abs(b0.claimableRewardAda / b1.claimableRewardAda - b0.userDamage / b1.userDamage) < 0.01, 'Ödül hasarla orantılı');
assert.equal(b0.userStaked, false, 'Savaştan sonra kilit açılır');
assert.ok(Math.abs(E.treasury.getPool('worldBoss') - (pool - info.paid)) < 1, 'Ödül boss kasasından çıktı');
console.log('✅ Ortak savaş: hasara göre pay, kasanın en fazla %10\'u');

const before = E.readPlayer(P[0]).adAstraBalance;
const cl = E.act(P[0], 'claimWorldBossReward', []);
assert.ok(cl.result.success, cl.result.message);
assert.ok(cl.state.adAstraBalance - before >= b0.claimableRewardAda - 1, 'Ödül toplandı');
console.log('✅ Ödül toplanıyor');

await world.tick();
assert.equal(E.readPlayer(P[1]).worldBoss.claimableRewardAda, b1.claimableRewardAda, 'Aynı savaş ikinci kez yapılmaz');
console.log('✅ Aynı hafta ikinci savaş yok');
console.log('\n3 dünya bossu kontrolü geçti.');
