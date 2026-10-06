# Realm of Astra — Sunucu Kurulumu

Bu belge, oyunu bir sunucuda çevrimiçi (gerçek ADASTRA ile) çalıştırmak içindir. Sunucu tek bir program: oyunun kendisini de sunar, oyuncuların kayıtlarını tutar, haftalık ekonomi hesaplarını yapar ve ADASTRA gönderir.

## Ne gerekiyor?

- Linux bir sunucu (en az 1 işlemci, 1 GB bellek yeterli) ve üzerinde **Docker**.
- Bir alan adı ve HTTPS. Cüzdan bağlama ve ödemeler HTTPS ister. Önüne Caddy ya da Nginx konabilir; aşağıda Caddy örneği var.
- **E-posta gönderim servisi** (doğrulama, şifre sıfırlama, cüzdan onayı mailleri için): SMTP bilgisi veren herhangi bir servis olur. Ücretsiz katmanı olanlar var.
- **Oyun cüzdanı:** Yalnızca bu oyun için açılmış yeni bir Avalanche cüzdanı.
  - İçinde oyunun ihtiyacı kadar ADASTRA (başlangıç: 200 milyon) ve işlem ücretleri için biraz AVAX (ör. 1-2 AVAX) olsun.
  - Kişisel cüzdanını **kullanma**.

## 1. Kodu sunucuya al

```bash
git clone https://github.com/blockchainary/AdAstra-Game-1.git realm
cd realm
```

## 2. Ayarları gir

```bash
cp server/.env.example server/.env
nano server/.env
```

Doldurulacaklar:

| Ayar | Ne yazılır |
|---|---|
| `ADMIN_TOKEN` | Uzun, rastgele bir şifre (ör. `openssl rand -hex 32` çıktısı). Yönetici panelinin şifresi. |
| `GAME_WALLET_PRIVATE_KEY` | Oyun cüzdanının gizli anahtarı. Sunucu çekimleri bununla gönderir. |
| `PAYOUT_MODE` | `auto`: sunucu kendisi gönderir. `manual`: yönetici panelinden onaylayınca gönderir. |
| `WEEKLY_SEND_CAP_ADA` | Bir haftada oyunculara gidebilecek en fazla ADA. Güvenlik sınırıdır. |
| `LAUNCH_PRICE_USD` | 1 ADASTRA'nın açılış fiyatı ($). Boş kalırsa sunucunun ilk okuduğu fiyat kullanılır. |
| `PUBLIC_URL` | Oyunun adresi (ör. `https://oyun.alanadin.com`). E-postadaki bağlantılar buraya gider. |
| `SMTP_URL`, `MAIL_FROM` | E-posta servisi bilgisi ve gönderen adı. Boşsa e-postalar gönderilmez. |
| `TRUST_PROXY` | Önünde Caddy/Nginx varsa `1`. |
| `PAYMENTS_CONTRACT` | Ödeme sözleşmesinin adresi (aşağıda 6. adım). Boşsa cüzdandan ödeme ve Oyun Kasası kapalıdır. |
| `KASA_MASTER_KEY` | Oyun Kasası anahtarlarını şifreleyen gizli ana anahtar: `openssl rand -hex 32`. |
| `TEST_MODE` | Gerçek sunucuda **mutlaka `0`**. (`1` test menüsünü, bot rakibi ve taklit kasayı açar.) |

🔑 **`KASA_MASTER_KEY` çok önemli:** Kaybedilirse oyuncuların Oyun Kasalarına bir daha erişilemez; çalınırsa kasalar risk altına girer. Güvenli bir yere (ör. şifre yöneticisi + kağıt) yedekle, kimseyle paylaşma.

⚠️ `server/.env` dosyası gizlidir; GitHub'a gönderilmez, kimseyle paylaşılmaz.

## 3. Çalıştır

```bash
docker compose up -d --build
docker compose logs -f        # "Realm of Astra sunucusu çalışıyor" satırını gör
```

Sunucu yalnız aynı makineden erişilebilir (`127.0.0.1:8080`); oyuna dışarıdan 4. adımdaki HTTPS adresinden girilir. Çalıştığını görmek için: `curl http://127.0.0.1:8080/api/health`. Kayıtlar sunucudaki `data/realm.db` dosyasındadır; bu dosyayı **ve `KASA_MASTER_KEY`'i** düzenli yedekle.

## 4. HTTPS (Caddy örneği)

`/etc/caddy/Caddyfile`:

```
oyun.alanadin.com {
    reverse_proxy localhost:8080
}
```

`sudo systemctl reload caddy`. Bundan sonra oyun `https://oyun.alanadin.com` adresinden açılır.

## 5. Yönetici paneli

`https://oyun.alanadin.com/admin`. Şifre `ADMIN_TOKEN`. Panelde şunlar görünür:

- Oyun cüzdanındaki ADA, ADASTRA fiyatı, piyasa değeri, fren durumu ve fiyat çarpanı
- Bu haftaki çekim sınırı, oyuncu sayıları, bekleyen çekim talepleri ve hazine kasaları
- Son haftalık hesaplaşmanın özeti, bütün ödemeler (zincirdeki işlem bağlantısıyla) ve olaylar

Düğmeler:

- **⏸️ Durdur:** Çekim talepleri ve zincir ödemeleri hemen durur. Bir sorun görürsen ilk bunu kullan.
- **▶️ Devam ettir:** Durdurmayı kaldırır.
- **📤 Bekleyen ödemeleri şimdi gönder:** `manual` modda ödemeler bu düğmeyle gider.

"⚠️ gönderiliyordu" durumundaki bir ödeme, sunucu gönderim sırasında kapanmış demektir. Sunucu böyle bir ödemeyi **çift ödeme olmasın diye kendiliğinden tekrar göndermez**. İşlemin zincirde gerçekleşip gerçekleşmediğine snowtrace.io'dan bak.

## 6. Ödeme sözleşmesini yükle

Oyuncular cüzdandan ödeme yaptığında ADASTRA bu sözleşme üzerinden oyun cüzdanına geçer ve ağ ücreti kadar AVAX komisyonu komisyon cüzdanına gelir. Sözleşme para tutmaz; sahibi yalnız ayarları değiştirebilir ve ödemeleri durdurabilir.

**Önce Fuji deneme ağında dene** (bedava test AVAX'ı Avalanche'ın "Fuji faucet" sayfasından alınır):

```bash
DEPLOY_RPC=https://api.avax-test.network/ext/bc/C/rpc \
DEPLOYER_PRIVATE_KEY=0x... TREASURY=0x<oyun cüzdanı> FEE_RECEIVER=0x<Ledger adresi> \
OWNER_ADDRESS=0x<Ledger adresi> DEPLOY_MOCK_TOKEN=1 node contracts/deploy.mjs
```

Çıktıdaki ayarları deneme sunucusunun `server/.env` dosyasına yaz, oyunu baştan sona dene.

**Sonra gerçek ağa yükle:**

```bash
DEPLOY_RPC=https://api.avax.network/ext/bc/C/rpc \
DEPLOYER_PRIVATE_KEY=0x... TREASURY=0x<oyun cüzdanı> FEE_RECEIVER=0x<Ledger adresi> \
OWNER_ADDRESS=0x<Ledger adresi> TOKEN_ADDRESS=0xCA29d740502F4bA1Fa8e9DcAfBD85137b4CebEb0 CONFIRM_MAINNET=1 node contracts/deploy.mjs
```

Çıktıdaki `PAYMENTS_CONTRACT` ve `CONTRACT_OWNER` ayarlarını gerçek sunucunun `server/.env` dosyasına yaz ve `docker compose up -d --build` ile yeniden başlat.

### Sözleşme sahibi donanım cüzdanında (Ledger)

- `DEPLOYER_PRIVATE_KEY` yalnız yükleme için açılmış **geçici** bir cüzdandır (içinde yükleme ücreti kadar AVAX olsun). Gerçek ağda `OWNER_ADDRESS` zorunludur.
- Yükleme biter bitmez sahiplik Ledger adresine devredilir. Devri tamamlamak için: Ledger'ı MetaMask ya da Core'a bağla → yönetici panelini (`/admin`) aç → **"👑 Sözleşme sahipliğini kabul et"** → Ledger ekranında onayla. Panelde "Sözleşme sahibi: ✅ donanım cüzdanı" görünmeli.
- Bundan sonra geçici yükleme cüzdanı hiçbir şeye yetkili değildir. Acil durumda ödemeleri **"⛔ Cüzdan ödemelerini durdur"** düğmesiyle (yine Ledger onayıyla) durdurabilirsin.

## 7. Sıcak / soğuk cüzdan

Oyun cüzdanının anahtarı sunucuda durur; sunucu ele geçirilirse içindeki para risk altındadır. Bu yüzden:

1. `server/.env` içine `RESERVE_WALLET=0x<Ledger adresi>` ve `ADMIN_EMAIL=<e-postan>` yaz.
2. Sunucu günde bir oyun cüzdanına bakar: **bir haftalık ihtiyaç** (son 4 haftanın en yüksek gönderimi ya da bu haftaki çekim talepleri) üstündeki ADA'yı kendiliğinden Ledger adresine gönderir. Sunucu Ledger'ın anahtarını hiç bilmez; oradan para çekemez.
3. Oyun cüzdanı ihtiyacın altına düşerse yönetici panelinde ve e-postanda "yedek cüzdandan şu kadar ADA gönder" uyarısı çıkar. Paneldeki **"📥 Yedek cüzdandan oyun cüzdanına gönder"** düğmesiyle Ledger'dan tek onayla gönderirsin.
4. Oyuncuların Oyun Kasaları da sınırlıdır: kasada ~30 günlük harcamadan fazlası birikirse fazlası oyuncunun kendi cüzdanına kendiliğinden döner.

## 8. Trade sitesi (AlphAvax) geliri

Trade sitesindeki harcamaların **%40'ı** ADASTRA olarak oyuna gönderilir ve her oyun harcaması gibi dağıtılır: %5 yakım, %6 temel gelir, %3 yapımcı payı, %86 ödül kasaları.

1. Trade sitesinde "oyun payının gönderileceği adres" ayarını **oyun cüzdanı** (ya da yedek cüzdan) adresi yap. (Yayından önce şimdilik kişisel cüzdan yazılı; yayında değiştir.)
2. Sunucunun `server/.env` dosyasına yaz:
   - `PARTNER_INCOME_FROM=0x<trade sitesinin ödemeyi yaptığı cüzdan>`
   - `PARTNER_INCOME_TO=0x<paranın geldiği adres>` (boşsa oyun cüzdanı)
3. Sunucu 5 dakikada bir bu adrese o cüzdandan gelen ödemeleri bulur, her birini **bir kez** sayar. Yönetici panelinde "🤝 Trade sitesi geliri" kartında görünür.
4. Para yedek cüzdana geliyorsa, yakım ve yapımcı ödemeleri oyun cüzdanından yapıldığı için oyun cüzdanını yedekten beslemeyi unutma (panel azalınca uyarır).

## 9. ADA oranları sözleşmesi (RealmRates)

Oyundaki bütün ADA oranları (yakım, yapımcı payı, temel gelir, ödül kasaları ve payları, çarkın karnavala giden kısmı, zindan harcı, piyango amortisi, pazar komisyonu ve hammadde yakımı, çekim ücreti ve kirası) herkesin görebileceği bu sözleşmede durur.

1. `contracts/deploy.mjs` ödeme sözleşmesiyle birlikte bunu da yükler. Yalnız bunu yüklemek için `ONLY_RATES=1` yaz. Başlangıç oranları oyunun bugünkü ayarlarıdır.
2. Çıktıdaki adresi `server/.env` içine `RATES_CONTRACT=0x...` olarak yaz. Sunucu oranları 5 dakikada bir okur ve oyuna uygular.
3. Oranları değiştirmek: alphavaxtrade.vercel.app panelinde **Oyun → ADA nereye gidiyor → Oranları değiştir** (ya da oyunun `/admin` sayfası). Sahibin cüzdanı imzalar; yeni oranlar **24 saat sonra** geçerli olur, bu sürede geri çekilebilir.
4. `OWNER_ADDRESS` verildiyse sahiplik o cüzdana devredilir; o cüzdanla "Sahipliği kabul et" denince tamamlanır.
5. Herkes oranları `GET /api/rates` adresinden görebilir.

## Oyun nasıl işliyor? (kısa)

- **Hesap:** Oyuncu e-posta ve şifreyle kayıt olur. Cüzdanı kaybolsa bile oyundaki bakiyesi hesabında kalır. Siteyi giriş yapmadan gezebilir; bir işlem yapmak istediğinde giriş istenir.
- **Bağlı cüzdan:** Ödeme ve çekim için Core ya da MetaMask cüzdanını hesabına bağlar (imza + e-posta onayı). Cüzdanı **değiştirmek** e-posta onayı ve **48 saat** bekleme ister; o sürede ödemeler eski cüzdana gider ve gerçek sahip "bu ben değilim" ile iptal edebilir.
- Bütün oyun işlemleri sunucuda çalışır. Tarayıcıdan gelen hile girişimleri (bakiye değiştirme, test düğmeleri, sahte eşya) reddedilir.
- **Ödeme:** Tıklamalı işlerde önce oyunda kazanılmış bakiye kullanılır; yetmezse kalan kısım oyuncunun cüzdanından ödeme sözleşmesiyle ödenir (ilk seferde bir kez "izin ver" onayı).
- **Oyun Kasası:** Her oyuncunun sunucunun yönettiği bir kasa adresi var. Oyuncu yokken çalışan işler (pasif iyileşme, bot, botun pazar işleri, alet onarımı) önce kazanılmış bakiyeden, yetmezse kasadan ödenir. Kasadan harcanan ADA saatte bir oyun cüzdanına aktarılır. Kasadaki para oyuncunun kendisinindir; istediği an kesintisiz çekebilir.
- **Çekim (oyunda kazanılan ADA):**
  - Oyuncu serbest bakiyesinden talep verir. Talepler her **Pazartesi 00:01 (TSİ)** ortak haftalık havuzdan karşılanır.
  - Havuzun büyüklüğü, satıldığında ADASTRA fiyatını en fazla %2 düşürecek miktardır. Havuz katkı puanına göre paylaşılır.
  - Ücret %3'tür (fiyat freni açıkken %6). Ücretin %70'i temel gelire gider, %30'u yakılır. Başkasının kullanmadığı hakkı kullanan, %1,5 hak kirası öder.
- **Haftalık işler:**
  - Ücretsiz oyuncu payı dağıtılır.
  - Ortak piyango çekilir; haftada tek kazanan çıkar.
  - Fiyat çarpanı ve temel gelir güncellenir.
  - Oyun içi yakım ölü adrese, yapımcı payı `0x58DBCF66bdd7BfA9da98aDba1965b3794321087C` cüzdanına gönderilir.

## Güncelleme

```bash
git pull
docker compose up -d --build
```

## Sorun giderme

- **"Oyun dosyaları bulunamadı":** Paketi yeniden kur: `docker compose up -d --build`.
- **Panelde "Otomatik (anahtar yok!)":** `GAME_WALLET_PRIVATE_KEY` boş. Ödemeler gönderilmez, panelden onay bekler.
- **Kasa yatırması görünmüyor:** Zincir bağlantısına bak (`docker compose logs`). Sunucu aktif oyuncuların kasa bakiyelerini 2 dakikada bir okur; oyuncu Hesabım → Oyun Kasası → "Yatırmamı kontrol et" ile hemen okutabilir.
- **E-postalar gitmiyor:** `SMTP_URL` ve `MAIL_FROM` ayarlarını kontrol et; `docker compose logs` içinde hata ara.
- **Cüzdandan ödeme kapalı:** `PAYMENTS_CONTRACT` boş ya da yanlış. 6. adımı tamamla.
