# RoA arayüz sadeleştirme (v1.86 – v1.90)

> 19 Ekim 2026 onaylı plan. Kopya: bu dosya; çalışma günlüğü ve önce/sonra tablosu `RAPOR.md`.


## Context (neden)
Oyuncu ilk kez oynayınca bir ekranda 1.000-4.000 harf, 10-15 düğme ve 50-100 rakamla karşılaşıyor; aynı iş (iyileştirme, onarım, hak/limit, ekonomi rakamları) 2-4 farklı panelde tekrar ediyor, "Ben" menüsünde 14 öğe var. Hedef: yeni oyuncu hangi paneli açarsa açsın **ne olduğunu 5 saniyede anlasın, işi (özellikle kışlada asker düzenleme ve teçhizat yönetimi) açtığı panelin içinde bitirsin**, panel gezmesin. Oyun kuralları ve ekonomi DEĞİŞMEZ; yalnız görünüm, gezinme, yazı ve bilgi sırası değişir.

Kullanıcı kararları: (1) aynı işi yapan ekranlar **birleştirilir**, (2) ileri düzey ekranlar yeni oyuncuya **seviyeye göre açılır**, (3) her aşama bitince testten geçip **test sunucusuna yüklenir**.

## Ölçülen başlangıç (19 Ekim 2026, zengin hesap; görünen harf / düğme / rakam)
Sürüm geçmişi 72.388 harf (yalnız ilk 3 sürüm görünmeli) · Konsey 4.444/15/102 · Karakterim 2.653/13/105 · Kotalarım 2.638/0/88 · Hazine 2.529/9/47 · Karnaval 2.135/15/73 · Roket 1.533/6/31 · Taverna 1.521 · Kışla 1.225 harf ama **26 düğme** · Demirhane 1.112/74 rakam · Pazar 23 düğme · Savaşa hazırlık 12 düğme. Araç: `$TEMP/yogunluk.mjs` mantığı → kalıcı test olacak (Aşama 0).

## Tasarım kuralları (her ekranın bütçesi, testle denetlenir)
1. **Üstte tek cümle + tek ana eylem**: "Bu ekran ne işe yarar / şimdi ne yapmalısın" 1 satır; en çok 1 birincil düğme.
2. **İlk görünümde en çok ~700 harf, ≤6 düğme, ≤15 rakam**; gerisi `katli(...)` (açılır "Ayrıntı") içinde, en çok 2 katman.
3. **Rakamlar kısa yazılır** (153 B, 2,4 M); tam sayı dokununca/ayrıntıda. Teknik terim yok ("qpp", "ağırlık ×1.025" ayrıntıya).
4. **Bir iş = bir panel**: eksik malzeme "⚡ Eksikleri al" ile aynı panelde tamamlanır (var olan `getQuickBuyPlan` / `konseyHizliPlan` deseni her yere), pasif düğmenin altında nedeni yazar.
5. **Neden yok/0 ise neden yazılır** (bugünkü ders: UBI, katkı kademesi, hak dolması).
6. Hedefler dokunmatik (≥44 px), tek sütun telefon, renk tek vurgu.

## Yeni bilgi mimarisi (menü)
Alt çubuk 5 sekme kalır (Harita · Krallık · Savaş · Pazar · Ben). Değişen listeler (`js/ui/v3/hub.js` HUB, `kabuk.js` EKRAN_KIMLIGI/gitHaritasi, `palet.js`):
- **Krallık (8 → 6)**: Krallık merkezi (üretim hakkı/limit + silo + günlük işler burada) · Taverna ve bot · Demirhane · **Köy ve Konsey** (köy evleri + Sirius Konseyi tek ekranda iki sekme) · Roket Rampası. *Şifahane → Kışla'ya* (iyileştirme zaten askerin kartında + Krallık merkezinde), *Silo → Krallık merkezine* (kart + "Yükselt").
- **Savaş (5 → 3)**: Kışla (ordu + eşya + iyileştirme) · Zindan (+ mod seçimi içinde) · Arena (Kolezyum + Savaş alanı iki sekme).
- **Pazar (4 → 3)**: Meydan pazarı · Karnaval · Sandıklar ve koleksiyon. *Ekonomi panosu → Gelişmiş.*
- **Ben (14 → 6 + "Gelişmiş")**: Karakterim (yalnız seviye/stamina/hesap ve haftalık gelir) · Hesap ve cüzdan · Oyun rehberi (+tur) · Ayarlar · Sorun bildir · **Gelişmiş ▸** (Hazine ve gelir, Ekonomi panosu, Kotalarım ayrıntısı, Sürüm geçmişi, Duyurular, Test laboratuvarı).
- **Seviyeye göre açılma**: `HUB.ogeler[].kilit` + `gameState.getFeatureLock` (js/gameState/rehber.js) zaten var; ileri ekranlara (Hazine, Ekonomi, Zindan modu, Arena, Karnaval, Roket) uygun seviye/ilerleme kilidi + "neden kilitli" metni; menüde kilitli öğe gri ve nedeni yazılı.
- Eski kısayol/kimlikler (`kotalar`, `sifahane`, `silo`, `hazine`, `ekonomi`, `koy`, `kolezyum`, `savasalani`) **takma ad** olarak kalır (palet, tur, görev "goruldu" izleri, rehber bağlantıları bozulmaz): `ekranAc` eski kimliği yeni ekran+sekmeye yönlendirir.

## Aşamalar (her biri: gerçek tarayıcıda dene → `npm run kontrol` yeşil → commit → test sunucusuna yükle → sürüm notu)

### Aşama 0 — Ölçüm ve güvenlik ağı (v1.86 içinde, kod değişmez gibi)
- `tests/test_ekran_yogunluk.mjs` (kalıcı): her ekran için harf/düğme/rakam bütçesi; başlangıçta mevcut değerlerle "tavan" yazılır, aşamalar ilerledikçe tavan düşürülür (gerilemeyi yakalar). Sürüm geçmişi için ayrı tavan.
- `scripts/tarayici/` altına **tüm ekranları 390×844 ve 1280×800'de gezip ekran görüntüsü + kaydırma yüksekliği** alan betik (var olan `v3.mjs`/`konsey-bot-bak.mjs` kalıbı); "önce" görüntüleri `docs/arayuz4/` (önce/sonra raporu).
- **Görev adım sayacı**: 8 temel görev (askere eşya tak, yaralıyı iyileştir, seferleri topla, siloyu yükselt, ev yap, eşya geliştir, hammadde al, Konsey'e katkı) için bugünkü dokunuş sayısı ölçülür; hedef her görevde ≤3 dokunuş ve ≤1 panel.

### Aşama 1 — Kışla ve teçhizat (en önemli; kullanıcı isteği) — `js/ui/ekran/kisla.js`, `demirhane.js`, `bilesik.js`, `css/v3/ekran.css`
- **Kışla tek akış**: üstte ordu şeridi (yüz + can çubuğu + güç; yaralı/eksik eşyalı asker rozetli) → bir askere dokununca **o askerin sayfası**: büyük 5 yuva kartı (silah, miğfer, zırh, bacak, bot), her yuvada tek satır istatistik + dayanıklılık çubuğu; yuvaya dokununca seçici (var olan `seciciPaneli`) en güçlüsü önde "En iyisini tak". Onar / Geliştir / Çıkar yuvanın ⋯ menüsünde (şimdi her yuvada 3 düğme görünüyor → 1 birincil + ⋯).
- **Üstte 3 toplu eylem** (şimdi 26 düğme): "⚡ Hepsini kuşan (en iyi)", "🔨 Hepsini onar", "🌿 Hepsini iyileştir" (hepsi `claimAnd…/getQuickBuyPlan` ile eksikleri alarak); diğerleri (soy, sırala, süz, taktik) "Düzenle ▸" katında. Ön/Arka saf seçimi askerin sayfasında net (bu oturumda yapıldı), listede küçük rozet.
- **Cephanelik (depo) sekmesi** "Eşya deposu": ham liste yerine tür süzgeci + "Kimde takılı / boşta" etiketi; satıra dokununca "Şu askere tak" (asker seçici). Demirhane'ye gitmeden **yuvada "Geliştir"** (hızlı al dahil; v1.85'te Demirhane'ye eklenen düğme yeniden kullanılır).
- **Demirhane**: iki sekme (Yeni eşya dök / Eşyalarım) kalır; eşya kartı = ad + 3 satır (güç, dayanıklılık, bir sonraki seviye farkı) + tek birincil düğme "Geliştir"; satış/geri dönüşüm "⋯"ta. Şifahane ekranı Kışla'ya "İyileştirme" bölümü olarak taşınır.
- Test: `test_kisla_ekrani`, `test_kisla_kurallari`, `test_demirhane_*` güncellenir + yeni "asker düzenleme akışı" tarayıcı betiği.

### Aşama 2 — Gezinme ve ekran birleştirme — `hub.js`, `kabuk.js`, `palet.js`, `tur.js`, `ogretici`
- Yukarıdaki yeni menü; Köy+Konsey, Arena, Silo→Merkez, Şifahane→Kışla birleşmeleri; takma ad yönlendirmesi; seviyeye göre açılma; "Gelişmiş" katmanı.
- Krallık merkezi yeniden: **"Bugün ne yapabilirim" listesi** (hazır sefer, yaralı asker, boş yuva, dolu silo, dolan hak: her satır tek dokunuşluk eylem) + üretim hakkı sade kart (bugünkü "Şimdi çıkarabilirsin" kartı).
- Tur (9 adım) yeni menüye uyarlanır; "Şimdi ne yapmalı" kartı aynı mantığı kullanır.
- Test: `test_v3_kabuk`, `test_v3_palet`, `test_ogretici`, `test_rehber` (kimlik/yönlendirme) güncellenir.

### Aşama 3 — Yoğun ekranlar (Konsey, Karakterim, Kotalarım, Hazine, Ekonomi, Karnaval, Roket, Taverna, Koleksiyon)
- **Konsey (şimdi 4.444 harf)**: tek cümle açıklama + "Katkı puanın/kademen" kartı + **Hızlı katkı** (ana eylem) + Otorite/proje ilerlemesi; hammadde tek tek verme, çıkarma hakkı ayrıntısı, formüller katlı.
- **Karakterim**: seviye+stamina+UBI (kısa) ; envanter/ekipman/alet kartları Merkez/Kışla'ya zaten bağlı olduğu için "Ayrıntı"ya.
- **Kotalarım + Hazine + Ekonomi**: "Gelişmiş" altında; her biri en üstte "Bu sayfa ne? / sana ne lazım" tek paragraf; Kotalarım = "Bugün/bu hafta neler kaldı" basit liste (Zindan girişi, hak, kolezyum…).
- **Karnaval, Roket, Taverna, Koleksiyon**: kural 1-3 uygulanır (özet üstte, kurallar katlı). **Sürüm geçmişi**: yalnız son 3 sürüm, "Eskiler" katlı (72 bin harf → ~3 bin).
- Test: yoğunluk tavanları düşürülür; `test_ekran_cizim` temiz çizim.

### Aşama 4 — Savaş ve pazar akışları (Zindan, Savaşa hazırlık, Arena, Pazar, Silo/Köy)
- **Savaşa hazırlık**: şans şeridi üstte (v1.85) kalır; asker seçimi "Kazanacak kadar seç" ana eylem; sabit alt düğme çubuğu "Savaşa başla" + neden pasif; taktik katlı.
- **Zindan**: kat/oda görünümü gözden geçirilir; **kazanma şansı oda kartında** zaten var, "neden %0" ipucu ("silah Sv.1 → Kışla'da geliştir" bağlantılı). Mod seçimi zindan ekranına katlanır.
- **Arena** iki sekme (Kolezyum / Dünya bossu), **Pazar** "Hammadde al-sat" öne, ilan pazarı ve hazine katlı; tüm "eksik var" yerlerinde ⚡ Eksikleri al.
- **Silo/Köy** kartları Krallık merkezinde / Köy+Konsey'de; yükselt bedelinde eksik varsa tek dokunuşla al.

### Aşama 5 — Cila, erişilebilirlik, bütün tur (v1.90)
- Tüm ekranlar 390×844 + 1280×800 yeniden gezilir, kaydırma yüksekliği ve yoğunluk raporu "önce/sonra" tablosuyla `docs/arayuz4/RAPOR.md`; görev adım sayıları yeniden ölçülür.
- Yazı dili taraması (teknik terim, "ağırlık/qpp/…" ayrıntıya); sözlük (`?`) bağlantıları; boş durum ve hata metinleri.
- Yeni oyuncu hesabıyla sıfırdan **uçtan uca deneme** (tur → ilk sefer → ilk asker → ilk eşya → ilk zindan).
- CHANGELOG (oyuncuya görünür) + `docs/v2/ARAYUZ_V3.md` güncellemesi + hafıza notu.

## Yeniden kullanılacak mevcut parçalar
`js/ui/ekran/cekirdek.js` bileşenleri (`kart`, `katli`, `dugme`, `uyari`, `izgara`, `hucre`, `cubuk`, `sekmeler`, `bos`); `hizliIyilestir`/`iyilestirmeParsomeni` (bilesik.js); `getQuickBuyPlan` + `planBedeli` (hızlı al deseni); `konseyHizliPlan/_butceyiBol`; `seciciPaneli`, `K.askerListesi` (kisla); `getFeatureLock` (rehber.js); `tests/test_ekran_cizim.mjs` kalıbı; `scripts/tarayici/*-bak.mjs` kalıbı; `Gelişmiş` için `HUB` yapısı.

## Doğrulama
- Her aşama: `node tests/test_ekran_yogunluk.mjs` (bütçe), `test_ekran_cizim`, ilgili ekran/kabuk testleri, tam `npm run kontrol` yeşil, gerçek tarayıcıda (Playwright, `npm run dev` 5180) ilgili ekranlar 390 ve 1280 genişlikte gezilir + ekran görüntüsüne bakılır, konsol hatası yok.
- Görev adım sayısı (Aşama 0 vs 5) ve yoğunluk tablosu raporda; her aşamadan sonra `scripts/sunucuya-yukle.sh` + canlı `/api/health`.
- Gerçek telefon denenemez (Chromium taklidi); bu raporda açıkça yazılır.

## Riskler / notlar
- Birleştirmeler eski kimlikleri kırabilir → takma ad + test; görev ("goruldu") ve tur izleri ayrıca denetlenir.
- Altın kayıt/fuzz dosyaları yalnız oyun mantığı değişirse yenilenir; bu plan mantığı değiştirmez (yalnız ekran), beklenen etki yok.
- Aşama 1 ve 2 en çok test güncellemesi gerektirir; tek özellik tek commit.
