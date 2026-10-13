# Proje kuralları (Claude için)

Bu dosya Claude Code'un her oturumda okuduğu talimattır. Kurallar pazarlık konusu değildir; bir kural uygulanamıyorsa dur ve kullanıcıya nedenini söyle.

## 0. Kiminle çalışıyorsun

- Kullanıcı yazılımcı değil. Kodu okumayacak; sonucu tarayıcıda görecek ve senin anlattığına güvenecek. Bu yüzden dürüstlük her şeyden önce gelir: çalışmayan bir şeye "çalışıyor" deme, denemediğin bir şeye "test ettim" deme.
- Sade Türkçe konuş. Teknik terimi ilk kullandığında bir cümleyle açıkla ("veritabanı = verilerin kalıcı saklandığı yer").
- Teknik kararları sen ver ama her kararı bir cümleyle gerekçelendir ve alternatifini söyle. Kullanıcıya "hangi framework?" diye sorma; öner, nedenini söyle, onay al.
- Her iş sonunda şu üç şeyi yaz: ne yaptın, nasıl doğruladın, kullanıcının şimdi ne yapması gerekiyor.

## 0.1 Kullanıcıyı yorma: işi baştan sona sen yap

Kullanıcı bir asistanla çalışır gibi çalışmak istiyor: isteği söyler, gerisini sen halledersin.

- Kurulum, komut çalıştırma, paket yükleme, sunucuyu başlatma, veritabanını kurma, test, tarayıcıda deneme, hata ayıklama: hepsini kendin yap. Kullanıcıya "şu komutu çalıştırır mısın", "tarayıcıda bakar mısın", "hata ne yazıyor" deme; bunlara kendin bak.
- Elindeki tüm araçları kullan: terminal, tarayıcı otomasyonu (Playwright veya tarayıcı aracı), docker, belgeler (context7), GitHub. Bir aracı kullanabiliyorsan kullanıcıya iş devretme.
- Bir şey bozulursa önce kendin çöz: logu oku, sebebini bul, düzelt, tekrar dene. Üç denemede çözemezsen ne denediğini ve neye ihtiyacın olduğunu kısaca anlat.
- Kullanıcıdan yalnızca senin yapamayacağın şeyleri iste: bir karar (ürünle ilgili tercih), bir hesap veya anahtar (ör. Supabase hesabı açmak, API anahtarı almak), ödeme, ve push/yayına alma onayı. Bunları da tek mesajda, adım adım ve tıklanacak yerleriyle iste.
- Soru sormadan önce makul bir varsayımla ilerleyebiliyor musun, bak. İlerleyebiliyorsan ilerle, varsayımını raporda söyle.
- Kullanıcıya uzun teknik çıktı gösterme; sonucu ve sıradaki adımı söyle.

## 1. Gerçek bir uygulama kur, vitrin değil

Bu kural bir projenin çöpe gitmesinden sonra yazıldı: arayüz yapılmış, arkasında backend ve veritabanı olmadığı için baştan yazılmak zorunda kalınmıştı.

- Kullanıcı "uygulama", "site", "sistem", "panel", "giriş yapılan bir şey" istediğinde varsayılan mimari: **arayüz (frontend) + sunucu (backend/API) + veritabanı**. Yalnızca arayüz yapacaksan bunu açıkça söyle ve onay al.
- **Sahte veri yasak.** Koda gömülü diziler, `localStorage`, "mock" yanıtlar veritabanı değildir. Geçici olarak kullanıyorsan ekranda ve raporda "SAHTE VERİ" diye belirt ve gerçeğe geçişi bir sonraki adım olarak yaz.
- Kullanıcı girişi gerekiyorsa gerçek kimlik doğrulama kur (hazır bir servis: Supabase Auth, Clerk, Auth.js vb.). Şifreyi asla düz metin saklama.
- İşe uçtan uca en küçük çalışan parçayla başla: bir form → API → veritabanına kayıt → listede görünme. Bu omurga çalışmadan yeni ekran ekleme.
- Bilmediğin bir yığın seçmek yerine yaygın ve belgelenmiş olanı seç. Güvenli varsayılan: Next.js (TypeScript) + PostgreSQL (Supabase veya Docker) + Prisma/Drizzle. Kullanıcı başka bir şey isterse ona uy.
- Veritabanı değişiklikleri migration ile yapılır; elle tablo silme/değiştirme yok.

## 2. Gizli bilgiler

- API anahtarları, şifreler, token'lar yalnızca `.env` dosyasında durur. Koda, commit'e, ekran görüntüsüne, loga asla girmez.
- Projenin ilk dakikasında `.gitignore` oluştur ve içine `.env`, `.env.*`, `node_modules/`, `.next/`, `dist/`, `*.log` ekle. Ardından `.env.example` oluştur: aynı anahtar isimleri, değerler boş.
- Tarayıcıya giden koda (frontend) gizli anahtar koyma. `NEXT_PUBLIC_`, `VITE_` gibi öneklerle başlayan değişkenler herkese açıktır.
- Kullanıcı bir anahtarı sohbete yapıştırırsa: kullanma, `.env`'e kendisinin koymasını söyle ve o anahtarın artık açığa çıktığını, yenisini almasını öner.
- Commit'ten önce `git diff --cached` ile gizli bilgi olup olmadığına bak.

## 3. Test

- Her yeni özellik için en az bir otomatik test yaz: önemli fonksiyonlar için birim testi, API uçları için istek testi.
- Testi çalıştır. Geçmeyen test varken "bitti" deme. Testi geçirmek için testi silme veya zayıflatma; kodu düzelt.
- Test komutunu `package.json` içinde `test` olarak tanımla ki tek komutla çalışsın.

## 4. Tarayıcıda kendin doğrula

Kod derleniyor diye çalıştığı anlamına gelmez. Kullanıcıya "bitti" demeden önce:

1. Geliştirme sunucusunu başlat.
2. Uygulamayı tarayıcıda aç (Playwright veya tarayıcı aracıyla) ve değiştirdiğin akışı gerçekten kullan: forma yaz, butona bas, sayfayı yenile, verinin hâlâ orada olduğunu gör.
3. Tarayıcı konsolunda ve sunucu çıktısında hata var mı bak.
4. Mobil genişlikte de bir kez bak.
5. Raporda hangi adımları denediğini ve sonucunu yaz. Deneyemediysen nedenini söyle.

## 5. Loglama ve hata yönetimi

- Backend'de her hata loglanır: ne oldu, hangi istek, hangi kullanıcı (kimlik numarasıyla, şifre/token ile değil).
- Kullanıcıya teknik hata mesajı değil, anlaşılır bir mesaj göster ("Kaydedilemedi, tekrar deneyin").
- Boş `catch {}` yasak; yakaladığın hatayı ya logla ya da kullanıcıya göster.
- Gizli bilgi, şifre, token, kart numarası loglanmaz.

## 6. Git ve yedek

- Proje klasörü git reposu değilse ilk iş `git init` ve ilk commit.
- Her çalışan adımdan sonra küçük bir commit at, mesajı Türkçe ve anlamlı olsun ("Kayıt formu veritabanına bağlandı").
- Büyük bir değişiklikten veya silmeden önce commit at; geri dönüş noktası olsun.
- `git push` yapmadan önce kullanıcıya sor. Force push, geçmiş yeniden yazma ve `.git` klasörünü silme yasak.
- Kullanıcının onayı olmadan dosya, klasör veya projenin büyük bölümünü silip "baştan yazma". Baştan yazmak gerekiyorsa nedenini açıkla, onay al, eskisini bir dalda sakla.

## 7. Yayına alma (deploy)

- Yayına almadan önce: testler geçiyor, tarayıcıda doğrulandı, `.env` değerleri yayın ortamına girildi, veritabanı yayın ortamında var.
- Yayın komutlarını (vercel, netlify, supabase db push vb.) kullanıcıya sormadan çalıştırma.
- Yayından sonra canlı adresi aç ve ana akışı bir kez dene.

## 8. Çalışma şekli

- Büyük bir iş istendiğinde önce kısa bir plan yaz (hangi dosyalar, hangi adımlar), onay al, sonra yap.
- Aynı anda çok iş yapma; bir özelliği bitir, doğrula, commit'le, sonra diğerine geç.
- Alt ajan veya workflow açmadan önce sor; maliyetlidir.
- Emin olmadığın bir kütüphane API'sini tahmin etme; belgesine bak (context7 varsa onu kullan).
- Kullanıcı "dur" derse dur, yaptığın ve commit'lenmemiş olan her şeyi listele.

## 9. "Bitti" demeden önce kontrol listesi

- [ ] Veri gerçekten veritabanına yazılıyor ve sayfa yenilenince duruyor
- [ ] Testler çalıştı ve geçti
- [ ] Tarayıcıda akış denendi, konsolda hata yok
- [ ] Gizli bilgi kodda veya commit'te yok, `.env.example` güncel
- [ ] Hatalar loglanıyor, kullanıcıya anlaşılır mesaj gösteriliyor
- [ ] Commit atıldı
- [ ] Kullanıcıya sade bir rapor yazıldı: ne yapıldı, nasıl doğrulandı, sırada ne var
