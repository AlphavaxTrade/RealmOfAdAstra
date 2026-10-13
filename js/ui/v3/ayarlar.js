// Realm of AdAstra — v3 ayarlar: hareketi azalt, yazı boyutu, klavye kısayolları listesi, bağlantı durumu.
// Ayarlar tarayıcı deposunda (oyun kaydında değil) tutulur; yeni oyun/hesap açmak onları sıfırlamaz. (Oyunun sesi tasarım gereği tamamen kapalı: ses ayarı yok.)
import { esc } from './hub.js';

export const AYAR_ANAHTARI = 'roa_v3_ayar';
export const YAZI_BOYUTLARI = [
  { id: 'normal', ad: 'Normal', olcek: 1 },
  { id: 'buyuk', ad: 'Büyük', olcek: 1.125 },
  { id: 'cokbuyuk', ad: 'Çok büyük', olcek: 1.25 }
];
export const AYAR_VARSAYILAN = { hareketAzalt: false, yaziBoyutu: 'normal' };

// Depodan okunan değer bozuk/eski olabilir: bilinmeyeni varsayılana çevirir
export function ayarDogrula(ham) {
  const a = ham && typeof ham === 'object' ? ham : {};
  return {
    hareketAzalt: a.hareketAzalt === true,
    yaziBoyutu: YAZI_BOYUTLARI.some((y) => y.id === a.yaziBoyutu) ? a.yaziBoyutu : AYAR_VARSAYILAN.yaziBoyutu
  };
}
export function ayarOku(depo) {
  try { return ayarDogrula(JSON.parse(depo.getItem(AYAR_ANAHTARI) || 'null')); } catch { return { ...AYAR_VARSAYILAN }; }
}
export function ayarYaz(depo, ayar) {
  try { depo.setItem(AYAR_ANAHTARI, JSON.stringify(ayarDogrula(ayar))); return true; } catch { return false; }
}
export const yaziOlcegi = (id) => (YAZI_BOYUTLARI.find((y) => y.id === id) || YAZI_BOYUTLARI[0]).olcek;

// Ayarı sayfaya uygular (kok = <html>): class ve CSS değişkeni
export function ayarUygula(ayar, kok) {
  kok.classList.toggle('v3-azalt', !!ayar.hareketAzalt);
  const olcek = yaziOlcegi(ayar.yaziBoyutu);
  kok.style.setProperty('--v3-yazi-olcek', String(olcek));
  // Sabit yükseklikli üst çubuk ve sekme çubuğu en çok %15 büyür (taşmasın); gövde metinleri tam ölçekle büyür (denetim QA-01)
  kok.style.setProperty('--v3-yazi-olcek-bar', String(Math.min(olcek, 1.15)));
}

export const KISAYOLLAR = [
  ['Ctrl + K', 'Her yere yazarak git'],
  ['Tab', 'Krallık merkezi'],
  ['Esc', 'Açık paneli kapat'],
  ['1 · 2 · 3', 'Orman · Maden · Tarla'],
  ['4 · B', 'Kışla'],
  ['5 · M', 'Pazar'],
  ['6 · D', 'Zindan'],
  ['7 · C', 'Kolezyum'],
  ['E', 'Karakterim ve envanter'],
  ['K', 'Kotalarım'],
  ['T', 'Test laboratuvarı (yalnız deneme sürümünde)']
];

// Bağlantı durumu: tek kişilik yerel modda hep 'yerel'; çevrimiçide son başarılı eşitlemeden geçen süreye göre
// (oyun sunucuyla 20 sn'de bir eşitlenir): 45 sn'ye kadar iyi, 45-120 sn gecikmeli, sonrası kopuk.
export function baglantiDurumu(cevrimici, yasMs) {
  if (!cevrimici) return 'yerel';
  if (!(yasMs >= 0) || yasMs < 45000) return 'iyi';
  return yasMs < 120000 ? 'gecikmeli' : 'kopuk';
}
export const BAGLANTI_METNI = {
  gecikmeli: 'Sunucuyla bağlantı yavaş; yaptıkların gecikmeyle kaydolabilir.',
  kopuk: 'Sunucuyla bağlantı koptu. Yaptıkların kaydolmayabilir; internetini kontrol et, sayfayı yenileme.'
};

export function ayarlarHtml(ayar, cevrimici) {
  const dugme = (grup, id, ad, secili) => `<button type="button" class="v3-chip ${secili ? 'active' : ''}" data-v3-ayar="${grup}:${id}" aria-pressed="${secili}">${esc(ad)}</button>`;
  return `<div class="v3-ayarlar">
    <section><h3>Yazı boyutu</h3><div class="v3-chipler">${YAZI_BOYUTLARI.map((y) => dugme('yazi', y.id, y.ad, ayar.yaziBoyutu === y.id)).join('')}</div>
      <small class="v3-lab-not">Yazılar büyür; bazı eski ekranlarda yalnız metinler büyür.</small></section>
    <section><h3>Hareket</h3><div class="v3-chipler">${dugme('hareket', 'ac', 'Hareketi azalt', ayar.hareketAzalt)}${dugme('hareket', 'kapat', 'Normal', !ayar.hareketAzalt)}</div>
      <small class="v3-lab-not">Kayan geçişleri ve canlandırmaları kapatır. Cihazın "hareketi azalt" ayarı açıksa zaten uygulanır.</small></section>
    <section><h3>Klavye kısayolları</h3><div class="v3-kisayol">${KISAYOLLAR.map(([k, a]) => `<div><kbd>${esc(k)}</kbd><span>${esc(a)}</span></div>`).join('')}</div></section>
    <section><h3>Bu arayüz</h3><p class="v3-lab-not">${cevrimici ? 'Çevrimiçi mod açık: kaydın sunucuda tutuluyor.' : 'Tek kişilik yerel moddasın: kaydın bu tarayıcıda.'}</p></section>
  </div>`;
}
