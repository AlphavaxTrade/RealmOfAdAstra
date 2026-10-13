// Realm of AdAstra — kısa süreli bildirim (toast): ekranın köşesinde 3,5 saniye görünür.
// Mesaj DÜZ YAZI olarak konur (HTML olarak değil): bildirimler başka oyuncuların adlarını içerebilir.

const SURE_MS = 3500;
const HATA_SURE_MS = 6000;   // hata mesajı okunabilsin
const SOLMA_MS = 250;

/** @param {Element|null} kap  #toast-container */
export function kurToast(kap) {
  return function toast(mesaj, tur = 'info') {
    if (!kap) return;
    const oge = document.createElement('div');
    oge.className = `toast ${['success', 'error', 'warning', 'info'].includes(tur) ? tur : 'info'}`;
    oge.setAttribute('role', tur === 'error' ? 'alert' : 'status');   // ekran okuyucu duyurur (denetim QA-05)
    const simge = document.createElement('span');
    simge.textContent = tur === 'error' ? '⚠️' : '✨';
    const metin = document.createElement('span');
    metin.textContent = String(mesaj ?? '');
    oge.append(simge, ' ', metin);
    kap.appendChild(oge);

    setTimeout(() => {
      oge.style.opacity = '0';
      oge.style.transform = 'translateY(10px)';
      oge.style.transition = `all ${SOLMA_MS}ms ease`;
      setTimeout(() => oge.remove(), SOLMA_MS);
    }, tur === 'error' ? HATA_SURE_MS : SURE_MS);
  };
}
