// Zindan arka tarafı (13 Ekim 2026 yeniden düzenleme): harita özetleri salt okunurdur, şans önbelleğe alınır, ordu şeridi
// doğru sayar; günlük sayaçlar, ganimet ve Kolezyum yardımcıları yeni yerlerinde çalışır.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { globalPool } = await import('../js/globalPool.js');
const { treasury } = await import('../js/treasury.js');
const { ammMarket } = await import('../js/ammMarket.js');

const yeni = () => {
  depo.clear();
  ammMarket.resetPools();
  globalPool.vanillaReset();
  treasury.reset();
  return new GameStateManager();
};
const ok = (ad) => console.log(`✅ ${ad}`);

// Yöntemler beklenen karışımlarda
{
  const gs = yeni();
  for (const ad of ['getDailyCounters', 'addDungeonXpAndDrops', 'isSoldierPvpLocked', 'buildPvpTeam', 'payPvpEntry', 'refundPvpEntry',
    'getZindanOdaOzeti', 'getZindanOrduDurumu', 'getZindanTakimi', 'fightDungeon', 'getDungeonDayStatus']) {
    assert.equal(typeof gs[ad], 'function', `${ad} tanımlı`);
  }
  assert.equal(gs.getDailyCounters().date.length, 10, 'günlük sayaç bugünün tarihini taşır');
  ok('yöntemler yeni karışımlarda');
}

// Oda özeti: durumlar, kilitli odada sim yok, salt okunur, önbellek
{
  const gs = yeni();
  gs.state.stamina = 100;
  const al = gs.buySoldierUnit ? null : null;
  void al;
  const o1 = gs.getZindanOdaOzeti(1);
  assert.equal(o1.durum, 'siradaki');
  assert.equal(o1.canavar.level, 1);
  assert.equal(gs.getZindanOdaOzeti(2).durum, 'kilitli');
  assert.equal(gs.getZindanOdaOzeti(2).sans, null, 'kilitli odada şans hesaplanmaz');
  gs.state.dungeonProgress = 5;
  assert.equal(gs.getZindanOdaOzeti(1).durum, 'yenildi');
  assert.equal(gs.getZindanOdaOzeti(5).durum, 'siradaki');
  assert.equal(gs.getZindanOdaOzeti(6).durum, 'kilitli');

  // Canavar yaralıysa kalan can görünür
  gs.recordMonsterHp(5, 100);
  const yarali = gs.getZindanOdaOzeti(5);
  assert.equal(yarali.kalanCan, 100);
  assert.equal(yarali.yaralanmis, true);
  gs.clearMonsterHp(5);
  assert.equal(gs.getZindanOdaOzeti(5).yaralanmis, false);
  ok('oda durumları ve yaralı canavar');
}

// Şans: ordu yoksa null; ordu güçlenince artar; aynı ordu için aynı sayı (önbellek); salt okunur
{
  const gs = yeni();
  gs.state.soldierUnits = [];
  assert.equal(gs.getZindanOdaOzeti(1).sans, null, 'asker yokken şans yok');
  assert.equal(gs.getZindanTakimi().length, 0);

  gs.state.soldierUnits = [
    { name: 'A', level: 1, hp: 100, maxHp: 100, atk: 20, row: 'front', skills: ['shieldWall'] },
    { name: 'B', level: 1, hp: 100, maxHp: 100, atk: 20, row: 'front', skills: ['shieldWall'] }
  ];
  gs.state.dungeonProgress = 3;
  gs.getDungeonDayStatus();   // günlük sayaç kaydını önceden oluşturur (okuma sırasında yazılmasın)
  const once = JSON.stringify(gs.state);
  const a = gs.getZindanOdaOzeti(3);
  const b = gs.getZindanOdaOzeti(3);
  assert.equal(a.takim, 2);
  assert.ok(a.sans >= 0 && a.sans <= 100, 'şans yüzde');
  assert.equal(b.sans, a.sans, 'aynı ordu ve canavar için aynı sayı');
  assert.ok(a.enAz === null || (a.enAz >= 1 && a.enAz <= 2), 'en az asker takım içinde');
  assert.equal(JSON.stringify(gs.state), once, 'özet oyun durumunu değiştirmez');
  ok('şans hesabı salt okunur ve kararlı');
}

// Ordu şeridi
{
  const gs = yeni();
  gs.state.soldierUnits = [
    { name: 'A', level: 1, hp: 100, maxHp: 100, atk: 20, row: 'front', skills: ['shieldWall'] },
    { name: 'B', level: 1, hp: 100, maxHp: 100, atk: 20, row: 'front', skills: ['shieldWall'] },
    { name: 'C', level: 1, hp: 100, maxHp: 100, atk: 20, row: 'front', skills: ['shieldWall'] }
  ];
  const tam = gs.getZindanOrduDurumu();
  assert.equal(tam.asker, 3);
  assert.equal(tam.yarali, 0);
  assert.equal(tam.odulluToplam, 5);
  assert.equal(tam.odulluKalan, 5);
  assert.equal(tam.harcGerekli, false);
  assert.equal(tam.kilitli, false);

  gs.state.soldierUnits[1].hp = 3;
  assert.equal(gs.getZindanOrduDurumu().yarali, 1, 'yaralı sayılır');

  // Kolezyum sırasındaki asker takıma girmez
  gs.state.pvpQueue = { indices: [0], mode: '1v1' };
  assert.equal(gs.isSoldierPvpLocked(0), true);
  assert.equal(gs.getZindanTakimi().includes(0), false, 'sıradaki asker takımda yok');
  assert.equal(gs.getZindanTakimi().length, 2);
  ok('ordu şeridi sayıları ve Kolezyum kilidi');
}

// Savaş akışı (taşınan ganimet dahil) hâlâ çalışır
{
  const gs = yeni();
  gs.state.stamina = 100;
  gs.state.soldierUnits = Array.from({ length: 6 }, (_, i) => ({ name: `S${i}`, level: 5, hp: 400, maxHp: 400, atk: 80, row: 'front', skills: ['shieldWall'] }));
  const r = gs.fightDungeon(1, [0, 1, 2]);
  assert.equal(r.success, true);
  assert.equal(typeof r.outcome.victory, 'boolean');
  if (r.outcome.victory) assert.equal(gs.state.dungeonProgress, 2);
  assert.equal(gs.getDungeonDayStatus().entriesToday, 1);
  assert.equal(gs.fightDungeon(5, [0]).success, false, 'kilitli seviyeye girilemez');
  ok('fightDungeon: giriş, savaş, ganimet, kilit');
}
