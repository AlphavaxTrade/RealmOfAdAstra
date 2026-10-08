// Parola özeti (kurumsal A2.12).
// scrypt, ASENKRON (Node'un iş parçacığı havuzunda): ağır hesaplama ana iş parçacığını (tüm oyuncuların istekleri) bloklamaz.
// Eskiden senkron scryptSync ve N=16384, p=1 vardı: hem OWASP'ın bugünkü asgarisinin altındaydı hem de bir IP'nin
// saniyede 5 giriş denemesi sunucuyu meşgul edebiliyordu.
//
// Biçim:  scrypt2$N$r$p$tuz$özet      (ayarlar özetin içinde: ileride artırılınca eskiler yine doğrulanır)
// Eski:   scrypt$tuz$özet             (N=16384 r=8 p=1); doğrulanır ve girişte yeni biçime yenilenir.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
export const GUCLU = { N: 65536, r: 8, p: 2 };   // OWASP asgari eşdeğer ayarlardan biri (N=2^16, r=8, p=2); ≈64 MB bellek, ≈150-300 ms
export const HAFIF = { N: 1024, r: 8, p: 1 };    // YALNIZ testler (PAROLA_HAFIF=1); gerçek sunucuda başlatma reddedilir
const ESKI = { N: 16384, r: 8, p: 1 };
const ANAHTAR_BOY = 64;
const BELLEK = 256 * 1024 * 1024;                // scrypt bellek sınırı (128·N·r·p'den büyük olmalı)

export const hafifMi = () => process.env.PAROLA_HAFIF === '1';
const hedef = () => (hafifMi() ? HAFIF : GUCLU);
const sayiMi = (x, en, cok) => Number.isInteger(x) && x >= en && x <= cok;

export async function parolaOzetle(parola, ayar = hedef()) {
  const tuz = crypto.randomBytes(16);
  const ozet = await scrypt(String(parola), tuz, ANAHTAR_BOY, { N: ayar.N, r: ayar.r, p: ayar.p, maxmem: BELLEK });
  return `scrypt2$${ayar.N}$${ayar.r}$${ayar.p}$${tuz.toString('hex')}$${ozet.toString('hex')}`;
}

// { ok, yenile }: yenile = doğru parola ama kayıtlı özet eski biçimde ya da hedef ayardan zayıf (girişte yeniden özetlenmeli)
export async function parolaDogrula(parola, kayitli) {
  const parca = String(kayitli == null ? '' : kayitli).split('$');
  let ayar, tuzHex, ozetHex, eskiBicim = false;
  if (parca[0] === 'scrypt2' && parca.length === 6) {
    ayar = { N: Number(parca[1]), r: Number(parca[2]), p: Number(parca[3]) };
    [tuzHex, ozetHex] = [parca[4], parca[5]];
  } else if (parca[0] === 'scrypt' && parca.length === 3) {
    ayar = ESKI; eskiBicim = true;
    [tuzHex, ozetHex] = [parca[1], parca[2]];
  } else return { ok: false, yenile: false };
  // Kayıt bozuksa ya da ayarlar akıl dışıysa (bellek/CPU patlatmasın) hesaplamadan reddet
  if (!sayiMi(ayar.N, 1024, 2 ** 20) || (ayar.N & (ayar.N - 1)) !== 0 || !sayiMi(ayar.r, 1, 32) || !sayiMi(ayar.p, 1, 16)) return { ok: false, yenile: false };
  if (!/^[0-9a-f]+$/i.test(tuzHex || '') || !/^[0-9a-f]+$/i.test(ozetHex || '') || tuzHex.length < 16 || ozetHex.length !== ANAHTAR_BOY * 2) return { ok: false, yenile: false };
  let hesap;
  try { hesap = await scrypt(String(parola), Buffer.from(tuzHex, 'hex'), ANAHTAR_BOY, { N: ayar.N, r: ayar.r, p: ayar.p, maxmem: BELLEK }); }
  catch { return { ok: false, yenile: false }; }   // ayar bellek sınırını aşıyor: doğrulanamaz
  const beklenen = Buffer.from(ozetHex, 'hex');
  const dogru = beklenen.length === hesap.length && crypto.timingSafeEqual(beklenen, hesap);
  const h = hedef();
  return { ok: dogru, yenile: dogru && (eskiBicim || ayar.N < h.N || ayar.p < h.p || ayar.r < h.r) };
}
