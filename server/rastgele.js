// Güvenli rastgelelik (kurumsal A2.5).
// Neden: JavaScript'in Math.random'u tahmin edilebilir (xorshift128+; birkaç çıktıdan sonraki sayılar çözülebilir).
// Piyango, çark, zindan ganimeti, kutu açma gibi gerçek değerli sonuçlar sunucuda çözülüyor; bunlar işletim sisteminin
// kriptografik rastgeleliğinden (crypto) gelmeli.
import crypto from 'node:crypto';

const IMZA = Symbol.for('realm.guvenliRastgele');
const tampon = new Uint32Array(2);
const IKI53 = 9007199254740992;

// YALNIZ TESTLER: TEST_RASTGELE=1 iken sabitTohum(n) ile rastgelelik tekrarlanabilir olur ("altın kayıt" testleri).
// Gerçek sunucuda (bu ortam değişkeni yokken) çağrılırsa hata verir; kriptografik rastgelelik asla kapatılamaz.
let sahteUretec = null;
export function sabitTohum(tohum) {
  if (process.env.TEST_RASTGELE !== '1') throw new Error('sabitTohum yalnız testlerde (TEST_RASTGELE=1) kullanılabilir');
  let a = Number(tohum) >>> 0;
  sahteUretec = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// 0 ≤ x < 1, 53 bit hassasiyet (Math.random ile aynı sözleşme)
export function rastgele() {
  if (sahteUretec) return sahteUretec();
  crypto.getRandomValues(tampon);
  return ((tampon[0] >>> 5) * 67108864 + (tampon[1] >>> 6)) / IKI53;
}

// 0 ≤ x < n tam sayı (n 1 ile 2^48 arası), eğilimsiz
export function tamsayi(n) {
  const m = Math.floor(Number(n));
  if (!(m >= 1) || m > 2 ** 48 - 1) throw new RangeError('tamsayi(n): n 1 ile 2^48 arasında olmalı');
  if (sahteUretec) return Math.floor(sahteUretec() * m);
  return crypto.randomInt(m);
}

rastgele[IMZA] = true;

// Sunucu sürecinde oyun kodunun kullandığı Math.random'u güvenli sürümle değiştirir.
// Yalnız hâlâ yerleşik (native) sürümse değiştirir: bir test/araç kendi sahte sürümünü koyduysa ona dokunmaz.
// Aynı oyun kodu tarayıcıda çalışırken (tek oyunculu mod) bu dosya hiç yüklenmez; orada değişen bir şey yok.
export function guvenliRastgeleKur() {
  // eslint-disable-next-line no-restricted-properties -- bilerek: yerleşik sürümü tanımak ve değiştirmek için
  const simdiki = Math.random;
  if (simdiki[IMZA]) return false;                                                   // zaten kurulu
  if (!/\[native code\]/.test(Function.prototype.toString.call(simdiki))) return false;   // başkası değiştirmiş: dokunma
  // eslint-disable-next-line no-restricted-properties -- bilerek (yukarıdaki gerekçe)
  Math.random = rastgele;
  return true;
}

export const guvenliMi = () => Boolean(Math.random[IMZA]);   // eslint-disable-line no-restricted-properties -- bilerek
