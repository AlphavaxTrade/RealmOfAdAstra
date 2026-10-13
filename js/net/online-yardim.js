// Realm of AdAstra — çevrimiçi pencerelerin (giriş, doğrulama, ödeme) SAF yardımcıları.
// DOM'a dokunmaz; testlerde doğrudan içe alınır (tests/test_denetim_2026_10_arayuz.mjs).
// Denetim 13 Ekim 2026: QA-04 (erişilebilir pencere), QA-16 (ödeme tutarları), H1 (ödeme adresi ve izin tutarı).

const ADRES_RE = /^0x[0-9a-f]{40}$/i;

/** Metin etiketi: `for` ile alana bağlı <label>. gizli=true → yalnız ekran okuyucuya görünür (sıkışık satırlar için). */
export function etiketHtml(alanKimligi, metin, { gizli = false } = {}) {
  return `<label for="${alanKimligi}" class="${gizli ? 'ol-gizli' : 'ol-etiket'}">${metin}</label>`;
}

/** Ödeme tutarı yazısı: 1.000 ve üstü tam sayı (aşağı), küçükler en çok 2 ondalık (aşağı yuvarlanır, olandan fazlası yazılmaz).
 *  0,01'in altındaki pozitif tutar "0" değil "<0,01" görünür. */
export function astraYaz(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1000) return Math.floor(n).toLocaleString('tr-TR');
  const kesin = Math.floor(n * 100 + 1e-9) / 100;
  if (kesin === 0) return '<0,01';
  return kesin.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Ödeme penceresinin üç tutarı, birbiriyle tutarlı:
 *  - maliyet: işlemin tutarı (sunucu yukarı yuvarlar)
 *  - bakiye: oyundaki gerçek bakiye. Sunucu teklifi bakiyeyi AŞAĞI yuvarlıyordu ("0" oysa 0,01 vardı); yerel kopya
 *    sunucuyla eşitlendiği için ondalıklı değer ondan alınır, yoksa teklifteki değer kullanılır.
 *  - odenecek: cüzdandan çıkacak tam sayı (sunucunun %2 pay + 1 eklediği tutar)
 */
export function odemeOzeti(teklif, yerelBakiye) {
  const q = teklif || {};
  const yerel = Number(yerelBakiye);
  const bakiye = Number.isFinite(yerel) && yerel >= 0 ? yerel : Math.max(0, Number(q.balance) || 0);
  const maliyet = Math.max(0, Number(q.cost) || 0);
  const odenecek = Math.max(0, Math.ceil(Number(q.amountAda) || 0));
  const eksik = Math.max(0, maliyet - bakiye);
  return {
    maliyet: astraYaz(maliyet),
    bakiye: astraYaz(bakiye),
    eksik: astraYaz(Math.ceil(eksik * 100 - 1e-9) / 100),   // eksik yukarı yuvarlanır: gerçekte olandan az görünmesin
    odenecek: astraYaz(odenecek)
  };
}

/**
 * H1: sunucunun teklifte verdiği ödeme sözleşmesi / token adresi, derlemeye sabitlenmiş adresle aynı mı?
 * sabit = { sozlesme, token } (küçük harf ya da boş). Boş olan sabitlenmemiştir (deneme / geliştirme derlemesi) ve denetlenmez.
 * Döner: null (uygun) ya da oyuncuya gösterilecek açık uyarı metni.
 */
export function adresDenetle(teklif, sabit) {
  const q = teklif || {};
  const s = sabit || {};
  const kisa = (a) => (a ? String(a).slice(0, 6) + '…' + String(a).slice(-4) : 'yok');
  const farkli = (sunucu, beklenen) => !!beklenen && String(sunucu || '').toLowerCase() !== String(beklenen).toLowerCase();
  const sorunlar = [];
  // Sabitlenmemiş derlemede de biçim denetlenir: geçerli bir adres değilse cüzdana işlem verisi olarak gömülmesin
  if (farkli(q.contract, s.sozlesme) || !ADRES_RE.test(String(q.contract || ''))) sorunlar.push(`ödeme sözleşmesi (${kisa(q.contract)})`);
  if (farkli(q.token, s.token) || !ADRES_RE.test(String(q.token || ''))) sorunlar.push(`ASTRA token adresi (${kisa(q.token)})`);
  if (!sorunlar.length) return null;
  return '⛔ Güvenlik uyarısı: sunucunun gönderdiği ' + sorunlar.join(' ve ') + ' bu oyun sürümünün tanıdığı adresle UYUŞMUYOR. '
    + 'Ödeme durduruldu; cüzdanından hiçbir şey çekilmedi ve izin verilmedi. Sayfayı yenile; sorun sürerse ödeme yapma ve destek ekibine haber ver.';
}

/** Derleme ortamındaki (VITE_*) sabit adresleri okur; geçerli 0x adresi değilse boş sayar. env: import.meta.env */
export function sabitAdresler(env) {
  const e = env || {};
  const oku = (v) => { const s = String(v || '').trim().toLowerCase(); return ADRES_RE.test(s) ? s : ''; };
  return { sozlesme: oku(e.VITE_PAYMENTS_CONTRACT), token: oku(e.VITE_TOKEN_ADDRESS) };
}

/**
 * approve() için istenecek izin: yalnız bu ödemenin tutarı (sınırsız izin DEĞİL) ve yalnızca mevcut izin yetmiyorsa.
 * Gerekçe: sınırsız izin ("bir daha sorma") kullanım kolaylığı sağlar ama sözleşme/sunucu ele geçirilirse cüzdanın bütün ASTRA'sını
 * açık bırakır; tutarı kadar izin her ödemede bir onay daha demek, ama kaybedilebilecek en çok o ödemenin tutarıdır.
 * Döner: istenecek izin (wei) ya da null (mevcut izin yeterli, yeniden onay istenmez).
 */
export function izinIstenecek(mevcutIzinWei, tutarWei) {
  const mevcut = BigInt(mevcutIzinWei || 0);
  const tutar = BigInt(tutarWei);
  return mevcut >= tutar ? null : tutar;
}

/** Hesap yüklenemedi kartının açıklaması: durum koduna göre sade metin. */
export function yuklemeHatasiMetni(hata) {
  const durum = Number(hata && hata.status);
  if (hata && hata.ag) return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et ya da biraz sonra tekrar dene.';
  if (durum >= 500) return `Sunucu şu an hesabını getiremiyor (hata kodu ${durum}). Bu geçici olabilir; biraz sonra tekrar dene.`;
  if (durum === 429) return 'Çok sık denendi; bir dakika bekleyip tekrar dene.';
  return (hata && hata.message) || 'Hesabın şu an yüklenemedi.';
}
