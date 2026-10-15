# Realm of AdAstra v2 — R5: Nüfus ve Ordu

Tarih: 7 Ekim 2026 · Durum: TASLAK, onay bekliyor · Kod yok
Her kavram burada baştan tanımlanır. Uydurulmuş sayılar **VARSAYIM** diye işaretlidir; kesin değerleri R8'de model verir.

## 1. Bu adım neyi çözüyor

İki oyunun bağ belgesinde (00_IKI_OYUN_BAGI, onaylı) iki karar vardı: Universe'de yeni bir gezegene yerleşmek için **kolonist** gerekir ve kolonistler yalnız Sirius'tan (yani Realm'den) gelir; Universe gemileri **mürettebat** olmadan uçmaz ve mürettebat yalnız Realm'in Kışla askerleridir. Bu iki şeyin Realm'de bir karşılığı olmalı: kolonist olacak insanlar nerede yaşar, nasıl çoğalır; askerler nasıl mürettebat olur; Universe açılmadan önceki yılda bunlar Realm'de ne işe yarar? Bu belge bunu tanımlar.

Bugün Realm'de "nüfus" diye bir şey yok: oyuncunun işçileri sefere gider ama sayılmaz; yalnız askerler var. v2'de iki insan türü olur:
- **Köylüler:** oyuncunun köyünde yaşayan sivil nüfus. Yeni kavram. Kolonist adayı.
- **Askerler:** bugünkü AdAstra Şampiyonları. Mürettebat adayı.

## 2. Köylüler (sivil nüfus)

### 2a. Nerede yaşarlar, nereden gelirler
Haritadaki **Köy Evleri** (R1'de kararlaştırılan yeni yer). Oyuncu ev yapar; her ev belirli sayıda köylü barındırır. Köylü satın alınmaz, **doğar**: evde boş yer varsa ve köyde yeterli buğday varsa nüfus her gün biraz büyür. Yani köylü, buğday ve odunun (ev yapımı) zamanla insana dönüşmüş halidir.
- Ev maliyeti: odun + taş + az demir (VARSAYIM: 1. ev 400 odun, 200 taş, 50 demir; her ev %20 daha pahalı; en çok 20 ev). Ev sayısı hesap seviyesine bağlı (Universe kuralıyla aynı: bina seviyesi hesap seviyesini geçemez).
- Her ev 10 köylü barındırır (VARSAYIM). 20 ev = 200 köylü tavanı.
- Büyüme: her gün nüfusun %2'si kadar yeni köylü, tavana kadar; buğday yoksa büyüme durur (VARSAYIM).
- Beslenme: her köylü günde 2 buğday yer (VARSAYIM; 200 köylü = günde 400 buğday, tarlanın bir saatlik üretiminin dörtte biri). Buğday biterse köylüler önce büyümeyi durdurur, 3 gün sonra günde %5 azalır (göç). Bu, buğdayın yeni ve sürekli bir batağı.

### 2b. Realm'de ne işe yararlar (Universe yokken)
Köylü yalnız "ileride kolonist" diye beklerse oyuncu için anlamsız olur; bu yüzden Realm'de üç işi var:
1. **Emek:** Köylüler Otorite inşaatına ve Konsey projelerine **emek puanı** verir. Her köylü günde 1 emek puanı üretir; emek puanı, oyuncunun o inşaata koyduğu hammaddenin yanında ikinci bir katkı türüdür (ör. bir Konsey projesi 2 milyon birim hammadde + 50.000 emek ister). Böylece hammaddesi az ama köyü kalabalık oyuncu da ortak işlere katılır ve katkı puanı kazanır.
2. **Verim:** Köylü sayısı sefer verimini küçük bir oranda artırır: her 10 köylü üretime +%1, en çok +%20 (VARSAYIM). Üretim yine Üretim Hakkı'yla sınırlıdır; köylü, hakkı değil hızı etkiler (hakkın dolmasına yardım eder).
3. **Mutluluk ve asker kaynağı:** Askerler köylülerden çıkar (bölüm 3): asker eğitmek için 1 köylü gerekir. Köyü olmayan asker yetiştiremez.

### 2c. Universe açılınca: kolonist
Universe'de yeni bir gezegene yerleşmek için koloni gemisi + belirli sayıda kolonist gerekir (VARSAYIM: ilk koloni 50 kolonist, sonrakiler 100). Oyuncu kendi köylülerini Yük İskelesi'nden gönderir; gönderilen köylü Realm'den eksilir (evde yer açılır, nüfus yeniden büyür). Başkasının köylüsü satın alınamaz (insan ticareti yok); kolonist yalnız kendi köyünden. Bu, Universe'de yayılmanın Realm'de köy kurmaya bağlı olduğu anlamına gelir: alt oyun olmadan uzaya çıkılmaz.

## 3. Askerler (ordu)

### 3a. Bugünkü kurallar (korunur)
Tek asker türü AdAstra Şampiyonu: 1. seviyede 100 can, 25 saldırı; her seviyede +25 can, +6 saldırı. Teçhizat yuvaları (kılıç, zırh…), eklentiler. Zindanda her kat asker başına stamina yakar. 24 saatte kendi kendine iyileşir (1 can = 0,30 buğday + 0,10 ASTRA), hızlı iyileşme daha pahalı. Kolezyumda 1v1 / 3v3 gerçek rakip.

### 3b. v2 değişiklikleri
- **Asker eğitmek köylü ister:** her yeni asker için 1 köylü Kışla'ya alınır (köyden düşer). Para bedeli bugünkü kural (ilk asker 5.000 ASTRA, her sonraki daha pahalı; 30 Eylül zindan modeli: n. asker 3.150 × n² ASTRA) R4'teki fiyat ölçeğiyle küçülür (R8'de).
- **Asker sayısı sınırı** (30 Eylül kararı): zindan ilerlemesi + hesap seviyesi birlikte. Kural: asker hakkı = geçilen zindan katı + 1, ve asker seviyesi ≤ hesap seviyesi. (15 Ekim 2026: asker seviyesi sınırı motorda AÇIK; zindan katı sınırı koda eklendi ama KAPALI, config `ORDU_SINIRI`, çünkü canavar tablosu bu sınırla dengeli değil: bkz. SONRA_YAPILACAKLAR.md.)
- **İyileşme Şifahane'de:** bugünkü buğday + ASTRA iyileşmesine ek olarak Şifalı Ot (yeni hammadde) iyileşmeyi hızlandırır (VARSAYIM: 1 şifalı ot = 5 can, ASTRA kısmı yarıya iner). Universe gelince Biyolüminit daha da hızlandırır.
- **Teçhizat geri dönüşümü** (R4b kararı): Demirhane'de %70 hammadde geri.

### 3c. Universe açılınca: mürettebat
Universe gemileri mürettebat ister (VARSAYIM: keşif sondası 0, nakliye 2, avcı 3, kruvazör 10, zırhlı 25, koloni gemisi 20 + kolonistler; Universe R-adımlarında kesinleşir). Oyuncu askerlerini Yük İskelesi'nden Universe'e gönderir; gönderilen asker Realm'de yok sayılır (zindana, kolezyuma giremez), teçhizatı üstünde gider. Geri çağrılabilir (uçuş süresi). Universe'de ölen asker Realm'e dönmez (gerçek kayıp; mürettebat değerlidir). Askerin seviyesi ve teçhizatı Universe'de gemi gücüne katkı verir (sayılar Universe'de).

## 4. Universe yokken "hazırlık" ekranı

Kışla ve Köy Evleri'nde birer kilitli sekme: "Mürettebat (Universe'e gönder)" ve "Kolonist (Universe'e gönder)". Kilitli ama içi görünür: "Şu an 120 köylün, 6 askerin var. Universe'de ilk koloni 50 kolonist, bir kruvazör 10 mürettebat ister." Oyuncu neye hazırlandığını baştan görür; Konsey'deki "Universe'e hazırlık" ilerlemesi köylü ve asker sayısını da sayar (R6).

## 5. Sayıların tutarlılık kontrolü (R8'de modellenecek)

- Buğday batağı: 100 köylülü bir köy günde 200 buğday yer; tarla saatte 1.800 üretiyor; yani nüfus beslemek üretimin küçük bir kısmı (günlük üretimin ~%1'i). Köylü sayısı 200'e çıksa bile %2. Bu bilerek küçük: köylü "pahalı bir tüketici" değil, "yavaş büyüyen bir birikim" olsun diye. Batak etkisi küçük; asıl batak emek değil hammaddeyle Otorite ve projeler.
- Emek puanı: 100 köylü × 365 gün = 36.500 emek/yıl; bir Konsey projesinin 50.000 emek istemesi, 50 oyunculu köyde her oyuncunun bir ayda bitirebileceği ölçek (VARSAYIM; R8).
- Asker/köylü dengesi: 18 asker için 18 köylü; 20 evli köyde sorun değil. Yeni oyuncuda ilk ev + 10 köylü başlangıç paketinde (VARSAYIM) ki ilk askeri eğitebilsin.

## 6. Bu adım için kararlar

1. Köylü = doğan, satın alınmayan nüfus (ev + buğday ile büyür): kabul mü?
2. Köylülerin Realm'deki üç işi (emek puanı, küçük üretim bonusu, asker kaynağı): kabul mü? Eklemek istediğin iş var mı?
3. Her asker için 1 köylü şartı: kabul mü?
4. Kolonist yalnız kendi köyünden, başkasından alınamaz: kabul mü?
5. Universe'de ölen asker Realm'e dönmez: kabul mü?
6. Hazırlık sekmeleri (kilitli ama görünür): kabul mü?

Onay gelince R6: Uzay Limanı hazırlık modu (roket görevi, Yük İskelesi, Gözlem Kulesi, "Universe'e hazırlık" ilerlemesi).
