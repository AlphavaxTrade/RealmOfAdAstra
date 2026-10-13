// E-posta benzersizlik anahtarı (13 Ekim 2026 denetimi, EK-02a).
// Kullanıcının yazdığı adres posta göndermek için OLDUĞU GİBİ kalır (accounts.email). Ama "bu kutu daha önce kayıt oldu mu"
// sorusu bu ANAHTARA bakar; yoksa bir kişi ali+1@x.com, ali+2@x.com ya da gmail'de a.li@gmail.com, al.i@gmail.com yazarak
// aynı posta kutusuyla sınırsız hesap açabilir (ücretsiz havuz payı, Krallık Yolu ödülü, vatandaş koltuğu çoğalır).
//   • büyük/küçük harf ve Unicode biçimi birleştirilir (NFKC: tam genişlikli harfler vb.)
//   • "+etiket" atılır (a+oyun@x.com → a@x.com); etiketten önce hiçbir şey kalmıyorsa dokunulmaz
//   • gmail.com / googlemail.com: noktalar atılır ve alan adı gmail.com'a birleştirilir (Gmail noktaları yok sayar)
//   • alan adı sonundaki nokta atılır
// NOT: server/gecis/005_eposta_anahtari.js bu işlevin BİR KOPYASINI taşır (uygulanmış geçiş mühürlüdür, değişmez);
// bu dosya değişirse yeni kayıtların anahtarı eski kayıtlarınkiyle ayrışır: değiştirmek yeni bir geçiş gerektirir.
export function epostaAnahtari(adres) {
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
