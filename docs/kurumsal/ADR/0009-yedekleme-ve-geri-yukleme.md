# ADR 0009: Yedekleme: SQLite backup API, sha256 manifest, isteğe bağlı AES-256-GCM, geri yüklemede ödemeler otomatik durur

Tarih: 8 Ekim 2026 · Durum: **Kabul edildi, uygulandı**

## Karar
- **Tutarlı kopya:** kayıt dosyası salt okunur açılıp `node:sqlite` `backup()` ile kopyalanır (WAL modunda `cp` bozuk yedek verir). Kopya `integrity_check`'ten geçmeden yedek sayılmaz.
- **Mühür:** gzip + (varsa) AES-256-GCM, her yedeğin yanında `sha256`, boyut, şema sürümü, oyuncu sayısı, son ödeme numarasını içeren manifest.
- **Saklama:** saatlik 48 / günlük 14 / haftalık 8 (saf işlev, birim testli). Hedef: RPO ≤ 1 saat.
- **Dışarı kopya:** karar (8 Ekim 2026): sahibinin bilgisayarı sunucudan saatte bir çeker (`scripts/windows/yedek-indir.ps1`, 'Realm Yedek' görevi), sha256 doğrular, budar ve en yeniyi Proton Drive'a kopyalar. Çekme yönü seçildi çünkü sunucuda bilgisayara erişen anahtar durmaz; yedekler şifreli olduğundan kopyalar anahtarsız okunamaz. `YEDEK_SONRASI_KOMUT` (bulutlara itme) ek seçenek olarak durur; gizli anahtarlar kancaya verilmez.
- **Geri yükleme:** önce doğrula (sha256, çözme, bütünlük), sonra eski dosyayı silmeden yanına al, çalışan sunucu varsa reddet, **ödemeleri ve çekimleri otomatik durdur**.

## Neden ödemeler durur
Yedek eski bir andır. O andan sonra zincire giden bir ödemeyi veritabanı bilmez; durdurmadan açmak çift ödeme ya da çekilmiş bakiyenin geri gelmesi demektir. İnsan zincirle karşılaştırır (`FELAKET_KURTARMA.md` bölüm 5), sonra açar.

## Bilinen eksik
Yedek sonrası zincire giden ödemeler için **otomatik uzlaştırma aracı yok**; elle adımlar belgelendi. Öneri: her ödeme turundan sonra ek yedek (pencereyi daraltır) ve uzlaştırma aracı.

## Seçilmeyenler
Litestream/sürekli çoğaltma: ek süreç ve bağımlılık; saatlik RPO bu ürün için yeterli görüldü, ihtiyaç çıkarsa ADR yeniden açılır. `sqlite3 .backup` CLI: Docker imajında ek paket gerektirirdi.
