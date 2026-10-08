// Realm of AdAstra — v3 panel düzenleyicileri: eski ekranları (henüz yeniden yazılmamış olanları) sade ve kısa gösterir.
// Kural kısmı saf (testlerde içe alınır); DOM kısmı yalnız tarayıcıda çalışır. Eski ekranın kodu ve olay dinleyicileri değişmez:
// kartlar silinip yeniden kurulmaz, bir <details> içine TAŞINIR; böylece kimliklere ve dinleyicilere bağlı her şey çalışmaya devam eder.

// Bağırarak yazılmış / teknik panel başlıkları → sade başlık. Sırayla ilk eşleşen kazanır.
const SADE_BASLIKLAR = [
  [/KRALLIK MERKEZİ/i, '🏰 Krallık merkezi'],
  [/SİLO\s*&\s*DEPO/i, '📦 Silo ve depo'],
  [/EKONOMİK DENGE/i, '📈 Ekonomi panosu'],
  [/KARAKTER GELİŞİMİ/i, '🧙 Karakterim'],
  [/KOTA VE SINIRLAR/i, '📊 Kotalarım'],
  [/Sirius Konseyi\s*&\s*Hazine/i, '🏛️ Konsey ve hazine'],
  [/SÜRÜM GEÇMİŞİ/i, '📜 Sürüm geçmişi'],
  [/GLADYATÖR KOLEZYUMU/i, '🏟️ Kolezyum'],
  [/KARNAVALI/i, '🎪 Karnaval'],
  [/NFT KOLEKSİYONU/i, '👑 Sandıklar ve koleksiyon'],
  [/SEN YOKKEN OLANLAR/i, '🌙 Sen yokken olanlar'],
  [/AMM Pazar|Meydan Pazarı|^📍?\s*🏪\s*Pazar/i, '🏪 Pazar']
];

// Başlık metnini (simge dahil, boşluklar sadeleşmiş) sade karşılığına çevirir; eşleşme yoksa baştaki 📍 işaretini atar.
export function sadeBaslik(metin) {
  const m = String(metin || '').replace(/\s+/g, ' ').trim();
  for (const [kural, sade] of SADE_BASLIKLAR) if (kural.test(m)) return sade;
  return m.replace(/^📍\s*/, '');
}

// Hangi panelde kartlar katlanır ve ilk kaçı açık kalır (başlığın SADE hâline göre).
const KATLA_KURALLARI = [
  { baslik: '🏰 Krallık merkezi', acik: 2 },
  { baslik: '🧙 Karakterim', acik: 1 },
  { baslik: '🏛️ Konsey ve hazine', acik: 0 },
  { baslik: '📈 Ekonomi panosu', acik: 1 },
  { baslik: '🚀 Uzay Limanı', acik: 1 }
];
export function katlaKurali(sadeBaslikMetni) {
  const k = KATLA_KURALLARI.find((x) => x.baslik === sadeBaslikMetni);
  return k ? { acik: k.acik } : null;
}

// ------------------------------------------------------------------ DOM kısmı
const KART = '.clean-card, .dashboard-widget';
const BASLIK = ':scope > .card-title-row, :scope > .card-title, :scope > .dashboard-widget-title';
const acikKalanlar = new Set();   // kullanıcı bir kartı açtıysa panel yenilense de açık kalır (anahtar: panel|kart)

// kok içindeki en üst düzey kartları (.clean-card, .dashboard-widget) (başka bir kartın içinde olmayanlar) katlanır bölümlere çevirir; ilk `acik` tanesi açık kalır.
export function katla(kok, acik, panelAnahtari) {
  const kartlar = [...kok.querySelectorAll(KART)].filter((k) => !k.parentElement.closest(KART) && !k.closest('details.v3-katli'));
  kartlar.forEach((kart, i) => {
    const baslikSatiri = kart.querySelector(BASLIK);
    if (!baslikSatiri) return;   // başlığı olmayan kart olduğu gibi kalır
    const ad = (baslikSatiri.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const anahtar = `${panelAnahtari}|${ad}`;
    const det = document.createElement('details');
    det.className = 'v3-katli';
    det.open = i < acik || acikKalanlar.has(anahtar);
    const ozet = document.createElement('summary');
    ozet.appendChild(baslikSatiri);   // taşır
    const icerik = document.createElement('div');
    icerik.className = 'v3-katli-icerik';
    while (kart.firstChild) icerik.appendChild(kart.firstChild);
    det.append(ozet, icerik);
    det.addEventListener('toggle', () => { det.open ? acikKalanlar.add(anahtar) : acikKalanlar.delete(anahtar); });
    kart.replaceWith(det);
  });
}

// Sürüm geçmişi: son `kalan` sürüm görünür, eskiler bir düğmeyle açılır.
export function eskiSurumleriGizle(kok, kalan = 3) {
  const kartlar = [...kok.querySelectorAll(':scope > div > .clean-card')];
  const surumler = kartlar.slice(1);   // ilki açıklama kartı
  if (surumler.length <= kalan || kok.querySelector('.v3-eski-dugme')) return;
  const eski = surumler.slice(kalan);
  eski.forEach((k) => { k.hidden = true; });
  const dugme = document.createElement('button');
  dugme.type = 'button';
  dugme.className = 'v3-eski-dugme';
  dugme.textContent = `Eski sürümleri göster (${eski.length})`;
  dugme.addEventListener('click', () => { eski.forEach((k) => { k.hidden = false; }); dugme.remove(); });
  eski[0].before(dugme);
}
