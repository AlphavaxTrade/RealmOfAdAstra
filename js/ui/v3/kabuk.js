// Realm of AdAstra — arayüz v3 kabuğu (yalnız ?arayuz=3 ile açılır; eski arayüz değişmeden çalışır).
// Tek satırlık üst çubuk, 5 sekmeli alt çubuk, tek tip panel (eski #rpg-modal'ın v3 görünümü), "şimdi ne yapmalı" kartı.
// Geçiş dönemi: üst çubuktaki değerler eski çubuktan OKUNUR (aynı kimlikler, tek hesap yeri); eski çubuk silinince doğrudan oyun durumundan okunacak.
// Panel içerikleri hâlâ eski ekranlardır; Aşama 2'de tek tek bu kabuğun bileşenleriyle yeniden yazılır.

import { SEKMELER, HUB, hubHtml, esc } from './hub.js';

const $ = (id) => document.getElementById(id);
const KAYNAKLAR = ['wheat', 'stone', 'wood', 'coal', 'iron', 'herb'];


// Bir öğeye dokununca ne olacağı (hub öğesi anahtarı → işlev). api: app.js'in verdiği açıcılar.
export function gitHaritasi(api, { yanAc, sekmeSec, uyariMetni }) {
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
    rehber: () => { api.closeModal(); sekmeSec('harita'); document.querySelector('#guide-widget [data-guide-toggle]')?.click(); },
    komut: () => { api.closeModal(); api.openPalette(); },
    duyurular: () => api.openPanel(['ℹ️', 'Duyurular ve uyarılar'], `<div class="v3-liste">${uyariMetni().map((a) => `<div class="v3-not"><b>${esc(a.badge || 'Duyuru')}</b><span>${esc(a.text)}</span></div>`).join('') || '<div class="v3-bos">Şu an duyuru yok.</div>'}</div>`),
    surum: () => api.openChangelog(),
    test: () => { api.closeModal(); api.openDev(); }
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

  document.body.append(hud, tepsi, uyari, dock, alt);

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
  const GIT = gitHaritasi(api, { yanAc, sekmeSec, uyariMetni });

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

  $('v3-profil').addEventListener('click', () => { tepsiAc(false); api.openInventory(); });
  $('v3-bakiye').addEventListener('click', () => { tepsiAc(false); api.openWallet(); });
  $('v3-bot').addEventListener('click', () => { tepsiAc(false); api.openZone('tavern', '🍺 Taverna ve Bot'); });
  $('v3-zil').addEventListener('click', () => { tepsiAc(false); api.toggleNotif(); });
  $('v3-kaynak-dugme').addEventListener('click', () => tepsiAc(tepsi.hidden));
  tepsi.addEventListener('click', (e) => {
    const k = e.target.closest('[data-v3-kaynak]');
    if (!k) return;
    tepsiAc(false);
    k.dataset.v3Kaynak === 'fragments' ? api.openZone('market', '🏪 Meydan Pazarı') : $(`res-pill-${k.dataset.v3Kaynak}`)?.click();
  });
  document.addEventListener('click', (e) => { if (!tepsi.hidden && !e.target.closest('#v3-kaynak-tepsi, #v3-kaynak-dugme')) tepsiAc(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!tepsi.hidden) tepsiAc(false);
    else if (yan && yan.classList.contains('open')) yanAc(false);
  });
  $('v3-simdi-dugme').addEventListener('click', () => $('btn-advisor-action')?.click());

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

  // ---------------------------------------------------------------- canlı güncelleme (eski çubuktan okur)
  const yaz = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
  function guncelle(zorla) {
    const simdi = performance.now();
    if (!zorla && simdi - son < 250) return;
    son = simdi;
    yaz($('v3-lv'), $('player-level')?.textContent || 'Lv.1');
    const dolu = $('v3-st-dolu'), kaynakDolu = $('hud-stamina-fill');
    if (dolu && kaynakDolu) dolu.style.width = kaynakDolu.style.width || '0%';
    $('v3-profil').title = `Stamina ${$('stamina-text')?.textContent || ''}`;
    yaz($('v3-bakiye-deger'), $('adastra-balance')?.textContent || '0');

    let doluVar = false;
    for (const k of [...KAYNAKLAR, 'fragments']) {
      yaz(tepsi.querySelector(`[data-v3-deger="${k}"]`), $(`res-${k === 'fragments' ? 'fragments' : k}`)?.textContent || '0');
      const pill = $(k === 'fragments' ? 'res-pill-fragments' : `res-pill-${k}`);
      const ip = tepsi.querySelector(`[data-v3-ipucu="${k}"]`);
      const cubuk = tepsi.querySelector(`[data-v3-dolu="${k}"]`);
      const cap = $(`res-cap-${k}`);
      if (ip) yaz(ip, k === 'fragments' ? 'teçhizat parçası' : (pill?.dataset.tip || '').replace(/^[^/]*\//, 'silo ≤'));
      if (cubuk && cap) { cubuk.style.width = cap.style.width || '0%'; const tam = cap.parentElement?.classList.contains('is-full'); cubuk.parentElement.classList.toggle('is-full', !!tam); if (tam) doluVar = true; }
      const simge = tepsi.querySelector(`[data-v3-simge="${k}"]`);
      if (simge && !simge.firstChild) { const kaynakSimge = pill?.querySelector('.res-icon'); if (kaynakSimge) simge.innerHTML = kaynakSimge.innerHTML; }
    }
    $('v3-kaynak-uyari').hidden = !doluVar;

    const botDugme = $('btn-top-taverna-bot-status');
    $('v3-bot').dataset.state = botDugme?.dataset.state || 'off';
    yaz($('v3-bot-metin'), $('top-bot-status-text')?.textContent || 'Bot');

    const rozet = $('notif-badge');
    const n = rozet && rozet.style.display !== 'none' ? (rozet.textContent || '0') : '0';
    $('v3-zil-sayi').hidden = n === '0'; yaz($('v3-zil-sayi'), n);

    // Şimdi ne yapmalı: kralın danışmanının önerisi (eski kart gizli olsa da hesaplanıyor)
    const baslik = $('advisor-title')?.textContent, metin = $('advisor-text')?.textContent;
    const kart = $('v3-simdi');
    if (baslik && metin) {
      kart.hidden = false;
      yaz($('v3-simdi-simge'), $('advisor-avatar')?.textContent || '🧙');
      yaz($('v3-simdi-baslik'), baslik);
      yaz($('v3-simdi-metin'), metin.replace(/\*\*/g, ''));
      yaz($('v3-simdi-dugme'), ($('btn-advisor-action')?.textContent || 'İncele').replace(/^[^\p{L}]+/u, '').trim());
    } else kart.hidden = true;
  }

  window.__v3 = { guncelle: () => guncelle(false), hubAc, panelAc: (id) => hubAc(id) };
  guncelle(true);
}
