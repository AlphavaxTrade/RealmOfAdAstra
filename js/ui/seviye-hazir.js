// Realm of AdAstra — "Hesabı yükseltebilirsin" kontrolü (19 Ekim 2026): deneyim (XP) çubuğu dolduysa oyuncuya haber vermek için.
// Saf işlev: DOM'a dokunmaz. Yalnız XP'ye bakar (hammadde ve ASTRA bedelini Karakter ekranı gösterir).
// Hesap seviyesi artınca tavana takılıp birikmiş asker XP'si de seviyeye döner (js/gameState/gelisim.js levelUp).

/**
 * @param {object} gs oyun durumu yöneticisi
 * @returns {{sonraki: number, xp: number, gereken: number}|null} XP yetiyorsa bilgi, yetmiyorsa ya da maksimum seviyedeyse null
 */
export function seviyeHazir(gs) {
  if (!gs || typeof gs.getNextLevelRequirement !== 'function') return null;
  const r = gs.getNextLevelRequirement();
  if (!r || r.isMaxLevel || !(Number(r.xp) > 0)) return null;
  const xp = Number(gs.state && gs.state.currentXp) || 0;
  if (xp < Number(r.xp)) return null;
  return { sonraki: (Number(gs.state.level) || 1) + 1, xp, gereken: Number(r.xp) };
}

/** Oyuncuya gösterilecek cümle. */
export function seviyeHazirYazisi(bilgi) {
  return `🆙 Hesap XP'n doldu: Seviye ${bilgi.sonraki}'e çıkabilirsin! Karakter ekranından seviye atla; askerlerinin biriken XP'si de seviyeye döner.`;
}
