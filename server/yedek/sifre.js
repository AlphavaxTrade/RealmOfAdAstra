// Yedek şifreleme (kurumsal A9.3): AES-256-GCM, akış olarak (büyük dosya belleğe alınmaz).
// Biçim: "RLMB1" (5 bayt, aynı zamanda doğrulanan ek veri) + IV (12) + şifreli veri + doğrulama etiketi (16, dosyanın sonunda).
// Etiket sayesinde yanlış anahtar ve her türlü kurcalama/bozulma çözme sırasında yakalanır.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Transform } from 'node:stream';

export const MAGIC = Buffer.from('RLMB1');
const BASLIK = MAGIC.length + 12, ETIKET = 16;

export function anahtarCoz(hex) {
  if (!/^[0-9a-fA-F]{64}$/.test(String(hex || ''))) throw new Error('YEDEK_ANAHTAR 64 haneli onaltılık olmalı (openssl rand -hex 32)');
  return Buffer.from(hex, 'hex');
}

export function sifreleyici(anahtar) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', anahtar, iv);
  c.setAAD(MAGIC);
  let basladi = false;
  const baslikYaz = akis => { if (!basladi) { basladi = true; akis.push(Buffer.concat([MAGIC, iv])); } };
  return new Transform({
    transform(parca, _kod, cb) { baslikYaz(this); cb(null, c.update(parca)); },
    flush(cb) { baslikYaz(this); this.push(c.final()); this.push(c.getAuthTag()); cb(); }
  });
}

// Şifreli dosyayı okuyan akış zinciri: [okuma, çözücü]. Başlık/etiket okunamıyorsa açık hata.
export function cozucuAkislari(yol, anahtar) {
  const fd = fs.openSync(yol, 'r');
  let baslik, etiket, boyut;
  try {
    boyut = fs.fstatSync(fd).size;
    if (boyut < BASLIK + ETIKET) throw new Error('Yedek şifreli biçimi tanınmadı: dosya çok kısa (bozulmuş)');
    baslik = Buffer.alloc(BASLIK); fs.readSync(fd, baslik, 0, BASLIK, 0);
    etiket = Buffer.alloc(ETIKET); fs.readSync(fd, etiket, 0, ETIKET, boyut - ETIKET);
  } finally { fs.closeSync(fd); }
  if (!baslik.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Yedek şifreli biçimi tanınmadı: başlık bozulmuş');
  const d = crypto.createDecipheriv('aes-256-gcm', anahtar, baslik.subarray(MAGIC.length));
  d.setAAD(MAGIC); d.setAuthTag(etiket);
  return [fs.createReadStream(yol, { start: BASLIK, end: boyut - ETIKET - 1 }), d];
}
