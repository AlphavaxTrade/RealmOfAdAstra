// Realm of Astra — Token + oyun ekonomisi modeli (öneri aracı; oyuna bağlı değil)
// ============================================================================
// Haftalık adımlarla 3 yıl. Dolar katmanı: ADASTRA'nın Arena bonding curve'ü (gerçek formül:
// maliyet = a·(U³−L³)/(3c) wei, a=901, c=232210432401), 7,3 milyarda mezuniyet ve sonrasında
// sabit çarpımlı borsa havuzu. Oyuncular dolarla ADASTRA alıp oyuna yatırır; çekilen ADASTRA'nın
// bir kısmı piyasada satılır. Oyun içi ekonomi, world_economy_model.mjs'den ölçülen oranlarla
// (tarım geliri, harcama bölünüşü, kanal payları) özetlenmiştir.
//
// Kurallar (revize rapor 3 + madde 8): kilitli bakiye (%20 serbest), harcayınca/oynayınca açılma,
// ortak haftalık çekim havuzu (fiyatı ≤%2 düşürecek miktar) + katkı puanı + hak kirası, %3 çekim
// ücreti (%70 UBI, %30 yakım; frende %6), fiyat savunma yakımı, ücretsiz oyuncu havuzu
// (piyasa değerinin %5'i/ay, kişi başı ≤100$), fiyat çarpanı (birim fiyata ve kasa ömrüne göre).
//
// Kullanım: node scripts/model/token_economy_model.mjs [ayar=değer ...]
// ============================================================================
import fs from 'fs';
const A = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const num = (k, d) => (A[k] != null ? Number(A[k]) : d);

const P = {
  weeks: num('weeks', 156),
  avaxUsd: num('avax', 11.43),
  // Oyuncular
  f2p0: num('f2p0', 100), mid0: num('mid0', 36), whale0: num('whale0', 7),   // açılış: 100 ücretsiz, %25 orta, %5 balina
  growth: num('growth', 0.05),                   // aylık yeni oyuncu oranı
  depMid: num('depMid', 20), depWhale: num('depWhale', 200),         // katılırken yatırılan $
  topMid: num('topMid', 2), topWhale: num('topWhale', 20),           // her ay ek yatırım $
  // Oyun içi fiyat ölçeği: 1 "oyun birimi" başlangıçta K ADA (fiyatları bugünkü piyasa değerine göre makul yapmak için)
  K: num('K', 53),
  // Oyun içi gelir/harcama (world_economy_model ölçümleri, oyun birimi/hafta/oyuncu)
  farmF2p: num('farmF2p', 12000), farmPayer: num('farmPayer', 27000),   // tarım (pazar) geliri
  botFee: num('botFee', 27000),                  // ödeyen oyuncunun haftalık bot ücreti (birim)
  armyPlan: 0.6, levelPlan: 0.25, planWeeks: 13,  // yatırılan paranın orduya / seviye-bota giden payı
  reinvest: num('reinvest', 0.5), f2pReinvest: num('f2pReinvest', 0.5),
  armyResShare: 0.4,                             // ordu harcamasının hammadde (pazar havuzuna dönen) payı
  // Harcama bölünüşü
  burn: num('burn', 0.13), creator: 0.03, ubi: 0.06,
  alloc: { dungeon: num('aD', 0.30), pvp: num('aP', 0.15), boss: num('aB', 0.15), quest: num('aQ', 0.25), buyback: num('aBB', 0.15) },
  payRate: 0.30,                                 // kasalar haftada %30 dağıtır
  expD: num('expD', 1), expB: num('expB', 1), expP: num('expP', 1), pvpTop: num('pvpTop', 0.25),
  // Kilit
  freeShare: num('free', 0.20), unlockSpend: 0.20, unlockActive: 0.014, unlockBase: 0.01,
  // Çekim
  wdF2p: num('wdF2p', 0.5), wdPayer: num('wdPayer', 0.3),            // serbest bakiyenin haftalık çekilmek istenen payı
  sellF2p: num('sellF2p', 0.8), sellPayer: num('sellPayer', 0.6),    // çekilenin piyasada satılan payı
  wdPriceDrop: 0.02, fee: 0.03, feeBrake: 0.06, feeUbi: 0.70, rent: 0.015,
  // Ücretsiz havuz
  faucetShare: num('faucet', 0.05), faucetCapUsd: 100,
  // Fiyat çarpanı
  mExp: 0.6, mStep: 0.05,
  // Başlangıç
  seedAda: num('seed', 200e6), ammSeedShare: 0.6,   // 200M'nin %60'ı oyun içi pazar havuzları, %40'ı ödül kasaları
  defenseBurn: 0.01                               // frende hazine rezervinden haftalık yakım oranı
};

// ── Token piyasası ────────────────────────────────────────────────────────────
const a = 901, c = 232210432401, GRAD = 7.3e9;
const curveR = S => a * S ** 3 / (3 * c) / 1e18;                 // eğrideki AVAX
const curveS = R => Math.cbrt(R * 3 * c * 1e18 / a);
const curveP = S => a * S * S / c / 1e18;                        // AVAX / token
const M = { S: 2.1325e9, dead: 165e6, grad: false, R: 0, T: 0 };  // S: basılmış arz
const priceAvax = () => (M.grad ? M.R / M.T : curveP(M.S));
const price = () => priceAvax() * P.avaxUsd;                      // $ / ADA
const circ = () => M.S - M.dead;
const mcap = () => price() * circ();
function buyUsd(usd) {                                            // $ → ADA (piyasadan alım)
  let avax = usd / P.avaxUsd * 0.99, got = 0;
  if (!M.grad) {
    const R0 = curveR(M.S), room = curveR(GRAD) - R0;
    const use = Math.min(avax, room); const S1 = curveS(R0 + use); got += S1 - M.S; M.S = S1; avax -= use;
    if (M.S >= GRAD - 1) { M.grad = true; M.R = curveR(GRAD); M.T = 2.45e9; M.S += 2.7e9; }
  }
  if (M.grad && avax > 0) { const out = M.T - M.R * M.T / (M.R + avax); M.R += avax; M.T -= out; got += out; }
  return got;
}
function sellAda(q) {                                             // ADA satışı → fiyat düşer
  if (q <= 0) return 0;
  if (!M.grad) { const S1 = Math.max(M.dead + 1, M.S - q); const out = curveR(M.S) - curveR(S1); M.S = S1; return out * P.avaxUsd; }
  const out = M.R - M.R * M.T / (M.T + q); M.R -= out; M.T += q; return out * P.avaxUsd;
}
const wdCapAda = () => (M.grad ? M.T * (1 / Math.sqrt(1 - P.wdPriceDrop) - 1) : M.S * (1 - Math.sqrt(1 - P.wdPriceDrop)));

// ── Oyun kasaları (zincirde oyunun tuttuğu ADA) ────────────────────────────────
const pools = { amm: P.seedAda * P.ammSeedShare, dungeon: 0, pvp: 0, boss: 0, quest: 0, buyback: 0, ubi: 0 };
{ const rest = P.seedAda * (1 - P.ammSeedShare); for (const [k, w] of Object.entries(P.alloc)) pools[k] = rest * w; }
const T = { burned: 0, burnSpend: 0, burnFee: 0, burnDefense: 0, creator: 0, depositsUsd: 0, soldUsd: 0, wdAda: 0, rentPaid: 0, capHit: 0 };
const totalPools = () => Object.values(pools).reduce((s, v) => s + v, 0);
function spendAda(ada) {                                          // oyun içi ADA harcaması bölünüşü
  if (!(ada > 0)) return;
  const b = ada * P.burn; T.burned += b; T.burnSpend += b; M.dead += b;
  T.creator += ada * P.creator; pools.ubi += ada * P.ubi;
  const t = ada * (1 - P.burn - P.creator - P.ubi);
  for (const [k, w] of Object.entries(P.alloc)) pools[k] += t * w;
}

// ── Oyuncu grupları (aynı ay katılan aynı tip → tek temsilci) ────────────────────
const cohorts = [];
function join(type, n, week) {
  if (n < 0.5) return;
  const c0 = { type, n, week, free: 0, locked: 0, planLeft: 0, power: 1, depUsd: 0, invUsd: 0, invAda: 0, emek: 0, yatirim: 0, faucetUsd: 0, wdUsd: 0, score: 0, paybackWeek: null, lastInv: 0 };
  const dep = type === 'mid' ? P.depMid : type === 'whale' ? P.depWhale : 0;
  c0.depAda = 0;
  if (dep) { const ada = buyUsd(dep * n) / n; c0.free += ada; c0.planLeft = ada; c0.depUsd = dep; c0.depAda = ada; T.depositsUsd += dep * n; }
  cohorts.push(c0);
}
join('f2p', P.f2p0, 0);
{ const dm = P.depMid, dw = P.depWhale; P.depMid = 0; P.depWhale = 0; join('mid', P.mid0, 0); join('whale', P.whale0, 0); P.depMid = dm; P.depWhale = dw;
  const cm = cohorts[1], cw = cohorts[2]; cm.depAda = 0; cw.depAda = 0;
  for (let i = 0; i < 200; i++) for (const [x, d] of [[cm, dm], [cw, dw]]) { const ada = buyUsd(d * x.n / 200) / x.n; x.free += ada; x.planLeft += ada; x.depAda += ada; }
  cm.depUsd = dm; cw.depUsd = dw; T.depositsUsd += dm * cm.n + dw * cw.n; }

const mid0 = () => cohorts.find(x => x.type === 'mid' && x.week === 0), wh0 = () => cohorts.find(x => x.type === 'whale' && x.week === 0);
let mult = 1, p0 = price(), mcapHist = [], payHist = [], brake = false, brakeWeeks = 0, lowSince = 0;
const weekly = [];
const earn = (c0, amt, kind) => { if (!(amt > 0)) return; c0.monthUsd = (c0.monthUsd || 0) + amt * price(); c0.totAda = (c0.totAda || 0) + amt; c0.free += amt * P.freeShare; c0.locked += amt * (1 - P.freeShare); if (kind === 'yatirim') { c0.yatirim += amt; c0.invUsd += amt * price(); c0.invAda += amt; c0.lastInv += amt; } else c0.emek += amt; };
const pay = (c0, amt) => { const fromL = Math.min(c0.locked, amt); c0.locked -= fromL; const fromF = Math.min(c0.free, amt - fromL); c0.free -= fromF; const paid = fromL + fromF;
  const un = Math.min(c0.locked, paid * P.unlockSpend); c0.locked -= un; c0.free += un; c0.score += paid; return paid; };

for (let w = 1; w <= P.weeks; w++) {
  // Yeni oyuncular ve aylık ek yatırım
  if (w % 4 === 1 && w > 1) {
    const cnt = t => cohorts.filter(x => x.type === t).reduce((s, x) => s + x.n, 0);
    join('f2p', cnt('f2p') * P.growth, w); join('mid', cnt('mid') * P.growth, w); join('whale', cnt('whale') * P.growth, w);
    for (const c0 of cohorts) { const top = c0.type === 'mid' ? P.topMid : c0.type === 'whale' ? P.topWhale : 0;
      if (top) { const ada = buyUsd(top * c0.n) / c0.n; c0.free += ada; c0.planLeft += ada; c0.depUsd += top; c0.depAda += ada; T.depositsUsd += top * c0.n; } }
  }
  // Piyasa değeri (4 hafta ortalaması), fren, fiyat çarpanı, kasa ömrü
  mcapHist.push(mcap()); const mc = mcapHist.slice(-4).reduce((s, v) => s + v, 0) / Math.min(4, mcapHist.length);
  const peak = Math.max(...mcapHist.slice(-4));
  if (!brake && mc < 0.75 * peak) { brake = true; brakeWeeks = 0; lowSince = 0; }
  if (brake) { brakeWeeks++; lowSince = mcap() <= Math.min(...mcapHist.slice(-2)) ? 0 : lowSince + 1; if (mc > 0.85 * peak || lowSince >= 4) brake = false; }
  const pAvg = price();
  const nF0 = cohorts.filter(x => x.type === 'f2p').reduce((s2, x) => s2 + x.n, 0);
  const faucetMonthAda = Math.min(P.faucetShare * mc, P.faucetCapUsd * nF0) / Math.max(1e-12, price());
  const runway = totalPools() / Math.max(1, faucetMonthAda);
  let target = pAvg < p0 ? p0 / pAvg : Math.pow(p0 / pAvg, P.mExp);
  if (pAvg >= p0) { if (runway < 12) target = Math.max(target, mult); else if (runway > 60) target *= 0.8; else if (runway > 36) target *= 0.9; }
  mult = Math.max(mult * (1 - P.mStep), Math.min(mult * (1 + P.mStep), target));
  const unit = P.K * mult;                                       // 1 oyun birimi = unit ADA

  // 1) Tarım (emek): oyun içi pazar havuzundan ödenir
  let farmReq = 0; for (const c0 of cohorts) farmReq += (c0.type === 'f2p' ? P.farmF2p : P.farmPayer) * unit * c0.n;
  const farmScale = Math.min(1, pools.amm * 0.05 / Math.max(1, farmReq));   // havuz haftada en fazla %5'ini öder (fiyat düşer)
  for (const c0 of cohorts) { const v = (c0.type === 'f2p' ? P.farmF2p : P.farmPayer) * unit * farmScale; pools.amm -= v * c0.n; earn(c0, v, 'emek'); }

  // 2) Harcamalar: plan (yatırılan para), bot, yeniden yatırım
  for (const c0 of cohorts) {
    let army = 0, other = 0;
    if (c0.planLeft > 0) { const step = Math.min(c0.planLeft, c0.planLeft / P.planWeeks * 3 + 1); c0.planLeft -= step; army += step * P.armyPlan / (P.armyPlan + P.levelPlan); other += step * P.levelPlan / (P.armyPlan + P.levelPlan); }
    if (c0.type !== 'f2p') other += P.botFee * unit * farmScale;
    army += c0.lastInv * (c0.type === 'f2p' ? P.f2pReinvest : P.reinvest) + (c0.type === 'f2p' ? c0.lastEmek * 0.3 || 0 : 0);
    c0.lastInv = 0;
    const paidArmy = pay(c0, army), paidOther = pay(c0, other);
    pools.amm += paidArmy * P.armyResShare * c0.n;               // hammadde alımı pazar havuzuna döner (hammadde yakılır)
    spendAda((paidArmy * (1 - P.armyResShare) + paidOther) * c0.n);
    c0.power += paidArmy / unit;                                 // güç: oyun birimiyle (fiyattan bağımsız)
  }
  for (const c0 of cohorts) c0.lastEmek = 0;

  // 3) Kanal ödemeleri
  let paidThisWeek = 0;
  const share = (fn, amount, kind) => { const tot = cohorts.reduce((s, x) => s + fn(x) * x.n, 0); if (tot <= 0 || amount <= 0) return 0;
    for (const x of cohorts) { const v = amount * fn(x) / tot; earn(x, v, kind); if (kind === 'emek') x.lastEmek = (x.lastEmek || 0) + v; } paidThisWeek += amount; return amount; };
  const d = pools.dungeon * P.payRate; pools.dungeon -= share(x => Math.pow(x.power, P.expD), d, 'yatirim');
  const b = pools.boss * P.payRate; pools.boss -= share(x => Math.pow(x.power, P.expB), b, 'yatirim');
  const pv = pools.pvp * P.payRate;
  const topSorted = [...cohorts].sort((u, v) => v.power - u.power); let left = 10; const top = new Set(); for (const x of topSorted) { if (left <= 0) break; top.add(x); left -= x.n; }
  pools.pvp -= share(x => (top.has(x) ? 1 : 0), pv * P.pvpTop, 'yatirim') + share(x => Math.pow(x.power, P.expP), pv * (1 - P.pvpTop), 'yatirim');
  // Ücretsiz oyuncu havuzu: piyasa değerinin %5'i/ay, kişi başı ≤100$ → görev kasasından
  const nF = cohorts.filter(x => x.type === 'f2p').reduce((s, x) => s + x.n, 0);
  const faucetUsdWeek = Math.min(P.faucetShare * mc, P.faucetCapUsd * nF) / 4.33;
  const faucetAda = Math.min(pools.quest * 0.8, faucetUsdWeek / price());
  pools.quest -= share(x => (x.type === 'f2p' ? 1 : 0), faucetAda, 'emek');
  for (const x of cohorts) if (x.type === 'f2p') x.faucetUsd += faucetAda / Math.max(1, nF) * price();
  T.fMonthGot = (T.fMonthGot || 0) + faucetAda / Math.max(1, nF) * price(); T.fMonthTarget = (T.fMonthTarget || 0) + faucetUsdWeek / Math.max(1, nF);
  const q = pools.quest * P.payRate; pools.quest -= share(() => 1, q, 'emek');
  const u = pools.ubi; pools.ubi = 0; share(() => 1, u, 'emek');
  // Pazar geri alımı: kasanın %20'si oyun içi pazar havuzuna (hammadde alıp yakar → tarım gelirini destekler)
  const bb = pools.buyback * 0.2; pools.buyback -= bb; pools.amm += bb;
  payHist.push(paidThisWeek);

  // 4) Kilit açılması (aktif oyuncu + taban)
  for (const x of cohorts) { const r = (P.unlockActive + P.unlockBase) * (brake ? 0.5 : 1); const un = x.locked * r; x.locked -= un; x.free += un; }

  // 5) Çekim: ortak havuz, katkı puanına göre pay, hak kirası
  const cap = wdCapAda();
  const req = cohorts.map(x => x.free * (x.type === 'f2p' ? P.wdF2p : P.wdPayer) * x.n);
  const reqTot = req.reduce((s, v) => s + v, 0);
  const scoreTot = cohorts.reduce((s, x) => s + x.score * x.n, 0) || 1;
  const own = cohorts.map(x => cap * x.score * x.n / scoreTot);
  const grant = req.map((r, i) => Math.min(r, own[i]));
  let unused = own.reduce((s, v, i) => s + Math.max(0, v - grant[i]), 0);
  const extraNeed = req.map((r, i) => r - grant[i]); const extraTot = extraNeed.reduce((s, v) => s + v, 0);
  const extraFrac = extraTot > 0 ? Math.min(1, unused / extraTot) : 0;
  if (reqTot > cap) T.capHit++;
  const fee = brake ? P.feeBrake : P.fee;
  let rentPool = 0;
  cohorts.forEach((x, i) => {
    const extra = extraNeed[i] * extraFrac; const tot = grant[i] + extra; if (tot <= 0) return;
    const per = tot / x.n; x.free -= per;
    const f = per * fee, rent = extra / x.n * P.rent; rentPool += rent * x.n;
    pools.ubi += f * P.feeUbi * x.n; const fb = f * (1 - P.feeUbi) * x.n; T.burned += fb; T.burnFee += fb; M.dead += fb;
    const net = per - f - rent; T.wdAda += net * x.n;
    const sold = net * (x.type === 'f2p' ? P.sellF2p : P.sellPayer) * x.n;
    x.wdUsd += net * price();
    T.soldUsd += sellAda(sold);
  });
  // hak kirası: kullanılmayan payı olan oyunculara
  const unusedBy = own.map((v, i) => Math.max(0, v - grant[i])); const ubTot = unusedBy.reduce((s, v) => s + v, 0);
  if (ubTot > 0 && rentPool > 0) cohorts.forEach((x, i) => { x.free += rentPool * unusedBy[i] / ubTot / x.n; }), T.rentPaid += rentPool;
  // Fiyat savunma yakımı (fren varken hazine rezervinden)
  if (brake) for (const k of ['dungeon', 'pvp', 'boss', 'quest', 'buyback']) { const bd = pools[k] * P.defenseBurn; pools[k] -= bd; T.burned += bd; T.burnDefense += bd; M.dead += bd; }

  // 6) Geri ödeme (yatırım getirisi, $): yatırım kanallarından gelen ≥ yatırılan $
  for (const x of cohorts) { if (x.depAda > 0 && x.paybackWeek == null && x.invAda >= x.depAda) x.paybackWeek = w - x.week; if (x.depUsd > 0 && x.paybackUsdWeek == null && x.invUsd >= x.depUsd) x.paybackUsdWeek = w - x.week; }

  if (w % 4 === 0) {
    const f = cohorts.find(x => x.type === 'f2p' && x.week === 0);
    weekly.push({ ay: w / 4, oyuncu: Math.round(cohorts.reduce((s, x) => s + x.n, 0)), pd: Math.round(mcap()), fiyat1M: +(price() * 1e6).toFixed(3), mult: +mult.toFixed(3), fren: brake,
      f2pToplamAyUsd: +(f.monthUsd || 0).toFixed(2), ortaToplam: +((mid0().totAda || 0) / mid0().depAda).toFixed(2), balinaToplam: +((wh0().totAda || 0) / wh0().depAda).toFixed(2),
      f2pAyUsd: +T.fMonthGot.toFixed(2), f2pHedefUsd: +T.fMonthTarget.toFixed(2), kasaOmruAy: +runway.toFixed(1), kasalar: Math.round(totalPools()), yakilan: Math.round(T.burned), arz: Math.round(circ()), mezun: M.grad, ortaGetiri: +(mid0().invAda / mid0().depAda).toFixed(2), balinaGetiri: +(wh0().invAda / wh0().depAda).toFixed(2) });
    T.fMonthGot = 0; T.fMonthTarget = 0; for (const x of cohorts) x.monthUsd = 0;
  }
}

// ── Rapor ───────────────────────────────────────────────────────────────────
const fmt = n => Math.round(n).toLocaleString('tr-TR');
const first = t => cohorts.find(x => x.type === t && x.week === 0);
const allE = cohorts.reduce((s, x) => s + x.emek * x.n, 0), allY = cohorts.reduce((s, x) => s + x.yatirim * x.n, 0);
const f2p = first('f2p'), mid = first('mid'), wh = first('whale');
const f2pMonthly = weekly.map(r => r.f2pAyUsd);
const summary = {
  emekPay: +(allE / (allE + allY)).toFixed(3),
  geriOdemeAyADA: { orta: mid.paybackWeek != null ? +(mid.paybackWeek / 4.33).toFixed(1) : null, balina: wh.paybackWeek != null ? +(wh.paybackWeek / 4.33).toFixed(1) : null },
  geriOdemeAyUSD: { orta: mid.paybackUsdWeek != null ? +(mid.paybackUsdWeek / 4.33).toFixed(1) : null, balina: wh.paybackUsdWeek != null ? +(wh.paybackUsdWeek / 4.33).toFixed(1) : null },
  f2pUcretsizUsdAy: { ay12: weekly[11]?.f2pAyUsd, ay36: weekly[weekly.length - 1].f2pAyUsd },
  f2pToplamGelirUsdAy: { ay6: weekly[5]?.f2pToplamAyUsd, ay12: weekly[11]?.f2pToplamAyUsd, ay24: weekly[23]?.f2pToplamAyUsd, ay36: weekly[weekly.length - 1].f2pToplamAyUsd },
  toplamGeriDonus: { orta18: weekly[17]?.ortaToplam, balina18: weekly[17]?.balinaToplam, orta36: weekly[weekly.length - 1].ortaToplam, balina36: weekly[weekly.length - 1].balinaToplam },
  f2pToplamCekilenUsd: +(f2p.wdUsd).toFixed(2),
  piyasaDegeri: { baslangic: Math.round(mcapHist[0]), ay12: weekly[11]?.pd, ay36: weekly[weekly.length - 1].pd },
  mezuniyet: M.grad, yatirilanUsd: Math.round(T.depositsUsd), satilanUsd: Math.round(T.soldUsd),
  yakilanADA: Math.round(T.burned), yakilanArzYuzde: +(100 * T.burned / circ()).toFixed(1), yakim: { harcama: Math.round(T.burnSpend), cekimUcreti: Math.round(T.burnFee), savunma: Math.round(T.burnDefense) },
  cekimSiniriDolanHafta: T.capHit, hakKirasiADA: Math.round(T.rentPaid), sonCarpan: +mult.toFixed(3), sonKasaOmruAy: weekly[weekly.length - 1].kasaOmruAy
};
if (A.out) fs.writeFileSync(A.out, JSON.stringify({ P, summary, weekly }, null, 1));
if (A.table) { console.log('ay | oyuncu | piyasa değ. $ | 1M ADA $ | çarpan | fren | f2p $ aldı/hedef | kasa ömrü ay | yatırım getirisi orta/balina | yakılan | mezun');
  for (const r of weekly.filter((_, i) => i % 3 === 2)) console.log(`${r.ay} | ${fmt(r.oyuncu)} | ${fmt(r.pd)} | ${r.fiyat1M} | ${r.mult} | ${r.fren ? 'VAR' : '-'} | ${r.f2pAyUsd}/${r.f2pHedefUsd} | ${r.kasaOmruAy} | ${r.ortaGetiri}/${r.balinaGetiri} | ${fmt(r.yakilan)} | ${r.mezun ? 'evet' : 'hayır'}`); }
console.log('ÖZET ' + JSON.stringify(summary));
