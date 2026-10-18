// Realm of AdAstra — "Yeni sürüm geldi" bildirimi: oyuncunun son gördüğü sürüm tarayıcıda tutulur; güncelleme günlüğünde (CHANGELOG,
// eskiden yeniye sıralı) ondan yeni bir sürüm varsa zil panelinde bir bildirim ve "Oku" düğmesi çıkar. Düğme Sürüm geçmişi ekranını
// açar; ekran açılınca (ya da bildirim temizlenince) sürüm "görüldü" sayılır, bir daha çıkmaz.
export const SURUM_ANAHTARI = 'roa_son_gorulen_surum';

function oku(depo) {
  try { return depo.getItem(SURUM_ANAHTARI); } catch { return null; }
}

function yaz(depo, surum) {
  try { depo.setItem(SURUM_ANAHTARI, surum); } catch { /* depo kapalı: bildirim her açılışta çıkar, oyun bozulmaz */ }
}

/** Son görülenden sonraki sürümler (eskiden yeniye). Görülen sürüm günlükte yoksa hepsi yeni sayılır. */
export function yeniSurumler(changelog, sonGorulen) {
  const liste = Array.isArray(changelog) ? changelog : [];
  const sira = sonGorulen ? liste.findIndex((k) => k.version === sonGorulen) : -1;
  return liste.slice(sira + 1);
}

/**
 * Açılışta gösterilecek bildirim ya da null.
 * yeniOyuncu: ilk seviyedeki taze hesaba "yeni sürüm" demek anlamsız; sessizce son sürüm görüldü yazılır.
 * Dönen: { simge, metin, eylem: { ad, ekran, surum } } | null
 */
export function surumBildirimi(changelog, { depo = globalThis.localStorage, yeniOyuncu = false } = {}) {
  const liste = Array.isArray(changelog) ? changelog : [];
  const son = liste[liste.length - 1];
  if (!son || !depo) return null;
  const gorulen = oku(depo);
  if (!gorulen && yeniOyuncu) { yaz(depo, son.version); return null; }
  const yeniler = yeniSurumler(liste, gorulen);
  if (!yeniler.length) return null;
  // "+N sürüm daha" yalnız oyuncu bir sürüm görmüşse anlamlıdır (hiç görmemişe 60 sürümü saymak gürültü olur)
  const ek = gorulen && yeniler.length > 1 ? ` (+${yeniler.length - 1} sürüm daha)` : '';
  return { simge: '🆕', metin: `Yeni sürüm geldi: ${son.version} · ${son.title}${ek}`, eylem: { ad: 'Oku', ekran: 'surum', surum: son.version } };
}

/** Sürüm geçmişi okundu: en son sürüm görüldü olarak kaydedilir. */
export function surumuGoruldu(changelog, depo = globalThis.localStorage) {
  const liste = Array.isArray(changelog) ? changelog : [];
  const son = liste[liste.length - 1];
  if (son && depo) yaz(depo, son.version);
}
