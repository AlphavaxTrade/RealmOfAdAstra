// Realm of AdAstra — ekran çekirdeği.
// Tek panele (#rpg-modal) ekran açan, tıklamaları ekranın eylemlerine dağıtan ve açık panelde sayaçları yenileyen katman.
//
// Bir EKRAN şu şekilde tanımlanır (js/ui/ekran/*.js):
//   {
//     id: 'silo',
//     kilit: 'warehouse',                         // isteğe bağlı: gameState.getFeatureLock anahtarı
//     baslik: (b, secenek) => ['📦', 'Silo ve depo'],
//     govde: (b, secenek) => '<div class="ek">…</div>',      // SAF: yalnız metin üretir, DOM'a dokunmaz
//     eylemler: { yukselt: (b, el, secenek) => … },          // HTML'de data-e="yukselt"
//     degisimler: { sirala: (b, el, secenek) => … },         // HTML'de data-e-degis="sirala" (select/input, change olayı)
//     girdiler: { adet: (b, el, secenek, kok) => … },        // HTML'de data-e-girdi="adet" (input olayı; yeniden çizilmez)
//     sonra: (b, secenek, kok) => …                          // her çizimden sonra (eşzamansız veri yüklemek için)
//     canliYenile: true,                                     // panel açıkken saniyede bir gövde hesaplanır, değiştiyse yeniden çizilir
//     canli: (kok, b, secenek) => …                          // ya da: panel açıkken saniyede bir elle hafif güncelleme
//     goruldu: 'merkez' | (b, secenek) => 'ilan' | ['a', 'b'] | null   // Krallık Yolu: ekranın açıldığını öğreticiye bildirir (b.goruldu)
//   }
// Eylem sonrası ekran yeniden çizilir (kaydırma ve açık <details> bölümleri korunur); eylem false döndürürse çizilmez,
// { git: 'ekranId', secenek } döndürürse o ekrana geçilir, { kapat: true } paneli kapatır.
//
// Bağlam (b): oyun nesneleri ve arayüz işlevleri tek yerde; app.js bir kez verir. Ekranlar başka bir şeye dokunmaz.

import { esc } from '../v3/hub.js';
export { esc };

const KAYIT = new Map();
let baglam = null;
let aktif = null;                       // { ekran, secenek, sonHtml }
const acikDetaylar = new Set();         // kullanıcının açtığı <details> bölümleri: "ekranId|anahtar"
let kokBagli = null;

// ── Kayıt ve bağlam ──────────────────────────────────────────────────────
export function ekranKaydet(ekran) {
  if (!ekran || !ekran.id) throw new Error('ekranın kimliği yok');
  KAYIT.set(ekran.id, ekran);
  return ekran;
}
export const ekranlar = () => [...KAYIT.values()];
export const ekranVar = (id) => KAYIT.has(id);

// b: { gameState, GAME_CONFIG, globalPool, ammMarket, treasury, online, bildir(m, tur), hudYenile(), panelYaz([simge, ad], html), panelAcik(),
//      panelKok(): HTMLElement, panelKapat(), kilit(anahtar): {name, reason}|null }
export function baglamKur(b) {
  baglam = b;
  kokBagli = null;
}
export const baglamAl = () => baglam;
export const aktifEkran = () => (aktif ? aktif.ekran.id : null);

// ── Açma ve çizme ────────────────────────────────────────────────────────
// Ekranı açar. Kilitliyse nedenini bildirir ve false döner.
export function ac(id, secenek = {}) {
  const ekran = KAYIT.get(id);
  const b = baglam;
  if (!ekran) {
    // Henüz yeni ekrana taşınmamış bölümler eski açıcıya düşer (taşıma süresince)
    if (b.eskiAc && b.eskiAc(id, secenek)) return true;
    throw new Error(`bilinmeyen ekran: ${id}`);
  }
  if (ekran.kilit && b.kilit) {
    const k = b.kilit(ekran.kilit);
    if (k) { b.bildir(`🔒 ${k.name} henüz kapalı: ${k.reason}`, 'info'); return false; }
  }
  aktif = { ekran, secenek, sonHtml: '' };
  ciz(true);
  return true;
}

export function yenile() {
  if (aktif) ciz(false);
}

export function kapat() {
  aktif = null;
}

// Panelde hâlâ bu ekranın içeriği duruyor mu? (eski açıcılar ya da başka ekranlar paneli değiştirmiş olabilir)
function gecerliMi(kok) {
  if (!aktif) return false;
  const ilk = kok.firstElementChild;
  if (ilk && ilk.dataset.ekran === aktif.ekran.id) return true;
  aktif = null;
  return false;
}

function ciz(yeniEkran, html = null) {
  const { ekran, secenek } = aktif;
  const b = baglam;
  const kok = b.panelKok();
  const kaydirma = yeniEkran ? 0 : kok.scrollTop;

  // Girdi odağı ve değeri korunur (örn. miktar kutusu): aynı kimlikli öğe yeniden yazılınca geri konur
  const odak = document.activeElement && kok.contains(document.activeElement) ? document.activeElement : null;
  const odakKimligi = odak && odak.id ? odak.id : null;
  const odakDegeri = odak && 'value' in odak ? odak.value : null;

  const govde = html == null ? ekran.govde(b, secenek) : html;
  aktif.sonHtml = govde;
  b.panelYaz(ekran.baslik(b, secenek), govde);
  if (kok.firstElementChild) kok.firstElementChild.dataset.ekran = ekran.id;   // başka bir açıcı paneli değiştirirse fark edilir

  // <details data-k="..."> bölümleri: kullanıcının açtığı açık kalır
  for (const d of kok.querySelectorAll('details[data-k]')) {
    const anahtar = `${ekran.id}|${d.dataset.k}`;
    if (acikDetaylar.has(anahtar)) d.open = true;
  }
  kok.scrollTop = kaydirma;
  if (odakKimligi) {
    const yeni = kok.querySelector(`#${CSS.escape(odakKimligi)}`);
    if (yeni) {
      if (odakDegeri != null && 'value' in yeni) yeni.value = odakDegeri;
      yeni.focus({ preventScroll: true });
    }
  }
  baglaKok(kok);
  gorulduBildir(ekran, b, secenek);
  if (ekran.sonra) {
    const bu = aktif;
    Promise.resolve().then(() => { if (aktif === bu) return ekran.sonra(b, secenek, kok); return undefined; })
      .catch((e) => console.warn('Ekran sonra kancası hata verdi:', e));
  }
}

// Öğretici "gördü" anahtarları: ekran her çizildiğinde (sekme değişince de) bildirilir; tekrarı bağlam eler
function gorulduBildir(ekran, b, secenek) {
  if (!ekran.goruldu || !b.goruldu) return;
  try {
    const anahtar = typeof ekran.goruldu === 'function' ? ekran.goruldu(b, secenek) : ekran.goruldu;
    for (const a of [].concat(anahtar || [])) b.goruldu(a);
  } catch (e) {
    console.warn('Öğretici kancası çalışmadı:', e);
  }
}

// Panel kökünde tek tek dinleyici: tıklama, değişim ve <details> açılıp kapanması
function baglaKok(kok) {
  if (kokBagli === kok) return;
  kokBagli = kok;

  // Eski pencere kodu içerideki tıklamaları durduruyordu; bu yüzden yakalama aşamasında dinlenir
  kok.addEventListener('click', (ev) => {
    if (!gecerliMi(kok)) return;
    const el = ev.target.closest('[data-e]');
    if (!el || !kok.contains(el)) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const fn = aktif.ekran.eylemler && aktif.ekran.eylemler[el.dataset.e];
    if (!fn) return;
    ev.stopPropagation();
    ev.preventDefault();
    calistir(fn, el);
  }, true);

  kok.addEventListener('change', (ev) => {
    if (!gecerliMi(kok)) return;
    const el = ev.target.closest('[data-e-degis]');
    if (!el || !kok.contains(el)) return;
    const fn = aktif.ekran.degisimler && aktif.ekran.degisimler[el.dataset.eDegis];
    if (!fn) return;
    ev.stopPropagation();
    calistir(fn, el);
  }, true);

  kok.addEventListener('input', (ev) => {
    if (!gecerliMi(kok)) return;
    const el = ev.target.closest('[data-e-girdi]');
    if (!el || !kok.contains(el)) return;
    const fn = aktif.ekran.girdiler && aktif.ekran.girdiler[el.dataset.eGirdi];
    if (!fn) return;
    try { fn(baglam, el, aktif.secenek, kok); } catch (e) { console.warn('Girdi işleyicisi hata verdi:', e); }
  }, true);

  kok.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!aktif || !d.matches || !d.matches('details[data-k]')) return;
    const anahtar = `${aktif.ekran.id}|${d.dataset.k}`;
    if (d.open) acikDetaylar.add(anahtar); else acikDetaylar.delete(anahtar);
  }, true);
}

async function calistir(fn, el) {
  const b = baglam;
  const ekran = aktif.ekran;
  let sonuc;
  try {
    sonuc = await fn(b, el, aktif.secenek);
  } catch (e) {
    console.error('Ekran eylemi hata verdi:', e);
    b.bildir('Bu işlem tamamlanamadı. Lütfen tekrar dene.', 'error');
    return;
  }
  if (!aktif || aktif.ekran !== ekran) return;   // eylem başka ekrana geçtiyse ya da kapattıysa
  if (sonuc === false) return;
  b.hudYenile();
  // Eylem sırasında panel kapandıysa (örn. öğretici turu kapattı) yeniden açılmaz
  if (b.panelAcik && !b.panelAcik()) { aktif = null; return; }
  if (sonuc && typeof sonuc === 'object' && sonuc.kapat) {
    aktif = null;
    if (b.panelKapat) b.panelKapat();
    return;
  }
  if (sonuc && typeof sonuc === 'object' && sonuc.git) {
    ac(sonuc.git, sonuc.secenek || {});
    return;
  }
  ciz(false);
}

// Saniyede bir çağrılır (app.js oyun döngüsü): açık ekranın canlı güncellemesi
export function canliTik() {
  if (!aktif) return;
  const b = baglam;
  const kok = b.panelKok();
  if (!kok || !gecerliMi(kok)) return;
  if (b.panelAcik && !b.panelAcik()) { aktif = null; return; }
  try {
    // canliYenile: gövde yalnız içerik değişmişse yeniden çizilir (dokunma sırasında düğme yerinden oynamasın)
    if (aktif.ekran.canliYenile) {
      const odakta = document.activeElement && kok.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (!odakta) {
        const html = aktif.ekran.govde(b, aktif.secenek);
        if (html !== aktif.sonHtml) ciz(false, html);
      }
    }
    if (aktif.ekran.canli) aktif.ekran.canli(kok, b, aktif.secenek);
  } catch (e) {
    console.warn('Canlı güncelleme hata verdi:', e);
  }
}

// ── Biçim yardımcıları ───────────────────────────────────────────────────
const TR = 'tr-TR';
export function sayi(v, ondalik = 0) {
  const n = Number(v);
  if (!isFinite(n)) return '0';
  return n.toLocaleString(TR, { minimumFractionDigits: 0, maximumFractionDigits: ondalik });
}
// Aşağı yuvarlanmış tam sayı (miktarları şişirmemek için)
export const tam = (v) => sayi(Math.floor(Number(v) || 0));
// ASTRA tutarı: 1.000 ve üstü ondalıksız, 1 ve üstü 2 ondalık, küçük tutarlar 3 ondalık
export function astra(v) {
  const n = Number(v);
  if (!isFinite(n)) return '0';
  const ondalik = Math.abs(n) >= 1000 ? 0 : (Math.abs(n) >= 1 ? 2 : 3);
  return n.toLocaleString(TR, { minimumFractionDigits: 0, maximumFractionDigits: ondalik });
}
export const yuzde = (oran, ondalik = 0) => `%${sayi((Number(oran) || 0) * 100, ondalik)}`;
export function sure(ms) {
  const sn = Math.max(0, Math.ceil(Number(ms) / 1000) || 0);
  const g = Math.floor(sn / 86400), s = Math.floor((sn % 86400) / 3600), d = Math.floor((sn % 3600) / 60), r = sn % 60;
  if (g > 0) return `${g} gün ${s} sa`;
  if (s > 0) return `${s} sa ${String(d).padStart(2, '0')} dk`;
  return `${String(d).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
export const sinirla = (v, a, c) => Math.max(a, Math.min(c, v));

// ── HTML üreticileri (dinamik metin hep kaçırılır; `icerik` parametreleri hazır HTML'dir) ─────────
const TON = ['iyi', 'uyari', 'kotu'];
const tonSinif = (t, onek = 'is-') => (TON.includes(t) ? ` ${onek}${t}` : '');

export function kap(icerik) {
  return `<div class="ek">${icerik}</div>`;
}

export function kart({ baslik = '', rozet = '', vurgu = '', icerik = '', id = '' } = {}) {
  const ust = baslik || rozet
    ? `<div class="ek-kart-ust">${baslik ? `<h3 class="ek-baslik">${baslik}</h3>` : '<span></span>'}${rozet ? `<span>${rozet}</span>` : ''}</div>`
    : '';
  const sinif = vurgu === 'vurgu' ? ' is-vurgu' : tonSinif(vurgu);
  return `<section class="ek-kart${sinif}"${id ? ` id="${esc(id)}"` : ''}>${ust}${icerik}</section>`;
}

// Katlanır bölüm: anahtar, açık kalma durumunu yeniden çizimlerde korur
export function katli(baslik, icerik, { k, acik = false, rozet = '' } = {}) {
  return `<details class="ek-katli"${k ? ` data-k="${esc(k)}"` : ''}${acik ? ' open' : ''}><summary><span>${baslik}</span>${rozet ? `<span>${rozet}</span>` : ''}</summary><div class="ek-katli-icerik">${icerik}</div></details>`;
}

export function satir(etiket, deger, ton = '') {
  return `<div class="ek-satir${tonSinif(ton)}"><span>${esc(etiket)}</span><b>${esc(deger)}</b></div>`;
}

export function not(metin) {
  return `<p class="ek-not">${metin}</p>`;
}

// yuzdeDeger 0-100; renk: CSS rengi (isteğe bağlı); ton: '' | 'dolu' | 'kotu'
export function cubuk(yuzdeDeger, { renk = '', ton = '' } = {}) {
  const p = sinirla(Number(yuzdeDeger) || 0, 0, 100);
  const sinif = ton === 'dolu' ? ' is-dolu' : (ton === 'kotu' ? ' is-kotu' : '');
  const stil = `--p:${p.toFixed(1)}%${renk ? `;--renk:${esc(renk)}` : ''}`;
  return `<div class="ek-cubuk${sinif}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p)}" style="${stil}"><i></i></div>`;
}

export function cubukSatiri(etiket, degerMetni, yuzdeDeger, secenek) {
  return `<div class="ek-cubuk-satiri"><div class="ek-cubuk-etiket"><span>${etiket}</span><b>${esc(degerMetni)}</b></div>${cubuk(yuzdeDeger, secenek)}</div>`;
}

// e: eylem adı (data-e). veri: { anahtar: değer } → data-anahtar. metin HTML'dir (simge + yazı).
export function dugme({ e = '', metin = '', ton = '', devreDisi = false, veri = {}, genis = false, ipucu = '', id = '' } = {}) {
  const siniflar = ['ek-dugme'];
  if (ton) siniflar.push(`is-${ton}`);   // birincil | iyi | tehlike | hayalet
  if (genis) siniflar.push('is-tam');
  const veriler = Object.entries(veri).map(([k, v]) => ` data-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${esc(v)}"`).join('');
  return `<button type="button" class="${siniflar.join(' ')}"${e ? ` data-e="${esc(e)}"` : ''}${id ? ` id="${esc(id)}"` : ''}${veriler}${devreDisi ? ' disabled' : ''}${ipucu ? ` title="${esc(ipucu)}"` : ''}>${metin}</button>`;
}

export function dugmeler(...liste) {
  return `<div class="ek-dugmeler">${liste.join('')}</div>`;
}

// ton: '' (bilgi) | 'iyi' | 'uyari' | 'kotu'
export function uyari(metin, ton = '', simge = '') {
  const s = simge || ({ iyi: '✅', uyari: '⚠️', kotu: '⛔' }[ton] || 'ℹ️');
  return `<div class="ek-uyari${tonSinif(ton)}" role="${ton === 'kotu' ? 'alert' : 'status'}"><span aria-hidden="true">${s}</span><span>${metin}</span></div>`;
}

export function bos(simge, baslik, metin = '') {
  return `<div class="ek-bos"><span aria-hidden="true">${esc(simge)}</span><b>${esc(baslik)}</b>${metin ? `<small>${esc(metin)}</small>` : ''}</div>`;
}

export function sekmeler(liste, aktifId, eylem) {
  return `<div class="ek-sekmeler" role="tablist">${liste.map((s) =>
    `<button type="button" role="tab" aria-selected="${s.id === aktifId}" class="ek-sekme${s.id === aktifId ? ' is-aktif' : ''}" data-e="${esc(eylem)}" data-sekme="${esc(s.id)}">${s.simge ? `<span aria-hidden="true">${esc(s.simge)}</span>` : ''}<span>${esc(s.ad)}</span></button>`
  ).join('')}</div>`;
}

export function izgara(ogeler, { kolon = '', genis = false } = {}) {
  const sinif = `ek-izgara${kolon === 2 ? ' is-2' : ''}${genis ? ' is-genis' : ''}`;
  return `<div class="${sinif}">${ogeler.join('')}</div>`;
}

export function hucre(etiket, deger, ton = '') {
  return `<div class="ek-hucre"><small>${esc(etiket)}</small><b${ton ? ` class="ek-${ton === 'iyi' ? 'iyi' : ton === 'uyari' ? 'uyari-renk' : 'kotu'}"` : ''}>${esc(deger)}</b></div>`;
}

export function etiket(metin, ton = '') {
  return `<span class="ek-etiket${tonSinif(ton)}${ton === 'vurgu' ? ' is-vurgu' : ''}">${esc(metin)}</span>`;
}

// Simge kutusu: icerik hazır HTML (resim ya da emoji)
export function simge(icerik, kucuk = false) {
  return `<span class="ek-simge${kucuk ? ' is-kucuk' : ''}" aria-hidden="true">${icerik}</span>`;
}
