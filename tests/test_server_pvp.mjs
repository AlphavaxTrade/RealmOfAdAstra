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
const FEE = E.readPlayer(A).adAstraBalance;   // ücret düşmeden önceki bakiye (aşağıda farkı ölçülür)
const havuz0 = E.treasury.getPool('arena');
const ucret = E.withPlayer(A, gs => gs.getColosseumEntryFee()).result;
assert.equal(ucret, E.GAME_CONFIG.COLOSSEUM.ENTRY_FEE_ASTRA * E.withPlayer(A, gs => gs.adaPrice(1)).result, 'ücret ayardaki tutar × fiyat çarpanı');
const q1 = arena.queue(A, '1v1', [0]);
assert.ok(q1.result.success && q1.result.queued, q1.result.message);
assert.equal(q1.state.arenaKeys, 5, 'Giriş anahtar harcamaz');
assert.ok(Math.abs(FEE - q1.state.adAstraBalance - ucret) < 1e-6, 'Giriş bedeli: ASTRA ücreti bakiyeden düştü (emanette)');
assert.equal(E.treasury.getPool('arena'), havuz0, 'Maç bulunana kadar ücret emanette: arena kasasına girmedi');
assert.equal(q1.state.pvpQueue.fee, ucret, 'ücret sıra kaydında');
assert.deepEqual(q1.state.pvpQueue.indices, [0]);
const locked = E.act(A, 'fightDungeon', [1, [0]]);
assert.equal(locked.result.success, false, 'Sıradaki asker zindana giremez');
assert.equal(arena.queue(A, '1v1', [0]).result.success, false, 'İkinci kez sıraya girilmez');
assert.equal(arena.queue(A, '3v3', [0]).result.success, false, '3v3 için 3 asker gerekir');
ok('Sıraya girme: bedel alınıyor, asker kilitleniyor, hatalı seçim reddediliyor');

// 2) B gelir, maç hemen oynanır
const q2 = arena.queue(B, '1v1', [0]);
assert.ok(q2.result.success && q2.result.matched, q2.result.message);
assert.ok(E.treasury.getPool('arena') >= havuz0 + 2 * ucret * E.GAME_CONFIG.COLOSSEUM.ENTRY_ARENA_SHARE - 1e-6, 'Maç bulununca iki ücretin arena payı arena kasasına girdi');
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

// 2b) Maç tekrarı bilerek herkese açık (Kolezyum sıralaması gibi); ama hesap/cüzdan kimliği sızmamalı (kurumsal A2.6)
{
  const ham = JSON.stringify(arena.getMatch(q2.result.matchId));
  for (const adres of [A, B]) assert.ok(!ham.toLowerCase().includes(adres.toLowerCase()), 'tam cüzdan adresi sızmamalı');
  assert.ok(!/"address"|"id":"acc:|@/.test(ham), 'adres/hesap kimliği/e-posta alanı olmamalı');
  const m2 = arena.getMatch(q2.result.matchId);
  assert.deepEqual(Object.keys(m2).sort(), ['a', 'at', 'b', 'id', 'mode', 'points', 'result', 'sim']);
  assert.deepEqual(Object.keys(m2.a).sort(), ['name', 'units'], 'taraf yalnız ad ve takım içerir');
  assert.equal(arena.getMatch(999999), null, 'olmayan maç bulunamaz');
  for (const satir of arena.status(A).top) assert.equal(satir.id, undefined, 'sıralamada kimlik yok');
  ok('Maç tekrarı herkese açık ama hesap/cüzdan kimliği sızdırmaz');
}

// 3) Sıradan çıkınca iade
const bakiyeC = E.readPlayer(C).adAstraBalance, staminaC = Math.floor(E.readPlayer(C).stamina), havuzC = E.treasury.getPool('arena');
assert.ok(arena.queue(C, '1v1', [0]).result.queued);
const lv = arena.leave(C);
assert.ok(lv.result.success);
assert.ok(Math.abs(lv.state.adAstraBalance - bakiyeC) < 1e-6, 'Giriş ücreti iade edildi');
assert.equal(E.treasury.getPool('arena'), havuzC, 'Sıradan çıkan oyuncunun ücreti arena kasasına geçmedi');
assert.ok(Math.floor(lv.state.stamina) >= staminaC - 1, 'Stamina iade edildi');
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
const keysBeforeWeek = winnerAddr ? E.readPlayer(winnerAddr).arenaKeys : 0;
const summary = world.settleWeek(E.globalPool.state.epochId, null);
if (winnerAddr) {
  assert.equal(summary.pvp.players, 1);
  const expect = Math.floor(arenaPool * PVP_RULES.weeklyPoolShare * 0.25);
  assert.ok(Math.abs(E.readPlayer(winnerAddr).adAstraBalance - balBefore - expect) < 1, 'Birinciye kasanın %30 × %25\'i');
  // İlk 3'e birer anahtar (COLOSSEUM.HAFTALIK_ANAHTAR): havadan basılır, arena kasasından para çıkmaz (pazar havuzu yok)
  assert.equal(E.readPlayer(winnerAddr).arenaKeys, keysBeforeWeek + 1, 'Haftalık 1.ye 1 anahtar verildi');
  assert.ok(Math.abs(E.treasury.getPool('arena') - (arenaPool - expect)) < 1, 'Yalnız ASTRA ödülü Kolezyum kasasından çıktı; anahtar kasadan ödenmedi');
  assert.equal(arena.status(winnerAddr).lastWeek.rewards[0].key, 1, 'Geçen hafta kaydında anahtar işaretli');
}
assert.equal(arena.status(A).top.length, 0, 'Sıralama yeni haftada sıfırlandı');
ok('Haftalık sıralama ödülü ve sıfırlama');

console.log(`\n${passed} PvP kontrolü geçti.`);
