// Realm of AdAstra — model araçlarının ortak ZİNCİR hesabı (Arena eğrisi + mezuniyet + borsa havuzu)
// ============================================================================
// Arena eğrisi: fiyat arzın karesiyle artar (a = 901, c = 232210432401; tutarlar tam token, rezerv AVAX). 7,3 milyar arzda
// "mezuniyet": eğrideki AVAX + 2,45 milyar token sabit çarpımlı borsa havuzuna geçer, 2,7 milyar token daha basılır (toplam 10 milyar).
// Yakılan token arzda kalır (ölü adres) ama asla satılamaz: satış eğride arzı en çok yakılan miktara kadar indirebilir.
// Alımda %1 ücret (Arena), satışta ücret yok (R4c modelindeki kabul). Doğrulama: megalodon-live-deck docs/ekonomi/MODEL.md
// (sözleşmenin calculateCost teklifiyle birebir). Kullananlar: astra_fiyat_yolu.mjs (R4c), makro_model.mjs (makro plan).
// ============================================================================
export const EGRI = { a: 901, c: 232210432401, GRAD: 7.3e9, HAVUZ_TOKEN: 2.45e9, MEZUNIYET_BASIM: 2.7e9, ALIM_UCRETI: 0.01 };

const { a, c } = EGRI;
export const curveR = s => a * s ** 3 / (3 * c) / 1e18;          // arz s iken eğrideki AVAX
export const curveS = r => Math.cbrt(r * 3 * c * 1e18 / a);      // eğride r AVAX varken arz
export const curveP = s => a * s * s / c / 1e18;                 // arz s iken 1 tokenın AVAX fiyatı

// Başlangıç: 30 Eylül 2026 okuması (2,1325 milyar arz, 165 M yakılmış). avaxUsd: dolar çevirisi (sabit kabul).
export function zincirOlustur({ avaxUsd = 11.43, S0 = 2.1325e9, dead0 = 165e6 } = {}) {
  const M = { S: S0, dead: dead0, grad: false, R: curveR(S0), T: 0, gradWeek: null };
  const priceAvax = () => (M.grad ? M.R / M.T : curveP(M.S));
  const price = () => priceAvax() * avaxUsd;
  const circ = () => M.S - M.dead - (M.grad ? M.T : 0);
  const rezervAvax = () => (M.grad ? M.R : curveR(M.S));
  // usd dolarlık alım; dönüş: alınan token. hafta: mezuniyet haftasını kaydetmek için
  function buyUsd(usd, hafta = null) {
    let avax = usd / avaxUsd * (1 - EGRI.ALIM_UCRETI), got = 0;
    if (!M.grad) {
      const R0 = curveR(M.S), room = curveR(EGRI.GRAD) - R0;
      const use = Math.min(avax, room); const S1 = curveS(R0 + use); got += S1 - M.S; M.S = S1; avax -= use;
      if (M.S >= EGRI.GRAD - 1) { M.grad = true; M.R = curveR(EGRI.GRAD); M.T = EGRI.HAVUZ_TOKEN; M.S += EGRI.MEZUNIYET_BASIM; M.gradWeek = hafta; }
    }
    if (M.grad && avax > 0) { const out = M.T - M.R * M.T / (M.R + avax); M.R += avax; M.T -= out; got += out; }
    return got;
  }
  // q token satış; dönüş: alınan dolar
  function sellAda(q) {
    if (q <= 0) return 0;
    if (!M.grad) { const S1 = Math.max(M.dead + 1, M.S - q); const out = curveR(M.S) - curveR(S1); M.S = S1; return out * avaxUsd; }
    const out = M.R - M.R * M.T / (M.T + q); M.R -= out; M.T += q; return out * avaxUsd;
  }
  // Fiyatı en çok maxDrop düşürecek satış miktarı (server/economy.js withdrawCapTokens ile aynı kural)
  const wdCap = maxDrop => (M.grad ? M.T * (1 / Math.sqrt(1 - maxDrop) - 1) : M.S * (1 - Math.sqrt(1 - maxDrop)));
  // Elde tutulan tokenı ölü adrese gönder (arzda kalır, satılamaz)
  const burnTokens = q => { if (q > 0) M.dead += q; };
  return { M, avaxUsd, priceAvax, price, circ, rezervAvax, buyUsd, sellAda, wdCap, burnTokens };
}
