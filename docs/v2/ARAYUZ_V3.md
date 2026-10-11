# Arayüz v3 — yapılanlar, ölçümler, kalanlar (9 Ekim 2026)

Amaç: oyunu kolay anlaşılır, telefonda rahat, yeni oyuncuyu elinden tutan, her mekaniği kolay test ettiren yeni bir arayüze çevirmek. Oyun kuralları ve ekonomi DEĞİŞMEDİ; yalnız görünüm, gezinme, eğitim, test aracı ve hız. Başlangıç envanteri: `ARAYUZ_V3_ENVANTER.md`.

## Ne yapıldı (6 aşama, dal `arayuz-v3`)

| Aşama | İş | Commit |
|---|---|---|
| 0 | Her ekran iki boyutta ölçüldü (telefon 390×844, masaüstü 1280×800), 10 ana sorun listelendi | 147e74f |
| 1 | Yeni kabuk: tek satır üst çubuk, 5 sekmeli alt çubuk (Harita · Krallık · Savaş · Pazar · Ben), tek panel sistemi, "şimdi ne yapmalı" kartı, ortak bileşenler (satır, boş durum, iskelet, onay penceresi) | 5a156cd |
| 2 | Eski ekranlar sadeleştirildi: Pazar 5 sekme → 3 bölüm + tek kaynak kartı; yoğun paneller "özet üstte, ayrıntı katlı"; sade başlıklar; terim sözlüğü (`?` düğmeleri); sürüm geçmişi kısaldı | d1a0983 |
| 3 | Yeni oyuncu turu: 9 adım, gerçek dokunuşu bekler, atlanabilir, Ben → Oyun turu ile yeniden oynar | 9734c79 |
| 4 | Test laboratuvarı: 23 senaryo (kur → çalıştır → beklenen ✓/✗), araçlar, durum denetçisi (önce/sonra farkı), adlı kayıt noktaları, günlük | d8521ed |
| 5 | Ayarlar (yazı boyutu, hareketi azalt, kısayol listesi), bağlantı durumu şeridi, zindan başlığı, 3B kütüphanesi (three) yalnız gerektiğinde yüklenir, v3 varsayılan | a14ff52 |
| 6 | Kışla sadeleşti (ilk bakışta 2 ana düğme, ikincil işlemler/diziliş/arama katlı, 44 px hedefler) | 737bfea |
| 7 | Test laboratuvarı 23 → 35 senaryo: asker sınırı, doyurma, zindan (kat kilidi, ilk giriş, harç/antrenman, ödül tablosu), kolezyum (anahtar, yaralı, günlük sınır, maç bedeli) | bu commit |

## Önce / sonra (ölçülen)

| | Önce | Sonra |
|---|---|---|
| Telefonda üst çubuk | iki satır, haritanın üstüne biniyordu | tek satır, 52 px |
| Pazar (telefon, kaydırma) | 3.879 px, 4-5 sekme | ~900 px, 3 bölüm + kaynak seçici |
| Krallık merkezi (telefon) | 1.183 px | ~690 px (yan kartlar katlı) |
| Sürüm geçmişi | 17.458 px | ~920 px (+ "eski sürümleri göster") |
| Aynı yere giden yol | 3-4 | 1 ana yol (sekme → liste) + Ctrl+K araması |
| Yeni oyuncu yardımı | küçük kutu | 9 adımlı tur + sözlük + rehber görevleri |
| Test menüsü | 38 düğmelik düz liste, kırmızı sıfırlama en üstte | 23 senaryo + araçlar + durum + günlük; sıfırlama onaylı, önce kayıt noktası |
| İlk yüklenen kod | 894 KB (sıkıştırılmış 273 KB) | 812 KB (245 KB); three 155 KB ayrı |

## Nasıl çalışır (kısa)
- `html.v3` + `css/v3/kabuk.css` + `js/ui/v3/`. Eski DOM silinmedi: eski üst çubuk gizlenir, v3 çubuğu onun değerlerini OKUR; eski `#rpg-modal` alttan açılan panele dönüşür; eski kartlar `<details>` içine TAŞINIR (yeniden kurulmaz), böylece eski kimlikler ve dinleyiciler çalışmaya devam eder.
- Eski görünüm: adrese `?arayuz=eski` (tarayıcı hatırlar); yeniye dönüş `?arayuz=3`.
- Senaryolar `js/dev/senaryolar.js` içinde TEK yerde (35 adet; zindan/kolezyum gibi şansa bağlı eylemlerde yalnız sonuçtan bağımsız kurallar sınanır, 25 tekrarla kararlılığı test edilir; bu tekrar zaferde geri verilen arena anahtarı kuralını ortaya çıkardı); hem oyun içi panel hem `tests/test_senaryo_laboratuvari.mjs` aynı tanımı çalıştırır (taze motor, bir de seviye 30 hesapla arka arkaya). Beş "kontrol deneyi", bir kural bozulunca senaryonun kırmızı olduğunu kanıtlar.
- Laboratuvar canlı denemede gerçek açık bir hata sınıfı yakaladı: ileri sarma tek çağrıda en çok ~24 saat ilerler ve yüksek seviyede sefer 26 saati bulur; silo hasadı almaya yetmezse sefer kalanıyla açık kalır. Senaryolar bunu bilerek yazıldı.

## Doğrulama
- `npm run hizli` (25 test dosyası), `node tests/test_v3_kabuk.mjs` (gezinme verisi, kaçırma kuralları, tur durum makinesi, ayarlar, lab yardımcıları), `node tests/test_senaryo_laboratuvari.mjs`.
- `node scripts/tarayici/v3.mjs` (elle; `npm run dev` açıkken): telefon ve masaüstü boyutunda ~115 gerçek tarayıcı kontrolü + ekran görüntüleri; konsolda hata yok.

## Dürüst kalanlar (yapılmadı / sınırlı)
1. Pazar, Krallık merkezi, Karakter, Kışla, sürüm geçmişi, başlıklar yeniden düzenlendi; **Karnaval, Kotalar, Hazine'nin iç düzeni hâlâ eski** (Kolezyum ve Demirhane 11 Ekim 2026'da yenilendi; Kolezyum: kısa sekmeler, taktik seçimi katlı, kurallar "Kurallar ve ödüller" altında; Demirhane: sade başlık/sekmeler, ana işlemler görünür, pazara koy / geri dönüştür / çıkar ve toplu işlemler "Diğer" altında katlı) (yalnız başlık, panel kabuğu, büyük dokunma hedefleri ve varsa kart katlama uygulanır). Her biri ayrı bir "yeniden yaz" işi.
2. Zindan ve savaş sahnesi eski sahne; v3 yalnız zindan başlığını temizler.
3. Üst çubuk değerleri eski çubuktan okunur (geçiş dönemi). Eski çubuk/kenar çubuğu silinince v3 doğrudan oyun durumundan okuyacak şekilde değiştirilmeli; eski kodun silinmesi (son strangler adımı) yapılmadı.
4. Test laboratuvarının senaryo sekmesi yalnız yerel (tek kişilik) modda çalışır; çevrimiçi deneme sunucusunda yalnız araçlar var (kayıt sunucuda olduğu için kayıt noktası alınamıyor).
5. Gerçek telefonda denenmedi; Chromium'un telefon taklidi (dokunma + 390×844) kullanıldı. 8080 deneme sunucusunda (başka oturumun testleri sürerken) denenmedi; yalnız `npm run dev` (5180) ve başsız testler.
6. Metinler kodun içinde (tek `metin.js` yok); dil eklemek istenirse ayrı iş.
