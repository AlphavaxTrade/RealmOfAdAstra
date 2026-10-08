# Sonra Yapılacaklar (hatırlatma listesi)

Bu listedeki maddeler **şimdi yapılmıyor**; zamanı gelince Claude size hatırlatır. Madde bitince burada işaretlenir.

## A) Sakin bir bilgisayarda yapılacak (yakın zamanda)
- [ ] **HTTP yük eşiğini sakin makinede yeniden ölç.** 8-9 Ekim'de `npm run yuk-kontrol` makine yoğunken geçmedi (90-400 istek/sn; alt sınır 350/300). Sakin anda ölçülen: karma senaryo 854 istek/sn, p95 106 ms. Nasıl: başka ağır iş (backtest, Chrome sekmeleri, derleme) kapalıyken `npm run yuk-kontrol` iki kez; geçerse madde kapanır, geçmezse yavaşlamanın kodumuzdan mı makineden mi geldiği `--cpu-prof` ile araştırılır.
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
- [ ] **Kasa güvenliği kararları:** günlük çekim sınırı (%10) son kararı; dağıtıcı anahtarı için izleme/uyarı (fark edilmezse günlerce akabilir).
- [ ] **Kanarya** (küçük miktar) → ancak sonra gerçek 200 M: sırayla, her adım sizin onayınızla.

## C) KARAR 4-7 ve sponsorluktan kalan küçük işler (9 Ekim 2026)
- [ ] **Gerçek oyuncu yoğunluğunda ödeme bütçesi izlenmeli:** `treasury.state.lastWeekBudget / lastWeekSpent` her hafta kaydedilir; bütçe sık doluyorsa oranları/ mesajı gözden geçir. Bütçe dolunca oyuncuya ayrı "bu haftaki bütçe doldu" mesajı yok (şimdilik "kasa boş" benzeri yanıt).
- [ ] **k üst sınırı (1,5) pratikte çalışmıyor** (zirve ≥ güncel): kullanıcı isterse "30 günlük ortalamaya bölme" ile anlam kazanır.
- [ ] **Sağlık yumuşatması çift sayılıyor** (tek ödeme + haftalık bütçe): kullanıcı karar verirse birini kaldır.
- [ ] **Sponsorluk, ikinci sürüm:** doğrudan zincirden sponsor yatırma, sözleşmenin zincirde tutulması, sponsorlu harcamanın katkı puanındaki etkisinin gerçek davranışla ölçülmesi, hukuki nitelendirme (kullanıcıda).
- [ ] **İlk 4 hafta ısınma:** çekim tavanı alım geçmişi birikene dek taban değerinde (bugünkü kuralın %20'si) kalır; canlıya yakın bir denemede bunun oyuncuya anlatımı düşünülmeli.
