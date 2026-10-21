# Realm of Astra — Geliştirme Önerileri

> **Denetim tarihi:** 29 Eylül 2026 · **İncelenen sürüm:** v1.27 (`claude/ecstatic-curie-rgsmbp`)
>
> **Kapsam:** Tüm modüller, `config.js` parametreleri ve testler incelendi. Oyunun kendi kodunu kullanan simülasyonlar çalıştırıldı: 7 günlük botlu oyuncu, 10 yıllık piyango, zindan zorluk eğrisi, ileri sarma. Denetim sırasında oyun kodunda değişiklik yapılmadı.
>
> **Doğrulanamayanlar:** Çok oyunculu davranış (sunucu yok) ve Windows başlatıcıları (Linux ortamında çalıştırıldı).

---

## Durum güncellemesi — v1.28 (30 Eylül 2026)

### Tamamlananlar

| Madde | Durum |
|---|---|
| Bozuk kayıtta veri kaybı (§9, P0) | ✅ `js/storage.js`: son sağlam yedek, bozuk kopyanın saklanması, depolama doluyken uyarı |
| Phaser'ın CDN'den SRI'sız yüklenmesi (§6, P1) | ✅ npm paketinden (3.80.1), kilit dosyasında bütünlük özeti; ayrı `phaser-*.js` parçası |
| Sayfa yenileyerek yenilgiden kaçma (§6, P1) | ✅ Zindan sonucu `settleDungeonBattle` ile animasyondan önce kaydedilir |
| Günlük sayaçların bilgisayar saatine bağlı olması (§6, P1) | ✅ Günlük zindan/kolezyum hakları ve günlük geri alım güvenilir saati kullanır. Çevrimdışı telafi ve bot süreleri hâlâ bilgisayar saatine bağlı (sunucu gerektirir) |
| CI (§9, P1) | ✅ `.github/workflows/ci.yml`: sözdizimi kontrolü, testler ve derleme |
| Tek canavar tablosu (§9, P1) | ✅ `js/bestiary.js` tek kaynak: harita sahnesi ve savaş aynı tablodan okur. Hiç çağrılmayan formüllü canavar üretimi (`buildRun`, `buildMonster`, `expectedSquad`, `getWeeklyModifier`, `buildWorldBoss`) ve sahnedeki kullanılmayan `rewardAdAstra` kaldırıldı. Zindan ADA/XP ödül formülünün sabitleri `DUNGEON.REWARD_*` ayarlarına taşındı |
| Config tek doğruluk kaynağı (§9, P1) | ✅ Silo kapasiteleri, kolezyum lig sınırları, World Boss canı ve rol çeşitliliği bonusu artık yalnızca `config.js`'ten okunuyor. Config'deki yanlış değerler, oyunun zaten kullandığı değerlere eşitlendi (gümüş 1150, elmas 1500, çeşitlilik tavanı +%50). Kullanılmayan ~45 anahtar silindi; gelecek sistem taslakları (`DUNGEON_MODIFIERS`, `EQUIPMENT_AFFIXES`, `AFFIX_RARITY`, `SEASON`, `PRESTIGE`, lig haftalık ödülleri) "henüz bağlı değil" notuyla bırakıldı. Davranış değişmedi: 18 canavar, 18 silo seviyesi, lig sınırları ve zindan ödülleri önce/sonra birebir karşılaştırıldı |

### Denetimden sonra bulunan yeni sorunlar

| # | Bulgu | Durum |
|---|---|---|
| N1 | **Kolezyum savaş ekranı gerçek maçı oynatmıyordu.** Arenaya savaş kaydı verilmediği için kendi rastgele savaşını oynatıyordu: ekrandaki zafer/yenilgi verilen ödül ve ELO ile çelişebiliyor, bitişte şampiyonun canı bu uydurma sonuçla eziliyordu | ✅ v1.28'de düzeltildi |
| N2 | **Kolezyumda ELO yükselmiyor.** Bronz ligde rakip puanı 0–150 arasında üretiliyor; 1000 puanlı oyuncunun beklenen skoru ≈ %99,8 olduğundan zafer başına puan artışı `round(32 × 0,002) = 0`. Oyuncu gümüş lige (1150) hiç çıkamıyor | ⏳ Açık — rakip puanının oyuncu puanına göre üretilmesi gerekiyor; formül bir tasarım kararı, onay bekliyor |
| N3 | **Test menüsü düğmeleri iki kez çalışıyordu** (+6 saat ileri sarma 12 saat sarıyordu) | ✅ v1.27'de düzeltildi |

### Düzeltme notu

§5'teki "Phaser'da hiç animasyon yok" tespiti kısmen bilinçli bir karar: `grandTownScene.js` başındaki nota göre haritadaki hareketli süsler (köylüler, bulut, kuş, duman, gece karartması) kullanıcı isteğiyle kaldırılmış. Geri bildirim animasyonu önerileri (kaynak kazanımı, seviye atlama, ganimet, boss girişi) bu karardan ayrı tutulmalı ve kullanıcıya sorularak eklenmeli.

---

## İçindekiler

1. [Mimari haritası](#1-mimari-haritası)
2. [Oyun döngüsü](#2-oyun-döngüsü)
3. [Ekonomi haritası](#3-ekonomi-haritası)
4. [UX/UI değerlendirmesi](#4-uxui-değerlendirmesi)
5. [Görsel ve animasyon değerlendirmesi](#5-görsel-ve-animasyon-değerlendirmesi)
6. [Güvenlik değerlendirmesi](#6-güvenlik-değerlendirmesi)
7. [Hile önleme mimarisi](#7-hile-önleme-mimarisi)
8. [Performans](#8-performans)
9. [Kod kalitesi](#9-kod-kalitesi)
10. [Oyun tasarımı sorunları](#10-oyun-tasarımı-sorunları)
11. [Ekonomik kırmızı bayraklar](#11-ekonomik-kırmızı-bayraklar)
12. [Eksik sistemler](#12-eksik-sistemler)
13. [En yüksek etkili fırsatlar](#13-en-yüksek-etkili-fırsatlar)
14. [Öncelikli yol haritası (P0–P3)](#14-öncelikli-yol-haritası-p0p3)
15. [Önerilen geliştirme sırası](#15-önerilen-geliştirme-sırası)
16. [Ek: Simülasyon yöntemi ve ham sonuçlar](#16-ek-simülasyon-yöntemi-ve-ham-sonuçlar)

---

## 1. Mimari haritası

| Katman | Dosya (satır) | Sorumluluk |
|---|---|---|
| Arayüz iskeleti | `index.html` (669), `css/style.css` (4.943), `css/theme.css` (1.424), `css/battle-arena.css` (447) | Üst bar, yan panel, tek bir genel pencere (modal), test paneli |
| Arayüz denetleyicisi | `js/app.js` (**8.962**) | Tüm pencerelerin HTML'i, olay dinleyicileri, 4 Hz arayüz döngüsü, test paneli |
| Oyun kuralları + oyuncu durumu | `js/gameState.js` (**7.211**, tek sınıfta **227 metot**) | Seferler, bot, silo, seviye, asker, teçhizat, zindan, kolezyum, World Boss, çark, piyango, P2P eser pazarı, test hileleri |
| Dünya ekonomisi | `js/globalPool.js` (650), `js/ammMarket.js` (674), `js/treasury.js` (199), `js/economy/lottery.js`, `js/economy/ubi.js` | Haftalık dünya kotası, token muhasebesi (yakım/UBI/hazine), AMM, hazine kasaları, piyango ve UBI kuralları |
| Savaş | `js/combat.js` (747, tohumlu ve deterministik), `js/bestiary.js` (337), `js/battleArena.js` (833, DOM üzerinde tekrar oynatım) | Savaş çözümü, canavar kütüğü, savaş görselleştirme |
| Sahne | `js/grandTownScene.js` (470), `js/dungeonScene.js` (435) | Phaser — yalnızca sabit arka plan resmi ve tıklanabilir alanlar (0 tween, 0 parçacık) |
| Arayüz bileşenleri | `js/ui/limits.js` (179) | Kota ve sınır bileşenleri (v1.27) |
| Ses | `js/audio.js` (21) | Tüm fonksiyonlar boş; ses tamamen kapalı |

### Bağımlılık grafiği

```
app.js ──► gameState.js ──► globalPool.js ──► treasury.js
   │            │  ├──► ammMarket.js ──► globalPool.js, treasury.js
   │            │  ├──► combat.js, bestiary.js
   │            │  └──► economy/lottery.js, economy/ubi.js
   ├──► grandTownScene.js, dungeonScene.js (Phaser; gameState'i doğrudan okur)
   ├──► battleArena.js
   └──► ui/limits.js
```

Modüller birbirini tekil nesneler (singleton) üzerinden doğrudan çağırıyor. `window` üzerinde 20'den fazla global tanımlı.

### Kalıcılık

Dört ayrı `localStorage` anahtarı birbirinden bağımsız kaydediliyor:

| Anahtar | İçerik |
|---|---|
| `adastra_player_save_v6` | Oyuncu durumu |
| `adastra_global_network_pool_v3` | Dünya kotası, token muhasebesi, UBI |
| `adastra_amm_pools_v11` | AMM havuzları |
| `adastra_treasury_ledger_v3` | Hazine kasaları |

Dört anahtar arasında atomik kayıt yok; biri yazılıp diğeri yazılamazsa durumlar birbiriyle çelişir.

### Otorite

**Her şey %100 istemci tarafında.** Buna ADA bakiyesi, envanter, savaş sonucu, zaman, rastgelelik, hazine, AMM ve piyangodaki "diğer oyuncular" da dahil. Bunun sonucu olarak her tarayıcı kendi "dünyasını" taşıyor: dünya kotası, AMM havuzları ve hazine oyuncular arasında paylaşılmıyor.

### Olumlu yönler

- Savaş motoru (`combat.js`) tohumlu ve deterministik; sunucuda aynı savaşı yeniden oynatmaya uygun.
- Piyango ve UBI kuralları saf fonksiyonlar olarak ayrılmış; sunucuya olduğu gibi taşınabilir.
- "Ödül basılmaz, hazineden ödenir" ilkesi doğru bir temel.
- Oyuncunun bölümleri adım adım açtığı ilk oturum akışı mevcut.
- 54 test dosyasının 53'ü davranış testi; yalnızca biri kaynak koda metin olarak bakıyor.

---

## 2. Oyun döngüsü

| Vade | Döngü |
|---|---|
| **Kısa (dakikalar)** | 3 sefer başlat (1. seviyede 18 dk, 81. seviyede 72 sa) → biten seferi topla → sat veya işle → staminayı buğdayla doldur |
| **Orta (günler)** | Seviye atlama; silo (18 seviye); asker alımı (18 asker); teçhizat dövme ve yükseltme; zindan (18 kat, günde 5 harçsız giriş); kolezyum (günde 10 maç) |
| **Uzun (haftalar–yıllar)** | 81. seviye (hedef ≈ 3 yıl); haftalık piyango, UBI ve World Boss |

**Temel sorun:** 24 saatlik bot kısa vadeli döngünün tamamını otomatikleştiriyor, oyuncuya "bot al, bekle" kalıyor. Savaş tarafı ise ekonomik olarak önemsiz (bkz. G4). Bu yüzden oyuncunun anlamlı karar verdiği an sayısı az.

---

## 3. Ekonomi haritası

### ADA'nın oyuncuya aktığı kaynaklar

| Kaynak | Başlangıç büyüklüğü | Not |
|---|---|---|
| AMM rezervleri (hammadde satışı) | Odun ≈ 36M, demir ≈ 41,6M, buğday ≈ 35,3M → **≈ 113M ADA** | Taban fiyata kadar satışla çekilebilen kısım ≈ **33,5M ADA** |
| Hazine kasaları | 40M ADA (zindan 14M, arena 8M, World Boss 8M, AMM geri alım 6M, karnaval 4M) | Zindan, kolezyum, World Boss ve rehber görevi ödülleri buradan ödenir |
| Piyango tohumu | 20M ADA | |
| UBI | Harcamaların %6'sı | Her hafta dağıtılır |

### Harcamanın dağılımı (`recordTokenSpend`)

| Oran | Gittiği yer |
|---|---|
| %13 | Yakım |
| %3 | Yapımcı payı |
| %6 | UBI |
| **%78** | **Hazine — yine ödül olarak oyunculara döner** |

Ekonomiden kalıcı olarak çıkan pay yalnızca %13, yapımcı payıyla birlikte %16.

### Hammadde

- **Dünya kotası:** Haftada odun 180.000, demir 130.000, buğday 490.000; her gün 1/7'si açılır.
- **Üretim hızı (sabit):** Dakikada odun 18, demir 12, buğday 30. Her seviye üretimi %1,5 artırır.
- **Yakım:** Harcanan her hammadde kalıcı olarak yakılır (`burnResource` → `recordResourceBurn`). ~~O haftanın dünya kotasından da düşülürdü~~ — 21 Ekim 2026 sahip kararıyla yakım kotayı düşürmez (E2 düzeltildi); haftalık yakım yalnız istatistiktir.

### Başlıca harcama kalemleri

- **Seviye atlama:** Bedel, o seviyede kazanılan gelirin tamamı; kazanılan hammaddenin yarısı hammadde olarak, diğer yarısının pazar değeri ADA olarak istenir.
- **Silo:** 18 seviye; bedel mevcut kapasitenin yarısı artı bu hammaddenin pazar değeri.
- **Asker:** 1. asker 5.000 ADA, 18. asker 1,8M ADA; toplam **11,6M ADA**.
- **Diğer:** Teçhizat dövme ve yükseltme, alet onarımı, stamina, iyileştirme, bot, çark, piyango, zindan kapı harcı.

---

## 4. UX/UI değerlendirmesi

| Sorun | Öneri |
|---|---|
| Aynı bölümlere 5 ayrı yoldan gidiliyor (üst bar, yan panel ızgarası, harita, mobil sekme çubuğu, Ctrl+K) ve her yol farklı bir alt küme sunuyor | Tek gezinme modeli: harita birincil yol, sekme çubuğu ve yan panel aynı listeyi göstersin |
| Her şey tek bir genel pencerede açılıyor; geri tuşu ve derin bağlantı yok | Pencere yığını ve "geri" desteği; her bölüm için bir adres (ör. `#zindan`) |
| Pencerelerde uzun açıklama paragrafları, tamamı büyük harf ve emojili başlıklar | Tek satırlık özet ve "Nasıl çalışır?" açılır kutusu; başlıklar normal yazımla |
| Maliyet ve sonuç gösterimi bölümden bölüme değişiyor | Her işlem düğmesinde "bedel → kalan → sonuç" önizlemesi (v1.27'de kolezyum ve zindanda başlandı) |
| İlk açılışta kırmızı "RİSK UYARISI" şeridi öne çıkıyor | Uyarı kalmalı; ilk oturumda tek seferlik, sakin bir bilgi kartı ve kalıcı bir "Hakkında" bağlantısı olarak |
| Yenilgi nedenini açıklamıyor | Savaş sonunda "neden kaybettin" özeti: güç farkı, önerilen asker sayısı ve teçhizat |
| Bildirimler çok ve aynı ağırlıkta | Önem düzeyi: kritik (kalıcı), bilgi (kısa), başarı (animasyonlu geri bildirim) |

---

## 5. Görsel ve animasyon değerlendirmesi

**Güçlü yan:** Kasaba haritası kaliteli ve tutarlı piksel sanat; oyunun kimliği burada.

**Zayıf yanlar:**
- Arayüz bu sanatla konuşmuyor; paneller genel koyu kartlar.
- `app.js`'de **1.179 satır içi stil** (`style="..."`) kullanımı ve CSS'te **473 `!important`** var. Üç katman (eski `style.css`, tema `theme.css`, satır içi stiller) üst üste biniyor; renk ve boşluk tutarlılığı sağlanamıyor.
- **Phaser neredeyse kullanılmıyor:** 1,1 MB'lık kütüphane yalnızca bir resim ve tıklama alanları için yükleniyor. (Haritadaki hareketli süsler kullanıcı isteğiyle kaldırılmış; bkz. durum güncellemesi.)
- **Ses yok:** `audio.js` içindeki tüm fonksiyonlar boş.
- Kaynak kazanımı, harcama, seviye atlama, ganimet açma, nadir düşüş ve boss girişi için geri bildirim animasyonu yok. Yalnızca savaş arenasında hasar sayıları var.
- İkonlar emojiye dayanıyor; platforma göre farklı görünüyor.

**Öneri: tek görsel dil.**
- `theme.css`'teki renk token'ları tek kaynak olsun; satır içi renkler kaldırılsın.
- Panel, kart, düğme, rozet ve sayaç bileşenleri tanımlansın.
- Piksel sanata uyumlu çerçeve ve ikon seti kullanılsın.

---

## 6. Güvenlik değerlendirmesi

### Güvenli istemci prototipi

Tek oyunculu bir kum havuzu olarak bugünkü durum kabul edilebilir. **Bu sürüm gerçek bir token ya da cüzdana bağlanmamalı.**

### Üretimde zorunlu olanlar

| Alan | Bulgu |
|---|---|
| Kayıt verisi | `localStorage` elle düzenlenerek sınırsız ADA ve eşya elde edilebilir. Eşya kopyalama ve istemcinin kendi hesapladığı ödüller de bu kapsamda |
| Zaman | Günlük zindan ve kolezyum sayaçları, hazine geri alımı ve çevrimdışı telafi `Date.now()` kullanıyor; bilgisayar saatini ileri almak günlük hakları yeniliyor. "Güvenilir saat" oyunun kendi sunucusundan alınan bir HEAD isteğiyle sağlanıyor ve araya girilerek taklit edilebilir |
| Rastgelelik | Ganimet, çark, piyango kazananı ve kolezyum rakibi `Math.random` ile belirleniyor |
| Sayfa yenileyerek yenilgiden kaçma | Giriş bedeli savaşın başında alınıyor; can kaybı, silah aşınması ve canavarın kalan canı animasyon bittikten sonra işleniyor. Yenilgi sırasında sayfa yenilenirse yenilginin bedeli ödenmiyor (kod okunarak doğrulandı) |
| Tedarik zinciri | Phaser CDN'den bütünlük kontrolü (SRI) olmadan yükleniyor; CDN engellenirse oyun hiç açılmıyor (denetim ortamında yaşandı) |
| Cüzdan | Henüz cüzdan ya da kontrat kodu yok |
| Yapımcı adresi | İstemcide sabit yazılı; yalnızca gösterim için sorun değil, ödeme hedefi olarak kullanılmamalı |

### Web3'e geçişte ele alınması gerekenler

- **İmza ve işlem saldırıları:** İmza tekrarı (replay), aynı ödülün iki kez talep edilmesi, yarış koşulları.
- **İşlem sırası ve zaman:** Önden koşma (front-running) ve zaman damgası manipülasyonu.
- **Sayısal hatalar:** Yuvarlama ve hassasiyet hataları. ADA miktarları ondalıklı sayı (float) olarak tutuluyor; zincirde tam sayı birim kullanılmalı.
- **Hesap kötüye kullanımı:** Çoklu hesap (sybil) açma ve bot çiftçiliği.

---

## 7. Hile önleme mimarisi

1. **Sunucu otoritesi:** İstemci yalnızca niyet gönderir ("seferi başlat", "topla", "dövme"). Durumu, saati ve rastgeleliği sunucu tutar.
2. **Savaş sunucuda çözülür, istemcide canlandırılır:** Deterministik motor sunucuda sonucu hesaplar; istemci aynı tohumla yalnızca oynatır. Sonuç ve bedeller tek bir işlemde yazılır; sayfa yenileme hilesi kapanır.
3. **İşlem güvenliği:** Her işlemde tekrar anahtarı (nonce) ve hız sınırı.
4. **Kimlik:** Cüzdanla imzalı giriş (SIWE / EIP-4361).
5. **Zincir üstü çekim:** Yalnızca çekimler zincire gider. Sunucu imzalı fiş (EIP-712) üretir; fişte nonce, geçerlilik süresi ve zincir kimliği bulunur. Kontratta günlük çekim tavanı ve acil durdurma olur.
6. **Piyango:** Kazanan doğrulanabilir rastgelelikle (ör. Avalanche üzerinde Chainlink VRF) seçilir.
7. **Anomali tespiti:** Saatlik gelir teorik tavanı aşarsa işaretle; ekonomi panosunda oyuncu başı gelir dağılımı izlensin.

İstemci tarafında kodu gizlemek ya da karmaşıklaştırmak bir güvenlik önlemi değildir.

---

## 8. Performans

| Ölçüm | Değer |
|---|---|
| Uygulama paketi | 645 kB (sıkıştırılmış 182 kB) |
| Phaser (CDN) | ≈ 1,1 MB |
| CSS | 153 kB (sıkıştırılmış 29 kB) |
| Görseller | ≈ 2,2 MB |
| Arayüz döngüsü | Saniyede 4 kez; 65 yerde tüm içerik baştan yazılıyor (`innerHTML`) |

Bugün kabul edilebilir düzeyde. En büyük kazanç, Phaser'ı npm'den pakete almak ya da görsel sahneyi hafif bir çözümle değiştirmek. Arayüz bileşen sistemine geçildiğinde tam yeniden çizimler yerine yalnızca değişen alanlar güncellenmeli.

---

## 9. Kod kalitesi

- **Tek dev sınıf:** `GameStateManager`, 227 metotla her şeyi bilen tek bir nesne.
- **Config tek doğruluk kaynağı değil:**
  - **Kullanılmayan ~60 anahtar var.** Örnekler: `SEASON`, `PRESTIGE`, `EQUIPMENT_AFFIXES`, `AFFIX_RARITY`, `TROOP_TYPES`, `AUTOMATION_BOTS`, `TAVERN_BOOSTS`, `EQUIPMENT`, `EQUIPMENT_RULES`, `EQUIPMENT_UPGRADE_TIERS`, `LEVEL_UP_REQUIREMENTS`, `COLOSSEUM.LEAGUES`, `DUNGEON.*` (ganimet oranları), `WORLD_BOSS.PHASES`.
  - **Aynı değerler kodda ayrıca sabit yazılmış.** Silo kapasiteleri ve kolezyum lig eşikleri bunlardan; lig eşikleri config ile uyuşmuyor (gümüş 1100/1150, elmas 1550/1500).
- **Üç ayrı canavar tablosu:**
  - `dungeonScene.js` içindeki sabit değerler (gerçek savaş bunları kullanıyor).
  - `bestiary.js` içinde formülle türetilen değerler.
  - Ödül formülü (90 × kat); sahnedeki `rewardAdAstra` değerleri yok sayılıyor.
- **Veri kaybı:** Bozuk bir kayıt dosyası sessizce yok sayılıyor. Oyun sıfır profille açılıyor ve ilk otomatik kayıtta eskisinin üstüne yazıyor. Yedek alınmıyor.
- **Araç eksikliği:** Sürekli entegrasyon (CI), kod denetleyici (linter) ve tip kontrolü yok.
- **v1.27'de düzeltilen örnek:** Test paneli olayları iki kez bağlanmıştı; her test düğmesi iki kez çalışıyordu.

---

## 10. Oyun tasarımı sorunları

| # | Bulgu | Kanıt |
|---|---|---|
| G1 | Zindan ilk askerle açılıyor ama tek asker 1. katı kazanamıyor | 1 asker: %0 · 3 asker (≈ 72.000 ADA): %100 |
| G2 | Savaş sonuçları neredeyse ikili; dizilim, yetenek ve preset sonucu nadiren değiştiriyor | Ölçülen senaryoların hemen hepsi %0 ya da %100 (tek istisna %75) |
| G3 | 18. kat bossu 18 asker ve 18. seviyeyle bile kazanılamıyor (teçhizatsız) | %0 |
| G4 | Zindan ödülü tarımın yanında önemsiz | 1. kat zaferi 90 ADA; 1. seviyede tarım saatte ≈ 7.200 ADA (brüt) |
| G5 | Kolezyum zaferi zindandan ≈ 18 kat fazla ödüyor; "1v1 PvP" yazsa da rakip NPC | Zafer başına ≈ 1.600 ADA, günde 10 maç |
| G6 | Seviye atlama, o seviyede kazanılan gelirin tamamına mal oluyor; seviye başına yalnız +%1,5 üretim veriyor | `getNextLevelRequirement` |
| G7 | Bot, kısa vadeli döngünün tamamını devralıyor; botlu oyuncu için anlamlı karar kalmıyor | Bot seferleri toplar, onarır, satar, siloyu yükseltir |
| G8 | 81. seviyeye ulaşınca bir sonraki hedef yok; prestij config'de tanımlı ama bağlı değil | `PRESTIGE` kullanılmıyor |

---

## 11. Ekonomik kırmızı bayraklar

| # | Mekanizma | Etki (ölçülen) | Çözüm önerisi |
|---|---|---|---|
| **E1** | Dünya kotası tüm oyunculara paylaştırılıyor ama tek oyuncuya göre ayarlanmış | Tek bir 1. seviye botlu oyuncu günlük odun kotasının **%100,8'ini** topluyor. N oyuncuda kişi başı gelir ≈ 1/N; 342 oyuncuda kişi başı ≈ günde 75 odun | Kişi başı kota ya da oyuncu sayısıyla ölçeklenen kota. **Sunucu tasarımından önce karar verilmeli** |
| **E2** | Yakım o haftanın dünya kotasını küçültüyor | Bir oyuncunun harcaması diğer herkesin üretimini azaltıyor: sıfır toplamlı oyun, kasıtlı zarar verme imkânı | Yakım toplam arzdan düşsün, haftalık çıkarma kotasından düşmesin |
| **E3** | Piyango (kullanıcı kararıyla belirlenen kurallar) | 10 oyuncu: kasa 270. haftada biter · 100 oyuncu: 138. haftada biter · 1.000+ oyuncu: haftada tek kazanan olduğu için 10 yılda yalnız 520 kişi kazanır; "er geç herkese çıkar" hedefi gerçekleşmez, paralar kilitli kalır; en büyük tek ödül 10,4M | Katılımcı sayısına göre birden fazla kazanan ve kasa dengesine bağlı ödeme kuralı. **Kuralı değiştirmek kullanıcının kararı** |
| **E4** | Bot fiyatı teorik kârdan hesaplanıyor; kota dolunca da kendini yenilemeye devam ediyor | 7 günlük simülasyon: ADA 100.000 → 11.000, oyuncu hâlâ 1. seviyede | Beklenen kâr bot ücretinin altındaysa yenilemeyi durdur; gerçek kâr-zarar raporu göster |
| **E5** | Ordu yalnızca ADA ile satın alınıyor | 18 asker = 11,6M ADA; güç = cüzdan büyüklüğü. World Boss ödülü güçle orantılı olduğu için parayla kazanma (pay-to-win) | Asker kapasitesi seviyeyle ya da zindan ilerlemesiyle açılsın |
| **E6** | Hazine geri alımı bilgisayar tarihine bağlı; günde AMM kasasının %15'ine kadar (tohumda ≈ 0,9M ADA) havuza ADA ekliyor | Satış → geri alım → tekrar satış döngüsüyle hazine satıcılara aktarılıyor | Geri alım miktarı gerçek satış hacmiyle sınırlansın ve sunucu saatine bağlansın |
| **E7** | 10 milyar maksimum arz hiçbir yerde modellenmiyor | Her tarayıcı kendi 173M+ ADA'sını yoktan tohumluyor | Sunucuda tek bir arz defteri |
| **E8** | Harcamanın %78'i hazineye dönüp yeniden ödül oluyor | Kalıcı çıkış yalnızca %13–16; ödül oranları artarsa enflasyon hızlanır | Hazine ödeme oranlarını gerçek gelirle ilişkilendiren bir bütçe kuralı |

---

## 12. Eksik sistemler

| Alan | Eksik |
|---|---|
| Altyapı | Sunucu ve hesap sistemi, cüzdan, kayıt dışa/içe aktarma, CI |
| Oyun içi | Ses; ayarlar (hareket azaltma, ses, dil); günlük ve haftalık görevler (kaldırılmış); başarımlar; gerçek PvP |
| Config'de tanımlı, bağlı değil | Sezon, prestij, teçhizat eklentileri (affix), kolezyum haftalık lig ödülleri (14 Ekim 2026'da ölü alan olarak kaldırıldı; haftalık ödül yalnız PvP ilk 10) |

---

## 13. En yüksek etkili fırsatlar

1. **Savaşa anlam kazandır:** Zindanı ekonominin merkezine taşı. Sonuçlara varyans ekle, yenilginin nedenini göster, ödülü zindan ilerlemesiyle ölçekle.
2. **İlk 30 dakikanın akışı:** İlk askerle kazanılabilen bir 1. kat. İlk zafere garanti bir teçhizat parçası ya da hazır bir silah.
3. **Oyun hissi paketi:** Ses; kaynak "uçuş" animasyonu; seviye atlama ve ganimet açılış sahnesi; boss girişi.
4. **Tek bir arayüz bileşen sistemi:** Satır içi stiller yerine token tabanlı bileşenler. `js/ui/` bu yönde bir başlangıç.
5. **Botu karar aracına dönüştür:** Bot rutini yapsın ama oyuncu hedef seçsin; ör. "silo için biriktir", "zindana hazırlan", "sat".

### Yeni sistem önerileri (değerlendirmeli)

| Sistem | Oyun değeri | Ekonomik etki | Teknik zorluk | Ne zaman |
|---|---|---|---|---|
| Günlük/haftalık görevler | Geri dönme nedeni, yönlendirme | Düşük (ödül hazineden) | Düşük | Şimdi (P2) |
| Başarımlar | Ustalık ve koleksiyon hissi | Yok ya da çok az | Düşük | Şimdi (P2) |
| Prestij (config'de hazır) | 81. seviye sonrası hedef | Orta | Düşük | Sonra (P3) |
| Sezon (config'de hazır) | Periyodik hedef, sıfırlama heyecanı | Orta–yüksek | Orta | Sunucudan sonra |
| Eşzamansız PvP (gerçek oyuncu kadroları) | Rekabet | Orta | Orta (sunucu gerekir) | Sunucudan sonra |
| Loncalar / ortak boss | Sosyal bağ | Orta | Yüksek | Sonra (P3) |
| Oyuncular arası pazar | Web3 değeri | Yüksek | Yüksek (güvenlik) | Sunucudan ve denetimden sonra |

---

## 14. Öncelikli yol haritası (P0–P3)

| Öncelik | İş | Tür |
|---|---|---|
| **P0** | Gerçek token veya cüzdan bağlamadan önce sunucu otoritesi mimarisi | Tasarım — **onay gerekli** |
| **P0** | E1 ve E2: dünya kotası modeli | Ekonomi — **onay gerekli** |
| **P0** | E3: piyangonun ödeme gücü ve adaleti | Kullanıcının kuralı — **karar kullanıcıda** |
| **P0** | Bozuk kayıtta veri kaybı (yedek alma ve kurtarma) | ✅ v1.28 |
| **P1** | Phaser'ı pakete almak (CDN bağımlılığı, SRI eksikliği) | ✅ v1.28 |
| **P1** | Tek canavar tablosu; config'i tek doğruluk kaynağı yapmak; kullanılmayan anahtarları temizlemek | ✅ |
| **P1** | G1 zindan giriş duvarı · G4 ve G5 savaş ödüllerinin dengesi | Denge — **onay gerekli** |
| **P1** | E4: bot yenileme koruması | Oyuncuyu korur — **onay gerekli** |
| **P1** | Günlük sayaçları "güvenilir saate" bağlamak; sayfa yenileyerek yenilgiden kaçmayı kapatmak | ✅ v1.28 |
| **P1** | N2: kolezyum ELO'sunun yükselmemesi | Hata — **formül için onay gerekli** |
| **P1** | CI (her gönderimde test ve derleme) ✅ v1.28 · kod denetleyici (linter) | Güvenli |
| **P2** | Ses, geri bildirim animasyonları, ganimet ve boss sunumu | Oyun hissi |
| **P2** | Tek gezinme modeli, pencere yığını, arayüz bileşen sistemi | UX |
| **P2** | `gameState.js`'i alan modüllerine bölmek (sunucuya taşımanın ön adımı) | Mimari |
| **P2** | Günlük/haftalık görevler, başarımlar | İçerik |
| **P3** | Sezon, prestij, loncalar, eşzamansız PvP, oyuncular arası pazar | Yeni sistemler |

---

## 15. Önerilen geliştirme sırası

1. **Hemen yapılabilecek güvenli işler (onay gerekmez):**
   - Kayıt yedeği ve kurtarma.
   - Phaser'ı pakete almak.
   - CI.
   - Canavar ve config tekilleştirme (davranış değişmeden).
   - Günlük sayaçları güvenilir saate bağlamak.
   - Sayfa yenileme hilesini kapatmak.
2. **Karar oturumu (kullanıcı onayıyla):** E1 ve E2 kota modeli, E3 piyango, E4 bot, E5 ordu, G1–G5 savaş dengesi. Her biri için "şu an / sorun / öneri / fayda / risk" formatında seçenekler hazırlanacak.
3. **Sunucu mimarisi tasarım belgesi:** Veri modeli, işlem API'si ve zincir üstü çekim akışı.
4. **Oyun hissi ve arayüz sistemi.**
5. **Yeni içerik sistemleri.**

---

## 16. Ek: Simülasyon yöntemi ve ham sonuçlar

Tüm simülasyonlar Node.js'te oyunun kendi modülleri (`gameState.js`, `ammMarket.js`, `globalPool.js`, `treasury.js`, `economy/lottery.js`) içe aktarılarak, bellek içi bir `localStorage` ile çalıştırıldı.

### 16.1 Yedi günlük botlu oyuncu

**Kurulum:** Yeni hesap, 100.000 ADA, 24 saatlik bot (46.933 ADA), otomatik yenileme açık, her gün `fastForwardTime(24)`.

| Gün | Seviye | Silo | ADA | Dünya odun kotasından toplanan |
|---|---|---|---|---|
| Başlangıç | 1 | 1 | 53.067 | 0 / 180.000 |
| 1 | 1 | 6 | 33.258 | 25.920 |
| 2 | 1 | 6 | 30.043 | 51.840 |
| 3 | 1 | 6 | 20.154 | 77.142 (o güne kadar açılan kotanın tamamı) |
| 7 | 1 | 6 | 11.102 | 77.142 |

**Not:** İleri sarma takvimi ilerletmediği için haftalık kotanın gün açılışı gerçek saate bağlı kaldı. Bu yüzden 3. günden sonra odun kotası doldu ve bot yine de her gün yenilendi.

### 16.2 Piyango (10 yıl, oyuncu başı haftada 100 bilet, tek kazanan)

| Oyuncu | Sonuç | Oyuncuların ödediği | Kasanın ödediği | En büyük tek ödül |
|---|---|---|---|---|
| 10 | Kasa 270. haftada bitti | 27,0M | 47,0M | 0,88M |
| 100 | Kasa 138. haftada bitti | 138,0M | 158,0M | 2,68M |
| 1.000 | 10 yılda bitmedi (520 kazanan) | 5.200M | 2.525M | 10,40M |
| 10.000 | 10 yılda bitmedi (520 kazanan) | 52.000M | 2.688M | 10,40M |

### 16.3 Zindan zorluk eğrisi (teçhizatsız, gerçek savaş verisiyle, 60 örnek)

| Kat (can / saldırı) | 1 asker Sv1 | 3 asker Sv1 | 3 asker Sv5 | 6 asker Sv5 | 10 asker Sv10 | 18 asker Sv18 |
|---|---|---|---|---|---|---|
| 1 (200 / 30) | %0 | %100 | %100 | %100 | %100 | %100 |
| 3 (600 / 75) | %0 | %0 | %100 | %100 | %100 | %100 |
| 6 (1.450 / 155) | %0 | %0 | %0 | %75 | %100 | %100 |
| 9 — boss (9.500 / 520) | %0 | %0 | %0 | %0 | %0 | %100 |
| 12 (3.700 / 300) | %0 | %0 | %0 | %0 | %100 | %100 |
| 18 — boss (38.000 / 1.250) | %0 | %0 | %0 | %0 | %0 | %0 |

Asker değerleri: HP = 100 + 25·(Sv−1), ATK = 25 + 6·(Sv−1).
