// Oturum anahtarları (kurumsal A2.7): veritabanında anahtarın kendisi değil SHA-256 özeti saklanır.
// Neden: kayıt dosyası (yedek, sızıntı, SQL okuma) ele geçirilse bile içindeki değerlerle giriş yapılamaz;
// anahtar 256 bit rastgele olduğu için tuzsuz hızlı özet yeterlidir (parola gibi tahmin edilebilir bir sır değil).
import crypto from 'node:crypto';

export const tokenOzeti = token => crypto.createHash('sha256').update(String(token)).digest('hex');

const ISARET = 'sessions:ozetli';

// Eski kayıt dosyalarında oturumlar düz anahtarla saklanıyordu: bir kez özetlenir (kimse çıkış yapmaz).
// İşaret 'kv' tablosunda tutulur, ikinci çağrı hiçbir şey yapmaz (özet tekrar özetlenmez).
export function eskiOturumlariOzetle(db) {
  const var_ = db.prepare('SELECT 1 AS v FROM kv WHERE key = ?').get(ISARET);
  if (var_) return 0;
  const satirlar = db.prepare('SELECT token FROM sessions').all();
  const guncelle = db.prepare('UPDATE sessions SET token = ? WHERE token = ?');
  const disIslem = db.isTransaction;   // geçiş çalıştırıcısı zaten işlem açtıysa iç içe işlem olmaz
  if (!disIslem) db.exec('BEGIN');
  try {
    for (const s of satirlar) guncelle.run(tokenOzeti(s.token), s.token);
    db.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run(ISARET, '1');
    if (!disIslem) db.exec('COMMIT');
  } catch (e) { if (!disIslem) db.exec('ROLLBACK'); throw e; }
  return satirlar.length;
}
