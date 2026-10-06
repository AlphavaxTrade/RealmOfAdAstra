# Realm of AdAstra v2 — R3: Kasalar (baştan)

Tarih: 7 Ekim 2026 · Durum: TASLAK, onay bekliyor · Kod yok
Amaç: Realm tek başına en az 1 yıl oynanabilsin; kasalar ve pazar ölçülebilir biçimde boşalsın; Universe'e geçişin tetikleri belli olsun.
Model: scripts/model/world_economy_model.mjs (30 Eylül'de yazılan gerçek AMM'li dünya modeli); sonuçlar docs/v2/model_r3_*.json.

## 1. Bugün ne var (koddan)

**Her ADA harcamasının bölünüşü:** %5 yakım · %3 yapımcı · %6 UBI · %86 hazine.
**Hazinenin 6 kasaya bölünüşü:** Zindan %30 · Kolezyum %15 · Dünya bossu %15 · Pazar geri alımı %15 · Görev & ücretsiz oyuncu %21 · Karnaval %4.

| Kasa | Tohum | Dolar | Boşalır | Kural |
|---|---|---|---|---|
| Pazar havuzları (AMM: odun, demir, buğday + parça/kutu/anahtar/parşömen) | ~113 M | Oyuncu hammadde alınca | Oyuncu hammadde satınca | Fiyat koridoru; taban fiyatta satış durur; %2 komisyon + %2 hammadde yakımı |
| Zindan Ganimet Kasası | 10 M | Hazine %30 + kapı harcı | Kat zaferleri | Tek ödül ≤ kasanın %2'si; kasa hedefin altındaysa ödül küçülür (en az %15) |
| Kolezyum Şampiyonluk | 4 M | %15 | Haftalık ilk 10 (kasanın %30'u) | |
| Dünya Bossu | 6 M | %15 | Pazar günü kasanın %10'u | En hızlı boşalan |
| Pazar geri alımı | 7,2 M | %15 | Fiyat düşünce hammadde alıp yakar | |
| Görev & ücretsiz oyuncu | 8 M | %21 | Rehber görevleri + aylık ücretsiz pay (piyasa değerinin %1'i, kişi ≤100$) | Pay kilitli gelir |
| Karnaval (çark) | 4 M | %4 + çark bedelinin %80'i | Çark ödülleri | |
| Piyango | 20 M | Bilet bedelinin %70'i | Haftalık tek kazanan, 2 katı | Bilet devreder |
| UBI | 0 | Harcamanın %6'sı | Pazartesi, 3. seviye+, kişi ≤%5 | |
| Fatih kasası (zindan 18. boss) | 20 M (karar var, kod yok) | Ordu harcamasının payı | 18. boss ilk zaferi | |
| Çekim havuzu | — | — | Haftada fiyatı ≤%2 düşürecek miktar; ücret %3 (%70 UBI, %30 yakım); fren | Sunucuda var |

Toplam tohum: 113 + 39,2 + 20 + 20 = **192 M** (200 M'den).

## 2. Model ne diyor (200 oyuncu, aylık %3 büyüme, 2 yıl)

| Senaryo | Pazar ADA (113 M'den) | Ödül kasaları toplamı | Ücretsiz oyuncu 12. ayda | Fiyatlar |
|---|---|---|---|---|
| Para giriyor (orta 1 M, balina 10 M yatırıyor) | 83 M (1. ay) → 82 M | 111 M → 218 M (büyüyor) | 2. seviye | 1. aydan itibaren TABAN |
| Hiç para girmiyor | 81 M (1. ay) → 80 M | 111 M → 98 M (12. ay) → 88 M (24. ay) | 2. seviye | TABAN |
| Hiç para girmiyor + alet onarımının ADA payı %30 | 80 M | 111 M → 97 M → 88 M | 6. seviye | TABAN |

Üç çıplak gerçek:
1. **Kasalar boşalmıyor, hammadde değersizleşiyor.** Fiyatlar daha ilk ayda koridor tabanına çakılıyor (odun 1,2 · demir 2,0 · buğday 0,45) ve orada kalıyor; pazardan 33 M ADA ilk ayda çıkıyor, sonra taban satışı durduruyor. Yani "kasalar boşaldıkça Universe" tetiği hiç gelmeyebilir; gelen şey "pazar tıkandı" olur. Realm'in tek başına yılı için asıl ihtiyaç **hammadde batakları** (bölüm 4).
2. **Ücretsiz oyuncu ilerleyemiyor:** kazandığı ADA'nın %100'ü alet onarımına gidiyor, 3 yıl 2. seviyede. Alet onarımının ADA payı %30'a inince 12 ayda 6. seviye (30 Eylül önerisi, henüz uygulanmadı; karar 1).
3. Ödül kasaları yavaş eriyor (parasız dünyada yılda ~%12); en hızlı boşalan Dünya bossu (haftada %10). Para giren dünyada kasalar büyüyor.

## 3. Yeni kasa düzeni (öneri)

### 3a. 200 M'nin dağılımı

| Kasa | Yeni tohum | Not |
|---|---|---|
| Pazar havuzları (6 hammadde + eşya satırları) | 100 M | Havuz başına miktar R4'te (Galaksi Pazarı) |
| Zindan | 10 M | |
| Kolezyum | 4 M | |
| Dünya bossu | 6 M | Haftalık dağıtım %10 → **%6** (en hızlı boşalan) |
| Pazar geri alımı | 7 M | |
| Görev & ücretsiz oyuncu | 8 M | |
| Karnaval | 3 M | |
| Piyango | 12 M | 20 M'nin tamamı hiç gerekmiyor (model: 2 yılda 20 M'de sabit) |
| Fatih kasası | 20 M | Onaylı karar |
| Sirius Konseyi ADA kasası | 10 M | YENİ: Otorite'nin çelik payının ADA ile tamamlanması buradan değil, oyunculardan gelir; bu kasa Sirius savunması + Konsey projeleri + Universe açılış günü "ilk ihracat primi" |
| **Universe Tohum Rezervi** | 20 M | YENİ, KİLİTLİ: Realm hiç dokunamaz; Universe açılınca Universe havuzlarına. Böylece Realm 200 M'nin tamamını yiyemez |
| Toplam | 200 M | |

### 3b. Harcama bölünüşü
%5 yakım · %3 yapımcı · %6 UBI · %86 hazine — aynı. Hazine dağılımı yeniden: Zindan 27 · Kolezyum 14 · Dünya bossu 12 · Geri alım 15 · Görev & ücretsiz 18 · Karnaval 4 · **Fatih 5** · **Sirius Konseyi 5** = 100.

### 3c. Çıkış kuralları (korunur + ekler)
- Tek ödül ≤ kasanın %2'si; kasa hedefin altındaysa ödül oranla küçülür, en az %15 (bugünkü).
- Her kasanın **hedef rezervi** = 12 aylık ortalama ödemesi; sağlık = bakiye / hedef. Sağlık göstergesi Konsey ekranında herkese açık (şeffaflık; Universe tetiği de buradan okunur).
- UBI, ücretsiz pay, çekim havuzu, fren, fiyat çarpanı: bugünkü kurallar aynen (30 Eylül kararların).

## 4. Tek başına yıl için hammadde batakları (asıl iş)

Pazar tabana çakıldığı için hammaddeye oyun içinde **talep** lazım. v2'de olanlar ve yenileri:

| Batak | Ne yer | Büyüklük |
|---|---|---|
| Madencilik Otoritesi inşaatı | Taş %40, Demir %20, Odun %10 (+çelik payı ADA) | 1→10. seviye toplam ~2,3 M birim; 20'ye ~44 M |
| Sirius ortak kasası | Çıkarılanın %5'i (kaynak) | Sürekli; Otorite + savunmaya akar |
| Alet onarımı | Odun + Demir (+ADA %30) | Sürekli (bugün var) |
| Silo yükseltme | Kapasitenin yarısı | 18 seviye |
| Teçhizat yapımı/yükseltme | Demir, Kömür (yeni), Taş | R7 (yıldız metali Universe'e kadar yok; Demir+Kömür "çelik kaplama" yerli) |
| Asker beslemesi + iyileşme | Buğday, Şifalı Ot | Sürekli |
| Stamina | Buğday | Sürekli |
| Konsey projeleri (YENİ) | Sirius savunma duvarı, köprü, liman: her biri büyük ortak inşaat; bitince herkese küçük kalıcı bonus (ör. +%2 üretim) | Yılda 4-6 proje, her biri Otorite seviyesi ölçeğinde |
| **Universe Hazırlık Deposu (YENİ)** | Oyuncu Yük İskelesi'ne hammadde kilitler; Universe açılınca o stok Galaksi Pazarı'nda **taban fiyatın üstünde garantili** satılır (ör. koridor orta fiyatından) | Sınırsız; hem batak hem oyuncunun Universe birikimi |
| Geri alım kasası | Fiyat tabana yaklaşınca ADA ile alıp yakar | Kasanın haftada ≤%3'ü |

Hazırlık Deposu, "insanlar Universe'e hazırlık yapsın" isteğinin tam karşılığı: bugün değersiz hammadde, yarın Universe'de çelik ve gıda olacak; erken biriktiren kazanır.

## 5. Universe'e geçiş tetikleri (3 aşama)

Konsey ekranında herkese görünen 4 gösterge:
1. **Pazar ADA rezervi** (tohumun yüzdesi)
2. **Taban süresi**: son 8 haftada 6 hammaddeden kaçı taban fiyatta
3. **Ödül kasası sağlığı** (ortalama)
4. **Aktif oyuncu** (son 7 gün) ve Hazırlık Deposu stoğu

| Aşama | Ne açılır | Tetik (öneri) |
|---|---|---|
| 0 Realm | Bugünkü oyun + Otorite + Konsey projeleri | Yayın |
| 1 Hazırlık | Yük İskelesi: Hazırlık Deposu; Gözlem Kulesi "yakında" | ≥4 hammadde 8 haftadır tabanda VEYA pazar rezervi < %70 |
| 2 Ön sipariş | Galaksi Pazarı'nda Universe satırları görünür, "ön sipariş" (Universe çeliği/alüminyumu için ADA ile ön alım, teslim açılışta) | Aktif oyuncu ≥ 300 VE kasa sağlığı < %60 VEYA Hazırlık Deposu ≥ 8 haftalık toplam üretim |
| 3 Universe | Oyun açılır, Universe Tohum Rezervi havuzlara | Senin elle onayın (yönetici paneli düğmesi); tetikler yalnız "hazır" der |

Hiçbir aşama kendiliğinden açılmaz; göstergeler "hazır" diye yanar, düğmeye sen basarsın.

## 7. Durum — ONAYLI (7 Ekim 2026)
Kullanıcı 5 kararı da kabul etti: alet onarımı ADA payı %30; 200 M dağılımı (Universe Tohum Rezervi 20 M kilitli); hazine dağılımına Fatih %5 + Konsey %5, dünya bossu haftalık %6; Konsey projeleri + Universe Hazırlık Deposu; 3 aşamalı geçiş (düğme kullanıcıda). Ayrıntılı açıklamalar (taban fiyat nedeni, Otorite, ortak kasa, Konsey projeleri, Hazırlık Deposu) sohbette verildi; R4/R6'da sayıya bağlanacak.

## 6. Bu adım için kararlar (cevaplandı)

1. Alet onarımının ADA payı %100 → **%30** (ücretsiz oyuncunun ilerlemesi için şart). Kabul mü?
2. 200 M dağılımı (bölüm 3a): piyango 20→12 M, Sirius Konseyi 10 M, Universe Tohum Rezervi 20 M kilitli. Kabul mü?
3. Hazine dağılımına Fatih %5 ve Sirius Konseyi %5 eklenmesi; Dünya bossu haftalık %10→%6. Kabul mü?
4. Hammadde batakları: Konsey projeleri ve Universe Hazırlık Deposu. Kabul mü? (Deponun garantili fiyatı R4/R6'da sayıya bağlanır.)
5. Geçiş aşamaları ve tetikler (bölüm 5); son söz senin düğmende. Kabul mü?

Onay gelince R4: Galaksi Pazarı (varlık listesi, havuz başına ADA, koridorlar, Universe satırlarının kilitli hali, oyuncudan oyuncuya eşya pazarı).
