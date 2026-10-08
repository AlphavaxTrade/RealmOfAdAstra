# ADR 0001: Veritabanı SQLite (tek dosya, WAL), bağlantı havuzu yok, PostgreSQL'e geçiş eşikleri

Tarih: 8 Ekim 2026 · Durum: **Kabul edildi** · İlgili: ADR 0002 (Redis yok), `docs/kurumsal/PERFORMANS.md`, `docs/kurumsal/SEMA.md`

## Bağlam
Sunucu tek bir Node süreci. Oyun durumu, hesaplar, ödemeler tek yerde tutuluyor. İstek "bağlantı havuzu (connection pooling) ve N+1
düzeltmesi" diyordu; bunlar istemci-sunucu veritabanları (PostgreSQL/MySQL) için anlamlı kavramlardır. Burada durum farklı.

## Karar
1. **SQLite (`node:sqlite`), tek dosya, WAL modu** kalır.
2. **Bağlantı havuzu eklenmez.** Sürecin tek bir bağlantısı vardır ve işlemler `DatabaseSync` ile *eşzamanlı* (senkron) çalışır; iki istek
   hiçbir zaman aynı anda veritabanında olmaz. Havuz, yazma hızını artırmaz (SQLite tek yazar kabul eder), yalnızca karmaşıklık ekler.
   Gerçek eşzamanlılık koruması: `busy_timeout=5000` (yedek betiği gibi *başka bir süreç* yazarken oyun hata vermek yerine bekler).
3. **N+1 sorunu aranmış ve bulunmamıştır.** Sorgu planı denetimi (`npm test`'te `test_sorgu_plani`) 134 sabit sorgunun hepsini
   inceler; yalnız gerekçesi yazılı 12 sorgu tabloyu baştan sona tarar. Haftalık hesaplaşma (en ağır oyuncu-başına döngü) **doğrusal**
   ölçeklenir: 500 oyuncu 117 ms, 2.000 → 297 ms, 5.000 → 841 ms (`scripts/yuk/hafta-olcum.mjs`).
4. **İndeksler kanıtla eklendi** (geçiş 004, 18 indeks): oturum/nonce/e-posta bağlantısı temizliği, kapı sayımı, ödeme/yatırma/Kasa kuyrukları.
5. **Saklama süresi:** olaylar 90 gün, fiyat örnekleri 400 gün, Kolezyum maçları son 5.000; ödeme ve yatırma kayıtları **hiç silinmez**.

## Neden SQLite (ve PostgreSQL değil)
- Ölçülen kapasite: tek çekirdekte ≈ 800 `GET /api/state`/sn ve ≈ 700 karma istek/sn; istemci 20 sn'de bir eşitler → ≈ 14.000–16.000
  eşzamanlı oyuncu. Ürünün ilk yılı hedefi 50–1.000 oyuncu: ölçeğin çok altında.
- Yedekleme: tek dosya + `backup()` ile tutarlı kopya (Aşama 9); ayrı bir veritabanı sunucusu işletmek yok.
- Bellek: 30 dakikalık yükte (500 oyuncu, 100 eşzamanlı bağlantı) sunucu RSS ≈ 229 MB, GC sonrası heap ≈ 23 MB: 16 GB'ın çok altında.

## PostgreSQL'e geçiş eşikleri (bunlardan BİRİ aşılırsa yeniden değerlendir)
| Eşik | Neden |
|---|---|
| Kalıcı olarak > 5.000 eşzamanlı aktif oyuncu ya da `/api/state` p95 > 250 ms (yük testi ayarıyla) | Tek çekirdek tavanı; çok süreç gerekir, SQLite çok süreçli yazmaya uygun değil |
| Olay döngüsü kullanımı (ELU) normal trafikte > 0,7 sürekli | Aynı |
| Birden çok sunucu/yedeklilik (yüksek erişilebilirlik) istenirse | Tek dosya iki makinede yazılamaz |
| Veritabanı dosyası > ~20 GB ya da `VACUUM`/yedek süresi bakım penceresine sığmazsa | Dosya tabanlı yedeğin pratik sınırı |
| Analitik/raporlama için eşzamanlı ağır okuma gerekirse | Okuma replikası gerekir |

Geçiş yolu açık: veri erişimi `db.q` / `db.raw` arkasında; şema `server/gecis/` içinde SQL olarak numaralı. `kv` tablosu (oyuncu kayıtları JSON)
PostgreSQL'e `jsonb` olarak taşınabilir.
