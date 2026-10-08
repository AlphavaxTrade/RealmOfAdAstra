# Kurumsal dönüşüm: metrik tablosu

Her aşamanın başında ve sonunda doldurulur. "Önce" sütunu 8 Ekim 2026'da, `kurumsal` dalı açılırken ölçüldü
(Windows 11, Node 24.18.1, npm 11.16.0).

| Metrik | Önce (Aşama 0) | Aşama 1 | Aşama 2 | Aşama 3 | Aşama 4 | Aşama 5 | Aşama 6 | Aşama 7 | Aşama 8 | Aşama 9 | Aşama 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Test dosyası (geçen/toplam) | 76/76 | 76/76 (1 test eklendi: Rıhtım) | | | | | | | | | |
| `npm test` süresi | 50,6 sn | 46,7 sn | | | | | | | | | |
| Kapsam (satır, `server/`) | ölçülmüyor | ölçülmüyor | | | | | | | | | |
| `npm run build` süresi | 9,3 sn | 8,9 sn | | | | | | | | | |
| `dist/` boyutu | 14 MB (en büyük parça: phaser 1,46 MB, gzip 335 KB) | 14 MB (değişmedi) | | | | | | | | | |
| Üretim kurulumu (`npm ci --omit=dev`) | 584 MB (three, phaser dahil, ayrım yoktu) | **25 MB**, 38 paket | | | | | | | | | |
| Geliştirme kurulumu (`node_modules`) | 584 MB | 584 MB (+knip) | | | | | | | | | |
| `npm audit` (kilit dosyasının tamamı) | 42 (2 düşük, 9 orta, 26 yüksek, 5 kritik) | 42 | | | | | | | | | |
| **Gerçek üretim açığı**\* | (ölçülmemişti) | **1 yüksek** (`nodemailer`) | | | | | | | | | |
| Docker imaj boyutu | ölçülemedi (Docker kurulu değil) | ölçülemedi | | | | | | | | | |
| Yük testi p95 / bellek | ölçülmedi | ölçülmedi | | | | | | | | | |
| Kullanılmayan dosya (knip) | ölçülmemişti | 0; kullanılmayan paket 0; gereksiz dışa açılmış fonksiyon 18 | | | | | | | | | |
| Büyük dosyalar (satır) | `js/app.js` 8687, `js/gameState.js` 7994, `server/world.js` 732, `server/app.js` 495 | aynı | | | | | | | | | |

\* `npm audit --omit=dev` bu projede **yanıltıcı**: ganache'ın içine gömülü paketler kilit dosyasında üretim gibi işaretli,
bu yüzden 31 uyarı gösterir (webpack, mocha vb.), oysa bunlar üretimde kurulu değil. Doğru ölçüm: yalnız üretim
bağımlılıklarından (`ethers`, `nodemailer`, `qrcode`) kilit dosyası üretip denetlemek. Sonuç: 39 paket, **1 yüksek açık**.
CI'daki denetim (Aşama 8) bu yöntemi kullanacak.

## Ortam notları
- Docker kurulu değil: imaj derleme ve yük testi imaj içinde yapılamaz; CI'da (Aşama 8) ve kurulunca ölçülecek.
- `server/.env.example` dosyası Claude'un okuma izninde engelli (`.claude/settings.json` içindeki `Read(**/.env.*)` kuralı).

## Aşama ölçüm günlüğü (her aşama sonunda eklenir; tablo Aşama 10'da tamamlanır)

| Aşama | Test dosyası | `npm test` | Lint | Üretim açığı | Not |
|---|---|---|---|---|---|
| 0 (başlangıç) | 76/76 | 50,6 sn | yok | 1 yüksek (nodemailer) | |
| 1 | 76/76 | 46,7 sn | yok | 1 yüksek | üretim kurulumu 584 → 25 MB |
| 2 | **86/86** | 76 sn (fuzz + güçlü-parola testleri eklendi) | 0 hata / 94 uyarı (tavan 94) | **0** | parola özeti ≈ 370 ms (iş parçacığı havuzunda, sunucuyu bloklamaz; 4 paralelde olay döngüsü boşluğu 24 ms) |
| 3 | **94/94** (+ altın kayıt, config, db, başlatma kilitleri, HTTP hataları, zincir, ödeme kuyruğu...) | ≈122 sn (kapsam ölçümüyle ≈157 sn) | 0 hata / 94 uyarı | 0 | **Kapsam: satır %88,9 → %89,9, dal %65,6 → %67,5**; `server/app.js` 495→252, `server/world.js` 732→129, `js/gameState.js` 7994→364 satır; knip tamamen temiz; `js/app.js` bilinçli ertelendi (ADR 0005) |
| 4 | 98/98 (+ yük aracı, kapı önbelleği, statik sıkıştırma) | ≈130 sn | 0 hata / 94 uyarı | 0 | Durum ucu +%38, karma yük +%31 hızlandı (kapı sayımı önbelleği, ön-sıkıştırılmış statik dosya); 30 dk dayanıklılık: 0 hata, RSS düz (~229 MB), heap eğimi ikinci yarıda 1,2 MB/sa; ayrıntı `PERFORMANS.md` |
| 5 | 103/103 (+ geçişler, sorgu planı kapısı, saklama süresi) | ≈140 sn | 0 hata / 94 uyarı | 0 | Dağınık `CREATE/ALTER` → mühürlü `server/gecis/` (4 geçiş), 18 indeks (her biri `EXPLAIN QUERY PLAN` kanıtlı), olay 90 gün / fiyat 400 gün / PvP son 5000 maç saklama, PRAGMA ayarı; belge `SEMA.md`, ADR 0001-0002 |
| 6 | 103/103 (+ ortam belgesi, dağıtım politikası) | ≈140 sn | 0 hata / 94 uyarı | 0 | 53 ortam değişkeninin hepsi belgeli (kayma korumalı), `*_FILE` gizli bilgi, üretim doğrulaması; Dockerfile (3 aşama, kök değil), salt okunur/yetkisiz compose, Caddy, sertleştirilmiş systemd; **imaj derlenemedi (Docker yok)**, yerel üretim kopyası 10 kontrolle açıldı (36,6 MB) |
| 7 | **111/111** (+ günlük, kapanış, metrik, uyarı, izleme, ölümcül hata, gözlem uçları, alarm kuralları) | ≈145 sn (kapsam ölçümüyle ≈172 sn) | 0 hata / 94 uyarı | 0 | **Kapsam: satır %90,26, dal %68,83** (eşikler yukarı çekildi, yeni 6 modül ≥%98); JSON günlük + gizli bilgi maskeleme, istek kimliği, `/api/ready`, `/metrics` (10 ölçü ailesi), düzgün kapanış, ölümcül hata → çıkış 1, 10 alarm kuralı (ölçü adları testle bağlı); belge `GOZLEM.md` |
| 8 | 113/113 (+ CI dosyaları politikası) | ≈120 sn (kapsam ölçümüyle) | 0 hata / 94 uyarı | 0 | Yerel kapı `npm run hizli` 15 sn (kanca her commit'te çalışır), `npm run kontrol` = CI'ın 7 kapısı; CI 5 iş (kalite, test+kapsam, derleme, güvenlik = üretim açığı + gitleaks, imaj + Trivy), elle GHCR yayını, dependabot, CODEOWNERS, dal koruma komutları; **iş akışları GitHub'da çalıştırılamadı** (yalnız YAML + politika testi) |
| 9 | **113/113** (+ 13 yedekleme senaryosu) | ≈120 sn | 0 hata / 94 uyarı | 0 | **Kapsam: satır %90,37, dal %69,17**; tutarlı yedek (SQLite backup API, yazma sürerken), sha256+manifest, AES-256-GCM, saatlik 48/günlük 14/haftalık 8, sonrası komutu (gizli anahtarsız), geri yükleme tatbikatı (ödemeler otomatik durur, eski dosya saklanır, çalışan sunucuya karşı korumalı), yedek yaşı ölçüsü + 3 alarm; üretim ağacında çalışan sunucudan yedek+derin doğrulama geçti (12/12); **yedek sonrası zincire giden ödemeler için otomatik uzlaştırma aracı YOK** (belgede elle adımlar) |
