// Realm of AdAstra — arayüz v3 kabuğu (tek kabuk: eski üst şerit, alt çubuk ve kenar menüsü kaldırıldı).
// Tek satırlık üst çubuk, 5 sekmeli alt çubuk, tek tip panel (#rpg-modal'ın v3 görünümü), "şimdi ne yapmalı" kartı.
// Üst çubuktaki değerler doğrudan oyun durumundan gelir (api.hudVeri); eski çubuğa bağımlılık yoktur.
// Eski kenar çubuğu (Seferler paneli) kaldırıldı: seferler, üretim hakkı, toplu hasat ve onarım Krallık merkezi ekranında.

import { SEKMELER, HUB, hubHtml, esc } from './hub.js';
import { SOZLUK } from './sozluk.js';
import { kurTur } from './tur.js';
import { kurLab } from './lab.js';
import { komutListesi, kurPalet, kisayolHedefi } from './palet.js';
import { hubdenGidiyor, hubGeriKur, geriSifirla } from '../ekran/cekirdek.js';
import { ayarOku, ayarYaz, ayarDogrula, ayarUygula, ayarlarHtml, baglantiDurumu, BAGLANTI_METNI } from './ayarlar.js';

const $ = (id) => document.getElementById(id);
// Düğme etiketinin başındaki simgeyi atar ("✨ İncele" → "İncele"); \p{L} yazımı bazı katmanlarda bozulduğu için kodla kurulur
const BASTAKI_SIMGE = new RegExp('^[^' + String.fromCharCode(92) + 'p{L}]+', 'u');
const KAYNAKLAR = ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb'];


// Hub öğesi anahtarı → açılan ekranın kimliği (js/ui/ekran/*). Öğenin ekranı yoksa aşağıdaki özel eylemler çalışır.
const EKRAN_KIMLIGI = {
  merkez: 'merkez', silo: 'silo', taverna: 'taverna', demirhane: 'demirhane', sifahane: 'sifahane', koy: 'koy',
  konsey: 'konsey', uzay: 'uzay', kolezyum: 'kolezyum', savasalani: 'savasalani', pazar: 'pazar', karnaval: 'karnaval',
  koleksiyon: 'koleksiyon', ekonomi: 'ekonomi', profil: 'karakter', kotalar: 'kotalar', hazine: 'hazine', surum: 'surum', kisla: 'kisla', sorunbildir: 'geribildirim', zindanmod: 'zindanmod'
};

// Bir öğeye dokununca ne olacağı (hub öğesi anahtarı → işlev). api: app.js'in verdiği açıcılar.
// Oyun rehberi (public/rehber.html): yeni sekmede açılır; oyun arkada olduğu gibi kalır. Açılır pencere engellenirse aynı sekmede açılır.
export function rehberAc() {
  // Not: 'noopener' ile window.open her zaman null döner (başarıda bile); bu yüzden pencere açılıp opener elle kapatılır.
  try { const w = window.open('rehber.html', '_blank'); if (w) { try { w.opener = null; } catch { /* çapraz kaynak değil: sorun yok */ } return; } } catch { /* engellendi: aynı sekmede aç */ }
  window.location.href = 'rehber.html';
}

export function gitHaritasi(api, { sekmeSec, uyariMetni, turBaslat, labAc, ayarlarAc, paletAc }) {
  const harita = {};
  for (const [anahtar, kimlik] of Object.entries(EKRAN_KIMLIGI)) harita[anahtar] = () => api.ekranAc(kimlik);
  return {
    ...harita,
    zindan: () => api.zindanGir(),
    hesap: () => api.openWallet(),
    tur: () => { api.closeModal(); sekmeSec('harita'); turBaslat(); },
    rehber: () => api.openOgretici(),
    oyunrehberi: () => { api.closeModal(); rehberAc(); },
    komut: () => { api.closeModal(); paletAc(); },
    ayarlar: () => ayarlarAc(),
    duyurular: () => api.openPanel(['ℹ️', 'Duyurular ve uyarılar'], `<div class="v3-liste">${uyariMetni().map((a) => `<div class="v3-not"><b>${esc(a.badge || 'Duyuru')}</b><span>${esc(a.text)}</span></div>`).join('') || '<div class="v3-bos">Şu an duyuru yok. Önemli bir bildirim olduğunda burada görünür.</div>'}</div>`),
    test: () => labAc()
  };
}

export function kurV3Kabuk(api) {
  const gs = api.gameState;
  let aktif = 'harita';
  let son = 0;

  // ---------------------------------------------------------------- iskelet
  const hud = document.createElement('header');
  hud.id = 'v3-hud';
  hud.innerHTML = `
    <button type="button" id="v3-profil" class="v3-profil" aria-label="Karakterim">
      <span class="v3-av" aria-hidden="true">🧙</span>
      <span class="v3-profil-metin"><b id="v3-lv">Lv.1</b>
        <span class="v3-xp" title="Deneyim (XP)"><i id="v3-xp-dolu"></i></span>
        <span class="v3-stamina" title="Stamina"><i id="v3-st-dolu"></i></span></span>
    </button>
    <button type="button" id="v3-bakiye" class="v3-hap v3-bakiye" aria-label="ASTRA bakiyen, hesap ve cüzdan">
      <span class="v3-para" aria-hidden="true"></span><b id="v3-bakiye-deger">0</b><small>ASTRA</small>
    </button>
    <button type="button" id="v3-daha" class="v3-hap v3-ikon" aria-label="Daha fazla: kaynaklar, bot, bildirimler" aria-expanded="false" aria-controls="v3-hud-grup">
      <span aria-hidden="true">⋯</span><i id="v3-daha-nokta" class="v3-nokta" hidden></i>
    </button>
    <div id="v3-hud-grup" class="v3-hud-grup">
      <button type="button" id="v3-kaynak-dugme" class="v3-hap" aria-label="Kaynaklar" aria-expanded="false" aria-controls="v3-kaynak-tepsi">
        <span aria-hidden="true">📦</span><span class="v3-etiket">Kaynaklar</span><i id="v3-kaynak-uyari" class="v3-nokta" hidden></i>
      </button>
      <button type="button" id="v3-bot" class="v3-hap v3-bot" data-state="off" aria-label="Otomasyon botu">
        <i class="v3-durum"></i><span id="v3-bot-metin" class="v3-etiket">Bot</span>
      </button>
      <button type="button" id="v3-zil" class="v3-hap v3-ikon" aria-label="Bildirimler">
        <span aria-hidden="true">🔔</span><span class="v3-etiket-menu" aria-hidden="true">Bildirimler</span><b id="v3-zil-sayi" class="v3-sayi" hidden>0</b>
      </button>
      <button type="button" id="v3-rehber" class="v3-hap v3-ikon" aria-label="Oyun rehberi (yeni sekmede açılır)" title="Oyun rehberi">
        <span aria-hidden="true">📖</span><span class="v3-etiket-menu" aria-hidden="true">Oyun rehberi</span>
      </button>
      <button type="button" id="v3-sorun" class="v3-hap v3-ikon" aria-label="Sorun bildir" title="Sorun bildir">
        <span aria-hidden="true">📮</span><span class="v3-etiket-menu" aria-hidden="true">Sorun bildir</span>
      </button>
    </div>`;

  const tepsi = document.createElement('div');
  tepsi.id = 'v3-kaynak-tepsi';
  tepsi.hidden = true;
  tepsi.innerHTML = [...KAYNAKLAR, 'fragments'].map((k) => `
    <button type="button" class="v3-kaynak" data-v3-kaynak="${k}">
      <span class="v3-kaynak-simge" data-v3-simge="${k}"></span>
      <span class="v3-kaynak-govde"><b data-v3-deger="${k}">0</b><small data-v3-ipucu="${k}"></small>
        <span class="v3-cubuk"><i data-v3-dolu="${k}"></i></span></span>
    </button>`).join('');

  const uyari = document.createElement('div');
  uyari.id = 'v3-uyari';
  uyari.hidden = true;

  const dock = document.createElement('div');
  dock.id = 'v3-dock';
  dock.innerHTML = `
    <section id="v3-simdi" class="v3-simdi" aria-live="polite" hidden>
      <span id="v3-simdi-simge" class="v3-simdi-simge" aria-hidden="true">🧙</span>
      <span class="v3-simdi-govde"><b id="v3-simdi-baslik"></b><span id="v3-simdi-metin"></span></span>
      <button type="button" id="v3-simdi-dugme" class="v3-birincil"></button>
      <button type="button" id="v3-simdi-kapat" class="v3-simdi-kapat" aria-label="Öneriyi kapat" title="Öneriyi kapat">✕</button>
    </section>`;
  const rehber = $('guide-widget');
  if (rehber) dock.appendChild(rehber);

  const alt = document.createElement('nav');
  alt.id = 'v3-tabbar';
  alt.setAttribute('aria-label', 'Ana gezinme');
  alt.innerHTML = SEKMELER.map((t) => `<button type="button" data-v3-sekme="${t.id}" class="${t.id === aktif ? 'active' : ''}"><span aria-hidden="true">${t.simge}</span><small>${t.ad}</small></button>`).join('');

  const baglanti = document.createElement('div');
  baglanti.id = 'v3-baglanti';
  baglanti.setAttribute('role', 'status');
  baglanti.hidden = true;
  document.body.append(hud, tepsi, uyari, baglanti, dock, alt);

  // Panel (eski #rpg-modal): kapatma düğmesi ve erişilebilirlik
  const kapat = $('btn-close-modal');
  if (kapat) { kapat.setAttribute('aria-label', 'Paneli kapat'); kapat.title = 'Kapat (Esc)'; }
  const pencere = document.querySelector('#rpg-modal .rpg-modal-window');
  // aria-modal bilerek yok: arka plan (alt çubuk) etkileşimli kalıyor, "modal" demek yanlış olur
  if (pencere) { pencere.setAttribute('role', 'dialog'); pencere.setAttribute('aria-labelledby', 'modal-title'); }

  // ---------------------------------------------------------------- paneller
  const tepsiAc = (ac) => {
    tepsi.hidden = !ac;
    $('v3-kaynak-dugme').setAttribute('aria-expanded', String(ac));
  };

  // Dar ekranda (CSS: ≤ 359 px) Kaynaklar / Bot / Zil "Daha fazla" (⋯) menüsüne taşınır; geniş ekranda ⋯ gizli, grup yalnız bir sarmalayıcı
  const grup = $('v3-hud-grup');
  const grupAc = (ac, odakGeri = false) => {
    grup.classList.toggle('acik', ac);
    $('v3-daha').setAttribute('aria-expanded', String(ac));
    if (!ac && odakGeri) $('v3-daha').focus();
  };

  const sekmeSec = (id) => {
    aktif = id;
    alt.querySelectorAll('[data-v3-sekme]').forEach((b) => b.classList.toggle('active', b.dataset.v3Sekme === id));
  };

  const hubAc = (id) => {
    tepsiAc(false);
    sekmeSec(id);
    // Harita sekmesi: panel açıksa kapatır; kapalıysa ve alt haritadaysan ana haritaya döner (bulut geçişiyle)
    if (id === 'harita') { if (api.isAnyModalOpen()) api.closeModal(); else if (window.realmMap && window.realmMap.anaHaritayaDon) window.realmMap.anaHaritayaDon(); return; }
    api.openPanel(HUB[id].baslik, hubHtml(id, gs.getFeatureLock ? (k) => gs.getFeatureLock(k) : null, !!api.testSurumu, Number(gs.state.level) || 1));
    geriSifirla();   // hub listesi geri yığınının kökü
  };
  hubGeriKur(hubAc);   // ekranlardaki "‹ Geri" hub listesine de dönebilir

  const uyariMetni = () => (api.duyurular() || []).filter((a) => a.active !== false);
  const tur = kurTur({ gameState: gs, isAnyModalOpen: api.isAnyModalOpen, closeModal: api.closeModal, hesapAnahtari: api.hesapAnahtari });
  // Test laboratuvarı yalnız deneme ve geliştirme sürümünde var
  const lab = api.testSurumu ? kurLab({ gameState: gs, openPanel: api.openPanel, cevrimici: api.cevrimici, bildir: api.bildir, hudYenile: api.hudYenile, vanillaSifirla: api.vanillaSifirla }) : null;
  // Ayarlar (hareketi azalt, yazı boyutu): tarayıcı deposunda; açılışta uygulanır
  let ayar;
  try { ayar = ayarOku(localStorage); } catch { ayar = ayarOku(null); }   // site verisi engelliyse varsayılan ayar
  ayarUygula(ayar, document.documentElement);
  const ayarlarAc = () => api.openPanel(['⚙️', 'Ayarlar ve kısayollar'], ayarlarHtml(ayar, api.cevrimici()));
  $('rpg-modal')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v3-ayar]');
    if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const [grup, deger] = b.dataset.v3Ayar.split(':');
    ayar = ayarDogrula({ ...ayar, ...(grup === 'yazi' ? { yaziBoyutu: deger } : { hareketAzalt: deger === 'ac' }) });
    ayarYaz(localStorage, ayar);
    ayarUygula(ayar, document.documentElement);
    ayarlarAc();
  }, true);
  let palet = null;
  const GIT = gitHaritasi(api, { sekmeSec, uyariMetni, turBaslat: () => tur.baslat(true), labAc: () => { if (lab) lab.ac(); }, ayarlarAc, paletAc: () => palet.ac() });
  // Bir hub öğesine git: sekme etiketi öğenin bölümünde kalır, panel kapanınca Harita'ya dönülür
  const git = (anahtar) => {
    const f = GIT[anahtar];
    if (!f) return;
    const bolum = Object.keys(HUB).find((h) => HUB[h].ogeler.some((o) => o.k === anahtar));
    // Alt çubuk listesinden bir öğeye dokunulduysa: açılan ekranın "‹ Geri" düğmesi bu listeye döner
    if (bolum && typeof document !== 'undefined' && document.querySelector('#modal-body .v3-hub')) hubdenGidiyor(bolum, (HUB[bolum].baslik || [])[1] || '');
    if (bolum) sekmeSec(bolum);
    api.closeModal();
    f();
  };
  palet = kurPalet({
    liste: () => komutListesi({ testMenusuVar: !!lab, kilit: (k) => gs.getFeatureLock(k) }),
    calistir: git
  });
  // Klavye kısayolları (hedefler js/ui/v3/palet.js'te): Tab yalnız panel kapalıyken Krallık merkezini açar,
  // açık panelde Tab odak gezintisi olarak kalır.
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    const yaziAlani = !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);
    const hedef = kisayolHedefi(e.key, { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, yaziAlani });
    if (!hedef) return;
    if (hedef.palet) { e.preventDefault(); palet.ac(); return; }
    if (hedef.kapat) { palet.kapat(); api.closeModal(); return; }
    if (e.key === 'Tab' && (api.isAnyModalOpen() || palet.acikMi())) return;
    e.preventDefault();
    if (hedef.git) git(hedef.git);
    else if (hedef.kaynak) api.openKaynak(hedef.kaynak);
  });
  if (lab) {
    // T kısayolu laboratuvarı açar/kapatır
    window.addEventListener('keydown', (e) => {
      if ((e.key !== 't' && e.key !== 'T') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (api.isAnyModalOpen() && document.querySelector('#modal-body .v3-lab')) api.closeModal(); else { sekmeSec('ben'); lab.ac(); }
    }, true);
  }

  // ---------------------------------------------------------------- olaylar
  alt.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v3-sekme]');
    if (!b) return;
    const id = b.dataset.v3Sekme;
    // Bulunduğun sekmeye tekrar dokunmak: alt sayfadaysan sekmenin ana listesine dön, ana listedeysen paneli kapat
    if (id === aktif && id !== 'harita' && api.isAnyModalOpen() && document.querySelector('#modal-body .v3-hub')) { api.closeModal(); sekmeSec('harita'); return; }
    hubAc(id);
  });

  $('rpg-modal')?.addEventListener('click', (e) => {
    const k = e.target.closest('[data-v3-git]');
    if (!k) return;
    e.stopPropagation();
    git(k.dataset.v3Git);
  }, true);   // yakalama aşaması: eski pencere kodu içerideki tıklamaların yukarı çıkmasını durduruyor

  new MutationObserver(() => { if (!$('rpg-modal').classList.contains('active')) sekmeSec('harita'); })
    .observe($('rpg-modal'), { attributes: true, attributeFilter: ['class'] });

  // Terim balonu: sözlükteki "?" düğmelerine dokununca açıklama gösterilir (yakalama aşaması: eski pencere olayları durduruyor)
  const balon = document.createElement('div');
  balon.id = 'v3-balon';
  balon.setAttribute('role', 'tooltip');
  balon.hidden = true;
  document.body.appendChild(balon);
  const balonKapat = () => { balon.hidden = true; };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.v3-terim');
    if (!t) { if (!balon.hidden && !e.target.closest('#v3-balon')) balonKapat(); return; }
    e.preventDefault(); e.stopPropagation();
    const s = SOZLUK[t.dataset.v3Terim];
    if (!s) return;
    balon.innerHTML = `<b>${esc(s.ad)}</b><span>${esc(s.aciklama)}</span>`;
    balon.hidden = false;
    const r = t.getBoundingClientRect();
    const genis = Math.min(300, window.innerWidth - 20);
    balon.style.width = `${genis}px`;
    balon.style.left = `${Math.max(10, Math.min(window.innerWidth - genis - 10, r.left + r.width / 2 - genis / 2))}px`;
    const yukseklik = balon.offsetHeight;
    balon.style.top = `${r.bottom + 8 + yukseklik > window.innerHeight ? Math.max(10, r.top - yukseklik - 8) : r.bottom + 8}px`;
  }, true);
  // Terim balonu açıkken Esc yalnız balonu kapatır (panel açık kalır)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || balon.hidden) return;
    e.stopPropagation();
    balonKapat();
  }, true);

  $('v3-daha').addEventListener('click', () => { tepsiAc(false); grupAc(!grup.classList.contains('acik')); });
  grup.addEventListener('click', () => grupAc(false));   // menüdeki bir öğeye dokunulunca menü kapanır (öğenin kendi işlevi önce çalışır)
  document.addEventListener('click', (e) => { if (grup.classList.contains('acik') && !e.target.closest('#v3-hud-grup, #v3-daha')) grupAc(false); });
  $('v3-profil').addEventListener('click', () => { tepsiAc(false); api.ekranAc('karakter'); });
  $('v3-bakiye').addEventListener('click', () => { tepsiAc(false); api.openWallet(); });
  $('v3-bot').addEventListener('click', () => { tepsiAc(false); api.ekranAc('taverna'); });
  $('v3-zil').addEventListener('click', () => { tepsiAc(false); api.toggleNotif(); });
  $('v3-rehber').addEventListener('click', () => { tepsiAc(false); rehberAc(); });
  $('v3-sorun').addEventListener('click', () => { tepsiAc(false); api.ekranAc('geribildirim'); });
  $('v3-kaynak-dugme').addEventListener('click', () => tepsiAc(tepsi.hidden));
  tepsi.addEventListener('click', (e) => {
    const k = e.target.closest('[data-v3-kaynak]');
    if (!k) return;
    tepsiAc(false);
    k.dataset.v3Kaynak === 'fragments' ? api.ekranAc('pazar') : api.openKaynak(k.dataset.v3Kaynak);
  });
  document.addEventListener('click', (e) => { if (!tepsi.hidden && !e.target.closest('#v3-kaynak-tepsi, #v3-kaynak-dugme')) tepsiAc(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!tepsi.hidden) tepsiAc(false);
    if (grup.classList.contains('acik')) grupAc(false, true);
  });
  $('v3-simdi-dugme').addEventListener('click', () => api.danismanEylemi($('v3-simdi').dataset.eylem || ''));
  // Danışmanın önerisini oyuncu kapatabilir (küçük ekranda haritayı örter): aynı öneri (başlık + eylem) oturum boyunca bir daha gösterilmez,
  // öneri değişince kart yeniden görünür. Krallık Yolu şeridi etkilenmez.
  let kapatilanOneri = (() => { try { return sessionStorage.getItem('v3_simdi_kapali') || ''; } catch { return ''; } })();
  $('v3-simdi-kapat').addEventListener('click', () => {
    const k = $('v3-simdi');
    kapatilanOneri = k.dataset.oneri || '';
    try { sessionStorage.setItem('v3_simdi_kapali', kapatilanOneri); } catch { /* oturum verisi engelliyse yalnız bu sayfa açıkken kapalı kalır */ }
    k.hidden = true;
  });

  // Risk/duyuru: oturumda bir kez, kapatılabilir tek satır
  const kapali = (() => { try { return sessionStorage.getItem('v3_uyari_kapali') === '1'; } catch { return false; } })();
  const ilk = uyariMetni()[0];
  if (ilk && !kapali) {
    uyari.hidden = false;
    uyari.innerHTML = `<span class="v3-uyari-metin"><b>${esc(ilk.badge || 'Duyuru')}</b> ${esc(ilk.text)}</span><button type="button" aria-label="Uyarıyı kapat">✕</button>`;
    uyari.querySelector('button').addEventListener('click', () => {
      uyari.hidden = true;
      try { sessionStorage.setItem('v3_uyari_kapali', '1'); } catch { /* oturum deposu yok */ }
    });
  }

  // ---------------------------------------------------------------- canlı güncelleme (doğrudan oyun durumundan: api.hudVeri)
  const yaz = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
  function guncelle(zorla) {
    const simdi = performance.now();
    if (!zorla && simdi - son < 250) return;
    son = simdi;
    const v = api.hudVeri();
    yaz($('v3-lv'), v.seviye);
    const dolu = $('v3-st-dolu');
    if (dolu) dolu.style.width = `${v.staminaYuzde}%`;
    const xpDolu = $('v3-xp-dolu');
    if (xpDolu) { xpDolu.style.width = `${v.xpYuzde}%`; xpDolu.classList.toggle('is-dolu', v.xpYuzde >= 100); }
    $('v3-profil').title = `Deneyim ${v.xpMetin || '-'} · Stamina ${v.staminaMetin}`;
    yaz($('v3-bakiye-deger'), v.bakiye);

    let doluVar = false;
    for (const k of [...KAYNAKLAR, 'fragments']) {
      const r = v.kaynaklar[k];
      if (!r) continue;
      yaz(tepsi.querySelector(`[data-v3-deger="${k}"]`), r.deger);
      const ip = tepsi.querySelector(`[data-v3-ipucu="${k}"]`);
      const cubuk = tepsi.querySelector(`[data-v3-dolu="${k}"]`);
      if (ip) yaz(ip, k === 'fragments' ? 'teçhizat parçası' : r.ipucu.replace(/^[^/]*[/]/, 'silo ≤'));
      if (cubuk) { cubuk.style.width = `${r.yuzde}%`; cubuk.parentElement.classList.toggle('is-full', r.dolu); if (r.dolu) doluVar = true; }
      const simge = tepsi.querySelector(`[data-v3-simge="${k}"]`);
      if (simge && !simge.firstChild && api.kaynakSimge) simge.innerHTML = api.kaynakSimge(k);
    }
    $('v3-kaynak-uyari').hidden = !doluVar;

    const bd = baglantiDurumu(api.cevrimici(), api.senkronYasi());
    baglanti.hidden = !BAGLANTI_METNI[bd];
    if (BAGLANTI_METNI[bd]) { yaz(baglanti, BAGLANTI_METNI[bd]); baglanti.dataset.durum = bd; }

    $('v3-bot').dataset.state = v.bot.durum;
    yaz($('v3-bot-metin'), v.bot.metin);
    $('v3-bot').setAttribute('aria-label', 'Otomasyon botu: ' + String(v.bot.metin || '').trim());   // telefonda metin gizli, durum yalnız renkle verilmesin

    const n = String(v.bildirim || 0);
    $('v3-zil-sayi').hidden = n === '0'; yaz($('v3-zil-sayi'), n);
    // ⋯ menüsü kapalıyken içindeki uyarılar kaybolmasın: okunmamış bildirim ya da dolu silo varsa ⋯ üstünde nokta
    $('v3-daha-nokta').hidden = n === '0' && !doluVar;
    $('v3-zil').setAttribute('aria-label', n === '0' ? 'Bildirimler' : `Bildirimler, ${n} okunmamış`);

    // Şimdi ne yapmalı: kralın danışmanının önerisi
    const kart = $('v3-simdi');
    const d = v.danisman;
    const oneri = d ? `${d.baslik}|${d.eylem || ''}` : '';
    if (d && d.baslik && d.metin && oneri !== kapatilanOneri) {
      kart.hidden = false;
      kart.dataset.oneri = oneri;
      yaz($('v3-simdi-simge'), d.simge);
      yaz($('v3-simdi-baslik'), d.baslik);
      yaz($('v3-simdi-metin'), d.metin.replace(/[*][*]/g, ''));
      yaz($('v3-simdi-dugme'), String(d.eylemEtiketi || 'İncele').replace(BASTAKI_SIMGE, '').trim());
      kart.dataset.eylem = d.eylem || '';
    } else kart.hidden = true;
  }

  window.__v3 = { guncelle: () => guncelle(false), hubAc, panelAc: (id) => hubAc(id), tur, palet, git: (anahtar) => { if (GIT[anahtar]) GIT[anahtar](); } };
  guncelle(true);
  setTimeout(() => tur.baslat(false), 3500);   // yükleme ekranı bitince; yalnız yeni oyuncuda ve tur bitmemişse başlar
}
