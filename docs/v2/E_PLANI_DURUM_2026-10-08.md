# E-plani durumu ve bekleyen kararlar (8 Ekim 2026)

Kaynak: plan dosyasinin "Ek" bolumunun kalici kopyasi (KARAR 4-7 ayrintilari baska belgede yok).

##  E-planı durumu ve bekleyen kararlar (8 Ekim, eski planın özeti — ayrıntılar başka belgede YOK, silinmesin)

**Bitti (commit'ler `kurumsal` dalında):** Faz 0 `a50fa06` `af38cc7` `702800b` · Faz 1 `f3351be` `68e2ce9` (GitHub'da) · Faz 2 `cec4f80` `4ab2082` `c65d1bd` · Faz 3 adım 1 `b5d686e` (bu 4'ü GitHub'a GÖNDERİLMEDİ).

**Kesinleşti ama henüz kodda değil (KARARLAR_KESIN.md'de de yok):**
- **KARAR 4** — Çekim ücretinin yakım payı %30 → **%50** (ücretin yarısı yakılır, yarısı temel gelir havuzuna).
- **KARAR 5** — İkili çekim tavanı: haftalık tavan = min(fiyatı %2 düşürecek miktar [bugünkü kural], **son 4 haftadaki dış alımın %50'si**), ama **asla bugünkü kuralın %20'sinden az değil** (dış alım sıfırsa da çekim tamamen kilitlenmesin). "Dış alım" = oyuncunun doğrudan ASTRA alımı **+ trade sitesinden oyuna gelen pay** (o müşteri de dolarla almış sayılır — kullanıcı düzeltmesi).
- **KARAR 6** — Tek fiyat-duyarlılık çarpanı **k = piyasa değeri / 30 günlük zirve, 0,5-1,5 aralığında**; **iki yere** uygulanır: kilit açılma tabanı (haftalık %1 × k) ve çekim tavanı (× k). Giriş günü primi (%1,4) kalır, k'den etkilenmez.
- **KARAR 7** — Girişe bağlı ödeme oranı: haftalık ödeme = kasa × taban oran (zindan 2,5 · kolezyum 2 · boss 3 · görev 2,5 · karnaval 2) × sağlık çarpanı (0,15-1,0) **+ son 4 haftanın girişinin %90'ı** (giriş = o kasaya gelen harcama + dış gelir payı). Model kapısı: sıfır girişte 200 M'nin ömrü ≥ 36 ay.
- **KARAR 3'ün kalan kısmı** — `server/chain.js` ödemelerinin Oyun Kasası sözleşmesinden geçmesi (bu planın T2'si), sonra Fuji → kanarya → gerçek 200 M (kullanıcı "o seviyeye gelmedik" dedi; geçişi kullanıcı başlatır).

**Ayrı tasarım turu gerektiren yeni fikirler (kullanıcı, 8 Ekim):**
- **Sponsorluk / yatırım:** dışarıdaki B, aktif oyuncu A'ya ASTRA gönderir; A bu parayı oyundan **asla çekemez**, yalnız oyunda kullanır; A gerçek çekim yaptığında net miktarın bir kısmı **otomatik B'ye** gider. Gerekli: aktif oyuncuların gelişimini gösteren herkese açık tablo, oran/iptal/süre kuralları, yan hesapla kötüye kullanım koruması.
- **Ekosistem-geniş hazır aday önceliği:** trade sitesinde bot kullanıp yakılan ASTRA, ileride stake sitesinde kilitlenen bakiye, trade sitesinde paket alımı sıra önceliğini yükseltsin (eşik/ağırlık sonra).

**Planda olup henüz yapılmayan diğer parçalar:** gerçek dolaşım (float) göstergesi (3.1) · haftalık yakım ekranı (3.2) · "hazine satmaz" ilanı (3.4) · oyun içi ihtiyaç/dağıtılan oranı 1,1-1,3 termostatı (3.5) · kasa kalan ömrü sarı/kırmızı + otomatik kısma (4.1) · RealmRates genişlemesi (kolezyum/boss/görev/karnaval haftalık oranları, geri alım hızı, ücretsiz havuz tavanı, kilit açılma tabanı, çekim yakım payı) (4.3) · haftalık yapay zeka öneri raporu `scripts/ekonomi/haftalik-oneri.mjs` (4.5) · isteğe bağlı fikirler: katkı payı, Konsey Tahvili, yakım töreni, aday mentorluğu, Universe ön sipariş merdiveni (4.6) · nihai belge `docs/v2/EKONOMI_PLANI_2026-10.md` (Faz 5).

**Model sonuçları (referans):** dış para sıfır, N=100, 24 ay (`docs/v2/model_e_N100_denge.json`): 5/5 kontrol (fiyat endeksi ~1,0 · kasa ömrü 13,6 ay · ücretsiz oyuncu Sv.16 · balina/f2p 3,4× · ilk %5 payı %6 · kota %92). 50 $/ay için giriş **sürekli büyümeli**: ~6.000 $/ay → 9. ay; ~1.400 $/ay → 36. ayda değip düşer; ~650 $/ay → hiç.

**Kullanıcı eylemi bekleyen:** Kanal A'nın gerçek ayarı (`PARTNER_INCOME_FROM/TO`, trade sitesindeki Bot Kasası `oyunKasasi` adresi) — yayın zamanı. Kanal B'de Arena'dan doğrudan alım KODLANMADI (`buyAndCreateLpIfPossible(amount, _tokenId)` payable; `amount` anlamı ve fazla AVAX iadesi doğrulanamadı); yerine bilgi kutusu var.
