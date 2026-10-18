// Realm of AdAstra — Pazar fiyat grafiği (19 Ekim 2026): seçili varlığın fiyatı coin grafiği gibi çizilir.
// Saf HTML üretir (SVG çizgi + alan); veri js/economy/fiyatGecmisi.js biçimindedir: { points: [[zamanMs, fiyat], ...], acilis, kapanis, enYuksek, enDusuk, degisimYuzde }.
import { kart, bos, etiket, sayi, esc } from './cekirdek.js';

export const GRAFIK_ARALIKLARI = [{ id: '24s', ad: '24 saat' }, { id: '7g', ad: '7 gün' }, { id: '30g', ad: '30 gün' }];

const G = 640, Y = 200, SOL = 6, SAG = 6, UST = 12, ALT = 14;

// Fiyat en az 4 anlamlı basamakla yazılır (0,009 ASTRA'lık bir eşyada %1'lik değişim görünsün): 1.234,5 · 12,345 · 0,02850 · 0,009000
export function fiyatYaz(f) {
  if (!(f > 0)) return '0';
  const d = f >= 1000 ? 1 : f >= 1 ? 3 : Math.min(8, 3 - Math.floor(Math.log10(f)));
  return Number(f).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function zamanYaz(ms) {
  const d = new Date(ms);
  return `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

// Seri → ekran koordinatı: SVG çizimi ve gezdirme (ipucu) aynı ölçeği kullanır, böylece nokta ve çizgi birebir oturur
export function olcek(veri) {
  const n = veri.points;
  const t0 = n[0][0], t1 = n[n.length - 1][0];
  const min = veri.enDusuk, max = veri.enYuksek;
  const pay = (max - min) || Math.max(max * 0.02, 1e-9);   // düz seride çizgi ortada durur
  const alt = min - pay * 0.08, ust = max + pay * 0.08;
  const x = t => SOL + (t1 === t0 ? (G - SOL - SAG) / 2 : ((t - t0) / (t1 - t0)) * (G - SOL - SAG));
  const y = p => UST + (1 - (p - alt) / (ust - alt)) * (Y - UST - ALT);
  return { x, y, t0, t1 };
}

// Gezdirme: yatay konuma (0-1, grafik genişliğine oranla) en yakın noktayı bulur; ipucu çizgisi/noktası için yüzde konumlarını verir
export function noktaBul(veri, oran) {
  const n = veri.points;
  const { x, y } = olcek(veri);
  const hedefX = Math.min(1, Math.max(0, oran)) * G;
  let en = 0, fark = Infinity;
  for (let i = 0; i < n.length; i++) {
    const f = Math.abs(x(n[i][0]) - hedefX);
    if (f < fark) { fark = f; en = i; }
  }
  const [t, p] = n[en];
  return { indeks: en, zaman: t, fiyat: p, xYuzde: (x(t) / G) * 100, yYuzde: (y(p) / Y) * 100,
    degisimYuzde: veri.acilis > 0 ? ((p - veri.acilis) / veri.acilis) * 100 : 0 };
}

// Çizgi + alan SVG'si. Tek nokta varsa düz çizgi çizilir.
export function grafikSvg(veri) {
  const n = veri.points;
  const artti = veri.degisimYuzde >= 0;
  const renk = artti ? 'var(--v3-iyi, #43d19a)' : 'var(--v3-kotu, #f06868)';
  const { x, y, t0 } = olcek(veri);
  const cizgi = n.length === 1
    ? `M${SOL},${y(n[0][1]).toFixed(1)} L${G - SAG},${y(n[0][1]).toFixed(1)}`
    : n.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const sonX = n.length === 1 ? G - SAG : x(n[n.length - 1][0]);
  const alan = `${cizgi} L${sonX.toFixed(1)},${Y - ALT} L${(n.length === 1 ? SOL : x(t0)).toFixed(1)},${Y - ALT} Z`;
  const izgara = [0.25, 0.5, 0.75].map(f => `<line x1="${SOL}" x2="${G - SAG}" y1="${(UST + f * (Y - UST - ALT)).toFixed(1)}" y2="${(UST + f * (Y - UST - ALT)).toFixed(1)}" stroke="currentColor" stroke-opacity=".12" stroke-dasharray="3 5"/>`).join('');
  const sonY = y(n[n.length - 1][1]).toFixed(1);
  const kimlik = 'fg' + (artti ? 'a' : 'k');
  return `<svg class="ek-fgrafik" viewBox="0 0 ${G} ${Y}" preserveAspectRatio="none" role="img" aria-label="${esc(veri.name || veri.key)} fiyat grafiği: ${esc(fiyatYaz(veri.acilis))} → ${esc(fiyatYaz(veri.kapanis))} ASTRA">
    <defs><linearGradient id="${kimlik}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${renk}" stop-opacity=".32"/><stop offset="1" stop-color="${renk}" stop-opacity="0"/></linearGradient></defs>
    ${izgara}
    <path d="${alan}" fill="url(#${kimlik})"/>
    <path d="${cizgi}" fill="none" stroke="${renk}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${sonX.toFixed(1)}" cy="${sonY}" r="3.6" fill="${renk}"/>
  </svg>`;
}

const hucreKucuk = (ad, deger, sinif = '') => `<div class="ek-hucre"><small>${esc(ad)}</small><b${sinif ? ` class="${sinif}"` : ''}>${esc(deger)}</b></div>`;

// Kart: aralık düğmeleri + grafik + özet. durum: 'yukleniyor' | 'hata' | undefined (veri var)
export function grafikKarti({ ad, aralik, veri, durum }) {
  const dugmeler = `<div class="ek-sekmeler" role="tablist">${GRAFIK_ARALIKLARI.map(a =>
    `<button type="button" role="tab" aria-selected="${a.id === aralik}" class="ek-sekme${a.id === aralik ? ' is-aktif' : ''}" data-e="grafikAralik" data-aralik="${esc(a.id)}">${esc(a.ad)}</button>`).join('')}</div>`;
  let govde;
  if (durum === 'yukleniyor') govde = bos('📈', 'Fiyat geçmişi yükleniyor…');
  else if (durum === 'hata' || !veri || !veri.points || !veri.points.length) govde = bos('📈', 'Bu varlık için henüz fiyat geçmişi yok. İşlem yapıldıkça birikir.');
  else {
    const d = veri.degisimYuzde;
    const artti = d >= 0;
    const ilk = veri.points[0][0], son = veri.points[veri.points.length - 1][0];
    govde = `<div class="ek-fgrafik-ust"><b class="ek-fgrafik-fiyat">${esc(fiyatYaz(veri.kapanis))} <small>ASTRA</small></b>
        ${etiket(`${artti ? '▲' : '▼'} %${sayi(Math.abs(d), 2)}`, artti ? 'iyi' : 'kotu')}</div>
      <div class="ek-fgrafik-kap" tabindex="0" data-fg="${esc(JSON.stringify({ p: veri.points, a: veri.acilis, y: veri.enYuksek, d: veri.enDusuk, k: veri.kapanis, dy: veri.degisimYuzde }))}" aria-label="Fiyatı görmek için grafiğin üzerinde gezin ya da sağ-sol ok tuşlarını kullan">
        ${grafikSvg(veri)}
        <div class="ek-fgrafik-cizgi" hidden></div><div class="ek-fgrafik-nokta" hidden></div>
        <div class="ek-fgrafik-ipucu" hidden role="status"><b></b><small></small><em></em></div>
      </div>
      <div class="ek-fgrafik-zaman"><span>${esc(zamanYaz(ilk))}</span><span>${esc(zamanYaz(son))}</span></div>
      <div class="ek-izgara is-2">${hucreKucuk('Açılış', fiyatYaz(veri.acilis))}${hucreKucuk('En yüksek', fiyatYaz(veri.enYuksek), 'ek-iyi')}${hucreKucuk('En düşük', fiyatYaz(veri.enDusuk), 'ek-kotu')}${hucreKucuk('Şimdi', fiyatYaz(veri.kapanis))}</div>`;
  }
  return kart({ baslik: `📈 ${esc(ad)} fiyat grafiği`, icerik: dugmeler + govde });
}

// ── Gezdirme: fare ya da parmakla grafiğin üzerinde gezinince o anın fiyatı (trade uygulamasındaki gibi) ──
// Ekran her çizildiğinde (ekranın `sonra` kancası) çağrılır; yeni çizilen kapsayıcılara bir kez bağlanır. Dikey kaydırma bozulmaz (touch-action: pan-y).
export function grafikEtkilesimiKur(kok) {
  if (!kok || !kok.querySelectorAll) return;
  for (const kap of kok.querySelectorAll('.ek-fgrafik-kap')) {
    if (kap._fgBagli) continue;
    kap._fgBagli = true;
    let veri;
    try {
      const d = JSON.parse(kap.dataset.fg);
      veri = { points: d.p, acilis: d.a, enYuksek: d.y, enDusuk: d.d, kapanis: d.k, degisimYuzde: d.dy };
    } catch { continue; }
    if (!veri.points || !veri.points.length) continue;
    const cizgi = kap.querySelector('.ek-fgrafik-cizgi'), nokta = kap.querySelector('.ek-fgrafik-nokta'), ipucu = kap.querySelector('.ek-fgrafik-ipucu');
    const [fiyatEl, zamanEl, degisimEl] = [ipucu.querySelector('b'), ipucu.querySelector('small'), ipucu.querySelector('em')];
    let aktifIndeks = -1;
    const goster = (r) => {
      aktifIndeks = r.indeks;
      cizgi.style.left = `${r.xYuzde}%`;
      nokta.style.left = `${r.xYuzde}%`; nokta.style.top = `${r.yYuzde}%`;
      fiyatEl.textContent = `${fiyatYaz(r.fiyat)} ASTRA`;
      zamanEl.textContent = zamanYaz(r.zaman);
      degisimEl.textContent = `${r.degisimYuzde >= 0 ? '▲' : '▼'} %${sayi(Math.abs(r.degisimYuzde), 2)} (açılışa göre)`;
      degisimEl.className = r.degisimYuzde >= 0 ? 'ek-iyi' : 'ek-kotu';
      for (const e of [cizgi, nokta, ipucu]) e.hidden = false;
      // Balon kenara taşmasın: merkez konumu iki yandan 20 %-80 arasına sıkıştırılır
      ipucu.style.left = `${Math.min(80, Math.max(20, r.xYuzde))}%`;
    };
    const gizle = () => { aktifIndeks = -1; for (const e of [cizgi, nokta, ipucu]) e.hidden = true; };
    const konumdan = (ev) => {
      const k = kap.getBoundingClientRect();
      if (!(k.width > 0)) return;
      goster(noktaBul(veri, (ev.clientX - k.left) / k.width));
    };
    kap.addEventListener('pointerdown', konumdan);
    kap.addEventListener('pointermove', konumdan);
    kap.addEventListener('pointerleave', (ev) => { if (ev.pointerType !== 'touch') gizle(); });
    kap.addEventListener('pointerup', (ev) => { if (ev.pointerType === 'touch') setTimeout(gizle, 1200); });   // parmak kalkınca değer kısa süre görünür kalır
    kap.addEventListener('pointercancel', gizle);
    kap.addEventListener('blur', gizle);
    kap.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      const n = veri.points.length;
      const hedef = Math.min(n - 1, Math.max(0, (aktifIndeks < 0 ? n - 1 : aktifIndeks) + (ev.key === 'ArrowRight' ? 1 : -1)));
      const { x } = olcek(veri);
      goster(noktaBul(veri, x(veri.points[hedef][0]) / G));
    });
  }
}
