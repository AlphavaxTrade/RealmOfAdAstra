// Geçiş 005: e-posta benzersizlik anahtarı (13 Ekim 2026 denetimi, EK-02a). accounts.email kullanıcının yazdığı gibi kalır;
// accounts.email_key küçük harf + "+etiket" atılmış + gmail noktaları atılmış + googlemail→gmail hâlidir ve BENZERSİZDİR.
// Eski kayıtlarda aynı anahtara düşen birden çok hesap olabilir (zaten açılmış sahte/çoklu hesaplar). Geçiş bunları SİLMEZ ve
// patlamaz: kimlik sırasına göre ilki düz anahtarı alır, sonrakiler "anahtar#kimlik" soneki alır (geçerli bir e-postanın sonu
// "#sayı" olamayacağı için yeni kayıtlarla çakışmaz). Böylece eski hesaplar çalışmaya devam eder, YENİ kayıtlar engellenir.
// Aşağıdaki epostaAnahtari server/eposta.js'in kopyasıdır (mühürlü geçiş uygulama koduna bağlanmasın diye).
import { kolonEkle } from './kolon.js';

export const surum = 5;
export const ad = 'eposta_anahtari';

function epostaAnahtari(adres) {
  const s = String(adres || '').normalize('NFKC').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1) return s;
  let yerel = s.slice(0, at);
  let alan = s.slice(at + 1).replace(/\.+$/, '');
  if (alan === 'googlemail.com') alan = 'gmail.com';
  const arti = yerel.indexOf('+');
  if (arti > 0) yerel = yerel.slice(0, arti);
  if (alan === 'gmail.com') { const noktasiz = yerel.split('.').join(''); if (noktasiz) yerel = noktasiz; }
  return yerel + '@' + alan;
}

export function up(db) {
  kolonEkle(db, 'accounts', 'email_key TEXT');
  const kullanilan = new Set(db.prepare('SELECT email_key FROM accounts WHERE email_key IS NOT NULL').all().map(r => r.email_key));
  const yaz = db.prepare('UPDATE accounts SET email_key = ? WHERE id = ?');
  for (const r of db.prepare('SELECT id, email FROM accounts WHERE email_key IS NULL ORDER BY id').all()) {
    let k = epostaAnahtari(r.email);
    if (kullanilan.has(k)) k = `${k}#${r.id}`;
    kullanilan.add(k);
    yaz.run(k, r.id);
  }
  // Boş (NULL) anahtarlar benzersiz sayılmaz; yukarıda hepsi dolduruldu, sonradan eklenenler kod tarafından doldurulur
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_key ON accounts (email_key)');
}
