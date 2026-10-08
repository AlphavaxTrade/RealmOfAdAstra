# Realm of AdAstra v2 — KESİN KARARLAR (kod bu belgeye göre yazılır)

Tarih: 7 Ekim 2026 · Yetki: kullanıcı "sormadan tasarla, karar ver, oynanabilir hale getir" dedi (hafıza feedback_autonomous_roa_v2). Bu belge R1-R5 onaylarını ve kalan bütün kararları tek yerde toplar. Değişiklik isteği gelince burası güncellenir.

## A. Yaklaşım

- Yeni dal `roa-v2`. Sıfırdan yazmak yerine **çalışan kodun kademeli dönüşümü**: sunucu tesisatı (hesap, ödeme, kasa, zincir, panel, güvenlik) ve 70 test korunur; oyun çekirdeği (gameState), ayarlar (config), ekranlar (app) ve harita parça parça v2'ye çevrilir. Her adım sonunda oyun çalışır durumda kalır; `npm test` ve `npm run build` geçmeden ilerlenmez.
- Hedef teslim: AWS test sunucusunda (deneme modu) oynanabilir v2; kullanıcıya adres ve test hesabı verilir.
- Yedek: `..\adastra-realm-VANILLA-v1.34`, etiket v1.34-vanilla, dal vanilla-stable.

## B. Adlar ve ölçek

- Para ASTRA (kodda `adAstra` alanı kalır, ekranda ASTRA). Gezegen Sirius. Oyun Realm of AdAstra. Harita AdAstra Vadisi. Kişisel üretim tavanı Üretim Hakkı. Universe terimi Sondaj İzni Realm'de kullanılmaz.
- **Fiyat ölçeği (R4 bulgusu):** bugünkü ASTRA bedellerinin tamamı ×0,01 (asker 5.000 → 50, bilet 100 → 1, çark 100 → 1, seviye bedelleri, bot ücreti formülü aynı oranla); üretim hızları ×0,3. Böylece toplam ölçek ×0,003 (modelin 50-1000 oyuncuda doğruladığı değer) ve ekrandaki sayılar okunaklı kalır.
- Üretim hızları (dakika başına): buğday 9 · taş 6 · odun 5,4 · kömür 4,5 · demir 3,6 · şifalı ot 1,2. (Saatte 540 / 360 / 324 / 270 / 216 / 72.)
- Açılış fiyatları (ASTRA/birim): buğday 0,009 · taş 0,012 · odun 0,025 · kömür 0,018 · demir 0,04 · şifalı ot 0,08. Ekranda 1.000 birim başına gösterilir (1.000 demir = 40 ASTRA).
- Fiyat çarpanı (dolar tabanı) yalnız **bedellere** uygulanır (seviye, asker, bilet, çark, iyileşme, kayıt harcı). **Ödüller ASTRA olarak sabit** (kasa gücüne bağlı). Pazar koridorları çarpanla kayar.

## C. Kaynaklar, seferler, aletler, silo (R2)

- 6 hammadde, 6 alan aynı anda; her alan bir alet ister: orak (buğday), keski (taş), balta (odun), kömür kazması, kazma (demir), ot bıçağı. Alet kademesi ilk sürümde yalnız Acemi (72 saat); Çelik/Titanyum Universe'le.
- Alet onarımı: odun + demir (üretimin %25'i düzeyinde, bugünkü formül) + ASTRA payı bugünkünün **%30'u**.
- Stamina buğdayla; tavan 6 alanı birden başlatacak kadar (6,5 × sefer bedeli).
- Silo 18 seviye, 6 kaynak; kapasiteler bugünkü oranla (başlangıç 1 saatlik üretim; en üst: buğday 73.500, taş 30.000, odun 27.000, kömür 22.500, demir 19.500, ot 6.000 — ×0,3 ölçekli). 13+ seviye Universe'e kadar kapalı (12 tavan).

## D. Üretim Hakkı, Sirius kapasitesi, Otorite, ortak kasa (R2 + R4)

- Dünya kotası kalkar; yerine haftalık **Sirius Çıkarma Kapasitesi** = Σ(aktif oyuncu ağırlığı) × taban × kişi başı kota × Otorite çarpanı × çalışma saati × yönetici çarpanı. Günlük kapasite = haftalığın 1/7'si her gün açılır (bugünkü günlük açılış mantığı korunur).
- Kişi başı kota (termostat): başlangıç tam alanın 0,40'ı; her hafta kaynak başına fiyat/açılış oranına göre ±%10; sınır 0,05-1,0. Yönetici çarpanı varsayılan 1.
- Oyuncu ağırlığı = aktiflik (son 7 günde sefer dönen zaman payı; en az 0,25) × (1 + 0,025 × hesap seviyesi, en çok ×2) × katkı kademesi (Yok 1 · Bronz 1,05 · Gümüş 1,1 · Altın 1,2 · Platin 1,35 · Elmas 1,5). Tavan: en yüksek ağırlık en düşüğün 3 katı.
- Üretim Hakkı = kapasite × ağırlık / Σ ağırlık; saatlik/günlük/haftalık; dolunca sefer "izin bekliyor". Kullanılmayan hak hafta içinde hakkını aşanlara orantılı dağılır.
- Katkı kademesi eşikleri (haftalık katkı puanı, fiyat çarpanıyla ölçekli): Bronz 50 · Gümüş 200 · Altın 500 · Platin 1.500 · Elmas 5.000.
- Madencilik Otoritesi: Sirius Konseyi'nde ortak inşaat; 1. seviye 2 M birim (×1,4/sv, 20 sv); karışım %40 taş, %20 demir, %10 odun + %30 "çelik payı" = ASTRA 0,05/birim Konsey kasasından; her sv kapasite ve herkesin hakkı +%5, çalışma günü 20→24 saat, hafta 6→7 gün. Katkı = katkı puanı.
- Ortak kasa: çıkarılan her hammaddenin %5'i (kaynak olarak) Konsey'e; Otorite havuzuna ve projelere akar.
- Konsey projeleri (sırayla, biri açık): Nehir Köprüsü (sefer süresi −%2), Büyük Ambar (silo +%5), Şifa Bahçesi (şifalı ot +%5), Liman Rıhtımı (Hazırlık Deposu kişi tavanı ×2), Savunma Duvarı (Dünya Bossu savaşından erken çekilme cezası %18 → %12; 8 Ekim 2026 kararı: eski "bossun hasarı −%10" etkisiz kalıyordu, çünkü dünya bossu oyunculara vurmuyor, yalnız hasar yarışı). Her proje 6 M birim hammadde (karışım Otorite gibi) + 50.000 emek puanı. En çok katkı yapan 10 kişi rozet.

## E. Kasalar (R3)

Tohumlar (200 M ASTRA): pazar havuzları 100 M (6 hammadde 90 M değer ağırlıklı + tüketilenler 10 M), zindan 10 M, kolezyum 4 M, dünya bossu 6 M, geri alım 7 M, görev & ücretsiz 8 M, karnaval 3 M, piyango 12 M, Fatih 20 M, Sirius Konseyi 10 M, Universe Tohum Rezervi 20 M (kilitli).
Harcama bölüşümü %5 yakım · %3 yapımcı · %6 UBI · %86 hazine; hazine: zindan 27 · kolezyum 14 · boss 12 · geri alım 15 · görev 18 · karnaval 4 · Fatih 5 · Konsey 5.
Haftalık ödeme oranları: zindan %2,5 · kolezyum %2 · boss %3 (Pazar) · görev %2,5 · ücretsiz pay kasanın ≤%1,5'i/hafta (ve aylık piyasa değeri %1 kuralı). Tek ödül ≤ kasanın %2'si; sağlık < 1 → ödül küçülür (en az %15). Hedef rezerv = 12 aylık ödeme.
Trade sitesi geliri: her harcamanın %40'ı oyun kasalarına (oyunda normal harcama gibi bölünür).

## F. Pazar (R4b)

Havuz pazarı: koridor 0,5-2,5 × açılış; komisyon %2 (hazine bölüşümü), mal yakımı %2; tek işlem ≤ havuzun %5'i; işlem öncesi fiyat etkisi uyarısı; geri alım: fiyat < 0,8 × açılış → kasanın haftada %3'ü ile al-yak. İlan pazarı: teçhizat; %2 (1 yakım, 1 kasa); 7 gün; 10 ilan; alıcı önce kilitliden öder, satıcıya %80 kilitli gelir. Geri dönüşüm: Demirhane'de alet/teçhizat → hammaddelerin %70'i geri, ASTRA geri gelmez. Universe satırları gri ve açıklamalı; Hazırlık Deposu Yük İskelesi'nde (kişi başı 4 haftalık üretim, toplam 10 M ASTRA değeri; iptal %10 kesinti; açılış günü Konsey alır, mal aynı havuza).

## G. Nüfus ve ordu (R5)

Köy Evleri: 1. ev 400 odun + 200 taş + 50 demir, her ev ×1,2, en çok 20, ev sayısı ≤ hesap seviyesi; 10 köylü/ev; büyüme günde %2 (buğday varsa); 2 buğday/köylü/gün; 3 gün açlık → günde %5 göç; emek 1/köylü/gün; üretim bonusu +%1 / 10 köylü (en çok +%20); her asker 1 köylü; başlangıç 1 ev + 10 köylü. Askerler bugünkü kural ×0,01 bedel; asker hakkı = geçilen zindan katı + 1; asker seviyesi ≤ hesap seviyesi; Şifahane: 1 şifalı ot = 5 can, ASTRA kısmı yarı. Kolonist/mürettebat sekmeleri kilitli ama görünür.

## H. Uzay Limanı hazırlık modu (R6)

- Roket Rampası: "Roket görevi" (hesap 3; parçalar 2.000 demir, 1.000 kömür, 500 taş, 300 odun, 100 ASTRA; tamamlanınca "Roket hazır" rozeti ve hazırlık puanı; Universe'e geçiş kilidi burada açılır).
- Yük İskelesi: Hazırlık Deposu (F) + kilitli "gönderim" sekmesi.
- Gözlem Kulesi: kilitli; Konsey göstergelerine kısayol.
- "Universe'e hazırlık" ilerlemesi (Konsey ve profil): roket %25, depo doluluğu %25, köylü (100'e göre) %25, asker (10'a göre) %25.

## I. Mevcut sistemler (R7)

Zindan, kolezyum, piyango, çark, Taverna botu, UBI, rehber görevleri, "Sen yokken olanlar", bildirimler aynen taşınır; ASTRA bedelleri ×0,01; bot 6 alanı işletir ve izin dolunca bekler; rehber görevleri yeni yerleri (Köy Evleri, Konsey, Uzay Limanı) kapsar; hazine paneli Sirius Konseyi ekranına dönüşür (kasalar, göstergeler, Otorite, projeler, ortak kasa, kapı durumu). Hesap seviyesi 81, bedelli (bugünkü).

## J. Kapı kuralı (R4/R4c)

Vatandaş sınırı açılış 50; göstergeler (son 3 ay kişi başı aylık dağıtılan kazanç, dolar) eşiği geçince sınır ayda %10: eşikler 10 → 30 → 100 → 300 $ (her eşik ayrı bir büyüme dönemi; yönetici kolu). Kayıt her zaman açık → bekleme sırası (misafir gezer). Pasiflik 14 gün uyarı, 30 gün askı (yer sıradakine, hesap saklanır, dönüşte sıranın önü). Aktif = haftada ≥3 gün giriş ve ≥1 sefer. Cüzdan başına tek hesap; kayıt harcı 1 ASTRA (ölçekli). Göstergeler Konsey ekranında.

## K. Universe'e geçiş aşamaları (R3)

Aşama 0 Realm · Aşama 1 Hazırlık (Yük İskelesi deposu açılır; tetik: ≥4 hammadde 8 hafta tabanda VEYA pazar rezervi < %70) · Aşama 2 Ön sipariş (tetik: aktif ≥300 VE kasa sağlığı < %60 VEYA depo ≥ 8 haftalık üretim) · Aşama 3 Universe (yalnız yönetici düğmesi). İlk sürümde Hazırlık Deposu aşama 1'den itibaren; yönetici panelinden aşama elle de değiştirilebilir.

## L. Kod adımları

K0 dal + config (6 kaynak, ölçek, kasalar, oranlar) + testler güncel · K1 çekirdek (seferler/aletler/silo 6 kaynak; Üretim Hakkı + kapasite + termostat; ortak kasa; Otorite; projeler; köylüler; Şifahane; geri dönüşüm; kasalar; pazar; Hazırlık Deposu; roket görevi; kapı) · K2 sunucu (world: haftalık/günlük kapasite, termostat, kapı, projeler, hesaplaşma) · K3 arayüz (harita AdAstra Vadisi + 20 yer; Köy Evleri, Konsey, Demirhane, Şifahane, Uzay Limanı, Pazar sekmeleri; Kışla ekleri) · K4 test sunucusu yayını + kullanıcıya test hesabı.

## M. Genesis NFT = gezegen satın alma hakkı (kullanıcı kuralı, 7 Ekim 2026)

- Pandora kutularından çıkan 18 eserlik koleksiyonu tamamlayan oyuncu **RoA Genesis NFT** basar (bugünkü kural, bedel 5 ASTRA ölçekli).
- Universe'de **gezegen satın alma hakkı yalnız Genesis NFT sahiplerindedir.** Genesis olmayan Universe oyuncusu başkasının gezegeninde (ya da Sirius'ta) oynar, gezegen alamaz. Hak NFT ile taşınır: ilan pazarında satılırsa hak alıcıya geçer; bir Genesis = gezegen alma hakkı (gezegen sayısı Universe hesap kurallarıyla sınırlanır).
- Sonuç: zindan ve Pandora kutuları Universe'e hazırlığın merkezinde; kutu/anahtar/eser pazar değeri bu hakla büyür. Genesis sahipliği "Universe'e hazırlık" ilerlemesinin %20'si (roket, depo, köylü, asker, Genesis).
- Universe belgelerine (00_IKI_OYUN_BAGI, 02_GEZEGENLER) aynı kural işlendi.
