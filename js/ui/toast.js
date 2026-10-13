// Realm of AdAstra — kısa süreli bildirim (toast): ekranın köşesinde 3,5 saniye görünür.
// Mesaj DÜZ YAZI olarak konur (HTML olarak değil): bildirimler başka oyuncuların adlarını içerebilir.

const SURE_MS = 3500;
const HATA_SURE_MS = 6000;   // hata mesajı okunabilsin
const SOLMA_MS = 250;
const EN_COK_GORUNEN = 3;   // telefonda yığın ekranı örtmesin: eskiler hemen kaldırılır

/**
 * Altta yapışık bir eylem çubuğu (ör. "Savaşa başla") varsa bildirimler onun ÜSTÜNE konur (denetim QA-15: telefonda düğmeyi örtüyordu).
 * Dönen değer toast kapsayıcısının ek alt boşluğudur (px); kapsayıcıda --toast-ek olarak CSS'e verilir.
 * mevcutAlt: kapsayıcının alt kenarının pencere altından şimdiki uzaklığı (px; alt çubuk gizliyse, ör. zindanda, bu da hesaba girer).
 * Saf: ölçüler dışarıdan verilir (testlerde doğrudan çağrılır).
 */
export function toastEkBosluk({ cubukUst, pencereYuksekligi, mevcutAlt = 0, aralik = 8 }) {
  if (!Number.isFinite(cubukUst) || !Number.isFinite(pencereYuksekligi)) return 0;
  const gerekenAlt = pencereYuksekligi - cubukUst + aralik;   // bildirimin alt kenarı çubuğun üst kenarının biraz üstünde olmalı
  return Math.max(0, Math.round(gerekenAlt - mevcutAlt));
}

/** @param {Element|null} kap  #toast-container */
export function kurToast(kap) {
  return function toast(mesaj, tur = 'info') {
    if (!kap) return;
    try {
      const cubuk = document.querySelector('#rpg-modal.active .ek-eylem-cubugu');
      const olcu = cubuk ? cubuk.getBoundingClientRect() : null;
      kap.style.setProperty('--toast-ek', '0px');   // taban konumu ölç (alt çubuk gizliyken de doğru)
      const mevcutAlt = window.innerHeight - kap.getBoundingClientRect().bottom;
      kap.style.setProperty('--toast-ek', olcu && olcu.height > 0 ? toastEkBosluk({ cubukUst: olcu.top, pencereYuksekligi: window.innerHeight, mevcutAlt }) + 'px' : '0px');
    } catch { /* ölçülemedi: varsayılan konum */ }
    const oge = document.createElement('div');
    oge.className = `toast ${['success', 'error', 'warning', 'info'].includes(tur) ? tur : 'info'}`;
    oge.setAttribute('role', tur === 'error' ? 'alert' : 'status');   // ekran okuyucu duyurur (denetim QA-05)
    const simge = document.createElement('span');
    simge.textContent = tur === 'error' ? '⚠️' : '✨';
    const metin = document.createElement('span');
    metin.textContent = String(mesaj ?? '');
    oge.append(simge, ' ', metin);
    kap.appendChild(oge);
    while (kap.children && kap.children.length > EN_COK_GORUNEN && kap.firstElementChild) kap.firstElementChild.remove();

    setTimeout(() => {
      oge.style.opacity = '0';
      oge.style.transform = 'translateY(10px)';
      oge.style.transition = `all ${SOLMA_MS}ms ease`;
      setTimeout(() => oge.remove(), SOLMA_MS);
    }, tur === 'error' ? HATA_SURE_MS : SURE_MS);
  };
}
