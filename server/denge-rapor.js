// Realm of AdAstra sunucusu — Denge İzleme raporu ve otomatik uyarılar (18 Ekim 2026). Veri: server/denge.js'in günlük özetleri (denge_gunluk,
// denge_goruntu, denge_ilk). Yönetici paneli (GET /api/admin/denge) ve okuma betiği (server/denge-rapor.mjs) bunu kullanır. Salt okunur.
// Amaç: canlıda haftalık/aylık izleyerek "hangi canavar çok kolay/zor, ilerleme tasarlanandan hızlı mı yavaş mı, teçhizat döngüsü işliyor mu,
// ASTRA ve hammadde akışı ekonomiye ne katıp götürüyor" sorularına cevap verip dengeyi (js/bestiary.js, js/config.js) güncellemek.
import { GAME_CONFIG } from '../js/config.js';
import { DUNGEON_LEVELS } from '../js/bestiary.js';
import { gunOf, TURLER } from './denge.js';

export const PENCERELER = { hafta: 7, ay: 30 };
// Uyarı eşikleri (tek yerde; ilk tahmin, canlı veriyle ayarlanır)
export const ESIK = {
  enAzGiris: 20,            // bir canavarın oranı yorumlanması için bu pencerede en az savaş
  cokKolayOran: 0.92, cokZorOran: 0.25,
  enAzIlkOyuncu: 5,         // ilk temizleme medyanı için en az oyuncu
  cokYavasKat: 3, hizliKat: 0.7,   // medyan / hedef gün
  odulHarcamaUst: 0.9, odulHarcamaAlt: 0.1,
  hakDoluOran: 0.8,
  enAzAktif: 5              // "hiç işlem yok" uyarıları için en az aktif oyuncu
};
const GUN_MS = 86400000;
const yuvarla = (v, n = 2) => { const k = 10 ** n; return Math.round(v * k) / k; };
const oran = (a, b) => (b > 0 ? a / b : null);
const medyan = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// [bas, bit] gün aralığı (bit dahil, bugün dahil) → { anahtar: { adet, toplam } }
function topla(db, bas, bit) {
  const out = {};
  for (const r of db.raw.prepare('SELECT anahtar, SUM(adet) AS adet, SUM(toplam) AS toplam FROM denge_gunluk WHERE gun >= ? AND gun <= ? GROUP BY anahtar').all(bas, bit)) out[r.anahtar] = { adet: r.adet, toplam: r.toplam };
  return out;
}
const g = (T, k) => T[k] || { adet: 0, toplam: 0 };
const toplamOf = (T, k) => g(T, k).toplam;
const adetOf = (T, k) => g(T, k).adet;

// Son (ya da `gun` öncesindeki en yakın) dağılım görüntüsü
function goruntu(db, enGec) {
  const r = db.raw.prepare('SELECT gun, veri FROM denge_goruntu WHERE gun <= ? ORDER BY gun DESC LIMIT 1').get(enGec);
  if (!r) return null;
  try { return { gun: r.gun, ...JSON.parse(r.veri) }; } catch { return null; }
}

export function rapor(db, { pencere = 'hafta', simdi = Date.now() } = {}) {
  const gunSayisi = PENCERELER[pencere] || PENCERELER.hafta;
  const bit = gunOf(simdi), bas = gunOf(simdi - (gunSayisi - 1) * GUN_MS);
  const oncekiBit = gunOf(simdi - gunSayisi * GUN_MS), oncekiBas = gunOf(simdi - (2 * gunSayisi - 1) * GUN_MS);
  const T = topla(db, bas, bit), O = topla(db, oncekiBas, oncekiBit);
  const modlar = GAME_CONFIG.ZINDAN_MODLARI || [];

  // ── Zindan: (mod, canavar) başına savaş, gerçek kazanma oranı, ortalama ordu; ilk temizleme günü medyanı ve hedefi ──
  const ilk = {};
  for (const r of db.raw.prepare('SELECT mod, seviye, hesap_gunu FROM denge_ilk').all()) (ilk[`${r.mod}|${r.seviye}`] ||= []).push(r.hesap_gunu);
  const zindan = [];
  for (let mod = 0; mod < modlar.length; mod++) {
    for (const c of DUNGEON_LEVELS) {
      const on = `z|m${mod}|l${c.level}|`, giris = adetOf(T, on + 'giris'), gunler = ilk[`${mod}|${c.level}`] || [];
      if (!giris && !gunler.length) continue;
      const ort = (alan) => (giris ? yuvarla(toplamOf(T, on + alan) / giris) : null);
      const hedef = (GAME_CONFIG.ZINDAN_HEDEF_GUN && GAME_CONFIG.ZINDAN_HEDEF_GUN[mod] && GAME_CONFIG.ZINDAN_HEDEF_GUN[mod][c.level]) ?? null;
      const med = medyan(gunler);
      zindan.push({
        mod, modAd: modlar[mod].ad, seviye: c.level, ad: c.name, giris, zafer: toplamOf(T, on + 'zafer'), oran: giris ? yuvarla(toplamOf(T, on + 'zafer') / giris, 3) : null,
        ortAsker: ort('asker'), ortAskerSeviye: ort('askerSv'), ortTakimSeviye: ort('takimSv'), ortTur: ort('tur'), ortKayip: ort('kayip'),
        ortOdulAstra: ort('odul'), toplamOdulAstra: yuvarla(toplamOf(T, on + 'odul')), toplamHarc: yuvarla(toplamOf(T, on + 'harc')),
        ilkOyuncu: gunler.length, ilkMedyanGun: med == null ? null : yuvarla(med, 1), hedefGun: hedef, ilkHedefOrani: med != null && hedef ? yuvarla(med / Math.max(hedef, 1), 2) : null
      });
    }
  }

  // ── Teçhizat, ordu ve seviye işlemleri: sayı, harcanan ASTRA, yakılan hammadde, ret sayısı; önceki pencereyle kıyas ──
  const islemler = TURLER.map((tur) => {
    const hammadde = {};
    for (const k of Object.keys(T)) if (k.startsWith(`h|${tur}|`)) hammadde[k.split('|')[2]] = Math.round(T[k].toplam);
    const onceki = adetOf(O, `i|${tur}`);
    return { tur, adet: adetOf(T, `i|${tur}`), astra: yuvarla(toplamOf(T, `i|${tur}`)), red: adetOf(T, `i|${tur}|red`), oncekiAdet: onceki, hammadde,
      getiriAstra: yuvarla(toplamOf(T, `g|${tur}|ada`)) };
  });

  // ── Ekonomi: zindandan kazanılan ASTRA, işlemlere harcanan ASTRA, tahmini yakım, yakılan hammadde ──
  let kazanilan = 0, oncekiKazanilan = 0;
  for (const k of Object.keys(T)) if (/^z\|m\d+\|l\d+\|odul$/.test(k)) kazanilan += T[k].toplam;
  for (const k of Object.keys(O)) if (/^z\|m\d+\|l\d+\|odul$/.test(k)) oncekiKazanilan += O[k].toplam;
  const harcanan = islemler.reduce((t, x) => t + x.astra, 0), oncekiHarcanan = TURLER.reduce((t, tur) => t + toplamOf(O, `i|${tur}`), 0);
  const yakilan = {};
  for (const x of islemler) for (const [k, v] of Object.entries(x.hammadde)) yakilan[k] = (yakilan[k] || 0) + v;
  const ekonomi = {
    zindanKazanc: yuvarla(kazanilan), oncekiZindanKazanc: yuvarla(oncekiKazanilan), harcanan: yuvarla(harcanan), oncekiHarcanan: yuvarla(oncekiHarcanan),
    net: yuvarla(kazanilan - harcanan), kazancHarcamaOrani: oran(kazanilan, harcanan) == null ? null : yuvarla(kazanilan / harcanan, 3),
    tahminiYakim: yuvarla(harcanan * (Number(GAME_CONFIG.TOKEN_BURN_RATE) || 0)), yakilanHammadde: yakilan,
    yakilanHammaddeToplam: Object.values(yakilan).reduce((a, b) => a + b, 0)
  };

  // ── Tempo ve dağılımlar: son görüntü ve bir pencere öncesi ──
  const son = goruntu(db, bit), once = goruntu(db, oncekiBit);
  const r = { pencere, gunSayisi, baslangic: bas, bitis: bit, uretildi: simdi, zindan, islemler, ekonomi, tempo: son, oncekiTempo: once, uyarilar: [] };
  r.uyarilar = uyarilar(r);
  return r;
}

const sev = { kritik: 0, uyari: 1, bilgi: 2 };
const adi = { dovme: 'dövme', yukselt: 'yükseltme', onar: 'tamir', hurda: 'hurda', asker_al: 'asker alımı', iyilestir: 'iyileştirme', seviye: 'seviye atlama', mod_katki: 'mod katkısı', mod_gecis: 'mod geçişi' };

// Kural tabanlı otomatik uyarılar (saf: rapor nesnesinden). Her uyarı: { seviye: kritik|uyari|bilgi, konu, ileti, oneri }
export function uyarilar(r) {
  const u = [];
  const aktif = (r.tempo && r.tempo.aktif7) || 0;
  const islem = (tur) => (r.islemler.find((x) => x.tur === tur) || { adet: 0 });
  for (const z of r.zindan) {
    const ad = `${z.modAd} mod · Sv.${z.seviye} ${z.ad}`;
    if (z.giris >= ESIK.enAzGiris && z.oran != null) {
      if (z.oran >= ESIK.cokKolayOran) u.push({ seviye: 'uyari', konu: ad, ileti: `Çok kolay: ${z.giris} savaşın %${Math.round(z.oran * 100)}'i kazanıldı (ort. ${z.ortAsker} asker, takım ${z.ortTakimSeviye}).`, oneri: 'Canavarın canını/saldırısını artırmayı düşün.' });
      else if (z.oran <= ESIK.cokZorOran) u.push({ seviye: 'uyari', konu: ad, ileti: `Çok zor: ${z.giris} savaşın yalnız %${Math.round(z.oran * 100)}'i kazanıldı.`, oneri: 'Canavarı yumuşat ya da neden tıkandığına bak (asker hakkı, teçhizat maliyeti).' });
    }
    if (z.ilkOyuncu >= ESIK.enAzIlkOyuncu && z.ilkHedefOrani != null) {
      if (z.ilkHedefOrani > ESIK.cokYavasKat) u.push({ seviye: 'uyari', konu: ad, ileti: `İlk temizleme medyanı ${z.ilkMedyanGun}. gün; en hızlı hedef ${z.hedefGun}. gün (${z.ilkHedefOrani} katı).`, oneri: 'Canavar tempoya göre çok sert olabilir: ilerleme yavaşlıyor.' });
      else if (z.ilkHedefOrani < ESIK.hizliKat) u.push({ seviye: 'kritik', konu: ad, ileti: `İlk temizleme medyanı ${z.ilkMedyanGun}. gün; "en hızlı oyuncu" hedefi ${z.hedefGun}. gün: gerçek oyuncular modelden HIZLI.`, oneri: 'Model alt sınır varsayımı yanlış (örn. XP/stamina/silo sınırları, yeni bir kısayol): scripts/model/zindan_* yeniden ölçülmeli.' });
    }
  }
  if (aktif >= ESIK.enAzAktif) {
    const dovmeYukselt = islem('dovme').adet + islem('yukselt').adet;
    if (dovmeYukselt === 0) u.push({ seviye: 'kritik', konu: 'Teçhizat döngüsü', ileti: `${aktif} aktif oyuncu var ama bu pencerede hiç dövme ya da yükseltme yapılmadı.`, oneri: 'Teçhizat maliyeti/erişimi oyuncuyu caydırıyor olabilir ya da zindan teçhizatsız geçiliyor.' });
    if (r.ekonomi.yakilanHammaddeToplam === 0) u.push({ seviye: 'kritik', konu: 'Hammadde yakımı', ileti: 'Bu pencerede teçhizat/seviye işlemlerinde hiç hammadde yakılmadı.', oneri: 'Hammadde sink\'i çalışmıyor: yakım ve fiyat etkisi oluşmaz.' });
    const giris = r.zindan.reduce((t, z) => t + z.giris, 0);
    if (giris === 0) u.push({ seviye: 'bilgi', konu: 'Zindan', ileti: `${aktif} aktif oyuncu var ama bu pencerede zindan savaşı yok.`, oneri: 'Asker hakkı/ordu bedeli ilk adımı engelliyor olabilir.' });
  }
  const e = r.ekonomi;
  if (e.harcanan > 0 && e.kazancHarcamaOrani != null) {
    if (e.kazancHarcamaOrani > ESIK.odulHarcamaUst) u.push({ seviye: 'uyari', konu: 'ASTRA dengesi', ileti: `Zindan ödülü (${e.zindanKazanc}) harcamanın (${e.harcanan}) %${Math.round(e.kazancHarcamaOrani * 100)}'ine ulaştı.`, oneri: 'Oyuncular zindandan harcadıklarını geri alıyor: ödül çarpanını ya da günlük kişi tavanını gözden geçir.' });
    else if (e.kazancHarcamaOrani < ESIK.odulHarcamaAlt) u.push({ seviye: 'bilgi', konu: 'ASTRA dengesi', ileti: `Zindan ödülü, harcamanın yalnız %${Math.round(e.kazancHarcamaOrani * 100)}'i.`, oneri: 'Oyuncular zindandan çok az kazanıyor; uzun vadede bırakma riski.' });
  }
  const t = r.tempo;
  if (t && t.oyuncu > 0 && t.hakDolu / t.oyuncu >= ESIK.hakDoluOran) u.push({ seviye: 'bilgi', konu: 'Asker hakkı', ileti: `Oyuncuların %${Math.round((t.hakDolu / t.oyuncu) * 100)}'i asker hakkı sınırında.`, oneri: 'Beklenen: sınır teçhizat döngüsünü zorunlu kılar. Zindan ilerlemesi hızlı mı, ordu alımı mı baskın, kontrol et.' });
  for (const x of r.islemler) if (x.red > 0 && x.red > x.adet * 2 && x.red >= 10) u.push({ seviye: 'bilgi', konu: `${adi[x.tur] || x.tur} reddi`, ileti: `${x.red} ret / ${x.adet} başarılı: oyuncular sık sık yetersiz kaynakla deniyor.`, oneri: 'Maliyet/silo sınırı kullanıcıya yeterince açık değil mi?' });
  return u.sort((a, b) => sev[a.seviye] - sev[b.seviye]);
}
