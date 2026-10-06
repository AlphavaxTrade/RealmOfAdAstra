# Realm of AdAstra v2 — Yeni düzene geçiş planı (ÖNERİ)

Tarih: 6 Ekim 2026 · Durum: onay bekliyor · Kod YAZILMADI
Kullanıcı isteği: "RoA'nın tüm kodunu yeni sistemimize göre baştan yaz, gerekirse haritayı da en baştan tasarla; kapsamlı değişiklik lazım."
Yeni düzen: Universe tasarımı (../adastra-universe/docs/00_IKI_OYUN_BAGI.md ve 01-04) — hepsi onaylı.

## 1. Bugünkü durum (ölçüldü, 6 Ekim)

| Parça | Büyüklük | Not |
|---|---|---|
| Oyun kuralları (js/gameState.js) | 7.800 satır | Bütün kurallar tek dosyada, tek sınıf |
| Ekranlar (js/app.js) | 8.750 satır | Bütün arayüz tek dosyada |
| Ayarlar (js/config.js) | 1.160 satır | Kaynaklar, binalar, canavarlar, oranlar |
| Harita (grandTownScene) | 470 satır | Tek resim (adastra_grand_town.jpg) + tıklanabilir binalar |
| Zindan, savaş, kolezyum | ~2.000 satır | combat, battleArena, dungeonScene, barracks |
| Pazar, havuzlar, hazine, UBI, piyango | ~1.500 satır | ammMarket, globalPool, treasury, economy/* |
| Çevrimiçi mod (js/net/online.js) | 830 satır | Giriş, sunucuya işlem, cüzdan ekranı |
| Sunucu (server/) | 3.600 satır | Hesap, e-posta, 2FA, ödeme, kasa, zincir, dünya hesaplaşması, kolezyum, promo, yönetici |
| Sözleşme (contracts/) | RealmPayments.sol, RealmRates.sol | Fuji/gerçek ağ dağıtım betiği |
| Testler | 70 dosya | Tesisat + oyun kuralları |
| Stil | 7.000 satır css | Eski style.css + yeni theme.css üst üste |

Sürüm 1.34, dal feat/ekonomi-asama1, AWS deneme sunucusunda çalışıyor. Toplam yaklaşık 24.000 satır oyun + 3.600 satır sunucu.

## 2. Ne kalır, ne yeniden yazılır

**Kalır → "AdAstra Platformu" olur (iki oyunun ortak tesisatı):** sunucu (hesap, e-posta doğrulama, şifre, 2FA, cüzdan bağlama, ödeme sözleşmesi, Oyun Kasası, soğuk cüzdan, zincir okuma, yönetici paneli, promo, güvenlik düzeltmeleri), sözleşmeler, yayın betikleri. Bunlar 4-5 Ekim'de denetlendi ve test edildi; baştan yazmak risk katar, fayda katmaz.

**Baştan yazılır:** oyun çekirdeği (gameState → küçük modüller: kaynaklar, üretim/sefer, nüfus, binalar, görevler, Sirius kapasitesi), ekranlar (app.js → ekran başına dosya), harita (yeni Sirius yüzeyi), ayarlar (yeni kaynaklar ve sayılar), stil (tek tema).

**Taşınır ve yeni çekirdeğe bağlanır:** savaş motoru, zindan, kolezyum PvP, piyango + çark, Taverna botu, UBI, hazine. Kuralları senin eski kararların; istersen bunlar da baştan tasarlanır (karar 2).

**Testler:** tesisat testleri kalır; oyun kuralı testleri yeni çekirdeğe göre yeniden yazılır.

## 3. Neden kod yazmadan önce RoA v2 tasarımı (3 neden)

1. **Senin yöntemin:** "adım adım, yoksa karman çorman olur." Universe'de böyle gittik; RoA'yı baştan yazmak Universe'den küçük iş değil.
2. **Sayılar henüz yok:** kolonist kaç köylü, gemi başına kaç mürettebat, Sirius'un Çıkarma Kapasitesi sefer düzenine nasıl bağlanır, Galaksi Pazarı kuralları, kasaların çapraz beslemesi, yıldız metali miktarları, zindan kademe anahtarı. Bunlar Universe Adım 5-7'de çıkacak. Şimdi kodlarsam sayıları ben uydururum; sonra iki kez yazarız.
3. **Mevcut ekonomi kararların** (UBI %6, piyango tek kazanan, zindan 93 gün, bot ücreti %50, yakım %5, kilitli bakiye %80) yeni düzende aynen mi kalacak, değişecek mi — senin kararın; kod bu karara göre yazılır.

## 3b. STRATEJİ (KULLANICI KARARI, 6 Ekim gece)

- **Önce Realm of AdAstra tek başına:** Universe olmadan, kendi içinde, en az **1 yıl** rahat oynanabilir bir oyun. İki oyun aynı anda açılmaz.
- **Kademeli geçiş:** Realm'in ADA kasaları boşaldıkça ve hammadde fiyatları düştükçe Universe devreye alınır. Geçişin ölçülebilir tetikleri tasarlanır (kasa doluluğu, fiyat seviyesi, aktif oyuncu).
- **Hazırlık tasarımı:** Realm, Universe geldiğinde doğrudan bağlanacak biçimde yazılır (Üretim Hakkı, Otorite, Uzay Limanı kilitli, köylü/asker gönderimi hazır ama kapalı). Oyuncular Universe'e şimdiden hazırlık yapabilir (stok, roket görevi, katkı kademesi).
- **Kasalar baştan:** oyunun bütün ADA kasa düzeni yeniden tasarlanır (hangi kasa, nereden dolar, nereye akar, 1 yıl dayanır mı).
- **Galaksi Pazarı baştan:** iki oyunun bütün varlıkları (hammadde, işlenmiş mal, eşya, parça, bilet) tek pazarda; hangi varlığın AMM havuzuna eldeki 200M ADA kaynağından ne kadar konulacağı dahil. İlk sürümde yalnız Realm varlıkları açık, Universe varlıkları kilitli satır.

## 4. RoA v2 tasarım adımları (YENİ SIRA, her biri belge → onay)

- **R1 Harita** — ONAYLI.
- **R2 Kaynaklar ve üretim** — ONAYLI (6 hammadde, Üretim Hakkı, Sirius kapasitesi, Otorite, ortak kasa %5, 6 alan, alet kademeleri, silo).
- **R3 Kasalar (baştan)** — ONAYLI 7 Ekim (docs/v2/R3_KASALAR.md): 200 M dağılımı, Universe Tohum Rezervi 20 M kilitli, bataklar, 3 aşamalı geçiş.
- **İLKELER (7 Ekim, kalıcı):** docs/v2/EKONOMI_ILKELERI.md — örnek olma amacı, planlı büyüme (ilk yıl 50-1000 oyuncu), adalet (gelir uçurumu yok), kıtlık (haftalık kota ana ayar kolu), fiyat (ilk yıl aşırı düşmez; geri alım alıp yakar), para (ASTRA), ölçüm, yöntem. Adlar: ASTRA, Sirius, Realm of AdAstra, AdAstra Vadisi.
- **R4 Denge Modeli (YENİ, kullanıcı talebi 7 Ekim):** haftalık çıkarma kotası (kaynak başına, yönetici ayarlı), kotadan pay dağılımı (kim ne kadar: emek/aktiflik/katkı, tavanlı), Realm'deki kişisel tavanın yeni adı, pazara ayrılan ASTRA ve havuz başına hammadde+ASTRA tohumu, oyundaki bütün hammadde kullanımının yeniden hesabı (onarım, seviye, silah yapım/geliştirme/onarım, silo, asker, Otorite, projeler, Hazırlık Deposu), geri alım kuralı; simülatör 50-1000 oyuncu × 12 ay; hedefler: fiyat düşüş eşiği (teyit bekliyor), gelir dağılımı tavanı, F2P ilerlemesi, kasa ömrü ≥ 12 ay. Çıktı: önerilen ayar seti + yönetici kolları.
- **R4b Galaksi Pazarı:** tek pazar, varlık listesi (iki oyun), koridorlar, komisyon/yakım, derinlik, Universe satırlarının kilitli hali, oyuncudan oyuncuya eşya pazarı (havuz tohumları R4'ten).
- **R5 Nüfus ve ordu:** köylüler (kolonist adayı), Kışla askerleri (mürettebat adayı); Universe yokken Realm içindeki rolü.
- **R6 Uzay Limanı (hazırlık modu):** roket görevi, yük iskelesi ve gözlem kulesi kilitli; "Universe'e hazırlık" ilerleme çubuğu; neyin biriktirilebileceği.
- **R7 Mevcut sistemlerin uyarlanması:** zindan, kolezyum, piyango + çark, Taverna botu, hesap seviyesi, rehber.
- **R8 Sayılar ve 1 yıl simülasyonu:** Realm'in tek başına 12 ay ekonomisi (iki oyunlu model değil), geçiş tetiklerinin denenmesi.

Universe tasarımı (Adım 5-8) Realm yayına çıktıktan sonra, Realm oynanırken yapılır.

## 4-eski. (bilgi) İlk önerilen sıra

- **R1 Harita ve bölgeler:** Sirius'un yüzeyi. Bölgeler: Köy (nüfus), Tarla, Orman, Demir madeni, Kömür ocağı, Taş ocağı, Şifalı Ot bahçesi, Kışla, Zindan girişi, Kolezyum, Taverna, Pazar, **Uzay Limanı / Roket rampası**, Hazine, Karnaval. Yeni harita resmi (Gemini ile üretilir), telefon düzeni, günün saati yok (sen hareketli süs istemedin).
- **R2 Kaynaklar ve üretim:** 6 RoA hammaddesi (Demir, Buğday, Odun, Kömür, Taş, Şifalı Ot); sefer düzeni Üretim Hakkı'ne nasıl bağlanır (saatlik izin ↔ sefer başına çıkan); Sirius'un Çıkarma Kapasitesi = dünya kotası; Sirius'ta Madencilik Otoritesi (ortak inşaat, iki oyunun oyuncuları); alet ve silo üst seviyeleri için Universe metali.
- **R3 Nüfus ve ordu:** köylü nüfusu (yerleşim; buğday ve odunla büyür) → kolonist; Kışla askerleri → mürettebat; gönderme ve geri alma; gönderilenin RoA'daki etkisi (iş gücü azalır mı).
- **R4 Uzay Limanı:** Galaksi Pazarı bağlantısı, gönderim süresi ve ücreti, roket görevi (yeni oyuncu yolu B: hesap 3 + roket parçaları → Universe açılır).
- **R5 Mevcut sistemlerin uyarlanması:** zindan kademeleri (uzay anahtarı), kolezyum, piyango + çark, Taverna botu, UBI, hazine; Sirius'un sahibi yok → "vergi" yerine Sirius ortak kasası; hesap seviyesi çapraz kilit.
- **R6 Sayılar ve ekonomi:** Universe Adım 5 ile birlikte tek model (iki oyunlu sanal dünya simülasyonu).

R1-R5 Universe Adım 5'ten önce yapılabilir; R6 Adım 5 ile birlikte.

## 5. Kodlama planı (tasarım bitince)

- **K0 Platform ayrımı:** server/ → ortak platform (hesap, ödeme, kasa, pazar defteri, oyun modülleri). Depo düzeni kararı: tek depo içinde platform + roa + universe (önerim) ya da ayrı depolar.
- **K1** RoA v2 çekirdek + testler · **K2** ekranlar + harita · **K3** mevcut sistemlerin bağlanması · **K4** Uzay Limanı / Galaksi Pazarı (Universe koduyla birlikte) · **K5** deneme sunucusuna yayın, eski kayıtlar.
- Dal: roa-v2. Eski oyun main'de dokunulmadan kalır; geri dönüş her an mümkün.
- Çok oturumluk iş; her K adımı test + deneme sunucusu ile biter.
- Efor: tasarım adımları **high**, kodlama adımları **max**.

## 6. Senden beklenen kararlar

1. **Sıra:** önce RoA v2 tasarımı R1-R5 (önerim: şimdi başla, Universe'e bağlı sayılar olmadan da tasarlanır), sonra Universe Adım 5-7, sonra kod? Yoksa önce Universe tasarımı bitsin mi?
2. **Zindan, kolezyum, savaş, piyango, çark, bot:** kuralları korunup taşınsın mı, baştan mı tasarlansın?
3. **Deneme sunucusundaki oyuncu kayıtları** v2'de sıfırlanabilir mi?
4. **Depo düzeni:** tek depo (platform + iki oyun) mu, ayrı depolar mı?
