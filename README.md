# 🌌 Realm of Astra

Avalanche ekosistemi için tasarlanan, tarayıcıda çalışan bir strateji / RPG oyunu. Kaynak seferleri, AMM pazarı, asker ve teçhizat gelişimi, zindan, kolezyum, karnaval (çark ve piyango) ile haftalık kotalara dayalı deflasyonist bir ekonomi içerir.

**Aşama:** Genesis Devnet — tüm oyun durumu tarayıcıda (localStorage) tutulur; kurallar sunucu ve akıllı kontrat tarafına taşınabilecek biçimde saf fonksiyonlara ayrılmıştır.
**Sürüm:** güncelleme günlüğü oyun içinde (sağ üstteki 📜) ve `js/config.js` → `CHANGELOG` dizisindedir.

---

## 🚀 Çalıştırma

Gereksinim: [Node.js](https://nodejs.org) 18 veya üzeri.

### Windows: arka planda sürekli açık sunucu

| Dosya | Ne yapar |
| --- | --- |
| `OYUNU-BASLAT.bat` | Sunucuyu görünmez pencerede başlatır, tarayıcıda `http://localhost:5180/` adresini açar ve Windows her açıldığında kendiliğinden başlaması için kayıt ekler. PowerShell/cmd penceresini kapatmak sunucuyu **durdurmaz**. İlk çalıştırmada `npm install` yapar. |
| `OYUNU-DURDUR.bat` | Sunucuyu ve otomatik başlatmayı kapatır. |

Sunucu kapanırsa bekçi (`scripts/windows/keep-alive.cjs`) onu yeniden başlatır. Günlük: `logs/server.log`.

### Tüm sistemler

```bash
npm install
npm run dev      # http://localhost:5180/  (terminal açık kaldıkça)
npm run serve    # aynı sunucu, çökerse kendiliğinden yeniden başlar
npm test         # tüm testler (tests/test_*.mjs)
npm run build    # yayın paketi → dist/
```

Geliştirme sunucusunda sağ alttaki **🧪 Test Menüsü** (veya `T`) açılır: zaman atlatma, kaynak ekleme, hesap sıfırlama. Yayın paketinde görünmez.

---

## 🎮 Temel sistemler

| Sistem | Özet |
| --- | --- |
| **Seferler** | Orman, maden ve tarla seferleri; aletler dakikada 1 dayanıklılık kaybeder. |
| **Haftalık dünya kotası** | Odun 180.000 · Demir 130.000 · Buğday 490.000. Kota her gün 1/7 açılır; harcanan hammadde kalıcı yakılır. |
| **AMM pazarı** | `x · y = k` havuzları, %2 harç ve %2 hammadde yakımı, taban fiyat koruması. |
| **Zindan** | 6 kat, 18 seviye, boss fazları. Her girişte stamina harcanır. Günün 1. girişinde silah aşınmaz; 2.–5. giriş harçsız ödüllü (silah aşınır); 6. girişten itibaren kapı harcı veya antrenman. |
| **Kolezyum** | 1v1 ELO, lig kademeleri; maç başına 1 anahtar + stamina, günde 10 maç. |
| **Piyango** | 100 ADA bilet, haftada tek kazanan (ödediğinin 2 katı). Hesap başına haftada en fazla 100 bilet alınır; kazanmayan biletler yanmaz, kazanana kadar sonraki haftalara devreder. |
| **Hazine** | Harcanan her ADA: %5 yakım · %6 haftalık temel gelir (UBI) · %3 yapımcı payı · %86 hazine kasaları (zindan, kolezyum, dünya bossu, pazar geri alım, görev, karnaval). Ödüller basılmaz, kasadan ödenir. Kazancın %80'i kilitli başlar; harcadıkça ve oynadıkça açılır. |
| **Taverna botu** | 24 saatlik otomatik sefer, tamir ve satış. |

Tüm sınırlar oyunda **📊 Kotalar** panelinden (üst bar, yan panel veya `K` kısayolu) izlenir.

Ayrıntılar: [Oyun tasarımı ve ekonomi](docs/GAME_DESIGN_AND_ECONOMY_WHITEPAPER.md) · [Seviye ve denge tabloları](docs/LEVEL_PROGRESSION_TABLES.md) · [Geliştirme önerileri (denetim ve yol haritası)](docs/GELISTIRME_ONERILERI.md)

---

## 📁 Dizin yapısı

```
index.html               Arayüz iskeleti (üst bar, yan panel, pencereler)
css/
  style.css              Temel stiller
  theme.css              Tema, renk değişkenleri, bileşenler, mobil düzen
  battle-arena.css       Canlı savaş arenası
js/
  app.js                 Arayüz denetleyicisi ve oyun döngüsü
  gameState.js           Oyuncu durumu ve oyun kuralları
  config.js              Sabitler, oranlar, güncelleme günlüğü
  globalPool.js          Haftalık dünya kotası, token muhasebesi, UBI
  ammMarket.js           AMM pazarı
  treasury.js            Hazine kasaları (ödül defteri)
  combat.js              Sıra tabanlı savaş motoru
  bestiary.js            Zindan canavarları ve boss fazları
  battleArena.js         Savaşın görsel oynatımı
  grandTownScene.js      Phaser kasaba sahnesi
  dungeonScene.js        Phaser zindan sahnesi
  economy/               Saf kural modülleri (piyango, UBI)
  ui/limits.js           Kota ve sınır arayüz bileşenleri
public/                  Görseller (yayın paketine kopyalanır)
scripts/
  generate_doc_tables.mjs  Denge tablolarını üretir
  windows/                 Arka plan sunucu bekçisi
tests/                   Node testleri (npm test)
docs/                    Tasarım belgeleri
```

---

© 2026 AlphAvax. Tüm hakları saklıdır.
