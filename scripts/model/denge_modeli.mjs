// Realm of AdAstra v2 — R4 DENGE MODELİ (tek başına Realm, 12 ay, 50-1000 oyuncu)
// ============================================================================
// Soru: haftalık kota, Üretim Hakkı dağılımı, pazar tohumu, bataklar ve geri alım hangi ayarlarla
// (a) fiyatları bir yılda %50'den fazla düşürmez, (b) kasaları 12 ay yaşatır, (c) ücretsiz oyuncuyu ilerletir,
// (d) gelir uçurumu yaratmaz, (e) kotayı boşa harcamaz? Bütün sayılar docs/v2/R2, R3, EKONOMI_ILKELERI'nden.
// Kullanım: node scripts/model/denge_modeli.mjs N=200 [weeks=52 fiyat=sabit|x3|yarim qpp=0.4 pazar=100e6 ...] [grid=1] [out=dosya.json]
// Bu bir öneri aracıdır; oyuna bağlı değildir. Kesin oyun sayıları R8'de bu modelden türetilir.
// ============================================================================
import fs from 'fs';
const A = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const num = (k, d) => (A[k] != null ? Number(A[k]) : d);

const RES = ['bugday', 'tas', 'odun', 'komur', 'demir', 'ot'];
const TABAN = { bugday: 1800, tas: 1200, odun: 1080, komur: 900, demir: 720, ot: 240 };   // birim/saat (R2)
const P0BASE = { bugday: 0.90, tas: 1.20, odun: 2.50, komur: 1.80, demir: 4.00, ot: 8.00 };   // ASTRA/birim bugünkü liste (R2); fiyatOlcek ile ölçeklenir
const TYPES = ['f2p', 'mid', 'whale'];

export function defaults() {
  return {
    N: num('N', 200), weeks: num('weeks', 52), growth: num('growth', 0.03),
    mix: { f2p: 0.70, mid: 0.25, whale: 0.05 },
    act: { f2p: num('actF2p', 0.5), mid: 1, whale: 1 },           // günün ne kadarı sefer dönüyor (orta/balina bot)
    katki: { f2p: 1.0, mid: 1.1, whale: 1.25 },                   // katkı kademesi çarpanı (Bronz…)
    qpp: num('qpp', 0.4),            // kişi başı haftalık kota = tek alanın kesintisiz haftalık üretiminin bu katı (Otorite 0); termostatta başlangıç
    kota: num('kota', 1),            // yönetici çarpanı (ana ayar kolu)
    kotaModu: A.kotaModu || 'termostat',   // sabit | termostat (fiyat açılışın üstündeyse kota %10 artar, altındaysa azalır; kişi başı en az qppMin)
    termoAdim: num('termoAdim', 0.10), termoHedef: num('termoHedef', 1.0), qppMin: num('qppMin', 0.05), qppMax: num('qppMax', 1.0),   // kişi başı kota: en az tam alanın %5'i, en çok tamamı
    otoriteTaban: num('otoriteTaban', 2e6), otoriteKat: 1.4, otoriteAstraBirim: 0.05,   // Otorite 1. sv 2 M birim, her sv ×1,4; çelik payı %30 × 0,05 ASTRA/birim Konsey kasasından
    hazirlikToplam: num('hazirlikToplam', 10e6),   // Hazırlık Deposu toplam vaadi (ASTRA değeri, P0 ile) — Universe rezervinin yarısı
    hakTavan: num('hakTavan', 3),    // en yüksek Üretim Hakkı / en düşük (adalet tavanı)
    pazar: num('pazar', 100e6),      // pazar havuzlarına ayrılan ASTRA (6 hammadde, değer ağırlıklı)
    taban: num('taban', 0.5), tavan: num('tavan', 2.5),           // fiyat koridoru (açılış fiyatının katı)
    fee: 0.02, resFee: 0.02,
    geriAlimEsik: num('geriAlimEsik', 0.8), geriAlimHiz: num('geriAlimHiz', 0.03),  // fiyat < eşik×P0 ise kasanın %x'i ile al-yak
    ortak: 0.05, otoriteShare: num('otorite', 0.10), hazirlik: num('hazirlik', 0.20), hazirlikCapWeeks: num('hazirlikCap', 4),
    toolRes: 0.25, toolAda: 0.3, staminaWheat: 0.15,
    split: { burn: 0.05, creator: 0.03, ubi: 0.06 },
    alloc: { dungeon: 0.27, arena: 0.14, boss: 0.12, buyback: 0.15, quest: 0.18, carnival: 0.04, fatih: 0.05, konsey: 0.05 },
    seed: { dungeon: 10e6, arena: 4e6, boss: 6e6, buyback: 7e6, quest: 8e6, carnival: 3e6, fatih: 20e6, konsey: 10e6, lottery: 12e6, universe: 20e6 },
    pay: { dungeon: num('pDungeon', 0.025), arena: num('pArena', 0.02), boss: num('pBoss', 0.03), quest: num('pQuest', 0.025) },   // haftalık ödeme oranları (12 ay ömür için ~%2-3)
    faucetSupplyShareMonth: 0.01, faucetPoolCapWeek: num('faucetCap', 0.015),
    fiyatOlcek: num('fiyatOlcek', 1),   // ASTRA fiyat listesinin ölçeği (1 = bugünkü liste; 0,01 = yüzde 1'i) — seviye/ordu bedelleri de aynı ölçekle
    supply: 2.13e9, p0usd: 2e-7, fiyat: A.fiyat || 'sabit',
    yatir: { f2p: 0, mid: num('yatirMid', 0), whale: num('yatirWhale', 0) },   // yıllık dış para (ASTRA), haftalara yayılır; varsayılan 0 = hiç para girmeyen dünya
    armyShare: { f2p: 0.3, mid: 0.5, whale: 0.6 },   // ASTRA gelirinin orduya (asker + teçhizat) giden payı
    botFee: 0.30,                                     // bot ücreti ≈ haftalık üretim değerinin %30'u (24 s net kârın %50'si)
    siloWeeks: 2                                      // silo = 2 haftalık üretim; fazlası çöp
  };
}

export function run(P) {
  const P0 = Object.fromEntries(RES.map(r => [r, P0BASE[r] * P.fiyatOlcek]));
  // ── pazar havuzları: ASTRA değer ağırlıklı tohum ──
  const wSum = RES.reduce((s, r) => s + TABAN[r] * P0[r], 0);
  const pool = {}; for (const r of RES) { const a = P.pazar * TABAN[r] * P0[r] / wSum; pool[r] = { A: a, R: a / P0[r] }; }
  const price = r => pool[r].A / pool[r].R;
  const K = { ...P.seed, ubi: 0 };                       // kasalar (ASTRA)
  const T = { burn: 0, creator: 0, spent: 0, deposits: 0, buybackSpent: 0, resBurned: 0, waste: 0, hazirlik: 0, sold: {}, unsold: {} };
  const spend = (amt) => { if (!(amt > 0)) return; T.spent += amt; T.burn += amt * P.split.burn; T.creator += amt * P.split.creator; K.ubi += amt * P.split.ubi;
    const t = amt * (1 - P.split.burn - P.split.creator - P.split.ubi); for (const k in P.alloc) K[k] += t * P.alloc[k]; };
  // ── oyuncu grupları ──
  const cohorts = []; const addWave = (n, w) => { for (const t of TYPES) { const c = Math.round(n * P.mix[t]); if (c > 0) cohorts.push({ type: t, count: c, since: w, level: 1, xp: 0, bal: 250, stock: Object.fromEntries(RES.map(r => [r, 0])), haz: Object.fromEntries(RES.map(r => [r, 0])), army: 0, inc: 0, out: 0, incHist: [], outHist: [] }); } };
  addWave(P.N, 0);
  let otorite = 0, otoritePool = 0;
  const otoriteCost = L => P.otoriteTaban * Math.pow(P.otoriteKat, L);
  const monthly = []; let m = 1;      // fiyat çarpanı
  const qppNow = Object.fromEntries(RES.map(r => [r, P.qpp]));   // termostatta kaynak başına kişi başı kota
  let ubiPaid = 0;
  const priceAt = w => { const f = w / P.weeks; return P.fiyat === 'x3' ? P.p0usd * (1 + 2 * f) : P.fiyat === 'yarim' ? P.p0usd * (1 - 0.5 * f) : P.p0usd; };
  let weeklyPay = 0;

  for (let w = 1; w <= P.weeks; w++) {
    if (w % 4 === 1 && w > 1) addWave(cohorts.reduce((s, c) => s + c.count, 0) * P.growth, w);
    const N = cohorts.reduce((s, c) => s + c.count, 0);
    const p = priceAt(w); const target = p < P.p0usd ? P.p0usd / p : Math.pow(P.p0usd / p, 0.6);
    m = Math.max(m * 0.95, Math.min(m * 1.05, target));
    // Otorite etkisi
    const oMult = 1 + 0.05 * otorite, oHours = ((20 + 0.2 * otorite) * (6 + 0.05 * otorite)) / 168;
    // ── 1) kota ve Üretim Hakkı dağılımı ──
    if (P.kotaModu === 'termostat' && w > 1) for (const r of RES) {   // arz fiyatı izler: fiyat hedefin üstündeyse kota artar, altındaysa azalır
      const rel = price(r) / (P0[r] * m) / P.termoHedef; const step = Math.max(-P.termoAdim, Math.min(P.termoAdim, (rel - 1)));
      qppNow[r] = Math.min(P.qppMax, Math.max(P.qppMin, qppNow[r] * (1 + step)));
    }
    const Q = Object.fromEntries(RES.map(r => [r, qppNow[r] * TABAN[r] * 168 * N * oMult * oHours * P.kota]));
    let ws = cohorts.map(c => P.act[c.type] * (1 + 0.025 * c.level) * P.katki[c.type]);
    const wMin = Math.min(...ws); ws = ws.map(x => Math.min(x, P.hakTavan * wMin));
    const W = cohorts.reduce((s, c, i) => s + ws[i] * c.count, 0);
    const prod = cohorts.map(() => ({})); let used = {};
    for (const r of RES) {
      const out = cohorts.map(c => TABAN[r] * 168 * P.act[c.type] * (1 + 0.01 * c.level));
      let hak = cohorts.map((c, i) => Q[r] * ws[i] / W);
      let take = out.map((o, i) => Math.min(o, hak[i]));
      let unused = cohorts.reduce((s, c, i) => s + (hak[i] - take[i]) * c.count, 0);
      const needers = cohorts.map((c, i) => Math.max(0, out[i] - take[i]) * c.count); const needTot = needers.reduce((a, b) => a + b, 0);
      if (unused > 0 && needTot > 0) { const f = Math.min(1, unused / needTot); take = take.map((t, i) => t + Math.max(0, out[i] - t) * f); }
      cohorts.forEach((c, i) => { prod[i][r] = take[i]; });
      used[r] = cohorts.reduce((s, c, i) => s + take[i] * c.count, 0);
    }
    const quotaUse = RES.reduce((s, r) => s + used[r] / Q[r], 0) / RES.length;
    // ── 2) oyuncu haftası ──
    const sellWant = Object.fromEntries(RES.map(r => [r, []]));
    let income = { f2p: 0, mid: 0, whale: 0 }, outgo = { f2p: 0, mid: 0, whale: 0 };
    const earn = (c, a) => { if (a > 0) { c.bal += a; c.inc += a; income[c.type] += a * c.count; } };
    const pay = (c, a) => { const x = Math.min(a, Math.max(0, c.bal)); c.bal -= x; c.out += x; outgo[c.type] += x * c.count; spend(x * c.count); return x; };
    cohorts.forEach((c, i) => {
      c.inc = 0; c.out = 0;
      const pr = { ...prod[i] };
      for (const r of RES) { const o = pr[r] * P.ortak; pr[r] -= o; otoritePool += o * c.count; }        // ortak kasa %5 → Otorite
      // ihtiyaçlar (hammadde)
      const need = Object.fromEntries(RES.map(r => [r, 0]));
      need.odun += pr.odun * P.toolRes; need.demir += pr.demir * P.toolRes;                           // alet onarımı
      need.bugday += pr.bugday * P.staminaWheat + c.army * 14;                                        // stamina + asker beslemesi
      need.ot += c.army * 0.5;
      pay(c, (pr.odun * P.toolRes * price('odun') + pr.demir * P.toolRes * price('demir')) * P.toolAda);   // onarımın ASTRA kısmı
      // seviye
      c.xp += 7 * P.act[c.type]; const needDays = 3 + 1.5 * c.level;
      if (c.xp >= needDays) { const cost = 500 * Math.pow(c.level, 1.5) * m * P.fiyatOlcek; if (c.bal >= cost) { pay(c, cost); for (const r of RES) need[r] += pr[r] * 0.10; c.level++; c.xp -= needDays; } }
      // bot ücreti
      if (c.type !== 'f2p') pay(c, RES.reduce((s, r) => s + pr[r] * price(r), 0) * P.botFee);
      // yatırım (dış para)
      if (P.yatir[c.type] > 0) { const d = P.yatir[c.type] / 52; c.bal += d; T.deposits += d * c.count; }
      // fazla / eksik
      for (const r of RES) {
        let s = pr[r] + c.stock[r] - need[r];
        if (s < 0) {   // pazardan al
          const q = -s; const cost = pool[r].A * q / (pool[r].R - Math.min(q, pool[r].R * 0.4));
          if (c.bal >= cost) { pay(c, 0); c.bal -= cost; c.out += cost; outgo[c.type] += cost * c.count; pool[r].A += cost * c.count; pool[r].R -= q * c.count; spend(cost * c.count * P.fee); }
          c.stock[r] = 0; continue;
        }
        if (['tas', 'demir', 'odun'].includes(r)) { const o = s * P.otoriteShare; s -= o; otoritePool += o * c.count; }   // Otorite'ye gönüllü katkı
        const capH = P.hazirlikCapWeeks * pr[r]; const roomTot = Math.max(0, P.hazirlikToplam - T.hazirlik) / P0[r] / c.count;
        const h = Math.min(s * P.hazirlik, Math.max(0, capH - c.haz[r]), roomTot); c.haz[r] += h; s -= h; T.hazirlik += h * c.count * P0[r];
        sellWant[r].push({ c, i, q: s });
      }
    });
    // ── 3) pazar satışı (taban fiyata kadar, orantılı) ──
    for (const r of RES) {
      const { A: Aa, R } = pool[r]; const floor = P.taban * P0[r] * m;
      const maxNet = Math.max(0, Math.sqrt(Aa * R / floor) - R);          // taban fiyata kadar satılabilecek net miktar
      const want = sellWant[r].reduce((s, x) => s + x.q * x.c.count, 0);
      const f = want > 0 ? Math.min(1, maxNet / (want * (1 - P.resFee))) : 0;
      let netIn = 0, astraOut = 0;
      for (const x of sellWant[r]) {
        const q = x.q * f * x.c.count, net = q * (1 - P.resFee); T.resBurned += q * P.resFee;
        const gross = pool[r].A * net / (pool[r].R + net); pool[r].R += net; pool[r].A -= gross;
        const got = gross * (1 - P.fee); spend(gross * P.fee); earn(x.c, got / x.c.count); netIn += net; astraOut += got;
        const left = x.q * (1 - f); const cap = P.siloWeeks * prod[x.i][r]; x.c.stock[r] = Math.min(left, cap); T.waste += Math.max(0, left - cap) * x.c.count;
      }
      T.sold[r] = (T.sold[r] || 0) + netIn; T.unsold[r] = (T.unsold[r] || 0) + want * (1 - f);
    }
    // ── 4) kasalardan ödemeler ──
    weeklyPay = 0;
    const payPool = (k, rate, weightFn) => { const budget = K[k] * rate * m; const ws = cohorts.map(weightFn); const tot = ws.reduce((s, x, i) => s + x * cohorts[i].count, 0); if (!(tot > 0) || !(budget > 0)) return; K[k] -= budget; weeklyPay += budget; cohorts.forEach((c, i) => earn(c, budget * ws[i] / tot)); };
    payPool('dungeon', P.pay.dungeon, c => c.army > 0 ? c.army : 0);
    payPool('arena', P.pay.arena, c => (c.type === 'f2p' ? 0 : Math.max(1, c.army)));
    payPool('boss', P.pay.boss, c => P.act[c.type] * (1 + 0.1 * c.level));
    payPool('quest', P.pay.quest, c => 1);
    { const f2pN = cohorts.filter(c => c.type === 'f2p' && c.level >= 3).reduce((s, c) => s + c.count, 0);   // ücretsiz pay: ayda arzın %1'i (token), kasanın haftada ≤%2'si
      const want = P.faucetSupplyShareMonth * P.supply / 4.33, give = Math.min(want, K.quest * P.faucetPoolCapWeek); if (f2pN > 0 && give > 0) { K.quest -= give; weeklyPay += give; cohorts.filter(c => c.type === 'f2p' && c.level >= 3).forEach(c => earn(c, give / f2pN)); } }
    ubiPaid = 0;
    { const ws = cohorts.map(c => c.level >= 3 ? 1 + 0.75 * Math.sqrt(c.level - 1) : 0); const tot = ws.reduce((s, x, i) => s + x * cohorts[i].count, 0); if (tot > 0) { const b = K.ubi; K.ubi = 0; ubiPaid = b; cohorts.forEach((c, i) => earn(c, b * ws[i] / tot)); } }
    // ── 5) ordu harcaması (ASTRA + pazardan hammadde alıp yakma) ──
    cohorts.forEach(c => {
      const a = c.inc * P.armyShare[c.type]; if (!(a > 0)) return;
      const x = pay(c, a * 0.5);                                   // asker/teçhizat ASTRA kısmı
      let budget = Math.min(a * 0.5, Math.max(0, c.bal)) * c.count; // hammadde kısmı: demir %50, kömür %30, taş %20
      for (const [r, s] of [['demir', 0.5], ['komur', 0.3], ['tas', 0.2]]) { const b = budget * s; const ceil = P.tavan * P0[r] * m; const xMax = Math.max(0, pool[r].R - Math.sqrt(pool[r].A * pool[r].R / ceil)); const q = Math.min(pool[r].R * b / (pool[r].A + b), xMax); if (q > 0) { const cost = pool[r].A * q / (pool[r].R - q); pool[r].A += cost; pool[r].R -= q; c.bal -= cost / c.count; c.out += cost / c.count; outgo[c.type] += cost; spend(cost * P.fee); T.resBurned += q; } }
      c.army += (x + budget / c.count) / (2000 * P.fiyatOlcek);    // 2.000 ASTRA (ölçekli) ≈ 1 asker gücü
    });
    // ── 6) geri alım: fiyat eşiğin altındaysa kasanın %x'i ile al-yak ──
    for (const r of RES) { const thr = P.geriAlimEsik * P0[r] * m; if (price(r) < thr && K.buyback > 0) { const B = K.buyback * P.geriAlimHiz / RES.length; const xThr = Math.max(0, pool[r].R - Math.sqrt(pool[r].A * pool[r].R / thr)); const xB = pool[r].R * B / (pool[r].A + B); const q = Math.min(xThr, xB); if (q > 0) { const cost = pool[r].A * q / (pool[r].R - q); pool[r].A += cost; pool[r].R -= q; K.buyback -= cost; T.buybackSpent += cost; T.resBurned += q; } } }
    // ── 7) Otorite ilerlemesi (çelik payı %30: Konsey kasasından ASTRA, 1 birim = 1 ASTRA) ──
    while (otorite < 20 && otoritePool >= otoriteCost(otorite) * 0.7 && K.konsey >= otoriteCost(otorite) * 0.3 * P.otoriteAstraBirim) { otoritePool -= otoriteCost(otorite) * 0.7; K.konsey -= otoriteCost(otorite) * 0.3 * P.otoriteAstraBirim; otorite++; }
    cohorts.forEach(c => { c.incHist.push(c.inc); c.outHist.push(c.out); });
    // ── aylık kayıt ──
    if (w % 4 === 0) {
      const idx = Math.exp(RES.reduce((s, r) => s + Math.log(price(r) / (P0[r] * m)), 0) / RES.length);   // çarpan düzeltilmiş fiyat endeksi
      const idxUsd = Math.exp(RES.reduce((s, r) => s + Math.log(price(r) * p / (P0[r] * P.p0usd)), 0) / RES.length);
      const byType = {}; for (const t of TYPES) { const cs = cohorts.filter(c => c.type === t); const n = cs.reduce((s, c) => s + c.count, 0); byType[t] = { n, inc: income[t] / Math.max(1, n), net: (income[t] - outgo[t]) / Math.max(1, n), level: cs.length ? Math.round(cs.reduce((s, c) => s + c.level * c.count, 0) / n) : 0, bal: cs.length ? cs.reduce((s, c) => s + c.bal * c.count, 0) / n : 0 }; }
      const incTot = TYPES.reduce((s, t) => s + income[t], 0);
      const pools = ['dungeon', 'arena', 'boss', 'buyback', 'quest', 'carnival', 'konsey'].reduce((s, k) => s + K[k], 0);
      monthly.push({ ay: w / 4, N, idx: +idx.toFixed(3), idxUsd: +idxUsd.toFixed(3), fiyat: Object.fromEntries(RES.map(r => [r, +price(r).toFixed(2)])), m: +m.toFixed(3), quotaUse: +quotaUse.toFixed(2), qpp: +(RES.reduce((s, r) => s + qppNow[r], 0) / RES.length).toFixed(3), otorite, pools: Math.round(pools), pazarASTRA: Math.round(RES.reduce((s, r) => s + pool[r].A, 0)), runwayMonths: weeklyPay > 0 ? +(pools / (weeklyPay * 4.33)).toFixed(1) : 999, byType, top5Share: incTot > 0 ? +(income.whale / incTot).toFixed(2) : 0, whaleF2pRatio: byType.f2p.inc > 0 ? +(byType.whale.inc / byType.f2p.inc).toFixed(1) : 0, burned: Math.round(T.burn), buyback: Math.round(T.buybackSpent), waste: Math.round(T.waste), hazirlikASTRA: Math.round(T.hazirlik) });
    }
  }
  const last = monthly[monthly.length - 1];
  const idxMin = Math.min(...monthly.map(x => x.idx)), idxUsdMin = Math.min(...monthly.map(x => x.idxUsd));
  const runwayMin = Math.min(...monthly.map(x => x.runwayMonths));
  const f2pUsdMonth = last.byType.f2p.net * 4.33 * priceAt(P.weeks);
  const checks = { fiyat: idxMin >= 0.5, kasa: runwayMin >= 12, f2pSeviye: last.byType.f2p.level >= 8, adalet: last.whaleF2pRatio <= 6 && last.top5Share <= 0.35, kota: last.quotaUse >= 0.6 };
  const passed = Object.values(checks).filter(Boolean).length;
  return { P: { N: P.N, fiyatOlcek: P.fiyatOlcek, qpp: P.qpp, qppSon: last.qpp, kotaModu: P.kotaModu, kota: P.kota, pazar: P.pazar, geriAlimEsik: P.geriAlimEsik, hazirlik: P.hazirlik, fiyat: P.fiyat, hakTavan: P.hakTavan, yatirMid: P.yatir.mid, yatirWhale: P.yatir.whale }, idxMin: +idxMin.toFixed(2), idxUsdMin: +idxUsdMin.toFixed(2), runwayMin, f2pLevel: last.byType.f2p.level, f2pNetMonth: Math.round(last.byType.f2p.net * 4.33), f2pUsdMonth: +f2pUsdMonth.toFixed(4), whaleF2pRatio: last.whaleF2pRatio, top5Share: last.top5Share, quotaUse: last.quotaUse, otorite: last.otorite, pazarASTRA: last.pazarASTRA, pools: last.pools, burned: last.burned, buyback: last.buyback, waste: last.waste, hazirlik: last.hazirlikASTRA, deposits: Math.round(T.deposits), checks, passed, monthly };
}

const fmt = v => Math.round(v).toLocaleString('tr-TR');
if (A.grid) {
  const combos = []; const grid = { qpp: [0.25, 0.4, 0.6], pazar: [60e6, 100e6], geriAlimEsik: [0.7, 0.85], hazirlik: [0.1, 0.3] };
  for (const qpp of grid.qpp) for (const pazar of grid.pazar) for (const g of grid.geriAlimEsik) for (const h of grid.hazirlik) {
    const rows = [50, 200, 500, 1000].map(N => run({ ...defaults(), N, qpp, pazar, geriAlimEsik: g, hazirlik: h }));
    const worst = { passed: Math.min(...rows.map(r => r.passed)), idxMin: Math.min(...rows.map(r => r.idxMin)), runwayMin: Math.min(...rows.map(r => r.runwayMin)), f2pLevel: Math.min(...rows.map(r => r.f2pLevel)), ratio: Math.max(...rows.map(r => r.whaleF2pRatio)), quotaUse: Math.min(...rows.map(r => r.quotaUse)) };
    combos.push({ qpp, pazar, geriAlimEsik: g, hazirlik: h, worst, rows: rows.map(r => ({ N: r.P.N, passed: r.passed, idxMin: r.idxMin, runwayMin: r.runwayMin, f2pLevel: r.f2pLevel, ratio: r.whaleF2pRatio, quotaUse: r.quotaUse, waste: r.waste })) });
  }
  combos.sort((a, b) => b.worst.passed - a.worst.passed || b.worst.idxMin - a.worst.idxMin);
  console.log('qpp | pazar | geriAlım eşik | hazırlık | en kötü N: geçen/5 | fiyat endeksi min | kasa ömrü min (ay) | f2p seviye min | balina/f2p gelir max | kota kullanımı min');
  for (const c of combos) console.log(`${c.qpp} | ${fmt(c.pazar / 1e6)} M | ${c.geriAlimEsik} | ${c.hazirlik} | ${c.worst.passed} | ${c.worst.idxMin} | ${c.worst.runwayMin} | ${c.worst.f2pLevel} | ${c.worst.ratio} | ${c.worst.quotaUse}`);
  if (A.out) fs.writeFileSync(A.out, JSON.stringify(combos, null, 1));
} else {
  const r = run(defaults());
  console.log(`N=${r.P.N} fiyatÖlçek=${r.P.fiyatOlcek} kota=${r.P.kotaModu} qpp=${r.P.qpp}→${r.P.qppSon} kota×${r.P.kota} pazar=${fmt(r.P.pazar)} geriAlım<${r.P.geriAlimEsik} hazırlık=${r.P.hazirlik} fiyat=${r.P.fiyat} yatırım orta/balina=${fmt(r.P.yatirMid)}/${fmt(r.P.yatirWhale)}`);
  console.log('ay | oyuncu | fiyat endeksi (ASTRA / $) | çarpan | kota kull. | kişi başı kota | Otorite | kasalar | kasa ömrü ay | pazar ASTRA | f2p sv / aylık net | orta sv | balina sv | balina/f2p | ilk %5 payı | yakılan | geri alım | çöp | hazırlık deposu (ASTRA değeri)');
  for (const x of r.monthly) console.log(`${x.ay} | ${fmt(x.N)} | ${x.idx} / ${x.idxUsd} | ${x.m} | ${x.quotaUse} | ${x.qpp} | ${x.otorite} | ${fmt(x.pools)} | ${x.runwayMonths} | ${fmt(x.pazarASTRA)} | ${x.byType.f2p.level} / ${fmt(x.byType.f2p.net * 4.33)} | ${x.byType.mid.level} | ${x.byType.whale.level} | ${x.whaleF2pRatio} | ${x.top5Share} | ${fmt(x.burned)} | ${fmt(x.buyback)} | ${fmt(x.waste)} | ${fmt(x.hazirlikASTRA)}`);
  console.log('SONUÇ', JSON.stringify({ ...r, monthly: undefined }));
  if (A.out) fs.writeFileSync(A.out, JSON.stringify(r, null, 1));
}
