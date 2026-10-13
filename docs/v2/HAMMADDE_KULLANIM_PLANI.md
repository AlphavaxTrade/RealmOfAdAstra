# Hammadde kullanım planı: altı hammaddenin arz/talep dengesi

Tarih: 13 Ekim 2026 · Durum: **UYGULANDI** (kod, test ve ölçüm) · Ölçüm aracı: `node scripts/model/hammadde_kullanim.mjs [--eski]`
Kullanıcı isteği: seviye atlama bedeline diğer hammaddeleri de kat; yeni hammaddelerin nerede kullanılacağını ve arz/talep
dengesini kuracak kullanım alanlarını planla ve uygula.

## 1. Sorun (ölçüldü)

Oyun 2. sürümde 6 hammaddeye geçti (buğday, taş, odun, kömür, demir, şifalı ot) ama harcama yerleri üçte kalmıştı. Referans
oyuncu (altı alanı kesintisiz çalıştıran hesap) için haftalık **talep / tam üretim** oranı:

| Seviye | buğday | taş | odun | kömür | demir | şifalı ot |
|---|---|---|---|---|---|---|
| 10 (eski kurallar) | 0,88 | **0,07** | 1,06 | **0,00** | 1,05 | **0,04** |

Sonuç: taş, kömür ve şifalı ot neredeyse hiç harcanmıyordu (pazarda birikir, fiyat taban değere iner, kota termostatı kotayı
kısar, bölge anlamsızlaşır); odun ve demir ise üretimden fazla isteniyordu (kalıcı kıtlık). Aynı kökten iki küçük hata daha vardı:
alet onarımı "üç alete" bölündüğü için altı aletle toplam yük %25 yerine %50'ye çıkmıştı; seviye atlama bedeli yalnız
odun-demir-buğday sayıyordu.

## 2. İlkeler

1. **Her bedel, ilgili hammaddenin kendi üretim hızına göre yazılır** (dakikalık üretim cinsinden). Hiçbir hammadde
   "bedava" ya da "ağır" olmaz; yeni üç hammadde eskiler gibi ölçeklenir.
2. **Her hammaddenin en az dört kullanım alanı vardır:** ortak (seviye atlama, silo, Konsey), düzenli (haftalık harcama),
   yapı (tek seferlik), tematik (hammaddeye özgü).
3. **Hedef bant:** haftalık talep / tam üretim **0,40–1,00**. Altı: hammadde pazarda atıl kalır. Üstü: sürekli kıtlık.
4. **Yoktan para ve kayıp yok:** harcanan hammaddenin yakımı ve kasa muhasebesi eskisi gibi; iade (geri dönüşüm) yalnız gerçekten
   harcananın %70'idir.

## 3. Kullanım matrisi (yeni durum)

| Hammadde | Düzenli kullanım | Tek seferlik / yapı | Ortak (hepsi) | Tematik |
|---|---|---|---|---|
| Buğday | stamina, köylü iaşesi, asker iyileştirme | — | seviye atlama, silo, Konsey | Otorite karışımı %15 (işçi iaşesi), Büyük Ambar |
| Taş | teçhizat yükseltme (bileme taşı) | Köy evleri, roket | seviye atlama, silo, Konsey | Otorite %30, Köprü ve Duvar projeleri, çarkta "bedelin geri" dilimi |
| Odun | alet onarımı, teçhizat dövme/yükseltme/onarım | Köy evleri, roket | seviye atlama, silo, Konsey | Otorite %15 |
| Kömür | teçhizat dövme, yükseltme (ocak), onarım | roket | seviye atlama, silo, Konsey | **Otorite çelik payı %20** (eskiden ASTRA), çarkta "bedelin geri" dilimi |
| Demir | alet onarımı, teçhizat | Köy evleri, roket | seviye atlama, silo, Konsey | Otorite %15 |
| Şifalı ot | asker iyileştirme (Şifahane) | — | seviye atlama, silo, Konsey | Şifa Bahçesi projesi, çarkta "bedelin geri" dilimi |

### Değişen kurallar

| # | Kural | Eski | Yeni |
|---|---|---|---|
| 1 | Seviye atlama bedeli | odun, demir, buğday; döngü üç alan | **altı hammadde**; bedel = XP'yi toplarken altı alanda üretilenin yarısı, her hammadde kendi hızıyla |
| 2 | Alet onarımı toplam yükü | üçe bölünüyordu (altı aletle %50) | alet sayısına bölünür: **toplam %25** (belgeler ve bot ücreti hesabıyla aynı) |
| 3 | Teçhizat yükseltme | odun, demir, parça | + **kömür** (ocak) ve **taş** (bileme); dakika cinsinden dövme kömürüyle aynı oranda |
| 4 | Teçhizat onarımı | odun, demir | + **kömür** (ocakta tavlama) |
| 5 | Geri dönüşüm | kömür yalnız dövmeden | harcanan kömür ve taşın %70'i (yükseltmeler dahil); ne eksik ne fazla |
| 6 | Otorite karışımı | taş %40, demir %20, odun %10 + çelik %30 ASTRA | **taş %30, kömür %20, demir %15, odun %15, buğday %15, şifalı ot %5** (hepsi hammadde) |
| 7 | Konsey projeleri | hepsi Otorite karışımı | her projenin **kendi altı hammaddeli karışımı** (konusuna göre) |
| 8 | Konsey ortak stoğu | birikir, hiç harcanmaz | **Otorite'ye ve etkin projeye kendiliğinden aktarılır** (yarı yarıya) |
| 9 | Çark hammadde ödülü | "bedelin geri" dilimleri odun/demir/buğday | sık gelen üç dilim **taş, kömür, şifalı ot**; 15 dilim, ağırlıklar ve ASTRA değerleri aynı |
| 10 | Eski üç alan kalıntıları | "üç alan = odun+demir+buğday" kilidi, "3 alan" stamina özeti | herhangi üç alan; altı alanlı özet |

## 4. Ölçüm: önce / sonra

Haftalık talep / tam üretim (referans oyuncu; bölüm 1'deki varsayımlarla, `scripts/model/hammadde_kullanim.mjs`):

| Seviye | durum | buğday | taş | odun | kömür | demir | şifalı ot |
|---|---|---|---|---|---|---|---|
| 5 | eski | 0,91 | 0,07 | 1,07 | 0,00 | 1,06 | 0,04 |
| 5 | **yeni** | 0,97 | 0,55 | 0,82 | 0,55 | 0,81 | 0,58 |
| 10 | eski | 0,88 | 0,07 | 1,06 | 0,00 | 1,05 | 0,04 |
| 10 | **yeni** | 0,94 | 0,53 | 0,81 | 0,53 | 0,80 | 0,56 |
| 20 | eski | 0,81 | 0,11 | 1,09 | 0,01 | 1,03 | 0,04 |
| 20 | **yeni** | 0,89 | 0,53 | 0,84 | 0,50 | 0,78 | 0,53 |
| 40 | eski | 0,71 | 0,13 | 1,05 | 0,02 | 0,99 | 0,05 |
| 40 | **yeni** | 0,79 | 0,49 | 0,80 | 0,46 | 0,74 | 0,49 |

Altı hammaddenin hepsi hedef bantta (0,40–1,00); `tests/test_hammadde_kullanim_plani.mjs` bunu her kural değişikliğinde denetler.
Yeni üç hammadde eskilerden biraz düşük (~0,5): bilerek; fiyatları düşük olduğu için termostat kotalarını biraz kısarak dengeyi
kendisi kurar. Sıfır değil, anlamlı bir talep yeterlidir.

## 5. Denge kararları (aynı gün uygulandı)

| Bulgu | Karar | Uygulama |
|---|---|---|
| R7 Konsey ortak stoğu hiç harcanmıyordu | kasaya giren her %5 payı kendiliğinden yapıya girsin | stok her çıkarmadan sonra Otorite'ye ve etkin projeye aktarılır (yarı yarıya; biri doluysa kalan öbürüne); tamamlanmayı da tetikler |
| R10 Otorite "çelik payı" ASTRA'sı kimseye gitmiyordu ama kapı göstergesini şişiriyordu | çelik demir ve kömürdür: ödemeyi kömürle yap | ASTRA çekimi kalktı; karışıma %20 kömür girdi. Konsey kasası Universe açılış gününe kadar kilitli bekler |
| R11 Dünya Bossu ekranı kasanın tamamını havuz gösteriyordu (gerçek dağıtım %3) | ekran gerçeği göstersin | "Bu haftanın havuzu" = kasanın %3'ü; kasadaki toplam ayrıca; tahmin havuzu aşamaz ve geçen haftanın toplam hasarına oranlanır |
| R16 Fatih Ödülü kodlanmamıştı (kasa her harcamanın %5'ini alıyordu) | 30 Eylül kararı uygulansın | 18. kat bossu ilk yenilince: (orduya harcanan − zindandan kazanılan), en çok 18 askerin toplam bedeli; hesap başına bir kez; Fatih kasasından çıkar |
| R17 Eski üç alan kalıntıları | altı alana genişlet | çark tablosu, "üç alan" görevi, stamina özeti (bölüm 3, kural 9-10) |

## 6. Bilerek yapılmayanlar (sonraya)

- **Alet onarımında taş ve kömür:** bot önkoşulları ve otomatik onarım zincirini etkilediği için ayrı iş (bot yalnız
  odun-demir-buğday üzerinden kuruludur). Bugünkü ölçümde gerekmiyor.
- **Şifalı otla stamina ("ot çayı"):** buğdayla arasında fiyata göre ikame yaratır; yeni işlem ve ekran gerektirir. İzlenecek:
  şifalı ot oranı 0,45'in altına inerse eklenir.
- **Seviye hızı:** XP tablosu üç alana göre yazılmıştı (günlük 2.520 XP); altı alan birden çalışınca seviyeler yaklaşık iki kat
  hızlı geliyor. Bu turda dokunulmadı (kullanıcı kararı gerekir); bedel gerçek hıza göre hesaplandığı için ekonomiyi bozmaz.
- **R14, R15, R19:** Konsey katkı puanı mesajı, çark/promo kasa defteri, asker hakkı kuralları (karar bekliyor).

## 7. 13 Ekim 2026 denetimi sonrası (EK-01, EK-09)

**Seviye bedeli artık ulaşılabilir silonun %80'ini aşamaz** (`LEVEL_UP_SILO_SHARE`). Önceki tablodaki Sv.12+ talebi hayaletti:
bedel silo-12'yi aşıyordu, oyuncu o seviyelere hiç gelemiyordu. Yeni ölçüm (talep / tam üretim; sıra buğday, taş, odun, kömür, demir, şifalı ot):

| Seviye | buğday | taş | odun | kömür | demir | şifalı ot |
|---|---|---|---|---|---|---|
| 5 | 0,97 | 0,55 | 0,82 | 0,55 | 0,81 | 0,58 |
| 10 | 0,94 | 0,46 | 0,73 | 0,45 | 0,74 | 0,48 |
| 20 | 0,70 | **0,28** | 0,59 | **0,25** | 0,54 | **0,28** |
| 40 | 0,48 | **0,17** | 0,47 | **0,14** | 0,42 | **0,17** |

Sv.20+ taş, kömür ve şifalı ot 0,40 bandının altında; neden yalnız bedelin siloya sığdırılması (model ve test bunu `siloKirpilan`
ile doğrular, taban 0,10). Universe açılınca (silo 18) bant eskisi gibidir. Üst sınır (kalıcı kıtlık) ve hak üzerinden bakış
(talep / hak ≤ 3,5) her seviyede sıkıdır. Seçenekler (kullanıcı kararı): kabul etmek (termostat kotayı kısar), şifalı otla stamina
("ot çayı", §6), ya da seviye XP'sini küçültmek. Model ayrıca artık ulaşılamayan silo yükseltmesini saymaz (Universe öncesi tavan 12).
