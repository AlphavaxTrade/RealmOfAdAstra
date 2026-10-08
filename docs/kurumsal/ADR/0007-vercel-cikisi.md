# ADR 0007: Vercel yolu emekli; sunucu kendi alan adından her şeyi sunar

Tarih: 8 Ekim 2026 · Durum: **Kısmen uygulandı** (kod hazır, alan adı/trafik taşıması sahibinin işi)

## Bağlam
Oyunun statik dosyaları `realmofadastra.vercel.app` adresinden, API ise ayrı bir sunucudan geliyordu (`CORS_ORIGINS`). Bu, oturum anahtarının `localStorage`'da kalmasının (ADR 0004) ve CORS yapılandırmasının sebebiydi.

## Karar
- Üretim yolu: tek sunucu hem `dist/` dosyalarını (ön sıkıştırılmış, doğru önbellek başlıklarıyla) hem API'yi sunar (`SERVE_DIST=1`, varsayılan). Aynı kaynak olduğu için CORS gerekmez.
- `scripts/vercel-yukle.mjs` "kullanımdan kaldırıldı" işaretlendi, silinmedi (silme yalnız sahibinin onayıyla; aday listesinde).
- `CORS_ORIGINS` ayarı, geçiş sürerken eski adresin çalışmaya devam etmesi için duruyor.

## Sonuç ve açık iş
Alan adı tek kaynağa taşınınca ADR 0004 sözü uygulanır: HttpOnly çerez + `Origin` denetimi, gövdede anahtar yok. Bu iş **yapılmadı** (çapraz kaynak çalıştığı sürece çerez kırılgan olur); tetikleyici: Vercel adresinin kapatılması.
