# 🌌 Realm of AdAstra

Avalanche üzerindeki **ADASTRA** token'ı ile oynanan, tarayıcıda çalışan strateji / RPG oyunu. Oyuncular 6 hammaddenin seferlerini yönetir, köylerini ve ordularını büyütür, teçhizat dövüp ilan pazarında satar, zindanda ve kolezyumda savaşır; harcanan her ASTRA yakım, temel gelir ve ödül kasalarına dağılır. Oyun kuralları tarayıcıda **ve aynı kodla sunucuda** çalışır: ödeme, çekim ve şans gerektiren her şeyin sonucunu sunucu belirler.

> **Durum:** `kurumsal` dalı, v2 oyununun üretime hazırlık çalışması (güvenlik, test, gözlem, yedekleme, dağıtım). Gerçek ADASTRA ile yayına çıkış ve zincir işlemleri yalnız sahibinin kararıyla yapılır; bu depoda hiçbir şey kendiliğinden canlıya çıkmaz. Her aşamanın ölçüm sonuçları: [docs/kurumsal/METRIKLER.md](docs/kurumsal/METRIKLER.md).

## Hızlı başlangıç

Gereksinim: **Node.js 24** (`.nvmrc`).

```bash
npm install
npm run dev          # http://localhost:5180 — tek oyunculu yerel mod (sunucu yok, kayıt tarayıcıda); T tuşu = test menüsü
```

**Sunucuyla (hesaplar, ödeme, çok oyunculu) yerel deneme:**

```bash
npm run build
TEST_MODE=1 CHAIN_ENABLED=0 DB_FILE=./data/local.db ADMIN_TOKEN=$(openssl rand -hex 16) node server/index.js
# http://localhost:8080 — yönetici paneli /admin. Deneme kipinde e-posta gitmez; doğrulama bağlantısı sunucu günlüğüne yazılır.
```
Windows'ta aynısı: `OYUN-SUNUCUSU-BASLAT.bat` (arka planda, bekçili) ve `OYUN-SUNUCUSU-DURDUR.bat`. `TEST_MODE` gerçek anahtar ya da ana ağ sözleşmesiyle birlikte çalışmaz (sunucu açılmayı reddeder).

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm test` | Bütün testler (`tests/test_*.mjs`, her biri ayrı süreçte) |
| `npm run hizli` | Commit öncesi hızlı kapı: gizli bilgi + lint + hızlı testler (~15 sn) |
| `npm run kontrol` | CI'ın aynısı: lint, ölü kod, gizli bilgi, test+kapsam eşiği, derleme, üretim bağımlılığı açığı |
| `npm run kapsam` / `kapsam-kontrol` | Kapsam ölçümü / eşiklerin (yalnız yukarı giden) kontrolü |
| `npm run build` | Yayın paketi `dist/` (ön sıkıştırılmış) |
| `npm run lint` · `olu-kod` · `gizli-tara` · `audit-uretim` | Tek tek kapılar |
| `npm run yuk` · `yuk-kontrol` | Yük testi ve gerileme eşiği (`docs/kurumsal/PERFORMANS.md`) |
| `npm run hook-kur` | Git commit kancasını kurar (bir kez) |
| `node scripts/openapi-uret.mjs` | API belgesini koddan yeniden üretir |
| `node server/yedek/cli/yedekle.js` · `dogrula.js` · `geri-yukle.js` | Yedek al / doğrula / geri yükle |

## Yapı

```
js/               Oyun kuralları ve arayüz (gameState + 20 karışım, globalPool, ammMarket, economy/, v2/, app.js)
server/           Tek Node süreci: app.js + rotalar/, engine.js (aynı oyun kodu), world/ (haftalık, ödeme, yatırma),
                  accounts, kapi, pazar, arena, kasa, payments, db.js + gecis/ (şema), yedek/, log/metrik/kapanis
contracts/        RealmPayments (ödeme), RealmRates (oranlar)
deploy/           Caddy, systemd birimleri, Prometheus alarm kuralları
docs/             Mimari, dağıtım, API, kurumsal belgeler (aşağıda)
scripts/          Kapılar, yük testi, belge üreticileri, Windows bekçisi
tests/            Düz node:assert betikleri; altın kayıt (tests/altin), sahte zincir, sahte SMTP
Dockerfile · docker-compose*.yml
```

## Belgeler

| Belge | İçerik |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Bileşenler, veri akışları, güven sınırları, ölçekleme yolu |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Sunucuya kurulum (Docker / systemd), HTTPS, sözleşmeler, güncelleme, sorun giderme |
| [docs/openapi.yaml](docs/openapi.yaml) · [docs/api/index.html](docs/api/index.html) | API (OpenAPI 3.1) ve okunur sayfa; koddan üretilir, kayma testle korunur |
| [docs/kurumsal/ORTAM.md](docs/kurumsal/ORTAM.md) | Bütün ortam değişkenleri |
| [docs/kurumsal/FELAKET_KURTARMA.md](docs/kurumsal/FELAKET_KURTARMA.md) | Yedekleme, geri yükleme, anahtar kaybı, ödeme uzlaştırma |
| [docs/kurumsal/GOZLEM.md](docs/kurumsal/GOZLEM.md) | Günlük, ölçümler, sağlık uçları, alarmlar |
| [docs/kurumsal/OWASP.md](docs/kurumsal/OWASP.md) | Güvenlik denetimi (A01-A10), bulgular ve testleri |
| [docs/kurumsal/SEMA.md](docs/kurumsal/SEMA.md) · [PERFORMANS.md](docs/kurumsal/PERFORMANS.md) | Veritabanı şeması; yük testi sonuçları |
| [docs/kurumsal/ADR/](docs/kurumsal/ADR) | Mimari karar kayıtları (neden bu yol, hangi seçenekler vardı) |
| [docs/kurumsal/DAL_KORUMASI.md](docs/kurumsal/DAL_KORUMASI.md) | `main` dalı koruma kuralı (hazır komutlar) |
| [docs/v2/](docs/v2) | Oyun tasarımı: kesin kararlar, ekonomi ilkeleri, durum |

## Güvenlik ve para

- Gizli anahtarlar yalnız ortamda / dosyada (`*_FILE`) durur, depoya girmez (`npm run gizli-tara` her commit'te ve CI'da çalışır). Anahtar sızdığı şüphesi varsa [FELAKET_KURTARMA.md](docs/kurumsal/FELAKET_KURTARMA.md) senaryo F.
- Ödeme, Kasa ve zincir koduna dokunan değişiklikler karakterizasyon testi ve altın kayıtla korunur; dal koruması ve kod sahibi incelemesi için [DAL_KORUMASI.md](docs/kurumsal/DAL_KORUMASI.md).
- Zincire gerçek işlem gönderen komutlar (`contracts/deploy.mjs` vb.) yalnız bilinçli ve elle çalıştırılır; testler hiçbir zaman zincire dokunmaz.

© 2026 AlphAvax. Tüm hakları saklıdır.
