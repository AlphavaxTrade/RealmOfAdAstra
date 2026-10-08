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
