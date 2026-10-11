# Eski kodun baştan yazımı: günlük (11 Ekim 2026)

Karar (kullanıcı): 29 Eylül 2026 öncesinden kalan kodun tamamı baştan yazılır; eski koda güvenilmez.
Ölçüm: `node scripts/eski-kod-olc.mjs` (git blame, sınır 2026-09-29).

## Yöntem (her modül için aynı)

1. **Eski davranışı dondur:** modülün eski sürümüyle rastgele ama tohumlu senaryolar koşulur, sonuç özetleri
   `tests/altin/*` altında altın kayıt olarak saklanır (yalnız eski kod bunu üretmiş olur).
2. **Yeni modülü temiz yaz:** aynı dışa açık işlev adları, aynı rastgele sayı sırası, ölü parçalar yok.
3. **Birebir eşleşme:** yeni modül altın kayıtla aynı sonucu vermeden kabul edilmez. Fark varsa ya hata düzeltilir
   ya da fark bilerek kabul edilir ve aşağıya "karar bekleyen" olarak yazılır.
4. **Tam test takımı + build + lint**, sonra commit. Eski dosya git geçmişinde durur.

Bilinen bir hatayı yeniden yazım sırasında sessizce düzeltmem: oyun dengesini değiştiriyorsa karar kullanıcıya gider.

## Yazılanlar

| Modül | Durum | Kanıt |
|---|---|---|
| `js/combat.js` (savaş motoru) | Yeniden yazıldı | `tests/test_savas_motoru_altin.mjs`: 1.500 savaş eski motorla birebir aynı |
| `js/treasury.js` (hazine defteri) | Yeniden yazıldı | `tests/test_ekonomi_cekirdegi_altin.mjs`: 4.000 işlem, her adımda üç modülün tüm durumu birebir aynı |
| `js/ammMarket.js` (pazar motoru) | Yeniden yazıldı | aynı test; kullanılmayan 6 yöntem kaldırıldı |
| `js/globalPool.js` (küresel havuz, UBI, kota) | Yeniden yazıldı | aynı test; kullanılmayan 5 yöntem kaldırıldı |
| `js/gameState.js` (oyuncu durumu çekirdeği) | Yeniden yazıldı | tam oyun altın kaydı (21 adım) değişmedi |

### combat.js: kaldırılanlar
- **Kat etkisi (`modifier`)**: hiçbir yerden çağrılmıyordu (zindan hiç vermiyor; `config.js`'teki `DUNGEON_MODIFIERS` "henüz bağlı değil").
- **`element`, `revivedOnce`, `cooldowns`**: hiçbir yerde okunmuyordu (bir test `cooldowns`'u sabitliyordu; test gerçek alanı denetleyecek şekilde düzeltildi).
- `applyDamage`'in `canCrit` seçeneği: kimse kapatmıyordu.
- Birim kimliği artık `Math.random` yerine sayaçla üretiliyor (aynı çalışmada tekrarlanabilir).
- `predictBattle` isteğe bağlı `seedBase` alıyor (verilmezse eskisi gibi saat tohumu).
- "Son Nefes" açıklaması %20 diyordu, kod %25 uyguluyor: **metin** koda uyduruldu (davranış aynı).

## Karar bekleyen bulgular (davranışı değiştirir, bu yüzden dokunulmadı)

1. **Öfke sayacı büyümüyor.** Oyun "düşman her tur güçleniyor" diyor, ama 12. turdan sonra düşmana her tur aynı
   `rage` durumu (`stackable:false`) eklendiği için güç `+%18`'de sabit kalıyor (`RAGE_PER_ROUND`). Uzayan savaşlar
   metnin söylediğinden kolay. Düzeltmek zindan denge sayılarını değiştirir.
2. **Düşman tarafındaki oyuncu birimleri yeteneklerini kullanmıyor.** Motor yeteneği "müttefik" ise `skills`,
   "düşman" ise `abilities` alanından okuyor. Kolezyum rakibi (`skills: ['shieldWall','shockwave']`) ve gerçek PvP'de
   karşı taraf yalnız düz saldırı yapıyor. Düzeltmek kolezyum/PvP dengesini değiştirir.
3. **Hazır durumlar hiçbir yetenekten gelmiyor:** `burn`, `poison`, `haste`, `chill`, `weaken` motorda işleniyor
   ama onları üreten yetenek yok (Sahra Merhemi yalnız temizliyor). Ya yetenek eklenmeli ya da bu dallar sadeleşmeli.

### Ekonomi çekirdeği (hazine + pazar + küresel havuz): bulgular
Altın kayıt üç modülü birlikte sınar; eski kodla üretmek için `EKONOMI_KOK` ortam değişkeniyle eski `js` klasörü verilir
(`git archive <eski-commit> js`). Tam oyun altın kaydı (`tests/altin/altin_kayit.json`) hiç değişmedi.

Kaldırılan ölü yöntemler: `injectBuyback`, `getPoolsNeedingSupport`, `getMarketSummary`, `getCorridorPosition`,
`previewPriceAfterSell`, `getResourceBurnRate` (pazar); `calculateLevelUbiPayout`, `recordBroadcastBuyback`,
`getTimeUntilNextEpoch`, `getSecondsUntilReset`, `getNextMonday1800TRT`, `simulateGlobalActivity` (havuz; boş işlevdi,
app.js'teki çağrısı da silindi).

Karar bekleyen / sonraya bırakılan:
4. **Geri alım çekimi ödeme gücü ölçüsüne yazılmıyor.** `drawBuyback` kasadan para çıkarır ama `lifetimeWithdrawn`'a
   eklemez; `getSummary().solvency` ve sağlık göstergesi bu yüzden olduğundan iyi görünür. Düzeltmek göstergeyi değiştirir.
5. **Oyuna görünen sahte kontrat adresi.** `CONTRACT_ADDRESS` (globalPool.js) gerçek token kontratı değil; eski ekonomi panosu
   (app.js ~682) bunu "Kontrat:" diye oyuncuya gösteriyor. Panel yeniden yazılırken ya gerçek adres ya da satır kaldırılacak.
6. **Karnaval kasası defteri atlıyor.** `js/gameState/karnaval.js` hazine defterinin `state` alanına doğrudan yazıyor
   (`pools.carnival`, `outflow`, `lifetimeWithdrawn`). Karnaval modülü yazılırken defterin yöntemleri kullanılacak.
7. **Test menüsündeki makro simülasyon eski oranlarla** (%18 yakım / %82 hazine, v1). Arayüz yeniden yazılırken ya güncel
   oranlara bağlanacak ya da kaldırılacak.
8. **Eski gösterim kopyaları** (`totalTreasury`, `treasury`, `buybackFromBroadcasting`, `totalActiveMiners`) hâlâ durumda;
   yalnız eski ekonomi panosu (app.js) okuyor. O panel gidince alanlar da kaldırılacak.

### gameState.js: düzeltilen hata (davranışı değiştiriyor, bilerek)
9. **Neredeyse kırık alet her yüklemede bedavaya yenileniyordu.** Eski `mergeTools`, dayanıklılığı 100 ve altı olan aleti
   "eski yüzde sistemi" sanıp 43,2 ile çarpıyordu (40 dakika kalan balta → 1.728). Sunucu her istekte kaydı yüklediği için
   bu, onarım parası ödemeden alet yenilemenin yoluydu. Yüzde dönüşümü kaldırıldı (yaşayan kayıtlar zaten dakika cinsinden);
   `tests/test_alet_dayaniklilik_yukleme.mjs` korur. Altın kayıt değişmedi.
