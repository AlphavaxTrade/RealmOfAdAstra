// Realm of AdAstra — Genesis Yolu saf kuralları (sunucu ve oyun ortak; hiçbir dünya modülünü içe aktarmaz).
// Not (15 Ekim 2026): sunucu bu dosyayı server/world/haftalik.js'ten doğrudan içe aktarır. js/gameState/genesis.js'i içe aktarmak
// globalPool'u, sunucu motoru depolamayı (localStorage taklidi) kurmadan önce yüklüyordu: dünya kaydı kaydedilmeden başlıyordu
// (altın kayıt testi yakaladı). Bu yüzden saf hesaplar burada durur.

// Genesis sahibinin trade uygulamasına beklenen aylık / yıllık maliyeti ve gerekli önden katkı (dolar).
// G = GAME_CONFIG.GENESIS_YOLU. Yıllık = 12 × (Uydu aylık × ödeyecek olma payı + Gözlemevi yıllık × indirim ÷ 12 × alacak olma payı).
export function genesisAyricalikMaliyeti(G = {}) {
  const A = G.AYRICALIK || {};
  const aylik = (Number(A.UYDU_AY_USD) || 0) * (Number(A.UYDU_ODEYECEKTI) || 0)
    + (Number(A.GOZLEMEVI_YIL_USD) || 0) * (Number(A.GOZLEMEVI_INDIRIM) || 0) / 12 * (Number(A.GOZLEMEVI_ALACAKTI) || 0);
  const yillik = aylik * 12;
  return { aylik, yillik, gerekli: yillik * (Number(G.KATKI_YIL) || 0) };
}

// Açık mühür sayısı: trade aylık geliri (dolar) × pay ÷ sahip başı aylık maliyet, sezon tavanına kadar. Fiyat yoksa null.
export function genesisAcikMuhur({ tradeAylikUsd, G = {} }) {
  const aylik = genesisAyricalikMaliyeti(G).aylik;
  if (!(Number(tradeAylikUsd) >= 0) || !(aylik > 0)) return null;
  return Math.min(Number(G.SEZON_TAVAN) || 100, Math.floor(Number(tradeAylikUsd) * (Number(G.ACIK_MUHUR_TRADE_PAYI) || 0) / aylik));
}
