# AdAstra Ekosistemi: Makro Ekonomi ve Eylem Planı

Tarih: 15 Ekim 2026 · Durum: kurallar anayasaya işlendi (EKONOMI_ILKELERI.md 9. ve 10. ilke); sayılar **ÖNERİ**, kullanıcı onayı bekliyor; oyun kodunda henüz hiçbir şey değişmedi.
Model: `node scripts/model/makro_model.mjs hepsi` (sonuçlar `docs/v2/model_makro_<senaryo>.json`) · Değişmez testi: `tests/test_makro_model.mjs` (hızlı kapıda).
"VARSAYIM" yazan her sayı ölçülmemiş bir girdidir; gerçek veri geldikçe (trade defteri, oyuncu davranışı) model yeniden koşar.

---

## 0. Kısaca

1. **Altın kural tutuyor.** 9 senaryonun hiçbirinde, 3 yılın hiçbir haftasında oyundan çıkan ASTRA trade alımının yarısını geçmedi. Trade yokken çıkış hiç olmadı. Spekülatör şoku dışında fiyat hiçbir hafta düşmedi.
2. **Oyuncuların nakit çıkışı trade gelirine bağlı ve sınırlı.** 100 vatandaşın toplam aylık nakit çıkışı, trade aylık gelirinin en çok yarısıdır:
   - trade 750 $/ay → kişi başı ~3 $/ay çekilebilir
   - trade 2.000 $/ay → ~9 $/ay
   - trade 5.000 $/ay → ~24 $/ay

   Dağıtılan (oyunda kazanılan, çoğu kilitli) değer bunun 5-10 katı.
3. **En önemli yeni bulgu: ölçek uyuşmazlığı.**
   - Bugünkü fiyatla 200 M ASTRA yalnız ~38 $ ediyor.
   - Trade'den ayda 750 $ gelse bile oyuna ilk ay, tasarlanan dağıtımın ~560 katı ASTRA giriyor.
   - Dolar hesabı tutarlı, ama oyun içi ASTRA bedelleri neredeyse bedavaya düşüyor.
   - Fiyat yükseldikçe bugünkü fiyat çarpanı bedelleri daha da düşürüyor (2. yılda alt sınır 0,05).
   - Çözüm önerisi: **Oyun İçi Fiyat Endeksi** (bölüm 11-B1).
4. **Kapı ancak trade ~5.000 $/ay olunca açılıyor.**
   - O seviyede kapı 10. ayda açılıyor.
   - 2.000 $/ay ve altında 3 yılda hiç açılmıyor.
   - Trade de 100 hesapla sınırlı olduğu için iki kapı birbirine bağlı.
5. **Genesis ayrıcalıkları ve stake indirimleri trade'e ~175 $/ay maliyet çıkarıyor** (15 Genesis sahibiyle). Bu, trade geliri 750 $/ay iken gelirin %24'ü. Öneri: açık Genesis mührü sayısı trade gelirine bağlansın (bölüm 11-B5).
6. **Yalnız 200 M tohumla oyun yavaş eriyor.** Trade girişi olmadan ödeme yapan kasalar 3 yılda hedef rezervin %39'una iniyor ve haftalık dağıtım yarıya düşüyor. Oyunu ayakta tutan şey trade girişi; tohum yalnız başlangıç desteği.

---

## 1. Bugün elimizde ne var (ölçülmüş)

**ASTRA zincirde (11 Ekim 2026, blok 97.277.098)**
- Yalnız Arena eğrisinde işlem görüyor: eğride 12,99 AVAX (~135 $).
- Piyasa değeri ~405 $; 1 M ASTRA ≈ 0,19 $.
- Arz 2,158 milyar; bunun 165 M'si yakılmış.
- Borsaya geçiş (mezuniyet) için 490 AVAX (~5.100 $) net alım gerekiyor; o an fiyat bugünün 11,4 katı olur.
- 200 M tohum bugün ~38 $ ediyor.

**Trade uygulaması**
- 100 hesap sınırı var.
- Paketler: Uydu 10 $, Roket 20 $, Alfa 40 $/ay; Gözlemevi 600 $/yıl.
- Kârlı işlemden %3 pay alınıyor.
- Fiyatlar dolar, ödeme ASTRA. Müşteri ödemeden önce piyasadan ASTRA alır; bu alım baskısıdır.
- Gelir bölüşümü (kullanıcı kararı, 7 Ekim 2026):
  - %20 yakılır.
  - %30 sahibin acil durum kasasına gider (satılmaz).
  - %10 trade ödül havuzuna gider (bot ücreti kredisi, çekilemez).
  - %40 oyuna gider.
- Bot Kasası sözleşmesi hâlâ eski 40/40/20 ile bölüyor (trade sitesi işi, bölüm 13).
- Gerçek aylık gelir henüz ölçülmedi.

**Oyun**
- **Tohum:** pazar havuzları 100 M + kasalar 88 M + piyango 12 M.
- **Harcama bölüşümü:** %5 yakım, %3 yapımcı, %6 temel gelir, %86 kasalar.
- **Kilit:** kazancın %80'i kilitli.
- **Haftalık çekim:** fiyatı en çok %2 düşürecek kadar.
- **Fiyat çarpanı:** dolar tabanı.
- **Fren:** yakım.
- **Genesis:** bugün 18 eser + 5 ASTRA ile basılıyor; yalnız oyun içi işaret.

---

## 2. Beş altın kural

1. **Akış dengesi.**
   - Bir haftada ekosistemden cüzdanlara çıkan ASTRA, trade uygulamasının yarattığı alımın en çok **yarısı** olabilir.
   - Çıkış sayılanlar: oyuncu çekimleri, yapımcı payı ve ileride stake ödülü.
   - Taban yoktur: alım yoksa çıkış yoktur.
   - Böylece her 100 birim trade alımından en az 50 birimi fiyatı yukarı iten net alım olarak kalır.
2. **Basım yok, yüzdeyle ödeme.** Ödül hep kasadan ve kasanın yüzdesi olarak ödenir; kasa hiç sıfırlanmaz. Uzun vadede oyunun ödediği, kasaya girene eşitlenir. Girenin ana kaynağı trade payı olduğu için ödeme kendiliğinden trade alımıyla artıp azalır.
3. **Büyük katkı faydayla geri ödenir.** Genesis sahibi ve stake eden; ayrıcalık, indirim ve öncelik alır, ASTRA değil. Fayda satılamaz, satış baskısı yaratmaz.
4. **Motor alımdır.** Yakım fiyatı tek başına yükseltmez: yakılan token arzda kalır ama asla satılamaz, fiyata taban kurar. Fiyatı yükselten alımdır.
5. **Her şey görünür.** Haftalık pano herkese açıktır. Panoda şunlar görünür:
   - trade alımı
   - net piyasa alımı
   - çıkış tavanı ve ödenen çıkış
   - yakımlar
   - kasalar
   - kadran
   - stake oranı
   - Genesis sayısı

---

## 3. Para haritası: 100 birim trade alımı nereye gider

| Pay | Ne olur | Satış baskısı |
|---|---|---|
| 20 | yakılır | yok (kalıcı) |
| 30 | sahibin acil durum kasası | yok (tutulur, panoda izlenir) |
| 10 | trade ödül havuzu (bot ücreti kredisi); stake açılınca 5'i stake ödülüne | yok (kredi çekilemez; stake ödülü 26 haftada çözülür, zarfın içinde) |
| 40 | oyuna gelir: 2 yakım, 1,2 yapımcı, 2,4 temel gelir, 34,4 kasalar | yalnız Çıkış Kapısı'ndan |
| **Oyundan en çok çıkış** | **50** (tohum dahil bütün oyun) | net alım ≥ 50 |

**Kredi ödemesi alım sayılmaz.** Trade ödül havuzu kredisiyle yapılan ödeme yeni alım değildir. Bölüşüme girer ama Çıkış Kapısı'nın "trade alımı" ölçüsüne sayılmaz. Modelin ilk taslağında sayılıyordu: trade durduktan sonra da kredi döndükçe oyundan çıkış sürdü (41 haftada kural bozuldu). Düzeltildi.

---

## 4. Üç vana

### Vana 1: Musluk (oyun içi dağıtım) + Ödeme Kadranı

**Haftalık bütçe** (bugünkü kural, KARAR 7): kasa × haftalık oran × sağlık + son 4 haftanın ortalama kasa girişinin %90'ı. Trade payı geldikçe bütçe kendiliğinden büyür.

**Ödeme Kadranı (yeni):** Kasaların haftalık oranı D ile çarpılır.
- D = (son haftanın fiyatı ÷ son 13 haftanın ortalama fiyatı) ^ 0,5
- D en az 0,6, en çok 1,5 olabilir; haftada en çok %5 değişir.
- İlk 4 hafta veri birikir: D = 1.

**Neden piyasa değeri değil de fiyat:** Bugünkü piyasa değeri ölçüsü fiyat × (arz − yakılan). Oyunun kendi yakımı bu ölçüyü düşürür ve kadranı yanlışlıkla kısardı.

**Örnek:**

| Fiyat 13 haftalık ortalamasına göre | D | Zindan haftalık oranı | Dolar olarak ödeme |
|---|---|---|---|
| %30 üstte | ≈ 1,14 | %2,5 → %2,85 | ~%48 artar (fiyat × D) |
| %40 altta | ≈ 0,77 | → %1,94 | düşer |

**Kasa koruması:** Ödeme yapan kasaların toplamı hedef rezervin yarısının altındaysa D en çok 1; dörtte birinin altındaysa en çok 0,8.

İlk taslakta bu koruma "kasa ömrü < 12 ay" ölçüsüne bağlıydı. Ama yüzdeyle ödeyen bir kasanın "ömrü" tanım gereği ~9 ay çıkar (hiç bitmese de); kadran hep kilitli kalıyordu. Bu yüzden sağlık ölçüsüne geçildi.

**Kullanıcının isteği iki yoldan sağlanıyor:** "piyasa değeri arttıkça daha çok, azaldıkça daha az öde".
- Dolar olarak ödeme zaten fiyatla büyür (ASTRA × fiyat).
- Kadran buna ek olarak yükselişte ASTRA miktarını da artırır, düşüşte kısar.

### Vana 2: Kilit (bugünkü kural kalır)

- Kazancın %80'i kilitli başlar.
- Harcayınca harcananın %20'si kadar kilit açılır.
- Haftalık açılma %1 × k + her gün girene %1,4.
- **Yeni gösterge "çıkış bekleyen serbest stok":** 12 haftalık çıkış tavanını aşarsa yöneticiye uyarı gider. İlk sürümde otomatik ceza yok.

### Vana 3: Çıkış Kapısı (altın kural 1'in formülü)

Haftalık ekosistem çıkış tavanı **E**, şunların **en küçüğüdür**:

| Sınır | Formül | Açıklama |
|---|---|---|
| Trade alımı | 0,5 × TB | TB = trade uygulamasına **taze** ödenen ASTRA (kredi hariç); son 4 haftanın haftalık ortalaması ile son haftanın küçüğü |
| Net piyasa alımı | 0,5 × NA | NA = net piyasa alımı, oyunun kendi çıkışı **geri eklenerek** (aynı ortalama/son hafta kuralı) |
| Fiyat etkisi | %2 fiyat etkisi × k | bugünkü kural |
| Cüzdan | sıcak cüzdan bakiyesi | |
| Gönderim | haftalık gönderim sınırı | |

- **Taban yok.**
- **Neden "son hafta ile ortalamanın küçüğü":** Trade bir hafta durursa çıkış o hafta kısılır; 4 haftalık ortalamanın erimesi beklenmez.
- **Neden kendi çıkışımız geri ekleniyor:** Eklemezsek kapı kendi satışını "alım azaldı" diye okur ve kendini TB/3'e kadar kısar.
- **Bu ikinci bekçinin işi:** Trade ödemesi oyundan çekilmiş tokenla yapılıp yeni alım yaratmadıysa onu yakalar. Spekülatör satışında kapıyı kapatır (bölüm 11-B9).
- **Zarfın kullanım sırası:** önce yapımcı payı, sonra çözülen stake ödülü, kalan oyunculara. Oyuncular arasında bölüşüm katkı puanıyla ve hak kirası düzeniyle olur (bugünkü gibi).
- **Ücret:** %3 (frende %6); yarısı yakılır, yarısı temel gelire gider.
- **Bugünkü ölçek:** %2 sınırı ~21,7 M ASTRA/hafta (~4 $). Trade alımı arttıkça ve borsaya geçince gevşer.

---

## 5. 200 M tohum ve 100 vatandaş

- **Tohum bölüşümü değişmez (R3):** pazar 100 M, zindan 10, kolezyum 4, boss 6, geri alım 7, görev 8, karnaval 3, piyango 12, Fatih 20, Konsey 10, Universe 20 (kilitli).
- **Tohum ani boşaltılamaz.** Tohumun hiçbir parçası Çıkış Kapısı dışından çıkamaz. 200 M ancak trade alımının yarısı hızında dışarı akabilir.
- **Yalnız tohumla** (model "tohum" senaryosu, trade yok, oyuncu alımı yok):
  - Kişi başı haftalık dağıtım 13.800 ASTRA'dan 36. ayda 6.700'e iner.
  - Ödeme yapan kasalar hedef rezervin %39'una düşer; oyun içi stok her harcama döngüsünde %8 erir.
  - Ücretsiz oyuncunun aylık geliri bugünkü fiyatla ~1 sent.

**Sonuç:** Tohum bir başlangıç desteğidir; oyunu dolar olarak taşıyan trade girişidir.

---

## 6. Genesis Yolu (uzun, pahalı, karşılığı fayda)

**Hedef:** Kararlı bir oyuncu 6-9 ayda ulaşır. Yol boyunca harcaması kasaları besler ve yakılır; ekosistem bunu ayrıcalıkla geri öder.

**1) Şartlar**
- hesap Sv.30+
- vatandaşlık ≥ 180 gün
- Krallık Yolu bitmiş
- Normal zindanda 18. kat bossu yenilmiş (Fatih)
- Konsey katkı kademesi son 4 haftada ≥ Altın

**2) 18 eser:** Bugünkü kurallarla düşer (büyük bosslar + Pandora kutusu ve anahtarı). Düşme oranları Aşama 2'de, ortalama ≥ 5 ay sürecek şekilde ayarlanır.

**3) Uyandırma (yeni):** Her eser Konsey'de uyandırılır. Bedel birimle ölçülür:

| Eser | Adet | Birim (her biri) | Toplam birim |
|---|---|---|---|
| yaygın | 5 | 1 | 5 |
| nadir | 5 | 2 | 10 |
| epik | 6 | 4 | 24 |
| efsanevi | 2 | 8 | 16 |
| **Toplam** | **18** | | **55** |

- 1 birim = 2.000 ASTRA × çarpan + yakılan hammadde (silo sınırına sığar).
- Aynı anda tek eser uyanır, her biri 3 gün sürer: en az 54 gün.

**4) Mühür bedeli**
- **250 $ değerinde ASTRA**, mühür anındaki 7 günlük ortalama fiyattan.
- %50 yakılır, %50 normal harcama gibi kasalara gider.
- Dolar sabit olduğu için çoğunlukla piyasadan alımla ödenir: her Genesis bir **alım + yakım** olayıdır.
- Modelde 15 Genesis 3 yılda fiyatı ~%16 yukarı taşıdı.

**5) Basım**
- Sezon 1'de en çok **100 numaralı Genesis**.
- ERC-721 sözleşmesiyle bağlı cüzdana basılır (Aşama 2).
- Hak NFT ile taşınır; satılırsa alıcıya geçer.

**6) Ayrıcalıklar (kullanıcının listesi)**
- trade'de süresiz Uydu (NFT elde tutuldukça)
- Gözlemevi %50 indirim
- Universe'de gezegen satın alma hakkı (zaten karar, KARARLAR_KESIN M)
- stake ödülünde çarpan: tek Genesis ×1,15; üç oyunun Genesis'i birleşince ×1,30
- kapı sırasında en öne geçme
- NFT pazarında komisyon indirimi

**7) Denge**
- Ayrıcalıkların yıllık değeri tam kullanımda ~420 $ (Uydu 120 $ + Gözlemevi indirimi 300 $).
- Trade'in gerçek kaybı, sahibin zaten ödeyecek olduğu kısımdır. VARSAYIM: Uydu'yu sahiplerin yarısı zaten alırdı; Gözlemevi'ni beşte biri alırdı. Bu varsayımla sahip başına ~10 $/ay.
- Bu maliyet trade gelirine göre küçük değil: bölüm 11-B5 ve öneri.

---

## 7. Stake sitesi ve Ekosistem Puanı (EP)

**Stake sözleşmesi**
- Avalanche'ta, emanet almayan bir sözleşme: sahip dahil kimse paraya dokunamaz.
- Stake çözme 14 gün bekler; bekleyen kısım puan kazanmaz.
- Beklemeden çözmenin cezası %5'tir ve yakılır.

**Ekosistem Puanı**
- **EP = stake edilen ASTRA.**
- 7 günde olgunlaşır: anlık stake ile sıra kapılmasın diye.
- Genesis sahibinde ×1,15.

**(a) Sıra önceliği (oyun ve trade kapısı)**
- Açılan yerlerin **yarısı en yüksek EP'li** hazır adaya, **yarısı en uzun bekleyen** hazır adaya gider.
- Neden yarı yarıya: anayasanın adalet ilkesi. Tamamen paraya bağlanırsa stake etmeyen hiç giremez.
- En az 25 $ değerinde olgun EP gerekir.

**(b) Oyunda güçlendirme**
- Üretim Hakkı ağırlığına her 100 $ EP için +%1, en çok +%10.
- 3 kat adalet tavanının içinde kalır. Emekle gelen katkı kademesi (en çok ×1,5) her zaman sermayeden büyük kalır.
- Ek olarak stamina yenilenmesi ve unvan gelir.
- ASTRA ödülünü çarpan güçlendirme **yok**.

**(c) Trade indirimi**
- Her 200 $ EP için %1. Tavan önerisi: **%15** (ilk taslakta %25; bölüm 11-B5).
- İlke: indirimin yıllık değeri stake'in ~%2,5'ini geçmez.

**Stake ödülü (ASTRA)**
- Kaynak yalnız gerçek gelir: öneri trade gelirinin %5'i (ödül havuzu %10'un yarısı). Bu bir kullanıcı ve trade sitesi kararıdır.
- Haftalık EP'ye göre dağılır (Genesis çarpanıyla) ve stake'e eklenir.
- Ödül kısmı 26 haftada çözülür ve çıkış zarfının içinde sayılır.

**Etkisi (model, trade 750 $/ay):**
- Stake 3 yılda dolaşan arzın ~%5,7'sini tutuyor.
- Fiyatı ~%20 yukarı taşıyor (stake alımı + arz çekilmesi).

---

## 8. Yakımlar

| Taraf | Yakım |
|---|---|
| Oyun | Her harcamanın %5'i. |
| Oyun | Çekim ücretinin yarısı. |
| Oyun | Fren açıkken kasaların haftalık %1'i. |
| Oyun | Genesis mührünün %50'si. |
| Trade | Gelirin %20'si. |
| Stake | 14 günü beklemeden çözmenin %5 cezası. |

Model (trade 750 $/ay, 3 yıl): toplam arzın ~%19'u yakılıyor. En büyük kalem trade yakımı (~1,09 milyar), sonra oyun içi yakım (~0,54 milyar) ve Genesis (~0,23 milyar).

Dürüst not: yakım arzı kalıcı yok eder ama fiyatı alım yükseltir.

---

## 9. İki kapı birbirine bağlı

- **Oyun kapısının büyüme şartı (KARAR J):** iki eşiğin birlikte tutması:
  - vatandaş başına dağıtılan ≥ 50 $/ay
  - vatandaş başına çekilebilen ≥ 16,7 $/ay
- **Çekilebilen trade'e bağlı:** çekilebilen = 0,5 × trade alımı ÷ vatandaş.
- **Model sonucu:**
  - 5.000 $/ay trade ile kapı **10. ayda** açılıyor.
  - 2.000 $/ay ve altında 3 yılda açılmıyor.
- **Trade'in kendi sınırı:** Trade uygulaması 100 hesapla sınırlı; tavanı ~2.000-4.000 $/ay.
- **Sonuç:** Oyunun 100'ü aşması için önce trade kontenjanının ya da kişi başı trade gelirinin büyümesi gerekir. "Refah korunmadan büyüme yok" ilkesi kendiliğinden uygulanır.

---

## 10. Model

**Ne yapıyor**
- Haftalık, 3 yıl, 100 vatandaş.
- Zincir: Arena eğrisi + mezuniyet + borsa havuzu. Ortak hesap `scripts/model/zincir.mjs`; sözleşmenin 1 milyar / mezuniyet tekliflerini birebir veriyor.
- Trade ödemeleri taze alımla yapılıyor; ödül havuzu kredisi geri dönüyor.
- Oyuncu alımları, stake alımları, Genesis yolu (uyandırma + mühür) modelleniyor.
- Kasalar bugünkü KARAR 7 bütçesiyle × kadran ödüyor; ayrıca kilit, Çıkış Kapısı, fren ve fiyat çarpanı var.
- Çekilen her ASTRA **satılıyor** (en kötü durum).
- Oyun sabitleri `js/config.js` ve `server/economy.js`'ten okunuyor.

**VARSAYIM'lar**

| Konu | Varsayım |
|---|---|
| Trade geliri | 0 / 250 / 750 / 2.000 / 5.000 $/ay |
| AVAX | 10,4 $ sabit |
| Oyuncu tipleri | 70 ücretsiz, 25 orta (ilk 20 $ + 2 $/ay alım), 5 büyük (ilk 200 $ + 20 $/ay) |
| Gelirden pay ağırlığı | 1 / 1,5 / 3 |
| Harcama | Gelirin %60'ı oyunda harcanır |
| Çekme isteği | Serbest bakiyenin haftada %25'i çekilmek istenir |
| Bütçe kullanımı | %90 |
| Pazar havuzları | Haftada %0,55'ini oyunculara bırakır |
| Fatih kasası | 26. haftadan sonra %1/hafta öder |
| Genesis | 5 büyük oyuncu 34-38. hafta; 10 orta oyuncu 52-78. hafta |
| Stake | 26. haftada açılır; büyükler 100 $ + 10 $/ay, ortaların yarısı 10 $ + 1 $/ay |
| Ayrıcalık maliyeti | Uydu'yu Genesis sahiplerinin yarısı zaten alırdı; Gözlemevi'ni beşte biri |

**Fiyat yolları üst sınırdır.** Modelde oyun dışı satıcı yok; tek istisna "şok" senaryosu. Bugün 2,16 milyar token başkalarının elinde ve yükselişte satılabilir. Tablodaki fiyatlar "yalnız bizim akışlarımız olsaydı" sorusunun cevabıdır.

**Sonuçlar (36 ay)**

| Senaryo | 1 M ASTRA $ (12. / 36. ay) | Piyasa değeri 36. ay | Mezuniyet (hafta) | Çıkış ÷ trade alımı | Ücretsiz oyuncu $/ay 36. ay (dağıtılan / çekilen) | Kişi başı çekilebilir $/ay 36. ay | Kapı |
|---|---|---|---|---|---|---|---|
| Trade yok (t0) | 2,32 / 13,54 | 104.684 $ | 44 | 0 | 5,77 / 0 | 0 | hiç |
| 250 $/ay | 3,53 / 19,31 | 145.546 $ | 36 | 0,46 | 8,13 / 0,07 | 0,39 | hiç |
| 750 $/ay | 7,63 / 48,90 | 363.810 $ | 26 | 0,41 | 20,09 / 1,35 | 2,82 | hiç |
| 2.000 $/ay | 34,51 / 209,68 | 1,61 M $ | 10 | 0,21 | 68,34 / 4,34 | 9,04 | hiç |
| 5.000 $/ay | 175,34 / 1.050,80 | 8,22 M $ | 4 | 0,09 | 280,04 / 9,78 | 23,91 | 10. ay |
| 750 $/ay + %30 şok (20. hafta) | 5,27 / 42,42 | 297.054 $ | 34 | 0,41 | 19,81 / 1,34 | - | hiç |
| 750 $/ay, 78. haftada durur | 7,63 / 30,64 | 226.333 $ | 26 | 0,40 | 11,33 / 0 | 0 | hiç |
| 750 $/ay, oyuncu alımı yok | 3,05 / 19,92 | 130.541 $ | 39 | 0,27 | 9,16 / 2,51 | - | hiç |
| Yalnız tohum | 0,19 / 0,19 | 373 $ | yok | 0 | 0,004 / 0 | 0 | hiç |

"Çıkış ÷ trade alımı" 3 yıllık toplamdır. Haftalık en yüksek oran her senaryoda tam 0,50 (tavan).

---

## 11. Bulgular ve öneriler

### B1. Ölçek uyuşmazlığı (en önemli)

**Bulgu**
- **Tohumun değeri:** Bugünkü fiyatla 200 M ASTRA = ~38 $.
- **Trade girişi:** 750 $/ay trade geliri ilk ay oyuna haftada 120-190 M ASTRA sokuyor (modelin ilk ay ortalaması); bu, tohumun yarısı ile tamamı arası.
- **Oyuncu alımı:** Bir oyuncu 200 $ ile 1 milyar ASTRA alır, yani bütün tohumun 5 katı.
- **Kişi başı dağıtım** (tasarım = yalnız tohumla 13.800 ASTRA/hafta):

  | Dönem | Tasarıma göre kat |
  |---|---|
  | ilk ay | ~560 |
  | 12. ay | ~26 |
  | 36. ay | ~9 |

- **Oyundaki ASTRA stoku:** tasarımın 13-24 katı.
- **Fiyat çarpanı ters yöne itiyor:** Bugünkü çarpan, fiyat yükseldikçe oyun içi bedelleri düşürüyor: 6. ayda 0,29, 2. yılda alt sınır 0,05. Böylece bedeller 20'de 1'e iniyor, gelir ise tasarımın çok üstünde kalıyor.

**Sonuç**
- **Dolar hesabı tutarlı:** ücretsiz oyuncu trade 750 $/ay ile ayda 9-20 $ değer görüyor.
- **Oyun içi ASTRA anlamını yitiriyor:** Asker, seviye ve bilet gibi ASTRA bedelleri pratikte bedava olur. Genesis uyandırması bile ilk yılda bir haftalık gelirden ucuz kalır.

**Öneri: Oyun İçi Fiyat Endeksi (OFE)**

| Konu | Öneri |
|---|---|
| Endeks | Son 4 haftada kişi başı haftalık dağıtım ÷ tasarım dağıtımı (13.800 ASTRA); en az 1 |
| Değişim hızı | Yükselişte haftada en çok %25, düşüşte %5 |
| Neyi çarpar | Oyun içi bütün ASTRA bedellerini, sabit ASTRA ödüllerini ve pazar koridorlarını; yüzdeyle ödenen kasa ödemelerini çarpmaz |
| Fiyat çarpanıyla ilişkisi | Etkin çarpan = en büyüğü(OFE, fiyat çarpanı). Fiyat düşünce dolar tabanı yine korunur |

**Faydası**
- Gelir ile bedel arasındaki oran tasarımdaki gibi kalır.
- Trade girişi ne kadar büyük olursa olsun oyun dengesi bozulmaz.
- Dolar olarak oynamanın bedeli, ekosistem büyüdükçe kendiliğinden artar.

**Uyarı:** Bu, 30 Eylül kararı olan fiyat çarpanının işleyişini değiştirir. Koda geçmeden önce denge modelinde (`scripts/model/denge_modeli.mjs`) 50-1000 oyuncuyla sınanmalıdır. Aşama 1'in ilk işi budur.

### B2. Altın kural tutuyor

- 9 senaryo × 156 haftada sıfır ihlal.
- Haftalık çıkış ≤ trade alımının yarısı; trade yoksa çıkış yok.
- Spekülatör şoku dışında fiyat hiç düşmedi.
- Trade 78. haftada durunca çıkış en geç bir hafta içinde sıfıra iniyor, fiyat düşmüyor.

### B3. Nakit çıkışı sınırlı, dağıtılan değer büyük

| Trade geliri | Kişi başı çekilebilir (36. ay) | Ücretsiz oyuncuya dağıtılan değer (kilitli dahil) |
|---|---|---|
| 750 $/ay | ~3 $/ay | ~20 $/ay |
| 2.000 $/ay | ~9 $/ay | ~68 $/ay |

Bu, kullanıcının "oyun ekosistemi eritmesin" şartının doğal sonucudur. Oyunculara açıkça anlatılmalı: rehberde "Akış dengesi" bölümü (Aşama 1).

### B4. Kapı ancak 5.000 $/ay trade ile açılıyor

Bölüm 9. Kapının açılması trade kontenjanının ya da kişi başı trade gelirinin artmasına bağlı.

### B5. Ayrıcalıkların trade'e maliyeti

**Bulgu:** 15 Genesis sahibi ve stake indirimleri trade'den ~175 $/ay götürüyor (36. ay). Bu maliyet trade gelirine göre çok farklı ağırlıkta:

| Trade geliri | Maliyetin gelire oranı |
|---|---|
| 250 $/ay | %68 |
| 750 $/ay | %24 |
| 2.000 $/ay | %9 |
| 5.000 $/ay | %3,5 |

Motorun kendisini yiyebilir.

**Öneri (otonom kural):** Açık Genesis mührü sayısı = trade aylık gelirinin %10'u ÷ 10 $.

| Trade geliri | Açık mühür |
|---|---|
| 750 $/ay | 7 |
| 2.000 $/ay | 20 |
| 5.000 $/ay | 50 |

- Sezon tavanı 100 kalır.
- Ayrıcalıkların trade'e toplam maliyeti gelirin ~%10'unu geçmez.
- Trade indirim tavanı %15.
- Genesis sahiplerinin süresiz Uydu'su trade'de 100 kontenjanın dışında ayrı bir "Genesis yeri" olarak sayılır; ödeyen bir kullanıcının yerini almaz.

### B6. Tohum tek başına yetmez

Bölüm 5. Trade girişi olmadan dağıtım 3 yılda yarıya iner. Eriyen bir şey yoktur (yüzdeyle ödeme), ama refah girişe bağlıdır.

### B7. Fiyat çarpanının alt sınırı

Fiyat çok yükselirse çarpan 2. yılda alt sınıra (0,05) iniyor ve orada kalıyor. B1'deki OFE bunu çözer. OFE olmazsa alt sınırın yükseltilmesi (ör. 0,2) gerekir.

### B8. Genesis mührü ilk yılın en büyük tek alım olayı

- 250 $'lık mühür, trade 750 $/ay iken 5 büyük oyuncunun mührü tek başına bir aylık trade gelirinden büyük alım.
- Mühür + yakım + uyandırma: fiyat 3 yılda ~%16 daha yüksek.

### B9. Şokta kapı kendini kapatıyor

- 20. haftada %30'luk satış olduğunda Çıkış Kapısı o hafta **sıfır**a indi (net piyasa alımı eksiye döndü).
- Fren açıldı, kasaların %1'i yakıldı (31 M ASTRA).
- Kadran 0,98'e indi.
- Ertesi ay her şey normale döndü.

---

## 12. Bugünkü kodda yeni kuralı bozan 5 sorun (Aşama 1'de düzelir)

1. **Çekim tavanı haftalık alımın 2 katına çıkabiliyor.** Son 4 haftanın **toplam** dış alımının yarısı **haftalık** tavan yapılıyor (`server/world/piyasa.js` externalBuy + `server/economy.js` dualWithdrawCap).
2. **Alım yokken de çıkış var.** Dış alım sıfırken bile çıkışa %2 kuralının %20'si kadar taban izin veriyor (KARAR 5). Yeni kural tabanı kaldırır. `tests/test_karar_5_6.mjs` taban satırları yeni karara göre değişir; bu, testi zayıflatmak değil, kararın güncellenmesidir.
3. **Trade payı çift sayılıyor.** Müşterinin piyasadan aldığı ASTRA zaten net alımda sayılıyor; oyuna aktarılan %40'ı da ayrıca ekleniyor. Üstelik kredi ödemesi de "alım" sayılıyor.
4. **Oyunun yakımı piyasa değerini düşük gösteriyor.** Piyasa değeri ölçüsü fiyat × (arz − yakılan) olduğu için fren ve k çarpanı bundan etkileniyor. Fiyata dayalı ölçüye geçilmeli.
5. **Yapımcı payı çıkış hesabında yok.** %3 yapımcı payı zincire gidiyor ama çıkış hesabına girmiyor.

---

## 13. Eylem planı

| Aşama | İş | Durum |
|---|---|---|
| 0 | Belge, makro model (`scripts/model/makro_model.mjs`), ortak zincir hesabı (`scripts/model/zincir.mjs`), değişmez testi (`tests/test_makro_model.mjs`), anayasa 9-10. ilke | **bitti (15 Ekim 2026)** |
| 1a | OFE'yi denge modelinde sınama (50-1000 oyuncu); sonuç kullanıcıya | onay bekliyor |
| 1b | Çıkış Kapısı + Ödeme Kadranı + 5 sorunun düzeltilmesi (`server/economy.js`, `server/world/piyasa.js`, `server/world/haftalik.js`, `js/treasury.js`, `js/config.js` EKOSISTEM bloğu); Konsey panosu; rehber "Akış dengesi" bölümü; testler | onay bekliyor |
| 2 | Genesis Yolu (şartlar, uyandırma, dolar mühür, gelire bağlı açık mühür sayısı) + `contracts/GenesisNFT.sol` (Fuji) | onay bekliyor |
| 3 | Trade sitesi (ayrı proje, SITE sohbeti): Bot Kasası 20/30/10/40; taze ödeme ile kredi ödemesini ayrı yayımlama (TB ölçüsü); Genesis sahipliğini zincirden okuyup süresiz Uydu + Gözlemevi %50 + "Genesis yeri"; EP indirimi (tavan %15) | kullanıcı onayı |
| 4 | Stake sitesi (yeni proje): emanetsiz sözleşme, 14 gün bekleme, 7 günde olgunlaşan EP, erken çözme yakımı; bağımsız denetim → Fuji → ana ağ | sonra |
| 5 | EP'nin oyuna bağlanması: sıra yarı EP / yarı bekleme, Üretim Hakkı'na tavanlı katkı | sonra |
| 6 | Ölçüm döngüsü: haftalık pano, aylık kısa rapor, 3 ayda bir model gerçek veriyle | sürekli |

---

## 14. Kullanıcının karar vermesi gerekenler (önerim kalın)

1. Çıkış payı: **0,5** (trade alımının yarısı). Daha sıkı istenirse 0,3-0,4 olabilir.
2. Ödeme Kadranı: üs **0,5**, sınır **0,6-1,5**, adım **%5**.
3. **Oyun İçi Fiyat Endeksi (B1)** denge modelinde sınansın mı? **Evet** (yoksa oyun içi ASTRA bedelleri anlamsızlaşır).
4. Genesis mührü **250 $**; sezon tavanı **100**; açık mühür sayısı **trade gelirine bağlı** (B5).
5. Uyandırma **55 birim × 2.000 ASTRA**; 3 gün/eser.
6. EP: oyunda en çok **+%10**; trade indirimi her 200 $'a %1, tavan **%15**; sıra **yarı EP yarı bekleme**.
7. Stake ödülünün kaynağı: trade gelirinin **%5'i** (ödül havuzunun yarısı). Trade sitesi kararı.
8. Tohum bölüşümü **değişmez**.
