// Realm of AdAstra — v3 yeni oyuncu turu: ilk girişte, gerçek düğmeleri parlatıp oyuncuya ilk seferini yaptıran kısa tur.
// Eski rehberi (js/gameState/rehber.js: görevler ve ödüller) DEĞİŞTİRMEZ; onun üstüne "elini tutan" bir katman ekler.
// Üst kısım saf (testlerde içe alınır): adımlar, ne zaman başlayacağı, ne zaman ilerleyeceği. Alt kısım tarayıcıda çizer.
// İlerleme tarayıcı deposunda (oyun kaydında değil): bir arayüz tercihi; çevrimiçi kayıt ve sunucu eylem listesi etkilenmez.

// Her adım: hedef (parlatılacak düğmenin seçicisi; yoksa ortada kart), baslik/metin, dugme (varsa "Devam" düğmesi; yoksa oyuncunun gerçek eylemi beklenir),
// tamam(durum) (eylem adımı: true dönünce kendiliğinden ilerler), ona (adıma girerken yapılacak iş).
// durum: { sekme, panelAcik, baslik, seferSayisi } — tarayıcı kısmı her 400 ms'de hesaplar.
export const TUR_ADIMLARI = [
  { id: 'hos', baslik: 'Realm of AdAstra\'ya hoş geldin', metin: 'Birkaç dokunuşta oyunu öğreneceksin. İstediğin an "Atla" diyebilirsin; turu sonra Ben sekmesinden yeniden açabilirsin.', dugme: 'Başlayalım' },
  { id: 'harita', hedef: '[data-v3-sekme="harita"]', baslik: 'Harita', metin: 'Krallığın burada. Haritadaki binalara dokunarak içlerine girersin.', dugme: 'Devam' },
  { id: 'kaynak', hedef: '#v3-kaynak-dugme', baslik: 'Hammaddelerin', metin: 'Odun, taş, buğday gibi hammaddelerin ve silonun ne kadar dolu olduğu burada.', dugme: 'Devam' },
  { id: 'kralik', hedef: '[data-v3-sekme="kralik"]', baslik: 'Krallık', metin: 'Şimdi Krallık sekmesine dokun.', tamam: (d) => d.sekme === 'kralik' && d.panelAcik },
  { id: 'merkez', hedef: '[data-v3-git="merkez"]', baslik: 'Krallık merkezi', metin: '"Krallık merkezi"ne dokun: işçilerini buradan yönetirsin.', tamam: (d) => /Krallık merkezi/i.test(d.baslik) },
  { id: 'sefer', hedef: '[data-e="topla"]', baslik: 'İlk seferin', metin: 'Bu düğme boştaki işçilerini sefere gönderir. Dokun!', tamam: (d) => d.seferSayisi > 0 },
  { id: 'bekle', ona: 'paneliKapat', baslik: 'İşçilerin yolda', metin: 'Süre dolunca ürünleri toplarsın. Ekranın altındaki "Şimdi" kartı sana haber verir.', dugme: 'Anladım' },
  { id: 'ben', hedef: '[data-v3-sekme="ben"]', baslik: 'Takılırsan', metin: 'Ben sekmesinde "Rehber ve yardım" var. Yazıların yanındaki ? işaretine dokunursan o kelimenin açıklaması çıkar.', dugme: 'Devam' },
  { id: 'bitis', baslik: 'Hazırsın!', metin: 'Sol alttaki Krallık Rehberi sıradaki görevleri ve ödüllerini gösterir. Kolay gelsin!', dugme: 'Oyuna başla' }
];

// Tur kendiliğinden ne zaman başlar? Kayıt: { adim, bitti, atlandi } ya da yok. İlerlemiş (seviye 2+, askeri olan, ilk seferi yapmış) hesaba asla zorlanmaz.
export function turBaslamali({ seviye, askerSayisi, ilkSeferYapildi, kayit }) {
  if (kayit && (kayit.bitti || kayit.atlandi)) return false;
  if (kayit && Number.isInteger(kayit.adim) && kayit.adim > 0 && kayit.adim < TUR_ADIMLARI.length) return true;   // yarım kalan tura devam
  return seviye <= 1 && askerSayisi === 0 && !ilkSeferYapildi;
}

// Eylem adımında koşul sağlandıysa bir sonraki adımın indeksi, yoksa aynı indeks.
export function sonrakiAdim(adim, durum) {
  const a = TUR_ADIMLARI[adim];
  if (!a) return adim;
  return a.tamam && a.tamam(durum) ? adim + 1 : adim;
}

export const TUR_KAYIT_ANAHTARI = (hesap) => `roa_v3_tur_${hesap || 'yerel'}`;

// ------------------------------------------------------------------ tarayıcı kısmı
export function kurTur(api) {
  const anahtar = () => TUR_KAYIT_ANAHTARI(api.hesapAnahtari());
  const oku = () => { try { return JSON.parse(localStorage.getItem(anahtar()) || 'null'); } catch { return null; } };
  const yaz = (v) => { try { localStorage.setItem(anahtar(), JSON.stringify(v)); } catch { /* özel pencere: ilerleme bu oturumda kalır */ } };

  let adim = -1;
  let zamanlayici = null;
  let hedefGorulmedi = 0;
  const kat = document.createElement('div');
  kat.id = 'v3-tur';
  kat.hidden = true;
  kat.innerHTML = `<div id="v3-tur-perde"></div><div id="v3-tur-isik"></div>
    <section id="v3-tur-kart" role="dialog" aria-live="polite" aria-labelledby="v3-tur-baslik">
      <div class="v3-tur-ust"><span id="v3-tur-say"></span><button type="button" id="v3-tur-atla">Atla</button></div>
      <b id="v3-tur-baslik"></b><p id="v3-tur-metin"></p>
      <div class="v3-tur-alt"><button type="button" id="v3-tur-gec" hidden>Bu adımı geç</button><button type="button" id="v3-tur-devam" class="v3-birincil"></button></div>
    </section>`;
  document.body.appendChild(kat);
  const $ = (id) => kat.querySelector(`#${id}`);

  const durumHesapla = () => {
    const gs = api.gameState;
    const sekme = document.querySelector('#v3-tabbar button.active')?.dataset.v3Sekme;
    return {
      sekme,
      panelAcik: api.isAnyModalOpen(),
      baslik: (document.getElementById('modal-title')?.innerText || '').replace(/\s+/g, ' ').trim(),
      seferSayisi: Object.keys(gs.state.activeExpeditions || {}).length
    };
  };

  const goster = () => {
    const a = TUR_ADIMLARI[adim];
    if (!a) return bitir(true);
    if (a.ona === 'paneliKapat') api.closeModal();
    hedefGorulmedi = 0;
    kat.hidden = false;
    $('v3-tur-say').textContent = `${adim + 1} / ${TUR_ADIMLARI.length}`;
    $('v3-tur-baslik').textContent = a.baslik;
    $('v3-tur-metin').textContent = a.metin;
    const devam = $('v3-tur-devam');
    devam.hidden = !a.dugme;
    devam.textContent = a.dugme || '';
    $('v3-tur-gec').hidden = true;
    kat.classList.toggle('v3-tur-bilgi', !a.hedef && !!a.dugme);   // hedefsiz bilgi adımı: arka plan kararır ve tıklanmaz
    yaz({ adim });
    yerlestir();
  };

  const yerlestir = () => {
    const a = TUR_ADIMLARI[adim];
    if (!a) return;
    const isik = $('v3-tur-isik'), kart = $('v3-tur-kart');
    const el = a.hedef ? document.querySelector(a.hedef) : null;
    const r = el && el.getBoundingClientRect();
    const gorunur = r && r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight;
    if (gorunur) {
      hedefGorulmedi = 0;
      isik.hidden = false;
      isik.style.cssText = `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px`;
      kart.style.cssText = r.top + r.height / 2 > innerHeight / 2 ? 'top:64px;bottom:auto' : 'bottom:76px;top:auto';
      $('v3-tur-gec').hidden = true;
    } else {
      isik.hidden = true;
      kart.style.cssText = 'bottom:76px;top:auto';
      if (a.hedef) { hedefGorulmedi += 1; $('v3-tur-gec').hidden = hedefGorulmedi < 4; }   // ~1,6 sn hedef yoksa "geç" çıkar
    }
  };

  const ilerle = (yeni) => {
    adim = yeni;
    if (adim >= TUR_ADIMLARI.length) return bitir(true);
    goster();
  };

  const bitir = (tamamlandi) => {
    clearInterval(zamanlayici); zamanlayici = null;
    kat.hidden = true;
    adim = -1;
    yaz(tamamlandi ? { bitti: true } : { atlandi: true });
    if (tamamlandi && typeof api.turBitti === 'function') api.turBitti();   // Krallık Yolu: "Oyun turunu bitir" görevi
  };

  $('v3-tur-devam').addEventListener('click', () => ilerle(adim + 1));
  $('v3-tur-gec').addEventListener('click', () => ilerle(adim + 1));
  $('v3-tur-atla').addEventListener('click', () => bitir(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !kat.hidden && !api.isAnyModalOpen()) bitir(false); });
  window.addEventListener('resize', () => { if (adim >= 0) yerlestir(); });

  function baslat(zorla) {
    const gs = api.gameState;
    const ob = gs.state.onboarding || {};
    const kayit = zorla ? null : oku();
    if (!zorla && !turBaslamali({
      seviye: gs.state.level || 1,
      askerSayisi: (gs.state.soldierUnits || []).length,
      ilkSeferYapildi: !!(ob.first_expedition && ob.first_expedition.done),
      kayit
    })) return false;
    adim = zorla ? 0 : (kayit && kayit.adim > 0 ? kayit.adim : 0);
    goster();
    clearInterval(zamanlayici);
    zamanlayici = setInterval(() => {
      if (adim < 0) return;
      const yeni = sonrakiAdim(adim, durumHesapla());
      if (yeni !== adim) ilerle(yeni); else yerlestir();
    }, 400);
    return true;
  }

  return { baslat, aktifMi: () => adim >= 0 };
}
