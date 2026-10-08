# ADR 0006: `gameState.js` 7994 satırdan 364'e: 20 karışıma bölündü

Tarih: 8 Ekim 2026 · Durum: **Kabul edildi, uygulandı**

## Bağlam
`GameStateManager` 254 yöntemli tek sınıftı. Tarayıcı ve sunucu aynı dosyayı kullanır; bu yüzden davranış değişmemeliydi.

## Karar
Yöntemler alan bazlı 20 dosyaya (`js/gameState/*.js`) ayrıldı ve `Object.assign(GameStateManager.prototype, …)` ile eklenir. Bu, projede zaten bulunan desendir (`js/v2/koyVeKonsey.js`); yeni bir soyutlama icat edilmedi.

## Güvence
- Bölme bir AST betiğiyle yapıldı ve **kayıpsız** doğrulandı (yöntem kümesi ve gövdeler aynı).
- **Altın kayıt testi** (`tests/altin/`): sabit saat + sabit rastgelelikle sefer, silo, bot, zindan, pazar, haftalık senaryosu; durum özetinin SHA-256'sı. Bölmeden önce üretildi, her dilimden sonra karşılaştırıldı, mutasyonla doğrulandı (kuralı bozunca test kırılıyor).

## Neden bu yol
Sınıf kalıtımı ya da bağımlılık enjeksiyonu her yöntemin `this` bağını elle yeniden kurmayı gerektirirdi (yüksek risk, düşük kazanç). Karışım, çağrı yüzeyini ve prototip zincirini aynen korur.

## Seçilmeyenler
`js/app.js` (arayüz) aynı yöntemle bölünmedi: ADR 0005.
