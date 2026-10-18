// Zindan modları (Zor, Uzman, Cehennem) canavar tabloları hesabı (18 Ekim 2026). Her mod, Normal mod gibi ele alınır: o modun TAKVİMİNDE
// (en hızlı oyuncu için gün) her canavara bir hedef gün verilir ve canavarın can/saldırısı tempo modelinde (zindan_tempo.mjs) o güne oturacak
// biçimde ayarlanır (zindan_ayarla.mjs ile aynı yöntem: ikili arama, izotonik düzeltme, boss'lar ayrı).
// Hak (js/economy/ordu-hakki.js) modlar arasında birikir: Zor 8-13, Uzman 14-19, Cehennem 20-25 asker. js/config.js DEĞİŞTİRİLMEZ.
//   node scripts/model/zindan_mod.mjs [--mod=1|2|3] [--yaz=dosya.json]   (hızlı örnekleme; mod başına birkaç dakika)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ayarla, azalmayan, ikinciDereceUydur, NORMAL_TAKVIM, BOSSLAR } from './zindan_ayarla.mjs';
import { ordu } from './zindan_denge.mjs';
import { enErkenGun, seviyeGunu } from './zindan_tempo.mjs';
import { canavarlar } from './zindan_denge.mjs';
import { askerHakki } from '../../js/economy/ordu-hakki.js';

// Mod takvimi (kullanıcı kararı 18 Ekim 2026: Normal ~120 gün; sonraki modlar 1,5-2 kat uzar, dört mod toplam ~2 yıl). En hızlı oyuncu için gün.
export const MOD_TAKVIMI = {
  1: { ad: 'Zor', bas: 140, son: 300 },
  2: { ad: 'Uzman', bas: 320, son: 500 },
  3: { ad: 'Cehennem', bas: 530, son: 800 }
};
// canavar başına hedef gün: Normal takvimin biçimi (erken yoğun) modun gün aralığına yayılır
export const modTakvimi = (mod) => {
  const t = MOD_TAKVIMI[mod];
  return Object.fromEntries(Object.entries(NORMAL_TAKVIM).map(([L, g]) => [L, Math.round((t.bas + (t.son - t.bas) * g / NORMAL_TAKVIM[18]) * 10) / 10]));
};

// Saldırı, hedef günde beklenen askerin canına oranlanır (tek vuruşta asker öldürme "uçurumu" tek çarpanla ayarı gürültülü yapıyordu):
// atk = KAPPA × (o günkü hesap seviyesinde, KUMAS seviyesi tam takımlı askerin canı). Normal modun son katlarında bu oran ~0,55'tir.
// Yalnız can, hedef güne oturacak biçimde ayarlanır; sonra düzgün eğri ve azalmama şartı.
const KAPPA = 0.55, KUMAS = 8;
const BOSS_ATK_KATI = 1.15;   // boss saldırısı için başlangıç noktası (sonra takvime göre ayarlanır)
const BOSS_CAN_KATI = 1.3;    // boss, önceki normal canavardan en az bu kadar canlı
const yuvarla = (v, adim) => Math.max(adim, Math.round(v / adim) * adim);
const gunSeviyesi = (gun) => { let s = 1; while (s < 81 && seviyeGunu(s) < gun) s += 1; return s; };
const askerCani = (seviye) => ordu(1, seviye, KUMAS).getSoldierFullStats(0).totalMaxHp;

export function modOneri(mod, { ornek = 80 } = {}) {
  const takvim = modTakvimi(mod), liste = canavarlar();
  const hak = (c) => askerHakki({ ilerleme: c.level, mod });
  const enOpt = { ornek, enYuksekSeviye: 81 };
  const saldiri = (c) => yuvarla(KAPPA * askerCani(gunSeviyesi(takvim[c.level])) * (BOSSLAR.includes(c.level) ? BOSS_ATK_KATI : 1), 5);
  const bulunan = liste.map((c) => {
    const atk = saldiri(c);
    const r = ayarla(h => ({ ...c, hp: yuvarla(h, 50), atk }), hak(c), takvim[c.level], { aralik: [200, 4e6], adim: 24, tolerans: 0.05, enOpt });
    return { c, atk, hp: r ? yuvarla(r.m, 50) : null };
  });
  // Aynı can/saldırıda farklı yetenekler çok farklı zorluk verir. Can bu yüzden DÜZGÜN ve artan bir eğri olur (oyuncunun gördüğü sayı:
  // derinlere indikçe büyür); takvime oturtmak için canavar başına yalnız SALDIRI ayarlanır (yeteneği güçlü canavar daha hafif vurur).
  const normal = bulunan.filter(x => !BOSSLAR.includes(x.c.level) && x.hp);
  const hpEgri = ikinciDereceUydur(normal.map(x => [x.c.level, Math.log(x.hp)]));
  const hpDuzgun = {};
  azalmayan(liste.filter(c => !BOSSLAR.includes(c.level)).map(c => hpEgri(c.level))).forEach((v, i) => { hpDuzgun[liste.filter(c => !BOSSLAR.includes(c.level))[i].level] = yuvarla(v, 50); });
  const oneri = {};
  const ayarSaldiri = (c, hp) => {
    const atk0 = saldiri(c);
    const r = ayarla(a => ({ ...c, hp, atk: yuvarla(atk0 * a, 5) }), hak(c), takvim[c.level], { aralik: [0.05, 5], adim: 18, tolerans: 0.05, enOpt });
    return { hp, atk: yuvarla(atk0 * (r ? r.m : 1), 5), tamam: !!r };   // tamam: hedef güne oturan bir saldırı bulundu mu
  };
  for (const c of liste.filter(x => !BOSSLAR.includes(x.level))) oneri[c.level] = ayarSaldiri(c, hpDuzgun[c.level]);
  // Boss en çok canlı olan olsun ama saldırısı gülünç düşmesin: can katını 1,3'ten 1,0'a indirerek, saldırı komşunun %60'ına ulaşana kadar dene
  for (const L of BOSSLAR) {
    const c = liste.find(x => x.level === L);
    for (const kat of [BOSS_CAN_KATI, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6]) {
      oneri[L] = ayarSaldiri(c, yuvarla(hpDuzgun[L - 1] * kat, 50));
      if (oneri[L].tamam && oneri[L].atk >= 0.6 * oneri[L - 1].atk) break;   // yenilebilir ve saldırısı gülünç düşük değil
    }
  }
  const sonuc = liste.map(c => ({ c, o: oneri[c.level], e: enErkenGun({ ...c, ...oneri[c.level] }, hak(c), enOpt) }));
  return { oneri, sonuc };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const arg = Object.fromEntries(process.argv.slice(2).map(x => { const [k, v] = x.replace(/^--/, '').split('='); return [k, v ?? true]; }));
  const modlar = arg.mod ? [Number(arg.mod)] : [1, 2, 3];
  const tum = {};
  for (const m of modlar) {
    const t = modTakvimi(m), { oneri, sonuc } = modOneri(m);
    tum[m] = oneri;
    console.log(`\n== ${MOD_TAKVIMI[m].ad} (mod ${m}): hedef gün ${MOD_TAKVIMI[m].bas} → ${MOD_TAKVIMI[m].son}`);
    console.log('lv  hak | Normal can/sld  → mod can/sld      | hedef  bulunan gün  asker sv.  takım');
    for (const { c, o, e } of sonuc) {
      console.log(`${String(c.level).padStart(2)}  ${String(askerHakki({ ilerleme: c.level, mod: m })).padStart(3)} | ${`${c.hp}/${c.atk}`.padStart(13)} → ${`${o.hp}/${o.atk}`.padEnd(16)} | ${String(t[c.level]).padStart(5)}  ${String(e ? e.gun : '-').padStart(10)}  ${String(e ? e.askerSeviyesi : '-').padStart(9)}  ${String(e ? e.takim : '-').padStart(5)}`);
    }
  }
  if (arg.yaz) { fs.writeFileSync(arg.yaz, JSON.stringify(tum, null, 2)); console.log(`\nYazıldı: ${arg.yaz}`); }
}
