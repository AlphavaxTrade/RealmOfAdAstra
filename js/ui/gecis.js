// Realm of AdAstra — Sahne geçiş perdesi (21 Ekim 2026): sağdan ve soldan bulutlar gelip ekranı kapatır, ortada logo çıkar;
// perde kapalıyken yükleme yapılır, sonra bulutlar açılır. Bulutlar saf CSS: resim dosyası yok, yükleme maliyeti sıfır.
// "Hareketi azalt" ayarında (kökte .v3-azalt) bulut kayması yerine kısa solma kullanılır.
const KAPAMA_MS = 700;
const ACMA_MS = 750;
const EN_AZ_KAPALI_MS = 650;   // logo okunsun: perde kapandıktan sonra en az bu kadar durur (yükleme daha uzunsa o kadar)

let perde = null;

// Bulut kümesi: üst üste bindirilmiş yumuşak daireler. Konumlar sabit tohumlu (her açılışta aynı görünüm, test edilebilir).
function bulutKumesi(yon) {
  const kume = document.createElement('div');
  kume.className = `gp-kume gp-${yon}`;
  let t = yon === 'sol' ? 7 : 19;
  const rastgele = () => { t = (t * 9301 + 49297) % 233280; return t / 233280; };
  const adet = 15;
  for (let i = 0; i < adet; i++) {
    const p = document.createElement('i');
    p.className = 'gp-bulut';
    const boy = 34 + rastgele() * 30;   // vh cinsinden çap
    p.style.width = `${boy}vh`;
    p.style.height = `${boy * 0.78}vh`;
    p.style.top = `${(i / (adet - 1)) * 118 - 14 + (rastgele() - 0.5) * 8}%`;
    p.style.left = `${rastgele() * 70}%`;
    p.style.opacity = String(0.9 + rastgele() * 0.1);
    kume.appendChild(p);
  }
  return kume;
}

function kur() {
  if (perde || typeof document === 'undefined') return perde;
  const el = document.createElement('div');
  el.id = 'gecis-perdesi';
  el.setAttribute('aria-hidden', 'true');
  // Sıra (alttan üste): gökyüzü zemini, iki bulut kümesi, logo. Logo dosyası yoksa yazı logosu devreye girer.
  el.innerHTML = '<div class="gp-fon"></div><div class="gp-logo"><img src="assets/logo_realm.webp?v=20261021" alt="" width="520" height="197" onerror="this.replaceWith(Object.assign(document.createElement(\'b\'),{className:\'gp-logo-yazi\',textContent:\'REALM OF ADASTRA\'}))"><span class="gp-yukleniyor">Yükleniyor…</span></div>';
  const logo = el.querySelector('.gp-logo');
  el.insertBefore(bulutKumesi('sol'), logo);
  el.insertBefore(bulutKumesi('sag'), logo);
  document.body.appendChild(el);
  perde = el;
  return el;
}

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

let calisiyor = false;

// is: perde kapalıyken çalışacak (yükleme, sahne değiştirme) işlev. Dönüş: işin sonucu; hata olursa perde yine açılır ve hata yukarı atılır.
export async function gecisYap(is) {
  const el = kur();
  if (!el || calisiyor) return is();   // perde kurulamıyorsa (test ortamı) ya da zaten bir geçiş sürüyorsa doğrudan çalıştır
  calisiyor = true;
  const azalt = document.documentElement.classList.contains('v3-azalt');
  try {
    el.classList.toggle('gp-azalt', azalt);
    el.classList.add('gp-goster');
    void el.offsetWidth;   // başlangıç konumu işlensin ki geçiş animasyonu oynasın
    el.classList.add('gp-kapali');
    const baslangic = Date.now();
    await bekle(KAPAMA_MS);
    const sonuc = await is();
    const kalan = EN_AZ_KAPALI_MS - (Date.now() - baslangic - KAPAMA_MS);
    if (kalan > 0) await bekle(kalan);
    return sonuc;
  } finally {
    el.classList.remove('gp-kapali');
    await bekle(ACMA_MS);
    el.classList.remove('gp-goster');
    calisiyor = false;
  }
}
