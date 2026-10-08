# ADR 0002: Redis / ayrı önbellek servisi eklenmez

Tarih: 8 Ekim 2026 · Durum: **Kabul edildi**

## Bağlam
İstek, "uygulama, veritabanı ve önbellek servislerinin izole çalışması" için compose yapılandırması istedi. Önbellek servisi (Redis) yalnız
birden çok uygulama sürecinin ortak durum paylaşması ya da veritabanının önünde ağ üzerinden önbellek gerektiğinde işe yarar.

## Karar
Redis (ya da benzeri) **eklenmez**. Gerekçe:
- Uygulama **tek süreç**; durum zaten süreç belleğinde (oyun motoru, hız sınırları, kapı sayımı önbelleği). Ağ üzerinden Redis'e gitmek bellek
  içi okumadan *yavaştır*.
- Veritabanı aynı süreçte gömülü (SQLite); veritabanı önünde ağ önbelleği gereksiz.
- Ek servis = ek arıza noktası, ek yedekleme, ek güvenlik yüzeyi, ek RAM; kazancı yok.
- Ölçülen gerçek darboğaz önbellekle çözülen cinsten değildi: yük testinde CPU'nun %8'i her istekte çalışan bir sayım sorgusuydu; **süreç içi 2 saniyelik
  önbellek** (kapı sayımı) ile giderildi; statik dosyalar ön-sıkıştırma + dosya bilgisi önbelleğiyle hızlandı.

## Ne zaman yeniden değerlendirilir
Birden çok uygulama süreci/makine gerektiğinde (ADR 0001'deki eşikler): o zaman hız sınırları, oturum doğrulama ve kapı sayımı için paylaşılan bir
depo (Redis ya da PostgreSQL) gerekir. Süreç içi önbellek kodu tek yerde (`server/kapi.js countsGoster`, `server/statik.js bilgi`) olduğu için
taşınması kolaydır.
