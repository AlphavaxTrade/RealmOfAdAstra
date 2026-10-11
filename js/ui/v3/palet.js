// Realm of AdAstra — v3 "Ara ve git" paleti (Ctrl+K) ve klavye kısayolları.
// Komutlar hub listesinden gelir (tek kaynak: hub.js); eski paletin ayrı eylem listesi kaldırıldı.
// Saf kısımlar (komutListesi, komutFiltrele, kisayolHedefi) DOM'a dokunmaz ve testlerde doğrudan içe alınır.
import { HUB, SEKMELER, esc } from './hub.js';

const kucuk = (s) => String(s ?? '').toLocaleLowerCase('tr-TR');

/**
 * Aranabilir komutlar: hub'daki her öğe ("Ara ve git"in kendisi hariç).
 * @param {{testMenusuVar?: boolean, kilit?: (anahtar: string) => ({reason: string}|null)}} secenek
 * @returns {{id: string, simge: string, ad: string, kategori: string, aciklama: string, kilitli: boolean}[]}
 */
export function komutListesi({ testMenusuVar = false, kilit = null } = {}) {
  const liste = [];
  for (const sekme of SEKMELER) {
    const hub = HUB[sekme.id];
    if (!hub) continue;
    for (const o of hub.ogeler) {
      if (o.k === 'komut' || (o.yalnizTest && !testMenusuVar)) continue;
      const kilitli = o.kilit && kilit ? kilit(o.kilit) : null;
      liste.push({
        id: o.k, simge: o.s, ad: o.ad, kategori: hub.baslik[1],
        aciklama: kilitli ? kilitli.reason : o.ac, kilitli: !!kilitli
      });
    }
  }
  return liste;
}

/**
 * Yazılan sözcüklerin hepsini (ad, bölüm ya da açıklamada) içeren komutlar. Sıra: adı yazılanla
 * başlayanlar, adında geçenler, sonra yalnız açıklamada geçenler; kendi içinde liste sırası.
 */
export function komutFiltrele(liste, sorgu) {
  const parcalar = kucuk(sorgu).split(/\s+/).filter(Boolean);
  if (parcalar.length === 0) return liste.slice();
  const bulunan = [];
  liste.forEach((komut, sira) => {
    const ad = kucuk(komut.ad);
    const samanlik = `${ad} ${kucuk(komut.kategori)} ${kucuk(komut.aciklama)}`;
    if (!parcalar.every((p) => samanlik.includes(p))) return;
    const puan = ad.startsWith(parcalar[0]) ? 0 : (parcalar.every((p) => ad.includes(p)) ? 1 : 2);
    bulunan.push({ komut, puan, sira });
  });
  return bulunan.sort((a, b) => a.puan - b.puan || a.sira - b.sira).map((b) => b.komut);
}

// Tek tuşla gidilen yerler (tuş büyük harfle aranır). kaynak: o hammaddenin bölgesi, git: hub öğesi anahtarı
const KAYNAK_TUSLARI = { 1: 'wood', S: 'wood', 2: 'iron', I: 'iron', 3: 'wheat', F: 'wheat' };
const GIT_TUSLARI = { TAB: 'merkez', 4: 'kisla', B: 'kisla', 5: 'pazar', M: 'pazar', 6: 'zindan', D: 'zindan', 7: 'kolezyum', C: 'kolezyum', E: 'profil', K: 'kotalar' };

/**
 * Basılan tuşun hedefi: { palet: true } | { git } | { kaynak } | { kapat: true } | null.
 * Yazı alanında yazarken (ve Ctrl/Alt/Cmd ile birlikte) tek tuşlar çalışmaz; Ctrl+K her yerde çalışır.
 */
export function kisayolHedefi(tus, { ctrl = false, meta = false, alt = false, yaziAlani = false } = {}) {
  const T = String(tus || '').toUpperCase();
  if ((ctrl || meta) && T === 'K') return { palet: true };
  if (yaziAlani || ctrl || meta || alt) return null;
  if (T === 'ESCAPE') return { kapat: true };
  if (GIT_TUSLARI[T]) return { git: GIT_TUSLARI[T] };
  if (KAYNAK_TUSLARI[T]) return { kaynak: KAYNAK_TUSLARI[T] };
  return null;
}

/**
 * Paleti kurar. liste(): güncel komutlar; calistir(id): seçilen komutu çalıştırır (palet önce kapanır).
 * Dönen { ac, kapat, acikMi } klavye ve hub tarafından kullanılır.
 */
export function kurPalet({ liste, calistir }) {
  let kok = null;
  let onceki = null;
  let secili = 0;
  let gorunen = [];

  const kapat = () => {
    if (!kok) return;
    kok.remove();
    kok = null;
    if (onceki && onceki.isConnected) { try { onceki.focus(); } catch { /* odak verilemedi */ } }
    onceki = null;
  };

  const ciz = (sorgu) => {
    gorunen = komutFiltrele(liste(), sorgu);
    secili = Math.min(secili, Math.max(0, gorunen.length - 1));
    const alan = kok.querySelector('.v3-palet-liste');
    alan.innerHTML = gorunen.length === 0
      ? '<div class="v3-palet-bos">Eşleşen yer bulunamadı.</div>'
      : gorunen.map((k, i) => `<button type="button" class="v3-palet-oge${i === secili ? ' is-aktif' : ''}${k.kilitli ? ' is-kilitli' : ''}" role="option" aria-selected="${i === secili}" data-palet-id="${esc(k.id)}">
          <span class="v3-palet-simge" aria-hidden="true">${esc(k.simge)}</span>
          <span class="v3-palet-metin"><b>${esc(k.ad)}</b><small>${k.kilitli ? '🔒 ' : ''}${esc(k.aciklama)}</small></span>
          <span class="v3-palet-kategori">${esc(k.kategori)}</span></button>`).join('');
    const aktif = alan.querySelector('.is-aktif');
    if (aktif && aktif.scrollIntoView) aktif.scrollIntoView({ block: 'nearest' });
  };

  const sec = (id) => {
    kapat();
    calistir(id);
  };

  const ac = () => {
    kapat();
    onceki = document.activeElement;
    secili = 0;
    kok = document.createElement('div');
    kok.id = 'v3-palet';
    kok.className = 'v3-palet';
    kok.setAttribute('role', 'dialog');
    kok.setAttribute('aria-modal', 'true');
    kok.setAttribute('aria-label', 'Ara ve git');
    kok.innerHTML = `<div class="v3-palet-kutu">
      <input type="text" class="v3-palet-girdi" placeholder="🔍 Nereye gitmek istiyorsun? (Esc ile kapat)" aria-label="Ara ve git" autocomplete="off" spellcheck="false">
      <div class="v3-palet-liste" role="listbox"></div></div>`;
    document.body.appendChild(kok);

    const girdi = kok.querySelector('.v3-palet-girdi');
    girdi.focus();
    ciz('');

    girdi.addEventListener('input', () => { secili = 0; ciz(girdi.value); });
    girdi.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); secili = Math.min(gorunen.length - 1, secili + 1); ciz(girdi.value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); secili = Math.max(0, secili - 1); ciz(girdi.value); }
      else if (e.key === 'Enter') { e.preventDefault(); if (gorunen[secili]) sec(gorunen[secili].id); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); kapat(); }
    });
    kok.addEventListener('click', (e) => {
      const oge = e.target.closest('[data-palet-id]');
      if (oge) { e.stopPropagation(); sec(oge.dataset.paletId); return; }
      if (e.target === kok) kapat();
    });
  };

  return { ac, kapat, acikMi: () => !!kok };
}
