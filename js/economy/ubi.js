// Realm of AdAstra — Evrensel Temel Gelir (UBI) hesap motoru (saf fonksiyonlar; tarayıcıda ve sunucuda aynı)
// ============================================================================
// Kurallar (29 Eylül 2026, kullanıcı kararı):
//  • Oyunda harcanan her ASTRA'nın %6'sı o haftanın UBI kasasında birikir.
//  • Pazartesi 00:01 (TSİ) geçen haftanın kasası açılır; hak sahipleri arasında seviye ağırlığına göre bölünür.
//  • Hak kazanmak için en az 3. seviye olmak gerekir.
//  • Kasa bir hafta boyunca çekilebilir; çekilmeyen pay bir sonraki haftanın kasasına eklenir.
//  • Tek çekim tavanı: hiç kimse haftanın açılış kasasının `maxSingleShare` oranından (%5) fazlasını alamaz;
//    az kişi varken artan kısım dağıtılmaz, kasada kalır ve bir sonraki haftaya devreder.
// ============================================================================

export const DEFAULT_UBI_RULES = {
  minLevel: 3,
  // W(L) = 1 + 0,75·√(L−1)  →  Lv.3 = 2,06 · Lv.10 = 3,25 · Lv.81 = 7,71
  weight: (level) => 1 + Math.sqrt(Math.max(1, level) - 1) * 0.75
};

export function isEligible(level, rules = DEFAULT_UBI_RULES) {
  return (Number(level) || 1) >= rules.minLevel;
}

export function levelWeight(level, rules = DEFAULT_UBI_RULES) {
  return isEligible(level, rules) ? rules.weight(Number(level) || 1) : 0;
}

// Haftanın açılışı: yeni dağıtım kasası = geçen hafta biriken + önceki haftadan çekilmeyen
export function openWeek({ accruedLastWeek = 0, unclaimedCarry = 0 }) {
  return Math.max(0, accruedLastWeek) + Math.max(0, unclaimedCarry);
}

// Oyuncunun payı. totalWeight = o haftanın bütün hak sahiplerinin ağırlık toplamı (sunucu hesaplar).
export function shareOf({ pot, playerLevel, totalWeight, rules = DEFAULT_UBI_RULES }) {
  const w = levelWeight(playerLevel, rules);
  if (w <= 0 || pot <= 0) return 0;
  const tw = Math.max(w, Number(totalWeight) || 0);
  const cap = rules.maxSingleShare > 0 ? pot * rules.maxSingleShare : Infinity;
  return Math.floor(Math.min(pot * w / tw, cap) * 100) / 100;
}
