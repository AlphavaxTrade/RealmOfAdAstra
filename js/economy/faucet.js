// Ücretsiz oyuncu payı — sahte (yan) hesaplara karşı kurallar (kullanıcı kararı 4 Ekim 2026)
// ============================================================================
// Amaç: emeğini tek hesapta toplamak her zaman yan hesaplara bölmekten daha kârlı olsun.
//  • Şartlar: e-posta doğrulanmış, hiç para yatırmamış, en az MIN_LEVEL seviye, o hafta en az
//    MIN_WEEKLY_CONTRIBUTION katkı puanı (fiyat çarpanıyla ölçeklenir).
//  • Pay eşit bölünmez: ağırlık = (katkı)^WEIGHT_EXP × sadakat çarpanı. Üs 1'den büyük olduğu için aynı emeği
//    N hesaba bölen kişi toplamda daha az alır (1,5 üssüyle 3 hesap ≈ %58, yeni hesaplar seri çarpanı da olmadan ≈ %29).
//  • Sadakat serisi: şartları üst üste sağlayan hesabın çarpanı her hafta STREAK_STEP artar (en çok STREAK_MAX).
//    Kaçırılan her hafta seri yarıya iner. Yeni açılan yan hesap seriye en baştan başlar.
//  • Kişi başı üst sınır kişinin kendi ağırlığıyla ölçeklenir: tam sınır (aylık MAX_USD_PER_PLAYER) ancak FULL_CONTRIBUTION
//    katkı ve en yüksek seriyle açılır. Böylece her yeni yan hesap toplam havuzu büyütemez (eskiden her hesap havuza
//    sabit bir tavan ekliyordu). Sınıra takılanların artanı diğerlerine dağılır.
//  • Pay tamamen kilitli gelir: yalnız o hesapta oyunda harcandıkça çözülür (yan hesaptan hızlı para çıkarılamaz).
// Hem tarayıcı (panel) hem sunucu (haftalık hesaplaşma) bu dosyayı kullanır.
// ============================================================================

export const FAUCET_DEFAULTS = { MIN_LEVEL: 3, MIN_WEEKLY_CONTRIBUTION: 100, FULL_CONTRIBUTION: 1000, WEIGHT_EXP: 1.5, STREAK_STEP: 0.1, STREAK_MAX: 2.0, LOCKED: true };
const R = rules => ({ ...FAUCET_DEFAULTS, ...(rules || {}) });

// Kaçırılan haftalar sonrası seri (bu hafta hesaba katılmadan)
export function decayedStreak(streak, epoch) {
  const s = streak && typeof streak === 'object' ? streak : { weeks: 0, lastEpoch: 0 };
  const weeks = Math.max(0, Number(s.weeks) || 0), last = Number(s.lastEpoch) || 0;
  if (!weeks || !last) return 0;
  const missed = Math.max(0, epoch - 1 - last);
  return missed > 0 ? Math.floor(weeks / Math.pow(2, missed)) : weeks;
}

// Bu hafta (epoch) şartları sağladıysa yeni seri
export function nextStreak(streak, epoch) {
  const s = streak && typeof streak === 'object' ? streak : {};
  if (Number(s.lastEpoch) === epoch) return { weeks: Math.max(1, Number(s.weeks) || 1), lastEpoch: epoch };
  return { weeks: decayedStreak(s, epoch) + 1, lastEpoch: epoch };
}

export const streakMultiplier = (weeks, rules) => {
  const r = R(rules);
  return Math.min(r.STREAK_MAX, 1 + r.STREAK_STEP * Math.max(0, (Number(weeks) || 1) - 1));
};

export const minContribution = (priceMultiplier, rules) => R(rules).MIN_WEEKLY_CONTRIBUTION * (Number(priceMultiplier) || 1);

export function qualifies({ level, contribution, priceMultiplier = 1 }, rules) {
  const r = R(rules);
  return (Number(level) || 1) >= r.MIN_LEVEL && (Number(contribution) || 0) >= minContribution(priceMultiplier, r);
}

export function weightOf({ contribution, priceMultiplier = 1, streakWeeks = 1 }, rules) {
  const r = R(rules);
  const c = Math.max(0, Number(contribution) || 0) / (Number(priceMultiplier) || 1);
  return Math.pow(c, r.WEIGHT_EXP) * streakMultiplier(streakWeeks, r);
}

// Kişinin tavanının tam tavana oranı (0..1): tam katkı + en yüksek seri = 1
export function capFraction(weight, rules) {
  const r = R(rules);
  const full = Math.pow(r.FULL_CONTRIBUTION, r.WEIGHT_EXP) * r.STREAK_MAX;
  return full > 0 ? Math.min(1, Math.max(0, Number(weight) || 0) / full) : 0;
}

// Toplamı ağırlıklara göre böl; kimse kendi tavanından (sayı ya da kişi başı dizi) fazla almaz, artan diğerlerine dağılır
export function distribute(total, weights, caps = Infinity) {
  const capOf = i => (Array.isArray(caps) ? caps[i] : caps);
  const out = weights.map(() => 0);
  let left = Math.max(0, Number(total) || 0);
  let open = weights.map((w, i) => (w > 0 ? i : -1)).filter(i => i >= 0);
  for (let pass = 0; pass < 20 && left > 1e-9 && open.length; pass++) {
    const W = open.reduce((s, i) => s + weights[i], 0);
    if (!(W > 0)) break;
    let used = 0;
    const still = [];
    for (const i of open) {
      const want = left * weights[i] / W;
      const room = capOf(i) - out[i];
      const give = Math.min(want, room);
      out[i] += give; used += give;
      if (out[i] < capOf(i) - 1e-9) still.push(i);
    }
    left -= used;
    if (still.length === open.length) break;   // kimse sınıra takılmadı: hepsi dağıtıldı
    open = still;
  }
  return out.map(v => Math.floor(v * 100) / 100);
}
