# Dağıtım ve işletim

Oyunu bir sunucuda çevrimiçi (gerçek ADASTRA ile) çalıştırmak için. Sunucu tek bir program: oyunu sunar, oyuncu kayıtlarını tutar, haftalık ekonomi hesaplarını yapar ve ADASTRA gönderir. (Eski adı `docs/SUNUCU_KURULUM.md`; içeriği buraya taşındı.)

Diğer belgeler: mimari `docs/architecture.md` · bütün ayarlar `docs/kurumsal/ORTAM.md` · yedek ve kurtarma `docs/kurumsal/FELAKET_KURTARMA.md` · izleme `docs/kurumsal/GOZLEM.md` · API `docs/openapi.yaml`, `docs/api/index.html`.

> **Durum (8 Ekim 2026):** oyun sunucusu şu an hiçbir uzak makinede KURULU DEĞİL. Trade sitesinin AWS makinesi 7 Ekim'de değişti (50.17.123.38, `/srv/realm` ve `realm` servisi yok); eski `scripts/sunucuya-yukle.sh` hâlâ eski adresi (54.81.201.200) gösterir ve çalışmaz. Oyunun alan adı `roa.alphavaxtrade.com` olacak; yayına almak için bu belgedeki adımlar + DNS kaydı + Caddy'ye bir `roa.alphavaxtrade.com` bloğu gerekir. Bunlar sunucuya dokunan, sizin onayınızla yapılacak işlerdir.

## Ne gerekiyor?

- Linux sunucu (en az 1 işlemci, 1 GB bellek; önerilen 2 GB+). **Docker** *ya da* Node 24 + systemd.
- Alan adı ve HTTPS (cüzdan bağlama ve ödemeler HTTPS ister). Önüne Caddy konur (`deploy/Caddyfile`, Docker profili `https`) ya da Nginx.
- **E-posta servisi** (doğrulama, şifre sıfırlama, cüzdan onayı): SMTP bilgisi veren herhangi biri.
- **Oyun cüzdanı:** yalnız bu oyun için açılmış yeni bir Avalanche cüzdanı; içinde oyunun ihtiyacı kadar ADASTRA (başlangıç 200 milyon) ve işlem ücreti için biraz AVAX (1-2). Kişisel cüzdanı **kullanma**.
- **Donanım cüzdanı** (Ledger): sözleşme sahibi ve yedek (soğuk) cüzdan için.

## 1. Kodu al

```bash
git clone https://github.com/alphavaxtrade/RealmOfAdAstra.git realm
cd realm
git checkout main        # kurumsal dal birleştirilince; o zamana dek: git checkout kurumsal
```
İmajı hazır almak istersen: GitHub → Actions → **Yayin** iş akışı elle çalıştırılır (sürüm etiketi girilir), `ghcr.io/<depo>:<sürüm>` olarak yayınlanır. Sunucuya almak her zaman insan kararıdır; hiçbir şey kendiliğinden canlıya çıkmaz.

## 2. Ayarları gir

Her ayar `docs/kurumsal/ORTAM.md` içinde açıklıdır (53 değişken); örnek dosya `docs/kurumsal/env.ornek.txt`.

```bash
cp docs/kurumsal/env.ornek.txt server/.env && chmod 600 server/.env
nano server/.env
```

En önemlileri:

| Ayar | Ne yazılır |
|---|---|
| `NODE_ENV=production` | Başlatma doğrulamasını açar: eksik/yanlış ayarda sunucu **hiç başlamaz** ve nedenini yazar. Docker imajında hazır gelir |
| `ADMIN_TOKEN` | En az 24 karakter, rastgele (`openssl rand -hex 32`). Yönetici panelinin şifresi |
| `PUBLIC_URL`, `TRUST_PROXY=1` | Oyunun `https://` adresi; önünde Caddy/Nginx varsa `1` |
| `SMTP_URL`, `MAIL_FROM` | E-posta servisi. Üretimde zorunlu (yoksa kimse giriş yapamaz) |
| `GAME_WALLET_PRIVATE_KEY`, `PAYOUT_MODE` | Oyun cüzdanı anahtarı; `auto` sunucu kendisi gönderir, `manual` panelden onayla gider |
| `WEEKLY_SEND_CAP_ADA` | Bir haftada oyunculara gidebilecek en fazla ADA (güvenlik sınırı) |
| `PAYMENTS_CONTRACT`, `KASA_MASTER_KEY` | Ödeme sözleşmesi adresi (6. bölüm) ve Kasa anahtarlarını şifreleyen ana anahtar (`openssl rand -hex 32`) |
| `YEDEK_KLASORU`, `YEDEK_ANAHTAR`, `YEDEK_SONRASI_KOMUT` | Yedekleme (`FELAKET_KURTARMA.md`) |
| `TEST_MODE` | Gerçek sunucuda **boş/0**. Üretimde `1` ise sunucu açılmaz |

🔑 **`KASA_MASTER_KEY` ve `YEDEK_ANAHTAR` çok önemli:** kaybedilirse Kasa cüzdanlarına / şifreli yedeklere bir daha erişilemez; çalınırsa risk doğar. Veritabanından **ayrı** güvenli bir yere (parola yöneticisi + kâğıt kopya) yedekle.

**Gizli değerleri dosyadan ver (önerilir):** `ADMIN_TOKEN_FILE`, `SMTP_URL_FILE`, `GAME_WALLET_PRIVATE_KEY_FILE`, `KASA_MASTER_KEY_FILE`, `YEDEK_ANAHTAR_FILE`. Docker'da `docker-compose.gizli.yml` (başındaki komutlar), systemd'de `LoadCredential` (`deploy/realm.service`) bunu hazırlar; değerler ortamda ve `docker inspect` çıktısında görünmez.

## 3. Çalıştır

### A) Docker (önerilen)
```bash
docker compose -f docker-compose.yml -f docker-compose.gizli.yml up -d --build            # oyun
docker compose -f docker-compose.yml -f docker-compose.gizli.yml --profile yedek up -d    # + saatlik yedek
DOMAIN=roa.alphavaxtrade.com docker compose --profile https up -d                             # + Caddy (otomatik HTTPS)
docker compose logs -f realm          # "Realm of AdAstra sunucusu çalışıyor" satırı (JSON günlük)
curl http://127.0.0.1:8080/api/health ; curl http://127.0.0.1:8080/api/ready
```
Kapsayıcı sertleştirilmiştir: salt okunur kök dosya sistemi, tüm Linux yetkileri kapalı, 12 GB bellek sınırı, yalnız `127.0.0.1:8080` yayında. Kayıtlar `./data/realm.db`, yedekler `./yedek/` içindedir.

### B) systemd (Docker'sız)
```bash
sudo useradd --system --home /srv/realm --shell /usr/sbin/nologin realm
sudo install -d -o realm -g realm -m 700 /srv/realm/data /srv/realm/yedek
# kodu /srv/realm altına koy; npm ci --omit=dev ; npm run build (dist/) ; server/.env oluştur
sudo cp deploy/realm.service deploy/realm-yedek.service deploy/realm-yedek.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now realm realm-yedek.timer
journalctl -u realm -f -o cat
```
Birim dosyalarının başındaki yorumlar gizli bilgi (`LoadCredential`) ve şifreli yedek adımlarını anlatır.

## 4. HTTPS

Docker'da `--profile https` yeterli (`deploy/Caddyfile`: otomatik sertifika, sıkıştırma, 1 MB gövde sınırı, yeniden başlatmada 502 yerine 10 sn bekleme). Elle Caddy kullanıyorsan:

```
roa.alphavaxtrade.com {
    reverse_proxy localhost:8080 {
        lb_try_duration 10s
    }
}
```
`sudo systemctl reload caddy`. Sunucunun `keepAlive` süresi 150 sn'dir: vekil bağlantıyı her zaman önce kapatır ("connection reset" 502'leri olmaz). `TRUST_PROXY=1` unutulmasın, yoksa bütün ziyaretçiler tek adres görünür ve hız sınırları ortaklaşır.

## 5. Yönetici paneli

`https://roa.alphavaxtrade.com/admin` (şifre `ADMIN_TOKEN`; sayfa herkese açık, uçları şifresiz çalışmaz). Panel: oyun cüzdanındaki ADA, fiyat, fren, haftalık sınır, oyuncu sayıları, bekleyen çekimler, hazine, bütün ödemeler (işlem bağlantısıyla), olaylar.

- **⏸️ Durdur:** çekim ve zincir ödemeleri hemen durur. Bir sorun görürsen ilk bunu kullan. **▶️ Devam ettir:** kaldırır.
- **📤 Bekleyen ödemeleri şimdi gönder:** `manual` modda ödemeler bu düğmeyle gider.
- "⚠️ gönderiliyordu" durumundaki ödeme, sunucu gönderim sırasında kapanmış demektir; **çift ödeme olmasın diye kendiliğinden tekrar gönderilmez**. Zincirde gerçekleşip gerçekleşmediğine snowtrace.io'dan bak; panelden "şimdi gönder" zincirle sonuçlandırır.

## 6. Ödeme sözleşmesini yükle

Oyuncular cüzdandan ödeme yaptığında ADASTRA bu sözleşme üzerinden oyun cüzdanına geçer, ağ ücreti kadar AVAX komisyonu komisyon cüzdanına gelir. Sözleşme para tutmaz; sahibi yalnız ayarları değiştirebilir ve ödemeleri durdurabilir.

**Önce Fuji deneme ağında dene** (bedava AVAX: Avalanche "Fuji faucet"):
```bash
DEPLOY_RPC=https://api.avax-test.network/ext/bc/C/rpc \
DEPLOYER_PRIVATE_KEY=0x... TREASURY=0x<oyun cüzdanı> FEE_RECEIVER=0x<Ledger adresi> \
OWNER_ADDRESS=0x<Ledger adresi> DEPLOY_MOCK_TOKEN=1 node contracts/deploy.mjs
```
Çıktıdaki ayarları deneme sunucusunun `server/.env` dosyasına yaz, oyunu baştan sona dene. **Sonra gerçek ağ:**
```bash
DEPLOY_RPC=https://api.avax.network/ext/bc/C/rpc \
DEPLOYER_PRIVATE_KEY=0x... TREASURY=0x<oyun cüzdanı> FEE_RECEIVER=0x<Ledger adresi> \
OWNER_ADDRESS=0x<Ledger adresi> TOKEN_ADDRESS=0xCA29d740502F4bA1Fa8e9DcAfBD85137b4CebEb0 CONFIRM_MAINNET=1 node contracts/deploy.mjs
```
Çıktıdaki `PAYMENTS_CONTRACT` ve `CONTRACT_OWNER` ayarlarını `server/.env`'e yaz, yeniden başlat. Bu komutlar **zincire gerçek işlem** gönderir: yalnız sen, bilerek çalıştır.

**Sahip donanım cüzdanında:** `DEPLOYER_PRIVATE_KEY` yalnız yükleme için açılmış *geçici* cüzdandır. Yükleme biter bitmez sahiplik Ledger adresine devredilir; tamamlamak için Ledger'ı MetaMask/Core'a bağla → `/admin` → **"👑 Sözleşme sahipliğini kabul et"** → Ledger'da onayla. Panelde "Sözleşme sahibi: ✅ donanım cüzdanı" görünmeli. Acil durumda **"⛔ Cüzdan ödemelerini durdur"** (yine Ledger onayıyla).

## 7. Sıcak / soğuk cüzdan

Oyun cüzdanının anahtarı sunucuda durur; sunucu ele geçirilirse içindeki para risk altındadır. Bu yüzden `RESERVE_WALLET=0x<Ledger>` ve `ADMIN_EMAIL=<e-postan>` yaz. Sunucu günde bir bakar: **bir haftalık ihtiyaç** üstündeki ADA'yı kendiliğinden Ledger adresine gönderir (Ledger'ın anahtarını bilmez). Oyun cüzdanı ihtiyacın altına düşerse panelde ve e-postada uyarı çıkar; panelden **"📥 Yedek cüzdandan oyun cüzdanına gönder"** ile tek onayla beslersin. Oyuncu Kasaları da sınırlıdır: ~30 günlük harcamadan fazlası kendiliğinden oyuncunun cüzdanına döner.

## 8. Trade sitesi (AlphAvax) geliri

Trade sitesindeki harcamaların **%40'ı** ADASTRA olarak oyuna gönderilir ve her oyun harcaması gibi dağıtılır (%5 yakım, %6 temel gelir, %3 yapımcı payı, %86 ödül kasaları). Trade sitesinde "oyun payı adresi"ni oyun cüzdanı (ya da yedek cüzdan) yap; sunucuda `PARTNER_INCOME_FROM=0x<trade sitesinin ödeme cüzdanı>` ve `PARTNER_INCOME_TO=0x<paranın geldiği adres>` (boşsa oyun cüzdanı). Sunucu 5 dakikada bir bakar, her ödemeyi **bir kez** sayar; panelde "🤝 Trade sitesi geliri" kartı. Para yedek cüzdana geliyorsa yakım/yapımcı ödemeleri oyun cüzdanından yapıldığı için oyun cüzdanını yedekten beslemeyi unutma.

## 9. ADA oranları sözleşmesi (RealmRates)

Oyundaki bütün ADA oranları (yakım, yapımcı payı, temel gelir, ödül kasaları, çark/zindan/piyango/pazar oranları, çekim ücreti...) herkesin görebileceği bu sözleşmede durur. `contracts/deploy.mjs` ödeme sözleşmesiyle birlikte yükler (yalnız bunu: `ONLY_RATES=1`). Adresi `RATES_CONTRACT=0x...` olarak yaz; sunucu 5 dakikada bir okur. Oranları değiştirmek: yönetici panelinden (admin.alphavaxtrade.com → Oyun → "ADA nereye gidiyor" ya da oyunun `/admin` sayfası); sahibin cüzdanı imzalar, yeni oranlar **24 saat sonra** geçerli olur (bu sürede geri çekilebilir). Herkes `GET /api/rates` ile görür.

## 10. Güncelleme ve geri alma

```bash
# Docker
git pull && docker compose -f docker-compose.yml -f docker-compose.gizli.yml up -d --build
# systemd
git pull && npm ci --omit=dev && npm run build && sudo systemctl restart realm
```
- **Önce yedek al:** `docker compose exec yedek node server/yedek/cli/yedekle.js` (ya da `node server/yedek/cli/yedekle.js`). Şema geçişleri yalnız ileri gider.
- **Kapanış güvenlidir:** durdurma sinyalinde yarıdaki istekler ve çalışan dünya turu (en çok 10 sn) bitirilir, veritabanı en son kapanır.
- **Geri alma:** önceki imaj/sürüm etiketiyle yeniden başlat (`SURUM=<eski> docker compose up -d`). Veri bozulduysa `FELAKET_KURTARMA.md` senaryo A.
- **Sağlık:** `/api/health` (ayakta), `/api/ready` (veritabanı + zamanlayıcı), `/metrics` (yerel). Alarm kuralları `deploy/alarm-kurallari.yml`.

## 11. Sorun giderme

| Belirti | Bak |
|---|---|
| Sunucu açılmıyor | Günlükteki `⛔` satırı ayar hatasını açıkça yazar (`NODE_ENV=production` doğrulaması hepsini sayar). `docs/kurumsal/ORTAM.md` |
| `/api/ready` 503 | `kontroller` alanı: `veritabani` ya da `zamanlayici`. Günlükte `Zamanlayıcı hatası` / `Hazırlık denetimi` |
| Kullanıcı hata kimliği gönderdi | `docker compose logs realm \| jq -c 'select(.istek=="<kimlik>")'` |
| Panelde "Otomatik (anahtar yok!)" | `GAME_WALLET_PRIVATE_KEY` boş: ödemeler gönderilmez, panelden onay bekler |
| Kasa yatırması görünmüyor | Zincir bağlantısı (günlük). Oyuncu Hesabım → Oyun Kasası → "Yatırmamı kontrol et" ile hemen okutabilir |
| E-postalar gitmiyor | `SMTP_URL`, `MAIL_FROM`; günlükte SMTP hatası |
| Cüzdandan ödeme kapalı | `PAYMENTS_CONTRACT` boş/yanlış: 6. bölüm |
| Yedek yaşı büyüyor | `FELAKET_KURTARMA.md` "Günlük işletim"; `son-durum.json` içinde `sonHata` |

## Oyun ekonomisi nasıl işliyor? (kısa)

- **Hesap:** e-posta ve parolayla kayıt; cüzdanı kaybolsa bile oyundaki bakiye hesapta kalır. Siteyi girişsiz gezebilir, işlem için giriş ister.
- **Bağlı cüzdan:** ödeme ve çekim için Core/MetaMask hesaba bağlanır (imza + e-posta onayı). Cüzdanı **değiştirmek** e-posta onayı ve **48 saat** bekleme ister; o sürede ödemeler eski cüzdana gider, gerçek sahip "bu ben değilim" ile iptal edebilir.
- **Tüm oyun işlemleri sunucuda çalışır;** tarayıcıdan gelen hile girişimleri (bakiye değiştirme, test düğmeleri, sahte eşya) reddedilir.
- **Ödeme:** önce oyunda kazanılmış bakiye; yetmezse kalan kısım cüzdandan ödeme sözleşmesiyle (ilk seferde bir kez "izin ver").
- **Oyun Kasası:** oyuncu başına sunucunun yönettiği adres; oyuncu yokken çalışan işler (bot, iyileşme, onarım) önce kazanılmış bakiyeden, yetmezse kasadan ödenir. Kasadaki para oyuncunundur, istediği an çekebilir.
- **Çekim:** serbest bakiyeden talep → her **Pazartesi 00:01 (TSİ)** ortak haftalık havuzdan karşılanır (havuz, satıldığında fiyatı en fazla %2 düşürecek miktar; katkı puanına göre paylaşılır). Ücret %3 (fren açıkken %6): %70 temel gelire, %30 yakıma. Başkasının kullanmadığı hakkı kullanan %1,5 hak kirası öder.
- **Haftalık işler:** ücretsiz oyuncu payı, ortak piyango (tek kazanan), fiyat çarpanı ve temel gelir güncellemesi; oyun içi yakım ölü adrese, yapımcı payı yapımcı cüzdanına gider.
