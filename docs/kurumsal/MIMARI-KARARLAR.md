# Mimari kararlar: bölme, bağımlılık ve test düzeni (Aşama 3)

8 Ekim 2026. Amaç: 5-10 yıllık bakım için büyük dosyaları **davranışı değiştirmeden** parçalamak ve bunu kanıtlamak.

## Nasıl kanıtlandı: "altın kayıt"
`tests/altin/senaryo.mjs` sabit saat ve sabit rastgelelikle 3 oyunculu bir dünyayı baştan sona oynatır (21 adım: sefer, silo, bot,
zindan, çark, pazar, piyango, Kolezyum, haftalık hesaplaşma; 39 işlem gerçekten uygulanır). Her adımın sonunda oyuncu ve dünya
durumunun özeti (SHA-256) çıkar. `tests/test_altin_kayit.mjs` bunu kayıtlı özetlerle karşılaştırır ve senaryonun iki ayrı süreçte
aynı sonucu verdiğini (belirlenimli) doğrular. **Mutasyonla denendi**: pazar komisyonu %2 → %2,1 yapılınca test 6. adımda kırıldı.
Bilerek davranış değiştirirsen `node tests/altin/uret.mjs` ile kayıt yenilenir ve fark commit mesajında açıklanır.

## Bölmeler
| Dosya | Önce | Sonra | Nasıl |
|---|---|---|---|
| `server/app.js` | 495 satır | 252 | Rotalar `server/rotalar/{genel,hesap,oyun,cuzdan,pvp,ilan,yonetim}.js`; statik dosya `server/statik.js`. Bağımlılıklar `ctx` nesnesiyle verilir. |
| `server/world.js` | 732 | 129 | `server/world/{oranlar,piyasa,yatirma,odemeler,uretim,haftalik,boss,ortakGelir,sicakCuzdan}.js`; her modül öncekilerin ürettiğini `w` üzerinden alır (döngü yok). |
| `js/gameState.js` | 7994 | 364 | 254 yöntem `js/gameState/*.js` içinde **20 alan karışımı**; sınıfta yalnız kurucu, yükleme/kayıt ve bildirimler kaldı. Kod **AST (acorn)** ile bölündü; taşınan satırların çoklu kümesi orijinalle birebir doğrulandı (fark 0). |

Karışım (mixin) deseni zaten `js/v2/koyVeKonsey.js` ile kullanılıyordu; aynı desen genişletildi. Sınıf yöntemleri karışıma geçince
numaralandırılabilir (enumerable) olur; oyun kodunda `for…in` ile örnek gezilmediği doğrulandı (`gameState` üzerinde yok).

## Kasıtlı olarak yapılmayanlar
- **`js/app.js` (8687 satır, arayüz) bölünmedi.** Dosya, modüller arasında yeniden atanamayan ortak değişkenler (`let`) ve birbirini
  çağıran yüzlerce işlevle dolu; otomatik bölmek arayüzü bozma riski taşıyor, getirisi (okunabilirlik) düşük. Bölünürse yalnızca
  saf yardımcılar ve tek başına duran ekranlar, her dilimde tarayıcı duman testiyle (Playwright) yapılmalı. Bkz. ADR 0005.
- Oyun kuralları ve ekonomi sayıları değişmedi (bu aşamada kural değişikliği yok).

## SOLID notları (bu kod tabanına uygulanmış hâliyle)
- **Tek sorumluluk:** her yeni dosya tek alan (ödeme kuyruğu, yatırma, hesap rotaları...). Sınır: yeni dosya ≤ ~700 satır
  (en büyük `js/gameState/techizat.js` 710, `bot.js` 706; hepsi tek konu, bölünmesi için gerekçe yok).
- **Bağımlılık enjeksiyonu:** sunucu modülleri `createX({ db, engine, ... })` ile kurulur, global durum yok; bu yüzden testler sahte
  zincir/saat/posta verebiliyor (`providerFactory`, `clock`, `log`).
- **Açık/kapalı:** yeni alan = yeni karışım ya da yeni rota modülü; mevcut modül değişmez.
- **Para yolları** (`payments`, `kasa`, `world/odemeler`, `world/haftalik`) için kapsam eşikleri dosya bazında `kapsam-esik.json`'da
  ve yalnız yukarı gidebilir.
