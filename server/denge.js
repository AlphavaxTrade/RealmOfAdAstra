// Realm of AdAstra sunucusu — Denge İzleme veri toplama (18 Ekim 2026). Oyun çekirdeği (js/gameState/telemetri.js) önemli işlemleri bildirir; bu modül
// bunları GÜNLÜK ÖZET sayaçlara yazar ve günde bir kez oyuncu kayıtlarından dağılım görüntüsü çıkarır. Rapor ve uyarılar: server/denge-rapor.js.
// Kişisel veri yok: işlemler oyuncu kimliği olmadan sayılır; yalnız "ilk temizleme günü" tuzlu kısa özetle saklanır (medyan için).
// Şema: server/gecis/010_denge.js. Gün = Türkiye günü (UTC+3), oyunun günlük sıfırlanmasıyla aynı.
//
// Anahtar şeması (denge_gunluk.anahtar; adet = olay sayısı, toplam = değer toplamı, ortalama = toplam / adet):
//   z|m{mod}|l{seviye}|{alan}   zindan savaşı. alan: giris (her savaş) · zafer (toplam = zafer sayısı) · asker · askerSv · takimSv · tur · kayip · odul · harc · xp · parca · kutu
//   i|{tur}                     işlem (dovme yukselt onar hurda asker_al iyilestir seviye mod_katki mod_gecis): adet = başarılı işlem, toplam = harcanan ASTRA
//   i|{tur}|red                 reddedilen işlem sayısı (yetersiz kaynak vb.)
//   h|{tur}|{hammadde}          işlemde yakılan hammadde (toplam = miktar)
//   g|{tur}|ada, g|{tur}|{hammadde}   işlemin geri verdiği ASTRA / hammadde (hurdaya ayırma vb.)
import crypto from 'node:crypto';
import { askerHakki } from '../js/economy/ordu-hakki.js';

export const TURLER = ['dovme', 'yukselt', 'onar', 'hurda', 'asker_al', 'iyilestir', 'seviye', 'mod_katki', 'mod_gecis'];
// Zindan savaşı sayaç alanları: giris, zafer, asker, askerSv, takimSv, tur, kayip, odul, harc, xp, parca, kutu
const TR_SAAT_MS = 3 * 3600e3;
export const gunOf = (t) => new Date(t + TR_SAAT_MS).toISOString().slice(0, 10);
const sayi = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const guvenli = (s) => String(s).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24);

export function createDenge({ db, engine = null, clock = () => Date.now(), log = console, tuz = 'denge-ilk-tuzu' }) {
  const raw = db.raw;
  const q = {
    art: raw.prepare('INSERT INTO denge_gunluk (gun, anahtar, adet, toplam) VALUES (?, ?, 1, ?) ON CONFLICT(gun, anahtar) DO UPDATE SET adet = adet + 1, toplam = toplam + excluded.toplam'),
    ilk: raw.prepare('INSERT OR IGNORE INTO denge_ilk (oyuncu, mod, seviye, hesap_gunu, at) VALUES (?, ?, ?, ?, ?)'),
    goruntuVar: raw.prepare('SELECT 1 FROM denge_goruntu WHERE gun = ?'),
    goruntuYaz: raw.prepare('INSERT OR REPLACE INTO denge_goruntu (gun, veri) VALUES (?, ?)')
  };
  const ozet = (oyuncu) => crypto.createHash('sha256').update(tuz + '|' + oyuncu).digest('hex').slice(0, 12);

  function art(gun, anahtar, deger = 0) { q.art.run(gun, anahtar, sayi(deger)); }

  function zindan(v, oyuncu, gun) {
    const mod = Math.max(0, Math.min(9, Math.floor(sayi(v.mod)))), seviye = Math.max(1, Math.min(18, Math.floor(sayi(v.seviye))));
    const on = `z|m${mod}|l${seviye}|`;
    art(gun, on + 'giris');
    if (v.kazandi) art(gun, on + 'zafer', 1);
    art(gun, on + 'asker', v.asker); art(gun, on + 'askerSv', v.askerSeviyeOrt); art(gun, on + 'takimSv', v.takimOrt);
    art(gun, on + 'tur', v.tur); art(gun, on + 'kayip', v.kayip); art(gun, on + 'odul', v.odul); art(gun, on + 'harc', v.harc);
    art(gun, on + 'xp', v.xp); art(gun, on + 'parca', v.parca); art(gun, on + 'kutu', v.kutu);
    if (v.ilkTemizleme && oyuncu && v.hesapGunu != null) q.ilk.run(ozet(oyuncu), mod, seviye, sayi(v.hesapGunu), clock());
  }

  function islem(v, gun) {
    const tur = guvenli(v.tur);
    if (!TURLER.includes(tur)) return;
    if (!v.basarili) { art(gun, `i|${tur}|red`); return; }
    art(gun, `i|${tur}`, v.ada);
    for (const [k, m] of Object.entries(v.hammadde || {})) if (sayi(m) > 0) art(gun, `h|${tur}|${guvenli(k)}`, m);
    if (sayi(v.getiriAda) > 0) art(gun, `g|${tur}|ada`, v.getiriAda);
    for (const [k, m] of Object.entries(v.getiri || {})) if (sayi(m) > 0) art(gun, `g|${tur}|${guvenli(k)}`, m);
  }

  // Kanca: izleme hiçbir zaman oyun işlemini bozmaz (hata yutulur, günlüğe yazılır)
  function kaydet(olay, veri, oyuncu = null) {
    try {
      const gun = gunOf(clock());
      if (olay === 'zindan') zindan(veri || {}, oyuncu, gun);
      else if (olay === 'islem') islem(veri || {}, gun);
    } catch (e) { log.warn?.('Denge izleme kaydı yazılamadı: ' + e.message); }
  }

  // Günde bir kez: tüm oyuncu durumlarından dağılımlar. durumlarFn: oyuncu durum nesneleri listesi döndürür (engine.readPlayer); yalnız gerektiğinde
  // çağrılır (dakikalık zamanlayıcı her tur sorsa da tarama yapılmaz). Aynı gün ikinci kez çalışmaz (zorla: panelden elle alınır, bugünün kaydı yenilenir).
  function gunlukGoruntu(durumlarFn, { zorla = false } = {}) {
    const simdi = clock(), gun = gunOf(simdi);
    if (!zorla && q.goruntuVar.get(gun)) return null;
    const g = goruntuHesapla(durumlarFn(), simdi);
    q.goruntuYaz.run(gun, JSON.stringify(g));
    return g;
  }

  // Sunucu bağlantısı (server/index.js yalnız bu ikisini çağırır): çekirdeğin bildirimlerini yazar; dakikalık zamanlayıcıdan günlük görüntü ister.
  const baglan = () => engine && engine.setTelemetri && engine.setTelemetri((olay, veri, oyuncu) => kaydet(olay, veri, oyuncu));
  const gunlukTik = () => {
    if (!engine) return;
    try { gunlukGoruntu(() => db.q.playersAll.all().map(p => engine.readPlayer(p.address)).filter(Boolean)); }
    catch (err) { log.warn?.('Denge görüntüsü alınamadı: ' + err.message); }
  };

  return { kaydet, gunlukGoruntu, baglan, gunlukTik, art };
}

const kova = (v, sinirlar) => { for (const [ust, ad] of sinirlar) if (v <= ust) return ad; return sinirlar[sinirlar.length - 1][1]; };
const SEVIYE_KOVALARI = [[4, '1-4'], [9, '5-9'], [14, '10-14'], [19, '15-19'], [29, '20-29'], [39, '30-39'], [Infinity, '40+']];
const ASKER_KOVALARI = [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [10, '8-10'], [15, '11-15'], [Infinity, '16+']];
const art = (o, k, d = 1) => { o[k] = (o[k] || 0) + d; };
const medyan = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const yuvarla = (v) => Math.round(v * 100) / 100;

// Saf hesap (testlenir): oyuncu durumlarından dağılımlar. Kişisel veri içermez.
export function goruntuHesapla(durumlar, simdi) {
  const g = { oyuncu: 0, aktif7: 0, seviye: {}, ortSeviye: 0, asker: {}, ortAsker: 0, ortAskerSeviye: 0, hakDolu: 0, takimEsyaSeviye: {}, ortKusanilanYuva: 0, tamTakimAsker: 0, zindan: {}, mod: {}, astra: { ort: 0, medyan: 0, toplam: 0, kilitli: 0 }, hammadde: {} };
  const seviyeler = [], askerSayilari = [], astralar = [], askerSeviyeleri = [], yuvaOrtalamalari = [];
  for (const s of durumlar || []) {
    if (!s || typeof s !== 'object') continue;
    g.oyuncu++;
    if (sayi(s.lastSeenAt) >= simdi - 7 * 86400000) g.aktif7++;
    const lv = Math.max(1, Math.floor(sayi(s.level) || 1)); seviyeler.push(lv);
    art(g.seviye, kova(lv, SEVIYE_KOVALARI));
    const askerler = Array.isArray(s.soldierUnits) ? s.soldierUnits : [];
    askerSayilari.push(askerler.length); art(g.asker, kova(askerler.length, ASKER_KOVALARI));
    const mod = Math.max(0, Math.floor(sayi(s.dungeonMode))), ilerleme = Math.max(1, Math.min(19, Math.floor(sayi(s.dungeonProgress) || 1)));
    art(g.mod, String(mod)); art(g.zindan, `m${mod}|l${ilerleme}`);
    if (askerler.length >= askerHakki({ ilerleme, mod })) g.hakDolu++;
    for (const a of askerler) {
      askerSeviyeleri.push(Math.max(1, Math.floor(sayi(a && a.level) || 1)));
      const e = (a && a.equipment) || {}; let dolu = 0;
      for (const y of ['weapon', 'helmet', 'armor', 'legs', 'boots']) if (e[y]) { dolu++; art(g.takimEsyaSeviye, String(Math.max(1, Math.floor(sayi(e[y].level) || 1)))); }
      yuvaOrtalamalari.push(dolu); if (dolu === 5) g.tamTakimAsker++;
    }
    const bak = sayi(s.adAstraBalance); astralar.push(bak); g.astra.toplam += bak; g.astra.kilitli += sayi(s.lockedAda);
    for (const [k, v] of Object.entries(s.inventory || {})) if (sayi(v) > 0) art(g.hammadde, guvenli(k), sayi(v));
  }
  const ort = (a) => (a.length ? yuvarla(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  g.ortSeviye = ort(seviyeler); g.ortAsker = ort(askerSayilari); g.ortAskerSeviye = ort(askerSeviyeleri); g.ortKusanilanYuva = ort(yuvaOrtalamalari);
  g.astra.ort = ort(astralar); g.astra.medyan = yuvarla(medyan(astralar)); g.astra.toplam = yuvarla(g.astra.toplam); g.astra.kilitli = yuvarla(g.astra.kilitli);
  for (const k of Object.keys(g.hammadde)) g.hammadde[k] = Math.round(g.hammadde[k]);
  return g;
}
