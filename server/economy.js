// Realm of AdAstra sunucusu — haftalık ekonomi kuralları (saf fonksiyonlar; zincire ve veritabanına bağlı değil)
// ============================================================================
// Kullanıcı kararları (30 Eylül 2026, revize rapor 3 + token modeli scripts/model/token_economy_model.mjs):
//  • Ortak haftalık çekim havuzu: bir haftada çekilebilecek toplam ADA, piyasada satılsa fiyatı en fazla %2
//    düşürecek miktardır. Havuz oyunculara katkı puanına göre paylaşılır.
//  • Kullanılmayan çekim hakkını başkaları kullanır; kullanan, fazladan çektiği miktarın %1,5'ini "hak kirası"
//    olarak hakkı kullanılmayan oyunculara öder (kullanılmayan paylarına göre).
//  • Çekim ücreti %3 (fren açıkken %6). Ücretin %70'i haftalık temel gelire (UBI), %30'u yakılır.
//  • Fren: piyasa değeri son 30 günün zirvesinin %75'inin altına düşerse açılır; zirvenin %85'ine dönünce ya da
//    4 hafta yeni dip yapılmazsa kapanır. Fren açıkken hazine kasalarının haftalık %1'i yakılır (fiyat savunması).
//  • Ücretsiz oyuncu havuzu: ayda piyasa değerinin %1'i, kişi başı en fazla 100$; görev kasasından ödenir.
//  • Fiyat çarpanı: fiyat açılış fiyatının altındaysa p0/p (dolar maliyeti korunur), üstündeyse (p0/p)^0,6;
//    kasalar 12 aydan kısa dayanıyorsa düşmez, 36/60 aydan uzun dayanıyorsa %10/%20 daha düşer; haftada ≤%5.
// ============================================================================

export const WEEKLY_RULES = {
  maxPriceDrop: 0.02,
  fee: 0.03,
  feeBrake: 0.06,
  feeUbiShare: 0.70,
  rent: 0.015,
  brakeOnRatio: 0.75,
  brakeOffRatio: 0.85,
  brakeQuietDays: 28,
  defenseBurnWeekly: 0.01,
  faucetMonthlyMcapShare: 0.01,
  faucetMaxUsdPerPlayer: 100,
  faucetMaxPoolShare: 0.8,
  weeksPerMonth: 4.33,
  multExp: 0.6,
  multStep: 0.05,
  multMin: 0.05,
  multMax: 20
};

const r2 = v => Math.floor(v * 100) / 100;

// Fiyatı en fazla maxDrop düşürecek satış miktarı (token).
// Borsaya geçmeden önce Arena eğrisinde fiyat arzın karesiyle orantılıdır: p ∝ S² → S·(1 − √(1 − d)).
// Geçtikten sonra sabit çarpımlı havuzda: T·(1/√(1 − d) − 1), T = havuzdaki token.
export function withdrawCapTokens({ graduated, curveSupply = 0, poolTokenReserve = 0 }, maxDrop = WEEKLY_RULES.maxPriceDrop) {
  if (graduated) return Math.max(0, poolTokenReserve * (1 / Math.sqrt(1 - maxDrop) - 1));
  return Math.max(0, curveSupply * (1 - Math.sqrt(1 - maxDrop)));
}

// Haftalık çekim dağıtımı.
// requests: [{ id, requested, score }] — requested: bu hafta çekmek istediği (ayrılmış) ADA; score: katkı puanı.
// Katkı puanı olup talebi olmayan oyuncular da listede olmalı (requested: 0): kullanılmayan hakları kira getirir.
export function allocateWithdrawals(requests, cap, { brake = false, rules = WEEKLY_RULES } = {}) {
  const rows = requests.map(r => ({ id: r.id, requested: Math.max(0, Number(r.requested) || 0), score: Math.max(0, Number(r.score) || 0) }));
  const scoreTot = rows.reduce((s, r) => s + r.score, 0);
  for (const r of rows) {
    r.own = scoreTot > 0 ? cap * r.score / scoreTot : 0;
    r.granted = Math.min(r.requested, r.own);
    r.unused = r.own - r.granted;
    r.extraNeed = r.requested - r.granted;
  }
  const unusedTot = rows.reduce((s, r) => s + r.unused, 0);
  const extraTot = rows.reduce((s, r) => s + r.extraNeed, 0);
  const extraFrac = extraTot > 0 ? Math.min(1, unusedTot / extraTot) : 0;
  const feeRate = brake ? rules.feeBrake : rules.fee;
  let rentPool = 0, feeTot = 0;
  for (const r of rows) {
    r.extra = r.extraNeed * extraFrac;
    r.total = r.granted + r.extra;
    r.fee = r.total * feeRate;
    r.rent = r.extra * rules.rent;
    r.net = r.total - r.fee - r.rent;
    r.returned = r.requested - r.total;          // karşılanamayan kısım bakiyeye geri döner
    rentPool += r.rent;
    feeTot += r.fee;
  }
  // Hak kirası: kullanılmayan payı olanlara, kullanılmayan paylarının kullanılan kısmı oranında
  const usedOfUnused = Math.min(unusedTot, extraTot);
  const rentPayouts = [];
  if (rentPool > 0 && unusedTot > 0) {
    for (const r of rows) {
      if (r.unused > 0) rentPayouts.push({ id: r.id, amount: rentPool * r.unused / unusedTot });
    }
  }
  return {
    cap, feeRate, brake,
    rows: rows.map(({ extraNeed, ...r }) => r),
    totals: {
      requested: rows.reduce((s, r) => s + r.requested, 0),
      sent: rows.reduce((s, r) => s + r.net, 0),
      fee: feeTot,
      feeToUbi: feeTot * rules.feeUbiShare,
      feeBurn: feeTot * (1 - rules.feeUbiShare),
      rent: rentPool,
      unusedRights: unusedTot,
      rentedRights: usedOfUnused
    },
    rentPayouts
  };
}

// Fren durumu. history: [{ at, mcapUsd }] (günlük, eskiden yeniye). prev: { on, since, lowAt, low }
export function brakeState(history, prev = {}, now = Date.now(), rules = WEEKLY_RULES) {
  const day = 86400000;
  const last30 = history.filter(h => h.at >= now - 30 * day);
  if (!last30.length) return { on: false };
  const peak = Math.max(...last30.map(h => h.mcapUsd));
  const recent = history.filter(h => h.at > now - 3 * day);   // son 3 gün (tam 3 gün önceki kayıt hariç)
  const cur = (recent.length ? recent : last30.slice(-1)).reduce((s, h) => s + h.mcapUsd, 0) / Math.max(1, recent.length || 1);
  const latest = last30[last30.length - 1].mcapUsd;
  const st = { on: !!prev.on, since: prev.since || null, low: prev.low ?? null, lowAt: prev.lowAt ?? null, peak, cur };
  if (!st.on) {
    if (peak > 0 && cur < rules.brakeOnRatio * peak) { st.on = true; st.since = now; st.low = latest; st.lowAt = now; }
    return st;
  }
  if (st.low == null || latest < st.low) { st.low = latest; st.lowAt = now; }
  if (cur >= rules.brakeOffRatio * peak || now - (st.lowAt || now) >= rules.brakeQuietDays * day) {
    return { on: false, since: null, low: null, lowAt: null, peak, cur, releasedAt: now };
  }
  return st;
}

// Ücretsiz oyuncu havuzunun bu haftalık payı (kişi başı ADA)
export function faucetWeekly({ mcapUsd, priceUsd, freePlayers, questPool }, rules = WEEKLY_RULES) {
  if (!(freePlayers > 0) || !(priceUsd > 0)) return { perPlayer: 0, totalAda: 0, usdPerPlayerMonth: 0 };
  const monthUsd = Math.min(rules.faucetMonthlyMcapShare * mcapUsd, rules.faucetMaxUsdPerPlayer * freePlayers);
  const wantAda = monthUsd / rules.weeksPerMonth / priceUsd;
  const totalAda = Math.max(0, Math.min(wantAda, questPool * rules.faucetMaxPoolShare));
  const perPlayer = r2(totalAda / freePlayers);
  return { perPlayer, totalAda: perPlayer * freePlayers, usdPerPlayerMonth: perPlayer * priceUsd * rules.weeksPerMonth };
}

// Fiyat çarpanının bu haftaki yeni değeri
export function nextMultiplier({ current = 1, priceUsd, launchPriceUsd, runwayMonths = 0 }, rules = WEEKLY_RULES) {
  if (!(priceUsd > 0) || !(launchPriceUsd > 0)) return current;
  let target = priceUsd < launchPriceUsd ? launchPriceUsd / priceUsd : Math.pow(launchPriceUsd / priceUsd, rules.multExp);
  if (priceUsd >= launchPriceUsd) {
    if (runwayMonths < 12) target = Math.max(target, current);
    else if (runwayMonths > 60) target *= 0.8;
    else if (runwayMonths > 36) target *= 0.9;
  }
  target = Math.max(rules.multMin, Math.min(rules.multMax, target));
  const next = Math.max(current * (1 - rules.multStep), Math.min(current * (1 + rules.multStep), target));
  return Math.round(next * 10000) / 10000;
}
