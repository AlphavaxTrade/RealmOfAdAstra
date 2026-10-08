# Felaket kurtarma rehberi (Aşama 9)

Amaç: sunucu, disk ya da veritabanı gitse bile **oyuncu verisini ve ödeme kayıtlarını** en çok **1 saatlik kayıpla (RPO ≤ 1 sa)** ve **30 dakikada (RTO ≤ 30 dk)** geri getirmek, ve geri getirirken **kimseye iki kez ödeme yapmamak**.

> Bu belgedeki geri yükleme **gerçekten denendi** (otomatik tatbikat testi: `tests/test_yedek.mjs`, 12 senaryo; komut satırı araçları gerçek süreç olarak). Denenemeyenler en sonda "Sınırlar" bölümünde yazılı.

## 1. Neler yedeklenir, neler yedeklenmez

| | Yedekte mi | Not |
|---|---|---|
| Oyuncular, hesaplar, oturumlar, bakiyeler, ilanlar, ödeme/çekim kayıtları, Oyun Kasası kayıtları, olay günlüğü | **Evet** | Hepsi tek SQLite dosyasında (`realm.db`) |
| Kasa cüzdanlarının özel anahtarları | Evet, **ama şifreli** | `KASA_MASTER_KEY` olmadan açılamaz |
| **`KASA_MASTER_KEY`** | **HAYIR** | **Kaybedilirse Kasa cüzdanlarındaki para kurtarılamaz.** Veritabanından AYRI, çevrimdışı bir yerde (parola yöneticisi + kâğıt kopya) saklayın |
| `GAME_WALLET_PRIVATE_KEY` (oyun cüzdanı) | HAYIR | Ayrı saklayın; kaybı = otomatik ödeme yok (donanım cüzdanı + elle onay moduna dönülür) |
| `ADMIN_TOKEN`, `SMTP_URL`, `server/.env` | HAYIR | Yeniden üretilebilir/kayıtlıdır; yine de bir kopyasını ayrı saklayın |
| **`YEDEK_ANAHTAR`** (yedek şifresi) | HAYIR | **Kaybedilirse şifreli yedekler açılamaz.** `KASA_MASTER_KEY` gibi ayrı saklayın |
| Oyun dosyaları (`dist/`), kod | — | Git deposundan ve imajdan yeniden kurulur |

Kısa kural: **veritabanı yedeği + 3 anahtar (kasa, yedek, oyun cüzdanı) ayrı yerlerde** durmalı. Biri olmadan diğeri işe yaramaz.

## 2. Kurulum (bir kez)

Yedekler her saat alınır; her yedek tutarlı bir andır (yazma sürerken bile), bütünlük denetiminden geçer, sıkıştırılır, isteğe bağlı **AES-256-GCM** ile şifrelenir ve sha256 + manifest ile mühürlenir. Saklama: **son 48 saat (saatlik) + 14 gün (günlük) + 8 hafta (haftalık)**.

### Docker ile
```bash
mkdir -p yedek
openssl rand -hex 32 > secrets/yedek_anahtar.txt && chmod 600 secrets/yedek_anahtar.txt   # şifreleme istiyorsanız (önerilir); anahtarı AYRICA saklayın
docker compose -f docker-compose.yml -f docker-compose.gizli.yml --profile yedek up -d
docker compose logs -f yedek                      # "Yedek alındı" satırı
```
Oyun sunucusu `yedek/` klasörünü yalnız **okur** (yedek yaşını `/metrics`'te göstermek için); yazan `yedek` servisidir.

### systemd ile (Docker'sız)
```bash
sudo install -d -o realm -g realm -m 700 /srv/realm/yedek
sudo cp deploy/realm-yedek.service deploy/realm-yedek.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now realm-yedek.timer
systemctl list-timers realm-yedek.timer ; journalctl -u realm-yedek -n 20
```
Şifreleme için `deploy/realm-yedek.service` başındaki talimata bakın (iki "ŞİFRELİ" satırının `#` işaretini kaldırın).

### Dışarı kopya (ŞART) — KARAR: bilgisayarınız çeker + Proton Drive
Yedekler sunucuda kalırsa disk/sunucu gidince onlar da gider. Seçilen düzen (8 Ekim 2026), trade sitesindeki "AlphAvax Yedek" görevinin aynısı:
1. **Sizin bilgisayarınız sunucudan ÇEKER** (sunucuda bilgisayarınıza erişen hiçbir anahtar durmaz). `scripts/windows/yedek-indir.ps1` saatte bir yeni yedekleri `C:UsersAlphAvaxRealmYedek` klasörüne indirir, boyut+sha256 doğrular, saklama planına göre budar (48 saat + 14 gün + 8 hafta). Sunucu anahtarı yine kasadan, yalnız bellekte açılır.
2. En yeni yedek **Proton Drive** klasörüne de kopyalanır (ikinci kopya; Proton uçtan uca şifreler, son 14 tutulur).
3. Yedekler `YEDEK_ANAHTAR` ile **şifrelidir**; bilgisayardaki ve bulutdaki kopyalar anahtarsız okunamaz. Anahtarı yedeklerden AYRI saklayın.
Kurulum: görev `scripts/windows/yedek-gorev-kur.ps1` ile kuruldu (`Realm Yedek`, saatlik, bilgisayar kapalıysa açılınca kaçırılan çalışma yapılır). Sunucuda oyun kurulu olmadığı sürece betik günlüğe "atlandı" yazar, hata vermez. Günlük: `RealmYedekindirme.log`.
**Sınır:** bilgisayarınız kapalıyken yeni yedek inmez; en kötü durumda dışarıdaki kopya, bilgisayarın son açık olduğu saate kadardır (sunucudaki saatlik yedek bundan bağımsız sürer). Sunucuda çalıştırılan `YEDEK_SONRASI_KOMUT` (rclone/scp ile başka bir buluta) ek güvence olarak hâlâ kullanılabilir.

## 3. Günlük işletim

| Ne | Nasıl |
|---|---|
| Yedek sağlıklı mı | `curl -s 127.0.0.1:8080/metrics \| grep realm_yedek` → `son_yas_saniye` < 3600 olmalı, `son_deneme_basarili` 1 |
| Yedekleri doğrula (hızlı: boyut + sha256) | `node server/yedek/cli/dogrula.js` |
| Derin doğrulama (açar + SQLite bütünlük denetimi) | `node server/yedek/cli/dogrula.js --derin --son=3` |
| Elle yedek al | `node server/yedek/cli/yedekle.js` |
| Alarmlar | `deploy/alarm-kurallari.yml` → `RealmYedekEski` (>2 sa), `RealmYedekBasarisiz`, `RealmYedekHicYok` |

Komutlar `YEDEK_KLASORU` (ve şifreliyse `YEDEK_ANAHTAR`) ortam değişkenlerini kullanır; Docker'da `docker compose exec yedek node server/yedek/cli/dogrula.js`.

**Üç ayda bir tatbikat:** son yedeği ayrı bir klasöre geri yükleyin (aşağıda "Deneme geri yüklemesi"), oyuncu sayısını ve son ödeme numarasını manifestle karşılaştırın, sunucuyu o dosyayla yerelde açın. Tatbikatı yapılmamış yedek, yedek sayılmaz.

## 4. Senaryolar

### A) Veritabanı bozuldu / yanlışlıkla silindi (sunucu ayakta)
1. Oyunu durdurun: `docker compose stop realm` (ya da `systemctl stop realm`). Yedek servisini de durdurun (bozuk veriyi yedeklemesin).
2. En yeni **sağlam** yedeği seçin (`node server/yedek/cli/dogrula.js --derin --son=5`).
3. Geri yükleyin (eski dosya silinmez, yanına `.oncesi-<damga>` olarak alınır):
   ```bash
   node server/yedek/cli/geri-yukle.js yedek/realm-20261008-120000.db.gz.enc --hedef=./data/realm.db
   # şifreliyse YEDEK_ANAHTAR ortamda ya da --anahtar-dosya=/yol/yedek_anahtar.txt
   ```
4. **"Geri yükleme sonrası" bölümünü uygulayın** (ödemeler durdurulmuş başlar). Sonra sunucuyu başlatın.

### B) Sunucu tamamen gitti (disk arızası, silindi, hesap kapandı)
1. Yeni makine kurun (`docs/DEPLOY.md`; imaj GHCR'dan ya da koddan).
2. Anahtarları geri koyun: `KASA_MASTER_KEY`, `GAME_WALLET_PRIVATE_KEY`, `ADMIN_TOKEN`, `SMTP_URL`, `YEDEK_ANAHTAR` (kendi ayrı yedeğinizden).
3. **Dışarı kopyadan** en yeni yedeği (ve `.json` manifestini) makineye alın.
4. `node server/yedek/cli/geri-yukle.js <yedek> --hedef=./data/realm.db` (boş makinede klasör kendiliğinden oluşturulur).
5. "Geri yükleme sonrası" → sunucuyu başlatın → DNS/Caddy'yi yeni makineye çevirin.

### C) Kötü sürüm yayınlandı
Veri bozulmadıysa **geri yüklemeye gerek yok**: önceki imaj sürümüne dönün (`docker compose up -d` ile eski etiket; `SURUM=<eski>`). Yeni sürüm veriyi geri döndürülemez biçimde değiştirdiyse (şema geçişi) önce A senaryosu; geçişler `server/gecis/` altında mühürlü ve yalnız ileri gider, bu yüzden riskli geçişten önce elle yedek alın (`node server/yedek/cli/yedekle.js`).

### D) RPC (zincir erişimi) kesintisi
Veri kaybı yok. Sunucu 3 ayrı RPC adresini dener (`RPC_URLS`). Hepsi düşerse yatırma/ödeme beklemeye geçer, oyun sürer. Takip: `RealmOdemeKuyruguBirikti` alarmı. Geri gelince kuyruk kendiliğinden erir; `sending` durumunda takılanları zincirden sonuçlandırmak için yönetici panelinden "ödemeleri şimdi çalıştır".

### E) Anahtar kaybı
| Kaybolan | Sonuç | Çare |
|---|---|---|
| `YEDEK_ANAHTAR` | Şifreli yedekler **açılamaz** | Yedek yoktur gibi davranın; hemen yeni anahtarla yeni yedek zinciri başlatın. Önlem: anahtarı ayrı yerde sakla |
| `KASA_MASTER_KEY` | Kasa cüzdanları açılamaz; içindeki para erişilemez | Kurtarma yok. Önlem: çevrimdışı iki kopya. Kasa üst sınırı (`KASA_CAP_DAYS`) en kötü kaybı sınırlar |
| `GAME_WALLET_PRIVATE_KEY` | Otomatik ödeme durur | Yeni cüzdan, `PAYOUT_MODE=manual`; ödemeler yönetici onayıyla |
| `ADMIN_TOKEN` | Yönetici paneli kapanır | Yenisini üretin (`openssl rand -hex 32`), sunucuyu yeniden başlatın |

### F) Anahtar sızdı / sunucu ele geçirildi
Önce **ödemeleri durdurun** (yönetici paneli → Duraklat), sonra ilgili anahtarı yenileyin (oyun cüzdanı için yeni cüzdan + sözleşme sahibini donanım cüzdanından kontrol: `RESERVE_WALLET`/`CONTRACT_OWNER`), sonra olay günlüğünü (`events` tablosu, `admin-yetkisiz` kayıtları) inceleyin. Şüpheli sunucudan alınmış yedeğe güvenmeyin: sızıntıdan **önceki** bir yedeği seçin.

## 5. Geri yükleme sonrası (ATLAMAYIN)

Geri yükleme aracı veritabanını yedek anına döndürür ve **ödemeleri/çekimleri otomatik durdurur**. Sebep: yedek anından sonra oyun cüzdanından zincire giden ödemeleri veritabanı bilmez; durdurmadan açarsanız aynı çekim ikinci kez ödenebilir ya da çekilmiş bakiye oyuncuya geri gelmiş görünür.

1. Sunucuyu başlatın, **ödemeler durdurulmuş** kalsın (panel: "⏸️ DURDURULDU" görünür). Oyun oynanabilir; çekim/ödeme beklemede.
2. Yedeğin zamanını not edin (araç yazdırır; manifestte `olusturma`). **O andan bugüne** oyun cüzdanından (`GAME_WALLET_ADDRESS`) çıkan bütün ADASTRA transferlerini zincir gezgininden listeleyin.
3. Her transfer için veritabanında karşılığı olup olmadığına bakın:
   - `payouts` tablosunda aynı `tx_hash` var ve `sent` ise: tamam.
   - `sending` durumunda takılı kayıtlar: panelden "ödemeleri şimdi çalıştır" zincirle sonuçlandırır (`reconcilePayouts`).
   - **Veritabanında hiç karşılığı olmayan transfer** (yedekten sonra yapılmış): o oyuncunun bakiyesi geri yüklenen kayıtta hâlâ yüksek görünür. Oyuncunun bakiyesinden bu tutar **elle düşülmeden** ödemeleri açmayın (aksi hâlde aynı parayı ikinci kez çekebilir).
4. Yedekten sonra **yatırılan** paralar: yatırma taraması kayıtlı blok numarasından (`chain:depositBlock`) yeniden başlar ve kaçanları kendiliğinden işler (aynı işlem iki kez sayılmaz: `tx_hash + log_index` tekildir). Oyun Kasası işlemleri için de `kasa_ops` kuyruğu zincirle `reconcileOps` ile kontrol edilir.
5. Hepsi tutunca yönetici panelinden "▶ Devam" ile ödemeleri açın ve `RealmOdemeKuyruguBirikti` alarmını izleyin.

## 6. Deneme geri yüklemesi (tatbikat, canlıya dokunmaz)
```bash
node server/yedek/cli/geri-yukle.js yedek/<dosya> --hedef=/tmp/tatbikat/realm.db --evet
sqlite3 /tmp/tatbikat/realm.db "select count(*) from players; select max(id) from payouts;"   # manifestle eşleşmeli
DB_FILE=/tmp/tatbikat/realm.db PORT=8099 CHAIN_ENABLED=0 node server/index.js                   # açılıyor mu
```

## 7. Sınırlar (dürüst liste)
- **Yedek anından sonra zincire giden ödemeler için otomatik uzlaştırma aracı yok.** Bölüm 5, adım 3 elle yapılır. En kötü durum haftalık gönderim sınırıyla (`WEEKLY_SEND_CAP_ADA`) ve ödemelerin 5 dakikalık turlarıyla sınırlıdır; yine de bu araç ileride yazılmalıdır (öneri: her ödeme turundan hemen sonra ek yedek almak da pencereyi daralır).
- Dışarı kopya bilgisayarınızın açık olmasına bağlıdır (yukarıdaki "Sınır"). Sunucuya oyun henüz kurulmadığı için bu hat uçtan uca henüz **gerçek yedekle denenmedi**: anahtar kasası, bağlantı ve sunucu tarafı adımı denendi ("atlandı" yazdı); indirme, doğrulama ve budama adımlarının parçaları (dogrula.js, buda.js) testlidir, birleşik akış ilk yedekle görülecek.
- Docker bu geliştirme makinesinde yok: `yedek` servisinin konteyner içinde çalıştığı **denenmedi** (aynı kod gerçek süreç olarak denendi, compose dosyası politika testiyle denetlendi).
- Yedek, çalışan sunucuyla aynı makinede alınırken disk dolarsa yedek başarısız olur (alarm çalar); disk izleme ayrıca gerekir.
- Sunucu çalışırken geri yükleme **reddedilir** (araç hedef veritabanının açık olup olmadığını denetler; "kullanımda" hatası verir ve canlı dosyaya dokunmaz). Önce sunucuyu durdurun. Açılmayan/bozuk dosya bu denetimi engellemez.
