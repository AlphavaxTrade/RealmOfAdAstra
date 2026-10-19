// "Önce parşömen, sonra şifalı ot" (19 Ekim 2026): elde İyileştirme Parşömeni varsa hızlı iyileştirme önce onu kullanır, kalan yarayı otla kapatır.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const { hizliIyilestir, iyilestirmeParsomeni } = await import('../js/ui/ekran/bilesik.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const bildirimler = [];
const b = (gs) => ({ gameState: gs, bildir: (m) => bildirimler.push(m) });
const hazirla = (parsomen, yaralanma = 0.3) => {
  depo.clear();
  const gs = new GameStateManager();
  gs.setDevAdAstra(1e7);
  gs.state.soldierUnits = [];
  for (let i = 0; i < 3; i++) gs.buySoldierUnit();
  for (const s of gs.state.soldierUnits) s.hp = (s.maxHp || 100) * yaralanma;
  gs.state.inventory.scroll_heal = parsomen;
  gs.state.warehouseLevel = 30; gs.state.inventory.herb = 5000;
  return gs;
};
const eksikCan = (gs) => gs.state.soldierUnits.reduce((t, _, i) => t + (gs.getHerbHealInfo(i).missingBattleHp || 0), 0);

// 1) Parşömen yoksa düğme sayısı 0; yaralı yoksa da 0
{
  assert.equal(iyilestirmeParsomeni(hazirla(0)), 0);
  const saglam = hazirla(5, 1);
  assert.equal(iyilestirmeParsomeni(saglam), 0, 'yaralı yoksa öneri çıkmaz');
  assert.equal(iyilestirmeParsomeni(hazirla(5)), 5);
  ok('öneri yalnız parşömen VE yaralı varken çıkar');
}

// 2) Parşömen önce harcanır, kalan yara otla kapanır; hepsi tam can
{
  const gs = hazirla(2);
  const ot0 = gs.state.inventory.herb;
  const onceki = eksikCan(gs);
  const r = await hizliIyilestir(b(gs), null, { parsomenOnce: true });
  assert.equal(r.hata, false);
  assert.equal(r.parsomen, 2, 'eldeki 2 parşömenin ikisi de kullanıldı');
  assert.equal(gs.state.inventory.scroll_heal, 0, 'parşömenler harcandı');
  assert.ok(gs.state.inventory.herb < ot0, 'kalan yara için şifalı ot da harcandı');
  assert.equal(eksikCan(gs), 0, 'hepsi tam can');
  assert.ok(onceki > 0);
  ok('önce parşömen, sonra şifalı ot; ordu tam can');
}

// 3) Çok parşömen: ot hiç harcanmaz; parşömen boşa gitmez (kalan eksik parşömenin yarısından azsa kullanılmaz)
{
  const gs = hazirla(1000, 0.97);
  const ot0 = gs.state.inventory.herb;
  const p = gs.useHealScrollsFirst(null);
  assert.ok(p.used >= 0 && gs.state.inventory.scroll_heal === 1000 - p.used);
  assert.equal(gs.state.inventory.herb, ot0, 'parşömen adımı ot harcamaz');
  const yarim = gs.getHerbHealInfo(0).missingBattleHp;
  assert.ok(yarim < 2 + 1e-9 || p.used > 0, 'çok az eksik kalan askerde parşömen harcanmadı');
  ok('parşömen adımı ot harcamaz, boşa parşömen yakmaz');
}

// 4) Tek asker: yalnız o asker iyileşir
{
  const gs = hazirla(50);
  const son = gs.state.soldierUnits.length - 1;
  const once = gs.getHerbHealInfo(son).missingBattleHp;
  const r = gs.useHealScrollsFirst(0);
  assert.ok(r.used > 0);
  assert.equal(gs.getHerbHealInfo(son).missingBattleHp, once, 'diğer askere dokunulmadı');
  assert.ok(gs.getHerbHealInfo(0).missingBattleHp < once, 'seçilen asker iyileşti');
  ok('tek askerde yalnız o asker');
}

console.log(`\n${n} parşömen-önce kontrolü geçti.`);
