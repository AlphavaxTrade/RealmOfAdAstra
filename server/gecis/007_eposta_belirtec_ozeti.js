// Geçiş 007: e-posta bağlantı belirteçleri (doğrulama, şifre sıfırlama, cüzdan onayı) düz saklanıyordu; SHA-256 özetine çevrilir
// (13 Ekim 2026 denetimi, A2). Neden: kayıt dosyası/yedek sızarsa içindeki değerlerle hesap devralınamasın. Belirteç 192 bit
// rastgele olduğundan tuzsuz hızlı özet yeterlidir (oturum anahtarlarıyla aynı yöntem, geçiş 003).
// Yerinde dönüştürülür: dolaşımdaki ESKİ e-posta bağlantıları çalışmaya devam eder (sunucu artık gelen belirteci özetleyip arar).
// Geçiş tek seferliktir (schema_migrations kaydı), özet ikinci kez özetlenmez.
import crypto from 'node:crypto';

export const surum = 7;
export const ad = 'eposta_belirtec_ozeti';

export function up(db) {
  const guncelle = db.prepare('UPDATE email_tokens SET token = ? WHERE token = ?');
  for (const r of db.prepare('SELECT token FROM email_tokens').all()) {
    guncelle.run(crypto.createHash('sha256').update(String(r.token)).digest('hex'), r.token);
  }
}
