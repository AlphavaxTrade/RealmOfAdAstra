// Realm of AdAstra — arayüz v3 kabuğu (tek kabuk: eski üst şerit, alt çubuk ve kenar menüsü kaldırıldı).
// Tek satırlık üst çubuk, 5 sekmeli alt çubuk, tek tip panel (#rpg-modal'ın v3 görünümü), "şimdi ne yapmalı" kartı.
// Üst çubuktaki değerler doğrudan oyun durumundan gelir (api.hudVeri); eski çubuğa bağımlılık yoktur.
// Kenar menüsü yalnız "Seferler" paneli olarak kalır (sefer sayaçları, üretim hakkı, toplu hasat ve onarım).

import { SEKMELER, HUB, hubHtml, esc } from './hub.js';
import { sadeBaslik, katlaKurali, katla, eskiSurumleriGizle } from './panel.js';
import { SOZLUK } from './sozluk.js';
import { kurTur } from './tur.js';
import { kurLab } from './lab.js';
import { ayarOku, ayarYaz, ayarDogrula, ayarUygula, ayarlarHtml, baglantiDurumu, BAGLANTI_METNI } from './ayarlar.js';

const $ = (id) => document.getElementById(id);
// Düğme etiketinin başındaki simgeyi atar ("✨ İncele" → "İncele"); \p{L} yazımı bazı katmanlarda bozulduğu için kodla kurulur
const BASTAKI_SIMGE = new RegExp('^[^' + String.fromCharCode(92) + 'p{L}]+', 'u');
const KAYNAKLAR = ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb'];


// Bir öğeye dokununca ne olacağı (hub öğesi anahtarı → işlev). api: app.js'in verdiği açıcılar.
export function gitHaritasi(api, { yanAc, sekmeSec, uyariMetni, turBaslat, labAc, ayarlarAc }) {
  return {
    merkez: () => api.openDashboard(),
    seferler: () => { api.closeModal(); yanAc(true); },
    silo: () => api.openWarehouse(),
    taverna: () => api.openZone('tavern', '🍺 Taverna ve Bot'),
    demirhane: () => api.openZone('blacksmith', '⚒️ Demirhane'),
    sifahane: () => api.openZone('healer', '🌿 Şifahane'),
    koy: () => api.openZone('village', '🏘️ Köy Evleri'),
    konsey: () => api.openTreasury(),
    uzay: () => api.openZone('spaceport', '🚀 Uzay Limanı'),
    kisla: () => api.openBarracks(),
    zindan: () => api.enterDungeon(),
    kolezyum: () => api.openColosseum(),
    savasalani: () => api.openZone('battlefield', '🚩 Savaş Alanı'),
    pazar: () => api.openZone('market', '🏪 Meydan Pazarı'),
    karnaval: () => api.openCarnival('wheel'),
    koleksiyon: () => api.openCollection(),
    ekonomi: () => api.openEconomy(),
    profil: () => api.openInventory(),
    hesap: () => api.openWallet(),
    kotalar: () => api.openLimits(),
    hazine: () => api.openTreasury(),
    tur: () => { api.closeModal(); sekmeSec('harita'); turBaslat(); },
    rehber: () => { api.closeModal(); sekmeSec('harita'); document.querySelector('#guide-widget [data-guide-toggle]')?.click(); },
    komut: () => { api.closeModal(); api.openPalette(); },
    ayarlar: () => ayarlarAc(),
    duyurular: () => api.openPanel(['ℹ️', 'Duyurular ve uyarılar'], `<div class="v3-liste">${uyariMetni().map((a) => `<div class="v3-not"><b>${esc(a.badge || 'Duyuru')}</b><span>${esc(a.text)}</span></div>`).join('') || '<div class="v3-bos">Şu an duyuru yok.</div>'}</div>`),
    surum: () => api.openChangelog(),
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
        <span class="v3-stamina" title="Stamina"><i id="v3-st-dolu"></i></span></span>
    </button>
    <button type="button" id="v3-bakiye" class="v3-hap v3-bakiye" aria-label="ASTRA bakiyen, hesap ve cüzdan">
      <span class="v3-para" aria-hidden="true"></span><b id="v3-bakiye-deger">0</b><small>ASTRA</small>
    </button>
    <button type="button" id="v3-kaynak-dugme" class="v3-hap" aria-expanded="false" aria-controls="v3-kaynak-tepsi">
      <span aria-hidden="true">📦</span><span class="v3-etiket">Kaynaklar</span><i id="v3-kaynak-uyari" class="v3-nokta" hidden></i>
    </button>
    <button type="button" id="v3-bot" class="v3-hap v3-bot" data-state="off" aria-label="Otomasyon botu">
      <i class="v3-durum"></i><span id="v3-bot-metin" class="v3-etiket">Bot</span>
    </button>
    <button type="button" id="v3-zil" class="v3-hap v3-ikon" aria-label="Bildirimler">
      <span aria-hidden="true">🔔</span><b id="v3-zil-sayi" class="v3-sayi" hidden>0</b>
    </button>`;

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
  if (pencere) { pencere.setAttribute('role', 'dialog'); pencere.setAttribute('aria-modal', 'true'); pencere.setAttribute('aria-labelledby', 'modal-title'); }

  // Kenar çubuğu (seferler/üretim hakkı) v3'te kapatılabilir bir panel olur
  const yan = $('realm-sidebar');
  let yanKapat = null;
  if (yan) {
    yanKapat = document.createElement('button');
    yanKapat.type = 'button'; yanKapat.className = 'v3-yan-kapat'; yanKapat.textContent = '✕ Kapat';
    yanKapat.addEventListener('click', () => yanAc(false));
    yan.prepend(yanKapat);
  }
  const yanAc = (ac) => { if (yan) yan.classList.toggle('open', ac); };

  // ---------------------------------------------------------------- paneller
  const tepsiAc = (ac) => {
    tepsi.hidden = !ac;
    $('v3-kaynak-dugme').setAttribute('aria-expanded', String(ac));
  };

  const sekmeSec = (id) => {
    aktif = id;
    alt.querySelectorAll('[data-v3-sekme]').forEach((b) => b.classList.toggle('active', b.dataset.v3Sekme === id));
  };

  const hubAc = (id) => {
    tepsiAc(false); yanAc(false);
    sekmeSec(id);
    if (id === 'harita') { if (api.isAnyModalOpen()) api.closeModal(); return; }
    api.openPanel(HUB[id].baslik, hubHtml(id, gs.getFeatureLock ? (k) => gs.getFeatureLock(k) : null, !!$('dev-modal')));
  };

  const uyariMetni = () => (api.duyurular() || []).filter((a) => a.active !== false);
  const tur = kurTur({ gameState: gs, isAnyModalOpen: api.isAnyModalOpen, closeModal: api.closeModal, hesapAnahtari: api.hesapAnahtari });
  // Test laboratuvarı yalnız deneme sürümünde var (eski test menüsünün öğeleri o sürümde sayfada bulunur)
  const lab = $('dev-modal') ? kurLab({ gameState: gs, openPanel: api.openPanel, cevrimici: api.cevrimici, bildir: api.bildir, hudYenile: api.hudYenile, vanillaSifirla: api.vanillaSifirla }) : null;
  // Ayarlar (hareketi azalt, yazı boyutu): tarayıcı deposunda; açılışta uygulanır
  let ayar = ayarOku(localStorage);
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
  const GIT = gitHaritasi(api, { yanAc, sekmeSec, uyariMetni, turBaslat: () => tur.baslat(true), labAc: () => { if (lab) lab.ac(); }, ayarlarAc });
  if (lab) {
    // T kısayolu v3'te eski test menüsünü değil laboratuvarı açar (yakalama aşaması: eski dinleyiciden önce)
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
    const f = GIT[k.dataset.v3Git];
    if (!f) return;
    // Sekme etiketi, panelin ait olduğu bölümde kalır; panel kapanınca Harita'ya dönülür
    const bolum = Object.keys(HUB).find((h) => HUB[h].ogeler.some((o) => o.k === k.dataset.v3Git));
    if (bolum) sekmeSec(bolum);
    api.closeModal();
    f();
  }, true);   // yakalama aşaması: eski pencere kodu içerideki tıklamaların yukarı çıkmasını durduruyor

  new MutationObserver(() => { if (!$('rpg-modal').classList.contains('active') && !(yan && yan.classList.contains('open'))) sekmeSec('harita'); })
    .observe($('rpg-modal'), { attributes: true, attributeFilter: ['class'] });

  // Eski ekranların sadeleştirilmesi: başlıklar sadeleşir, uzun kart yığınları katlanır, sürüm geçmişi kısalır
  const baslikEl = $('modal-title'), govde = $('modal-body');
  new MutationObserver(() => {
    const spanlar = baslikEl.querySelectorAll('span');
    const son = spanlar[spanlar.length - 1];
    if (!son) return;
    const hepsi = (baslikEl.innerText || '').replace(/\s+/g, ' ').trim();
    const sade = sadeBaslik(hepsi);
    if (sade === hepsi) return;
    const [simge, ...kalan] = sade.split(' ');
    baslikEl.innerHTML = `<span>${esc(simge)}</span> <span>${esc(kalan.join(' '))}</span>`;
  }).observe(baslikEl, { childList: true });
  new MutationObserver((mut) => {
    // kendi taşımalarımız (katlanır bölüm) yeniden işlemeyi tetiklemesin
    if (mut.every((m) => [...m.addedNodes].every((n) => n.nodeType !== 1 || n.matches('details.v3-katli, .v3-eski-dugme')))) return;
    const baslik = (baslikEl.innerText || '').replace(/\s+/g, ' ').trim();
    const kural = katlaKurali(sadeBaslik(baslik));
    if (kural) katla(govde, kural.acik, baslik);
    if (/Sürüm geçmişi/i.test(sadeBaslik(baslik))) eskiSurumleriGizle(govde, 3);
  }).observe(govde, { childList: true });

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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') balonKapat(); }, true);

  $('v3-profil').addEventListener('click', () => { tepsiAc(false); api.openInventory(); });
  $('v3-bakiye').addEventListener('click', () => { tepsiAc(false); api.openWallet(); });
  $('v3-bot').addEventListener('click', () => { tepsiAc(false); api.openZone('tavern', '🍺 Taverna ve Bot'); });
  $('v3-zil').addEventListener('click', () => { tepsiAc(false); api.toggleNotif(); });
  $('v3-kaynak-dugme').addEventListener('click', () => tepsiAc(tepsi.hidden));
  tepsi.addEventListener('click', (e) => {
    const k = e.target.closest('[data-v3-kaynak]');
    if (!k) return;
    tepsiAc(false);
    k.dataset.v3Kaynak === 'fragments' ? api.openZone('market', '🏪 Meydan Pazarı') : api.openKaynak(k.dataset.v3Kaynak);
  });
  document.addEventListener('click', (e) => { if (!tepsi.hidden && !e.target.closest('#v3-kaynak-tepsi, #v3-kaynak-dugme')) tepsiAc(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!tepsi.hidden) tepsiAc(false);
    else if (yan && yan.classList.contains('open')) yanAc(false);
  });
  $('v3-simdi-dugme').addEventListener('click', () => api.danismanEylemi($('v3-simdi').dataset.eylem || ''));

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
    $('v3-profil').title = `Stamina ${v.staminaMetin}`;
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

    const n = String(v.bildirim || 0);
    $('v3-zil-sayi').hidden = n === '0'; yaz($('v3-zil-sayi'), n);

    // Şimdi ne yapmalı: kralın danışmanının önerisi
    const kart = $('v3-simdi');
    const d = v.danisman;
    if (d && d.baslik && d.metin) {
      kart.hidden = false;
      yaz($('v3-simdi-simge'), d.simge);
      yaz($('v3-simdi-baslik'), d.baslik);
      yaz($('v3-simdi-metin'), d.metin.replace(/[*][*]/g, ''));
      yaz($('v3-simdi-dugme'), String(d.eylemEtiketi || 'İncele').replace(BASTAKI_SIMGE, '').trim());
      kart.dataset.eylem = d.eylem || '';
    } else kart.hidden = true;
  }

  window.__v3 = { guncelle: () => guncelle(false), hubAc, panelAc: (id) => hubAc(id), tur };
  guncelle(true);
  setTimeout(() => tur.baslat(false), 3500);   // yükleme ekranı bitince; yalnız yeni oyuncuda ve tur bitmemişse başlar
}
