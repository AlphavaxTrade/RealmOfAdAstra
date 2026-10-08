// Realm of AdAstra — Bütün ekonomi modeli (öneri aracı; oyuna bağlı değil)
// ============================================================================
// Haftalık adımlarla 3 yıl: oyuncu tipleri (hiç yatırmayan / orta / balina), aylık yeni oyuncu
// katılımı, dünya kotası, gerçek AMM pazarı (js/ammMarket.js), harcamanın bölünüşü ve her
// gelir kanalının kasası. Soru: hiç yatırmayan ne kazanır, 10M yatıran parasını kaçıncı ayda
// geri alır, kasalar ve 200M başlangıç kaynağı ne kadar dayanır, ne kadar ADA yakılır?
//
// Kullanım: node scripts/model/world_economy_model.mjs [ayar=değer ...]  (ayarlar: P nesnesi)
// ============================================================================
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const store = {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; } };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, removeEventListener() {} };
const imp = p => import(pathToFileURL(path.resolve(p)).href);
const { GAME_CONFIG } = await imp('js/config.js');
const { gameState: gs } = await imp('js/gameState.js');
const { ammMarket } = await imp('js/ammMarket.js');
const { globalPool } = await imp('js/globalPool.js');
ammMarket.savePools = () => {}; gs.saveState = () => {}; globalPool.saveState = () => {};
// AMM komisyonu kendi kasamıza yazılsın (oyunun hazine kodu tek oyunculu; burada paylaşılan dünya)
globalPool.recordTokenSpend = amt => spend(amt, 'pazar komisyonu');

const A = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const num = (k, d) => (A[k] != null ? Number(A[k]) : d);

// ── ÖNERİ AYARLARI ──────────────────────────────────────────────────────────
const P = {
  weeks: num('weeks', 156),
  N0: num('N0', 1000),                    // açılıştaki oyuncu
  growth: num('growth', 0.05),            // aylık yeni oyuncu oranı (mevcut nüfusa göre)
  mix: { f2p: num('f2p', 0.70), mid: num('mid', 0.25), whale: num('whale', 0.05) },
  deposit: { f2p: 0, mid: num('depMid', 1000000), whale: num('depWhale', 10000000) },
  activity: { f2p: num('actF2p', 0.5), mid: 1, whale: 1 },   // günün ne kadarında sefer dönüyor (orta/balina bot kullanır)
  bot: { f2p: false, mid: true, whale: true },
  // Dünya kotası: aktif oyuncu başına, tam gün çalışan 1. seviye üretiminin bu oranı (bugün: toplam 1 oyuncu)
  quotaPerPlayer: num('quotaPP', 0.35),
  levelCostFrac: num('levelCost', 1.0),
  toolAdaFrac: num('toolAda', 1.0),       // alet onarımının ADA kısmı (bugün: yakılan hammadde değeri kadar)   // seviye bedeli: o seviyede üretilen hammadde değerinin oranı (bugün 1,0)
  // Harcama bölünüşü (her ADA harcamasında)
  burn: num('burn', 0.13), creator: 0.03, ubi: num('ubiRate', 0.06),
  // Hazinenin (%78) kanal kasalarına bölünüşü
  alloc: {
    dungeon: num('aDungeon', 0.30), pvp: num('aPvp', 0.15), boss: num('aBoss', 0.15),
    quest: num('aQuest', 0.15), carnival: num('aCarnival', 0.10), buyback: num('aBuyback', 0.15)
  },
  // Kasaların haftalık ödeme oranı (kasanın yüzdesi)
  pay: { dungeon: num('pDungeon', 0.07), pvp: num('pPvp', 0.05), boss: num('pBoss', 0.10), quest: num('pQuest', 0.07), carnival: num('pCarnival', 0) },
  seed: { dungeon: 14e6, pvp: 8e6, boss: 8e6, quest: num('seedQuest', 0), carnival: 4e6, buyback: 6e6, lottery: 20e6, fatih: num('seedFatih', 0) },
  // Orduya (asker+teçhizat) yatırım planı: yatırılan paranın oranı, kaç haftada
  armyPlan: { mid: [num('armyMid', 0.6), 13], whale: [num('armyWhale', 0.6), 13] },
  reinvest: num('reinvest', 0.5),
  expDungeon: num('expD', 0.8), expBoss: num('expB', 1.0), expPvp: num('expP', 0.5), pvpTop: num('pvpTop', 0.5),
  pBuyback: num('pBuyback', 0),
  carnivalCap: num('carnivalCap', Infinity),
  burnAuto: num('burnAuto', 0), burnMin: num('burnMin', 0.04), burnMax: num('burnMax', 0.20), poolTargetPP: num('poolPP', 100000), burnRef: num('burnRef', 0.3), // yakım termostatı (burnAuto=1: havuz, 2: yeni para) // karnaval kasası bu tutarı aşarsa fazlası görev kasasına akar           // geri alım kasası her hafta bu oranla hammadde alıp yakar (0: yalnız fiyat düşünce)         // plan bittikten sonra gelirin orduya giden payı
  armyResShare: 0.4,                      // ordu harcamasının hammadde (pazardan alınıp yakılan) payı
  lotteryTickets: { f2p: num('ltF2p', 2), mid: 20, whale: 100 },
  wheelSpins: { f2p: num('wsF2p', 2), mid: 5, whale: 20 },
  wheelReturn: 0.67,
  ticket: { pool: 0.70, carnival: 0.15, amorti: 0.10, burn: 0.05 },
  f2pArmyShare: num('f2pArmy', 0.5),      // hiç yatırmayanın ödül gelirinin orduya giden payı
  report: A.report || 'console'
};
const TYPES = ['f2p', 'mid', 'whale'];
const RES = ['wood', 'iron', 'wheat'];
const BASE = GAME_CONFIG.BASE_PRODUCTION;
const fullDayLv1 = r => BASE[r] * 1440;                       // tam gün 1. seviye üretimi
const levelMult = L => 1 + GAME_CONFIG.LEVEL_PRODUCTION_BONUS_PER_LEVEL * (L - 1);
const cumDaysForLevel = L => gs.getCumulativeXpForLevel(L) / 2520; // tam aktiflikte gün
const ubiWeight = L => (L >= 3 ? 1 + 0.75 * Math.sqrt(L - 1) : 0);

// ── Kasalar ve sayaçlar ─────────────────────────────────────────────────────
const pools = { ...P.seed, ubiWeek: 0, amorti: 0 };
const T = { burnedAda: 0, creator: 0, spent: 0, deposits: 0, burnedRes: { wood: 0, iron: 0, wheat: 0 }, spentBy: {} };
function spend(amount, cat) {
  if (!(amount > 0)) return;
  T.spent += amount; T.spentBy[cat] = (T.spentBy[cat] || 0) + amount;
  T.burnedAda += amount * P.burn; T.burnWeighted = (T.burnWeighted || 0) + amount * P.burn; T.creator += amount * P.creator; pools.ubiWeek += amount * P.ubi;
  const t = amount * (1 - P.burn - P.creator - P.ubi);
  for (const [k, w] of Object.entries(P.alloc)) pools[k] = (pools[k] || 0) + t * w;
}
const seedTotal = () => Object.values(P.seed).reduce((a, b) => a + b, 0) + RES.reduce((s, r) => s + ammMarket.pools[r].adAstraReserve, 0);
const seedAtStart = seedTotal();

// ── Oyuncu grupları (aynı ay katılan aynı tip oyuncular tek temsilciyle) ─────────
const cohorts = [];
function addCohort(type, count, week) {
  cohorts.push({ type, count, week, level: 1, xp: 0, bal: P.deposit[type] + 250, dep: P.deposit[type], army: 0, planLeft: P.deposit[type] * (P.armyPlan[type]?.[0] || 0),
    tickets: 0, ticketPaid: 0, income: {}, spentOwn: 0, hist: [], paybackWeek: null });
  T.deposits += P.deposit[type] * count;
}
const players = () => cohorts.reduce((s, c) => s + c.count, 0);
function joinWave(total, week) { for (const t of TYPES) addCohort(t, Math.round(total * P.mix[t]), week); }
joinWave(P.N0, 0);

const earn = (c, ch, amt) => { if (amt > 0) { c.bal += amt; c.income[ch] = (c.income[ch] || 0) + amt; } };
const pay = (c, amt, cat) => { const x = Math.min(amt, Math.max(0, c.bal)); c.bal -= x; c.spentOwn += x; c.spentBy = c.spentBy || {}; c.spentBy[cat] = (c.spentBy[cat] || 0) + x; spend(x * c.count, cat); return x; };
const payRes = (c, amt, cat) => { c.bal -= amt; c.spentOwn += amt; c.spentBy = c.spentBy || {}; c.spentBy[cat] = (c.spentBy[cat] || 0) + amt; };
const price = r => ammMarket.getPrice(r);
function sellRes(r, qty) { // haftalık satışı 7 güne böl
  let got = 0;
  for (let d = 0; d < 7; d++) {
    const q = Math.min(qty / 7, ammMarket.getMaxSellBeforeFloor(r));
    if (q > 1) { const res = ammMarket.executeSell(r, q); if (res.success) got += res.adAstraReceived; }
  }
  return got;
}
function buyResAda(r, ada) { // ADA ile hammadde al (ordu/seviye için), yakılacak
  let spentAda = 0;
  for (let d = 0; d < 7; d++) {
    const q = ammMarket.getEstimatedResourceForBuy(r, ada / 7);
    if (q > 1) { const res = ammMarket.executeBuyAmount(r, q); if (res.success) { spentAda += res.cost ?? (ada / 7); T.burnedRes[r] += q; } }
  }
  return spentAda;
}

// ── Haftalık döngü ──────────────────────────────────────────────────────────
const monthly = [];
for (let w = 1; w <= P.weeks; w++) {
  if (w % 4 === 1 && w > 1) joinWave(players() * P.growth, w);   // aylık katılım
  const N = players();
  T.depHist = T.depHist || []; T.spendHist = T.spendHist || []; T.depHist.push(T.deposits); T.spendHist.push(T.spent);
  if (P.burnAuto === 2) { const k = Math.max(0, T.depHist.length - 5); const dDep = T.deposits - (T.depHist[k] || 0), dSp = Math.max(1, T.spent - (T.spendHist[k] || 0)); const r = w <= 4 ? P.burnRef : dDep / dSp; P.burn = P.burnMin + (P.burnMax - P.burnMin) * Math.max(0, Math.min(1, r / P.burnRef)); T.burnHist = T.burnHist || []; T.burnHist.push(P.burn); }
  else if (P.burnAuto) { const pl = ['dungeon', 'pvp', 'boss', 'quest'].reduce((a, k) => a + (pools[k] || 0), 0); const health = pl / (N * P.poolTargetPP); P.burn = Math.max(P.burnMin, Math.min(P.burnMax, P.burnAuto * health)); T.burnHist = T.burnHist || []; T.burnHist.push(P.burn); }

  // 1) Tarım: talep ve dünya kotası
  const act = c => (P.bot[c.type] && c.botOn !== false ? 1 : P.activity.f2p) * (P.bot[c.type] ? 1 : P.activity[c.type] / P.activity.f2p);
  const demand = { wood: 0, iron: 0, wheat: 0 };
  for (const c of cohorts) for (const r of RES) demand[r] += BASE[r] * levelMult(c.level) * 1440 * 7 * act(c) * c.count;
  const quota = Object.fromEntries(RES.map(r => [r, fullDayLv1(r) * 7 * P.quotaPerPlayer * N]));
  const qf = Object.fromEntries(RES.map(r => [r, Math.min(1, quota[r] / Math.max(1, demand[r]))]));

  const sellQty = { wood: 0, iron: 0, wheat: 0 };
  for (const c of cohorts) {
    const a = act(c);
    const prod = Object.fromEntries(RES.map(r => [r, BASE[r] * levelMult(c.level) * 1440 * 7 * a * qf[r]]));
    // Alet onarımı: odun/demir üretiminin %25'i yakılır + aynı değerde ADA
    const toolRes = { wood: prod.wood * 0.25, iron: prod.iron * 0.25 };
    c._toolAda = (toolRes.wood * price('wood') + toolRes.iron * price('iron')) * P.toolAdaFrac;
    prod.wood -= toolRes.wood; prod.iron -= toolRes.iron;
    T.burnedRes.wood += toolRes.wood * c.count; T.burnedRes.iron += toolRes.iron * c.count;
    // Stamina buğdayı (seviyeye göre, oyunun formülünden)
    const stamW = Math.max(0, (3 * gs.getExpeditionStaminaCost(c.level)) / gs.getExpeditionDurationMinutes(c.level) - 0.4) * GAME_CONFIG.WHEAT_PER_STAMINA * 1440 * 7 * a * qf.wheat;
    const stam = Math.min(prod.wheat, stamW); prod.wheat -= stam; T.burnedRes.wheat += stam * c.count;
    // Bot ücreti: tahmini net kârın %50'si (satış değeri − alet ADA'sı)
    const sellVal = RES.reduce((s2, r) => s2 + prod[r] * price(r), 0);
    c._botFee = P.bot[c.type] ? 0.5 * Math.max(0, sellVal - c._toolAda) : 0;
    c.xp += 2520 * 7 * a;
    c.stock = c.stock || { wood: 0, iron: 0, wheat: 0 };
    for (const r of RES) c.stock[r] += prod[r];
    c._sell = { ...c.stock };
    for (const r of RES) sellQty[r] += c._sell[r] * c.count;
  }
  // Pazara toplu satış (fiyat tüm dünyanın satışıyla oluşur), gelir oyunculara orantılı
  const sellAda = {};
  const soldFrac = {};
  for (const r of RES) { const before = ammMarket.pools[r].resourceReserve; const got = sellQty[r] > 0 ? sellRes(r, sellQty[r]) : 0; const sold = Math.max(0, ammMarket.pools[r].resourceReserve - before) / 0.98; soldFrac[r] = sellQty[r] > 0 ? Math.min(1, sold / sellQty[r]) : 0; sellAda[r] = sold > 0 ? got / sold : 0; }
  const levelResAda = { wood: 0, iron: 0, wheat: 0 };
  for (const c of cohorts) {
    earn(c, 'pazar', RES.reduce((s2, r) => s2 + c._sell[r] * soldFrac[r] * sellAda[r], 0));
    for (const r of RES) c.stock[r] -= c._sell[r] * soldFrac[r];
    pay(c, c._toolAda, 'alet onarımı');
    if (P.bot[c.type]) { if (c.bal >= c._botFee + 1000) { pay(c, c._botFee, 'bot'); c.botOn = true; } else c.botOn = false; }
    // Seviye: XP yetiyorsa ve bedel ödenebiliyorsa. Bedel = o seviyedeki taban üretim değerinin levelCostFrac'ı:
    // yarısı hammadde (pazardan alınıp yakılır), yarısı ADA.
    while (c.level < 81 && c.xp >= gs.getCumulativeXpForLevel(c.level + 1)) {
      const days = cumDaysForLevel(c.level + 1) - cumDaysForLevel(c.level);
      const half = Object.fromEntries(RES.map(r => [r, BASE[r] * 1440 * days * 0.5 * P.levelCostFrac]));
      const resAda = RES.reduce((s2, r) => s2 + half[r] * price(r), 0);
      const fromStock = Object.fromEntries(RES.map(r => [r, Math.min(c.stock[r], half[r])]));
      const buyAda = RES.reduce((s2, r) => s2 + (half[r] - fromStock[r]) * price(r), 0);
      if (c.bal < resAda + buyAda + 1000) break;
      pay(c, resAda, 'seviye');
      payRes(c, buyAda, 'seviye (hammadde alımı)');
      for (const r of RES) { c.stock[r] -= fromStock[r]; T.burnedRes[r] += fromStock[r] * c.count; levelResAda[r] += (half[r] - fromStock[r]) * price(r) * c.count; }
      c.level++;
    }
  }
  for (const r of RES) if (levelResAda[r] > 0) buyResAda(r, levelResAda[r]);

  // 2) Ordu yatırımı (asker + teçhizat): plan, sonra gelirden yeniden yatırım
  const buyAdaForRes = { wood: 0, iron: 0 };
  for (const c of cohorts) {
    let inv = 0;
    const plan = P.armyPlan[c.type];
    if (plan && c.planLeft > 0) { inv = Math.min(c.planLeft, P.deposit[c.type] * plan[0] / plan[1]); c.planLeft -= inv; }
    const rewardIncome = c._lastRewards || 0;
    inv += rewardIncome * (c.type === 'f2p' ? P.f2pArmyShare : P.reinvest) * (plan && c.planLeft > 0 ? 0 : 1);
    inv = Math.min(inv, Math.max(0, c.bal - 1000));
    if (inv <= 0) continue;
    const resPart = inv * P.armyResShare;
    pay(c, inv - resPart, 'ordu (asker/teçhizat)');
    payRes(c, resPart, 'ordu (hammadde alımı)');
    buyAdaForRes.wood += resPart * 0.5 * c.count; buyAdaForRes.iron += resPart * 0.5 * c.count;
    c.army += inv;
  }
  for (const r of ['wood', 'iron']) if (buyAdaForRes[r] > 0) buyResAda(r, buyAdaForRes[r]);

  // 3) Piyango ve çark
  let ticketsTotal = 0;
  for (const c of cohorts) {
    const n = Math.min(P.lotteryTickets[c.type], Math.floor(Math.max(0, c.bal - 20000) / 100));
    if (n > 0) {
      const cost = n * 100; payRes(c, cost, 'piyango');
      const all = cost * c.count;
      pools.lottery += all * P.ticket.pool; pools.carnival += all * P.ticket.carnival; pools.amorti += all * P.ticket.amorti; T.burnedAda += all * P.ticket.burn;
      c.tickets += n; c.ticketPaid += cost;
    }
    ticketsTotal += c.tickets * c.count;
    const s = Math.min(P.wheelSpins[c.type], Math.floor(Math.max(0, c.bal - 20000) / 100));
    if (s > 0) { pay(c, s * 100, 'çark'); const ret = Math.min(pools.carnival, s * 100 * P.wheelReturn * c.count); pools.carnival -= ret; earn(c, 'çark', ret / c.count); }
  }
  // Tek kazanan: kazanma olasılığı bilet payı; beklenen değerle dağıt
  if (ticketsTotal > 0) {
    let paid = 0;
    for (const c of cohorts) {
      if (!c.tickets) continue;
      const pWin = (c.tickets * c.count) / ticketsTotal;       // bu gruptan birinin kazanma olasılığı
      const prize = 2 * c.ticketPaid;
      const exp = Math.min(pWin * prize, pools.lottery - paid);
      if (exp > 0) { paid += exp; earn(c, 'piyango', exp / c.count); }
      // kazananın biletleri yanar (beklenen değer): grup biletleri pWin/count oranında azalır
      const frac = pWin / c.count; c.tickets *= (1 - frac); c.ticketPaid *= (1 - frac);
    }
    pools.lottery -= paid;
    if (pools.lottery < 1e5) { // kasa bitti → amorti kalan biletlere, biletler çark hakkına döner
      for (const c of cohorts) if (c.tickets) { earn(c, 'piyango amorti', pools.amorti * (c.tickets * c.count / ticketsTotal) / c.count); }
      pools.amorti = 0;
    }
  }

  // 4) Kanal ödemeleri (her kasa haftalık oranını dağıtır)
  const power = c => c.army;                           // ordu gücü ≈ orduya yatırılan
  const share = (fn, ch, amount) => {
    const tot = cohorts.reduce((s, c) => s + fn(c) * c.count, 0);
    if (tot <= 0 || amount <= 0) return 0;
    for (const c of cohorts) { const v = amount * fn(c) / tot; if (v > 0) { earn(c, ch, v); c._rw = (c._rw || 0) + v; } }
    return amount;
  };
  for (const c of cohorts) c._rw = 0;
  const dPay = pools.dungeon * P.pay.dungeon; pools.dungeon -= share(c => Math.pow(power(c) + 1, P.expDungeon), 'zindan', dPay);
  const bPay = pools.boss * P.pay.boss; pools.boss -= share(c => Math.pow(power(c) + 1, P.expBoss), 'dünya bossu', bPay);
  // PvP: yarısı haftalık ilk 10'a (en güçlüler), yarısı galibiyetlere (güç^0,5)
  const pvpPay = pools.pvp * P.pay.pvp;
  const top = [...cohorts].sort((a, b) => power(b) - power(a)); let left = 10; const top10 = new Set();
  for (const c of top) { if (left <= 0) break; top10.add(c); left -= c.count; }
  pools.pvp -= share(c => (top10.has(c) ? 1 : 0), 'kolezyum', pvpPay * P.pvpTop) + share(c => Math.pow(power(c) + 1, P.expPvp), 'kolezyum', pvpPay * (1 - P.pvpTop));
  const qPay = pools.quest * P.pay.quest; pools.quest -= share(c => P.activity[c.type] > 0 ? 1 : 0, 'görevler', qPay);
  const ubiPot = pools.ubiWeek; pools.ubiWeek = 0; share(c => ubiWeight(c.level), 'UBI', ubiPot);
  // Hazine geri alımı: hammadde fiyatı varsayılanın %70'inin altındaysa kasanın %10'uyla alıp yakar
  if (P.pBuyback > 0 && pools.buyback > 1000) { const b = pools.buyback * P.pBuyback; const w3 = { wood: 0.35, iron: 0.35, wheat: 0.30 }; for (const r of RES) buyResAda(r, b * w3[r]); pools.buyback -= b; }
  for (const r of RES) {
    const def = GAME_CONFIG.AMM_CORRIDORS[r].defaultPriceAda;
    if (price(r) < 0.7 * def && pools.buyback > 1000) { const b = pools.buyback * 0.10 / 3; buyResAda(r, b); pools.buyback -= b; }
  }
  if (pools.carnival > P.carnivalCap) { pools.quest += pools.carnival - P.carnivalCap; pools.carnival = P.carnivalCap; }
  for (const c of cohorts) c._lastRewards = c._rw;

  // 5) Geri ödeme takibi (ilk gruplar): bakiye yatırılan paraya geri döndü mü
  for (const c of cohorts) {
    if (c.dep > 0 && c.paybackWeek == null && c.planLeft <= 0 && c.bal >= c.dep) c.paybackWeek = w - c.week;
    const inc = Object.values(c.income).reduce((a, b) => a + b, 0), op = (c.spentBy?.['bot'] || 0) + (c.spentBy?.['alet onarımı'] || 0);
    c.netEarned = inc - op;
    if (c.dep > 0 && c.netPaybackWeek == null && c.netEarned >= c.dep) c.netPaybackWeek = w - c.week;
  }

  if (w % 4 === 0) {
    const f = cohorts.find(c => c.type === 'f2p' && c.week === 0), m = cohorts.find(c => c.type === 'mid' && c.week === 0), wh = cohorts.find(c => c.type === 'whale' && c.week === 0);
    const reserves = RES.reduce((s, r) => s + ammMarket.pools[r].adAstraReserve, 0) + ['dungeon', 'pvp', 'boss', 'quest', 'carnival', 'buyback', 'lottery', 'fatih', 'amorti'].reduce((s, k) => s + (pools[k] || 0), 0);
    monthly.push({ ay: w / 4, oyuncu: Math.round(N), f2pBal: Math.round(f.bal), f2pLv: f.level, midBal: Math.round(m.bal), whaleBal: Math.round(wh.bal), whaleLv: wh.level,
      whaleArmy: Math.round(wh.army), kasalar: Math.round(reserves), pazarADA: Math.round(RES.reduce((s2, r) => s2 + ammMarket.pools[r].adAstraReserve, 0)), hazine: Math.round(['dungeon', 'pvp', 'boss', 'quest', 'carnival', 'buyback', 'lottery', 'fatih', 'amorti'].reduce((s2, k) => s2 + (pools[k] || 0), 0)), yakilan: Math.round(T.burnedAda), yapimci: Math.round(T.creator),
      odun: +price('wood').toFixed(2), demir: +price('iron').toFixed(2), bugday: +price('wheat').toFixed(2), qf: +qf.wood.toFixed(2) });
  }
}

// ── Rapor ───────────────────────────────────────────────────────────────────
const fmt = n => Math.round(n).toLocaleString('tr-TR');
const first = t => cohorts.find(c => c.type === t && c.week === 0);
const out = { P, monthly, first: Object.fromEntries(TYPES.map(t => [t, { income: first(t).income, spent: first(t).spentOwn, bal: first(t).bal, level: first(t).level, army: first(t).army, paybackWeek: first(t).paybackWeek }])),
  totals: { ...T, seedAtStart, reservesEnd: monthly[monthly.length - 1].kasalar } };
if (A.out) fs.writeFileSync(A.out, JSON.stringify(out, null, 1));
console.log(`Başlangıç kaynakları ${fmt(seedAtStart)} · yatırılan toplam ${fmt(T.deposits)} · harcanan ${fmt(T.spent)} · yakılan ADA ${fmt(T.burnedAda)} · yapımcı ${fmt(T.creator)}`);
for (const t of TYPES) {
  const c = first(t); const inc = Object.values(c.income).reduce((a, b) => a + b, 0);
  const mix = Object.entries(c.income).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} %${Math.round(100 * v / inc)}`).join(', ');
  const sp = Object.entries(c.spentBy || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} %${Math.round(100 * v / c.spentOwn)}`).join(', ');
  console.log(`${t}: geri ödeme ${c.paybackWeek != null ? (c.paybackWeek / 4.33).toFixed(1) + ' ay' : 'yok'} · sv ${c.level} · bakiye ${fmt(c.bal)} · toplam gelir ${fmt(inc)} (${mix}) · harcama ${fmt(c.spentOwn)} (${sp})`);
}
console.log('ay | oyuncu | f2p bakiye (sv) | orta bakiye | balina bakiye (sv) | pazar ADA | hazine | yakılan | odun/demir/buğday | kota payı');
for (const r of monthly.filter((_, i) => i % 3 === 2 || i === 0)) console.log(`${r.ay} | ${fmt(r.oyuncu)} | ${fmt(r.f2pBal)} (${r.f2pLv}) | ${fmt(r.midBal)} | ${fmt(r.whaleBal)} (${r.whaleLv}) | ${fmt(r.pazarADA)} | ${fmt(r.hazine)} | ${fmt(r.yakilan)} | ${r.odun}/${r.demir}/${r.bugday} | ${r.qf}`);

const f2 = first('f2p'), wh = first('whale'), md = first('mid');
const f2Inc = Object.values(f2.income).reduce((a, b) => a + b, 0), last = monthly[monthly.length - 1], m12 = monthly[11];
console.log('ÖZET ' + JSON.stringify({ f2pAylikNet12: Math.round((m12.f2pBal - 250) / 12), f2pSv12: m12.f2pLv, f2pSv36: last.f2pLv, f2pGelirAylik: Math.round(f2Inc / (P.weeks / 4.33)),
  balinaNetGeriKazanimAy: wh.netPaybackWeek != null ? +(wh.netPaybackWeek / 4.33).toFixed(1) : null, ortaNetGeriKazanimAy: md.netPaybackWeek != null ? +(md.netPaybackWeek / 4.33).toFixed(1) : null,
  ortYakim: T.burnHist ? +(T.burnHist.reduce((a, b) => a + b, 0) / T.burnHist.length).toFixed(3) : P.burn,
  kasalar36: Object.fromEntries(['dungeon', 'pvp', 'boss', 'quest', 'carnival', 'buyback', 'lottery', 'amorti'].map(k => [k, Math.round((pools[k] || 0) / 1e6)])),
  pazarADA12: m12.pazarADA, pazarADA36: last.pazarADA, hazine12: m12.hazine, hazine36: last.hazine, yakilan36: last.yakilan, fiyat36: [last.odun, last.demir, last.bugday] }));
