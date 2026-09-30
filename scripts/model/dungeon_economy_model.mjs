// Zindan + ordu ekonomi modeli — oyunun gerçek savaş motoru ve asker istatistikleriyle.
// Ortalama bir oyuncuyu gün gün oynatır: tarımdan orduya para ayırır, asker/teçhizat alır,
// günde 5 ödüllü zindan girişi yapar. Canavarlar, oyuncunun hedef takvimdeki ordusuna göre
// %75 kazanma şansına ayarlanır. Normal bittikten sonra sıfırlama bedeli ödenir ve bir üst
// zorluk kademesine geçilir.
//
// Kullanım: node scripts/model/dungeon_economy_model.mjs [ayar=değer ...]
//   I=40000       tarımdan orduya günlük yatırım (ADA)
//   reward=1700   kat başı zafer ödülü (kat × reward; 9. ve 18. kat bossu ×3)
//   cost=2.1      asker ve teçhizat bedel ölçeği
//   tierStat=1.25 bir üst kademede canavar can ve saldırısı çarpanı
//   tierReward=1.5 bir üst kademede ödül ve düşme şansı çarpanı
//   reinvest=0.5  Zor ve sonrası: zindan gelirinin orduya geri yatırılan payı
//   tiers=3 runs=2 out=dosya.json monsters=dosya.json (hazır canavar tablosu)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const store = {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; } };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, removeEventListener() {} };
const imp = p => import(pathToFileURL(path.resolve(p)).href);
const { GAME_CONFIG } = await imp('js/config.js');
const { gameState: gs } = await imp('js/gameState.js');
const { DUNGEON_LEVELS } = await imp('js/bestiary.js');
gs.saveState = () => {};

const A = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const num = (k, d) => (A[k] != null ? Number(A[k]) : d);
const P = {
  I: num('I', 40000),
  reward: num('reward', 1700),
  cost: num('cost', 2.1),
  tierStat: num('tierStat', 1.25),
  tierReward: num('tierReward', 1.5),
  reinvest: num('reinvest', 0.5),
  farmAll: num('farmAll', 0),        // 1: tarım yatırımı bütün kademelerde sürer
  gearStep: num('gearStep', 5),
  margins: (A.margins || '0,0.15,0.25,0.35,0.45').split(',').map(Number),  // kademe kâr payı (son bossta)      // her kademe teçhizat seviye sınırını bu kadar artırır
  tiers: num('tiers', 3),
  runs: num('runs', 2),
  winsPerDay: 5,
  targetWin: 0.75,
  eqPointCost: 400,
  resetShare: 0.10
};
const schedule = k => 90 * Math.pow((k - 1) / 17, 1.5);   // hedef: k. kata ulaşma günü
const soldierCost = n => Math.round(1500 * P.cost * n * n / 50) * 50;
const floorReward = (k, tier) => Math.round(P.reward * k * ((k === 9 || k === 18) ? 3 : 1) * Math.pow(P.tierReward, tier - 1));
const accountLevel = d => Math.floor(1 + 80 * Math.pow(Math.max(0, d) / 1100, 1 / 2.2));

const SLOTS = ['weapon', 'armor', 'helmet', 'legs', 'boots'];
const R = GAME_CONFIG.EQUIPMENT_RECIPES;
const points = s => R[s].baseAtk + R[s].baseHp / 6;
const craftCost = s => Math.round(points(s) * P.eqPointCost * P.cost);
const upCost = (s, lvl) => Math.round(craftCost(s) * Math.pow(1.18, lvl));
const item = (s, lvl) => ({ slot: s, baseAtk: R[s].baseAtk, baseHp: R[s].baseHp, level: lvl, durability: 13,
  atkBonus: Math.round(R[s].baseAtk * (1 + (lvl - 1) * 0.35)), hpBonus: Math.round(R[s].baseHp * (1 + (lvl - 1) * 0.35)) });

const load = p => { gs.state.soldierUnits = p.soldiers; };
function giveXp(p, xp, d) {
  load(p); const cap = accountLevel(d);
  p.soldiers.forEach((s, i) => {
    if (s.level >= cap) return;
    gs.addSoldierXp(i, xp);
    if (s.level > cap) { s.level = cap; s.xp = 0; s.baseAtk = 25 + (cap - 1) * 6; s.maxHp = 100 + (cap - 1) * 25; s.hp = s.maxHp; }
  });
}
function shop(p) {
  const allowed = Math.min(18, p.progress);            // geçilen her kat 1 asker hakkı
  for (;;) {
    if (p.soldiers.length < allowed) {
      const c = soldierCost(p.soldiers.length + 1);
      if (p.bal < c) break;
      p.soldiers.push(gs.createSoldierUnit(p.soldiers.length + 1)); p.bal -= c; p.spent += c; p.tierSpent += c;
      continue;
    }
    if (p.progress <= 3 && p.tier === 1) break;         // ilk 3 kat teçhizatsız
    let best = null;
    p.soldiers.forEach((s, i) => SLOTS.forEach(sl => {
      const it = s.equipment[sl];
      const c = it ? (it.level < 10 + P.gearStep * (p.tier - 1) ? upCost(sl, it.level) : Infinity) : craftCost(sl);
      const gain = points(sl) * (it ? 0.35 : 1);
      if (!best || c / gain < best.c / best.gain) best = { i, sl, c, gain };
    }));
    if (!best || p.bal < best.c) break;
    const s = p.soldiers[best.i], it = s.equipment[best.sl];
    s.equipment[best.sl] = item(best.sl, it ? it.level + 1 : 1);
    p.bal -= best.c; p.spent += best.c; p.tierSpent += best.c;
  }
}
const monsterOf = (k, M, tier) => ({ ...DUNGEON_LEVELS[k - 1], hp: Math.round(M[k].hp * Math.pow(P.tierStat, tier - 1)), atk: Math.round(M[k].atk * Math.pow(P.tierStat, tier - 1)) });
function winP(p, k, M, tier, n = 60) { load(p); return gs.predictDungeonBattle(monsterOf(k, M, tier), p.soldiers.map((_, i) => i), n).winChance / 100; }
function fullHeal(p) { load(p); p.soldiers.forEach((s, i) => { s.hp = gs.getSoldierFullStats(i).totalMaxHp; }); }
const newPlayer = () => ({ bal: 0, spent: 0, got: 0, tierSpent: 0, tierGot: 0, progress: 1, tier: 1, soldiers: [], tiersDone: [] });

// Normal kademe canavarları: hedef takvimdeki orduya %75 kazanma şansı
function calibrate() {
  const p = newPlayer(); const armies = {};
  for (let d = 0; d <= 90; d++) {
    p.bal += P.I; shop(p);
    while (p.progress <= 18 && d >= schedule(p.progress)) {
      armies[p.progress] = JSON.parse(JSON.stringify(p.soldiers));
      p.progress++; shop(p);
    }
    for (let w = 0; w < P.winsPerDay; w++) { const k = Math.max(1, p.progress - 1); p.bal += floorReward(k, 1); giveXp(p, DUNGEON_LEVELS[k - 1].rewardXp, d); }
  }
  const M = {};
  for (let k = 1; k <= 18; k++) {
    const army = { soldiers: armies[k] }; fullHeal(army);
    const base = DUNGEON_LEVELS[k - 1];
    let lo = 0.01, hi = 200;
    for (let it = 0; it < 24; it++) {
      const mid = Math.sqrt(lo * hi);
      M[k] = { hp: Math.round(base.hp * mid), atk: Math.round(base.atk * mid) };
      if (winP(army, k, M, 1, 160) > P.targetWin) lo = mid; else hi = mid;
    }
    M[k] = { hp: Math.round(base.hp * lo), atk: Math.round(base.atk * lo) };
  }
  return M;
}

function simulate(M, refCost) {
  const p = newPlayer();
  for (let d = 1; d <= 150 * P.tiers; d++) {
    if (p.tier === 1 || P.farmAll) p.bal += P.I;
    shop(p); fullHeal(p);
    for (let w = 0; w < P.winsPerDay; w++) {
      if (!p.soldiers.length) break;
      let k = p.progress;
      while (k > 1 && winP(p, k, M, p.tier) < P.targetWin) k--;
      if (Math.random() < winP(p, k, M, p.tier)) {
        const r = floorReward(k, p.tier);
        p.got += r; p.tierGot += r;
        p.bal += p.tier === 1 ? r : r * P.reinvest;           // Zor+: gelirin yalnız bir kısmı orduya
        giveXp(p, DUNGEON_LEVELS[k - 1].rewardXp, d);
        if (k === p.progress) {
          p.progress = k + 1;
          if (k === 18) {
            const t = { tier: p.tier, day: d, spent: p.tierSpent, got: p.tierGot };
            const m = P.margins[p.tier - 1] ?? P.margins[P.margins.length - 1];
            const capT = p.tier === 1 ? (refCost ?? Infinity) : Infinity;
            t.fatih = Math.max(0, (1 + m) * Math.min(p.tierSpent, capT) - p.tierGot); p.got += t.fatih; t.margin = m;
            if (P.farmAll) p.bal += t.fatih;
            const fee = Math.round((refCost ?? p.tierSpent) * P.resetShare);
            t.resetFee = fee; p.spent += fee;
            p.tiersDone.push(t);
            if (p.tier >= P.tiers) return p;
            p.tier++; p.progress = 1; p.tierSpent = fee; p.tierGot = 0;
            break;
          }
        }
      }
      fullHeal(p);
    }
  }
  return p;
}

const M = A.monsters ? JSON.parse(fs.readFileSync(A.monsters, 'utf8')).monsters : calibrate();
// Referans maliyet (Fatih tavanı ve sıfırlama bedeli için): tavansız bir koşunun Normal harcaması
const ref = simulate(M, null).tiersDone[0]?.spent;
const runs = Array.from({ length: P.runs }, () => simulate(M, ref));
const fmt = n => Math.round(n).toLocaleString('tr-TR');
console.log(`referans Normal maliyeti ${fmt(ref)}`);
for (const p of runs) {
  let prevDay = 0;
  for (const t of p.tiersDone) {
    const days = t.day - prevDay; prevDay = t.day;
    const name = ['Normal', 'Zor', 'Kabus', 'Cehennem', 'Cehennem+1'][t.tier - 1];
    console.log(`  ${name}: ${days} gün · orduya ${fmt(t.spent)} · zindan ödülü ${fmt(t.got)} (%${Math.round(100 * t.got / t.spent)})` +
      ` · Fatih ${fmt(t.fatih)} · kademe kârı ${fmt(t.got + t.fatih - t.spent)} (%${Math.round(100 * t.margin)})` + ` · sıfırlama ${fmt(t.resetFee)}`);
  }
  load(p); const lv = p.soldiers.map(s => s.level); const eq = p.soldiers.flatMap(s => SLOTS.map(sl => s.equipment[sl]?.level || 0));
  console.log(`  son: asker sv ort ${(lv.reduce((a, b) => a + b, 0) / lv.length).toFixed(1)}, teçhizat sv ort ${(eq.reduce((a, b) => a + b, 0) / eq.length).toFixed(1)}`);
}
if (A.out) fs.writeFileSync(A.out, JSON.stringify({ P, ref, monsters: M, runs: runs.map(p => p.tiersDone) }, null, 1));
console.log('canavarlar (Normal): ' + Object.entries(M).map(([k, v]) => `${k}:${v.hp}/${v.atk}`).join(' '));
