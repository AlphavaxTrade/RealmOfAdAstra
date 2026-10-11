// Realm of AdAstra — Kapı şeridi: vadide yer yoksa bekleme sırası, askıya alınan hesap ve izin (katılım) soruları.
// Şeridin metni saf bir işlevle üretilir (testlerde doğrudan içe alınır); DOM kısmı yalnız tıklamaları oyuna bağlar.
import { esc } from './v3/hub.js';

const SAAT_MS = 3600 * 1000;
const GUN_MS = 24 * SAAT_MS;

// Sırada beklerken onaylanacak üç basit adım (misafir modu; oyun işlemi değil)
export const ADAY_ETIKETLERI = {
  rehber: '📖 Nasıl oynanır rehberini okudum',
  kurallar: '📜 Vadi kurallarını okudum',
  hazirim: '✅ Hazırım, yerim açılsın'
};

/**
 * @param {{kapi: object|null, katilim: object|null, hazirAday: object, gorevIdleri: string[], simdi?: number}} girdi
 *   kapi: online.gate ({status, position, citizens, limit, davet}); katilim: oyuncunun katılım kaydı
 * @returns {string} şeridin HTML'i; gösterilecek bir şey yoksa ''
 */
export function kapiSeridiHtml({ kapi, katilim, hazirAday = {}, gorevIdleri = [], simdi = Date.now() }) {
  const satirlar = [];

  // İzin sorusu: katılımı düşük kalan vatandaşa sorulur
  const soru = katilim && katilim.izinSorusu;
  if (soru && simdi < Number(soru.sonTarih)) {
    const saat = Math.max(0, Math.round((Number(soru.sonTarih) - simdi) / SAAT_MS));
    satirlar.push(`<div class="gate-banner-row">🏖️ <strong>Katılımın düşük; izin hakkını kullanmak ister misin?</strong> ${saat} saat içinde cevap ver, yoksa yerin bekleyen bir vatandaşa geçer (izinde yer kaybı yok; cevapsız kalırsan dönüşte sıranın önüne alınırsın). <button type="button" class="btn-clean" data-kapi="izin-evet">✅ Evet, izin kullan</button> <button type="button" class="btn-clean" data-kapi="izin-hayir">Hayır</button></div>`);
  }

  // İzindeyken: yer korunur, ekonomiden pay alınmaz
  const izin = katilim && katilim.izinModu;
  if (izin && simdi < Number(izin.bitis)) {
    const gun = Math.max(0, Math.ceil((Number(izin.bitis) - simdi) / GUN_MS));
    satirlar.push(`<div class="gate-banner-row">🏖️ <strong>İzindesin</strong> — ${gun} gün kaldı. Yerin korunuyor; bu sürede Üretim Hakkı, temel gelir ve ücretsiz oyuncu payı almazsın. <button type="button" class="btn-clean" data-kapi="izin-bitir">İzni şimdi bitir</button></div>`);
  }

  const durum = kapi && kapi.status;
  if (durum === 'waiting') {
    const gorevler = gorevIdleri.map((id) => `<button type="button" class="btn-clean" data-kapi-gorev="${esc(id)}" ${hazirAday[id] ? 'disabled' : ''}>${hazirAday[id] ? '✅' : '☐'} ${esc(ADAY_ETIKETLERI[id] || id)}</button>`).join(' ');
    const davet = kapi.davet
      ? ' 📨 <strong>Yerin açıldı! Herhangi bir hareket yaparsan (bir görevi onaylaman da yeter) vatandaş olursun.</strong>'
      : ' Aşağıdaki adımları onaylarsan yer açılınca önce sana gelir.';
    satirlar.push(`<div class="gate-banner-row"><span class="gate-banner-icon">🚪</span><span>⏳ <strong>Bekleme sırasındasın: ${esc(kapi.position || '?')}. sıra.</strong> Vadide şu an ${esc(kapi.citizens)}/${esc(kapi.limit)} vatandaş var. Gezebilir, her yere bakabilirsin; işlem yapmak için yerinin açılmasını bekle.${davet}</span></div><div class="gate-banner-row">${gorevler}</div>`);
  } else if (durum && durum !== 'citizen' && durum !== 'new') {
    satirlar.push('<div class="gate-banner-row"><span class="gate-banner-icon">🚪</span><span>⏸️ <strong>Yerin askıda.</strong> Katılımın düşük kaldığı için yerin bekleyen bir vatandaşa verildi. Hesabın ve her şeyin duruyor; giriş yaptığında yeniden sıraya girersin.</span></div>');
  }

  return satirlar.join('');
}

/**
 * Şeridi kurar. kaynaklar(): { kapi, katilim, hazirAday, gorevIdleri } (her çizimde taze okunur).
 * Dönen { ciz }: oyun döngüsü ve çevrimiçi eşitleme sonrası çağrılır.
 */
export function kurKapiSeridi({ el, kaynaklar, eylemler }) {
  let son = null;
  const ciz = () => {
    const html = kapiSeridiHtml(kaynaklar());
    if (html === son) return;   // saniyede bir çağrılır; içerik aynıysa düğmeler yerinde kalır
    son = html;
    el.hidden = html === '';
    el.innerHTML = html;
  };
  el.addEventListener('click', (e) => {
    const gorev = e.target.closest('[data-kapi-gorev]');
    if (gorev && !gorev.disabled) { eylemler.gorev(gorev.dataset.kapiGorev); ciz(); return; }
    const dugme = e.target.closest('[data-kapi]');
    if (!dugme) return;
    const ad = dugme.dataset.kapi;
    if (ad === 'izin-evet') eylemler.izinCevapla(true);
    else if (ad === 'izin-hayir') eylemler.izinCevapla(false);
    else if (ad === 'izin-bitir') eylemler.izinBitir();
    ciz();
  });
  return { ciz };
}
