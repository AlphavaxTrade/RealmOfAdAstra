// Realm of AdAstra — açılış yükleme perdesi: ilerleme çubuğu, dönen sözler ve en geç 1,2 saniyede kapanma.
// Harita sahneleri ilerlemeyi window.__updateLoadingBar / window.__finishLoadingBar üzerinden bildirir.

const SOZLER = [
  'Zümrüt meşeler ve kadim ormanlar filizleniyor...',
  'Dağ madenleri ve derin demir damarları kazılıyor...',
  'Büyük Kolezyum ve gladyatör arenası kuruluyor...',
  'Zindan mağarası ve canavarlar uyanıyor...'
];
const SOZ_ESIKLERI = [0, 30, 60, 85];   // yüzde bu değeri geçince karşılığı olan söz gösterilir
const EN_GEC_MS = 1200;

/** Sözün sırası: yüzdeye göre 0-3 (saf; testlerde doğrudan içe alınır). */
export function sozSirasi(yuzde) {
  let sira = 0;
  SOZ_ESIKLERI.forEach((esik, i) => { if (yuzde > esik) sira = i; });
  return sira;
}

/** @param {{perde: Element|null, dolgu: Element|null, yuzde: Element|null, soz: Element|null}} el */
export function kurYukleme({ perde, dolgu, yuzde, soz }) {
  let ilerleme = 0;
  let gosterilenSoz = 0;

  const guncelle = (deger) => {
    if (!dolgu || !yuzde) return;
    ilerleme = Math.max(ilerleme, Math.min(Math.floor(deger), 99));
    dolgu.style.width = `${ilerleme}%`;
    yuzde.textContent = `%${ilerleme}`;
    const sira = sozSirasi(ilerleme);
    if (soz && sira > gosterilenSoz) { gosterilenSoz = sira; soz.textContent = SOZLER[sira]; }
  };

  // Görsel ilerleme: gerçek yükleme olayları gelmese de çubuk %90'a yürür
  const sayac = setInterval(() => {
    ilerleme += Math.floor(Math.random() * 15) + 10;
    if (ilerleme >= 90) { ilerleme = 90; clearInterval(sayac); }
    guncelle(ilerleme);
  }, 100);

  const bitir = () => {
    clearInterval(sayac);
    if (dolgu) dolgu.style.width = '100%';
    if (yuzde) yuzde.textContent = '%100';
    setTimeout(() => { if (perde) perde.classList.add('hidden'); }, 250);
  };

  window.__updateLoadingBar = guncelle;
  window.__finishLoadingBar = bitir;
  setTimeout(bitir, EN_GEC_MS);   // güvenlik: her durumda 1,2 saniyede perde açılır

  return { guncelle, bitir };
}
