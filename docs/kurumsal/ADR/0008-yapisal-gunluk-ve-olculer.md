# ADR 0008: Gözlemlenebilirlik: JSON günlük + Prometheus metin ölçümleri, ek paket yok

Tarih: 8 Ekim 2026 · Durum: **Kabul edildi, uygulandı**

## Karar
- Günlük: tek satır JSON (`server/log.js`), gizli bilgi anahtar adına ve değere göre maskelenir; her isteğe `X-Request-Id`, o istekte yazılan her satıra `istek` alanı (AsyncLocalStorage). 500 yanıtında kullanıcıya yalnız kimlik gösterilir.
- Ölçüm: Prometheus metin biçimi (`server/metrik.js`), `/metrics` yalnız yönetici şifresiyle ya da vekilsiz yerel adresten. Rota etiketi bilinen rota anahtarıyla sınırlı (ham adres etiket olmaz).
- Sağlık: `/api/health` (canlılık) ile `/api/ready` (veritabanı + zamanlayıcı nabzı) ayrı.
- Çökme: yakalanmamış istisna/söz reddi = ölümcül; kaydet, çık (kod 1), sarmalayıcı yeniden başlatır. Eski davranış (söz reddini yazıp sürmek) bellekte tutarsız durumla para yollarında devam etmeye izin veriyordu.
- Kapanış: SIGTERM'de yarıdaki istekler ve çalışan dünya turu ≤10 sn beklenir, veritabanı en son kapanır.
- Hata izleme (Sentry) isteğe bağlı ve repo bağımlılığı değil.

## Neden
Pino/Winston/`prom-client` eklemek 3 üretim paketini (ve her biri için açık takibini) büyütürdü; ihtiyaç duyulan yüzey küçük ve test edilebilir (`tests/test_log.mjs`, `test_metrik.mjs`). Alarm kuralları ölçü adlarına testle bağlıdır: ad değişirse alarm sessizce ölmez.

## Seçilmeyenler
OpenTelemetry iz (tracing): tek süreçte istek kimliği yeterli. Dış günlük toplayıcı: altyapı tercihi sahibinindir; JSON satırı her toplayıcıya uyar.
