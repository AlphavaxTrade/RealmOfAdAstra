// Realm of AdAstra — savaş sonuç kartlarındaki ASTRA kazancının yazılışı (saf; tests/test_denetim_2026_10_arayuz.mjs).
// Denetim QA-14: kart "+0 ASTRA" yazıyordu ama bakiye +0,9 artmıştı (0,72'si kilitli): toplam aşağı yuvarlanıyordu ve kilitli kısım
// hiç anılmıyordu. Oyundan kazanılan ASTRA'nın FREE_SHARE'i serbest, kalanı kilitli gelir (js/gameState/ekonomi.js _onAdaEarned);
// buradaki rakamlar bakiyedeki gerçek artışla (sunucunun delta'sıyla) birebir aynıdır.

const TR = 'tr-TR';

// 1.000 ve üstü tam sayı (aşağı), 1 ve üstü 2 ondalık, daha küçükler 3 ondalık; sonda gereksiz sıfır yok
function astraSayi(v) {
  const n = Math.abs(Number(v));
  if (!Number.isFinite(n)) return '0';
  if (n >= 1000) return Math.floor(n).toLocaleString(TR);   // büyük tutar aşağı yuvarlanır: olandan fazlası yazılmaz
  const ondalik = n >= 1 ? 2 : 3;
  return n.toLocaleString(TR, { minimumFractionDigits: 0, maximumFractionDigits: ondalik });
}

/**
 * @param {number} toplam         bakiyeye eklenen toplam ASTRA
 * @param {number} serbestOran    GAME_CONFIG.LOCKED_BALANCE.FREE_SHARE (varsayılan 0,2)
 * @returns {string} "+0,9 ASTRA (0,18 serbest · 0,72 kilitli)"; kazanç yoksa "+0 ASTRA"
 */
export function kazancYazisi(toplam, serbestOran = 0.2) {
  const t = Math.max(0, Number(toplam) || 0);
  if (t <= 0) return '+0 ASTRA';
  const oran = Math.min(1, Math.max(0, Number.isFinite(Number(serbestOran)) ? Number(serbestOran) : 0.2));
  const serbest = t * oran;
  const kilitli = t - serbest;
  if (kilitli <= 0) return `+${astraSayi(t)} ASTRA`;
  return `+${astraSayi(t)} ASTRA (${astraSayi(serbest)} serbest · ${astraSayi(kilitli)} kilitli)`;
}

// ── Günlük ödeme tavanı (denetim 2. tur, E-2) ─────────────────────────────────────────────────────────────────
// Kural oyunda (gameState.getDungeonDayStatus().budgetLeft / personalCap, kolezyumda günlük kişi tavanı, kasa haftalık payı);
// buradaki işlevler yalnız oyunun söylediği "kalan" ve "tavan" değerlerinden kullanıcıya görünen cümleyi kurar, hiçbir hesap tekrarlamaz.
const ESIK = 1e-9;

/**
 * Savaştan ÖNCE: bu zaferin ödülü bugünkü kalan ödeme payına takılıyor mu?
 * @param {number} kalan     oyunun bildirdiği bugünkü kalan ödeme (ASTRA)
 * @param {number} tabanOdul bu zaferin taban ASTRA ödülü
 * @param {number} [tavan]   günlük kişi tavanı (biliniyorsa cümleye eklenir)
 * @returns {{ton: 'kotu'|'uyari', metin: string}|null} tavan sorunu yoksa null
 */
export function odemeOnizlemeNotu(kalan, tabanOdul, tavan) {
  const k = Math.max(0, Number(kalan) || 0);
  const t = Math.max(0, Number(tabanOdul) || 0);
  if (!(t > 0)) return null;
  const tavanYazi = Number(tavan) > 0 ? ` (günlük tavanın ${astraSayi(tavan)} ASTRA)` : '';
  if (k <= ESIK) return { ton: 'kotu', metin: `Bugünkü ödeme tavanın doldu${tavanYazi}: bu zaferden ASTRA gelmez; deneyim ve ganimet sürer. Yarın 00:00'da (TSİ) yenilenir.` };
  if (k + ESIK < t) return { ton: 'uyari', metin: `Bugünkü kalan ödeme payın ${astraSayi(k)} ASTRA${tavanYazi}: bu zaferin ödülü en fazla o kadar olur.` };
  return null;
}

/**
 * Savaştan SONRA sonuç kartındaki not. Önce haftalık pay (daha uzun sürer), sonra günlük tavan.
 * @param {{haftalikDoldu?: boolean, azaldi?: boolean, gunlukKalan?: number, haftalikMesaj?: string}} g
 *   haftalikDoldu: sonuçtaki budgetFull / personCapped; azaldi: ödül taban ödülden küçük (budgetCapped / ödül azalmış)
 */
export function odemeSinirNotu({ haftalikDoldu = false, azaldi = false, gunlukKalan = Infinity, haftalikMesaj = 'Bu haftaki ödeme payı doldu; Pazartesi yenilenir.' } = {}) {
  if (haftalikDoldu) return haftalikMesaj;
  const gunlukBitti = Number(gunlukKalan) <= ESIK;
  if (gunlukBitti && azaldi) return "Bugünkü ödeme tavanın doldu; ödül azaldı. Yarın 00:00'da (TSİ) yenilenir.";
  if (gunlukBitti) return "Bugünkü ödeme tavanına ulaştın; bundan sonraki zaferler ASTRA vermez. Yarın 00:00'da (TSİ) yenilenir.";
  if (azaldi) return 'Bu haftaki ödeme payı sınırı yüzünden ödül azaldı; Pazartesi yenilenir.';
  return '';
}
