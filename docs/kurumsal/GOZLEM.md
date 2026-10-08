# Gözlemlenebilirlik rehberi (Aşama 7)

Sunucu "içinde ne oluyor" sorusuna dışarıdan cevap verebilmeli: günlük (ne oldu), ölçüm (ne kadar, ne sıklıkla), sağlık (çalışıyor mu, hazır mı), uyarı (biri bakmalı mı).

## 1. Günlük
- Her kayıt **tek satır JSON**: `{"t":"…","sev":"info","ileti":"…", …alanlar}`. Kod: `server/log.js`.
- `LOG_LEVEL` = `debug | info | warn | error` (varsayılan `info`). `LOG_FORMAT=duz` geliştirici için okunur biçim.
- `warn` ve `error` stderr'e, gerisi stdout'a gider (Docker ve systemd ikisini de toplar).
- **Gizli bilgi yazılmaz:** adı token, şifre, anahtar, authorization, cookie, imza, raw_tx içeren alanlar `[GİZLİ]` olur; metin içindeki `Bearer …`, bağlantı adresindeki şifre (örneğin SMTP bağlantı adresinin kullanıcı:şifre kısmı) ve e-posta adresinin yerel kısmı maskelenir. İşlem özeti (tx hash) bilerek açık kalır (zincirde zaten herkese açık, ödeme sorunlarını ayıklamak için gerekir).
- Her isteğe bir **istek kimliği** verilir (`X-Request-Id` yanıt başlığı; Caddy'nin ürettiği geçerli kimlik korunur). O istekte hangi modül yazarsa yazsın her satırda `istek` alanı olur.
- Sunucu hatasında (500) kullanıcıya yalnız `istekKimligi` gösterilir; ayrıntı yalnız günlüktedir. Destek akışı: kullanıcı kimliği iletir → `journalctl -u realm | grep <kimlik>`.
- İstek satırı: `{"ileti":"istek","istek":…,"yontem":"GET","rota":"GET /api/state","durum":200,"ms":3.2,"oyuncu":…}`. `rota` her zaman bilinen rota anahtarı ya da `bilinmeyen` / `statik` / `admin-sayfa` (ham adres günlüğe ve metriğe girmez). Sağlık, hazırlık, metrik ve statik dosya istekleri yalnız `debug` seviyesinde yazılır.

## 2. Sağlık uçları
| Uç | Anlamı | Ne zaman 503 |
|---|---|---|
| `GET /api/health` | Süreç ayakta (canlılık) | hiç |
| `GET /api/ready` | Hazır: veritabanı yanıt veriyor **ve** dünya zamanlayıcısı canlı | veritabanı erişilemez ya da zamanlayıcı 3 dakikadır tur bitirmedi |

`/api/ready` ham hata göstermez, yalnız `{hazir, kontroller:{veritabani, zamanlayici}, zamanlayiciTur, zamanlayiciHata, zamanlayiciYasSn}`.

## 3. Ölçümler (`GET /metrics`, Prometheus metin biçimi)
Erişim: **yönetici şifresiyle** (`Authorization: Bearer …`) ya da **yalnız yerel adresten**. Önünde Caddy varsa dışarıdan gelen her istek `X-Forwarded-For` taşır, bu yüzden şifresiz erişemez; Prometheus aynı makinede ise `127.0.0.1:8080/metrics`'i doğrudan tarar.

| Ölçü | Tür | Not |
|---|---|---|
| `realm_http_istek_toplam{rota,sinif}` | sayaç | sınıf: 2xx, 4xx, 5xx |
| `realm_http_sure_saniye{rota}` | histogram | kovalar 5 ms … 10 sn |
| `realm_surec_rss_bayt`, `realm_surec_heap_*` | ölçü | bellek eğrisi (sızıntı = düzleşmeyen artış) |
| `realm_olay_dongusu_gecikme_saniye{nicelik}` | ölçü | p50, p99, max; her taramada sıfırlanır |
| `realm_db_dosya_bayt` | ölçü | ana dosya (WAL hariç) |
| `realm_odeme_bekleyen`, `realm_kasa_islem_bekleyen` | ölçü | para kuyrukları |
| `realm_zamanlayici_tur_toplam`, `_hata_toplam` | sayaç | |
| `realm_zamanlayici_son_sure_saniye`, `_son_bitis_yas_saniye` | ölçü | yaş büyüyorsa tur takılmış |

Rota çeşidi en çok 80 ile sınırlıdır (fazlası `diger`), bellek ve tarama boyutu sınırsız büyümez.

## 4. Çökme ve kapanış
- **Yakalanmamış istisna / ele alınmayan söz reddi:** `ÖLÜMCÜL` satırı (hata ayrıntısıyla) yazılır, izlemeye iletilir, kısa bekleyip **çıkış kodu 1** ile süreç kapanır; systemd (`Restart=`) / Docker (`restart: unless-stopped`) temiz süreci yeniden başlatır. Bellekte tutarsız durumla yarım devam etmek para yollarında daha tehlikeli sayıldı; SQLite işlemleri atomiktir, veri kaybı olmaz. *(Eski davranış: ele alınmayan söz reddi yalnız yazılır, süreç sürerdi.)*
- **SIGTERM / SIGINT:** zamanlayıcılar durur → yeni bağlantı alınmaz → yarıdaki istekler ve çalışan dünya turu en çok 10 sn beklenir → süre dolarsa kalan bağlantılar kesilir → veritabanı en son kapanır → çıkış 0. Docker `stop_grace_period: 20s`, systemd `TimeoutStopSec=30` bunu keşmez. (Windows'ta SIGTERM yakalanmaz; mantık `server/kapanis.js` içinde doğrudan çağrılabilir ve testle sınanır.)

## 5. Uyarılar
- **E-posta:** dünya zamanlayıcısı üst üste 2 tur hata verirse `ADMIN_EMAIL`'e uyarı gider; aynı konu **saatte en çok bir** kez (`server/uyari.js`). Adres boşsa kapalıdır.
- **Prometheus kuralları:** `deploy/alarm-kurallari.yml` (10 kural: sunucu kapalı, zamanlayıcı takıldı/hata veriyor, %5xx oranı, yavaş istek, olay döngüsü, ödeme/kasa kuyruğu birikti, bellek, veritabanı boyutu). Her kuralın baktığı ölçü adı `tests/test_alarm_kurallari.mjs` ile gerçek `/metrics` çıktısına karşı denetlenir; ölçü adı değişirse test kırılır, alarm sessizce ölmez.
- **Hata izleme (isteğe bağlı):** `SENTRY_DSN` dolu ve sunucuda `npm i @sentry/node` yapılmışsa hatalar Sentry hizmetine de gider (kişisel veri ve performans izi kapalı). Paket yoksa yalnız uyarı yazılır, sunucu düşmez. Paket bilerek repo bağımlılığı değildir (üretim kurulumu küçük kalsın).

## 6. Pratik komutlar
```bash
journalctl -u realm -f -o cat | jq -c 'select(.sev=="error")'       # yalnız hatalar
journalctl -u realm -o cat | jq -c 'select(.istek=="<kimlik>")'      # bir isteğin bütün izi
curl -s http://127.0.0.1:8080/api/ready                              # hazır mı
curl -s http://127.0.0.1:8080/metrics | grep realm_zamanlayici       # zamanlayıcı nabzı
docker compose logs -f realm | jq -c 'select(.sev!="info")'
```

## 7. Bilinen sınırlar
- Ölçümler bellek içindedir; yeniden başlatmada sayaçlar sıfırlanır (Prometheus `rate()`/`increase()` bunu tanır).
- Dağıtık iz (tracing) yok: tek süreç olduğundan istek kimliği yeterli görüldü.
- Prometheus/Grafana/uyarı yöneticisi kurulumu bu depoda değildir (kullanıcı altyapısı); kural dosyası hazırdır.
