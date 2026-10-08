# İş Planı — KARAR 4-7 ve Sponsorluk (taslak, onay bekliyor)

Tarih: 9 Ekim 2026 · Dal: `kurumsal` · Durum: **UYGULANDI (9 Ekim 2026, "sen karar ver" yetkisiyle): Faz 1-4 ve sponsorluk kodlandı.** Faz 0'da "dış alım" ölçümü zincirdeki net token akışı + trade sitesi payı olarak tanımlandı (sunucuda günlük kutular, `world:economy.flow`).
Kararların içeriği `docs/v2/E_PLANI_DURUM_2026-10-08.md` dosyasında. Bu belge yalnız "nasıl, hangi sırayla, neyle doğrulayarak" sorusunu cevaplar.

## Çalışma kuralları (bu plan için de geçerli)
- Önce yerel (localhost); gerçek ağ, anahtar, para, canlı sunucu yok. Test ağı kararı sizindir.
- Her faz: **model/simülasyon kapısı → kod → test → tam test takımı → commit.** Bir faz geçmeden sonrakine geçilmez.
- Her kural değişikliği `scripts/model/denge_modeli.mjs` ve `scripts/simulasyon/yil.mjs` (6 senaryo) ile **önce/sonra** karşılaştırılır; ASTRA korunumu ihlali olursa faz durur.
- Sayılar (oranlar, tavanlar) sizin onayladığınız değerlerdir; ben yalnız koda dökerim. Yeni bir sayı gerekirse size sorarım.
- Sözleşme (RealmRates) değişikliği gerekirse yalnız yerel ganache'ta denenir.

## Önerilen sıra ve nedeni

| Sıra | Faz | Neden bu sırada |
|---|---|---|
| 0 | Hazırlık: "dış alım" ölçümü | KARAR 5 ve 7 buna dayanıyor; önce nasıl ölçüleceği netleşmeli |
| 1 | KARAR 4 — çekim ücreti yakımı %30 → %50 | En küçük ve en yalıtılmış değişiklik; ısınma, riski düşük |
| 2 | KARAR 6 — tek fiyat çarpanı k | KARAR 5 ve kilit açılma tabanı bunu kullanır |
| 3 | KARAR 5 — ikili çekim tavanı | k ve dış alım ölçümü hazır olunca |
| 4 | KARAR 7 — girişe bağlı ödeme oranı | En geniş etki (5 kasa); en son, en çok test |
| 5 | Sponsorluk | Önce ayrı tasarım turu (aşağıda); KARAR 4-7'den bağımsız ilerleyebilir |

## Faz 0 — "Dış alım" nasıl ölçülür? (kod yok, önce karar)
KARAR 5 ve 7 "son 4 haftadaki dış alım"a bağlı. Tanım: oyuncunun doğrudan ASTRA alımı **+** trade sitesinden oyuna gelen pay. Bugün kodda bu sayı **yok**; bulabileceğimiz kaynaklar:
- Trade sitesi payı: `creditPartnerIncome` / `scanPartnerIncome` (server/world/ortakGelir.js) zaten kayıt tutuyor → hazır.
- Doğrudan alım: Arena eğrisinden okunan arz değişiminden (`snapshotMarket` her hafta kaydediyor) türetilebilir; ama oyunun kendi cüzdan hareketi ve yakımlar bundan ayrıştırılmalı.
**Yapılacak:** haftalık "dış alım" satırı tanımla, `econ()` geçmişine yaz, 4 haftalık toplamı ver; simülasyonda bilinen dış girişle doğrula. **Sizden gereken:** doğrudan alım ölçümünün (zincir arzı farkı) yeterince doğru olup olmadığına, ya da yalnız trade sitesi payıyla başlayıp doğrudan alımı sonra eklemeye karar.

## Faz 1 — KARAR 4: çekim ücretinin yakım payı %50
- **Neresi:** `server/economy.js` `WEEKLY_RULES` (`feeUbiShare`), `allocateWithdrawals`, `js/economy/rates.js` (`withdrawFeeUbi`), `server/world/oranlar.js`; panelde/arayüzde "ücretin ne kadarı yakılır" metinleri.
- **Yapılacak:** ücretin %50'si yakılır, %50'si temel gelir havuzuna; ödeme satırlarında `feeBurn` ve UBI payı doğru toplansın.
- **Testler:** `allocateWithdrawals` birim testi (net + ücret + kira = toplam; yakım = ücretin %50'si); `test_sim_kisa` ve tam simülasyonda korunum; altın kayıt bilerek yenilenirse nedeni yazılır.
- **Risk:** RealmRates sözleşmesinde aynı oran varsa sözleşme ve sunucu değerleri ayrışmamalı (bkz. `test_rates_contract`).

## Faz 2 — KARAR 6: tek fiyat çarpanı k
- **Tanım:** k = piyasa değeri / 30 günlük zirve, 0,5 – 1,5 aralığında. İki yere uygulanır: (a) kilit açılma tabanı (haftalık %1 × k; `js/config.js` `WEEKLY_UNLOCK_BASE`), (b) çekim tavanı (× k). Giriş günü primi (%1,4) k'den etkilenmez.
- **Önce:** 30 günlük zirve verisi nereden gelecek? `snapshotMarket` geçmişi var mı, yoksa fiyat geçmişi tutulmalı → Faz 0'a eklenir.
- **Neresi:** `server/world/piyasa.js`, `js/gameState` kilit açma yolu (sunucu ve tarayıcı **aynı fonksiyonu** kullanmalı: `js/economy/` altına saf fonksiyon, `katilimEsik.js` gibi).
- **Testler:** k sınırları (0,5 / 1,5), fiyat çöküşü senaryosunda (S3) kilit açılmasının ve çekimin yavaşlaması, giriş primi sabit kalıyor.

## Faz 3 — KARAR 5: ikili çekim tavanı
- **Kural:** haftalık tavan = min(bugünkü kural [fiyatı %2 düşürecek miktar], son 4 haftadaki dış alımın %50'si), ama **asla bugünkü kuralın %20'sinden az değil**.
- **Neresi:** `server/economy.js` `withdrawCapTokens`, `server/world/piyasa.js` `currentCap`; kapı göstergesi (`recordWeek`) zaten tavanı okuyor, bu yüzden gösterge otomatik güncellenir.
- **Testler:** dış alım sıfırken tavan = bugünkünün %20'si; dış alım büyükken tavan = bugünkü kural; toplu çekim senaryosunda (S4) tavanın bağlaması; kapı göstergesi.
- **Bilmeniz gereken:** bu kural çekilebilen tutarı düşürür → "büyüme eşiği" (50 $/ay) daha da uzaklaşır; modelde yeniden ölçüp size rakamla sunarım.

## Faz 4 — KARAR 7: girişe bağlı ödeme oranı
- **Kural:** haftalık ödeme = kasa × taban oran (zindan 2,5 · kolezyum 2 · boss 3 · görev 2,5 · karnaval 2) × sağlık çarpanı (0,15 – 1,0) **+ son 4 haftanın girişinin %90'ı**. Model kapısı: sıfır girişte 200 M'nin ömrü ≥ 36 ay.
- **Neresi:** `js/treasury.js` (`withdraw`, `getPoolHealth`, haftalık ödeme bütçesi yeni kavram), `js/config.js` (taban oranlar), `server/kapi.js` (dağıtılan göstergesi aynı kalmalı), RealmRates (oranların zincirde tutulması isteniyorsa).
- **Önce model:** `scripts/model/denge_modeli.mjs`'te kuralı yaz, "sıfır girişte ömür ≥ 36 ay" kapısını geçtiğini göster; geçmiyorsa kod yazılmaz, size rakamla dönerim.
- **Testler:** her kasa için haftalık tavan; girişsiz ve girişli haftalar; 6 simülasyon senaryosu; kasa ömrü ölçümü (`kasaOmruAy`); Faz 1-3 ile birlikte korunum.
- **En çok risk burada:** 5 kasanın ödeme davranışı değişir (oyuncunun gördüğü ödüller küçülebilir). Oyuncu deneyimini senaryo dünyasında (:8081) elle denemeniz gerekir.

## Faz 5 — Sponsorluk / yatırım (ÖNCE TASARIM TURU)
Dışarıdaki B, aktif oyuncu A'ya ASTRA gönderir; A bu parayı oyundan asla çekemez, yalnız oyunda kullanır; A gerçek çekim yaptığında net miktarın bir kısmı otomatik B'ye gider.
Kodlamadan önce sizinle **şu sorular** kapanmalı (tasarım belgesi `docs/v2/SPONSORLUK_TASARIMI.md` olarak yazılır):
1. B'nin payı ne kadar (oran, tavan), ne kadar süre? B parasını geri isteyebilir mi? Sözleşmeyi A iptal edebilir mi?
2. Aktif oyuncuların gelişimini gösteren **herkese açık tablo**: hangi alanlar (seviye, katılım, haftalık kazanç)? Gizlilik: A'nın cüzdanı görünür mü?
3. Yan hesapla kötüye kullanım: B kendi A'sını yaratıp parayı içeri sokup, "çekim payı" ile geri alabilir mi? (Önlem: yalnız katılım puanı şartını sağlayan, vatandaş sayısına dahil hesaplara sponsorluk; sponsorluk tavanı; bekleme süresi.)
4. Hukuki konular sizde (ben değerlendirmem); ama teknik olarak "A'nın bakiyesi çekilemez" kuralı nasıl zorlanır: ayrı bir `sponsorluBakiye` defteri ve çekim hesaplaşmasında hariç tutulması.
5. Zincir tarafı: B'nin yatırdığı ASTRA oyun cüzdanına mı, kasaya mı? Hangi sözleşme kayıt tutar? (İlk sürüm yalnız sunucu defteri, sözleşme sonra.)
**Çıktı:** tasarım belgesi → onayınız → ayrı iş planı. Bu turda kod yazılmaz.

## Her faz sonunda size sunacağım
1. Ne değişti (sade Türkçe), 2. önce/sonra rakamlar (simülasyon + model), 3. ne denendi / ne denenmedi, 4. varsa kararınıza kalan sayı, 5. commit numarası. GitHub'a göndermeyi her seferinde sorarım.

## Tahmini iş yükü (kaba; kesin söz değil)
Faz 0: küçük · Faz 1: küçük · Faz 2: orta · Faz 3: orta · Faz 4: büyük · Faz 5 tasarım: orta (kodu ayrı). Fazların her biri ayrı oturumda, ayrı commit'te bitirilebilir.
