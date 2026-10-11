# Eski kod (Gemini dönemi) temizliği: ölçüm, plan ve ilerleme

Başlangıç: 11 Ekim 2026, kullanıcı isteği ("Gemini Flash dönemi kod ve veriler sağlıksız olabilir; projeyi Claude dönemi sürümle temiz sürdürelim").
Dal: `temiz-baslangic` (ayrı dal, `guncel`'e kullanıcı onayıyla birleşir). Hiçbir şey kanıtsız silinmez.

## Kural: "kanıt kapısı"
Bir kod parçası ancak şunlar sağlanınca silinir ya da yeniden yazılır:
1. Yerine geçen şey (ya da silinmesinin zararsızlığı) bir testle gösterilir; test silinerek zayıflatılmaz.
2. `npm test` tam geçer, `tests/altin/` altın kayıt değişmez (ya da değişim bilerek ve açıklanarak yenilenir; yalnız metin/oyuncu özeti farkı kabul edilir).
3. Arayüze dokunan işlerde `scripts/tarayici/ekranlar.mjs` ve `scripts/tarayici/v3.mjs` temiz çıkar.
4. İlerleme sayıyla izlenir: `node scripts/eski-kod-olc.mjs` (sınır 29 Eylül 2026 = Claude dönemi başlangıcı).

## Ölçüm yöntemi
`git blame` ile her satırın en son hangi tarihte değiştiğine bakılır; sınırdan önceki ve o günden beri hiç dokunulmamış satır "eski"dir. Üretilmiş/üçüncü taraf dosyalar (package-lock, openapi, altın kayıt) sayılmaz. "Eski = kötü" değildir: tarih yalnız "kimse okumamış olabilir" işaretidir. Ölçer salt okurdur.

## Sayılar
| | Eski satır | Yeni satır | Eski oranı |
|---|---|---|---|
| Başlangıç (11 Ekim, öğle) | 20.792 | 76.332 | %21 |
| Dalga A sonrası | 19.038 | 76.348 | %20 |

Klasör bazında (Dalga A sonrası): js %37, css %64, tests %28, docs %3, scripts %1, server/contracts/deploy/public %0.

## Dalga A (yapıldı): ölü kod ve eski belgeler
| İş | Sonuç |
|---|---|
| Ölü CSS (`scripts/olu-css.mjs`, kalıcı araç) | Seçicisindeki sınıf/kimliği oyunun HTML ve JS metninde hiç geçmeyen 258 kural ve 14 kullanılmayan `@keyframes` silindi (≈ 1.700 satır; 2. tur sıfır buldu) |
| Kullanılmayan değişken/import/işlev (lint) | `app.js` (3 ölü işlev + 12 değişken), `battleArena`, `hasat`, `ozet`, `grandTownScene`, `online`, `limits`, `koyVeKonsey`, `server/app.js`, `generate_doc_tables`; testlerde 45 kullanılmayan bağ (`scripts/kullanilmayan-sil.mjs`, kalıcı araç) |
| Lint tavanı | 94 → 13 uyarı (kalan 13 güvenlik eklentisinin bilerek bırakılmış `RegExp`/zamanlama notları) |
| Eski rehber kutusu kalıntısı | Görevler eylemi artık Krallık Yolu panelini açıyor (eski "genişlet" durumu silindi) |
| Eski belge | `docs/GAME_DESIGN_AND_ECONOMY_WHITEPAPER.md` → `docs/arsiv/` ("geçerli değil" notuyla) |
| Eski testler | **Silinmedi**: hepsi geçiyor; hangi eski davranışı sabitlediği Dalga B/C'de her modülle birlikte gözden geçirilir |

Kalan eski satırların çoğu **canlı** koddur (CSS'in kalanı JS'in kullandığı sınıflardır). Bundan sonrası yeniden yazım işidir.

## Dalga B (sıradaki, orta risk): ekran şablonları
Hedef: `js/app.js` (8.400 satır, %74 eski) ekran ekran v3 bileşenlerine taşınır ve modüllere bölünür; her ekran bitince eski şablonu silinir.
Sıra (kullanıcıya en görünür olandan): Pazar (al-sat, ilan, P2P), Karakter/Envanter, Taverna, Demirhane geri kalanı, Kolezyum paneli, Sandıklar/koleksiyon, Ekonomi panosu, sürüm geçmişi.
Her ekran için: davranışı sabitleyen test (gerekirse önce yazılır), `ekranlar.mjs` temiz, eski şablon + ölü CSS silinir (`olu-css.mjs` her adımda koşar).
Hedef bitiş durumu: `app.js` < 2.500 satır (yalnız bağlantı kodu), ekranlar `js/ui/ekranlar/*.js`.

## Dalga C (zor, en son): savaş çekirdeği ve veri
| Dosya | Eski | Test | Plan |
|---|---|---|---|
| `js/combat.js` (savaş motoru) | %98 | 3 test + altın kayıt | Önce özellik testleri: aynı tohum aynı sonuç, can korunumu, hasar sınırları, NaN yok, yetenek sırası. Sonra okunup sadeleştirilir; eski sürüm referans olarak yeni ile aynı sonucu verene kadar durur |
| `js/battleArena.js`, `css/battle-arena.css` | %75 / %94 | 1 | Yalnızca oynatıcıdır (sonuç hesaplamaz); v3 sonuç kartı zaten yeni. Kalan: arena düzeni telefonda yeniden çizilir |
| `js/dungeonScene.js` | %90 | 1 | Etiketler yenilendi; kalan: levha konumları veriden okunur (şu an sabit oranlar), arka plan resmi taşması |
| `js/config.js` | %53 | 5+ | Sayı tabloları `docs/v2/KARARLAR_KESIN.md` ile satır satır karşılaştırılır; sürüm geçmişi (CHANGELOG, ~600 satır) ayrı dosyaya taşınır |
| `js/globalPool.js`, `js/ammMarket.js`, `js/treasury.js` | %62 / %71 / %58 | 28-36 test | Zaten v2'ye dönüştürüldü ve çok testli; yalnız okunmamış bölümler gözden geçirilir |

Veri: kayıt okuyucu (`loadState`) eski kayıt alanlarını yeni alanlarla birleştirir, bozuk kaydı yedeğe alır; 17 resim (`public/assets/*.jpg`: zindan haritaları, canavarlar, asker) oyunda kullanılıyor ve **silinmez** (istenirse Gemini görsel aracıyla yenilenebilir, ayrı iş).

## İzleme
`node scripts/eski-kod-olc.mjs --json olcum.json` her dalga sonunda koşar; sayılar bu tabloya işlenir.
