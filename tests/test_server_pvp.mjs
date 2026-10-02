// Sunucu — Kolezyum: gerçek oyunculara karşı maç (eşleşme, kilit, iade, tekrar izleme, haftalık ödül)
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createArena } from '../server/arena.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';
import { explainLoss, weeklyRewards, PVP_RULES } from '../js/economy/pvp.js';

let passed = 0;
const ok = name => { passed++; console.log(`✅ ${name}`); };

// Saf kurallar
{
  const weak = [{ atk: 50, maxHp: 300, armor: 10, skills: ['shieldWall'], row: 'front' }];
  const strong = [{ atk: 90, maxHp: 500, armor: 10, skills: ['fieldMedic', 'armorBreaker'], row: 'front' }];
  const why = explainLoss(weak, strong);
  assert.ok(why.some(t => t.includes('saldırısı')) && why.some(t => t.includes('canı')), 'Güç farkı açıklanır');
  assert.ok(why[why.length - 1].startsWith('Öneri'), 'Sonunda öneri var');
  const r = weeklyRewards({ x: { points: 3, wins: 1 }, y: { points: 5, wins: 5 }, z: { points: 0 } }, 1000000);
  assert.deepEqual(r.map(v => v.id), ['y', 'x'], 'Puansız oyuncu ödül almaz, sıralama puana göre');
  assert.equal(r[0].amount, Math.floor(1e6 * PVP_RULES.weeklyPoolShare * 0.25));
  ok('Neden kaybettin açıklaması ve haftalık ödül sıralaması');
}

const db = openDb(':memory:');
const E = await createEngine(db);
const arena = createArena({ db, engine: E });
const cfg = { ...loadConfig({}), dbFile: ':memory:' };
const world = createWorld({ db, engine: E, arena, cfg, log: { warn() {}, error() {} } });

const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20), C = '0x' + 'c3'.repeat(20);
for (const addr of [A, B, C]) {
  db.q.playerAdd.run(addr, Date.now(), Date.now());
  E.withPlayer(addr, () => null);
  E.mutatePlayer(addr, gs => { gs.state.adAstraBalance += 20000; gs.state.arenaKeys = 5; gs.state.level = 5; });
  const r = E.act(addr, 'buySoldierUnit', []);
  assert.ok(r.result.success, r.result.message);
}

// 1) A sıraya girer, askeri kilitlenir
const q1 = arena.queue(A, '1v1', [0]);
assert.ok(q1.result.success && q1.result.queued, q1.result.message);
assert.equal(q1.state.arenaKeys, 4, 'Giriş bedeli: 1 anahtar');
assert.deepEqual(q1.state.pvpQueue.indices, [0]);
const locked = E.act(A, 'fightDungeon', [1, [0]]);
assert.equal(locked.result.success, false, 'Sıradaki asker zindana giremez');
assert.equal(arena.queue(A, '1v1', [0]).result.success, false, 'İkinci kez sıraya girilmez');
assert.equal(arena.queue(A, '3v3', [0]).result.success, false, '3v3 için 3 asker gerekir');
ok('Sıraya girme: bedel alınıyor, asker kilitleniyor, hatalı seçim reddediliyor');

// 2) B gelir, maç hemen oynanır
const q2 = arena.queue(B, '1v1', [0]);
assert.ok(q2.result.success && q2.result.matched, q2.result.message);
assert.ok(q2.result.sim && Array.isArray(q2.result.sim.rounds), 'Savaş kaydı döner');
const aAfter = E.readPlayer(A);
assert.equal(aAfter.pvpQueue, null, 'A\'nın kilidi açıldı');
assert.equal(aAfter.pvpMatches.length, 1, 'A maç kaydını aldı');
assert.ok(aAfter.pendingNotices.some(n => n.message.includes('Kolezyum')), 'A bildirim aldı');
const st = arena.status(B);
const pts = q2.result.result === 'win' ? 1 : 0;
assert.equal(st.mine ? st.mine.points : 0, pts, 'Kazanan 1v1 için 1 puan alır');
if (q2.result.result === 'loss') assert.ok(Array.isArray(q2.result.why) && q2.result.why.length >= 1, 'Kaybedene neden açıklanır');
const loser = q2.result.result === 'win' ? aAfter.pvpMatches[0] : null;
if (loser) assert.ok(Array.isArray(loser.why), 'Bekleyen taraf kaybettiyse nedeni kaydedilir');
const m = arena.getMatch(q2.result.matchId);
assert.ok(m && m.sim && m.a.units.length === 1 && m.b.units.length === 1, 'Maç tekrar izlenebilir');
ok('Eşleşme: maç sunucuda oynanıyor, puan, bildirim, neden ve tekrar izleme');

// 3) Sıradan çıkınca iade
const keysBefore = E.readPlayer(C).arenaKeys;
assert.ok(arena.queue(C, '1v1', [0]).result.queued);
const lv = arena.leave(C);
assert.ok(lv.result.success);
assert.equal(lv.state.arenaKeys, keysBefore, 'Anahtar iade edildi');
assert.equal(lv.state.pvpQueue, null);
assert.equal(arena.status(A).waiting['1v1'], 0, 'Sıra boş');
ok('Sıradan çıkış: bedel iade, kilit açılıyor');

// 4) Haftalık: ilk 10'a Kolezyum kasasından ödül, sıralama sıfırlanır
if (pts === 0 && q2.result.result !== 'win') {
  // A kazanmış olmalı (ya da berabere); berabere ise ödül yok
}
const winnerAddr = q2.result.result === 'win' ? B : q2.result.result === 'loss' ? A : null;
const arenaPool = E.treasury.getPool('arena');
const balBefore = winnerAddr ? E.readPlayer(winnerAddr).adAstraBalance : 0;
const summary = world.settleWeek(E.globalPool.state.epochId, null);
if (winnerAddr) {
  assert.equal(summary.pvp.players, 1);
  const expect = Math.floor(arenaPool * PVP_RULES.weeklyPoolShare * 0.25);
  assert.ok(Math.abs(E.readPlayer(winnerAddr).adAstraBalance - balBefore - expect) < 1, 'Birinciye kasanın %30 × %25\'i');
  assert.ok(Math.abs(E.treasury.getPool('arena') - (arenaPool - expect)) < 1, 'Ödül Kolezyum kasasından çıktı');
}
assert.equal(arena.status(A).top.length, 0, 'Sıralama yeni haftada sıfırlandı');
ok('Haftalık sıralama ödülü ve sıfırlama');

console.log(`\n${passed} PvP kontrolü geçti.`);
