// Geçiş 010: Denge İzleme (18 Ekim 2026). Canlıda oyuncular oynamaya başlayınca oyunun dengesini (zindan canavarları, teçhizat döngüsü, ordu,
// ekonomi, tempo) haftalık/aylık izleyip ayarlayabilmek için toplanan ÖZET veriler. Kişisel veri yok: oyuncu yalnız tuzlu kısa özetle (denge_ilk).
//   denge_gunluk : gün + anahtar başına sayaç (adet) ve toplam; ortalama = toplam / adet (anahtar şemaları server/denge.js)
//   denge_goruntu: günde bir kez tüm oyuncu kayıtlarından çıkarılan DAĞILIMLAR (seviye, asker, teçhizat, zindan ilerlemesi, mod) — JSON
//   denge_ilk    : bir oyuncunun bir zindan canavarını bir modda İLK yendiği hesap günü (medyan hesabı için; oyuncu tuzlu özet)
export const surum = 10;
export const ad = 'denge';

export function up(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS denge_gunluk (
  gun TEXT NOT NULL,
  anahtar TEXT NOT NULL,
  adet INTEGER NOT NULL DEFAULT 0,
  toplam REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (gun, anahtar)
);
CREATE TABLE IF NOT EXISTS denge_goruntu (
  gun TEXT PRIMARY KEY,
  veri TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS denge_ilk (
  oyuncu TEXT NOT NULL,
  mod INTEGER NOT NULL,
  seviye INTEGER NOT NULL,
  hesap_gunu REAL NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (oyuncu, mod, seviye)
);
CREATE INDEX IF NOT EXISTS denge_gunluk_anahtar ON denge_gunluk (anahtar, gun);
CREATE INDEX IF NOT EXISTS denge_ilk_canavar ON denge_ilk (mod, seviye);
`);
}
