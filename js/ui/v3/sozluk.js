// Realm of AdAstra — v3 terim sözlüğü: ekranlarda geçen teknik kavramların sade açıklaması. Terimin yanındaki "?" düğmesine dokununca balon açılır.
// Yeni bir teknik kelime ekranda geçecekse önce buraya yazılır; açıklama en çok iki cümle, günlük dille.
import { esc } from './hub.js';

export const SOZLUK = {
  amm: { ad: 'Takas havuzu (AMM)', aciklama: 'Alıcı ve satıcı aramadan, havuzdaki miktara bakarak fiyat belirleyen pazar. Bir şeyi çok alan fiyatı yükseltir, çok satan düşürür.' },
  havuz: { ad: 'Havuz', aciklama: 'Pazarın elindeki hammadde ve ASTRA stoğu. Fiyat, bu ikisinin birbirine oranından çıkar.' },
  harc: { ad: 'Harç', aciklama: 'Her alım-satımdan kesilen küçük pay. Hammaddenin bir kısmı yakılır, ASTRA kısmı oyunun ortak kasalarına gider.' },
  yakim: { ad: 'Yakım', aciklama: 'Bir şeyin oyundan sonsuza dek silinmesi. Azalan miktar, kalanın değerini korumaya yardım eder.' },
  buyback: { ad: 'Geri alım', aciklama: 'Hazine, fiyatı düşen hammaddeyi piyasadan satın alıp yakar. Böylece fiyat toparlanır.' },
  uretimhakki: { ad: 'Üretim hakkı', aciklama: 'Bir haftada üretebileceğin hammadde payı. Herkesin payı, oyundaki toplam üretim kapasitesine göre ayarlanır.' },
  ubi: { ad: 'Temel gelir', aciklama: 'Her hafta, ortak kasadan aktif oyunculara eşit dağıtılan ASTRA.' },
  kota: { ad: 'Kota', aciklama: 'Belirli bir sürede yapabileceğin işin üst sınırı (örneğin haftalık hammadde çıkarma payı).' },
  kapi: { ad: 'Kapı', aciklama: 'Oyuna katılan hesap sayısı sınırlı. Yer açılana kadar bekleme sırası vardır; düzenli oynamayanın yeri başkasına geçebilir.' },
  kasa: { ad: 'Kasa', aciklama: 'Oyunun ASTRA biriktirdiği ve belirli amaçlarla dağıttığı ortak havuzlardan biri (örneğin zindan ödülleri, kolezyum ligi).' },
  tokenomics: { ad: 'Para düzeni', aciklama: 'ASTRA\'nın nereden gelip nereye gittiği: kaç tane var, ne kadarı yakıldı, kasalarda ne kadar duruyor.' },
  termostat: { ad: 'Dengeleyici', aciklama: 'Oyun, hızlı kazanıldığında ödülü yavaşlatır, yavaşken hızlandırır; böylece kasalar uzun süre dayanır.' },
  stamina: { ad: 'Stamina', aciklama: 'Sefere çıkmak için gereken enerji. Buğdayla doldurulur, zamanla kendiliğinden de dolar.' },
  silo: { ad: 'Silo', aciklama: 'Hammaddelerini sakladığın depo. Dolunca biten seferlerin ürünü yer açılana kadar seferde bekler; yükselttikçe daha çok alır.' }
};

// Terimin yanına "?" düğmesi koyar. Bilinmeyen anahtarda düz (kaçırılmış) metin döner; sayfayı bozmaz.
export function terim(anahtar, etiket) {
  const t = SOZLUK[anahtar];
  const yazi = esc(etiket ?? (t ? t.ad : anahtar));
  if (!t) return yazi;
  return `<button type="button" class="v3-terim" data-v3-terim="${esc(anahtar)}" aria-label="${esc(t.ad)} nedir?">${yazi}<i aria-hidden="true">?</i></button>`;
}
