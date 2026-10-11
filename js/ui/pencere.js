// Realm of AdAstra — tek panel (#rpg-modal): başlık ve gövde yazma, açma-kapama ve arkadaki haritaya dokunuş sızmasını durdurma.
// 11 Ekim 2026'da baştan yazıldı. Yeni ekranlar (js/ui/ekran/*) ve v3 kabuğu paneli yalnız bu işlevlerle açar.
import { esc } from './v3/hub.js';

const DOKUNUSLAR = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'];

/**
 * @param {{kok: Element, baslik: Element, govde: Element, kapatDugme: Element|null}} el  #rpg-modal, #modal-title, #modal-body, #btn-close-modal
 * @returns {{yaz: Function, ac: Function, kapat: Function, acikMi: Function, govde: Element}}
 */
export function kurPencere({ kok, baslik, govde, kapatDugme }) {
  let sonBaslik = '';
  const acikMi = () => kok.classList.contains('active');

  // Başlık yeni bir ekranın başlığıysa ya da panel kapalıyken açılıyorsa kaydırma en üste döner; aynı ekran yenileniyorsa konum korunur
  const ac = () => {
    const yazi = baslik.textContent;
    const yeniEkran = !acikMi() || yazi !== sonBaslik;
    sonBaslik = yazi;
    kok.classList.add('active');
    document.body.classList.add('modal-open');
    if (yeniEkran) govde.scrollTop = 0;
  };

  const kapat = () => {
    kok.classList.remove('active');
    document.body.classList.remove('modal-open');
  };

  /** [simge, ad] başlığı ve hazır HTML gövdesini yazar, paneli açar. Başlık metni kaçırılır. */
  const yaz = ([simge, ad], html) => {
    baslik.innerHTML = `<span>${esc(simge)}</span> <span>${esc(ad)}</span>`;
    govde.innerHTML = html;
    ac();
  };

  if (kapatDugme) kapatDugme.addEventListener('click', kapat);
  kok.addEventListener('click', (e) => { if (e.target === kok) kapat(); });
  // Panelin içindeki ve panelin dışındaki karartmaya yapılan dokunuş arkadaki haritaya ya da belge dinleyicilerine ulaşmaz
  for (const olay of DOKUNUSLAR) {
    kok.addEventListener(olay, (e) => {
      if (e.target === kok || e.target.closest('.rpg-modal-window')) e.stopPropagation();
    });
  }

  return { yaz, ac, kapat, acikMi, govde };
}
