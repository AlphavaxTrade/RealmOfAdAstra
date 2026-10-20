// Otomatik dizilim (20 Ekim 2026): seçili askerlerin ön/arka saf dağılımı savaş motoruyla aranır; sonuç şimdiki dizilimden kötü olmaz, deterministiktir,
// düşmüş askeri dışarıda bırakır, askerlerin satırlarını gerçekten değiştirir, çok askerde zaman sınırı içinde biter.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { globalPool } = await import('../js/globalPool.js');
const { ammMarket } = await import('../js/ammMarket.js');
const { treasury } = await import('../js/treasury.js');
const { getDungeonEntry } = await import('../js/bestiary.js');

const YETENEK = [['shieldWall'], ['armorBreaker'], ['fieldMedic'], ['bloodFrenzy'], ['stunStrike'], ['lastStand'], ['shockwave'], ['shieldWall']];
function ordu(n, { guc = 1 } = {}) {
  depo.clear();
  ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const g = new GameStateManager();
  g.state.level = 30; g.state.dungeonProgress = 18;
  for (let i = 0; i < n; i++) {
    g.state.soldierUnits.push({ id: 's' + i, name: 'S' + i, level: 10 + (i % 8), maxHp: Math.round((700 + (i % 8) * 100) * guc), hp: Math.round((700 + (i % 8) * 100) * guc), baseAtk: Math.round((130 + (i % 3) * 40) * guc),
      skills: YETENEK[i % YETENEK.length], row: 'front', equipment: {}, baseArmor: 10, baseSpeed: 10, baseCrit: 0.05, basePen: 5 });
  }
  return g;
}
const canavar = (sv) => getDungeonEntry(sv, 0);

// 1) 8 asker: bütün dizilimler denenir (256), sonuç şimdiki (hepsi önde) dizilimden kötü değil ve zayıf bir canavarda bile geçerli satırlar döner
{
  const g = ordu(8);
  const secili = [...g.state.soldierUnits.keys()];
  const m = canavar(12);
  const r = g.findBestFormation(m, secili);
  assert.equal(r.denenen, 256, '8 askerde 2^8 dizilimin hepsi denendi');
  assert.ok(r.winChance >= r.oncekiSans, `en iyi dizilim şimdikinden kötü olamaz: %${r.winChance} ≥ %${r.oncekiSans}`);
  assert.ok(r.winChance > r.oncekiSans, `bu orduda dizilim fark yaratır (hepsi önde %${r.oncekiSans} → en iyi %${r.winChance})`);
  assert.equal(r.on + r.arka, 8);
  for (const i of secili) assert.ok(['front', 'back'].includes(r.rows[i]));
  assert.ok(r.sureMs < 10000, `makul sürede bitti (${r.sureMs} ms)`);

  // Belirleyici: aynı durumda aynı dizilim
  const r2 = g.findBestFormation(m, secili);
  assert.deepEqual(r2.rows, r.rows, 'aynı girdi, aynı dizilim');

  // Uygulama: askerlerin satırları gerçekten değişir ve savaş şansı önerilene eşit olur
  const u = g.autoArrangeFormation(m, secili);
  for (const i of secili) assert.equal(g.state.soldierUnits[i].row, u.rows[i], 'satır uygulandı');
  assert.equal(u.uygulandi, u.degisen.length);
  const sonra = g.findBestFormation(m, secili);
  assert.equal(sonra.degisen.length, 0, 'uygulanmış dizilimde ikinci çağrı değişiklik önermez');
}
console.log('✅ 8 asker: tam arama, iyileştirme, belirleyicilik, uygulama');

// 2) Düşmüş asker dizilime katılmaz; tek asker; boş seçim
{
  const g = ordu(4);
  g.setSoldierHpFromBattle(2, 0, { dusebilir: true });
  const r = g.findBestFormation(canavar(9), [0, 1, 2, 3]);
  assert.equal(r.on + r.arka, 3, 'düşmüş asker hesaba girmez');
  assert.equal(r.rows[2], undefined);
  const tek = g.findBestFormation(canavar(9), [0]);
  assert.equal(tek.denenen, 2, 'tek askerde iki dizilim');
  assert.equal(g.findBestFormation(canavar(9), []), null);
  assert.equal(g.autoArrangeFormation(canavar(9), []), null);
}
console.log('✅ düşmüş asker, tek asker, boş seçim');

// 3) Çok asker (12): zaman sınırı içinde biter, şimdikinden kötü değil
{
  const g = ordu(12);
  const secili = [...g.state.soldierUnits.keys()];
  const t0 = Date.now();
  const r = g.findBestFormation(canavar(12), secili, { sureMs: 1500 });
  const sure = Date.now() - t0;
  assert.ok(r.winChance >= r.oncekiSans, `%${r.winChance} ≥ %${r.oncekiSans}`);
  assert.equal(r.on + r.arka, 12);
  assert.ok(sure < 15000, `12 askerde makul sürede bitti (${sure} ms)`);
  assert.ok(r.denenen > 12 && r.denenen < 4096, `tam arama değil, yerel iyileştirme (${r.denenen} aday)`);
}
console.log('✅ 12 asker: yerel iyileştirme zaman sınırında');

// 4) Oyuncunun elle verdiği iyi bir dizilim korunur: şimdikiyle eşit çıkan dizilimde satırlar değişmez
{
  const g = ordu(3, { guc: 3 });   // çok güçlü ordu: her dizilim %100 kazanır ve kayıp aynı → şimdiki korunur
  g.state.soldierUnits[1].row = 'back';
  const once = g.state.soldierUnits.map((a) => a.row);
  const u = g.autoArrangeFormation(canavar(1), [0, 1, 2]);
  const sonra = g.state.soldierUnits.map((a) => a.row);
  if (u.degisen.length === 0) assert.deepEqual(sonra, once, 'eşit durumda elle verilen dizilim korunur');
  assert.ok(u.winChance >= u.oncekiSans);
}
console.log('✅ eşit durumda elle verilen dizilim korunur');
console.log('\n4 otomatik dizilim bloğu geçti.');
