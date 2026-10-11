# Krallık Yolu: kapsamlı öğretici (UYGULANDI, 11 Ekim 2026)

**Durum: uygulandı.** 47 görev, 10 bölüm, her bölümün bonusu ve bir final unvanı; hesap başına toplam **994 ASTRA** (üst sınır 1.000, `tests/test_ogretici.mjs` doğrular).
Aşağıdaki tasarım metni ilk plandır; kesin liste ve ödüller `js/config.js` içindeki `ONBOARDING_QUESTS` / `ONBOARDING_SECTIONS` / `ONBOARDING_FINAL`, koşullar `js/gameState/ogretici.js` içindedir.

## Nasıl çalışır (uygulanan)
- **Görevler oyun durumundan algılanır** (`OGRETICI_KOSULLARI`: görev kimliği → koşul). "İlk kez yapıldı" işleri için `state.firsts` içine işaret düşer: `ogreticiIsaretleriKur` ilgili işlemleri (pazar al/sat, dövme, yükseltme, onarım, ad verme, teçhizat takma, taktik kaydı, saf değişimi, çark, piyango, boss katılımı, iyileştirme, ganimet) sarar ve yalnız işlem başarılıysa işaret koyar.
- **"Ekranı gördü" görevleri** (13 anahtar, `OGRETICI_GORULENLER`) arayüzden `ogreticiGordu(anahtar)` ile bildirilir (panel başlığı ya da sekme açılınca); küçük ödül (2 ASTRA).
- **Ödül yolları:** `claimOnboardingReward(görev)`, `claimOnboardingSection(bölüm | final)`; ikisi de Görev kasasından `withdrawWhole('quest', ...)` çeker, haftalık ödeme payı dolarsa mesaj verir. Sunucuda `POST /api/action` yalnız **e-postası doğrulanmış** hesaba bu iki işlemi açar.
- **Ekran:** Ben → Rehber ve yardım → "Krallık Yolu" (`js/ui/v3/ogretici.js`: ilerleme, sıradaki görev, bölüm kartları, "Bana göster", final). Dock'taki rehber kutusu yalnız sıradaki görevi ve hazır ödül sayısını gösterir; dokununca paneli açar. Birden çok görev aynı anda tamamlanınca tek özet bildirim çıkar.
- **"Bana göster"** hub anahtarına göre (`window.__v3.git`) ilgili ekranı açar; kilitli ekranın nedeni görev satırında yazar.

## İlk plan metni (tasarım kararlarının kaydı)
## Amaç
Yeni oyuncuyu, oyunun **her** özelliğini sırayla, yaparak öğrenerek tanıştırmak; her adımda küçük bir ödül vermek. Bugünkü rehber 10 görevli küçük bir kutu; yeni sistem 10 bölüm, 44 görev, bölüm ve final ödülleri.

## İlkeler
1. **Yaparak öğren:** görev "oku" değil "yap" ister; koşul oyun durumundan otomatik algılanır.
2. **Kısa ve sade:** her görevde en çok 2 cümle; terim ilk geçtiğinde `terim()` sözlüğüne bağlanır.
3. **Bana göster:** her görevde düğme; ilgili sekmeyi/paneli açar ve doğru düğmeyi vurgular (mevcut `js/ui/v3/tur.js` vurgulaması).
4. **Kilit sırasına uyar:** bölümler `getFeatureLock` sırasını izler; kilitli bir özelliğin görevi, kilit açılana kadar "yakında" görünür.
5. **Ödül dürüst:** ASTRA yalnız Görev kasasından çıkar (havadan basılmaz); kasa payı dolarsa ödül bekler. ASTRA dışı ödüller (hammadde, bilet, parşömen, anahtar) mevcut tablolardan.
6. **Bir kez:** her görev ve bölüm ödülü bir kez alınır; eski 10 görevin kimlikleri korunur, alınmış ödüller tekrar verilmez.

## Ödül bütçesi (kullanıcı kararı: yeni oyuncu başına ~1.000 ASTRA)
| Kalem | ASTRA |
|---|---|
| 44 görev (ortalama ~12) | ~520 |
| 10 bölüm bitirme ödülü (40-80) | ~560 |
| Final "Krallık Yolu" unvanı | 150 |
| **Toplam üst sınır** | **≤ 1.000** (kalan kısım ASTRA dışı ödüle kaydırılır) |

Not: kilitli/serbest oranı normal kazanç kuralıyla (`_onAdaEarned`). Toplam `GAME_CONFIG.OGRETICI` içinde hesaplanır ve `tests/test_ogretici.mjs` üst sınırı doğrular.

## Bölümler ve görevler
Koşul sütunu oyun durumundaki alanı gösterir; "yeni" yazanlar için küçük bir `_markFirst('...')` çağrısı eklenecek (bugün `firsts` yalnız `house`, `herbHeal`, `recycle`, `konsey` için var).

### 1. Başlangıç: krallığını tanı
| Görev | Koşul | Bana göster |
|---|---|---|
| Haritada gezin: bir binaya dokun | yeni `mapTap` | harita |
| Üst çubuğu tanı: stamina ve bakiye | ayrıntı paneli açıldı (`ui.hudSeen`, yerel) | üst çubuk |
| İlk seferini başlat (eski görev) | `first_expedition` | Güneş Tarlası |
| İlk hasadını topla (eski görev) | `first_harvest` | Seferler paneli |
| Krallık merkezinde toplu işlemi dene | yeni `dashboardUse` | Krallık merkezi |

### 2. Üretim: altı hammadde
| Görev | Koşul | Bana göster |
|---|---|---|
| Üç alanı birden çalıştır (eski) | `three_expeditions` | Seferler |
| Altı hammaddenin hepsini bir kez topla | `state.firsts.res_*` (6 bayrak) | Kaynak tepsisi |
| Bir aleti onar | yeni `toolRepair` | bölge paneli |
| Üretim hakkını gör: kota panelini aç | yeni `quotaSeen` | Kotalarım |
| Botu dene (eski) | `bot_trial` | Taverna |
| Siloyu büyüt (eski) | `first_silo_upgrade` | Silo ve depo |

### 3. Köy: nüfus ve emek
| Görev | Koşul | Bana göster |
|---|---|---|
| İkinci evi yap (eski) | `first_house` | Köy evleri |
| Köylülere buğday yetsin: 50 köylüye ulaş | `village.villagers >= 50` | Köy evleri |
| Şifahane'de otla iyileştir (eski) | `first_herb_heal` | Şifahane |
| Emek puanı biriktir ve Konsey'e ver | yeni `laborGiven` | Konsey |

### 4. Pazar: alım-satım ve yakım
| Görev | Koşul | Bana göster |
|---|---|---|
| Pazardan bir hammadde al | yeni `marketBuy` | Pazar → Al/Sat |
| Bir hammadde sat; fiyatın nasıl oynadığını gör | yeni `marketSell` | Pazar → Al/Sat |
| "Hızlı al" ile eksik hammaddeyi tamamla | yeni `quickBuy` | Silo yükselt / seviye atla |
| İlan Pazarı'nı ziyaret et | yeni `ilanSeen` | Pazar → İlanlar |
| Yakım sekmesini incele: ne yakılıyor? | yeni `burnSeen` | Pazar → Yakım |

### 5. Ordu: Kışla ve taktik
| Görev | Koşul | Bana göster |
|---|---|---|
| İlk askerini al | `soldierUnits.length >= 1` | Kışla |
| Askerini adlandır | yeni `soldierRename` | Kışla |
| Askere teçhizat tak | yeni `equip` | Kışla → Cephanelik |
| Dört askere ulaş ve ön/arka saf dizilişini ayarla | `soldiers >= 4` + `row` değişti | Kışla |
| Bir taktik kaydet | yeni `presetSave` | Kışla |

### 6. Demirhane: dövme ve geri dönüşüm
| Görev | Koşul | Bana göster |
|---|---|---|
| İlk eşyanı dök | yeni `craft` | Demirhane |
| Bir eşyayı yükselt | yeni `upgradeGear` | Demirhane → Eşyalarım |
| Bir eşyayı onar | yeni `gearRepair` | Demirhane |
| Bir eşyayı geri dönüştür (eski) | `first_recycle` | Demirhane |

### 7. Zindan: ilk zaferler
| Görev | Koşul | Bana göster |
|---|---|---|
| Zindana gir ve savaş öncesi ekranı oku | yeni `dungeonPreview` | Zindan |
| İlk zindan zaferin | `dungeonProgress > 1` | Zindan 1. kat |
| 3. kata (ara boss) ulaş | `dungeonProgress > 9` | Zindan |
| İlk teçhizat parçası ya da Pandora kutusu düşür | `fragments > 0 \|\| boxes > 0` | Zindan ganimeti |
| Askerleri iyileştir ve yeniden gir | yeni `healAfterBattle` | Kışla / Şifahane |

### 8. Kolezyum ve Karnaval
| Görev | Koşul | Bana göster |
|---|---|---|
| Kolezyumda ilk düellonu yap | `colosseumStats.wins + losses >= 1` | Kolezyum |
| Haftalık ligi gör | yeni `leagueSeen` | Kolezyum → Lig |
| Şans çarkını bir kez çevir | yeni `wheelSpin` | Karnaval |
| Piyango bileti al | `lotteryTickets > 0` | Karnaval → Piyango |
| Haftalık bilet sınırını öğren | yeni `ticketLimitSeen` | Karnaval |

### 9. Konsey ve hazine: ekonominin kalbi
| Görev | Koşul | Bana göster |
|---|---|---|
| Konsey'e katkı ver (eski) | `first_konsey` | Konsey |
| Hazine panosunda kasaları gez | yeni `treasurySeen` | Hazine |
| Oyun parası nereye gidiyor: Ekonomi panosu | yeni `economySeen` | Ekonomi |
| Katkı puanını öğren: ilk puanını topla | `contribution.week > 0` | Kotalarım |
| Dünya bossuna katıl (Pazar) | yeni `bossJoin` | Savaş alanı |

### 10. Hesap: ASTRA'n ve güvenliğin
| Görev | Koşul | Bana göster |
|---|---|---|
| Kilitli ve serbest bakiye farkını öğren | yeni `balanceSeen` | Ben → Kotalarım |
| Hesabını doğrula (çevrimiçi) | `account.verified` | Hesap ve cüzdan |
| Cüzdanını bağla (çevrimiçi) | `account.wallet` | Hesap ve cüzdan |
| Ücretsiz oyuncu payı şartlarını öğren | yeni `faucetSeen` | Karnaval → Havuzlar |
| Oyun turunu bitir | `tur.bitti` (yerel) | Ben → Oyun turu |

Çevrimdışı (tek kişilik yerel) modda "çevrimiçi" görevler görünmez; bölüm toplamı ona göre küçülür ve ödül tablosu aynı üst sınırı korur.

## Ekran tasarımı
- **Krallık Yolu paneli** (Ben → "Krallık Yolu", eski "Rehber ve yardım" yerine): üstte ilerleme halkası (44 görevde kaç tane), sonra bölüm kartları; açık bölüm kendini genişletir, bitenler tik ve rozetle kapanır.
- **Görev kartı:** simge, başlık, tek cümlelik açıklama, ödül (ASTRA ve varsa ikinci ödül), "Bana göster" + (hazırsa) "Ödülü al".
- **Dock'taki rehber kutusu:** yalnız "sıradaki görev" + ödül hazır sayısı; dokununca paneli açar.
- **Danışman:** kralın danışmanı sıradaki görevi hikâyeli kısa cümleyle söyler ("Efendim, ambarlar boş; Taş Ocağı'na işçi yollayalım mı?").
- **Bölüm bitince:** kısa kutlama penceresi, rozet, sıradaki bölümün ilk görevi.

## Veri ve kod
- `GAME_CONFIG.OGRETICI = { bolumler: [{ id, ad, simge, oduAda, gorevler: [{ id, baslik, ac, kosul, ada, ek, goster }] }] }` (`js/config.js`).
- `js/gameState/rehber.js`: `checkOnboardingProgress` koşul tablosu `OGRETICI_KOSULLARI` (id → `(gs) => bool`) ile genişler; `getOnboardingStatus` bölüm bazlı döner; `claimOnboardingReward` ve yeni `claimSectionReward` kasadan `withdrawWhole('quest', ...)` çeker.
- `server/actions.js`: `quest` doğrulayıcısı yeni kimlikleri tanır; yeni `claimSection` işlemi (bölüm kimliği doğrulayıcısı).
- `js/ui/v3/ogretici.js` (yeni, saf HTML üreticileri): `yolHtml(status)`, `gorevKartiHtml(g)`, `bolumKartiHtml(b)`; `js/app.js` bunları `hub.js` `rehber` girişine bağlar.
- `tests/test_ogretici.mjs`: her görevin koşulu/ödülü var, ASTRA toplamı ≤ 1.000, bölüm ödülü yalnız bölüm bitince, ödül bir kez, eski 10 görev kimliği korunur, çevrimdışı görev filtresi, kasa payı dolunca bekleme.

## Güvenlik ve suistimal
- Koşullar oyuncu kaydından **sunucuda** hesaplanır (çevrimiçi modda tarayıcının beyanı sayılmaz); ödül işlemi sunucuda `random` olmayan, beyaz listeli işlemdir.
- Doğrulanmamış e-posta hesabı ASTRA ödülü alamaz (oyun içi ödülü alır); yan hesapla çoğaltma, görevlerin çoğunun gerçek ASTRA/hammadde harcaması istemesiyle ve doğrulanmış hesap şartıyla sınırlanır.
- Kasa payı dolarsa ödül düşmez, sıraya girer ("Pazartesi yenilenir" mesajı, `budgetFull`).
