# Senaryo dünyası — elle deneme rehberi

Bu rehber, **kendi deneme dünyanıza dokunmadan** (8080) kapı/katılım/izin akışlarını elle denemeniz için hazırlandı. Her hesap hazır bir durumda
bekler; ne yapacağınızı ve ne görmeniz gerektiğini aşağıda bulursunuz. Gördüğünüz farklıysa bana "şu hesapta şunu gördüm" demeniz yeter.

## Nasıl açılır / kapanır
- **Açmak:** `SENARYO-DUNYASI-BASLAT.bat` dosyasına çift tıklayın (≈1 dakika sürer: oyunu derler, hesapları kurar). Tarayıcı kendiliğinden **http://localhost:8081** adresini açar.
- **Tazelemek** (her şeyi ilk haline döndürmek): aynı dosyayı yeniden çalıştırın. Dünya her seferinde baştan kurulur.
- **Kapatmak:** `SENARYO-DUNYASI-DURDUR.bat`.
- Yönetici paneli: **http://localhost:8081/admin** — şifre `data\admin-token.txt` dosyasında (8080'deki ile aynı).
- **Hesapların hepsinin şifresi:** `Deneme-2026`. E-posta adresleri aşağıda.
- Önemli: bu dünyada saat hızlanmaz, süreler gerçek zamanda işler. "72 saatlik davet" ya da "10 günlük izin" gerçekten o kadar sürer; süre dolarsa dünyayı tazeleyin.

## Hesaplar

| E-posta | Durumu | Ne deneyin | Ne görmelisiniz |
|---|---|---|---|
| `senaryo-yeni@ornek.com` | Yeni vatandaş, seviye 1 | Giriş yapın. **H** tuşuna basın (Krallık Hazinesi). Bir sefer başlatın, hazineyi kapatıp yeniden açın. | Üstte kapı şeridi **yok**. Hazine ekranında: "Kapı durumu — vatandaş 7 / 8", "Gelir motoru" (dağıtılan ve çekilebilen $ ile hedefleri, "şimdilik kilitli"), "Katılım karnem" (bu hafta 0/2, 10 kutu). Sefer başlatınca karnede **✅ Sefer** işaretlenir. |
| `senaryo-deneyimli@ornek.com` | Seviye 32, zengin, 4 askerli | Karneye bakın. | Beklenen eşik **5** kategori (seviye yükseldikçe artar). |
| `senaryo-izin-sorusu@ornek.com` | 3 haftadır katılımı düşük; "izin ister misin?" sorusu bekliyor (72 saat) | Giriş yapın, şeritteki **✅ Evet, izin kullan** düğmesine basın. | Soru kaybolur; şeritte "🏖️ İzindesin — 14 gün kaldı" çıkar. H → karnede izin bitiş tarihi ve "Üretim Hakkı, temel gelir ve ücretsiz oyuncu payı almazsın" yazar. Sayfayı yenileyince soru geri gelmez. |
| `senaryo-izin-sorusu-2@ornek.com` | Aynı soru | **Hayır** düğmesine basın. | Soru kaybolur, izin açılmaz; karnede yıllık izin hakkı hâlâ **30 gün**. |
| `senaryo-izinde@ornek.com` | Zaten izinde (8 gün kaldı) | Giriş yapın; şeritteki **İzni şimdi bitir**'e basın. | Şeritte "İzindesin" yazar; düğmeye basınca şerit kaybolur, karnede izin bitişi yok. (İzindeyken Üretim Hakkı, temel gelir ve ücretsiz oyuncu payı almazsınız — kural budur.) |
| `senaryo-uyarili@ornek.com` | 2 haftadır katılımı düşük | H → karne. | "Katılımın 2 haftadır düşük" uyarısı ve bu hafta 0/2. |
| `senaryo-son-uyari@ornek.com` | İzin hakkı bitmiş, son uyarı (72 saat) | H → karne. | "🚨 Son uyarı: izin hakkın bitti…" satırı; yıllık izin hakkı **0 gün**. |
| `senaryo-davetli@ornek.com` | Sırada, yeri **açıldı** (72 saatlik davet) | Giriş yapın. Sonra herhangi bir hareket yapın (ör. bir sefer başlatın). | Şeritte "Bekleme sırasındasın: 1. sıra… **Yerin açıldı!**". İlk gerçek harekette **vatandaş olursunuz**, şerit kaybolur. |
| `senaryo-sirada-hazir@ornek.com` | Sırada, 3 onayı vermiş (hazır aday) | Giriş yapın. | "Bekleme sırasındasın: 2. sıra", 3 onay düğmesi ✅ ve kapalı; "Yerin açıldı" **yok**. |
| `senaryo-sirada-degil@ornek.com` | Sırada, hiç onay vermemiş | 3 onay düğmesine tek tek basın; sayfayı yenileyin. | Basılan düğme ✅ olur; yenileyince onaylar kalır. (Hazır adaylar yer açılınca önce davet alır.) |
| `senaryo-askida-oncelikli@ornek.com` | Yeri askıya alınmış (katılım düşük kalmıştı); dönüşte öncelik **var** | Giriş yapın. | Şeritte sıra numarası görünür; sıranın **en önünde** (1. sıra) olursunuz. |
| `senaryo-askida-oncelik-yok@ornek.com` | Askıda; izin hakkı bitmişken düşük kalmıştı, dönüşte öncelik **yok** | Giriş yapın. | Sıranın **en sonunda** olursunuz. Bir sonraki askıda öncelik geri gelir (tek seferlik ceza). |

## Yönetici panelinde (8081/admin) deneyin
- **Kapı kuralı** bölümünde vatandaş/sıra/askı özeti, bekleme sırası tablosu ve askıdakiler listelenir.
- **Vatandaş sınırı** kutusunu büyütüp **Kaydet**'e basın: bir yer açılır, sıradaki ilk **hazır** aday davet alır.
- **Dönem** seçimi (50 / 100 / 300 $ eşik) ve "Büyüme kilitli" kutusu da buradan değişir.
- Not: yönetici şifresini üst üste 10 kez yanlış girerseniz o adres 10 dakika kilitlenir (kaba kuvvet koruması).

## Bilinen sınırlar (sürpriz olmasın)
- Haftalık değerlendirme (Pazartesi 00:01) ve "72 saat süre doldu" kararları gerçek zamanda işler; bunları hızlıca görmek için otomatik testler ve simülasyon kullanılır (`npm run sim`, `npm run tarayici`).
- Gerçek ASTRA/zincir yoktur; bu dünya zincire bağlı değildir.
