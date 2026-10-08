# ADR 0003: Paketleme: Docker imajı ve Docker'sız systemd, ikisi de desteklenir

Tarih: 8 Ekim 2026 · Durum: **Kabul edildi**

## Bağlam
Sunucu tek bir Node süreci ve tek bir SQLite dosyasıdır. Sahibi yazılımcı değil; çalıştırma yolu "az parça, geri alınabilir, bozulursa nedeni yazan" olmalı. Geliştirme makinesinde Docker kurulu değil.

## Karar
1. **Docker (önerilen):** 3 aşamalı `Dockerfile` (derle → yalnız üretim bağımlılıkları → çalışma), kök olmayan kullanıcı, salt okunur kök dosya sistemi, tüm Linux yetkileri kapalı, `no-new-privileges`, bellek/süreç sınırı, yalnız `127.0.0.1` yayını, sağlık denetimi, `stop_grace_period: 20s`. Caddy ve yedek ayrı profiller (`https`, `yedek`).
2. **systemd (Docker'sız):** aynı sertleştirmenin systemd karşılığı (`ProtectSystem=strict`, `NoNewPrivileges`, `LoadCredential`...). `MemoryDenyWriteExecute` bilerek AÇIK DEĞİL (V8 JIT yazılabilir+çalıştırılabilir bellek ister).
3. Gizli bilgi iki yolda da **dosyadan** (`*_FILE`): Docker secrets / `LoadCredential`.

## Neden
- Docker olmadan da çalışabilmek bağımlılığı azaltır (AWS kutusunda zaten systemd+Caddy ile çalışan düzen var).
- İkisi aynı kodu ve aynı ayarları kullanır; fark yalnız sarmalayıcıdır. Politika testi (`tests/test_docker_dosyalari.mjs`) iki paketin ilkelerini ayrıştırıp denetler.

## Seçilmeyenler
- **Kubernetes:** tek süreç/tek yazan SQLite için gereksiz karmaşıklık; yatay ölçek zaten ADR 0001/0002 sınırlarına takılır.
- **PM2/forever:** systemd/Docker yeniden başlatma görevini zaten yapıyor; ek katman.

## Doğrulama durumu (8 Ekim 2026)
Geliştirme makinesinde Docker yok; imaj ilk kez GitHub Actions'ta (Linux) derlendi ve **iki gerçek hata yakaladı**: derleme aşamasında `server/actions.js` kopyalanmamıştı (tarayıcı kodu içe alıyor) ve taban imajda/npm içinde 14 düzeltilmiş açık vardı (Trivy). İkisi de giderildi: son CI koşusunda imaj derlendi ve Trivy (HIGH/CRITICAL, düzeltmesi olan) temiz çıktı. Çalışma imajından kullanılmayan npm/yarn/corepack silinir.
**Hâlâ denenmemiş:** imajdan bir KAPSAYICI başlatmak (sağlık denetimi, salt okunur dosya sistemi, `yedek` servisi). Aynı kod gerçek süreç olarak ve üretim klasöründe denendi (`scripts/uretim-kopya-dene.mjs`); kapsayıcı içi ilk çalıştırma Docker kurulu bir makinede yapılmalı.
