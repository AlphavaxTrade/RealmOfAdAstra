# Realm of AdAstra v2 — R2: Kaynaklar ve Üretim

Tarih: 6 Ekim 2026 · Durum: TASLAK, onay bekliyor · Kod yok
Önceki: R1 harita (onaylı). Dayanak: Universe 01_KAYNAKLAR (aile 8), 04_SAYILAR bölüm 1 (Üretim Hakkı, Çıkarma Kapasitesi, Madencilik Otoritesi).

## 1. Bugünkü düzen (koddan okundu) ve ne değişiyor

| Konu | Bugün (v1.34) | v2 |
|---|---|---|
| Kaynaklar | Odun, Demir, Buğday | + Kömür, Taş, Şifalı Ot (6 hammadde; hepsi yalnız burada üretilir) |
| Üretim hızı | Sabit: buğday 1.800/sa, odun 1.080/sa, demir 720/sa; her hesap seviyesi +%1 | Aynı mantık, 6 kaynak; sınır artık **Üretim Hakkı** |
| Sefer süresi | Hesap seviyesiyle uzar (1. sv 18 dk → 81. sv 72 saat) | Aynen kalır |
| Aynı anda sefer | 3 alan | 6 alan (her kaynak için bir alan) |
| Dünya kotası | Haftalık sabit: odun 180k, demir 130k, buğday 490k; tek oyuncu tek başına bitirebiliyor | **Sirius'un Çıkarma Kapasitesi**: aktif oyuncu sayısıyla büyür, Madencilik Otoritesi ile artar |
| Aletler | Balta, kazma, orak; 72 saat; onarım odun + demir + ADA | 6 alet; üst kademeler Universe malzemesiyle |
| Silo | 18 seviye; en üst = eski kotanın yarısı | 18 seviye; 13+ Universe alüminyumu ister |
| Stamina | Buğdayla dolar, sefer süresiyle orantılı | Aynen; 6 alan için tavan büyür |

## 2. Altı hammadde ve taban izin (saatlik)

Taban izin = bir alanın tam hızı = bir oyuncunun Üretim Hakkı'nin tabanı. Mevcut üçünün sayıları **korunur** (ekonomi buna göre ayarlıydı).

| Kaynak | Yer | Alet | Taban izin (saat) | Değer sınıfı | Ana kullanım |
|---|---|---|---|---|---|
| Buğday | Tarla | Orak | 1.800 | A | Stamina, asker beslemesi, Universe gıdası |
| Taş | Taş Ocağı | Keski | 1.200 | A | Universe gezegensel bina temeli, Sirius Otoritesi, savunma |
| Odun | Orman | Balta | 1.080 | B | Alet onarımı, silo, Universe konfor binaları |
| Kömür | Kömür Ocağı | Kömür kazması | 900 | B | Universe çeliği (demir + kömür), termik santral |
| Demir | Demir Madeni | Kazma | 720 | B | Alet onarımı, teçhizat, Universe çeliği |
| Şifalı Ot | Şifalı Ot Bahçesi | Ot bıçağı | 240 | C | Şifahane (asker iyileşmesi), Universe hastanesi |

Hesap seviyesi üretime +%1/seviye ekler (bugünkü kural). Yeni kaynakların pazar koridoru (ADA): Kömür 1,80 (1,00-4,50), Taş 1,20 (0,60-3,00), Şifalı Ot 8,00 (4,00-20,00); mevcut üçü aynen.

## 3. Üretim Hakkı Realm of AdAstra'da

Universe'deki kural birebir: **kişisel izin = taban × Otorite çarpanı × hesap çarpanı × katkı çarpanı**, saatlik / günlük / haftalık.
- Otorite çarpanı: Sirius'taki Madencilik Otoritesi seviyesi başına +%5; çalışma saati Otorite 0'da günde 20 saat, haftada 6 gün → L20'de 24 saat / 7 gün.
- Hesap çarpanı: RoA hesap seviyesi başına +%2,5 (81 seviye var: tavan ×2, yani 40. seviyeden sonra artmaz).
- Katkı çarpanı: Yok ×1 · Bronz ×1,05 · Gümüş ×1,1 · Altın ×1,2 · Platin ×1,35 · Elmas ×1,5 (katkı puanı zaten var: ADA harcaması, yakım, net satış; kademe eşikleri R6).

Bir alanın saatlik üretimi taban × (1 + %1 × seviye). İzin bunun üstünde olduğu sürece sefer tam hızda; izin dolunca sefer **"izin bekliyor"** durumuna geçer (üretim durur, süre sayar). Günlük izin dolunca o gün o kaynaktan çıkmaz: Otorite 0'da günde 20 saatlik izin, yani 24 saat kesintisiz sefer günün 4 saatinde boş döner. Otorite yükseldikçe bu boşluk kapanır. Oyuncu ekranında: "Demir: bugün 11.200 / 14.400 izin · bu hafta 61.000 / 86.400".

## 4. Sirius'un Çıkarma Kapasitesi (eski dünya kotasının yerine)

- Sirius'un sahibi yok, oyuncu tavanı yok (herkes burada başlar). Kapasite **aktif oyuncu sayısıyla** büyür:
  **Kapasite (saat) = aktif oyuncu × taban izin × Otorite çarpanı**, günlük ve haftalık çalışma saatiyle çarpılır.
- Aktif oyuncu = son 7 günde oyuna girmiş, e-postası doğrulanmış hesap (sahte hesap sorunu Universe'deki ücretsiz pay kuralıyla aynı; R6'da kademe şartı eklenebilir).
- Herkes tam hızda çalışırsa toplam üretim kapasiteyi aşar (seviye bonusu + 24 saatlik seferler). O zaman Universe'deki kural: **izni en yüksek olandan en düşüğe** paylar dağıtılır, kısıntı en düşük izinlilere düşer. Yani Sirius kalabalıklaştıkça Otorite'yi birlikte yükseltmek herkesin çıkarına olur.
- Günlük açılış kuralı (bugün kotanın 1/7'si her gün açılır) kendiliğinden korunur: günlük kapasite.

Örnek (odun, Otorite 0): 100 aktif oyuncu → saatte 108.000, günde 2,16 M, haftada 13 M. Tek oyuncunun haftalık izni 129.600 (eskiden kota 180.000 tek kişinin tüm haftasıydı; şimdi her oyuncunun kendi payı var, kimse başkasının kotasını bitiremez).

## 5. Madencilik Otoritesi (Sirius, ortak inşaat)

- Sirius Konseyi ekranında (R1). Her seviyede bir **inşaat havuzu**: RoA oyuncuları Taş, Demir, Odun koyar; Universe oyuncuları Çelik ve Elektronik parça koyar. Havuz dolunca seviye yükselir.
- Maliyet karışımı (öneri): %40 Taş, %20 Demir, %10 Odun (RoA) + %20 Çelik, %10 Elektronik (Universe). Toplam birim Universe gezegensel bina ölçeği: 1. seviye 20.000 birim / 4 saat … 10. seviye 769.000 / 6,4 gün … 20. seviye 44 M / 370 gün (04_SAYILAR bölüm 4).
- Katkı yapan oyuncu katkı puanı kazanır (kademe yükselir → kendi izni büyür). Böylece Otorite'ye koyan iki kere kazanır.
- İlk sürümde (Universe yokken) Çelik/Elektronik payı yerine geçici olarak ADA ile tamamlama (Konsey "dışarıdan parça alır", ADA Sirius ortak kasasına) — Universe açılınca kalkar.

## 6. Sirius ortak kasası (vergi yerine)

Universe'de gezegen sahibi vergi alır; Sirius sahipsiz. Öneri: çıkarılan her birimin **%5'i** Sirius ortak kasasına gider (kaynak olarak). Kasa yalnız Otorite inşaat havuzuna ve Sirius'un gezegensel savunmasına (R5) akar; kimsenin cebine girmez. Oyuncu ekranında "çıkan / Sirius payı / net" görünür (Universe'deki vergi satırıyla aynı düzen).

## 7. Aletler (6 alet, 3 kademe)

| Kademe | Dayanıklılık | Üretim | Nereden |
|---|---|---|---|
| Acemi (bugünkü) | 72 saat | ×1 | Başlangıçta var; onarım odun + demir + ADA (bugünkü kural) |
| Çelik | 144 saat | ×1,10 | Universe çeliği (Galaksi Pazarı) + Demirhane'de yapım |
| Titanyum | 288 saat | ×1,20 | Universe titanyumu + Demirhane |

Yeni aletler: Kömür kazması, Keski (taş), Ot bıçağı; onarım kuralı aynı. Universe açılana kadar yalnız Acemi kademe.

## 8. Silo (Ambar)

- 18 seviye korunur; kapasite başlangıç = 1 saatlik üretim (bugünkü gibi), en üst seviye sabit tavan: Odun 90k, Demir 65k, Buğday 245k (bugünkü), Kömür 75k, Taş 100k, Şifalı Ot 20k.
- 13. seviyeden itibaren yükseltme Universe **Alüminyum** ister ("alüminyum kaplama"); Universe açılana kadar 12 tavan.
- Yükseltme şartı ve bedeli bugünkü kural (%80 doluluk, kapasitenin yarısı + ADA).

## 9. Stamina ve bot

- Stamina aynen buğdayla; tavan "6 alanı aynı anda başlatacak kadar" (bugün 3,5 × sefer bedeli → 6,5 ×).
- Taverna botu 6 alanı birden işletir; bot ücreti formülü aynı (24 saatlik tahmini net kârın %50'si); bot izin dolunca bekler, boşa buğday yakmaz.

## 10. Durum — ONAYLI (6 Ekim gece)

Kullanıcı tüm önerileri kabul etti (stamina tavanı büyür; ortak kasa %5; alet kademeleri; silo 13+; aktif oyuncu 7 gün; Otorite'de geçici ADA tamamlama). Kullanıcı notu: bu düzen için oyunun bütün kasa tasarımı ve Galaksi Pazarı baştan yapılacak → R3 ve R4 (ROA_V2_PLAN.md). Realm en az 1 yıl Universe'siz oynanabilir olacak; Universe satırları kilitli.

**Madencilik Otoritesi, sade:** Sirius'un tek ortak binası, Sirius Konseyi'nde. Kazanılmaz, birlikte yapılır: her seviyenin inşaat havuzuna isteyen taş/demir/odun koyar (Universe yokken çelik payı ADA ile); havuz dolunca seviye artar, herkesin Üretim Hakkı büyür ve Sirius günde daha uzun çalışır. Koyan katkı puanı alır. 1. seviye 20.000 birim (8.000 taş, 4.000 demir, 2.000 odun + 6.000 birimlik çelik payı); 100 oyuncu 200'er koysa bir günde biter; her seviye 1,5 kat pahalı, 20 seviye.

## 10-eski. Bu adım için sorular (cevaplandı)

1. Yeni kaynakların taban hızları (Taş 1.200, Kömür 900, Şifalı Ot 240) ve pazar fiyatları uygun mu? Mevcut üçü korundu.
2. Sirius ortak kasası %5 kesinti — olsun mu, oran bu mu?
3. 6 alan aynı anda; stamina tavanı 6,5 × sefer bedeli — uygun mu?
4. Alet kademeleri (Çelik, Titanyum: Universe malzemesi) ve silo 13+ alüminyum şartı — uygun mu?
5. Otorite ilk sürümde Universe parçası yerine geçici ADA tamamlama — kabul mü?
6. "Aktif oyuncu" = son 7 günde girmiş doğrulanmış hesap — kabul mü?

Onay gelince R3: nüfus ve ordu (köylüler → kolonist, Kışla askerleri → mürettebat).
