# Sonra Yapılacaklar (hatırlatma listesi)

Bu listedeki maddeler **şimdi yapılmıyor**; zamanı gelince Claude size hatırlatır. Madde bitince burada işaretlenir.

## A) Sakin bir bilgisayarda yapılacak (yakın zamanda)
- [x] **HTTP yük eşiği ölçüldü (11 Ekim 2026): GEÇTİ, iki kez.** Makine tam sakin değildi (arka planda %40-65 CPU). 1. koşu: state 752 / karma 702 istek/sn, p95 ≈ 110 ms; 2. koşu: state 1359 / karma 1322 istek/sn, p95 ≈ 53 ms; hata 0 (alt sınırlar 350 / 300). Not: sakin makinede ayrıca tekrar ölçmek gerekmez; 30 dk dayanıklılık testi hâlâ B listesinde. (Eski kayıt: **HTTP yük eşiğini sakin makinede yeniden ölç.** 8-9 Ekim'de `npm run yuk-kontrol` makine yoğunken geçmedi (90-400 istek/sn; alt sınır 350/300). Sakin anda ölçülen: karma senaryo 854 istek/sn, p95 106 ms. Nasıl: başka ağır iş (backtest, Chrome sekmeleri, derleme) kapalıyken `npm run yuk-kontrol` iki kez; geçerse madde kapanır, geçmezse yavaşlamanın kodumuzdan mı makineden mi geldiği `--cpu-prof` ile araştırılır.)
- [ ] **Hatırlatma zamanı:** bilgisayarı yalnız bu iş için boş bıraktığınızı söylediğinizde ya da test ağına geçmeden önce — hangisi önceyse.

## B) Gerçek ağa (test ağı / Fuji ve sonrası) çıkarken yapılacak
Geçiş kararını siz verirsiniz; karar verdiğinizde Claude bu listeyi önünüze koyar.
- [ ] **30 dakikalık (ve daha uzun) dayanıklılık testi:** `node scripts/yuk/yuk.mjs --oyuncu=500 --baglanti=100 --senaryo=karma --soak=1800` — bellek sızıntısı, olay döngüsü gecikmesi.
- [ ] **Gerçek Avalanche ağında deneme (önce test ağı):** kasa sözleşmesi dağıtımı, gerçek gaz maliyeti ölçümü (yerelde ganache'ta ölçüldü), gerçek RPC kesintilerinde ödeme kuyruğu davranışı.
- [ ] **Gerçek ADASTRA token'ı ile deneme:** token'ın transfer davranışı (ücret/yakım içeren özel transfer olabilir; yerel testler düz ERC20 ile yapıldı). `kontrat/` altındaki "gerçek token çatal" testinin benzeri kasa sözleşmesi için de çalıştırılmalı.
- [ ] **PostgreSQL / canlı sunucu ortamı:** oyun yerelde SQLite ile denendi; canlı ortam veritabanı, Caddy, systemd, yedekleme ve yedekten dönme tatbikatı oyun için ayrıca denenmeli.
- [ ] **Gerçek Arena alımı (Kanal B):** `buyAndCreateLpIfPossible` anlamı ve fazla AVAX iadesi doğrulanmadan kodlanmadı; gerçek ağda küçük miktarla doğrulanmalı.
- [ ] **Gerçek posta ve gerçek telefon:** e-posta gönderimi, telefon tarayıcıları (Safari dahil).
- [ ] **Kanal A gerçek ayarı (sizin eyleminiz):** `PARTNER_INCOME_FROM/TO` ve trade sitesindeki Bot Kasası `oyunKasasi` adresi.
- [x] **Kasa günlük çekim sınırı: %5 (karar 11 Ekim 2026).** Kasa sözleşmesi kurulurken `dailyLimitBps: 500` verilecek (şimdiye dek zincire kurulmadı; saldırı testi %5'e göre güncellendi: çalınan dağıtıcı anahtarı ilk 24 saatte en çok %4,85).
- [ ] **Kasa güvenliği:** dağıtıcı anahtarı için izleme/uyarı (fark edilmezse günlerce akabilir).
- [ ] **Kanarya** (küçük miktar) → ancak sonra gerçek 200 M: sırayla, her adım sizin onayınızla.

## C) KARAR 4-7 ve sponsorluktan kalan küçük işler (9 Ekim 2026)
- [ ] **Gerçek oyuncu yoğunluğunda ödeme bütçesi izlenmeli:** `treasury.state.lastWeekBudget / lastWeekSpent` her hafta kaydedilir; bütçe sık doluyorsa oranları gözden geçir.
- [x] **"Bu haftaki ödeme payı doldu" mesajı eklendi (11 Ekim 2026):** `withdraw` sonucunda `budgetFull`; zindan, görev, world boss mesajlarında gösterilir (kolezyum yalnız alanı taşır, ekranda henüz yok).
- [x] **k üst sınırı:** karar: olduğu gibi kalsın (pratikte 1,0); veri görülünce yeniden bakılır.
- [x] **Sağlık yumuşatması çift sayımı kaldırıldı (11 Ekim 2026):** bütçeli kasalarda tek ödeme artık sağlıkla küçülmez (haftalık bütçe zaten sağlık çarpanını uygular); bütçesiz kasalar (Konsey…) eskisi gibi.
- [ ] **Sponsorluk teklif–kabul sürümü (11 Ekim 2026'da kullanıcı kararıyla ERTELENDİ):** yatırımcı miktar + getiri yazan teklif gönderir, alan kabul ederse sistem işler (örnek: 100 M, %30 → 130 M geri ödenene dek çekimin %50'si). Çıkmaz/kötüye kullanım analizi ve 8 açık soru (süre sınırı, yatırım ve getiri tavanı, sabit pay, sponsor sayısı, yalnız serbest bakiye, erken kapatma, teklif süresi) 11 Ekim sohbetinde sunuldu; kullanıcı dönünce oradan sürülür. Mevcut sabit sürüm (%30 / 12 ay / 2×) olduğu gibi duruyor.
- [ ] **Sponsorluk, ikinci sürüm:** doğrudan zincirden sponsor yatırma, sözleşmenin zincirde tutulması, sponsorlu harcamanın katkı puanındaki etkisinin gerçek davranışla ölçülmesi, hukuki nitelendirme (kullanıcıda).
- [ ] **İlk 4 hafta ısınma:** çekim tavanı alım geçmişi birikene dek taban değerinde (bugünkü kuralın %20'si) kalır; canlıya yakın bir denemede bunun oyuncuya anlatımı düşünülmeli.

## D) Yeniden yazım sırasında çıkan, kullanıcı kararı bekleyenler (11 Ekim 2026)
- [ ] **Çarkın %0,5'lik "Coin analiz kuponu" dilimi:** oyun kupon kodunu tarayıcıda üretiyor ama trade sitesi bu kodu tanımıyor (`pending_integration`). Site bağlanana kadar çarktan çıkarılsın mı, yoksa gerçek bir hakka mı bağlansın?
- [x] **Seviye atlama bedeli altı hammaddeye genişletildi (13 Ekim 2026)** ve yeni hammaddeler için kullanım planı yazıldı ve uygulandı: `docs/v2/HAMMADDE_KULLANIM_PLANI.md` (ölçüm: `node scripts/model/hammadde_kullanim.mjs`).
- [x] **Risk duyurusu metni kaldırıldı (13 Ekim 2026, kullanıcı isteği):** eski v1.25 sürüm notu da kaldırıldı; duyuru listesi boş, şerit görünmez. Yeni duyuru gerekirse `GAME_CONFIG.ANNOUNCEMENTS` dizisine eklenir.
- [x] **Altın kayıt yenilendi (11 Ekim 2026, tarama düzeltmeleriyle):** ölü alanlar `botSettings` ve `lastBotSiloAction` ile ölü işlem `sweepCompletedExpeditions` kaldırıldı.
- [x] **Eski stil dosyaları sadeleştirildi (13 Ekim 2026):** `css/style.css`, `css/theme.css`, `css/battle-arena.css` görünüm değiştirmeden küçüldü (79,7 KB → 64,6 KB; `style.css` 1.139 → 746 satır): 272 fazlalık bildirim, 12 boş kural ve boş bölüm başlıkları silindi, başlıklar Türkçeleştirildi, Google yazı tipi `@import`'u `index.html`'e taşındı. Doğrulama: 17 genişlik × 70 ekran durumunun tam stil parmak izi birebir aynı + canlı uygulamada 144 durumun hesaplanmış stil karşılaştırması. Araçlar: `scripts/tarayici/{stil-kaydi,stil-fark,css-sadelestir}.mjs`. Bilerek dokunulmayanlar: @media/@keyframes içindekiler, :hover/:focus gibi durum kuralları, `-webkit-` önekliler, ölçülmeyen özellikler (scrollbar-*, isolation, grid-template-areas, all).
- [x] **Genel tarama kararları 1-4 (12 Ekim 2026'da uygulandı):** ilan pazarı kilit aklama, Kolezyum ödül ölçeği (25 ASTRA taban), bot ücreti kişisel hakka göre, ön-hesap ele geçirme (doğrulamada şifre yeniden belirlenir). Ayrıntı `docs/v2/TARAMA_2026-10.md`.
- [x] **Denge kararları R7, R10, R11, R16, R17 (13 Ekim 2026'da uygulandı):** Konsey stoğu kendiliğinden yapıya aktarılır, çelik payı kömürdür, Dünya Bossu havuzu gerçeği gösterir, Fatih Ödülü kodlandı, eski üç alan kalıntıları temizlendi.
- [ ] **Genel tarama, kalan kararlar:** canlıya çıkmadan ödeme sözleşmesi/token adresinin derlemeye sabitlenmesi ve Vercel güvenlik başlıkları; R14 (katkı puanı mesajı), R15 (çark/promo kasa defteri), R19 (asker hakkı kuralları) kararları; seviye hızı (XP tablosu üç alana göre yazılmış, altı alanda iki kat hızlı).

## E) 13-14 Ekim 2026 canlıya çıkış denetimi: durum
Ayrıntı ve kanıtlar: yerel denetim raporu (docs klasöründe, adı DENETIM_RAPORU_2026-10-13; git'e girmez, sömürü açıklamaları içerir). Düzeltmeler dal `denetim-2026-10`'da (`guncel`'e birleştirilmedi, sunucuya yüklenmedi).

### Yapıldı (testle ve gerçek tarayıcıda doğrulandı)
- [x] **Ekonomi:** seviye bedeli silo kapasitesini aşmıyor (EK-01); faucet ağırlık tavanı (EK-03); AMM al-sat kilit açma (EK-04); zindan günlük kişi tavanı ve haftalık kişi payı (EK-05); kolezyum puanı ve ödül tavanı (EK-06); dünya bossu kilidi (EK-07); piyango yaşlanması (EK-08); modeller koda bağlı (EK-09); kasa ömrü (EK-10); ilk seviyeler "önce silo" ipucu (EK-12); kolezyum ölü alanı kaldırıldı; kişi payı tavanı ilk haftada ve az aktifte. Karar ve ölçümler: `TARAMA_2026-10.md`, `KARARLAR_KESIN.md` ("13 Ekim" ve "14 Ekim" bölümleri).
- [x] **Sahte hesap (EK-02):** e-posta benzersizlik anahtarı (+etiket, gmail noktası), kapı IP kotası (varsayılan 24 saatte 3, aşan sırada bekler; yönetici panelinden değiştirilir/muaf tutulur).
- [x] **Hassas veri (A2):** e-posta belirteçleri özetli, TOTP sırrı AES-256-GCM (`HESAP_ANAHTARI`), yedek kodlar scrypt + tuz (yenileme ucu ve Hesabım düğmesi); üretimde `HESAP_ANAHTARI` ve `YEDEK_ANAHTAR` zorunlu.
- [x] **Kontratlar:** kasa günlük sınırı kayan pencere, bekçi rolü, ücretli token koruması (AmountMismatch), `RealmPayments` zaman kilidi, yapımcı payı üst sınırı; `contracts/deploy-kasa.mjs` (DRY_RUN, 500/200'den gevşeği reddeder). Slither 0.11.6: yalnız yanlış pozitif.
- [x] **Sunucu:** `checkPayout` çoklu RPC + yaş + olay taraması (W1); belirsiz ödeme ve belirsiz kasa işlemi yönetici çözümü; kuyruk hata yalıtımı; log maskesi; <1 ASTRA ödeme devri; sistem hesabı 0 ile açılır.
- [x] **Arayüz:** giriş/doğrulama/ödeme/2FA pencereleri erişilebilir, dar ekranda üst çubuk menüsü, açılış perdesi ve yükleme hatası kartı, 429 yeniden deneme, güvenli alan + dvh, zil panelinde kalıcı bildirim, ödeme tavanı ve silo ipucu mesajları, yazı boyutu ayarı gerçekten çalışıyor.
- [x] **Gerçek ağ derlemesi (H1):** `REALM_GERCEK_AG=1` ile sözleşme/token adresi derlemeye sabitlenir; approve yalnız tutar kadar.
- [x] **Docker imajı gerçekten derlendi ve çalıştırıldı** (13 Ekim, yerelde; sağlık 200, kayıt, CSP; üretim kipi eksik ayarda açık hata veriyor).
- [x] **Tarayıcılar:** Chrome (telefon + masaüstü), WebKit ve Firefox motorları (Playwright) çekirdek senaryo 42/42; 3B harita gerçek GPU'da ölçüldü (aşağıda).

### Açık kalanlar (kod dışı ya da sizin kararınız)
- [ ] **Bağımsız profesyonel kontrat denetimi** ve hata ödül programı: gerçek ağdan ÖNCE (yapay zekâ incelemesinin yerine geçmez).
- [ ] **Fuji (test ağı) provası:** `deploy-kasa.mjs` ve `deploy.mjs` ile gerçek kurulum, bekçi ataması, gerçek ASTRA token'ının transfer davranışı (ücret/yakım var mı: `AmountMismatch` standart ERC-20 varsayar). AVAX ve yükleme anahtarı gerekir.
- [ ] **Gerçek cihazlar:** iOS Safari / Android Chrome / dokunmatik Firefox, gerçek MetaMask/Core cüzdanı; güvenli alan ve `dvh` düzeltmeleri yalnız emülasyonla doğrulandı.
- [ ] **EK-02 (c):** peşin kayıt harcı ve cüzdan zorunluluğu uygulanmadı (cüzdansız ücretsiz oyuncuyu kapıdan döndürür; dolar tabanlı harç gerekir). Kararınız.
- [ ] **IP kotası ve test sunucusu:** aynı NAT arkasındaki 3'ten fazla test kullanıcısı sıraya düşer; yönetici panelinden kota yükseltilir ya da muaf tutulur.
- [ ] **Sv.10+ taş/kömür/şifalı ot talebi:** "kabul + izleme" kararı (kota tabanda görünürse): `kotaTabani` uyarısı iki ardışık haftada çıkarsa yeni hammadde kullanımı (ot çayı, alet onarımında taş/kömür) gerekir (yeni işlem + ekran).
- [ ] **Kasa ömrü sınırda:** ~59,7 ay (60 ayda fiyat çarpanı ×0,9 → ×0,8); gerçek veriyle izlenmeli.
- [ ] **Gerçek veri / telemetri:** ücretsiz oyuncu gelir dağılımı, bütçe doluluk saati, kayıt başına IP/e-posta tekrarı; modeller sahte saat ve sahte dünyaya dayanıyor.
- [ ] **Elle doğrulanacak akışlar:** piyango gerçek haftalık çekiliş, Konsey proje tamamlama, Taverna "bekliyor" kartı.
- [ ] **3B harita:** sessiz makinede yeniden ölç; zayıf GPU'da otomatik kalite düşürme (dpr/gölge) eklenebilir (varsayılan harita 2B).
- [ ] **Hukuki/uyum incelemesi:** çark/piyango/loot kutusu, token ve ödeme akışları, gizlilik (kullanıcıda).
- [ ] **CI'da Docker derlemesi** ilk çalışmada izlenmeli (yerelde derlendi; `SecretsUsedInArgOrEnv` uyarısı adres adı yüzünden yanlış pozitif).
- [ ] **Kuru gözlem notları:** 2FA 5 hatalı kod sonrası mesaj düzeltildi; yedek kod yenileme arayüzü eklendi; mevcut (eski) veritabanında 2,5 ASTRA ile açılmış sistem hesabı düzeltilmedi (yeni kurulumlarda 0).

## 14 Ekim 2026 (akşam): dağıtım turu — yapılanlar ve kalanlar

**Yapıldı (canlı: https://roa.alphavaxtrade.com, deneme modu, zincir kapalı):**
- `guncel` dalı `denetim-2026-10` ile birleşti (GitHub'a gönderilmedi); test sunucusu güncellendi, DNS `roa` → 54.81.201.200, Caddy sertifikası alındı (eski `test.` ve `www.` blokları kaldırıldı).
- **Kasa:** kod sabit; yeni "yeni kasaya geçiş" yolu (bekçi şart, 7 gün, günde %25, hedef aynı token + yakım adresli kasa; bekçi ya da sahip iptal eder; sunucu bekleyen öneride ödemeyi durdurur). Fuji'de zincir üzerinde denendi (adresler: `docs/FUJI_ADRESLERI.md`).
- **Muhafız Mührü sıfırlama (yönetici):** 48 saat bekler, e-postaya iptal bağlantısı gider, oyuncu Hesabım'dan da iptal eder (kod şart); kod/anahtar gönderilmez. Geçiş 008.
- **Oyun rehberi:** `public/rehber.html` (29 bölüm, 39 oyun içi görsel); HUD düğmesi, Ben menüsü, Ctrl+K.
- Masaüstü yerleşim: kart yığını sol alt köşeye oturur; bölge bilgi kartı üst çubuğun altında kalır.
- Tam kapı (`npm run kontrol`): 173/173 test, satır %96,71, build ve üretim bağımlılık denetimi temiz.

**Kalanlar (yapay zekâ yapamaz / karar ister):**
- Bağımsız kontrat denetimi; Fuji'de kalıcı sahip olarak donanım cüzdanı (Ledger) ve ayrı soğuk bekçi cüzdanı; gerçek ağda küçük tutarla deneme.
- Sunucuyu Fuji'ye bağlamak (`TEST_MODE=0`, SMTP, `HESAP_ANAHTARI`, `YEDEK_ANAHTAR`) — ayrı iş.
- Gerçek cihaz denemesi (iOS Safari, Android, MetaMask); hukuki inceleme; gerçek telemetri.
- Ana ağdaki 0,01 AVAX'ın (test cüzdanı) iadesi: kullanıcının geri gönderme adresi bekleniyor.
- GitHub'a gönderim: kullanıcı isteyince.

## 15 Ekim 2026: Teknik başvuru (rehberin sayılar bölümü) ve bulunan boşluk

**Yapıldı:**
- `public/rehber.html` sonuna 18 "Teknik başvuru" bölümü eklendi (bütün limitler tek tabloda, ASTRA bölüşümü, sefer/stamina tabloları, seviye 1-81 bedelleri, silo bedelleri, kota formülleri, Otorite ve Konsey, kilitli bakiye, çekim formülleri ve örnek, pazar formülü, kasa bütçeleri, asker/teçhizat/onarım, köy/bot, zindan-kolezyum-boss-çark-piyango, UBI ve ücretsiz havuz, fiyat çarpanı, zincir sınırları).
- Bölümler `node scripts/rehber-teknik-uret.mjs` ile oyun motorundan üretilir; `tests/test_rehber_teknik.mjs` eskiyince kırılır (hizli kapıda).
- Rehberin el yazısı bölümleri koda karşı doğrulandı ve düzeltildi: roket bedeli 1 ASTRA (100 değil), zindan günlük bütçesi %0,36 (%1 değil), çark dönüşü ~%83 (%81 değil), kilit açılma haftalık ek %1,4 (toplam ~%2,4), çekim örneği en az 1.000 ASTRA.
- Hafta gününe bağlı iki kararsız test düzeltildi (test_bot_kurallari: zaman haftanın ilk gününe sabitlendi; test_battle_settlement_before_replay: kolezyum günlük ödül tavanı hesaba katıldı). İddialar korundu.

**KARAR BEKLİYOR (ekonomi sayısı, kullanıcıyla konuşulur):** `docs/v2/KARARLAR_KESIN.md` iki kural yazıyor ama motorda uygulanmıyor:
1. **Asker hakkı = geçilen zindan katı + 1.** Motor yalnız ASTRA bedeli ve köylü sayısına bakıyor (50 köylüyle 1. katta 30 asker alınabiliyor).
2. **Asker seviyesi <= hesap seviyesi.** Motorda üst sınır yok (hesap seviyesi 1 iken asker seviyesi 100'ü aşabiliyor).
Seçenekler: (a) kuralları koda ekle (ekonomik etkisi: ordu daha yavaş büyür, Fatih/zindan hesapları değişir; altın kayıt testleri yenilenir), (b) kararı belgeden kaldır, rehber şu an gerçek durumu yazıyor.
