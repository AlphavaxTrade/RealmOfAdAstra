// Realm of AdAstra — v3 Krallık Yolu (öğretici) ekranı parçaları. Saf HTML üreticileri: DOM'a ve oyun durumuna dokunmaz,
// her metni kaçırır. Düğmeler: [data-claim-quest], [data-claim-section], [data-ogretici-goster] (app.js dinler).
import { esc } from './hub.js';

const f0 = (v) => Number(v || 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

// Görev satırı: yapıldıysa ödülü al, yapılmadıysa "Bana göster" (kilitliyse nedeni)
export function gorevSatiriHtml(q, kilit = null) {
  let sag;
  if (q.claimed) sag = '<span class="v3-yol-tik" aria-label="Ödülü alındı">✅</span>';
  else if (q.done) sag = `<button type="button" class="v3-birincil" data-claim-quest="${esc(q.id)}">+${f0(q.rewardAda)} ASTRA al</button>`;
  else if (kilit) sag = `<span class="v3-yol-kilit">🔒 ${esc(kilit)}</span>`;
  else sag = `<button type="button" class="v3-yol-goster" data-ogretici-goster="${esc(q.show || '')}">Bana göster</button>`;
  const odul = q.claimed || q.done ? '' : `<small class="v3-yol-odul">+${f0(q.rewardAda)} ASTRA</small>`;
  return `<li class="v3-yol-gorev${q.done ? ' is-done' : ''}${q.claimed ? ' is-claimed' : ''}">
    <span class="v3-yol-simge" aria-hidden="true">${esc(q.claimed ? '✅' : q.icon)}</span>
    <span class="v3-yol-metin"><b>${esc(q.title)}</b><small>${esc(q.desc)}</small>${odul}</span>
    <span class="v3-yol-sag">${sag}</span>
  </li>`;
}

// Bir bölümün kartı (katlanır). acik: ilk açılışta açık mı
export function bolumHtml(b, kilitOf = () => null, acik = false) {
  const rozet = b.claimed ? '🏅' : (b.claimable ? '🎁' : '');
  const alt = b.claimed ? 'Bölüm tamam' : `${b.doneCount}/${b.total} görev · bölüm ödülü +${f0(b.bonusAda)} ASTRA`;
  const yuzde = b.total ? Math.round((b.doneCount / b.total) * 100) : 0;
  const talep = b.claimable
    ? `<button type="button" class="v3-birincil v3-yol-bolum-al" data-claim-section="${esc(b.id)}">🎁 Bölüm ödülünü al (+${f0(b.bonusAda)} ASTRA)</button>`
    : '';
  return `<details class="v3-yol-bolum${b.claimed ? ' is-claimed' : ''}"${acik ? ' open' : ''}>
    <summary><span class="v3-yol-simge" aria-hidden="true">${esc(b.icon)}</span>
      <span class="v3-yol-metin"><b>${esc(b.title)}</b><small>${esc(alt)}</small></span>
      <span class="v3-yol-rozet" aria-hidden="true">${rozet}</span></summary>
    <div class="v3-yol-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${yuzde}"><i style="width:${yuzde}%"></i></div>
    <ul class="v3-yol-liste">${b.tasks.map((q) => gorevSatiriHtml(q, q.done ? null : kilitOf(q))).join('')}</ul>
    ${talep}
  </details>`;
}

// Panelin tamamı: üstte ilerleme ve sıradaki görev, sonra bölümler, en altta final
export function yolHtml({ sections, final }, kilitOf = () => null) {
  const toplam = sections.reduce((s, b) => s + b.total, 0);
  const biten = sections.reduce((s, b) => s + b.doneCount, 0);
  const bolumBiten = sections.filter((b) => b.claimed).length;
  const yuzde = toplam ? Math.round((biten / toplam) * 100) : 0;
  let siradaki = null;
  for (const b of sections) {
    const q = b.tasks.find((x) => !x.done);
    if (q) { siradaki = q; break; }
  }
  const hazirOdul = sections.reduce((s, b) => s + b.tasks.filter((q) => q.done && !q.claimed).length, 0)
    + sections.filter((b) => b.claimable).length;
  const ust = `<div class="v3-yol-ust">
      <div class="v3-yol-baslik"><b>🧭 Krallık Yolu</b><span>${biten}/${toplam} görev · ${bolumBiten}/${sections.length} bölüm</span></div>
      <div class="v3-yol-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${yuzde}"><i style="width:${yuzde}%"></i></div>
      ${hazirOdul > 0 ? `<div class="v3-yol-hazir">🎁 ${hazirOdul} ödül almaya hazır</div>` : ''}
    </div>`;
  const sirada = siradaki
    ? `<div class="v3-yol-sirada"><small>SIRADAKİ GÖREV</small><ul class="v3-yol-liste">${gorevSatiriHtml(siradaki, kilitOf(siradaki))}</ul></div>`
    : '<div class="v3-yol-sirada"><b>Bütün görevleri tamamladın.</b><small>Krallığın yolu açık, hükümdarım!</small></div>';
  const acikBolum = (sections.find((b) => !b.claimed) || {}).id;
  const finalHtml = final
    ? `<div class="v3-yol-final${final.claimed ? ' is-claimed' : ''}">
        <span class="v3-yol-simge" aria-hidden="true">${esc(final.icon)}</span>
        <span class="v3-yol-metin"><b>${esc(final.title)}</b><small>${final.claimed ? 'Unvanı kazandın.' : `Bütün bölüm ödüllerini alınca açılır · +${f0(final.bonusAda)} ASTRA`}</small></span>
        ${final.ready && !final.claimed ? `<button type="button" class="v3-birincil" data-claim-section="${esc(final.id)}">Unvanı al</button>` : ''}
      </div>`
    : '';
  return `<div class="v3-yol">${ust}${sirada}${sections.map((b) => bolumHtml(b, kilitOf, b.id === acikBolum)).join('')}${finalHtml}</div>`;
}

// Dock'taki küçük rehber kutusu için: sıradaki görev ve hazır ödül sayısı
export function yolOzeti({ sections }) {
  const toplam = sections.reduce((s, b) => s + b.total, 0);
  const biten = sections.reduce((s, b) => s + b.doneCount, 0);
  let siradaki = null;
  for (const b of sections) { const q = b.tasks.find((x) => !x.done); if (q) { siradaki = q; break; } }
  const hazir = sections.reduce((s, b) => s + b.tasks.filter((q) => q.done && !q.claimed).length, 0) + sections.filter((b) => b.claimable).length;
  return { toplam, biten, hazir, siradaki };
}
