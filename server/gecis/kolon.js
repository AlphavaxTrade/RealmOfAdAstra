// Geçiş (migration) yardımcıları (kurumsal A5.2)
// SQLite "ADD COLUMN IF NOT EXISTS" desteklemez; eskiden bu iş her modülde try/catch ile yapılıyordu (hata yutan, belgesiz).
// Tablo ve sütun adları KOD İÇİNDEKİ sabit listelerden gelir, kullanıcı girdisinden asla; yine de biçim denetlenir.
const AD_RE = /^[a-z_][a-z0-9_]*$/i;

export function kolonVarMi(db, tablo, kolon) {
  if (!AD_RE.test(tablo)) throw new Error('Geçersiz tablo adı: ' + tablo);
  return db.prepare(`PRAGMA table_info(${tablo})`).all().some(r => r.name === kolon);
}

// tanim: "ad TIP [kısıtlar]" (ör. "gate TEXT NOT NULL DEFAULT 'new'"). Sütun varsa hiçbir şey yapmaz.
export function kolonEkle(db, tablo, tanim) {
  const kolon = String(tanim).trim().split(/\s+/)[0];
  if (!AD_RE.test(tablo) || !AD_RE.test(kolon)) throw new Error(`Geçersiz tablo/sütun adı: ${tablo}.${kolon}`);
  if (kolonVarMi(db, tablo, kolon)) return false;
  db.exec(`ALTER TABLE ${tablo} ADD COLUMN ${tanim}`);
  return true;
}
