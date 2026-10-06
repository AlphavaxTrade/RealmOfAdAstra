# Realm of AdAstra v2 — R4c: ASTRA Fiyat Yolu Modeli

Tarih: 7 Ekim 2026 · Durum: TASLAK, onay bekliyor · Kod yok
Araç: `node scripts/model/astra_fiyat_yolu.mjs senaryo=orta [yakim=0 kilit=0]`. Sonuçlar docs/v2/model_r4c_*.json. Öneri aracıdır.

## 1. Model ne yapıyor

Zincir tarafı: ASTRA bugün Arena eğrisinde (fiyat arzın karesiyle, 12,5 AVAX rezerv, 1 M ASTRA ≈ 0,20 $); 7,3 milyar satılınca borsaya geçer (mezuniyet), sonra sabit çarpımlı havuz. Oyun tarafı (toplu): kasalar haftada %2,5 öder, dağıtılan gelirin %80'i kilitli (%20 serbest; kilit haftada %2,4 + harcamada %20 açılır), gelirin %60'ı oyun içinde harcanır (%5 yakım, %3 yapımcı, %6 UBI, %86 kasalara), serbest bakiyenin haftada %25'i satılmak istenir, haftalık çekim sınırı fiyatı en çok %2 düşürür, çekim ücreti %3 (%70 UBI, %30 yakım). Alımlar: oyuncuların oyun içi ihtiyaç için ASTRA alması (hemen harcanır), trade uygulamasından aylık alım (yarısı yakılır, yarısı kasalara), bir destekçi. Kapı kuralı: son 3 ay kişi başı aylık kazanç ≥ 100 $ ise vatandaş sınırı ayda %10 artar (en çok 1.000).

Üç giriş senaryosu (50 vatandaşla başlar):
- **Düşük:** oyuncuların %20'si ayda 2 $ alır; trade girişi yok.
- **Orta:** %30'u ayda 5 $; trade uygulamasından ayda 500 $.
- **Yüksek:** %40'ı ayda 10 $; trade 2.000 $/ay; 6. ayda 20.000 $'lık bir destekçi.

## 2. Sonuçlar (yakım + kilit AÇIK)

| Senaryo | 1 M ASTRA $ (12. / 36. ay) | Piyasa değeri 36. ay | Mezuniyet | Kişi başı $/ay (12. / 36. ay) | Kapı açıldı | 200 vatandaş | 3 yılda alınan / satılan $ |
|---|---|---|---|---|---|---|---|
| Düşük | 0,34 / 0,45 | 1.300 $ | hayır | 0,4 / 0,7 | hiç | hiç | 721 / 366 |
| Orta | 2,24 / 7,43 | 33.000 $ | 53. hafta | 10,5 / 25 | hiç | hiç | 20.700 / 10.100 |
| Yüksek | 88 / 211 | 1,29 M $ | 12. hafta | 277 / 83 | 7. ay | 21. ay (254'te durdu) | 115.700 / 58.400 |

Yakım + kilit KAPALI olsaydı (aynı girişler): Orta senaryoda 36. ayda 1 M ASTRA 1,96 $ (açıkken 7,43 $: **3,8 kat fark**); Yüksek senaryoda fark küçük (216 $, giriş baskın). Düşük senaryoda fark yok.

## 3. Üç çıkarım

1. **Senin tezin doğru, ölçüsüyle:** yakım ve kilit, aynı dolar girişinin fiyat etkisini orta senaryoda ~4 kat büyütüyor ve geri kaçmasını önlüyor. Ama girişsiz (düşük) senaryoda fiyat 3 yılda ancak 1,8 kat: yakım motor değil dişli; motor net alım.
2. **ASTRA o kadar ucuz ki küçük düzenli alım büyük iş yapıyor.** Trade uygulamasından ayda 500 $'lık alım (yüzde 40 kuralının karşılığı) tek başına fiyatı bir yılda 10 kat, üç yılda 35 kat yapıyor ve tokeni borsaya taşıyor (mezuniyet ~5.600 $ alımla). En etkili tek kol: **düzenli aylık alım programı** (trade uygulaması + ileride hub, NFT).
3. **Kapı kuralı kendi kendini sınırlıyor:** yüksek senaryoda 7. ayda açılıyor, 21. ayda 200 vatandaşa geliyor ve ~250'de duruyor; çünkü kasaların dağıttığı pay vatandaş sayısına bölünüyor ve kişi başı 100 $'ın altına inince kapı kapanıyor. Tam istediğin davranış: refah korunmadan büyüme yok. 1.000 vatandaş için R4'teki hesap geçerli (~500 bin $ net giriş).

Önemli yan bulgu: oyuncu alımları ve trade girişi kasalara ASTRA olarak akınca kasalar büyüyor (orta senaryoda 1. yılda 2,2 milyar ASTRA). Bu bir sorun değil, işleyişin kendisi: ASTRA değerlenince fiyat çarpanı (dolar tabanı) oyun içi ASTRA bedellerini düşürür, büyüyen kasalar daha çok ASTRA dağıtır, oyuncunun dolar geliri iki yönden artar. R4'teki "fiyat ölçeği 0,003" açılış değeridir; sonrası çarpanla kendiliğinden ayarlanır (R8'de kural: oyun içi bedeller = açılış bedeli × fiyat çarpanı).

## 4. Model varsayımları ve sınırları

AVAX 11,43 $ sabit; spekülatör yok; yapımcı payı satılmıyor; Arena ücreti ~%1; kasa ödeme %2,5/hafta; oyun pazarının net ASTRA çıkışı ilk yıl 29 M, azalarak. "Kişi başı $/ay" = o ay dağıtılan ASTRA × fiyat / vatandaş (kilitli dahil; çekilebilen daha az: Orta 12. ay 3,6 $, Yüksek 12. ay 15,5 $). Rakamlar yön gösterir, kesin değildir.

## 5. Öneriler ve kararlar

1. **Kapı eşiği kademeli olsun:** 10 $ → 30 $ → 100 $ → 300 $. Her eşik tutunca sınır %10/ay artar; tam 100 $'ı beklemek 50 kişiyi orta senaryoda yıllarca kilitler. (Ya da 100 $ sabit.)
2. **Kapı göstergesi:** "dağıtılan (kilitli dahil)" mı, "çekilebilen" mi? Önerim: dağıtılan, ekranda ikisi de görünür.
3. **Trade uygulamasının %40'ı düzenli aylık alım programı:** yarısı yakılır, yarısı oyun kasalarına. Kabul mü?
4. **Destekçi/yatırımcı alımları 6 ay kilitli** sayılsın (satış baskısı yaratmasın). Kabul mü?
5. Yakım + kilit kesinlikle kalır (fark 3,8×). İtiraz?
6. Sonraki adım: R4b Galaksi Pazarı mı, R5 nüfus ve ordu mu? Önerim R4b.

## 6. Durum (7 Ekim, kullanici cevaplari)
1. Kapi esigi KADEMELI (10 -> 30 -> 100 -> 300 $): KABUL. 2. Gosterge dagitilan (kilitli dahil), ekranda cekilebilen de: KABUL. 5. Yakim + kilit kalir.
3. DUZELTME: "trade uygulamasinin %40 i icin alim programi" ifadesi yanlis anlatildi. Trade uygulamasinda her sey ASTRA ile satildigi icin musteri zaten pazardan ASTRA alir (para girisi orada olur). Oyuna gelen %40 pay, musterinin aldigi ASTRA nin aktarimidir; yeni alim degildir. Modeldeki "trade girisi 500 $/ay" = musterilerin ayda 500 $ lik ASTRA alip trade uygulamasinda harcamasi; bunun %40 i oyuna (onerim: yarisi yakim, yarisi kasalar). Kalan %60 kullanicida kalir; kullanici satmazsa (ya da haftalik sinir icinde satarsa) fiyata baski olmaz. Karar: kullanicinin payi icin de satis kurali (sohbette soruldu).
4. ACIKLAMA: "destekci alimlari 6 ay kilitli" = buyuk tek seferlik alim yapan biri aninda satabilirse fiyati coker; zincirde dogrudan alani kilitleyemeyiz, ama OYUN UZERINDEN alan destekciye ASTRA kilitli bakiyeye verilir (6 ay kilit, kazanc gibi acilir) ve karsiliginda unvan/rozet/ileride NFT. Olup olmayacagi kullanici karari.
6. Siradaki adim R4b Galaksi Pazari: docs/v2/R4b_GALAKSI_PAZARI.md yazildi.
