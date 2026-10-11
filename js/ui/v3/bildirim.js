// Realm of AdAstra — v3 bildirim merkezi (üst çubuktaki zil): oyun içi olayların kısa listesi ve bot uyarısı.
// Liste kuralları saf ve testlerde doğrudan içe alınır; DOM kısmı (kurBildirimler) ince bir kabuktur.
// Bildirim metinleri başka oyuncuların adlarını içerebilir: ekrana yalnız kaçışlı yazılır.
import { esc } from './hub.js';

export const BILDIRIM_SINIRI = 50;
const GOSTERILEN = 10;

/** Listenin başına okunmamış bir bildirim ekler; en fazla BILDIRIM_SINIRI tutulur. */
export function bildirimEkle(liste, simge, metin, simdi = Date.now()) {
  liste.unshift({ id: `${simdi}-${liste.length}`, simge: simge || '🔔', metin: String(metin ?? ''), zaman: simdi, okunmadi: true });
  if (liste.length > BILDIRIM_SINIRI) liste.length = BILDIRIM_SINIRI;
  return liste;
}

export const okunmamisSayisi = (liste) => liste.filter((n) => n.okunmadi).length;

export function hepsiniOkunduYap(liste) {
  for (const n of liste) n.okunmadi = false;
}

const saatYazisi = (ms) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

/**
 * Panelin içeriği. botUyarisi: oyunun getBotResourceDeficitWarning() sonucu ({title, text}) ya da null;
 * her zaman en üstte ve kapatılamaz (sorun giderilince kendiliğinden kalkar).
 */
export function bildirimPaneliHtml(liste, botUyarisi = null) {
  const uyari = botUyarisi
    ? `<div class="v3-bildirim-oge is-uyari"><span aria-hidden="true">⚠️</span><div><b>${esc(botUyarisi.title)}</b><small>${esc(botUyarisi.text)}</small><i>Aktif uyarı</i></div></div>`
    : '';
  const oge = liste.slice(0, GOSTERILEN).map((n) => `<div class="v3-bildirim-oge${n.okunmadi ? ' is-yeni' : ''}"><span aria-hidden="true">${esc(n.simge)}</span><div><b>${esc(n.metin)}</b><i>${esc(saatYazisi(n.zaman))}</i></div></div>`).join('');
  const bos = !uyari && !oge ? '<div class="v3-bos">Yeni bildirim yok.</div>' : '';
  return `<div class="v3-bildirim-baslik"><b>🔔 Bildirimler</b><button type="button" class="v3-bildirim-temizle" data-bildirim-temizle>Temizle</button></div>
    <div class="v3-bildirim-liste">${uyari}${oge}${bos}</div>`;
}

/**
 * Bildirim merkezini kurar. degisti(): sayı değiştiğinde üst çubuğu yeniler.
 * Dönen: { ekle(simge, metin), sayi(), degistir(), kapat(), acikMi() }.
 */
export function kurBildirimler({ botUyarisi, degisti = () => {}, ilk = null }) {
  const liste = [];
  if (ilk) bildirimEkle(liste, ilk.simge, ilk.metin);
  let panel = null;
  let disTik = null;

  const kapat = () => {
    if (!panel) return;
    panel.remove();
    panel = null;
    if (disTik) { document.removeEventListener('click', disTik, true); disTik = null; }
  };

  const ciz = () => { if (panel) panel.innerHTML = bildirimPaneliHtml(liste, botUyarisi()); };

  const ac = () => {
    hepsiniOkunduYap(liste);
    degisti();
    panel = document.createElement('div');
    panel.id = 'v3-bildirim';
    panel.className = 'v3-bildirim';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Bildirimler');
    ciz();
    document.body.appendChild(panel);
    panel.addEventListener('click', (e) => {
      if (!e.target.closest('[data-bildirim-temizle]')) return;
      liste.length = 0;
      ciz();
      degisti();
    });
    // Panelin ve zilin dışına dokunmak paneli kapatır (zilin kendi tıklaması aç/kapa işini görür)
    disTik = (e) => { if (!e.target.closest('#v3-bildirim, #v3-zil')) kapat(); };
    document.addEventListener('click', disTik, true);
  };

  return {
    ekle(simge, metin) {
      bildirimEkle(liste, simge, metin);
      ciz();
      degisti();
    },
    sayi: () => okunmamisSayisi(liste),
    degistir() { if (panel) kapat(); else ac(); },
    kapat,
    acikMi: () => !!panel
  };
}
