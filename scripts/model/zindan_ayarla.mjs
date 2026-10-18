// Zindan canavar ayar aracı (18 Ekim 2026): her canavara bir HEDEF GÜN verilir ("en hızlı oyuncu bu canavarı en erken şu günde yener");
// araç, canavarın can ve saldırısını ortak bir çarpanla (m) büyütüp küçülterek (ikili arama) tempo modelindeki en erken günü hedefe oturtur.
// Her kat başında asker sayısı arttığı için eğri testere dişi olabilir; yalnız "canavar bir sonrakinden güçlü olmasın" şartı konur (izotonik).
// İki boss (9 ve 18) ayrıca, kendi hedef günlerine göre ayarlanır. js/bestiary.js DEĞİŞTİRİLMEZ; çıktı bir öneri tablosudur, kararı insan verir.
//   node scripts/model/zindan_ayarla.mjs                  Normal mod (~120 gün) için öneri tablosu
//   node scripts/model/zindan_ayarla.mjs --yaz=ayar.json  aynı öneriyi {"9":{"hp":..,"atk":..}} olarak yazar (zindan_denge/zindan_tempo --ayar= ile denenir)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canavarlar, HAK_KURALLARI } from './zindan_denge.mjs';
import { enErkenGun } from './zindan_tempo.mjs';

// Normal mod takvimi (kullanıcı kararı 18 Ekim 2026: en hızlı oyuncu ~120 günde bitirir). Gün = en erken yenilme günü (alt sınır).
export const NORMAL_TAKVIM = { 1: 0, 2: 1, 3: 2.5, 4: 5, 5: 7, 6: 10, 7: 14, 8: 20, 9: 30, 10: 42, 11: 52, 12: 62, 13: 75, 14: 86, 15: 98, 16: 108, 17: 114, 18: 120 };
export const BOSSLAR = [9, 18];

const yuvarla = (v, adim) => Math.max(adim, Math.round(v / adim) * adim);
// canavarı m kat güçlendirir (can ve saldırı birlikte); yetenekler ve ödül XP'si aynı kalır
export const olcekle = (c, m) => ({ ...c, hp: yuvarla(c.hp * m, 50), atk: yuvarla(c.atk * m, 5) });
const sapma = (gun, hedef) => Math.abs(Math.log((gun + 0.5) / (hedef + 0.5)));

// hedef güne en yakın çarpanı bulur: gün çarpanla artar (ikili arama, logaritmik). kur(m): çarpandan canavarı üretir
export function ayarla(kur, hak, hedefGun, { tolerans = 0.06, adim = 18 } = {}) {
  let alt = 0.2, ust = 40, enIyi = null;
  for (let i = 0; i < adim; i++) {
    const m = Math.sqrt(alt * ust);
    const e = enErkenGun(kur(m), hak);
    const gun = e ? e.gun : Infinity;
    if (e && (!enIyi || sapma(gun, hedefGun) < sapma(enIyi.gun, hedefGun))) enIyi = { m, gun, e };
    if (e && sapma(gun, hedefGun) <= tolerans) break;
    if (gun > hedefGun) ust = m; else alt = m;
  }
  return enIyi;
}

// azalmayan (izotonik) en küçük kareler: komşu ihlalleri ortalama ile giderir (PAV). Her kat başında asker sayısı arttığı için eğri
// testere dişi olabilir; canavarın gücü bir sonrakinden büyük çıkmasın diye yalnız "azalmama" şartı konur, düzgünleştirme yapılmaz.
export function azalmayan(degerler) {
  const blok = [];
  for (const v of degerler) {
    blok.push({ toplam: v, adet: 1 });
    while (blok.length > 1 && blok[blok.length - 2].toplam / blok[blok.length - 2].adet > blok[blok.length - 1].toplam / blok[blok.length - 1].adet) {
      const son = blok.pop(), once = blok.pop();
      blok.push({ toplam: once.toplam + son.toplam, adet: once.adet + son.adet });
    }
  }
  return blok.flatMap(b => Array(b.adet).fill(b.toplam / b.adet));
}

// Boss: iki biçimde kurulabilir (kullanıcıya gösterilen "boss neye benzesin" seçimi):
//   'can'  : saldırısı önceki normal canavarın BOSS_ATK_ORANI katı (boss "daha sert vurur" kalsın); yalnız canı ayarlanır
//   'atk'  : canı önceki normal canavarın BOSS_HP_ORANI katı (boss "daha çok can" kalsın); yalnız saldırısı ayarlanır
const BOSS_ATK_ORANI = { 9: 1.25, 18: 1.30 };
const BOSS_HP_ORANI = { 9: 1.3, 18: 1.5 };

// Normal mod önerisi: { [seviye]: { hp, atk } } ve her canavar için bulunan gün
export function normalOneri({ takvim = NORMAL_TAKVIM, hak = HAK_KURALLARI['kat+1'], boss = 'atk' } = {}) {
  const liste = canavarlar();
  const normal = liste.filter(c => !BOSSLAR.includes(c.level));
  const ham = normal.map(c => ({ c, r: ayarla(m => olcekle(c, m), hak(c), takvim[c.level]) }));
  const hpler = azalmayan(ham.map(({ c, r }) => c.hp * (r ? r.m : 1)));
  const atkler = azalmayan(ham.map(({ c, r }) => c.atk * (r ? r.m : 1)));
  const oneri = {};
  ham.forEach(({ c }, i) => { oneri[c.level] = { hp: yuvarla(hpler[i], 50), atk: yuvarla(atkler[i], 5) }; });
  for (const L of BOSSLAR) {
    const c = liste.find(x => x.level === L), onceki = oneri[L - 1];
    if (boss === 'atk') {
      const hp = yuvarla(onceki.hp * BOSS_HP_ORANI[L], 50);
      const r = ayarla(a => ({ ...c, hp, atk: yuvarla(c.atk * a, 5) }), hak(c), takvim[L]);
      oneri[L] = { hp, atk: yuvarla(c.atk * (r ? r.m : 1), 5) };
    } else {
      const atk = yuvarla(onceki.atk * BOSS_ATK_ORANI[L], 5);
      const r = ayarla(h => ({ ...c, hp: yuvarla(c.hp * h, 50), atk }), hak(c), takvim[L]);
      oneri[L] = { hp: yuvarla(c.hp * (r ? r.m : 1), 50), atk };
    }
  }
  // doğrulama: önerilen değerlerle en erken gün
  const sonuc = liste.map(c => ({ c, o: oneri[c.level], e: enErkenGun({ ...c, ...oneri[c.level] }, hak(c)) }));
  return { oneri, sonuc };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const arg = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
  const hak = HAK_KURALLARI['kat+1'];
  const { oneri, sonuc } = normalOneri({ boss: arg.boss === 'can' ? 'can' : 'atk' });
  console.log('Normal mod önerisi (hak = kat+1). hedef gün = en hızlı oyuncunun en erken yenilme günü.');
  console.log('lv  canavar                    hak | şimdi can/sld  → öneri can/sld   | hedef  bulunan gün  asker sv.  takım');
  for (const { c, o, e } of sonuc) {
    console.log(`${String(c.level).padStart(2)}  ${c.name.padEnd(26)}${String(hak(c)).padStart(3)} | ${String(c.hp).padStart(6)}/${String(c.atk).padEnd(5)} → ${String(o.hp).padStart(6)}/${String(o.atk).padEnd(5)} | ${String(NORMAL_TAKVIM[c.level]).padStart(5)}  ${String(e ? e.gun : '-').padStart(10)}  ${String(e ? e.askerSeviyesi : '-').padStart(9)}  ${String(e ? e.takim : '-').padStart(5)}`);
  }
  const L = (n) => oneri[n];
  console.log(`\nBoss oranı: canavar 9 / 8 can ${(L(9).hp / L(8).hp).toFixed(2)}x, sld ${(L(9).atk / L(8).atk).toFixed(2)}x · canavar 18 / 17 can ${(L(18).hp / L(17).hp).toFixed(2)}x, sld ${(L(18).atk / L(17).atk).toFixed(2)}x`);
  const duzenli = Object.keys(oneri).map(Number).filter(n => !BOSSLAR.includes(n)).sort((a, b) => a - b);
  const bozuk = duzenli.filter((n, i) => i > 0 && oneri[n].hp < oneri[duzenli[i - 1]].hp);
  console.log(bozuk.length ? `UYARI: can eğrisi bu seviyelerde düşüyor: ${bozuk.join(', ')}` : 'Normal canavarların can eğrisi her seviyede artıyor.');
  if (arg.yaz) { fs.writeFileSync(arg.yaz, JSON.stringify(Object.fromEntries(Object.entries(oneri)), null, 2)); console.log(`Öneri yazıldı: ${arg.yaz}`); }
}
