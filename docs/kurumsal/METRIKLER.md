# Kurumsal dönüşüm: metrik tablosu

Her aşamanın başında ve sonunda doldurulur. "Önce" sütunu 8 Ekim 2026'da, `kurumsal` dalı açılırken ölçüldü
(Windows 11, Node 24.18.1, npm 11.16.0).

| Metrik | Önce (Aşama 0) | Aşama 1 | Aşama 2 | Aşama 3 | Aşama 4 | Aşama 5 | Aşama 6 | Aşama 7 | Aşama 8 | Aşama 9 | Aşama 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Test dosyası (geçen/toplam) | 76/76 | | | | | | | | | | |
| `npm test` süresi | 50,6 sn | | | | | | | | | | |
| Kapsam (satır, `server/`) | ölçülmüyor | | | | | | | | | | |
| `npm run build` süresi | 9,3 sn | | | | | | | | | | |
| `dist/` boyutu | 14 MB (en büyük parça: phaser 1,46 MB, gzip 335 KB) | | | | | | | | | | |
| `node_modules` | 584 MB | | | | | | | | | | |
| `npm audit` (tümü) | 42 (2 düşük, 9 orta, 26 yüksek, 5 kritik) | | | | | | | | | | |
| `npm audit --omit=dev` | 31 (1 düşük, 8 orta, 18 yüksek, 4 kritik)* | | | | | | | | | | |
| Docker imaj boyutu | ölçülemedi (Docker bu makinede kurulu değil) | | | | | | | | | | |
| Yük testi p95 / bellek | ölçülmedi | | | | | | | | | | |
| Büyük dosyalar (satır) | `js/app.js` 8687, `js/gameState.js` 7994, `server/world.js` 732, `server/app.js` 495 | | | | | | | | | | |

\* `--omit=dev` sayımı `ganache`/`webpack` gibi yalnız test araçlarını da içeriyor (`npm ls webpack --omit=dev` boş döner).
Gerçekte üretimde çalışan yüksek riskli paket şimdilik `nodemailer@6.10.1` (doğrudan bağımlılık). Ayıklama Aşama 2'de.

## Ortam notları
- Docker kurulu değil: imaj derleme ve yük testi imaj içinde yapılamaz; CI'da (Aşama 8) ve kurulunca ölçülecek.
- `server/.env.example` dosyası Claude'un okuma izninde engelli (`.claude/settings.json` içindeki `Read(**/.env.*)` kuralı).
