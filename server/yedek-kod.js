// İki adımlı doğrulama yedek kodlarının özeti (13 Ekim 2026 denetimi, A2; ikinci tur 14 Ekim).
// Yedek kod 10 onaltılık hane = 40 bit: hızlı bir özet (SHA-256) veritabanı sızarsa kaba kuvvetle dakikalar/saatler içinde kırılır.
// Bu yüzden yavaş ve bellek isteyen scrypt + kod başına rastgele tuz kullanılır (yalnız node:crypto, ek kütüphane yok).
//
// Biçimler (hepsi doğrulanır; yalnız yeni kayıt "s2" yazılır):
//   s2$N$r$p$tuz$özet   scrypt (güncel). Ayarlar kaydın içindedir: ileride artırılınca eskiler yine doğrulanır.
//   s1$tuz$özet         sha256(tuz:kod)  — ilk tur; hızlı özet, "eski" sayılır
//   <64 hane>           sha256(kod)      — tuzsuz en eski biçim, "eski" sayılır
// Not: yedek kod tek kullanımlıktır; kullanılan kayıt silinir. Yani eski biçimli bir kod doğrulandığında yerinde yükseltilemez
// (kalan kodların düz metni sunucuda yok). Eski kayıtların gerçek yükseltme yolu kodların yenilenmesidir (accounts.yedekKodlariYenile).
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { hafifMi, HAFIF } from './parola.js';

const scrypt = promisify(crypto.scrypt);
export const YEDEK_GUCLU = { N: 32768, r: 8, p: 1 };   // 32 MB, ≈50-80 ms: oturum açarken 10 kayıt paralel denenir (iş parçacığı havuzunda)
const OZET_BOY = 32;
const BELLEK = 128 * 1024 * 1024;
const hedef = () => (hafifMi() ? HAFIF : YEDEK_GUCLU);   // HAFIF yalnız testlerde (PAROLA_HAFIF=1), gerçek sunucuda başlatma reddedilir

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
export const yedekKodNormal = c => String(c || '').toLowerCase().replace(/[\s-]/g, '');
const hexMi = (s, uz) => typeof s === 'string' && s.length === uz && /^[0-9a-f]+$/i.test(s);

export async function yedekKodOzetle(kod, ayar = hedef()) {
  const tuz = crypto.randomBytes(16);
  const ozet = await scrypt(yedekKodNormal(kod), tuz, OZET_BOY, { N: ayar.N, r: ayar.r, p: ayar.p, maxmem: BELLEK });
  return `s2$${ayar.N}$${ayar.r}$${ayar.p}$${tuz.toString('hex')}$${ozet.toString('hex')}`;
}

export function yedekKodBicimi(kayit) {
  if (typeof kayit !== 'string') return null;
  if (kayit.startsWith('s2$')) return 's2';
  if (kayit.startsWith('s1$')) return 's1';
  return hexMi(kayit, 64) ? 'duz' : null;
}

const esit = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

// { ok, eski }: eski = doğru kod ama kayıt hızlı özet biçiminde ya da hedef ayardan zayıf (yenilenmeli)
export async function yedekKodDogrula(kayit, kod) {
  const c = yedekKodNormal(kod);
  const bicim = yedekKodBicimi(kayit);
  if (!bicim) return { ok: false, eski: false };
  if (bicim === 'duz') return { ok: esit(Buffer.from(kayit), Buffer.from(sha(c))), eski: true };
  if (bicim === 's1') {
    const [, tuz, ozet] = kayit.split('$');
    if (!tuz || !ozet) return { ok: false, eski: false };
    return { ok: esit(Buffer.from(ozet), Buffer.from(sha(tuz + ':' + c))), eski: true };
  }
  const p = kayit.split('$');                       // s2, N, r, p, tuz, özet
  if (p.length !== 6) return { ok: false, eski: false };
  const N = Number(p[1]), r = Number(p[2]), pp = Number(p[3]);
  // Bozuk ya da akıl dışı ayar (bellek/CPU patlatmasın): hesaplamadan reddet
  const sinirda = (x, en, cok) => Number.isInteger(x) && x >= en && x <= cok;
  if (!sinirda(N, 1024, 2 ** 20) || (N & (N - 1)) !== 0 || !sinirda(r, 1, 32) || !sinirda(pp, 1, 16) || 128 * N * r * pp > BELLEK) return { ok: false, eski: false };
  if (!hexMi(p[4], 32) || !hexMi(p[5], OZET_BOY * 2)) return { ok: false, eski: false };
  let hesap;
  try { hesap = await scrypt(c, Buffer.from(p[4], 'hex'), OZET_BOY, { N, r, p: pp, maxmem: BELLEK }); } catch { return { ok: false, eski: false }; }
  const dogru = esit(Buffer.from(p[5], 'hex'), hesap);
  const h = hedef();
  return { ok: dogru, eski: dogru && (N < h.N || r < h.r || pp < h.p) };
}
