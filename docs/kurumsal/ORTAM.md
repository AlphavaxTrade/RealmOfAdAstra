# Ortam değişkenleri

> **Otomatik üretilir**: `node scripts/env-belge.mjs` (kaynak: `scripts/env-belge.mjs`; güncelliği `tests/test_env_belge.mjs` korur).
> Hazır örnek dosya: [`env.ornek.txt`](env.ornek.txt) → `server/.env` olarak kopyalanır.

**Bayraklar:** 🔒 gizli değer (`<AD>_FILE` ile **dosyadan** da verilebilir: Docker secrets / systemd; ikisi birlikte verilemez) · ⚠️ `NODE_ENV=production` iken zorunlu · 🧪 yalnız test.

Üretimde (`NODE_ENV=production`) sunucu, eksik/yanlış ayarı **başlamadan** açık hatayla bildirir (`dogrula()` in `server/config.js`).

## Sunucu

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `NODE_ENV` | production ise başlatma doğrulaması katı çalışır (zorunlu ayarlar, https, güçlü şifre...). Docker imajında hazır gelir | (boş) |
| `PORT` | Dinlenen port (0-65535) | 8080 |
| `HOST` | Dinlenen adres. Docker/Caddy arkasında 127.0.0.1 ya da konteyner içinde 0.0.0.0 | 0.0.0.0 |
| ⚠️ `PUBLIC_URL` | Oyunun dış adresi. E-postadaki bağlantılar ve HSTS buna göre. Üretimde https:// ile başlamalı | http://localhost:PORT |
| `TRUST_PROXY` | 1: önünde Caddy/Nginx var; istemci adresi X-Forwarded-For'un SON girdisinden alınır (hız sınırları için) | 0 |
| `SERVE_DIST` | 0: oyunun statik dosyaları sunulmaz (başka yerden sunuluyorsa) | 1 |
| `DIST_DIR` | Derlenmiş oyun klasörü | ./dist |
| `CORS_ORIGINS` | Oyun dosyaları başka adresten sunuluyorsa izinli adresler (virgülle). Yönetici uçlarına asla izin verilmez | (boş) |
| ⚠️ `DB_FILE` | SQLite kayıt dosyası. Üretimde kalıcı bir yol (Docker'da /data/realm.db), :memory: olamaz | ./data/realm.db |
| `SESSION_DAYS` | Oturum geçerlilik süresi (gün) | 30 |
| `LOG_LEVEL` | Günlük seviyesi: debug \| info \| warn \| error. debug sağlık/statik istekleri de yazar (sorun ayıklarken) | info |
| `LOG_FORMAT` | Günlük biçimi: json (makine okur, üretim için) \| duz (geliştirici: saat SEVİYE ileti) | json |
| `SENTRY_DSN` | İsteğe bağlı hata izleme. Doluysa ve sunucuda npm i @sentry/node yapılmışsa hatalar Sentry hizmetine de gider; paket yoksa yalnız uyarılır | (boş: kapalı) |

## Hız sınırı

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `RATE_LIMIT_PER_SEC` | Oturum başına saniyede en çok istek | 15 |
| `IP_RATE_LIMIT_PER_SEC` | IP başına saniyede en çok istek (kimlik denetiminden önce) | 40 |
| `PUBLIC_RATE_LIMIT_PER_SEC` | Giriş/kayıt gibi herkese açık uçlar için IP başına | 5 |

## Yönetici ve e-posta

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| 🔒 `ADMIN_TOKEN` | Yönetici paneli şifresi (en az 24 karakter; `openssl rand -hex 32`). Boş ya da kısaysa panel KAPALI | (boş) |
| `ADMIN_EMAIL` | Uyarı e-postaları (oyun cüzdanı azaldı, zamanlayıcı hatası...) | (boş) |
| 🔒 ⚠️ `SMTP_URL` | E-posta sunucusu: smtp://kullanici:sifre@sunucu:587. Boşsa e-postalar günlüğe yazılır (yalnız deneme). Üretimde zorunlu | (boş) |
| `MAIL_FROM` | Gönderen adı ve adresi | Realm of AdAstra <no-reply@localhost> |

## Zincir (Avalanche)

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `CHAIN_ENABLED` | 0: zincire hiç bağlanma (deneme/yerel) | 1 |
| `CHAIN_ID` | 43114 Avalanche ana ağ, 43113 Fuji deneme ağı | 43114 |
| `RPC_URLS` | Virgülle ayrılmış RPC adresleri (sırayla yedeğe geçer) | avax.network, publicnode, ankr |
| `TOKEN_ADDRESS` | ADASTRA sözleşme adresi | 0xCA29…bEb0 |
| `TOKEN_MANAGER` | Arena TokenManager adresi | 0x8315…6c6e |
| `TOKEN_ID` | Arena token numarası | 106334 |
| `AVAX_USD_FEED` | Chainlink AVAX/USD fiyat kaynağı | 0x0A77…6156 |
| `DEPOSIT_START_BLOCK` | Yatırma taramasının başlayacağı blok (0: ilk açılış bloğu) | 0 |
| `LEGACY_DEPOSITS` | 1: eski düzen, oyun cüzdanına doğrudan gönderilen ADASTRA bakiyeye yazılır (varsayılan kapalı) | 0 |
| `PAYMENTS_CONTRACT` | RealmPayments sözleşme adresi. Boşsa cüzdandan ödeme ve Oyun Kasası kapalı | (boş) |
| `RATES_CONTRACT` | RealmRates sözleşme adresi (ADA oranları; 5 dakikada bir okunur). Boşsa oyunun kendi ayarları | (boş) |
| `PAY_FEE_GAS` | Ödeme komisyonu gaz çarpanı (sözleşmedeki feeGas ile aynı olmalı) | 100000 |
| `TREASURY_ADDRESS` | Sözleşmedeki hazine adresi (boşsa oyun cüzdanı) | (boş) |
| `CONTRACT_OWNER` | Ödeme sözleşmesinin olması gereken sahibi (donanım cüzdanı); panelde doğrulanır | (boş) |

## Cüzdanlar ve para

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| 🔒 `GAME_WALLET_PRIVATE_KEY` | Oyun cüzdanının gizli anahtarı (0x + 64 hane). Sunucu çekimleri bununla gönderir. Boşsa ödemeler yönetici onayında | (boş) |
| `GAME_WALLET_ADDRESS` | Anahtar yokken yalnız okumak için oyun cüzdanı adresi | (boş) |
| 🔒 ⚠️ `KASA_MASTER_KEY` | Oyun Kasası anahtarlarını şifreleyen ana anahtar (64 onaltılık hane). KAYBEDİLMEZ, PAYLAŞILMAZ, veritabanıyla AYNI YERDE yedeklenmez | (boş) |
| `PAYOUT_MODE` | auto: sunucu kendisi gönderir; manual: yönetici panelinden onaylanınca | anahtar varsa auto, yoksa manual |
| `WEEKLY_SEND_CAP_ADA` | Bir haftada oyunculara gidebilecek en fazla ADA (güvenlik sınırı) | 100000000 |
| `MIN_WITHDRAW_ADA` | En düşük çekim | 1000 |
| `LAUNCH_PRICE_USD` | Açılış fiyatı ($). 0: sunucunun ilk okuduğu fiyat | 0 |
| `RESERVE_WALLET` | Soğuk (donanım) cüzdan adresi: oyun cüzdanındaki fazla ADA günde bir buraya gider | (boş) |
| `HOT_WALLET_WEEKS` | Oyun cüzdanında kaç haftalık ihtiyaç tutulur | 1 |
| `HOT_WALLET_MIN_ADA` | İlk haftalarda oyun cüzdanında kalacak en az ADA | 0 |
| `KASA_MIN_AVAX` | Kasada en az bu kadar AVAX yoksa kasa kullanılmaz (aktarım ücreti) | 0.003 |
| `KASA_MIN_SETTLE` | Bu kadar birikince (ya da 24 saatte bir) kasadan oyuna aktarım | 50 |
| `KASA_CAP_DAYS` | Kasada en çok kaç günlük harcama birikir (fazlası oyuncuya iade) | 30 |
| `KASA_CAP_FLOOR_ADA` | Yeni oyuncu için kasa üst sınırının alt değeri | 20000 |

## Ortak gelir

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `PARTNER_INCOME_FROM` | Trade sitesinin ödemeyi yaptığı cüzdan(lar) (virgülle) | (boş) |
| `PARTNER_INCOME_TO` | Paranın geldiği adres (boşsa oyun cüzdanı) | (boş) |

## Deneme / test

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `TEST_MODE` | 1: deneme sunucusu (test menüsü, taklit Kasa, bot rakip). GERÇEK SUNUCUDA KAPALI; gerçek anahtar/ana ağ sözleşmesiyle birlikte açılmaz | 0 |
| 🧪 `PAROLA_HAFIF` | YALNIZ testler: parola özetini hafifletir. Gerçek sunucuda başlatma reddedilir | (boş) |
| 🧪 `TEST_RASTGELE` | YALNIZ testler: rastgeleliği sabit tohumla tekrarlanabilir yapar (altın kayıt testi) | (boş) |
