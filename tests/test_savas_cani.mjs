// Savaş canı (18 Ekim 2026): askerin kayıtlı canı TABAN ölçeğinde (Kışla / Şifahane), savaş canı teçhizatlı TOPLAM ölçeğinde tutulur;
// savaşa girerken oran korunur, çıkarken tabana geri çevrilir. Eski hata: tam sağlıklı 100/100 asker 313'lük çubukta 100'le başlıyordu.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: (k) => { depo.delete(k); } };
const { ordu } = await import('../scripts/model/zindan_denge.mjs');
const { getDungeonEntry } = await import('../js/bestiary.js');

let toplam = 0;
const ok = (ad) => { toplam++; console.log(`✅ ${ad}`); };

// 1) Tam sağlıklı, teçhizatlı asker toplam canla başlar (eskiden taban canla başlıyordu)
{
  const gs = ordu(2, 10, 5);
  const taban = gs.state.soldierUnits[0].maxHp, f = gs.getSoldierFullStats(0);
  assert.ok(f.totalMaxHp > taban * 1.5, 'teçhizat can ekler (bu testin önkoşulu)');
  assert.equal(gs.state.soldierUnits[0].hp, taban, 'kayıtlı can taban ölçeğinde (Kışla bunu 100/100 gösterir)');
  assert.deepEqual(gs.getSoldierBattleStart(0), { hp: f.totalMaxHp, maxHp: f.totalMaxHp });
  const k = gs.buildDungeonBattleUnits(getDungeonEntry(3), [0, 1]);
  for (const u of k.allies) assert.equal(u.hp, u.maxHp, 'savaş birimi tam canla başlar');
  ok('tam sağlıklı teçhizatlı asker savaşa tam toplam canla girer');
}

// 2) Yaralı asker oranı korur
{
  const gs = ordu(1, 10, 5);
  const a = gs.state.soldierUnits[0], f = gs.getSoldierFullStats(0);
  a.hp = a.maxHp / 2;
  const b = gs.getSoldierBattleStart(0);
  assert.equal(b.maxHp, f.totalMaxHp);
  assert.ok(Math.abs(b.hp - f.totalMaxHp / 2) <= 1, `yarı sağlıklı asker yarı canla başlar: ${b.hp}/${f.totalMaxHp}`);
  a.hp = 0;
  assert.equal(gs.getSoldierBattleStart(0).hp, 1, 'en az 1');
  ok('yaralı asker aynı oranla başlar; en az 1');
}

// 3) Savaş sonu: toplam ölçekten tabana çevirir, tabanı aşmaz, en az 1
{
  const gs = ordu(1, 10, 5);
  const a = gs.state.soldierUnits[0], f = gs.getSoldierFullStats(0);
  gs.setSoldierHpFromBattle(0, f.totalMaxHp);
  assert.equal(a.hp, a.maxHp, 'tam canla çıkan asker tam sağlıklı kalır (yaralı sayılmaz)');
  gs.setSoldierHpFromBattle(0, f.totalMaxHp / 4);
  assert.ok(Math.abs(a.hp - a.maxHp / 4) <= 1, 'çeyrek canla çıkan asker taban ölçeğinde çeyrek');
  gs.setSoldierHpFromBattle(0, 0); assert.equal(a.hp, 1, 'ölmez');
  gs.setSoldierHpFromBattle(0, f.totalMaxHp * 5); assert.equal(a.hp, a.maxHp, 'tabanı aşmaz');
  gs.setSoldierHpFromBattle(0, undefined); assert.equal(a.hp, 1);
  gs.setSoldierHpFromBattle(99, 10);   // olmayan asker sessizce geçer
  ok('savaş sonu can toplam ölçekten tabana çevrilir (en az 1, tabanı aşmaz)');
}

// 4) Gerçek savaş: kayıtlı can taban ölçeğinde kalır, tam sağlıklı asker haritada "yaralı" sayılmaz
{
  const gs = ordu(3, 10, 5);
  gs.state.stamina = 1e6; gs.state.dungeonProgress = 1;
  assert.equal(gs.getZindanOrduDurumu().yarali, 0, 'tam sağlıklı teçhizatlı ordu yaralı görünmez');
  const kayit = gs.state.soldierUnits.map((a) => a.maxHp);
  const m = getDungeonEntry(1);
  const r = gs.settleDungeonBattle(m, [0, 1, 2], { allies: [0, 1, 2].map((i) => ({ sourceIndex: i, hp: gs.getSoldierFullStats(i).totalMaxHp / 2 })), enemies: [{ hp: 0 }], victory: true, rounds: [] }, { rewarded: false, weaponWear: false, staminaCost: 0 });
  assert.ok(r, 'sonuç işlendi');
  gs.state.soldierUnits.forEach((a, i) => { assert.ok(a.hp <= kayit[i] && Math.abs(a.hp - kayit[i] / 2) <= 1, `kayıtlı can taban ölçeğinde yarım: ${a.hp}/${kayit[i]}`); });
  assert.equal(gs.getZindanOrduDurumu().yarali, 3, 'yaralılar sayılır');
  ok('savaş sonucu kayıtlı canı taban ölçeğinde yazar; ordu şeridi doğru sayar');
}

console.log(`\nSavaş canı testleri geçti (${toplam}).`);
