# Sponsorluk / Yatırım — Tasarım (9 Ekim 2026)

Durum: **tasarım tamam, kodlama bu belgeye göre yapılır.** Kararları, "sen karar ver" yetkinizle ben verdim; her biri gerekçeli ve
değiştirilebilir (sayılar `js/config.js` → `SPONSORLUK` altında tek yerde).

## Fikir (sizin tarifiniz)
Dışarıdaki B, oyundaki aktif bir oyuncu A'ya ASTRA gönderir. A bu parayı **asla çekemez**, yalnız oyunda kullanır (gelişmek için).
A oyundan gerçek çekim yaptığında, net miktarın bir kısmı **otomatik B'ye** gider. Herkese açık bir tabloda aktif oyuncuların gelişimi görünür.

## Kararlar (ve neden)

1. **B de bir hesap sahibidir; para oyun içinden geçer.** B önce ASTRA'yı bilinen yoldan oyuna yatırır (Oyun Kasası), sonra "A'ya sponsor ol" der.
   *Neden:* yatırma/doğrulama kodu zaten sınanmış; yeni bir zincir yolu açmak gerekmez. *Alternatif:* doğrudan zincirden sponsor yatırması
   (not defteri/memo ile) — daha karmaşık, ayrı sözleşme ister; sonraya.
2. **A'nın sponsorlu parası ayrı bir kalemdir (`sponsorAda`), bakiyenin içinde ama çekilemez.** Serbest bakiye = toplam − kilitli − sponsorlu.
   Kilitli bakiye zamanla açılır; sponsorlu para **hiç açılmaz** (aksi halde "asla çekemez" kuralı bozulurdu).
3. **Harcama sırası: önce sponsorlu para.** A oyunda ne harcarsa önce sponsor parası gider. *Neden:* sponsor parası oyuna girsin (yakım/hazine/temel gelir
   payları ekosisteme dönsün) ve A'nın kendi parası çekilebilir kalsın.
4. **Sponsorlu para oyuncudan oyuncuya geçemez.** İlan pazarında alıcı yalnız kendi (sponsorsuz) bakiyesiyle ödeyebilir.
   *Neden:* yoksa A, ortağının ilanını pahalıya alarak sponsor parasını "çekilebilir" para olarak ona aktarırdı (kara para temizleme deliği).
5. **Pay oranı: A'nın her haftalık net çekiminin %30'u B'ye gider; süre 12 ay; B'nin toplam getirisi anaparanın 2 katına kadar.** Hangisi önce dolarsa sözleşme biter.
   Pay B'nin **oyun bakiyesine** (serbest) eklenir, zincire ayrı gönderim yapılmaz (hesaplaşmada atomik; B isterse normal yoldan çeker).
   *Neden:* süresiz/sınırsız pay A'yı köleleştirir ve ekonomiye zarar verir; 2× tavan ve 12 ay "yatırım" mantığını dürüst tutar. *Alternatif:* %20 ya da %40.
6. **Alt sınır 1.000 ASTRA, A başına en çok 5 aktif sponsor, B başına en çok 20 aktif sözleşme.** *Neden:* toz yatırımlarla tabloyu/kuyruğu şişirmeyi önler.
7. **Hedef (A) şartları:** vatandaş, askıda ya da izinde değil. Sözleşme sırasında A askıya düşerse/izne çıkarsa pay işlemez ama süre işler.
   *Neden:* kapı kuralı (100 vatandaş) ve katılım puanı zaten adaleti kuruyor; sponsorluk onları delmesin.
8. **B kendine sponsor olamaz; aynı cüzdana bağlı iki hesap arasında da olamaz.** *Neden:* en kolay yan hesap hilesi. (Farklı cüzdanlı iki hesabı aynı kişinin
   yönetmesini sunucu engelleyemez; bunun bedeli aşağıda "kalan risk".)
9. **B vazgeçebilir (feragat), anaparayı geri alamaz.** Para A'nın oyun içi bakiyesine geçmiştir. *Neden:* geri alınabilir olsaydı A bu paraya güvenip planlayamazdı ve
   B "hesapla bekle-çek" oyunu oynayabilirdi. A, B'nin getirisi anaparaya ulaşınca sözleşmeyi kapatabilir ("borcu ödedim").
10. **Herkese açık tablo (`GET /api/sponsor/tablo`):** vatandaşların takma adı (cüzdan/e-posta yok), seviye, bu hafta katılım (kategori/eşik),
    son 4 haftada ortalama haftalık net çekim, aktif sponsor sayısı, toplam sponsorlu para. *Neden:* B bilinçli karar verebilsin; gizlilik için kimlik yok.
11. **Para sızıntı denetimi:** her sponsorluk ASTRA'yı yaratmaz/yok etmez, yalnız B'nin bakiyesinden A'nın sponsorlu kalemine taşır; pay da A'nın net çekiminden
    B'nin bakiyesine taşır. ASTRA korunumu simülasyonda her hafta denetlenir (sponsorlu kalem toplam bakiyenin içinde).

## Kalan risk (açıkça)
- Aynı kişinin farklı cüzdanlı iki hesabıyla "B → A" yapması: sponsor parası A'da yalnız harcanabilir (çekilemez), pay yalnız A'nın gerçek çekiminden gelir;
  bu yüzden kendi kendine para üretmez; en kötü ihtimalle harcama puanı kazanıp çekim havuzundan fazla pay almaya çalışır. Harcama %18 yakım/telif/temel gelire gittiği
  için bu bir maliyetlidir. Sponsorlu para harcamasının katkı puanına etkisi ölçülür; abartılırsa katkı puanında sponsorlu harcama ağırlığı düşürülür (gerekirse ayrı karar).
- Hukuki nitelendirme (yatırım/menkul kıymet benzerliği) sizdedir; ben değerlendirmem. Teknik olarak ürünün adı "sponsorluk", getiri vaadi yoktur: pay yalnız A gerçekten çekim yaparsa çıkar.

## Kapsam dışı (sonra)
Doğrudan zincirden sponsor yatırma, sponsorluk sözleşmesinin zincirde tutulması, A'nın payı kendisinin ayarlaması, ikincil piyasada sözleşme satışı.
