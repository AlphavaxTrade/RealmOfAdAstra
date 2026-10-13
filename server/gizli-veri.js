// Veritabanında durağan hâlde saklanan küçük sırlar (TOTP sırrı) için AES-256-GCM (13 Ekim 2026 denetimi, A2).
// Biçim: "enc1:" + base64url( IV(12) | şifreli veri | doğrulama etiketi(16) ). "enc1" sürüm öneğidir: ileride anahtar/biçim
// değişirse "enc2:" eklenir, eski kayıtlar okunmaya devam eder. Her kayıt kendi "bağlamına" (ör. totp:acc:7) bağlanır (ek veri):
// bir hesabın şifreli sırrı başka hesabın satırına kopyalanırsa çözülmez.
// Anahtar HESAP_ANAHTARI (64 onaltılık hane). Anahtar yoksa (geliştirme/deneme) kayıt düz yazılır; "enc1:" ile başlayan bir kayıt
// anahtarsız ya da yanlış anahtarla ASLA düz sayılmaz: çözülemez ve çağıran taraf KAPALI başarısızlık verir.
import crypto from 'node:crypto';

const ONEK = 'enc1:';

export const sifreliMi = deger => typeof deger === 'string' && deger.startsWith(ONEK);

// 64 hane onaltılık → 32 bayt anahtar; boş → null (şifreleme kapalı); biçim bozuksa açık hata
export function hesapAnahtariCoz(hex) {
  const s = String(hex || '').trim();
  if (!s) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(s)) throw new Error('HESAP_ANAHTARI 64 haneli onaltılık olmalı (openssl rand -hex 32)');
  return Buffer.from(s, 'hex');
}

export function sifrele(duz, anahtar, baglam) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', anahtar, iv);
  c.setAAD(Buffer.from(String(baglam)));
  const ct = Buffer.concat([c.update(String(duz), 'utf8'), c.final()]);
  return ONEK + Buffer.concat([iv, ct, c.getAuthTag()]).toString('base64url');
}

// Çözülemezse (anahtar yok, yanlış anahtar, bozuk/kurcalanmış kayıt) hata fırlatır
export function coz(kayit, anahtar, baglam) {
  if (!sifreliMi(kayit)) throw new Error('Kayıt şifreli biçimde değil');
  if (!anahtar) throw new Error('HESAP_ANAHTARI tanımlı değil: şifreli kayıt çözülemez');
  const b = Buffer.from(kayit.slice(ONEK.length), 'base64url');
  if (b.length < 12 + 16) throw new Error('Şifreli kayıt bozuk');
  const d = crypto.createDecipheriv('aes-256-gcm', anahtar, b.subarray(0, 12));
  d.setAAD(Buffer.from(String(baglam)));
  d.setAuthTag(b.subarray(b.length - 16));
  return Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString('utf8');
}
