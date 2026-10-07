# Realm of AdAstra v2 — R4b: Galaksi Pazarı

Tarih: 7 Ekim 2026 · Durum: TASLAK, onay bekliyor · Kod yok
Bağlı belgeler: R3 (kasalar), R4 (denge: fiyat ölçeği, termostat, geri alım), R4c (fiyat yolu), Universe 00_IKI_OYUN_BAGI (iki oyun tek pazar).
Bu belge her kavramı baştan anlatır; önceki belgeleri okumadan da anlaşılmalı.

## 1. Galaksi Pazarı nedir

Galaksi Pazarı, iki oyunun (Realm of AdAstra ve ileride AdAstra Universe) **tek ortak pazarıdır**. Realm'de Pazar binasına, Universe'de (açılınca) Pazar Merkezi binasına tıklayan oyuncu aynı pazarı görür: aynı fiyatlar, aynı stoklar, aynı defter. Sunucu tek olduğu için (hesap, cüzdan, kasa tesisatı ortak) bu doğal: pazar sunucuda tek bir kayıttır, iki oyun ona iki kapıdan bakar.

Neden tek pazar? İki oyun birbirine muhtaç tasarlandı: Realm'in demiri, kömürü, buğdayı Universe'de çelik, gıda olur; Universe'in titanyumu, alüminyumu Realm'de üst düzey alet ve teçhizat olur. Alıcı ve satıcı farklı oyunlarda olduğu için pazarın ortada durması gerekir. Realm tek başına oynanırken (ilk yıl) pazarda yalnız Realm satırları açık olur; Universe satırları görünür ama kilitlidir (bölüm 6). Böylece oyuncu "yarın bunları kim alacak" sorusunun cevabını baştan görür.

Pazarda iki ayrı bölüm var, çünkü iki tür mal var:
- **Havuz pazarı** (bölüm 2): birbirinin aynısı olan mallar için. 1 demir ile başka 1 demir arasında fark yok; bunlar bir havuzdan alınıp satılır, fiyatı havuz belirler.
- **İlan pazarı** (bölüm 3): birbirinden farklı, tek tek eşyalar için. İki kılıç aynı değildir (seviyesi, eklentisi farklı); bunları oyuncu ilana koyar, fiyatını kendi yazar, başka oyuncu alır.

## 2. Havuz pazarı (hammadde ve tüketilen mallar)

### 2a. Havuz ne demek, fiyat nasıl oluşur

Her malın kendi havuzu var; havuz iki kavanoz gibi düşünülür: birinde ASTRA, diğerinde o mal. Fiyat = kavanozdaki ASTRA ÷ kavanozdaki mal. Oyuncu mal **satınca** malı kavanoza koyar, ASTRA'yı alır: mal kavanozu dolar, ASTRA kavanozu azalır, fiyat düşer. Oyuncu mal **alınca** tersi olur, fiyat yükselir. Yani fiyatı kimse elle koymaz; alan ve satanlar oluşturur. Buna "sabit çarpımlı havuz" denir: iki kavanozun çarpımı hep aynı kalır, o yüzden havuzun yarısını tek seferde almaya kalkan biri fiyatı 4 katına çıkarır, kimse havuzu boşaltamaz.

Örnek (R4'teki fiyat ölçeğiyle, demir açılış fiyatı 0,012 ASTRA, yani 1.000 demir = 12 ASTRA): demir havuzunda 23,6 milyon ASTRA ve 1,97 milyar demir var. Bir oyuncu 10.000 demir satarsa 120 ASTRA alır (komisyon düşülünce 117,6); fiyat yüz binde bir bile oynamaz. 200 oyuncu bir hafta boyunca 15.000'er demir satsa (3 milyon demir) fiyat yalnız binde 1,5 düşer. Bu **derinlik** denen şey: havuz büyük olduğu için tek bir oyuncu fiyatı oynatamaz; fiyat ancak haftalarca süren net satış ya da alımla hareket eder. Derinlik, R4'teki "fiyatlar bir yılda yüzde 50'den fazla düşmesin" hedefinin ilk güvencesi.

### 2b. Hangi mallar havuzda

| Mal | Nereden gelir | Not |
|---|---|---|
| Buğday, Taş, Odun, Kömür, Demir, Şifalı Ot | Realm seferleri | Açılışta açık 6 satır |
| Parça, Anahtar, Pandora Kutusu, Parşömenler (iyileşme, stamina) | Zindan ganimeti, çark | Bugün de havuzda; birbirinin aynısı oldukları için ilan değil havuz |
| Universe hammaddeleri (alüminyum, titanyum, kristal, helyum-3…) ve işlenmiş mallar (çelik, elektronik parça, alaşım) | Universe oyuncuları | Kilitli satırlar; Universe açılınca açılır (bölüm 6) |

### 2c. Havuzların başlangıç parası (tohum)

R3'te pazar havuzlarına 200 milyonluk kaynaktan 100 milyon ASTRA ayrıldı. Dağılımı (öneri):
- 6 hammadde havuzuna 90 milyon, değer ağırlıklı: bir malın haftalık üretim değeri ne kadar büyükse havuzu o kadar büyük (demir 21,2 M · odun 20,0 M · şifalı ot 14,2 M · buğday 12,0 M · kömür 12,0 M · taş 10,6 M).
- Tüketilen mallara 10 milyon: parça 4 M, anahtar 2 M, kutu 2 M, parşömenler 2 M.
- Her havuzun mal tarafı = ASTRA ÷ açılış fiyatı (demir için 21,2 M ÷ 0,012 = 1,77 milyar demir).
- Universe satırlarının tohumu bu 100 milyondan değil, R3'teki kilitli **Universe Tohum Rezervi**'nden (20 M) gelir; Universe açılana kadar dokunulmaz.

Neden değer ağırlıklı? Çok üretilen ve çok satılan malın havuzu da büyük olmalı ki derinliği aynı kalsın; yoksa buğday havuzu küçük olsaydı buğday fiyatı herkesten önce çökerdi.

### 2d. Koridor: taban ve tavan fiyat

Her malın açılış fiyatı var (yukarıdaki örnekte demir 0,012). Koridor, fiyatın bunun **yarısının altına inmesini ve 2,5 katının üstüne çıkmasını** engeller: fiyat tabana inince satış düğmesi kapanır ("şu an taban fiyatta, satış yapılamaz; geri alım kasası devrede"); tavana çıkınca alış düğmesi kapanır. Koridor bir güvenlik kemeri: asıl denge bataklar (Otorite inşaatı, Konsey projeleri, Hazırlık Deposu) ve kota termostatı ile kurulur; koridor yalnız kaza anında tutar. Koridor sınırları ASTRA'nın dolar fiyatına göre fiyat çarpanıyla kayar (ASTRA değerlenince ASTRA cinsinden sınırlar düşer, dolar cinsinden sabit kalır).

### 2e. Komisyon ve yakım

Her alış ve satışta iki kesinti var:
- **ASTRA komisyonu %2:** ödenen ASTRA'nın yüzde 2'si pazarda kalmaz, hazine bölüşümüne girer (yüzde 5 yakılır, yüzde 3 yapımcı, yüzde 6 UBI, yüzde 86 ödül kasaları). Yani pazar döndükçe kasalar dolar.
- **Mal yakımı %2:** satılan ya da alınan malın yüzde 2'si yok olur. Bu, hammaddenin sonsuza kadar birikmemesi için (kıtlık ilkesi).
Örnek: 10.000 demir satan oyuncunun 200 demiri yanar, 9.800 demir havuza girer; karşılığı 117,6 ASTRA ona, 2,4 ASTRA hazineye gider.

### 2f. Geri alım kasası (fiyat düşünce ne olur)

R3'te "Pazar geri alımı" kasası var (tohum 7 M ASTRA, hazine bölüşümünden yüzde 15 pay). Kural: bir malın fiyatı açılış fiyatının 0,8'inin altına inerse, kasa her hafta bakiyesinin yüzde 3'ü kadar ASTRA ile o malı havuzdan alır ve **yakar**. Üç etkisi var: fiyatı yukarı iter (alım), fazla malı yok eder (yakım) ve kasadaki ASTRA havuza geçer (ASTRA piyasadan çekilmez, el değiştirir). R4 modelinde 1.000 oyuncuda bir yılda 4 milyon ASTRA harcayıp fiyatı 0,79'da tuttu. Kasa boşalırsa durur; tohumu ve payı yönetici kolu.

### 2g. Tek işlem sınırı ve koruma

- Tek işlemde havuzdaki malın en çok yüzde 5'i alınıp satılabilir (bugün yüzde 50; çok gevşek). Bu, bir balinanın fiyatı bir anda oynatmasını engeller.
- Alış/satış düğmesine basmadan önce ekran "bu işlem fiyatı yüzde kaç oynatır, eline kaç ASTRA geçer" diye gösterir (kayma koruması); oyuncu onaylar.
- Hesap başına günlük işlem hacmi sınırı yok, ama aynı malı aynı gün alıp satmak katkı puanı getirmez (bugünkü kural; al-sat ile puan kasılamaz).

## 3. İlan pazarı (oyuncudan oyuncuya eşya)

Teçhizat (kılıç, zırh; seviyesi ve eklentisi olan her parça), ileride eser (artefakt), Universe'de gemi ve gezegen gibi **tek tek** şeyler havuzda satılamaz, çünkü her biri farklı. Bunun için ilan pazarı:
- Satıcı eşyayı ilana koyar, fiyatını ASTRA olarak kendi yazar; eşya o anda satıcının depolarından çıkıp sunucuda emanete alınır (satıcı aynı anda hem kullanıp hem satamaz).
- Alıcı "satın al" der; ASTRA alıcıdan düşer, eşya alıcıya geçer, ASTRA satıcıya geçer. Pazarlık yok, teklif yok (ilk sürümde sade).
- Komisyon yüzde 2: yüzde 1 yakılır, yüzde 1 ödül kasalarına.
- İlan süresi 7 gün; süre dolunca eşya satıcıya döner. Aynı anda en çok 10 ilan (Gözlemevi paketi gibi bir ayrıcalık sonra genişletebilir).
- Fiyat tavanı yok ama **manipülasyon koruması** var: aynı cüzdan ailesi arasında alış-satış (kendi eşyanı kendi yan hesabına satıp katkı puanı kasmak) puan getirmez ve komisyon yine kesilir.
- Satılan ASTRA, alıcının bakiyesinden **önce kilitli kısımdan** düşer (kilitli ASTRA oyun içinde harcanabilir kuralı), satıcıya geçen ASTRA'nın yüzde 20'si serbest, yüzde 80'i kilitli gelir (kazanç kuralıyla aynı). Böylece ilan pazarı kilitten kaçış yolu olmaz.

## 4. Pazar ile oyunlar arasında mal nasıl taşınır

Realm'deki silo ile Universe'deki depo ayrıdır. Pazar ikisinin ortasında "yörüngede" durur:
- Realm'de satılan mal havuza girer; Universe'den alan oyuncuya malı Universe deposunda teslim edilir; tersi de aynı. Pazar işlemleri anında teslimdir (uçuş süresi yok); hikâyede bunu "Yük İskelesi gemileri" taşır.
- Oyuncunun kendi Realm hesabından kendi Universe hesabına **satmadan** mal göndermesi ise Yük İskelesi'nden olur ve uçuş süresi + ücret ister (R6'da). Fark: pazar herkese açık ve anında, kendi transferin ücretli ve zamanlı. Böylece pazar hep en akıcı yol olur ve komisyonla kasaları besler.

## 5. Hazırlık Deposu ve ön sipariş (Universe açılmadan önce pazarın Universe tarafı)

**Hazırlık Deposu** (R3'te karar): Realm oyuncusu bugün değersiz hammaddesini Yük İskelesi'ndeki depoya kilitler; mal Realm pazarına bir daha dönmez (fiyatlar rahatlar). Universe açılınca depodaki mal, Galaksi Pazarı'nda Universe oyuncularına **açılış fiyatı × o günkü fiyat çarpanı** ile (yani koridorun orta fiyatından, tabandan değil) satılır ve ASTRA oyuncuya gelir. Toplam vaat 10 milyon ASTRA (Universe Tohum Rezervi'nin yarısı); kişi başı en çok 4 haftalık üretim. Depo dolunca yeni kabul durur. Vazgeçen oyuncu malını yüzde 10 kesintiyle geri alır. Universe açılış günü bu depo, pazarın Universe tarafındaki ilk Realm malı stoğu olur: Universe oyuncuları ilk günden çelik yapacak demir bulur, Realm oyuncuları ilk günden alıcı bulur. Rezervin diğer 10 milyonu Universe hammadde havuzlarının ASTRA tarafını kurar.

**Ön sipariş** (R3 Aşama 2, öneri): Universe açılmadan önce Realm oyuncusu Universe malı (çelik, alüminyum) için ASTRA ödeyip ön sipariş verir; ASTRA Universe rezervinde emanette durur; açılışta mal oyuncunun Universe deposuna teslim edilir. Faydası: Realm'in tek başına yılında ASTRA'ya bir harcama yolu (batak) daha açar ve Universe'e hazırlık hissi verir. Riski: Universe gecikirse paranın emanette uzun kalması; bu yüzden ön sipariş iptal edilebilir (kesintisiz) olmalı. Olup olmayacağı karar 4.

## 6. Universe satırları Realm döneminde nasıl görünür

Pazar listesinde Realm satırlarının altında "Universe (yakında)" bölümü: alüminyum, titanyum, kristal, çelik, elektronik parça gibi satırlar gri, fiyatsız, yanında "ne işe yarar" notu (ör. "Çelik alet kademesi için gerekir", "Silo 13+ için alüminyum"). Tıklanınca kısa açıklama ve "Hazırlık Deposu'na git" bağlantısı. Amaç: oyuncu bugünkü demirinin yarın kime gideceğini ve yarın neye ihtiyaç duyacağını baştan görsün. Universe'e geçiş aşamalarında (R3 bölüm 5) satırlar sırayla açılır: Aşama 2'de ön sipariş düğmesi, Aşama 3'te canlı fiyat.

## 7. Ekran (tek sayfa, 5 sekme)

Hammadde (havuz) · Eşya (ilan) · Universe (kilitli) · Hazırlık Deposu · Ön sipariş. Her havuz satırında: fiyat, 24 saatlik değişim, haftalık grafik, havuz büyüklüğü (derinlik), senin stokun, al/sat kutusu, işlem öncesi "fiyatı yüzde kaç oynatır" uyarısı. Üstte 4 gösterge: 6 malın fiyat endeksi (açılışa göre), geri alım kasası durumu, bugün yakılan mal, Hazırlık Deposu doluluğu. Telefonda sekmeler altta.

## 8. Yönetici kolları

Koridor taban/tavan · komisyon ve mal yakım oranı · geri alım eşiği ve haftalık hızı · tek işlem sınırı (%5) · havuz tohumları (açılışta) · ilan süresi ve ilan sayısı · Hazırlık Deposu vaadi ve kişi tavanı · ön sipariş fiyat listesi · Universe satırlarının açılma aşaması.

## 9. Bu adım için kararlar

1. Tüketilen mallar (parça, anahtar, kutu, parşömen) havuzda kalsın, teçhizat ilan pazarına geçsin: kabul mü?
2. 100 milyonun bölüşümü: 90 M altı hammaddeye (değer ağırlıklı), 10 M tüketilen mallara: kabul mü?
3. Tek işlem sınırı havuzun yüzde 5'i (bugün yüzde 50): kabul mü?
4. Ön sipariş (Universe malı için önceden ASTRA ödeme, iptal edilebilir) olsun mu?
5. Universe satırları ilk günden görünsün (gri, açıklamalı) mı, yoksa Aşama 1'e kadar hiç görünmesin mi?
6. İlan pazarı: komisyon yüzde 2 (1 yakım, 1 kasa), 7 gün, en çok 10 ilan, pazarlık yok: kabul mü?

Onay gelince R5: nüfus ve ordu (köylüler, kolonist, Kışla askerleri, mürettebat; Universe yokken Realm içindeki rolü).


## 10. Düzeltme ve kararlar (7 Ekim, kullanıcı cevapları)

**Kabul edilenler:** tüketilen mallar havuzda, teçhizat ilan pazarında (1); 100 M'nin 90/10 bölüşümü (2); tek işlem sınırı havuzun %5'i (3); ön sipariş (4); Universe satırları ilk günden gri ve açıklamalı (5); ilan pazarı kuralları (6).

**Yeni karar — alet ve teçhizat geri dönüşümü:** Oyuncu, hammaddeyle yaptığı (craft ettiği) her alet ve teçhizatı Demirhane'de geri dönüşüme sokabilir. Geri dönüşüm, o eşyanın yapımında kullanılan hammaddelerin **%70'ini** geri verir (demir, kömür, taş, odun; hangi hammaddeden ne kadar harcandıysa onun %70'i), **%30'u yok olur**. Yapımda ödenen ASTRA geri gelmez. Böylece yanlış yapılan ya da işe yaramayan eşya çöp olmaz, ama her döngüde %30 hammadde yandığı için geri dönüşüm bir "depolama hilesi" olamaz. Satın alınmış (ilan pazarından) eşyalar da geri dönüştürülebilir; tarifesi bilinen her eşya için geçerli. Ekranda eşyanın yanında "Geri dönüştür: +X demir, +Y kömür…" yazar.

**Düzeltme — Hazırlık Deposu tek pazar kuralını bozmaz.** Belgede "Universe tarafı" diye yazdığım ifade yanlış anlaşılmaya açıktı; doğrusu:
- Pazar TEK. Demirin tek havuzu var; Realm oyuncusu da Universe oyuncusu da aynı havuzdan alır, aynı fiyatı görür. Aynı hammadde için ikinci bir pazar YOK.
- Hazırlık Deposu bir pazar değil, bir **bekleme ambarı**: oyuncu malını havuza satmak yerine depoya koyar; mal havuza girmediği için bugünkü fiyatı aşağı itmez. Universe açılış günü **Konsey** depodaki malı Universe Tohum Rezervi'ndeki ASTRA ile (10 M'ye kadar) **açılış fiyatından satın alır**, ASTRA oyuncuya gider, mal **aynı tek havuza** konur; Universe oyuncuları o havuzdan alır. Yani Hazırlık Deposu, "ileri tarihli, fiyatı garantili bir satış"tır; alıcısı Konsey'dir, pazar yine tektir.
- "Universe satırları" yalnız **Universe'de üretilen ve Realm'de olmayan** mallar içindir (alüminyum, titanyum, kristal, çelik, elektronik parça…). Demir, buğday, odun, kömür, taş, şifalı ot için Universe satırı yoktur; onların satırı zaten Realm'de açık olan tek satırdır.

**Destekçi programı:** şimdilik yok (kullanıcı kararı).
