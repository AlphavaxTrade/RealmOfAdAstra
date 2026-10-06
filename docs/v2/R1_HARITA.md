# Realm of AdAstra v2 — R1: Harita ve Bölgeler (Sirius'un yüzeyi)

Tarih: 6 Ekim 2026 · Durum: TASLAK, onay bekliyor · Kod yok
Bağlam: RoA artık AdAstra Universe'deki **Sirius** gezegeninin yüzey oyunu (../../adastra-universe/docs/00_IKI_OYUN_BAGI.md, onaylı). Plan: docs/ROA_V2_PLAN.md.
Yedek: v1.34 kopyası `..\adastra-realm-VANILLA-v1.34`, git etiketi v1.34-vanilla, dal vanilla-stable (GitHub'da da var).

## 1. Çerçeve

- RoA'nın geçtiği yer: Sirius gezegeninde bir vadi yerleşimi. Ad önerisi: **AdAstra Vadisi** (eski "Grand Town" yerine). Oyuncu Sirius'un yurttaşı.
- **Üç kademe gezinme**, Universe ile aynı mantık: Universe haritası → Sirius gezegen sayfası → AdAstra Vadisi haritası → semt → yer ekranı. RoA tek başına açılınca doğrudan Vadi haritası gelir.
- Harita **sabit**: hareketli süs, bulut, duman, yanıp sönme yok (29 Eylül kararın). Yerin üstüne gelince bilgi kartı (ad, kısa açıklama, canlı durum), hazır işlerde küçük "Hazır" rozeti (bugünkü düzen korunur).
- Gökyüzünde Sirius'un yörünge istasyonu ve uzak gemiler **sabit** çizilir: oyuncu her an "burası bir gezegenin yüzeyi" diye hisseder.
- Universe'den Sirius'a tıklayan oyuncu aynı haritaya iner; Universe oyuncusu RoA'da ayrı bir hesap açmaz, aynı hesap.

## 2. Bölgeler: 5 semt, 20 yer

| Semt | Yer | Ne yapılır | Bugünkü karşılığı | Durum |
|---|---|---|---|---|
| **A. Köy Merkezi** | Köy Evleri | Köylü nüfusu: evler, büyüme (buğday + odun), kolonist kaynağı | Yok | YENİ |
| | Pazar | Kaynak alım satımı (AMM) + **Galaksi Pazarı** sekmesi (Universe kaynakları) | Pazar | Genişler |
| | Taverna | Otomasyon botu (6/24 saat), güçlendirmeler, "Sen yokken olanlar" raporu | Taverna | Aynı |
| | Karnaval | Çark + piyango | Karnaval | Aynı |
| | Sirius Konseyi | Hazine, UBI, Sirius ortak kasası, **Madencilik Otoritesi ortak inşaatı**, Çıkarma Kapasitesi (kota) göstergesi, haftalık hesaplaşma, dünya bossu duyurusu | Hazine paneli | Genişler |
| | Demirhane | Teçhizat yapımı, yükseltme, onarım; üst seviyeler **yıldız metali** (Universe) ister | Kışla içindeki teçhizat | Ayrılır (soru 3) |
| | Şifahane | Asker iyileşmesi: buğday yerine/yanında Şifalı Ot, Biyolüminit ile hız | Kışla içindeki iyileşme | Ayrılır (soru 3) |
| **B. Tarım** | Tarla | Buğday seferi | Tarla | Aynı |
| | Orman | Odun seferi | Orman | Aynı |
| | Şifalı Ot Bahçesi | Şifalı Ot toplama seferi | Yok | YENİ |
| | Ambar | Depo (silo) kapasitesi; üst seviyeler Universe alüminyumu ister | Silo | Genişler |
| **C. Madenler** | Demir Madeni | Demir seferi | Maden | Aynı |
| | Kömür Ocağı | Kömür seferi | Yok | YENİ |
| | Taş Ocağı | Taş seferi | Yok | YENİ |
| **D. Askeri** | Kışla | Asker eğitimi, birlik, **"Universe'e mürettebat gönder / geri çağır"** | Kışla | Genişler |
| | Kolezyum | Gerçek rakiplerle 1v1 / 3v3, haftalık sıralama | Kolezyum | Aynı |
| | Zindan Girişi | 18 kat, kademeler (Zor/Kabus/Cehennem için uzay anahtarı), Pandora kutusu, eser | Zindan | Genişler |
| **E. Uzay Limanı** (platoda) | Roket Rampası | **Roket görevi** (yeni oyuncu yolu B): parçaları topla, roketi yap, Universe açılır; sonrası Sirius'tan kalkış | Yok | YENİ |
| | Yük İskelesi | Galaksi Pazarı'na gönderim (kaynak, kolonist, mürettebat); uçuş süresi ve ücret | Yok | YENİ |
| | Gözlem Kulesi | Universe'deki olaylar: istila uyarısı, ortak boss, Sirius'a inen tehdit; Sirius'un gezegensel savunma durumu | Yok | YENİ (soru 4) |

Hiçbir mevcut özellik kaybolmuyor: rehber görevleri Köy Merkezi'nde başlar; cüzdan (🏦), bildirimler, promo kodu, hesap ayarları üst çubukta kalır (yer değil, her ekranda).

## 3. Harita düzeni (yerleşim)

- **Ortada** Köy Merkezi: meydan etrafında Köy Evleri, Pazar, Taverna, Karnaval, Konsey, Demirhane, Şifahane.
- **Batı** Tarım: nehir boyunca tarlalar, güneybatıda orman, ot bahçesi nehir kıyısında, Ambar köyün girişinde.
- **Kuzey** Madenler: kayalık yamaç; demir, kömür, taş ocakları yan yana (üç ayrı giriş).
- **Güney** Askeri: kışla ve kolezyum düzlükte, zindan girişi güneydeki kaya yarığında (eski zindan kat resimleri korunur).
- **Doğu** Uzay Limanı: yüksek platoda roket rampası, yük iskelesi, gözlem kulesi; gökte yörünge istasyonu halkası.
- Masaüstü: tek ekran, 16:9. **Telefon:** dikey; alt çubukta 5 semt düğmesi, semte dokununca harita o semte kayar ve yerler listelenir (bugünkü alt çubuk mantığı).
- Her yerin ekranı bugünkü gibi "kart/panel" olarak haritanın üstünde açılır; harita arkada kalır.

## 4. Görsel yön

- **Piksel çizim (eski haritanın tarzı), yoğun ve canlı:** her yerde minik insanlar, dolu pazar, seyircili arena, dizili ordular; boş alan olmaz (kullanıcı kararı, 6 Ekim; boyalı/boş ilk taslak reddedildi).
- Sirius = Bahçe dünyası: yeşil vadi, nehir, tarlalar, ormanlı tepeler; kuzeyde gri-kahverengi maden yamacı; güneyde koyu kaya yarığı; doğuda açık renkli plato ve gümüş-beyaz roket; gökte iki ay ve ince bir yörünge halkası.
- Resim üretimi: önce bir **konsept resim** (Gemini), onayından sonra son harita ve bölge bölge kesilmiş katmanlar; her yer için tıklama alanı koordinat tablosu (bugünkü grandTownScene mantığı).
- Zindan kat resimleri, canavar ve ganimet resimleri **korunur**; yalnız şehir haritası yenilenir.

## 5. Yeni oyuncunun ilk 10 dakikası (yol B)

1. Giriş → tek ekran "Sirius'a iniş" metni (kısa, atlanabilir).
2. Köy Evleri: ilk köylüler gelir; rehber görevi 1.
3. Tarla → Orman → Demir Madeni: ilk seferler (bugünkü rehber görevleri).
4. Ambar, Taverna, Kışla sırayla açılır (bugünkü "menüler adım adım açılır" düzeni).
5. Uzay Limanı görünür ama **kilitli**: "Hesap 3 + roket parçaları". Roket görevi listesi baştan görünür ki hedef belli olsun.

## 7. KARARLAR — R1 ONAYLANDI (6 Ekim 2026)

1. Oyunun adı **Realm of AdAstra** olarak kalır. Haritanın adı **AdAstra Vadisi** ("AdAstra Vadisi" değil). Universe'de Sirius gezegen sayfasında **"Vadiye git"** düğmesi; tıklayınca bu harita açılır.
2. 5 semt / 20 yer düzeni aynen.
3. Demirhane ve Şifahane ayrı yerler.
4. Gözlem Kulesi haritada baştan var, Universe canlıya çıkana kadar "yakında" kilidiyle.
5. Harita görseli: 2. taslak (piksel, yoğun) onaylı; son harita bu tarzda üretilip bölge bölge kesilecek.

Sonraki adım: R2 kaynaklar ve üretim (efor: high).

## 6. Bu adım için sorular (cevaplandı, yukarıda)

1. Vadinin adı "AdAstra Vadisi" mi, başka mı?
2. 5 semt / 20 yer düzeni uygun mu? Eksik, fazla, birleştirilecek var mı?
3. Demirhane ve Şifahane ayrı yer mi olsun, Kışla'nın içinde mi kalsın?
4. Gözlem Kulesi ilk sürümde mi, Universe canlıya çıkınca mı?
5. Konsept harita resmi: ilk taslak (`astra_vadisi_konsept_1_REDDEDILDI.jpg`, boyalı/boş tarz) kullanıcı tarafından REDDEDİLDİ: "her yer boş, arena boş, savaş alanı yok, eski tasarım çok daha iyiydi." İkinci taslak `docs/v2/astra_vadisi_konsept_2.jpg`: eski haritanın piksel tarzı ve kalabalığı (duvarlı şehir, dolu pazar, seyircili kolezyum, dizili ordular, süvari talimi, kereste sahası, çiftçili tarlalar) + yeni yerler (kömür ocağı, taş ocağı, ot bahçesi, köy evleri, saat kuleli konsey, demirhane, şifahane, doğuda platoda roket, yük iskelesi, gözlem kulesi; gökte iki ay ve yörünge halkası). **Görsel yön kuralı:** RoA haritası piksel çizim, yoğun, her yerde minik insanlar; boş alan olmaz. → 2. taslak ONAYLANDI ("yeni harita çok daha iyi", 6 Ekim).

Onay gelince R2: kaynaklar ve üretim (6 hammadde, sefer düzeni ↔ Üretim Hakkı, Sirius kapasitesi = kota, Madencilik Otoritesi).
