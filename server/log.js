// Yapılandırılmış (JSON) günlük (kurumsal A7.1).
// Her kayıt TEK satır JSON: { t, sev, ileti, ...alanlar }. Seviyeler: debug < info < warn < error (LOG_LEVEL, varsayılan info).
// console ile uyumludur: log.warn('Metin:', err.message), log.error('Metin', err), log.log('...') çalışır (modüller `log = console` varsayılanıyla yazılmış).
// GİZLİ BİLGİ yazılmaz: anahtar adı gizli sayılırsa değer [GİZLİ] olur; metin içindeki Bearer, bağlantı adresindeki şifre ve e-posta maskelenir.
// İşlem özeti (tx hash) bilerek MASKELENMEZ: ödeme sorunlarını ayıklamak için gerekir ve zaten zincirde herkese açıktır.
import { AsyncLocalStorage } from 'node:async_hooks';

// İstek bağlamı: app.js her isteği istekBaglami.run({ istek: '<kimlik>' }, ...) içinde işler; o isteğin sürdürdüğü her günlük satırına
// (hangi modül yazarsa yazsın) kimlik kendiliğinden eklenir → bir hatanın bütün izi tek kimlikle bulunur.
export const istekBaglami = new AsyncLocalStorage();

const SEVIYE = { debug: 10, info: 20, warn: 30, error: 40 };
const GIZLI_ANAHTAR = /(token|sifre|şifre|password|passwd|secret|anahtar|private_?key|api_?key|master_?key|authorization|cookie|signature|imza|raw_?tx|credential)/i;
const EN_FAZLA_METIN = 4000;
const EN_FAZLA_DERINLIK = 6;

// Metin içindeki gizlileri maskele (anahtar adı olmayan serbest metin için)
export function maskele(metin) {
  return String(metin)
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[GİZLİ]')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):([^\s@/]+)@/gi, '$1:[GİZLİ]@')
    .replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2');
}

function temizle(deger, derinlik, goruldu) {
  if (deger === null || deger === undefined) return deger ?? null;
  const tur = typeof deger;
  if (tur === 'string') { const m = maskele(deger); return m.length > EN_FAZLA_METIN ? m.slice(0, EN_FAZLA_METIN) + '…[kırpıldı]' : m; }
  if (tur === 'number') return Number.isFinite(deger) ? deger : String(deger);
  if (tur === 'boolean') return deger;
  if (tur === 'bigint') return deger.toString();
  if (tur === 'function' || tur === 'symbol') return undefined;
  if (deger instanceof Date) return Number.isNaN(deger.getTime()) ? 'geçersiz-tarih' : deger.toISOString();
  if (deger instanceof Error) return hataAlani(deger);
  if (goruldu.has(deger)) return '[DÖNGÜ]';
  if (derinlik >= EN_FAZLA_DERINLIK) return '[ÇOK DERİN]';
  goruldu.add(deger);
  let out;
  if (Array.isArray(deger)) out = deger.slice(0, 50).map(x => temizle(x, derinlik + 1, goruldu));
  else {
    out = {};
    for (const [k, v] of Object.entries(deger).slice(0, 80)) out[k] = GIZLI_ANAHTAR.test(k) ? '[GİZLİ]' : temizle(v, derinlik + 1, goruldu);
  }
  goruldu.delete(deger);
  return out;
}

function hataAlani(e) {
  return { ad: e.name, mesaj: maskele(e.message || ''), ...(e.code ? { kod: String(e.code) } : {}), yigin: maskele(String(e.stack || '')).split('\n').slice(0, 6).join('\n') };
}

// console tarzı argümanlar → { ileti, alanlar }
function coz(args) {
  const alanlar = {}; const parcalar = []; let hataSayisi = 0;
  for (const a of args) {
    if (a instanceof Error) alanlar[hataSayisi++ === 0 ? 'hata' : 'hata' + hataSayisi] = a;
    else if (a && typeof a === 'object' && !Array.isArray(a)) Object.assign(alanlar, a);
    else if (a !== undefined && a !== null) parcalar.push(typeof a === 'string' ? a : (Array.isArray(a) ? JSON.stringify(temizle(a, 0, new Set())) : String(a)));
  }
  return { ileti: parcalar.join(' '), alanlar };
}

// Varsayılan çıktı: warn/error stderr'e, gerisi stdout'a (console ile aynı); Docker ve systemd ikisini de toplar
const varsayilanCikti = (satir, sev) => (sev === 'warn' || sev === 'error' ? process.stderr : process.stdout).write(satir + '\n');

// bicim 'json' (varsayılan, makine okur) ya da 'duz' (geliştirici: "saat SEVİYE ileti {alanlar}")
function duzSatir(k) {
  const { t, sev, ileti, ...alan } = k;
  const ek = Object.keys(alan).length ? ' ' + JSON.stringify(alan) : '';
  return `${t.slice(11, 19)} ${sev.toUpperCase().padEnd(5)} ${ileti}${ek}`;
}

export function createLogger({ seviye = 'info', bicim = 'json', cikti = varsayilanCikti, zaman = () => new Date().toISOString(), ek = {} } = {}) {
  const esik = SEVIYE[String(seviye).toLowerCase()] ?? SEVIYE.info;
  function yaz(sev, args) {
    if (SEVIYE[sev] < esik) return;
    try {
      const { ileti, alanlar } = coz(args);
      const govde = temizle({ ...ek, ...istekBaglami.getStore(), ...alanlar }, 0, new Set());
      const kayit = { t: zaman(), sev, ileti: temizle(ileti, 0, new Set()), ...govde };
      cikti(bicim === 'duz' ? duzSatir(kayit) : JSON.stringify(kayit), sev);
    } catch { /* günlük yazılamıyorsa uygulama düşmez (ör. disk dolu); gösterecek başka yer yok */ }
  }
  const l = {
    debug: (...a) => yaz('debug', a), info: (...a) => yaz('info', a), warn: (...a) => yaz('warn', a), error: (...a) => yaz('error', a),
    log: (...a) => yaz('info', a),   // console.log uyumu
    child: alanlar => createLogger({ seviye, bicim, cikti, zaman, ek: { ...ek, ...alanlar } })
  };
  return l;
}
