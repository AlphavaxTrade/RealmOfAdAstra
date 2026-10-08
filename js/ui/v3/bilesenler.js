// Realm of AdAstra — v3 ortak bileşenleri. Ekranlar bunları kullanır; her ekran kendi kalıbını yeniden icat etmez.
// Saf HTML üreticileri (istatSatiri, bosDurum, iskelet) DOM'a dokunmaz ve her metni kaçırır; onay() sayfaya bir pencere ekler.
import { esc } from './hub.js';

// Etiket solda, değer sağda tek satır. ton: '' | 'iyi' | 'uyari' | 'kotu'
export function istatSatiri(etiket, deger, { ipucu = '', ton = '' } = {}) {
  const t = ['iyi', 'uyari', 'kotu'].includes(ton) ? ` v3-ton-${ton}` : '';
  return `<div class="v3-istat${t}"${ipucu ? ` title="${esc(ipucu)}"` : ''}><span>${esc(etiket)}</span><b>${esc(deger)}</b></div>`;
}

// Gösterilecek bir şey olmadığında: ne olduğunu ve ne yapılacağını söyler (boş ekran bırakma).
export function bosDurum(simge, baslik, metin = '') {
  return `<div class="v3-bos-durum"><span aria-hidden="true">${esc(simge)}</span><b>${esc(baslik)}</b>${metin ? `<small>${esc(metin)}</small>` : ''}</div>`;
}

// Yüklenirken boş sıçrama yerine gri satırlar
export function iskelet(satir = 3) {
  return `<div class="v3-iskelet" aria-busy="true" aria-label="Yükleniyor">${'<i></i>'.repeat(Math.max(1, Math.min(8, satir | 0)))}</div>`;
}

// Geri alınamaz/pahalı eylemlerden önce sorar. Söz verir: true = onayladı, false = vazgeçti (Esc, dışarı dokunma, Vazgeç).
export function onay({ baslik, metin = '', tamam = 'Onayla', vazgec = 'Vazgeç', tehlikeli = false }) {
  return new Promise((coz) => {
    const onceki = document.activeElement;
    const kap = document.createElement('div');
    kap.className = 'v3-onay-kap';
    kap.innerHTML = `<div class="v3-onay" role="alertdialog" aria-modal="true" aria-labelledby="v3-onay-baslik">
      <b id="v3-onay-baslik">${esc(baslik)}</b>${metin ? `<p>${esc(metin)}</p>` : ''}
      <div class="v3-onay-dugmeler"><button type="button" data-v3-vazgec>${esc(vazgec)}</button>
      <button type="button" data-v3-tamam class="${tehlikeli ? 'v3-tehlikeli' : 'v3-birincil'}">${esc(tamam)}</button></div></div>`;
    const bitir = (sonuc) => {
      document.removeEventListener('keydown', tus, true);
      kap.remove();
      if (onceki && onceki.focus) onceki.focus();
      coz(sonuc);
    };
    const tus = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); bitir(false); }
      if (e.key === 'Tab') {   // odak pencerenin içinde kalır
        const d = [...kap.querySelectorAll('button')];
        const i = d.indexOf(document.activeElement);
        e.preventDefault();
        d[(i + (e.shiftKey ? d.length - 1 : 1)) % d.length].focus();
      }
    };
    kap.addEventListener('click', (e) => {
      if (e.target === kap || e.target.closest('[data-v3-vazgec]')) bitir(false);
      else if (e.target.closest('[data-v3-tamam]')) bitir(true);
    });
    document.addEventListener('keydown', tus, true);
    document.body.appendChild(kap);
    // tehlikeli eylemde odak güvenli seçenekte (Vazgeç) başlar
    kap.querySelector(tehlikeli ? '[data-v3-vazgec]' : '[data-v3-tamam]').focus();
  });
}
