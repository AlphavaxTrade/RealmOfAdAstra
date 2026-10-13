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
