// Realm of AdAstra — Üretim Hakkı: global haftalık havuzun oyunculara dağıtımı ve fiyat/bot girdili havuz ayarı (19 Ekim 2026 ekonomi planı).
// Saf hesap (kayıt, saat, rastgelelik yok): hem sunucu (saatlik dağıtım) hem tarayıcı (kendi payı) hem testler ve denge modeli kullanır.
//
// KURAL (kullanıcı kararı):
//  • Her oyuncunun KİŞİSEL haftalık limiti vardır (L): seviye, ev/köylü, katkı kademesi, aktiflik, Konsey Otoritesi ile büyür.
//  • Global haftalık havuz G (kaynak başına) oyuncu sayısına DEĞİL, fiyata ve bot ASTRA girişine bağlıdır.
//  • Havuzun TABAN_PAYI (%60) herkese eşit "azami pay" A olarak bölünür (kimse kişisel limitini aşamaz).
//  • Kalan pay (%40), A'nın ÜSTÜNDE limiti olanlara (L − A) x harcama puanı (S, katkı kademesi çarpanı) ile orantılı dağıtılır; yine kişisel limiti aşılamaz.
//  • Pay = min(L, A) + (L − A)+ x min(1, φ x S)

// Bir oyuncunun payı. A null/sonsuz ise havuz herkesin limitini karşılıyor demektir (pay = limit)
export function oyuncuPayi(L, S, dagitim) {
  const limit = Math.max(0, Number(L) || 0);
  if (!dagitim || dagitim.A == null || !isFinite(dagitim.A)) return limit;
  const A = Math.max(0, Number(dagitim.A) || 0);
  const ust = Math.max(0, limit - A);
  return Math.min(limit, A) + ust * Math.min(1, Math.max(0, Number(dagitim.phi) || 0) * Math.max(0, Number(S) || 0));
}

function ikiye(f, hedef, alt, ust, tur = 80) {
  // f artan; f(x) >= hedef olan en küçük x
  for (let i = 0; i < tur; i++) {
    const orta = (alt + ust) / 2;
    if (f(orta) >= hedef) ust = orta; else alt = orta;
  }
  return ust;
}

// oyuncular: [{ L, S }]; G: global haftalık havuz. Döndürür: { A (null = sınırsız), phi, total (dağıtılan toplam), bos (dağıtılamayan havuz) }
export function havuzDagit(oyuncular, G, tabanPayi = 0.6) {
  const liste = (oyuncular || []).map(o => ({ L: Math.max(0, Number(o.L) || 0), S: Math.max(0, Number(o.S) || 0) })).filter(o => o.L > 0);
  const havuz = Math.max(0, Number(G) || 0);
  const toplamL = liste.reduce((t, o) => t + o.L, 0);
  if (!liste.length || !(havuz > 0)) return { A: 0, phi: 0, total: 0, bos: havuz, n: liste.length };
  if (toplamL <= havuz) return { A: null, phi: 1, total: toplamL, bos: havuz - toplamL, n: liste.length };

  // 1) Taban: Σ min(L, A) = tabanPayi x G (tabanda herkes eşit A alır; limiti küçük olan limitini alır)
  const enBuyuk = Math.max(...liste.map(o => o.L));
  const hedefTaban = Math.min(Math.max(0, tabanPayi) * havuz, toplamL);
  const tabanToplami = (A) => liste.reduce((t, o) => t + Math.min(o.L, A), 0);
  const A = ikiye(tabanToplami, hedefTaban, 0, enBuyuk);

  // 2) Fazla: Σ (L − A)+ x min(1, φ x S) = havuz − tabanın dağıttığı
  const kalan = Math.max(0, havuz - tabanToplami(A));
  const ustToplami = (phi) => liste.reduce((t, o) => t + Math.max(0, o.L - A) * Math.min(1, phi * o.S), 0);
  const phi = kalan <= 0 ? 0 : (ustToplami(1e6) <= kalan ? 1e6 : ikiye(ustToplami, kalan, 0, 1e6));
  const toplam = liste.reduce((t, o) => t + oyuncuPayi(o.L, o.S, { A, phi }), 0);
  return { A, phi, total: toplam, bos: Math.max(0, havuz - toplam), n: liste.length };
}

// ── Havuz çarpanı (qpp) ayarı: fiyat tepkisi + bot ASTRA girişi ──
// oran: kaynağın pazar fiyatı / açılış fiyatı. Hedef bant [ALT, UST]: bandın içinde havuz sabit; fiyat bandın altına düşerse ARZ kısılır (talep artsın,
// fiyat yükselsin), bandın üstüne çıkarsa ARZ açılır (fiyat geri insin). Değişim yumuşaktır (karekök) ve haftada en çok [kisma, aciliş] ile sınırlıdır.
export function fiyatCarpani(oran, B = {}) {
  const alt = B.BAND_ALT ?? 0.8, ust = B.BAND_UST ?? 1.5, enAz = B.HAFTALIK_KISMA ?? 0.75, enCok = B.HAFTALIK_ARTIS ?? 1.25;
  const r = Number(oran);
  if (!isFinite(r) || r <= 0) return 1;
  if (r < alt) return Math.max(enAz, Math.sqrt(r / alt));
  if (r > ust) return Math.min(enCok, Math.sqrt(r / ust));
  return 1;
}

// Bot (trade) projesinden oyuna gelen ASTRA: son haftanın girişi, önceki haftaların ortalamasına oranla. Düzenden fazla ASTRA gelince talep artar → havuz önceden büyür.
// seri: haftalık giriş serisi (en yenisi sonda). Veri yoksa ya da referans 0 ise 1 (etkisiz). Çarpan [0,85; 1,30] ile sınırlıdır.
export function botCarpani(seri, B = {}) {
  const s = (Array.isArray(seri) ? seri : []).map(v => Number(v) || 0);
  if (s.length < 2) return 1;
  const son = s[s.length - 1];
  const onceki = s.slice(0, -1);
  const ref = onceki.reduce((t, v) => t + v, 0) / onceki.length;
  if (!(ref > 0)) return 1;
  const beta = B.BOT_DUYARLILIK ?? 0.25;
  return Math.max(B.BOT_ENAZ ?? 0.85, Math.min(B.BOT_ENCOK ?? 1.3, 1 + beta * (son / ref - 1)));
}

// Yeni haftanın havuz çarpanı: mevcut x fiyat tepkisi x bot girişi, [QPP_MIN, QPP_MAX] içinde
export function yeniHavuzCarpani(mevcut, oran, botOrani, U = {}) {
  const B = U.AYAR || {};
  const x = Number(mevcut) * fiyatCarpani(oran, B) * (isFinite(botOrani) && botOrani > 0 ? botOrani : 1);
  return Math.max(U.QPP_MIN ?? 0.08, Math.min(U.QPP_MAX ?? 1.2, Math.round(x * 1000) / 1000));
}
