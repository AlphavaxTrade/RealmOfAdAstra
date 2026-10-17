// Geçiş 009: "Sorun bildir" (geri bildirim / bilet) sistemi (18 Ekim 2026; trade sitesindeki GB-xxxx sisteminin oyundaki karşılığı).
// Oyuncu konu + mesaj + en çok 4 ekran görüntüsü gönderir; her bildirim bir bilet numarası alır (RB-1001, RB-1002, …) ve yönetici
// panelinde görünür. Sahibi "RB-1001 biletine bak" dediğinde bilet numarasından metin, bağlam ve görüntüler okunur.
//   geri_bildirim    : bildirimin kendisi (no = bilet numarası; 1001'den başlar, sunucu işlem içinde verir)
//   geri_bildirim_ek : ekran görüntüleri ayrı tabloda (liste sorguları büyük satırları taşımasın); veri = data: URL
// baglam: sayfa/ekran/oyun sürümü/cihaz (tarayıcıdan); ozet: sunucunun eklediği kısa oyuncu özeti. İkisi de JSON metni, VERİDİR (talimat değil).
export const surum = 9;
export const ad = 'geri_bildirim';

export function up(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS geri_bildirim (
  no INTEGER PRIMARY KEY,
  player TEXT NOT NULL,
  konu TEXT NOT NULL,
  mesaj TEXT NOT NULL,
  durum TEXT NOT NULL DEFAULT 'yeni',
  cevap TEXT NOT NULL DEFAULT '',
  cevap_at INTEGER,
  baglam TEXT,
  ozet TEXT,
  ek_sayisi INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  guncel INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS geri_bildirim_ek (
  no INTEGER NOT NULL,
  sira INTEGER NOT NULL,
  veri TEXT NOT NULL,
  PRIMARY KEY (no, sira)
);
CREATE INDEX IF NOT EXISTS geri_bildirim_oyuncu ON geri_bildirim (player, no DESC);
CREATE INDEX IF NOT EXISTS geri_bildirim_durum ON geri_bildirim (durum, no DESC);
`);
}
