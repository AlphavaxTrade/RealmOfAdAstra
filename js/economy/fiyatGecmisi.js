// Realm of AdAstra — Pazar fiyat geçmişi (19 Ekim 2026): her varlığın fiyatı zaman damgasıyla tutulur, pazar ekranı coin grafiği gibi çizer.
// Saf işlevler (saat ve depolama dışarıdan gelir): hem tarayıcıdaki tek oyunculu pazar hem sunucudaki ortak pazar aynı kodu kullanır.
//
//  • Seri: her varlık için [[zamanMs, fiyat], ...] (eskiden yeniye).
//  • Yeni nokta: son noktadan en az MIN_ARALIK_MS geçtiyse ya da fiyat son noktadan %BUYUK_DEGISIM kadar oynadıysa eklenir;
//    aksi halde (ilk nokta hariç) son noktanın değeri güncel fiyata çekilir (seri şişmez, grafiğin sonu hep güncel fiyatı gösterir).
//  • Yaşlanma: HAM_SURE_MS'den eski noktalar saatte bire (saatin son değeri) indirilir; EN_FAZLA_MS'den eskiler silinir.
//  • Fiyat değişmediyse nokta eklenmez (sessiz varlık grafiği düz bir çizgi olur).

export const GECMIS = {
  MIN_ARALIK_MS: 5 * 60 * 1000,
  BUYUK_DEGISIM: 0.01,
  HAM_SURE_MS: 48 * 3600 * 1000,
  SAAT_MS: 3600 * 1000,
  EN_FAZLA_MS: 30 * 86400 * 1000,
  KIRP_ESIGI: 800,        // seri bu kadar noktayı geçince yaşlandırma çalışır
  EN_FAZLA_NOKTA: 240     // ekrana giden seri en çok bu kadar nokta (kovalara indirilir)
};

// Aralık adları: ekrandaki düğmeler ve API bunları kullanır
export const ARALIKLAR = { '24s': 24 * 3600 * 1000, '7g': 7 * 86400 * 1000, '30g': 30 * 86400 * 1000 };
export const aralikMs = ad => ARALIKLAR[ad] || ARALIKLAR['24s'];

const gecerli = n => Number.isFinite(n) && n >= 0;

// Seriyi temiz tutar: bozuk girdiyi atar, sıralar
export function temizle(seri) {
  if (!Array.isArray(seri)) return [];
  return seri.filter(p => Array.isArray(p) && gecerli(p[0]) && gecerli(p[1])).map(p => [Number(p[0]), Number(p[1])]).sort((a, b) => a[0] - b[0]);
}

// Eski noktaları saatlik kovaya indirir, çok eskileri siler
export function kirp(seri, simdi) {
  const alt = simdi - GECMIS.EN_FAZLA_MS;
  const hamAlt = simdi - GECMIS.HAM_SURE_MS;
  const cikti = [];
  let sonKova = null;
  for (const [t, p] of seri) {
    if (t < alt) continue;
    if (t >= hamAlt) { cikti.push([t, p]); continue; }
    const kova = Math.floor(t / GECMIS.SAAT_MS);
    if (kova === sonKova) cikti[cikti.length - 1] = [t, p];   // aynı saatin son değeri kalır
    else { cikti.push([t, p]); sonKova = kova; }
  }
  return cikti;
}

// Bir varlığın güncel fiyatını seriye işler. Seriyi yerinde değiştirir ve döndürür.
export function kaydet(seri, fiyat, simdi) {
  if (!gecerli(fiyat) || fiyat <= 0) return seri;
  const son = seri[seri.length - 1];
  if (!son) { seri.push([simdi, fiyat]); return seri; }
  if (son[1] === fiyat) return seri;
  const buyuk = son[1] > 0 && Math.abs(fiyat - son[1]) / son[1] >= GECMIS.BUYUK_DEGISIM;
  if (seri.length === 1 || simdi - son[0] >= GECMIS.MIN_ARALIK_MS || buyuk) seri.push([simdi, fiyat]);   // ilk nokta (açılış fiyatı) hiç ezilmez
  else seri[seri.length - 1] = [son[0], fiyat];
  if (seri.length > GECMIS.KIRP_ESIGI) {
    const yeni = kirp(seri, simdi);
    seri.length = 0;
    seri.push(...yeni);
  }
  return seri;
}

// Grafik için seri: aralığa düşen noktalar + aralık başındaki değer (öncesi varsa) + güncel fiyat; en çok EN_FAZLA_NOKTA'ya indirilir.
export function aralikSerisi(seri, simdi, ms, guncelFiyat) {
  const bas = simdi - ms;
  let oncesi = null;
  const ic = [];
  for (const [t, p] of seri) {
    if (t < bas) oncesi = p;
    else ic.push([t, p]);
  }
  const noktalar = [];
  if (oncesi != null) noktalar.push([bas, oncesi]);   // aralık başında geçerli olan fiyat: grafik soldan başlar
  noktalar.push(...ic);
  if (gecerli(guncelFiyat) && guncelFiyat > 0) {
    const son = noktalar[noktalar.length - 1];
    if (!son) noktalar.push([simdi, guncelFiyat]);
    else if (son[1] !== guncelFiyat || son[0] < simdi) noktalar.push([simdi, guncelFiyat]);
  }
  return inceltme(noktalar, GECMIS.EN_FAZLA_NOKTA);
}

// Çok noktayı eşit zaman kovalarına böler; her kovanın son değeri kalır (ilk ve son nokta korunur)
export function inceltme(noktalar, enFazla) {
  if (noktalar.length <= enFazla) return noktalar;
  const ilk = noktalar[0][0], son = noktalar[noktalar.length - 1][0];
  const kovaMs = Math.max(1, (son - ilk) / (enFazla - 1));
  const cikti = [noktalar[0]];   // ilk nokta kendi başına kalır (grafik gerçek başlangıçtan çizilir)
  let sonKova = 0;
  for (let i = 1; i < noktalar.length; i++) {
    const n = noktalar[i];
    const k = Math.max(1, Math.floor((n[0] - ilk) / kovaMs));
    if (k === sonKova) cikti[cikti.length - 1] = n;
    else { cikti.push(n); sonKova = k; }
  }
  return cikti;
}

// Üst bilgi: açılış, kapanış, en yüksek, en düşük, değişim yüzdesi
export function ozet(noktalar) {
  if (!noktalar.length) return { acilis: 0, kapanis: 0, enYuksek: 0, enDusuk: 0, degisimYuzde: 0 };
  const fiyatlar = noktalar.map(n => n[1]);
  const acilis = fiyatlar[0], kapanis = fiyatlar[fiyatlar.length - 1];
  return {
    acilis,
    kapanis,
    enYuksek: Math.max(...fiyatlar),
    enDusuk: Math.min(...fiyatlar),
    degisimYuzde: acilis > 0 ? ((kapanis - acilis) / acilis) * 100 : 0
  };
}
