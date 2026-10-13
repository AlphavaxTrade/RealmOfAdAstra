# Eski kodun baştan yazımı: günlük (11 Ekim 2026)

Karar (kullanıcı): 29 Eylül 2026 öncesinden kalan kodun tamamı baştan yazılır; eski koda güvenilmez.
Ölçüm: `node scripts/eski-kod-olc.mjs` (git blame, sınır 2026-09-29).

## Yöntem (her modül için aynı)

1. **Eski davranışı dondur:** modülün eski sürümüyle rastgele ama tohumlu senaryolar koşulur, sonuç özetleri
   `tests/altin/*` altında altın kayıt olarak saklanır (yalnız eski kod bunu üretmiş olur).
2. **Yeni modülü temiz yaz:** aynı dışa açık işlev adları, aynı rastgele sayı sırası, ölü parçalar yok.
3. **Birebir eşleşme:** yeni modül altın kayıtla aynı sonucu vermeden kabul edilmez. Fark varsa ya hata düzeltilir
   ya da fark bilerek kabul edilir ve aşağıya "karar bekleyen" olarak yazılır.
4. **Tam test takımı + build + lint**, sonra commit. Eski dosya git geçmişinde durur.

Bilinen bir hatayı yeniden yazım sırasında sessizce düzeltmem: oyun dengesini değiştiriyorsa karar kullanıcıya gider.

## Yazılanlar

| Modül | Durum | Kanıt |
|---|---|---|
| `js/combat.js` (savaş motoru) | Yeniden yazıldı | `tests/test_savas_motoru_altin.mjs`: 1.500 savaş eski motorla birebir aynı |
| `js/treasury.js` (hazine defteri) | Yeniden yazıldı | `tests/test_ekonomi_cekirdegi_altin.mjs`: 4.000 işlem, her adımda üç modülün tüm durumu birebir aynı |
| `js/ammMarket.js` (pazar motoru) | Yeniden yazıldı | aynı test; kullanılmayan 6 yöntem kaldırıldı |
| `js/globalPool.js` (küresel havuz, UBI, kota) | Yeniden yazıldı | aynı test; kullanılmayan 5 yöntem kaldırıldı |
| `js/gameState.js` (oyuncu durumu çekirdeği) | Yeniden yazıldı | tam oyun altın kaydı (21 adım) değişmedi |
| `js/gameState/ordu.js`, `dunyaBossu.js`, `askerGelisim.js`, `kolezyum.js` | Yeniden yazıldı | `tests/test_oyun_kurallari_altin.mjs`: 4.000 rastgele işlem (58 farklı işlem, 3 oyuncu, zaman atlamaları, haftalık hesaplaşma) birebir aynı |
| `js/gameState/ekonomi.js`, `techizat.js`, `ozet.js` | Eski parçaları yeniden yazıldı | aynı test |
| `js/gameState/karnaval.js` (çark), `piyango.js`, `promo.js`, `parsomen.js` | Yeniden yazıldı (eski tek dosya 4'e bölündü) | altın kayıt 4.000 işlem birebir; ayrıca eski ve yeni kodla 15 dilim × 8 bedel yolu × 2 kasa durumu (240 koşu) ve 53 promo/parşömen/piyango adımı aynı durum özetini verdi |
| `js/ui/ekran/*` (silo, merkez, köy, şifahane, uzay, bölge, taverna, demirhane, pazar, konsey, hazine, karakter, ekonomi, koleksiyon, savaş alanı, karnaval, kolezyum, savaşa hazırlık) | 18 ekran sıfırdan yazıldı | `tests/test_ekran_cizim.mjs` (2 hesap durumunda temiz çizim), ekran eylem testleri, `scripts/tarayici/v3.mjs` 195 gerçek tarayıcı denetimi, `ekran-bak.mjs` |
| `js/ui/arena.js` (savaş arenası) | Yeniden yazıldı; `js/battleArena.js` silindi | `tests/test_arena.mjs`; tarayıcıda düello ve zindan savaşı oynatıldı |
| `js/dungeonScene.js` + `js/ui/zindan-plan.js` | Yeniden yazıldı (saf plan + ince sahne) | `tests/test_zindan_plan.mjs` |
| `js/grandTownScene.js`, `js/vadi3d/vadi.js` (ortak kısım) + `js/ui/harita-ortak.js` | Yinelenen kod tek modüle toplandı | `tests/test_harita_ortak.mjs`; iki harita da tarayıcıda açıldı |
| Geliştirici paneli (`#dev-modal`, ~720 satır), `js/audio.js` ve 75 `sound.*` çağrısı, ölü CSS (1.197 satır), kullanılmayan dinleyiciler | Silindi | `ekranlar.mjs` taraması, `v3.mjs`, `npm test` 148/148 |
| `js/gameState/bot.js` (taverna botu döngüsü, duraklama, açık kapatma), `botPaketi.js`, `botSilo.js` (yeni) | Yeniden yazıldı; silo yükseltme planı ayrı modüle bölündü | altın kayıt 4.000 işlem birebir; eski ve yeni ağaçla 260 tohumlu senaryo (duraklat/sürdür/yenile, fon/alım, onarım, silo, hızlı işlemler) aynı durum özetini verdi |
| `js/gameState/pazar.js` (al/sat, hızlı al planı, depoyu doldur) | Yeniden yazıldı | altın kayıt; `tests/test_pazar_hizli_al.mjs`; hızlı al planında kömür eksiği düzeltildi (bkz. bulgu 26) |
| `js/ui/v3/palet.js` (Ctrl+K paleti ve kısayollar) | Yeniden yazıldı; komut listesi tek kaynaktan (hub) | `tests/test_v3_palet.mjs`; tarayıcıda paletle ekran açıldı |
| `js/app.js` (1.700 → ~430 satır) ve yeni küçük modüller `js/ui/{pencere,toast,yukleme,zindan-gecisi,hud-verisi,kapi-seridi,yol}.js`, `js/ui/v3/bildirim.js`, ekranlar `kotalar, surum, cevrimdisi, hurda`; `js/ui/limits.js` silindi | Yeniden yazıldı; Seferler kenar çubuğu ve eski modallar kalktı | `tests/test_arayuz_parcalari.mjs`, `test_v3_bildirim`, `test_kapi_seridi`, `test_yol_kutusu`, `test_ekran_cizim`; `v3.mjs` 213/213, `kabuk-parcalari.mjs` (zil, Krallık Yolu, çevrimdışı rapor, kapı şeridi, görüldü kancası) telefon + masaüstü |
| `js/ui/barracks.js` (526 satır) + `css/barracks.css` + `js/ui/v3/panel.js` (eski başlık/katlama düzenleyici) | Silindi; Kışla `js/ui/ekran/kisla.js` + saf kurallar `js/ui/kisla-kurallari.js` olarak yeniden yazıldı | `tests/test_kisla_kurallari.mjs`, `tests/test_kisla_ekrani.mjs`, `test_ekran_cizim` (2 hesap durumu); `v3.mjs` 219/219 (yuva seçici, takma, cephanelik sekmesi dahil) |

### combat.js: kaldırılanlar
- **Kat etkisi (`modifier`)**: hiçbir yerden çağrılmıyordu (zindan hiç vermiyor; `config.js`'teki `DUNGEON_MODIFIERS` "henüz bağlı değil").
- **`element`, `revivedOnce`, `cooldowns`**: hiçbir yerde okunmuyordu (bir test `cooldowns`'u sabitliyordu; test gerçek alanı denetleyecek şekilde düzeltildi).
- `applyDamage`'in `canCrit` seçeneği: kimse kapatmıyordu.
- Birim kimliği artık `Math.random` yerine sayaçla üretiliyor (aynı çalışmada tekrarlanabilir).
- `predictBattle` isteğe bağlı `seedBase` alıyor (verilmezse eskisi gibi saat tohumu).
- "Son Nefes" açıklaması %20 diyordu, kod %25 uyguluyor: **metin** koda uyduruldu (davranış aynı).

## Karar bekleyen bulgular (davranışı değiştirir, bu yüzden dokunulmadı)

1. **Öfke sayacı büyümüyor.** Oyun "düşman her tur güçleniyor" diyor, ama 12. turdan sonra düşmana her tur aynı
   `rage` durumu (`stackable:false`) eklendiği için güç `+%18`'de sabit kalıyor (`RAGE_PER_ROUND`). Uzayan savaşlar
   metnin söylediğinden kolay. Düzeltmek zindan denge sayılarını değiştirir.
2. **Düşman tarafındaki oyuncu birimleri yeteneklerini kullanmıyor.** Motor yeteneği "müttefik" ise `skills`,
   "düşman" ise `abilities` alanından okuyor. Kolezyum rakibi (`skills: ['shieldWall','shockwave']`) ve gerçek PvP'de
   karşı taraf yalnız düz saldırı yapıyor. Düzeltmek kolezyum/PvP dengesini değiştirir.
3. **Hazır durumlar hiçbir yetenekten gelmiyor:** `burn`, `poison`, `haste`, `chill`, `weaken` motorda işleniyor
   ama onları üreten yetenek yok (Sahra Merhemi yalnız temizliyor). Ya yetenek eklenmeli ya da bu dallar sadeleşmeli.

### Ekonomi çekirdeği (hazine + pazar + küresel havuz): bulgular
Altın kayıt üç modülü birlikte sınar; eski kodla üretmek için `EKONOMI_KOK` ortam değişkeniyle eski `js` klasörü verilir
(`git archive <eski-commit> js`). Tam oyun altın kaydı (`tests/altin/altin_kayit.json`) hiç değişmedi.

Kaldırılan ölü yöntemler: `injectBuyback`, `getPoolsNeedingSupport`, `getMarketSummary`, `getCorridorPosition`,
`previewPriceAfterSell`, `getResourceBurnRate` (pazar); `calculateLevelUbiPayout`, `recordBroadcastBuyback`,
`getTimeUntilNextEpoch`, `getSecondsUntilReset`, `getNextMonday1800TRT`, `simulateGlobalActivity` (havuz; boş işlevdi,
app.js'teki çağrısı da silindi).

Karar bekleyen / sonraya bırakılan:
4. **Geri alım çekimi ödeme gücü ölçüsüne yazılmıyor.** `drawBuyback` kasadan para çıkarır ama `lifetimeWithdrawn`'a
   eklemez; `getSummary().solvency` ve sağlık göstergesi bu yüzden olduğundan iyi görünür. Düzeltmek göstergeyi değiştirir.
5. **Oyuna görünen sahte kontrat adresi.** `CONTRACT_ADDRESS` (globalPool.js) gerçek token kontratı değil; eski ekonomi panosu
   (app.js ~682) bunu "Kontrat:" diye oyuncuya gösteriyor. Panel yeniden yazılırken ya gerçek adres ya da satır kaldırılacak.
6. **Karnaval kasası defteri atlıyor.** `js/gameState/karnaval.js` hazine defterinin `state` alanına doğrudan yazıyor
   (`pools.carnival`, `outflow`, `lifetimeWithdrawn`). Karnaval modülü yazılırken defterin yöntemleri kullanılacak.
7. **Test menüsündeki makro simülasyon eski oranlarla** (%18 yakım / %82 hazine, v1). Arayüz yeniden yazılırken ya güncel
   oranlara bağlanacak ya da kaldırılacak.
8. **Eski gösterim kopyaları** (`totalTreasury`, `treasury`, `buybackFromBroadcasting`, `totalActiveMiners`) hâlâ durumda;
   yalnız eski ekonomi panosu (app.js) okuyor. O panel gidince alanlar da kaldırılacak.

### gameState.js: düzeltilen hata (davranışı değiştiriyor, bilerek)
9. **Neredeyse kırık alet her yüklemede bedavaya yenileniyordu.** Eski `mergeTools`, dayanıklılığı 100 ve altı olan aleti
   "eski yüzde sistemi" sanıp 43,2 ile çarpıyordu (40 dakika kalan balta → 1.728). Sunucu her istekte kaydı yüklediği için
   bu, onarım parası ödemeden alet yenilemenin yoluydu. Yüzde dönüşümü kaldırıldı (yaşayan kayıtlar zaten dakika cinsinden);
   `tests/test_alet_dayaniklilik_yukleme.mjs` korur. Altın kayıt değişmedi.

### Asker ve boss modülleri: bulgular
10. **Dünya Bossu erken çekilmesi önceki savaşın ödülünü siliyordu (düzeltildi).** Savaş sonrası talep edilmemiş ödül varken
    ordu yeniden kilitlenip erken çekilince `claimableRewardAda` sıfırlanıyordu; ASTRA kasadan çoktan çekilmişti, oyuncuya
    hiç geçmeden yok oluyordu (denemede 1.008 ASTRA). `tests/test_dunya_bossu_odul_kaybi.mjs` korur.
11. **Sahte P2P eser pazarı.** `js/gameState/p2p.js` içinde uydurma satıcılar ("Gezgin_Goblins", "Lord_Kaelen" …) ve uydurma
    ilanlar var; sunucu işlem listesinde yok, yani çevrimiçi modda çalışmaz, tek kişilik modda oyuncuya gerçek pazar gibi
    görünür. Silinecek: app.js pazar sekmesi yeniden yazılırken (modül ve ekranı birlikte).
12. **`learnSoldierSkill` ölü koddu (silindi).** Sunucu listesinde ve arayüzde yoktu; yetenek kilidini seviye şartı olmadan
    atlatıyordu.
13. **`js/audio.js` boş bir taklit.** Sesler kapalı ama `sound.playX()` çağrıları ~60 yerde (app.js + oyun kuralları)
    duruyor. app.js yeniden yazılırken çağrılar ve modül birlikte silinecek.
14. **Kolezyum ve gerçek PvP'de düşman taraf yetenek kullanmıyor** (combat.js bulgu 2). Kolezyum hazır rakibine
    `skills: ['shieldWall','shockwave']` veriliyor ama motor düşman taraf için `abilities` okuyor: yazılan yetenekler etkisiz.

### Arayüz ve kural yeniden yazımı (ikinci tur): bulgular
15. **Sahte "yakılan NFT havuzu", olmayan "Meclis staking" havuzu, v1 oranlı (%18/%82) simülatör, uydurma kontrat adresi,
    "DeepSeek" başlığı ve yalnız 3 hammaddeli envanter** eski ekonomi ve karakter ekranlarındaydı: ekranlar baştan yazılırken
    gerçek hazine defteri, gerçek kasalar ve 6 hammaddeyle değiştirildi.
16. **Koleksiyon "Pandora kutusu" ekranı** eski "Ad" simgesini 3 hammadde için bildiriyordu; çark ödül resmi/simgesi
    yalnız odun/demir/buğday için vardı (diğer 3 hammaddenin simgesi kutu emojisi alıyordu). Kaynak tablosundan okunur.
17. **Çarkın "bedelini geri alma" şansı** v1 ölçeğinden kalma sabit 100 ASTRA eşiğine bakıyordu (bedel artık 1); ekran gerçek
    bedele göre hesaplıyor (~%31).
18. **Kuponlar "Redeem Aktif" yazıyordu** ama kod trade sitesinde geçmiyor (`pending_integration`): ekran dürüstçe
    "site bağlantısı bekleniyor" yazıyor. **Karar bekliyor:** çarkın %0,5'lik "Coin analiz kuponu" dilimi hâlâ site tanımayan sahte
    kod üretiyor; ya site bağlanana kadar çarktan çıkarılmalı ya da kupon gerçek bir hakka bağlanmalı.
19. **Kolezyum "Buğdayla İyileştir" düğmesinin dinleyicisi yoktu** (ölü düğme); anlık iyileştirme gerçek maliyetiyle bağlandı.
20. **Kolezyum Lig sekmesi sahte "Gladyatör Botu #1…#10" tablosu** gösteriyordu, ödülleri v1 ölçeğindeydi (15.000 ASTRA).
    Yerelde yalnız oyuncunun gerçek puanı/kademesi gösteriliyor; sıralama çevrimiçi modda gerçek oyuncularla. (`getColosseumLeaderboard`
    kuralı ve kayıttaki `colosseumLeaderboard` alanı altın kayıt değişmesin diye bırakıldı; sonraki kayıt göçünde silinebilir.)
21. **Parşömen kullanımı zindan hazırlığında hiçbir şeyi tazelemiyordu**: genel dinleyici pencere başlığına bakıp ("SAVAŞ ÖNCESİ")
    envanter ekranını açıyordu; başlık değişince bu dal ölüydü. Yeni ekranda parşömen sonrası ekran tazeleniyor.
22. **Zindan haritasında zafer sonrası levhalar tazelenmiyordu** (`monster-defeated` olayını kimse göndermiyordu) ve ipucu
    "Chamber N" diye İngilizce yazıyordu: düzeltildi.
23. **2B haritada silo doluluğu yalnız odun/demir/buğdaya bakıyordu; Köy ve Uzay Limanı durumları 2B haritada hiç görünmüyordu**
    (iki harita kuralları ayrı kopyalıyordu): ortak modüle taşındı.
24. **Ölü koda ulaşan düğmeler:** hiçbir yerden açılmayan "Akıllı Silah Deposu" penceresi (~105 satır) ve 6 eski Kışla/Taverna/Demirci
    düğmesini dinleyen ~300 satırlık genel dinleyici (üretici ekranlar silinmişti); silindi. Tarama aracı:
    app.js'te dinlenen `#kimlik`/`.sınıf` değerlerinin başka bir yerde üretilip üretilmediğine bakar.
25. **Hızlı kapı yavaş altın kaydı içermiyor** (`test_oyun_kurallari_altin.mjs` ~50 sn): `server/actions.js` değişiminde bir normal işlemi
    yanlışlıkla test işlemleri listesine yazmıştım; yalnız `npm test`/elle koşu yakaladı. **Kural:** `js/gameState/*` ya da
    `server/actions.js` değişen her işte commit'ten önce `node tests/test_oyun_kurallari_altin.mjs` koşulur.

### Kabuk yeniden yazımı (app.js): bulgular
26. **Hızlı al planı "teçhizat dövme" için kömürü hesaba katmıyordu** (eski kod yalnız demir, odun, parça): kömür eksikken plan "tamam" diyordu ve dövme başarısız oluyordu. Yeni plan kömürü de listeler.
27. **Krallık Yolu "gördü" görevleri pencere başlığına bakıyordu** (`OGRETICI_BASLIK_ESLEMESI`): ekranlar yeniden adlandırılınca `treasury_gor` ("Kasaları gez") görevi ulaşılamaz olmuştu (başlık "Konsey ve hazine" diye aranıyor, ekran "Hazine ve gelir" açıyordu). Artık her ekran kendi `goruldu` anahtarını bildirir; görev metni ve hedefi Hazine ekranına çevrildi.
28. **Bildirim kutusu başka oyuncuların adlarını HTML olarak yazıyordu** (`innerHTML`): bildirim merkezi yeni modülde her metni kaçırıyor (`tests/test_v3_bildirim.mjs`).
29. **Sürüm geçmişi her maddeyi ham HTML olarak yazıyordu**; yeni ekran kaçırıyor. Sürüm notundaki "Infinity" sözcüğü ekran testinde bozuk değer sayıldığı için metin "yanlış sayı yazısı" diye düzeltildi.
30. **Kullanılmayan ama beyaz listede duran `sweepCompletedExpeditions` işlemi** (Seferler paneli kalkınca arayüzde çağıran yok). Altın kayıt işlem sırası listeye bağlı olduğu için şimdilik kaldı; bir sonraki altın kayıt yenilemesinde silinecek. Aynı yenilemede ölü durum alanları da (`botSettings`, `lastBotSiloAction`, `colosseumLeaderboard`) kayıttan çıkarılabilir.
31. **Kışla'da dayanıklılığı biten eşya takılabilir ama güç vermez** (`calisiyorMu` kuralı): eski ekran bunu yalnız önerilerden ayıklıyordu; yeni ekran aynı davranışı korur ve kırık eşyada "Onar" düğmesini gösterir (karar gerekmez; oyun kuralı olduğu gibi).
32. **Eski Kışla "Hepsini soy" için tarayıcının `confirm()` penceresini kullanıyordu**; diğer ekranlarla aynı onay penceresine (`onay()`) çevrildi.

### Genel tarama (İş 3, 11 Ekim 2026)
33. Üç salt-okuma denetim (sunucu, kurallar/ekonomi, ön yüz) 20 + 19 + 21 bulgu üretti; kanıtlananlar düzeltildi ve gerileme testine bağlandı
    (`test_tarama_2026_10_{sunucu,kurallar,onyuz}.mjs`, `test_istemci_sunucu_imza.mjs`). Ayrıntı, durum ve karar listesi: `docs/v2/TARAMA_2026-10.md`.
34. Tarama sırasında benim yeni yazdığım kodda da bir hata çıktı (misafir oyuncuda ekran açınca "görüldü" kancası giriş penceresini zorla
    açıyordu); aynı gün düzeltildi. Ders: ekran kancaları yalnız oturum açmış ve vatandaş hesapta sunucuya işlem gönderir.
35. Ölü kayıt alanları ve ölü işlem (`botSettings`, `lastBotSiloAction`, `sweepCompletedExpeditions`) bu turda silindi; altın kayıt üç dosyada yenilendi
    (tarama düzeltmeleri bilerek durumu değiştirdi: kısmi toplama XP/aşınma, pasif iyileşme hassasiyeti, bot paketi ve onarım imzası).

### Tarama kararları uygulandı (12 Ekim 2026)
36. **İlan pazarında kilit aklama kapandı** (S2b): alıcı önce serbest bakiyesinden öder; kilitliden ödenen kısım satıcıda da kilitli kalır (satıcıdaki kilitli pay en az %80). Eskiden iki hesapla al-sat yapmak kilitli ASTRA'nın %20'sini serbest bırakıyordu. Test: `test_v2_ilan_pazari` (5b).
37. **Kolezyum zafer ödülü ölçeği** (R3): taban 2.500 ASTRA ×0,01 uygulanmadan kalmıştı (kasa tohumunda maç başı ~800); taban 25 ASTRA, lig çarpanıyla 25-50. Değerler `COLOSSEUM.WIN_REWARD_ASTRA` / `WIN_REWARD_POOL_SHARE`. PvP haftalık ilk-10 ödülü kasa payı olduğu için değişmedi.
38. **Bot ücreti kişisel Üretim Hakkı'na göre** (R4): günlük alınabilecek miktar = en az (üretim, dünya kalanı, kişisel hak). Seviye 1'de tahmin ~700 → ~80 ASTRA/gün, ücret ~350 → ~40.
39. **Ön-hesap ele geçirme kapandı** (S4): e-posta doğrulama bağlantısı hesabın şifresini yeniden belirletir (şifresiz çağrı bağlantıyı harcamaz); ön yüzde "Hesabını Koru" penceresi. Bu yüzden `POST /api/account/verify` artık `password` alır; testler ve betikler güncellendi.
    Altın kayıt iki kez yenilendi (Kolezyum ödülü, bot ücreti); her biri ayrı commit.
40. **Hammadde kullanım planı** (`docs/v2/HAMMADDE_KULLANIM_PLANI.md`): ölçüm, taş/kömür/şifalı otun neredeyse hiç harcanmadığını (talep/üretim 0,00-0,07), odun ve demirin ise üretimden fazla istendiğini (1,05) gösterdi. Seviye atlama bedeli altı hammaddeye genişledi; alet onarımının "üçe bölünme" hatası (altı aletle %50) düzeldi; teçhizat yükseltme ve onarımı kömür/taş istemeye başladı; Otorite ve Konsey projeleri altı hammaddeli karışımlara geçti; çelik payı ASTRA yerine kömür oldu; çarkın sık gelen hammadde dilimleri yeni üç hammaddeye verildi. Sonuç: altı hammaddenin hepsi 0,46-0,97 bandında. Test: `test_hammadde_kullanim_plani.mjs`.
41. **Denge kararları**: Konsey ortak stoğu kendiliğinden Otorite ve etkin projeye aktarılır (R7); Dünya Bossu haftalık havuzu kasanın %3'ü olarak gösterilir (R11); Fatih Ödülü kodlandı (R16); eski risk duyurusu ve v1.25 notu kaldırıldı. Test: `test_denge_kararlari_2026_10.mjs`, `test_duyuru_risk_uyarisi.mjs`.
42. **Keşfedilen iki gizli hata**: (a) `getRecycleValue` yükseltmelerin kömürünü saymıyordu (yükseltme kömür istemediği için bilerek; artık istiyor ve iade harcananla bire bir); (b) Savunma Duvarı ve Hazırlık Deposu testlerinin yardımcıları proje karışımını üç hammaddeyle varsayıyordu (altı hammadde karışımına güncellendi).
43. **Eski stil dosyaları sadeleştirildi** (`style.css`, `theme.css`, `battle-arena.css`): el yazımı yeniden düzenleme yerine ölçülebilir bir yöntem kuruldu. `stil-kaydi.mjs` her ekran durumunun DOM'unu ve hesaplanmış stilini kaydeder (144 durum: 25 ekran + 6 bölge + palet + savaş hazırlığı/arena + bildirim, telefon/masaüstü × yeni/ilerlemiş hesap); `css-sadelestir.mjs` her bildirimi aynı DOM'da tek tek çıkarıp 17 genişlikte görünümün değişip değişmediğine bakar. Sonuç: 272 bildirim ve 12 kural silindi, 79,7 → 64,6 KB. Örneklemenin kaçırdığı farklar için suçlu bildirimi ikili aramayla bulup geri koyan bir onarım adımı var (15 geri alma). İki ders: (a) `.map-card`'ın `left:0; top:0` bildirimi statik ölçümde görünmedi (yalnız `hover: none` ortamında etkili); canlı uygulama karşılaştırması yakaladı, geri konuldu ve ölçüm sayfaları telefonda dokunmatik kipte açılacak şekilde düzeltildi. (b) Chrome'da fark yaratmayan `-webkit-` önekli ve ölçülmeyen (scrollbar, isolation...) bildirimler Safari ya da başka bağlam için silinmez.
44. **Zindan baştan yazıldı** (13 Ekim 2026). Sorun: oda düğmeleri Phaser tuvaline çiziliyor, sabit oranlarla resmin üstüne konuyordu; resim ekrana zorla uzatılıyor, boyalı İngilizce "Chamber" tabelaları düğmelerle iç içe geçiyordu, telefonda dokunma hedefi küçüktü. Yapılan:
    - **Arka taraf** (kurallar aynı, `test_oyun_kurallari_altin` 4000 işlemde birebir): günlük sayaçlar `gameState/gunluk.js`, ganimet `kesif.js`'ten `zindan.js`'e, Kolezyum yardımcıları (`isSoldierPvpLocked`, `buildPvpTeam`, `payPvpEntry`, `refundPvpEntry`) `kolezyum.js`'e taşındı. Yeni salt okunur özetler: `getZindanOdaOzeti` (durum, kalan can, ordunun kazanma şansı ve %80 için gereken en az asker; Monte Carlo, önbellekli), `getZindanOrduDurumu`, `getZindanTakimi`.
    - **Ön taraf**: Phaser sahnesi (`dungeonScene.js`), eski plan (`zindan-plan.js`), geçiş (`zindan-gecisi.js`) ve kat çubuğu CSS'i (66 seçici) silindi. Yerine düz HTML `js/ui/zindan/{plan,ekran,kutuk,son-savas}.js` ve `css/zindan.css`: iki basamak, **kat görünümü** (resim + 3 oda, telefonda alt alta büyük kartlar) ve **oda görünümü** (o odanın resminin üçte biri, canavar, şans, yetenekler, ganimet, tek "Savaşa hazırlan"). Odalar ve geçit gerçek `<button>`.
    - **Yeni resimler**: 6 kat için Gemini'den yazısız arka planlar (`public/assets/zindan_kat1-6.jpg`, ~230 KB); eski `dungeon_*.jpg` silindi.
    - **Paket A fikirleri**: odanın kazanma şansı renkle, ordu şeridi (asker, yaralı, stamina, ödüllü giriş), "Aynı savaşı tekrarla" (haritada ve zafer ekranında), Canavar Kütüğü (18 kart; karşılaşılmayan "???"), kat tamamlama kutlaması + rozet (Mağara Gezgini … Kıyamet Yenen).
    - **Doğrulama**: `test_zindan_plan`, `test_zindan_ozet`; `scripts/tarayici/zindan.mjs` 5 ekran boyutunda 81 kontrol (taşma, ≥40 px hedef, akış, konsol); bu denetim eski `oranlariYaz` çağrısını (app.js) yakaladı. Ders: yeni arayüz modülünün eski adını çağıran yer kalmış olabilir; sahne kaldırılınca tarayıcıda uçtan uca açıp bakmak şart.
