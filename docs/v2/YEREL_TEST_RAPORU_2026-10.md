# Yerel Test Raporu — 8 Ekim 2026

Bu rapor, oyunu **gerçek ağa, gerçek paraya ve canlı sunucuya hiç dokunmadan**, yalnız bu bilgisayarda denediğimiz kampanyanın sonucudur.
Test ağına (Fuji) geçip geçmeyeceğimize **siz karar verirsiniz**; bu rapor o karar için gerçekleri toplar, öneri vermez.

## 1. Ne test ettik (sayılarla)

| Alan | Ne yaptık | Sonuç |
|---|---|---|
| Kasa sözleşmesi (OyunKasasi) | tohumlu rastgele işlem dizileri; kötü niyetli sahte token'lar (false döndüren, geri girmeye çalışan); uç durumlar | Tüm değişmezler tuttu |
| Sunucu ↔ yerel zincir | Ödeme kuyruğu gerçek imza ve sıra numarasıyla; çökme sonrası toparlanma; kasa modu uçtan uca | Çift ödeme yok |
| Kasa saldırısı | "Dağıtıcı anahtarı çalındı" ve "sahip anahtarı çalındı" | Sayılar 4. bölümde |
| 100 vatandaş + bekleme sırası simülasyonu | 6 senaryo, toplam **≈ 433.000 başarılı oyuncu hareketi**, 130 hesap, gerçek sunucu kodu + sahte saat + gerçek HTTP | **Hiçbir değişmez bozulmadı** (aşağıda) |
| Kötüye kullanım | Bozuk istekler, sahte hesap dalgası, yarış durumları, devasa gövde, yetkisiz uçlar | Düzeltilen 1 yarış dışında sağlam |
| Tarayıcı | Gerçek Chrome, masaüstü + 390 px telefon, 30 kontrol (kayıt → sıra → davet, izin sorusu, karne, yönetici paneli, konsol hatası taraması) | 30/30 |
| Yük | 200 oyuncu, 50 eşzamanlı bağlantı, HTTP yükü; 60 sn dayanıklılık; kapı için 100 / 1.000 / 5.000 vatandaş ölçeği | Bkz. 5. bölüm |

Simülasyon senaryoları (hepsi "ihlal yok" ile bitti):

| Senaryo | Süre | Ne zorladı |
|---|---|---|
| Taban | 52 hafta | Dışarıdan para yok; sıra, askı, izin, dönüş |
| Fiyat çöküşü | 30 hafta | Fiyat 1 ayda %50 düştü |
| Toplu çekim | 20 hafta | 30 vatandaş aynı hafta bütün serbest bakiyesini çekmek istedi; küçük arz → haftalık tavan **gerçekten bağladı** (600 bin istendi, 289 bin çıktı, kalanı sonraki haftalara yayıldı) |
| Balinalar | 26 hafta | 10 hesap 5 milyon ASTRA'lık yatırım yaptı |
| Dış gelir | 26 hafta | Trade sitesinden haftalık gelir + büyüme kilidi açık |
| Sahte hesap dalgası | 20 hafta | 100 yeni hesap aynı anda |

Her simüle haftada denetlenen değişmezler (kasa defteri tutarlılığı, **ASTRA korunumu**, ödeme tavanları, pazar sabiti, hammadde, oyuncu bakiyesi, çekim hesaplaşması, kapı kuralları, UBI devri, gösterge, izin modu) 6 senaryonun hiçbirinde kritik ihlal vermedi.
ASTRA korunumunda en büyük haftalık sapma **0,12 ASTRA** (toplam 200 milyon içinde; bu, yuvarlama gürültüsüdür).

## 2. Bulunan ve düzeltilen hatalar (hepsine test eklendi)

1. **İzin modunun ekonomik etkisi kodda yoktu.** Onaylı kural "izindeyken Üretim Hakkı, temel gelir ve ücretsiz oyuncu payı alınmaz" idi ama hiçbir yol izne bakmıyordu. Düzeltildi.
2. **Ödül yuvarlama sızıntısı.** Görev/zindan/boss/kolezyum ödülü kasadan kesirli çekilip oyuncuya yuvarlanarak veriliyordu; kesirli kısım yok oluyor ya da yoktan oluşuyordu. Düzeltildi (kesir kasada kalır).
   Bu düzeltmenin ilk hali **zindanda 1 ASTRA altı ödülleri sıfıra indiriyordu** (tam test takımı bunu yakaladı: 2 zindan testi). Zindan ödülü şimdi yuvarlanmadan, kasadan çıkan tam miktarla veriliyor.
3. **Pazartesi yarışı.** Hafta dönümünde 00:00:30'da eylem yapan oyuncunun kapanan haftası siliniyor, "katılımı düşük" sayılıp haksız uyarı alabiliyordu. Düzeltildi.
4. **Kasa modunda ödeme tasarımı.** İmzadan önce durdurma/tavan ön kontrolü, satırların canlı tavana göre parçalanması eklendi (yoksa satır sonsuza dek yeniden denenirdi).
5. **Kişisel katılım karnesi ve izin ekranı eksikti** (planda vardı, yapılmamıştı). Eklendi.

Düzeltme sırasında iki test de yeni kurala uydurulmak zorunda kaldı (zayıflatma değil): kapı testi artık göstergeyi *kapanan haftanın* kaydından okuyor; zindan testi ödülün kesirli olabildiğini hesaba katıyor.

## 3. Sizin kararınıza kalanlar

**(b) Kural/sayı değişikliği gerektirenler — sizden onay almadan dokunmadım**
- **Kasa günlük çekim sınırı (%10).** Dağıtıcı anahtarı çalınırsa saldırgan ilk 24 saatte kasanın en çok **%9,26'sını** alabilir (200 milyonluk kasada ≈ 18,5 milyon ASTRA). Sınırı düşürmek kaybı küçültür ama meşru ödemeleri yavaşlatır.
- **Tek oyuncu UBI talebi %5 tavanı koda hiç bağlanmamış.** Fonksiyon var, kullanılmıyor. Gerçek talep yolu payı herkese orantılı bölüyor, bu yüzden tehlike küçük görünüyor (ayrıca denenmedi); karar sizin.
- **Gösterge ölçeği.** Simülasyonda varsayılan fiyatla (1 ASTRA = 0,0000002 $) haftalık çekim tavanının tamamı ≈ 4 $ eder; kişi başı çekilebilen ≈ **0,2 $/ay**, büyüme eşiği 50 $. Yani gerçek fiyat bu seviyedeyse büyüme kilidi hiçbir zaman kendiliğinden açılmaz. Fiyat gerçekte nedir bilmiyoruz; bu, E-planı'ndaki "50 $/ay için ~6.000 $/ay giriş gerekir" bulgusuyla uyumlu.
- **Bekleyen KARAR 4-7** (çekim ücreti yakımı %50, ikili çekim tavanı, tek fiyat çarpanı k, girişe bağlı ödeme oranı) hâlâ kodlanmadı; sizin sinyalinizi bekliyor.

**(c) Tasarım gözlemleri**
- Ücretsiz eylemler (asker sırası dizme, karnaval tezahüratı) katılım kategorisi sayılıyor: Sv.1-9'da eşik (2 kategori) ekonomik bir şey yapmadan geçilebilir.
- Promosyon kodu ödülü ve fiyat savunma yakımı hazine defterinin "dağıtılan"/"yakılan" sayaçlarına tam yazılmıyor; gösterge bu kadar eksik kalır (korunum denetimi bunları ayrı hesaplıyor ve 6 senaryoda açık çıkmadı; ama bu kalemler henüz sayaçlara bağlı değil).
- Simülasyondaki "bot oyuncular" yalnızca temel hareketleri yapıyor (kısıtlı): 1 yıl sonunda ücretsiz oyuncu ortalama seviyesi ≈ 2,5. Gerçek oyuncular daha ilerleyebilir; seviye-ilerleme sonuçlarına **güvenmeyin**, korunum sonuçlarına güvenin.
- "Aktif vatandaş" ekran sayısı her Pazartesi sıfırlanıyor, hafta ilerledikçe yükseliyor (yanıltıcı olabilir).

## 4. Kasa saldırı sayıları

- **Senaryo A — dağıtıcı (sunucudaki oyun cüzdanı) anahtarı çalındı:** saldırgan kendine para çekemez; yalnızca "oyuncuya öde" yolunu sürekli çağırabilir. İlk 24 saatte en çok **%9,26** gider. Sahip kasayı durdurursa kayıp **sıfırda** durur. Fark edilmezse kasanın yarısı **en az 7 günde** gider.
- **Senaryo B — sahip anahtarı çalındı:** sahip para alamaz, yalnızca ayar değiştirmeyi önerebilir; her değişiklik **24 saat bekler**, bu sürede durdurma çalışır (kayıp sıfır). Durdurulmasa bile en gevşek ayarla ilk gün kasanın **dörtte birini** geçemez.
- Sonuç: "hacklenirse fonlar korunsun" sorusuna cevap — tek anahtar çalınırsa kayıp sınırlı ve durdurulabilir; ama **fark edilmezse** günlerce akabilir. Bu yüzden izleme/uyarı (yönetici bildirimi) güvenliğin parçasıdır.

## 5. Performans

- Kapı ve saatlik işler **doğrusal** ölçekleniyor (N 50 kat → süre ≈ 40-50 kat):
  - 100 vatandaş: aktif sayımı 4 ms, kapı saatlik işi 10 ms, Üretim Hakkı geçişi 28 ms, haftalık kayıt 3 ms
  - 1.000: 33 / 98 / 170 / 35 ms
  - 5.000: 146 / 489 / **1.000** / 175 ms
  → 5.000 vatandaşta bile en yavaş saatlik iş 1 saniye; sorun yok. (Sunucu tek süreç olduğu için bu süre boyunca başka istek bekler; 100 vatandaşta fark edilmez.)
- HTTP yükü (200 oyuncu, 50 bağlantı): **ölçüm çok değişken** — sakin anda karma senaryoda **854 istek/sn, p95 106 ms**, başka işler koşarken 90-400 istek/sn. Sunucu belleği ≈ 120-155 MB, hata 0. Eşik kontrolü (`npm run yuk-kontrol`, alt sınır 350/300 istek/sn) makine yoğunken **geçmedi**. Bunun kodumdan mı makineden mi olduğunu kesinleştirmek için **sakin bir bilgisayarda yeniden ölçülmeli** — şimdilik "kanıtlanmadı".
- 60 saniyelik dayanıklılık: bellek sızıntısı belirtisi yok; **30 dakikalık dayanıklılık yapılmadı**.

## 6. Test ağına geçmeye hazır mıyız? (karar sizin)

| | Madde |
|---|---|
| ✅ | Kasa sözleşmesi: fuzz + kötü token + saldırı testleri geçti |
| ✅ | Ödeme kuyruğu yerel zincirde çift ödeme yapmıyor, çökmeden toparlanıyor |
| ✅ | 6 senaryo × ≈433 bin hareket: ASTRA korunumu ve tüm değişmezler tutuyor |
| ✅ | Kapı, hazır aday, 72 saat davet, askı/dönüş, izin akışları tarayıcıda çalışıyor |
| ✅ | Bulunan hatalar düzeltildi ve her birine test eklendi |
| ✅ | Ölçeklenme doğrusal (5.000 vatandaşa kadar) |
| ⚠️ | HTTP yük eşiği makine yoğunken geçmedi; sakin makinede tekrar ölçülmeli |
| ⚠️ | 30 dakika dayanıklılık ve 1.000+ eşzamanlı oyuncu denenmedi |
| ⚠️ | Kasa günlük sınırı (%10) ve UBI %5 tavanı hakkında karar bekliyor (3. bölüm) |
| ⚠️ | KARAR 4-7 kodlanmadı |
| ❌ | **Denenmedi:** gerçek Avalanche ağı, gerçek token (ücretli/özel transfer davranışı olabilir), gerçek gaz maliyeti (ganache'ta ölçüldü), gerçek Arena alımı, gerçek posta, gerçek telefon |
| ❌ | **Denenmedi:** PostgreSQL / canlı sunucu ortamı (oyun burada hep yerel SQLite ile denendi) |
| ❌ | Sponsorluk/yatırım sistemi henüz tasarlanmadı |

## 7. Elle denemek için

`SENARYO-DUNYASI-BASLAT.bat` (http://localhost:8081, :8080'e dokunmaz). Hangi hesapta ne denenir: `docs/v2/SENARYO_REHBERI.md`. Ham simülasyon sonuçları: `docs/v2/sim/*.json`.
