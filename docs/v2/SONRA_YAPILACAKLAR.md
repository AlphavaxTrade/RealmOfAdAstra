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
- [ ] **Seviye atlama bedeli yalnız odun, demir ve buğday:** diğer üç hammadde (taş, kömür, şifalı ot) bedelde yok. Bilinçli mi, 6 hammaddeye mi genişletilsin? (Ekonomi kuralı: karar gerekir.)
- [ ] **Risk duyurusu metni eski** (`GAME_CONFIG.ANNOUNCEMENTS`): "antigravity ide gemini botu", "hiçbir audit yapılmamıştır" yazıyor; kurumsal denetim programı ve OWASP çalışması sonrası güncel değil. Yeni metni sizin onayınızla yazarım.
- [x] **Altın kayıt yenilendi (11 Ekim 2026, tarama düzeltmeleriyle):** ölü alanlar `botSettings` ve `lastBotSiloAction` ile ölü işlem `sweepCompletedExpeditions` kaldırıldı.
- [ ] **Eski stil dosyaları:** `css/style.css`, `css/theme.css`, `css/battle-arena.css` canlı kurallardır (ölü kural kalmadı) ama Gemini dönemi yazımdır; telefonda görsel karşılaştırmayla bir günde yeniden düzenlenebilir. Acil değil.
- [ ] **Genel tarama kararları:** `docs/v2/TARAMA_2026-10.md` "Karar bekleyenler" bölümü (ilan pazarı kilit aklama, Kolezyum ödül ölçeği, bot ücreti ve kişisel hak, ön-hesap ele geçirme, canlıya çıkmadan ödeme adresi sabitleme ve Vercel başlıkları).
