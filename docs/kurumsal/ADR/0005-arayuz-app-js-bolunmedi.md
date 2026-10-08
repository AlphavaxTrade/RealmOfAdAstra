# ADR 0005: `js/app.js` (arayüz) bu dönüşümde bölünmedi

Tarih: 8 Ekim 2026 · Durum: **Ertelendi (bilinçli)**

## Bağlam
`js/app.js` 8687 satır: tüm ekranlar, olay dinleyicileri, HUD, harita köprüsü tek dosyada. Sunucu tarafı dosyaları (`app.js`, `world.js`,
`gameState.js`) davranış değişmeden bölündü ve altın kayıt testiyle kanıtlandı. Arayüz için böyle bir kanıt aracı yok: ekranlar tarayıcıda
çalışır ve testler yalnız bir kısmını (stringler, hover/cursor) örter.

## Neden bölünmedi
1. Modül düzeyinde `let` ile tutulan ortak durum (`barracksActiveTab`, seçili asker, açık modal...) birçok işlevden **yeniden atanıyor**.
   ES modüllerinde içe aktarılan bir değişkene başka modülden atama yapılamaz; her bölme elle tasarım gerektirir.
2. İşlevler birbirini yoğun çağırıyor (`renderTopBar`, `showToast`, `displayModal`...) ve `window.*` üzerinden de dolaşıyor; otomatik bölme
   döngüsel içe aktarma ve sıralama hataları üretir.
3. Kazanç düşük: okunabilirlik. Risk yüksek: kullanıcıya görünen bozulma, otomatik yakalayıcı test yok.

## Kural (bölünürse)
- Yalnız saf yardımcılar ve tek başına duran ekranlar, **küçük dilimlerle**; her dilimden sonra Playwright duman testi
  (açılış, giriş, sefer başlat, sayfayı yenile, konsol hatası yok, telefon genişliği).
- Önce arayüz için küçük bir otomatik duman testi `tests/` altına alınmalı (şimdilik yalnız elle/betikle deneniyor).
- Eşzamanlı olarak telefon-öncelikli arayüz yeniden tasarımı planlandığı için (bkz. `docs/v2/DURUM_2026-10-07.md` "Kalanlar") bölme,
  yeniden tasarımla birlikte yapılmalı; ikisi ayrı yapılırsa iş iki kez yapılır.
