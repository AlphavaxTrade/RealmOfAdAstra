# Performans ve yük testi raporu (Aşama 4, 8 Ekim 2026)

## Nasıl ölçüldü
`npm run yuk` (`scripts/yuk/yuk.mjs`): gerçek bir sunucu **süreci** (TEST_MODE, geçici veritabanı, hız sınırları kapalı, parola özeti hafif)
kaldırır, N sanal oyuncu açar (kayıt + e-posta doğrulama), senaryoları M eşzamanlı bağlantıyla koşturur. Sunucuya `--import` ile takılan
ölçüm kancası (`scripts/yuk/olcum-kancasi.mjs`) 2 sn'de bir **GC sonrası heap**, RSS, olay döngüsü gecikmesi ve kullanımını yazar; sunucu koduna dokunulmaz.
CPU profili: `--cpu-prof` + `node scripts/yuk/cpu-ozet.mjs <klasör>`.

- Makine: Windows 11, 12 mantıksal çekirdek, 40 GB RAM, Node 24.18. **Yük üretici ve sunucu aynı makinede** (sunucu tek çekirdek kullanır).
- 16 GB hedefi: Docker bu makinede yok, bu yüzden bellek sınırı `--max-old-space-size=12288` ile taklit edildi; imaj içi sınır (`mem_limit: 12g`) CI/Docker kurulunca ölçülecek.
- Senaryolar: `health` (boş uç), `state` (`GET /api/state`), `aksiyon` (`POST /api/action`, 10 farklı işlem), `karma` (%50 state, %40 işlem, %10 diğer), `statik` (ana sayfa + 1,46 MB phaser).

## Sonuçlar: önce / sonra (300 oyuncu, istek/sn · p50 gecikme ms)
| Senaryo | Bağlantı | Önce | Sonra | Değişim |
|---|---|---|---|---|
| health | 50 | 2.743 · 16 | 2.844 · 15 | ≈ aynı |
| **state** | 50 | 596 · 77 | **823 · 60** | **+%38**, gecikme −%22 |
| **state** | 500 | 639 · 779 | **828 · 598** | **+%30**, gecikme −%23 |
| aksiyon | 50 | 551 · 88 | (karma içinde ölçüldü) | |
| **karma** | 50 | 547 · 82 | **717 · 66** | **+%31** |
| **karma** | 500 | 575 · 856 | **722 · 683** | **+%26** |
| statik | 50 | 315 · 141 | 315 · **34** | medyan gecikme −%76 (baytlar 4× küçüldü) |

2.000 eşzamanlı bağlantıda da (önce): **0 hata**, süreç çökmedi, RSS en çok 427 MB; gecikme yalnızca kuyruk yüzünden uzar (sunucu tek çekirdekte doyar, bağlantı sayısı
verimi artırmaz, bekleme süresini artırır).

## Bulgular ve düzeltmeler (ölçüme dayalı; tahmin yok)
1. **`kapi.counts` (CPU'nun %8'i):** her `/api/state` ve işlem yanıtı "kaç vatandaş / kaç sıra" sorgusunu çalıştırıyordu; tablo oyuncu sayısıyla büyüdükçe doğrusal yavaşlar
   (300 oyuncuda ≈270 µs/istek; 5.000 oyuncuda ≈4 ms). Çözüm: yalnız **ekranda gösterilen** sayılar için 2 sn'lik önbellek, kapıyı değiştiren her yazmada anında
   geçersiz kılma; **karar veren** yollar (`admit`, `fillSeats`) kesin sayımda kalır (`tests/test_kapi_onbellek.mjs`).
2. **Statik dosyalar:** phaser 1,46 MB her ziyaretçiye ham gidiyordu ve her istekte eşzamanlı `existsSync/statSync` vardı. Çözüm: derlemede ön-sıkıştırma
   (`scripts/sikistir.mjs`: phaser 1,46 MB → 266 KB brotli / 333 KB gzip, three 614 KB → 128 KB), `Content-Length`, 5 sn dosya bilgisi önbelleği,
   bayat `.br/.gz` koruması (`tests/test_statik_sikistirma.mjs`).
3. **Sorgu planı:** 134 sabit sorgunun hepsi `EXPLAIN QUERY PLAN` ile tarandı (`npm test`'te kapı olarak); büyüyen tablolardaki tam taramalar için 18 indeks eklendi (geçiş 004); kalan 12 tarama
   gerekçeli (`scripts/db/tarama-izin.json`).
4. **Haftalık hesaplaşma (en ağır oyuncu başına döngü) doğrusal:** 500 oyuncu 117 ms, 2.000 → 297 ms, 5.000 → 841 ms. N+1 sorunu yok.
5. **Parola özeti** (güçlü ayar) ≈ 370 ms ama iş parçacığı havuzunda: 4 eşzamanlı özet sırasında olay döngüsü boşluğu 24 ms (sunucu bloklanmıyor).

Sıradaki CPU dağılımı (state, düzeltmelerden sonra): JSON yanıtı üretme ≈%15, soket yazımı ≈%9, oyuncu kaydı okuma/yazma+JSON çözme ≈%20, kimlik doğrulama ≈%4 — **tek bir baskın nokta kalmadı**.
Bilinçli olarak yapılmayan: oyuncu kaydı için bellek içi önbellek (yazma-yanında tutarlılık riski, kazanç sınırlı), `worldSnapshot` önbelleği (oyuncunun kendi işleminden sonra bayat piyasa görmesi riski).

## Dayanıklılık (30 dakika, 500 oyuncu, 100 eşzamanlı bağlantı, karma senaryo)
| Ölçüt | Sonuç |
|---|---|
| Hata | **0** (≈1,1 milyon istek) |
| İstek/sn | ort. 629 (min 534 – maks 674; düşüşler aynı makinede paralel yaptığım testlerden) |
| p95 gecikme | ≤ 267 ms |
| RSS | 104 → 229 MB, son 25 dk düz (**229 MB**) |
| Heap (GC sonrası) | 18,5 → 23,3 MB; eğim: ilk yarı 1,9 MB/saat, ikinci yarı **1,2 MB/saat** |
| Olay döngüsü | tam doygunlukta (yük üretici sunucuyu %100 meşgul tutuyor) |

**Yorum (dürüst sınır):** 30 dakikada doğrusal bir sızıntı görünmüyor; eğim yarıya düşüyor (önbellek dolması, oyuncu kayıtlarının büyümesi). Ancak 30 dakika, yıllık bir sızıntıyı
dışlamaya yetmez. Bu yük gerçekçi değil (oyuncu başına saniyede ≈1,2 işlem; gerçek oyuncu ≈ 20 sn'de bir eşitler). Önlem: üretimde bellek/heap eğimi `/metrics` ile izlenir ve uyarı kuralı
vardır (Aşama 7); 6-24 saatlik gece koşusu CI'da zamanlanabilir (`npm run yuk -- --soak=86400`).

## Kapasite
Tek çekirdekte ≈ 820 `GET /api/state`/sn, ≈ 720 karma istek/sn. İstemci 20 sn'de bir eşitler (`js/net/online.js`) ve oyuncu başına gerçek işlem nadirdir → **≈ 14.000+ eşzamanlı oyuncu / çekirdek**
(ürünün ilk yıl hedefi 50–1.000). Ölçekleme sınırı ve PostgreSQL'e geçiş eşikleri: ADR 0001.

## Yeniden ölç
```
npm run build
npm run yuk -- --oyuncu=300 --baglanti=50,500 --sure=8 --senaryo=state,karma,statik        # hızlı matris
npm run yuk -- --oyuncu=500 --baglanti=100 --soak=1800                                      # 30 dk dayanıklılık
npm run yuk -- --oyuncu=300 --baglanti=50 --sure=15 --senaryo=state --cpu-prof              # CPU profili
node scripts/yuk/hafta-olcum.mjs 500,2000,5000                                              # haftalık hesaplaşma ölçeklenmesi
```
