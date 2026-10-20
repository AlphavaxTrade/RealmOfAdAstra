// Realm of AdAstra — Zindan planı: 6 kat × 3 oda = 18 seviye. Saf veri ve saf işlevler (sayfaya dokunmaz);
// ekran js/ui/zindan/ekran.js, denetim tests/test_zindan_plan.mjs.
import { getFloorMonsters } from '../../bestiary.js';

export const KAT_SAYISI = 6;
export const ODA_SAYISI = 3;
export const EN_UST_SEVIYE = KAT_SAYISI * ODA_SAYISI;
const BOSS_KATLARI = [3, 6];
const BOSS_CARPANI = 2;

// gecit: sonraki kata açılan taş kapının resimdeki yeri (resmin yüzdesi); son katta yok.
export const KATLAR = [
  { kat: 1, simge: '👺', ad: 'Kristal Mağarası', alt: 'Bataklık balçıkları, goblin ini, gölge kurtları', rozet: 'Mağara Gezgini',
    resim: 'assets/zindan_kat1.jpg', gecit: { sol: 87, ust: 57, en: 11.5, boy: 35 } },
  { kat: 2, simge: '💀', ad: 'Kemik Mahzeni', alt: 'İskelet savaşçılar, kemik büyücüsü, taht muhafızı', rozet: 'Kemik Kırıcı',
    resim: 'assets/zindan_kat2.jpg', gecit: { sol: 91, ust: 42, en: 9, boy: 56 } },
  { kat: 3, simge: '🗿', ad: 'Kadim Tapınak', alt: 'Tarikatçılar, cehennem tazısı, ARA BOSS Taş Golyat', rozet: 'Tapınak Fatihi',
    resim: 'assets/zindan_kat3.jpg', gecit: { sol: 87, ust: 54, en: 11.5, boy: 37 } },
  { kat: 4, simge: '👻', ad: 'Lanetli Firavun Mezarı', alt: 'Mumyalar, gölge hayaletler, lanetli firavun', rozet: 'Firavun Avcısı',
    resim: 'assets/zindan_kat4.jpg', gecit: { sol: 85.5, ust: 51, en: 12.5, boy: 27 } },
  { kat: 5, simge: '🌋', ad: 'Kaynayan Lav Çukuru', alt: 'Ateş iblisleri, lav elementalleri, obsidyen berserker', rozet: 'Lav Yürüyüşçüsü',
    resim: 'assets/zindan_kat5.jpg', gecit: { sol: 90.5, ust: 54, en: 7.5, boy: 40 } },
  { kat: 6, simge: '🐉', ad: 'Kıyamet Mabedi', alt: 'Kıyamet şövalyesi, gölge lordu, BÜYÜK BOSS IGNIS', rozet: 'Kıyamet Yenen',
    resim: 'assets/zindan_kat6.jpg', gecit: null }
];

// ── Kat / oda durumları (ilerleme = oyuncunun açık olan en yüksek seviyesi) ──
export const katSeviyeleri = (kat) => Array.from({ length: ODA_SAYISI }, (_, i) => (kat - 1) * ODA_SAYISI + i + 1);
export const katCanavarlari = (kat, mod = 0) => getFloorMonsters(kat, mod);
export const bossKatiMi = (kat) => BOSS_KATLARI.includes(kat);

// Oyuncu açıldığında hangi kattan başlasın: şu an savaştığı kat (hepsi bitmişse sonuncu)
export function baslangicKati(ilerleme) {
  const seviye = Math.max(1, Math.min(EN_UST_SEVIYE, Math.floor(Number(ilerleme) || 1)));
  return Math.ceil(seviye / ODA_SAYISI);
}

export function odaDurumu(seviye, ilerleme) {
  return { kilitli: ilerleme < seviye, yenildi: ilerleme > seviye, siradaki: ilerleme === seviye };
}

export function katDurumu(kat, ilerleme) {
  const ilk = (kat - 1) * ODA_SAYISI + 1;
  const temizlenen = Math.max(0, Math.min(ODA_SAYISI, ilerleme - ilk));
  return { temizlenen, tamam: temizlenen === ODA_SAYISI, acik: ilerleme >= ilk };
}

export function kilitMesaji(ilerleme, canavar) {
  return `🔒 Şu an Seviye ${ilerleme}'desiniz! [Seviye ${canavar.level}] ${canavar.name} bölümüne girmek için önce Seviye ${ilerleme} ve önceki bölümleri tamamlamalısınız.`;
}

// Kazanma şansının rengi: ordu yoksa 'yok'
export function sansTonu(sans) {
  if (sans == null) return 'yok';
  if (sans >= 75) return 'iyi';
  if (sans >= 50) return 'uyari';
  return 'kotu';
}

export function sansYorumu(sans) {
  if (sans == null) return 'Savaşabilecek asker yok';
  if (sans >= 75) return 'Ordun ezici üstünlükte';
  if (sans >= 50) return 'Dengeli savaş, yaralanmalar olabilir';
  return 'Yüksek risk: ordun yenilebilir';
}

// ── Canavar yetenekleri: oyuncuya sade açıklama (kurallar js/combat.js'te) ──
export const YETENEKLER = {
  cleave: { ad: 'Yarma Darbesi', simge: '💥', metin: 'Ön saftaki birkaç askere birden vurur.', ipucu: 'Ön safa dayanıklı askerleri koy.' },
  sunder: { ad: 'Zırh Parçalayıcı', simge: '🪓', metin: 'Bir askerin zırhını 3 tur boyunca %40 azaltır.', ipucu: 'Zırhı güçlü askerler bu yetenekle kısa süre zayıflar.' },
  swoop: { ad: 'Kanat Dalışı', simge: '🦅', metin: 'Ön safı aşıp arka saftaki askere sert vurur.', ipucu: 'Arka saf da güvende değil: okçuların canı yüksek olsun.' },
  regenerate: { ad: 'Kadim Yenilenme', simge: '🌀', metin: 'Her kullanışta canının %8\'ini yeniler.', ipucu: 'Uzun savaşı sevmez: hızlı ve ağır vurmak işe yarar.' },
  terrify: { ad: 'Dehşet Çığlığı', simge: '😱', metin: 'Bir askeri 1 tur sersemletir.', ipucu: 'Asker sayısı çok olursa tek bir sersemlik büyük kayıp yaratmaz.' },
  roar: { ad: 'Kükreme', simge: '🗣️', metin: 'Düşmanı korkutup sersemletebilir.', ipucu: '' }
};

export const yetenekBilgisi = (anahtar) => YETENEKLER[anahtar] || { ad: anahtar, simge: '⚡', metin: '', ipucu: '' };

// ── Ganimet şansı rozetleri: boss katlarında parça ve Pandora kutusu şansı iki katıdır ──
/**
 * @param {{getFragmentDropRate: Function, getBoxDropRate: Function, formatDropChance: Function}} gs
 */
export function ganimetSanslari(gs, seviye, kat) {
  const boss = bossKatiMi(kat);
  const carpan = boss ? BOSS_CARPANI : 1;
  const parcaTaban = gs.getFragmentDropRate(seviye);
  const kutuTaban = gs.getBoxDropRate(seviye);
  const parca = parcaTaban * carpan;
  const kutu = kutuTaban * carpan;
  return {
    boss,
    parca: { taban: parcaTaban, etkin: parca, metin: gs.formatDropChance(parca) },
    kutu: { taban: kutuTaban, etkin: kutu, metin: gs.formatDropChance(kutu) }
  };
}

// ── Şansı düşük oyuncuya çıkış yolu (20 Ekim 2026, yeni oyuncu denemesi) ──
// Yeni hesapta ilk asker eşyasız ve tek başına: ilk odada kazanma şansı %0. Kat başına asker hakkı (kat + 1) varken ikinci asker şansı %100'e çıkarıyor,
// tek eşya tek askere yetmiyor. Bu yüzden ipucu, o an gerçekten işe yarayacak şeyi söyler. Hiçbiri geçerli değilse null (ipucu gösterilmez).
/**
 * @param {{state: {soldierUnits: Array}, getAskerHakki?: Function}} gs
 * @returns {{metin: string, asker: boolean, esya: boolean}|null}
 */
export function zayifIpucu(gs) {
  const asker = gs.state.soldierUnits || [];
  if (!asker.length) return null;
  const h = typeof gs.getAskerHakki === 'function' ? gs.getAskerHakki() : null;
  const hakVar = !!(h && h.acik && asker.length < h.hak);
  const esyaVar = asker.some((a) => Object.values(a.equipment || {}).some((e) => !e));
  if (!hakVar && !esyaVar) return null;
  const parcalar = [];
  if (hakVar) parcalar.push(`Bu katta ${h.hak} asker taşıyabilirsin, ${asker.length} askerin var: Kışla'dan yeni asker al.`);
  if (esyaVar) parcalar.push('Askerlerinin boş eşya yuvası var: eşya tak.');
  return { metin: parcalar.join(' '), asker: hakVar, esya: esyaVar };
}
