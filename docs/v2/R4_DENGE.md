# Realm of AdAstra v2 — R4: Denge Modeli

Tarih: 7 Ekim 2026 · Durum: TASLAK, onay bekliyor · Kod yok
Araç: `node scripts/model/denge_modeli.mjs N=200 fiyatOlcek=0.003` (ayarlar dosyanın başında; `grid=1` tarama). Sonuçlar docs/v2/model_r4_N50/N200/N1000.json.
İlkeler: docs/v2/EKONOMI_ILKELERI.md. Adlar: ASTRA, Sirius, Üretim Hakkı.

## 1. Soru ve üç bulgu

Soru: haftalık kota, Üretim Hakkı dağılımı, pazar tohumu, bataklar ve geri alım hangi ayarlarla (a) fiyatları bir yılda %50'den fazla düşürmez, (b) kasaları 12 ay yaşatır, (c) ücretsiz oyuncuyu ilerletir, (d) gelir uçurumu yaratmaz, (e) kotayı boşa harcamaz? 50, 200 ve 1000 oyuncu; hiç dış para girmeyen dünya (en kötü hal).

**Bulgu 1 — sorun miktar değil, değer.** Bugünkü fiyat listesiyle (demir 4, odun 2,5, buğday 0,9 ASTRA…) tam kotada bir oyuncunun haftalık üretimi ~1,2 milyon ASTRA ediyor; 200 oyuncuda haftada 240 milyon. Pazarın tamamı 100 milyon. Kota ne kadar kısılırsa kısılsın (termostat kişi başı kotayı tam alanın %5'ine indirdi) fiyat ilk ayda tabana iniyor ve satılamayan mal çöpe gidiyor. 200 milyonluk bir ekonomide bu fiyat listesi 300 kat büyük.
→ **Fiyat listesi yeniden ölçeklenir: bugünkü ASTRA tutarlarının ~%0,3'ü** (ör. 1.000 demir = 12 ASTRA, 1.000 buğday = 2,7 ASTRA; seviye, bilet, ordu bedelleri de aynı ölçekle). Oyun hissi (sefer, üretim hızı) aynı kalır; yalnız ASTRA etiketleri küçülür. Ölçeğin bir kısmı fiyattan bir kısmı miktardan alınabilir (öneri: fiyat ×0,01 + üretim hızı ×0,3); kesin bölüşüm R8'de.

**Bulgu 2 — kota termostatı işliyor.** Senin "talep artınca fiyat artar, fiyat artınca arz artar" döngün: her kaynağın kotası haftada bir fiyata bakar; fiyat açılış fiyatının üstündeyse kota %10 artar, altındaysa %10 azalır (kişi başı en az tam alanın %5'i, en çok tamamı). 50 oyuncuda kota kişi başı %71'e çıkıyor, 1000 oyuncuda %5'e iniyor; fiyat endeksi bir yıl boyunca 0,79-1,01 arasında kalıyor, çöp sıfır. Yönetici çarpanı (ana kol) termostatın üstüne biner.

**Bulgu 3 — kasalar haftada %2-3 ödemeli.** Haftalık %5-10 ödeme oranlarıyla kasalar 6-9 ayda bitiyordu; %2,5 (zindan, görev), %2 (kolezyum), %3 (dünya bossu), ücretsiz pay haftada kasanın ≤%1,5'i ile 12-25 ay dayanıyor. Harcama girişi olduğunda daha uzun.

## 2. Sonuçlar (fiyat ölçeği 0,003, termostat, hiç dış para yok, 12 ay)

| Oyuncu | Fiyat endeksi en düşük | Kasa ömrü en düşük | Ücretsiz oyuncu 12. ay seviyesi | Ücretsiz aylık net (ASTRA) | Balina / ücretsiz gelir | İlk %5'in gelir payı | Kota kullanımı | Kişi başı kota (tam alanın) | Otorite | Çöp |
|---|---|---|---|---|---|---|---|---|---|---|
| 50 | 1,01 | 13,6 ay | 13 | 9.900 | 3,5× | %11 | %71 | %71 | 11 | 0 |
| 200 | 0,94 | 13,5 ay | 12 | 2.900 | 3,5× | %9 | %100 | %13 | 13 | 0 |
| 1000 | 0,79 | 12,0 ay | 12 | 800 | 2,8× | %10 | %100 | %5 | 14 | 0 |

Beş hedefin beşi üç büyüklükte de tutuyor. Dış para girince (orta 0,5 M, balina 5 M/yıl) sonuç değişmiyor (fiyat 0,94, kasalar 13,5 ay). ASTRA'nın dolar fiyatı yıl içinde 3 katına çıkarsa dolar bazlı fiyat endeksi 1,15'in altına inmiyor; yarıya inerse endeks 0,60'a geriliyor ve geri alım kasası 4,7 M ASTRA harcayıp destekliyor.

Okuması: **ekonominin boyutu sabit (200 M ASTRA), kişi başına düşen pay oyuncu sayısıyla bölünüyor.** 50 kişide bir oyuncu alanlarını günde ~17 saat çalıştırır, 1000 kişide ~1,2 saat. Bu, "önce küçük kitle" ilkesinin sayısal karşılığı.

## 3. Üretim Hakkı dağılımı (kota kimin olur)

- Haftalık kota kaynak başına: **K_r = taban_r × 168 × aktif oyuncu × kişi başı kota (termostat) × Otorite çarpanı × çalışma saati × yönetici çarpanı.**
- Oyuncunun ağırlığı = aktiflik (sefer dönen zaman payı) × (1 + %2,5 × hesap seviyesi) × katkı kademesi (Yok 1 … Elmas 1,5). **Adalet tavanı: en yüksek ağırlık en düşüğün 3 katını geçemez.**
- Üretim Hakkı_i = K_r × ağırlık_i / toplam ağırlık. Kullanılmayan hak, hakkını aşan üretimi olanlara orantılı dağılır (hafta içinde).
- Sonuç modelde: balina/ücretsiz kişi başı gelir 2,8-3,5×, ilk %5'in payı %9-11. Emek payı korunuyor.

## 4. Pazar ve geri alım

- Pazar tohumu 100 M ASTRA, 6 havuza değer ağırlıklı (buğday 13,3 M · taş 11,8 M · odun 22,2 M · kömür 13,3 M · demir 23,6 M · şifalı ot 15,8 M). Her havuzun hammaddesi = ASTRA / açılış fiyatı.
- Koridor: taban açılışın 0,5'i, tavan 2,5'i. Komisyon %2 (hazine bölüşümüne), hammadde yakımı %2.
- Geri alım: fiyat açılışın 0,8'inin altına inince kasanın haftada %3'ü ile alır ve yakar. 1000 oyuncuda yılda 4 M ASTRA harcadı, fiyatı 0,79'da tuttu.
- Hazırlık Deposu toplam vaadi 10 M ASTRA (Universe rezervinin yarısı); kişi başı en çok 4 haftalık üretim. Üstü kabul edilmez.
- Otorite: 1. seviye 2 M birim, her seviye ×1,4; çelik payı (%30) Universe'e kadar Konsey kasasından 0,05 ASTRA/birim. Ortak kasa %5 + gönüllü katkı %10 ile bir yılda 11-14. seviye.

## 5. Dolar hedefi ve Kapı kuralı (kullanıcı mesajı, 7 Ekim)

Hedef: ilk 1.000 kullanıcı ayda en az 100-300 $ kazanmadan yeni kullanıcı yok; önce küçük bir topluluk refaha, sonra yeni vatandaşlar.

**Dürüst hesap.** Oyun dolar üretmez; dolar yalnız ASTRA'ya dışarıdan talep gelince (alıcı) oluşur. Kasalar yılın ilk aylarında ayda ~5 M ASTRA dağıtabiliyor (sonra azalır). Kişi başı aylık dolar = 5 M × ASTRA fiyatı / oyuncu. Hedef için gereken ASTRA piyasa değeri (2,13 milyar arz):

| Oyuncu | 100 $/ay için piyasa değeri | 300 $/ay için |
|---|---|---|
| 50 | ~2 M $ | ~6 M $ |
| 200 | ~9 M $ | ~26 M $ |
| 1000 | ~43 M $ | ~128 M $ |

Bugünkü piyasa değeri ~430 $. Yani hedef, oyun ayarı değil **piyasa değeri hedefi**. Oyunun işi adil, kıt, ölçülü bir dağıtım makinesi olmak; dolar, ASTRA'ya net alım gelince oluşur. Bu yüzden kapı, tahmine değil ölçüme bağlanır.

**Kullanıcı notu (7 Ekim):** hedefe ille dışarıdan yatırımcıyla değil, oyun oynandıkça yakımla arz azalarak ve kilitli bakiye kuralıyla da yaklaşılır; ama oynayanların dengeli ASTRA alımını sağlayan bir model şart. Düzeltme: yakım tek başına fiyatı yükseltmez (fiyat ancak alımla yükselir); yakım ve kilit satış baskısını azaltır, aynı alımın daha çok fiyat yükseltmesini ve geri kaymamasını sağlar.

**Gereken para, piyasa değeri değil, havuza giren net AVAX (eğri + borsa matematiği, reference_adastra_token):**
- ASTRA Arena eğrisinde (fiyat ∝ arz²); 7,3 milyar satılınca borsaya geçer: geçiş için ~490 AVAX (~5.600 $) alım gerekir; borsa havuzu ~503 AVAX + 2,45 milyar token ile açılır (fiyat ~2,35e-6 $).
- Borsada fiyat ∝ (havuzdaki AVAX)². Hedef fiyat p = 100 $ × oyuncu / (ayda 5 M ASTRA). Hiç satış olmadan gereken net AVAX girişi (AVAX 11,43 $):

| Oyuncu | 100 $/ay: net giriş | 300 $/ay | kâğıt üstü piyasa değeri (10 milyar arz) |
|---|---|---|---|
| 50 | ~9.900 AVAX ≈ 113.000 $ | ~196.000 $ | 10 M $ |
| 200 | ~20.300 AVAX ≈ 232.000 $ | ~402.000 $ | 40 M $ |
| 1000 | ~45.900 AVAX ≈ 525.000 $ | ~909.000 $ | 200 M $ |

Satışlar havuzdan AVAX çeker (haftalık çekim sınırı ≤%2 fiyat düşüşü bunu frenler); rakamlar AVAX fiyatıyla oynar.

**Dengeli alım modeli ilkeleri (R4c'de modellenecek):** oyun içi ASTRA ihtiyacı bedava dağıtımdan biraz fazla (yavaş-ücretsiz / hızlı-alımlı); alımlar borsadan geçer; kaynaklar: oyun içi ihtiyaç, trade uygulamasının %40'ı, hub/NFT; frenler: kilit, haftalık sınır, çekim ücreti; yakımlar: harcama %5, çekim ücretinin %30'u, pazar hammadde yakımı; gösterge: aylık net AVAX girişi (Konsey ekranı). Sonraki adım önerisi: **R4c ASTRA fiyat yolu modeli** (scripts/model/token_economy_model.mjs bu ayarlarla, 3 yıl, 50/200/1000 oyuncu, satış oranı, trade girişi senaryoları; kapının hangi ayda açılacağı).

**Karar gerektiren çelişki:** bugünkü "dolar tabanı" kuralı ASTRA değerlenince ödülleri ASTRA olarak küçültüyor (dolar değeri fiyatın yalnız 0,4 üssüyle büyür). Refah hedefi için **ödüller ASTRA olarak sabit** (kasa gücüne bağlı), **bedeller dolar tabanlı** olmalı; böylece ASTRA değerlendikçe oyuncunun dolar geliri birebir büyür, giriş maliyeti dolar olarak sabit kalır.

**Kapı kuralı (öneri; trade sitesindeki 100 sınırının benzeri, aynısı değil):**
1. Vatandaş sayısı sınırı: açılış 50. Her ay şu gösterge tutuyorsa sınır %10 artar: son 3 ayın ortalamasında **aktif vatandaş başına aylık net kazanç ≥ hedef** (başlangıç 100 $, senin elinle 300 $'a çıkarılır). Tutmuyorsa sınır artmaz, gerekirse düşer (yeni alım durur, mevcutlar kalır).
2. Bekleme sırası: kayıt her zaman açık, ama sıraya alınır; sıradakiler oyunu misafir olarak gezer, Konsey göstergelerini görür, sıra numarasını bilir.
3. Pasiflik: 14 gün giriş yok → uyarı; 30 gün → "askıya alınır", yeri sıradakine geçer. Askıdaki hesabın her şeyi (binalar, bakiye, hak) saklanır; dönmek isteyince sıranın **önüne** alınır (eski vatandaş önceliği). Trade sitesinden farkı: hesap silinmez, açık artırma yok, dönüş önceliği var.
4. Aktif sayılmak: haftada en az 3 gün giriş ve en az 1 sefer (bot tek başına yetmez).
5. Sahte hesap: doğrulanmış e-posta + bağlı cüzdan, cüzdan başına tek hesap, küçük kayıt harcı (ASTRA, kasaya) — sıraya girmek bile harç ister.
6. Göstergeler Konsey ekranında: vatandaş sayısı / sınır, sıradaki kişi, kişi başı aylık dolar, hedefe uzaklık, piyasa değeri.

## 6. Yönetici kolları (tek ayar dosyası + panel)

Kota çarpanı (termostat üstüne) · termostat adımı ve hedefi · kişi başı kota alt/üst sınırı · adalet tavanı (3×) · koridor taban/tavan · geri alım eşiği ve hızı · kasa ödeme oranları · ücretsiz pay haftalık tavanı · fiyat ölçeği · kapı sınırı, hedef dolar, pasiflik günleri · Hazırlık Deposu vaadi.

## 7. Model varsayımları (R8'de gerçek kodla değiştirilecek)

Seviye süresi 3 + 1,5 × seviye aktif gün, seviye bedeli 500 × seviye^1,5 (ölçekli); alet onarımı üretimin %25'i (odun, demir) + değerinin %30'u ASTRA; stamina buğdayın %15'i; asker 14 buğday + 0,5 şifalı ot/hafta; ordu harcaması gelirin %30/50/60'ı; bot ücreti üretim değerinin %30'u; oyuncu tipleri %70 ücretsiz (günün yarısı), %25 orta, %5 balina (bot); aylık %3 yeni oyuncu; piyango ve çark dışarıda (net sıfıra yakın).

## 8. Bu adım için kararlar

1. Fiyat ölçeği (~%0,3) kabul mü? Bölüşüm önerisi: fiyat ×0,01 + üretim hızı ×0,3 (R2'deki hızlar 3'e bölünür) — ya da yalnız fiyat?
2. Kota termostatı (fiyat izler, ±%10/hafta, kişi başı %5-100) + yönetici çarpanı kabul mü?
3. Üretim Hakkı dağılımı ve adalet tavanı 3× kabul mü?
4. Kasa ödeme oranları (%2-3/hafta) kabul mü?
5. Ödüller ASTRA sabit, bedeller dolar tabanlı (bölüm 5) kabul mü?
6. Kapı kuralı: açılış 50, hedef 100 $ (sonra 300), pasiflik 14/30 gün, dönüş önceliği, kayıt harcı — kabul mü, rakamlar?

Onay gelince R4b Galaksi Pazarı (varlık listesi, Universe satırları kilitli, eşya pazarı), sonra R5 nüfus ve ordu.
