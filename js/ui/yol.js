// Realm of AdAstra — Krallık Yolu: görev paneli (görev ve bölüm ödülü, "Bana göster") ve haritadaki küçük rehber kutusu.
// Panelin HTML'i js/ui/v3/ogretici.js'te; burası oyunla bağlantıyı ve kutuyu kurar.
import { yolHtml, yolOzeti } from './v3/ogretici.js';
import { esc } from './v3/hub.js';

// "Bana göster" hedefinin bağlı olduğu özellik kilidi: kilitliyse görev satırında nedeni yazılır
const KILIT_ESLEMESI = { pazar: 'market', demirhane: 'blacksmith', kisla: 'barracks', zindan: 'dungeon', kolezyum: 'colosseum', karnaval: 'carnival', savasalani: 'battlefield' };

/**
 * Rehber kutusunun durumu (saf). kapatildi: oyuncu kutuyu kapattı mı.
 * @returns {{gizli: boolean, html: string, odulVar: boolean}}
 */
export function yolKutusu(ozet, kapatildi = false) {
  const bitti = ozet.toplam > 0 && !ozet.siradaki && ozet.hazir === 0;
  if (!ozet.toplam || (kapatildi && ozet.hazir === 0) || bitti) return { gizli: true, html: '', odulVar: false };
  const yuzde = Math.round((ozet.biten / ozet.toplam) * 100);
  const alt = ozet.hazir > 0 ? `${ozet.hazir} ödül hazır` : (ozet.siradaki ? ozet.siradaki.title : 'Tüm görevler tamam');
  const html = `
    <button class="guide-head" data-guide-open aria-label="Krallık Yolu'nu aç">
      <span class="guide-icon">🧭</span>
      <span class="guide-head-text">
        <span class="guide-title">Krallık Yolu</span>
        <span class="guide-sub">${esc(alt)}</span>
      </span>
      <span class="guide-count">${ozet.biten}/${ozet.toplam}</span>
    </button>
    <div class="guide-progress"><span style="width:${yuzde}%"></span></div>`;
  return { gizli: false, html, odulVar: ozet.hazir > 0 };
}

/**
 * Paneli ve kutuyu bağlar.
 * @param {object} o
 * @param {object} o.gs            oyun durumu yöneticisi
 * @param {(m: string, t: string) => void} o.bildir
 * @param {(baslik: string[], html: string) => void} o.panelYaz
 * @param {() => Element} o.panelKok         panel gövdesi (tıklamalar burada dinlenir)
 * @param {() => void} o.panelKapat
 * @param {(anahtar: string) => void} o.git  hub öğesi ya da 'bolge' (ilk hammadde bölgesi)
 * @param {() => void} o.hudYenile
 * @param {Element|null} o.kutu               #guide-widget
 */
export function kurYol({ gs, bildir, panelYaz, panelKok, panelKapat, git, hudYenile, kutu }) {
  const kilitNedeni = (q) => {
    const bolge = KILIT_ESLEMESI[q.show];
    const kilit = bolge && gs.getFeatureLock ? gs.getFeatureLock(bolge) : null;
    return kilit ? kilit.reason : null;
  };

  const kutuCiz = () => {
    if (!kutu) return;
    const durum = yolKutusu(yolOzeti(gs.getOnboardingSections()), !!gs.state.guideDismissed);
    kutu.hidden = durum.gizli;
    if (durum.gizli) return;
    if (kutu.dataset.lastHtml !== durum.html) {
      kutu.innerHTML = durum.html;
      kutu.dataset.lastHtml = durum.html;
    }
    kutu.classList.toggle('has-reward', durum.odulVar);
  };

  const panelAc = () => {
    gs.checkOnboardingProgress();
    panelYaz(['🧭', 'Krallık Yolu'], yolHtml(gs.getOnboardingSections(), kilitNedeni));
  };

  // Panel içindeki düğmeler (görev ödülü, bölüm ödülü, "Bana göster"); eski panel kodu tıklamaları durdurduğu için yakalama aşaması
  panelKok().addEventListener('click', (e) => {
    if (!e.target.closest('.v3-yol')) return;
    const gorev = e.target.closest('[data-claim-quest]');
    const bolum = e.target.closest('[data-claim-section]');
    const goster = e.target.closest('[data-ogretici-goster]');
    let sonuc;
    if (gorev) sonuc = gs.claimOnboardingReward(gorev.dataset.claimQuest);
    else if (bolum) sonuc = gs.claimOnboardingSection(bolum.dataset.claimSection);
    else if (goster) { panelKapat(); git(goster.dataset.ogreticiGoster); return; }
    else return;
    bildir(sonuc.message, sonuc.success ? 'success' : 'error');
    panelAc();
    kutuCiz();
    hudYenile();
  }, true);

  if (kutu) {
    kutu.addEventListener('click', (e) => {
      if (e.target.closest('[data-guide-dismiss]')) {
        gs.state.guideDismissed = true;
        gs.saveState();
        kutuCiz();
        return;
      }
      panelAc();
    });
  }

  gs.checkOnboardingProgress();
  kutuCiz();
  return { panelAc, kutuCiz };
}
