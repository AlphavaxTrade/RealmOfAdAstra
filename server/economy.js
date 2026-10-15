// Realm of AdAstra sunucusu — haftalık ekonomi kuralları (saf fonksiyonlar; zincire ve veritabanına bağlı değil)
// ============================================================================
// Kullanıcı kararları (30 Eylül 2026, revize rapor 3 + token modeli scripts/model/arsiv/token_economy_model.mjs — arşiv, S11):
//  • Ortak haftalık çekim havuzu: bir haftada çekilebilecek toplam ASTRA, piyasada satılsa fiyatı en fazla %2
//    düşürecek miktardır. Havuz oyunculara katkı puanına göre paylaşılır.
//  • Kullanılmayan çekim hakkını başkaları kullanır; kullanan, fazladan çektiği miktarın %1,5'ini "hak kirası"
//    olarak hakkı kullanılmayan oyunculara öder (kullanılmayan paylarına göre).
//  • Çekim ücreti %3 (fren açıkken %6). Ücretin %50'si haftalık temel gelire (UBI), %50'si yakılır (KARAR 4, 8 Ekim 2026: yakım payı %30 → %50).
//  • Fren: piyasa değeri son 30 günün zirvesinin %75'inin altına düşerse açılır; zirvenin %85'ine dönünce ya da
//    4 hafta yeni dip yapılmazsa kapanır. Fren açıkken hazine kasalarının haftalık %1'i yakılır (fiyat savunması).
//  • Ücretsiz oyuncu havuzu: ayda piyasa değerinin %1'i, kişi başı en fazla 100$; görev kasasından ödenir.
//  • Fiyat çarpanı: fiyat açılış fiyatının altındaysa p0/p (dolar maliyeti korunur), üstündeyse (p0/p)^0,6;
//    kasalar 12 aydan kısa dayanıyorsa düşmez, 36/60 aydan uzun dayanıyorsa %10/%20 daha düşer; haftada ≤%5.
//  • KARAR 5 (8 Ekim 2026): ikili çekim tavanı — haftalık tavan = min(fiyatı %2 düşürecek miktar, son 4 haftadaki dış alımın %50'si),
//    ama bugünkü kuralın %20'sinden asla az değil. Dış alım = piyasadan net token alımı + trade sitesinden oyuna gelen pay.
//  • KARAR 6 (8 Ekim 2026): tek fiyat çarpanı k = piyasa değeri / 30 günlük zirve (0,5–1,5); kilit açılma tabanına (haftalık %1 × k)
//    ve çekim tavanına (× k) uygulanır. Giriş günü primi (%1,4) k'den etkilenmez.
//  • AKIŞ DENGESİ (kullanıcı kuralı, 15 Ekim 2026; docs/v2/MAKRO_EKONOMI_PLANI.md, EKONOMI_ILKELERI 9. ilke): KARAR 5'in yerini aldı.
//    Oyundan çıkıp satılabilecek ASTRA hiçbir zaman trade uygulamasının yarattığı alımı geçmez. Haftalık ekosistem çıkışı (oyuncu
//    çekimi + yapımcı payı) ≤ 0,5 × trade alımı VE ≤ 0,5 × net piyasa alımı (oyunun kendi çıkışı geri eklenmiş). Taban YOK: alım
//    yoksa çıkış yoktur. Ölçü = son 4 haftanın haftalık ortalaması ile son haftanın küçüğü (trade durursa çıkış hemen kısılır).
//    KARAR 5'teki iki kusur düzeldi: 4 haftalık TOPLAM alımın yarısı haftalık tavan yapılıyordu (haftalık alımın 2 katı çıkış) ve
//    dış alım sıfırken %20 taban çıkışa izin veriyordu. Fren ve k artık fiyata bakar (piyasa değeri ölçüsü oyunun yakımıyla düşüyordu).
//  • ÖDEME KADRANI (15 Ekim 2026): kasaların haftalık ödeme oranı × (son 7 günün ortalama fiyatı ÷ son 91 günün)^0,5; 0,6–1,5,
//    haftada ±%5; ödeme yapan kasaların sağlığı düşükse tavanlı. Fiyat yükselirken oyun daha çok, düşerken daha az öder.
// ============================================================================

export const WEEKLY_RULES = {
  maxPriceDrop: 0.02,
  fee: 0.03,
  feeBrake: 0.06,
  feeUbiShare: 0.50,
  rent: 0.015,
  brakeOnRatio: 0.75,
  brakeOffRatio: 0.85,
  brakeQuietDays: 28,
  defenseBurnWeekly: 0.01,
  faucetMonthlyMcapShare: 0.01,
  faucetMaxUsdPerPlayer: 100,
  // v2 düzeltmesi (E-planı S3, 8 Ekim 2026): docs/v2/KARARLAR_KESIN.md kararı "kasanın ≤%1,5'i/hafta"dır (js/config.js
  // FREE_PLAYER_POOL.WEEKLY_POOL_CAP ile aynı değer, oradaki alan şu an hiç okunmuyor); burada gömülü %80 vardı —
  // görev kasasını tek haftada boşaltabilecek bir sızıntıydı. Kalıcı çözüm (RealmRates'ten tek kaynak): Faz 4.
  faucetMaxPoolShare: 0.015,
  weeksPerMonth: 4.33,
  multExp: 0.6,
  multStep: 0.05,
  multMin: 0.05,
  multMax: 20,
  kMin: 0.5,
  kMax: 1.5,
  // Akış dengesi (15 Ekim 2026)
  exitTradeShare: 0.5,         // haftalık çıkış ≤ trade alımının bu payı
  exitMarketShare: 0.5,        // ve ≤ net piyasa alımının (kendi çıkışımız geri eklenmiş) bu payı
  tradeGameShare: 0.40,        // trade gelirinin oyuna gelen payı (kullanıcı kararı 7 Ekim 2026): trade alımı = ortak gelir ÷ bu pay
  flowWeeks: 4,                // ölçü penceresi (hafta)
  externalWindowDays: 28,      // = flowWeeks × 7 (günlük akış kutularının saklanma penceresi)
  // Ödeme Kadranı (15 Ekim 2026)
  kadranExp: 0.5, kadranMin: 0.6, kadranMax: 1.5, kadranStep: 0.05,
  kadranShortDays: 7, kadranLongDays: 91, kadranWarmupDays: 28,
  kadranHealth1: 0.5, kadranCap1: 1.0,     // ödeme yapan kasaların sağlığı (bakiye ÷ hedef rezerv) bunun altındaysa kadran en çok 1
  kadranHealth2: 0.25, kadranCap2: 0.8,    // bunun altındaysa en çok 0,8
  // Oyun İçi Fiyat Endeksi (15 Ekim 2026, makro plan B1): kişi başı haftalık dağıtım ÷ tasarım dağıtımı; bedel çarpanı = en büyüğü(endeks, fiyat çarpanı)
  endeksHafta: 4, endeksYukari: 0.25, endeksAsagi: 0.05, endeksMin: 0.05, endeksMax: 1000
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
// requests: [{ id, requested, score }] — requested: bu hafta çekmek istediği (ayrılmış) ASTRA; score: katkı puanı.
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

// Fren durumu. history: [{ at, value }] (günlük, eskiden yeniye; value = fiyat). prev: { on, since, lowAt, low }
// 15 Ekim 2026: ölçü piyasa değeri değil FİYAT (piyasa değeri = fiyat × (arz − yakılan); oyunun kendi yakımı onu düşürüp freni
// yanlışlıkla tetikleyebiliyordu). Yalnız oranlar kullanıldığı için eski { mcapUsd } kayıtları da okunur.
const degerOf = h => Number(h.value != null ? h.value : h.mcapUsd) || 0;
export function brakeState(history, prev = {}, now = Date.now(), rules = WEEKLY_RULES) {
  const day = 86400000;
  const last30 = history.filter(h => h.at >= now - 30 * day);
  if (!last30.length) return { on: false };
  const peak = Math.max(...last30.map(degerOf));
  const recent = history.filter(h => h.at > now - 3 * day);   // son 3 gün (tam 3 gün önceki kayıt hariç)
  const cur = (recent.length ? recent : last30.slice(-1)).reduce((s, h) => s + degerOf(h), 0) / Math.max(1, recent.length || 1);
  const latest = degerOf(last30[last30.length - 1]);
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

// Ücretsiz oyuncu havuzunun bu haftalık payı (kişi başı ASTRA)
export function faucetWeekly({ mcapUsd, priceUsd, freePlayers, questPool }, rules = WEEKLY_RULES) {
  if (!(freePlayers > 0) || !(priceUsd > 0)) return { perPlayer: 0, totalAda: 0, usdPerPlayerMonth: 0 };
  const monthUsd = Math.min(rules.faucetMonthlyMcapShare * mcapUsd, rules.faucetMaxUsdPerPlayer * freePlayers);
  const wantAda = monthUsd / rules.weeksPerMonth / priceUsd;
  const totalAda = Math.max(0, Math.min(wantAda, questPool * rules.faucetMaxPoolShare));
  const perPlayer = r2(totalAda / freePlayers);
  return { perPlayer, totalAda: perPlayer * freePlayers, usdPerPlayerMonth: perPlayer * priceUsd * rules.weeksPerMonth };
}

// Kasa ömrü hesabına giren toplam: yalnız verilen (oyuncuya ödeme yapan) kasalar sayılır; liste yoksa hepsi (13 Ekim 2026 denetimi EK-10)
export function runwayPoolTotal(pools, ids) {
  const p = pools || {};
  return (Array.isArray(ids) && ids.length ? ids : Object.keys(p)).reduce((s, id) => s + (Number(p[id]) || 0), 0);
}

// Piyango bilet fiyatı: taban fiyat × fiyat çarpanı, 3 basamağa yuvarlanır (oyuncu tarafındaki adaPrice gibi). Eskiden tam sayıya
// yuvarlanıyordu: 1 ASTRA × 0,4 çarpan = 0 olup ödenen tutarı sıfırlıyordu (denetim EK-08).
export function lotteryTicketPrice(base, multiplier) {
  const b = Number(base) > 0 ? Number(base) : 100;
  const m = Number(multiplier) > 0 ? Number(multiplier) : 1;
  return Math.max(0.001, Math.round(b * m * 1000) / 1000);
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


// KARAR 6: tek fiyat-duyarlılık çarpanı. cur/peak: son günlerin ortalama piyasa değeri / 30 günlük zirve. Veri yoksa 1.
export function priceFactorK({ cur, peak }, rules = WEEKLY_RULES) {
  if (!(peak > 0) || !(cur >= 0)) return 1;
  return Math.round(Math.max(rules.kMin, Math.min(rules.kMax, cur / peak)) * 10000) / 10000;
}

// OYUN İÇİ FİYAT ENDEKSİ (15 Ekim 2026, makro plan B1, denge modelinde sınandı: scripts/model/denge_modeli.mjs endeks=1).
// Bugünkü fiyatla 200 M ASTRA ~38 $ eder; trade girişi oyuna tasarımın çok üstünde ASTRA sokunca bedeller (asker, seviye, bilet)
// gelire göre anlamsızlaşıyordu. Endeks = son endeksHafta haftada kişi başı haftalık dağıtımın ortalaması ÷ tasarım dağıtımı
// (tohum kasaların haftalık oranıyla 100 vatandaşa düşen pay). Haftada en çok %25 yükselir, %5 iner. Veri yoksa önceki değer kalır.
export function oyunIciEndeks({ kisiBasiSeri = [], tasarimKisi, onceki = 1 }, rules = WEEKLY_RULES) {
  const once = Number(onceki) > 0 ? Number(onceki) : 1;
  const s = (Array.isArray(kisiBasiSeri) ? kisiBasiSeri : []).slice(-rules.endeksHafta).map(v => Math.max(0, Number(v) || 0));
  if (!s.length || !(tasarimKisi > 0)) return once;
  const hedef = Math.max(rules.endeksMin, Math.min(rules.endeksMax, s.reduce((t, v) => t + v, 0) / s.length / tasarimKisi));
  const yeni = Math.max(once * (1 - rules.endeksAsagi), Math.min(once * (1 + rules.endeksYukari), hedef));
  return Math.round(yeni * 10000) / 10000;
}

// Oyunun bedel çarpanı (asker, seviye, bilet, çark, kayıt harcı, eşikler): en büyüğü(fiyat çarpanı, oyun içi endeks).
// Fiyat düşünce fiyat çarpanı (dolar tabanı) bedeli korur; oyuna tasarımın üstünde ASTRA girince endeks korur. Pazar koridorları
// bundan etkilenmez (endeksi pazara uygulamak denge modelinde hammadde pazarını donduruyordu: fiyat endeksi 0,18).
export function etkinCarpan(econ = {}) {
  const fc = Number(econ.priceMultiplier) > 0 ? Number(econ.priceMultiplier) : 1;
  const oe = Number(econ.oyunEndeksi) > 0 ? Number(econ.oyunEndeksi) : 0;
  return Math.max(fc, oe);
}

// Haftalık seri ölçüsü (en yenisi sonda): son flowWeeks haftanın ortalaması ile son haftanın küçüğü; eksi olamaz.
// Ortalama, eksik haftaları da sayar (sunucu yeni açıldıysa ölçü küçük başlar: temkinli).
export function haftalikOlcu(seri, rules = WEEKLY_RULES) {
  const s = (Array.isArray(seri) ? seri : []).map(v => Number(v) || 0);
  if (!s.length) return 0;
  const n = Math.max(1, rules.flowWeeks);
  const son = s.slice(-n);
  const ort = son.reduce((t, v) => t + v, 0) / n;
  return Math.max(0, Math.min(ort, s[s.length - 1]));
}

// AKIŞ DENGESİ: haftalık ekosistem çıkış tavanı (token). tb: haftalık trade alımı serisi, na: haftalık net piyasa alımı serisi (oyunun
// kendi çıkışı geri eklenmiş); fiyatEtkisiTavani: fiyatı maxDrop düşürecek miktar (withdrawCapTokens). Taban yok.
export function ekosistemCikisTavani({ tb = [], na = [], fiyatEtkisiTavani = Infinity, k = 1, gonderimTavani = Infinity }, rules = WEEKLY_RULES) {
  const fiyat = Math.max(0, Number(fiyatEtkisiTavani)) * (Number(k) > 0 ? Number(k) : 1);
  const gonderim = Number(gonderimTavani) >= 0 ? Number(gonderimTavani) : Infinity;
  return Math.max(0, Math.min(rules.exitTradeShare * haftalikOlcu(tb, rules), rules.exitMarketShare * haftalikOlcu(na, rules), fiyat, gonderim));
}

// ÖDEME KADRANI: kasaların haftalık ödeme oranının çarpanı. kisaOrt / uzunOrt: son kadranShortDays ve kadranLongDays günün ortalama
// fiyatı; veriGun: kaç günlük fiyat verisi var (kadranWarmupDays dolana dek 1); kasaSagligi: ödeme yapan kasaların bakiye ÷ hedef rezervi.
export function odemeKadrani({ kisaOrt, uzunOrt, veriGun = 0, onceki = 1, kasaSagligi = 1 }, rules = WEEKLY_RULES) {
  const once = Number(onceki) > 0 ? Number(onceki) : 1;
  if (!(veriGun >= rules.kadranWarmupDays) || !(kisaOrt > 0) || !(uzunOrt > 0)) return 1;
  let hedef = Math.pow(kisaOrt / uzunOrt, rules.kadranExp);
  hedef = Math.max(rules.kadranMin, Math.min(rules.kadranMax, hedef));
  if (kasaSagligi < rules.kadranHealth2) hedef = Math.min(hedef, rules.kadranCap2);
  else if (kasaSagligi < rules.kadranHealth1) hedef = Math.min(hedef, rules.kadranCap1);
  const yeni = Math.max(once * (1 - rules.kadranStep), Math.min(once * (1 + rules.kadranStep), hedef));
  return Math.round(yeni * 10000) / 10000;
}

// İki piyasa fotoğrafı arasındaki net token alımı (alım +, satım −). Borsaya geçmeden önce Arena eğrisinin arzı, geçtikten sonra
// havuzdaki token rezervi (alıcı token çekerse rezerv azalır). Geçiş anında (biri öncesi, biri sonrası) ölçüm yapılmaz: 0.
export function netTokenFlow(prev, cur) {
  if (!prev || !cur) return 0;
  if (!prev.graduated && !cur.graduated) return (Number(cur.curveSupply) || 0) - (Number(prev.curveSupply) || 0);
  if (prev.graduated && cur.graduated) return (Number(prev.poolTokenReserve) || 0) - (Number(cur.poolTokenReserve) || 0);
  return 0;
}
