// Realm of AdAstra — Kışla'nın saf kuralları: hangi eşya hangi yuvaya uyar, öneriler, asker listesi süzme ve sıralama.
// DOM'a dokunmaz; ekran (js/ui/ekran/kisla.js) ve testler (tests/test_kisla_kurallari.mjs) doğrudan içe alır.
// 11 Ekim 2026'da js/ui/barracks.js'ten baştan yazıldı.

export const YUVALAR = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
export const YUVA_AD = { weapon: 'Silah', helmet: 'Miğfer', armor: 'Zırh', legs: 'Dizlik', boots: 'Çizme' };
export const YUVA_SIMGE = { weapon: '⚔️', helmet: '🪖', armor: '🛡️', legs: '👖', boots: '👢' };

const kucuk = (s) => String(s ?? '').toLocaleLowerCase('tr-TR');

/** Sıralama için kaba güç: saldırı üç kat değerli sayılır. */
export const guc = (esya) => (esya ? (Number(esya.atkBonus) || 0) * 3 + (Number(esya.hpBonus) || 0) : 0);

/** Dayanıklılığı bitmemiş eşya güç verir (biten eşya takılı kalır ama etkisizdir; oyun kuralı). */
export const kullanilabilir = (esya) => !!esya && !(esya.durability !== undefined && esya.durability <= 0);

/** @returns {{cur: number, max: number, pct: number, ton: 'iyi'|'uyari'|'kotu'}} */
export function dayaniklilik(esya) {
  const max = Number(esya.maxDurability) || 13;
  const cur = esya.durability != null ? Number(esya.durability) : max;
  const pct = Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
  return { cur, max, pct, ton: cur <= 3 ? 'kotu' : (cur <= 7 ? 'uyari' : 'iyi') };
}

/** Can yüzdesine göre renk tonu. */
export const canTonu = (yuzde) => (yuzde <= 25 ? 'kotu' : (yuzde <= 60 ? 'uyari' : 'iyi'));

/** Bir eşyanın mevcut eşyaya göre farkı: { saldiri, can } (pozitif = daha güçlü). */
export function fark(esya, mevcut) {
  return {
    saldiri: (Number(esya.atkBonus) || 0) - (Number((mevcut || {}).atkBonus) || 0),
    can: (Number(esya.hpBonus) || 0) - (Number((mevcut || {}).hpBonus) || 0)
  };
}

/** Bir yuvaya takılabilecek boştaki eşyalar (krallık yuvası + cephanelik), güçlüden zayıfa. */
export function adaylar(state, yuva) {
  const liste = [];
  const krallik = (state.equipment || {})[yuva];
  if (krallik) liste.push({ item: krallik, source: 'kingdom', slotKey: yuva, armoryIndex: null });
  (state.armoryInventory || []).forEach((e, i) => {
    if (e && e.slot === yuva) liste.push({ item: e, source: 'armory', slotKey: yuva, armoryIndex: i });
  });
  return liste.sort((a, b) => guc(b.item) - guc(a.item) || dayaniklilik(b.item).cur - dayaniklilik(a.item).cur);
}

/** Bütün eşyalar: krallık yuvaları, cephanelik ve askerlerin üzerindekiler. */
export function tumEsyalar(state) {
  const liste = [];
  const krallik = state.equipment || {};
  YUVALAR.forEach((y) => { if (krallik[y]) liste.push({ item: krallik[y], source: 'kingdom', slotKey: y, armoryIndex: null, soldierIndex: null }); });
  (state.armoryInventory || []).forEach((e, i) => { if (e) liste.push({ item: e, source: 'armory', slotKey: e.slot, armoryIndex: i, soldierIndex: null }); });
  (state.soldierUnits || []).forEach((a, ai) => YUVALAR.forEach((y) => {
    const e = (a.equipment || {})[y];
    if (e) liste.push({ item: e, source: 'soldier', slotKey: y, armoryIndex: null, soldierIndex: ai });
  }));
  return liste;
}

/** Bir eşya kaydının benzersiz anahtarı (taşıma ve öneri eşlemesi için). */
export const esyaAnahtari = (e) => `${e.source}:${e.slotKey}:${e.armoryIndex ?? ''}:${e.soldierIndex ?? ''}`;

/**
 * Öneriler: boştaki eşyalar dağıtılır; her yuva türünde en güçlü eşya en zayıf (ya da boş) yuvalı askere önerilir
 * ve her asker yuvası yalnız bir kez önerilir (hepsi aynı askeri göstermesin).
 * @returns {Map<string, {idx: number, cur: object|undefined, sc: number}>}
 */
export function oneriler(esyalar, askerler) {
  const harita = new Map();
  YUVALAR.forEach((yuva) => {
    const hedefler = askerler
      .map((a, i) => { const cur = (a.equipment || {})[yuva]; return { idx: i, cur, sc: kullanilabilir(cur) ? guc(cur) : -1 }; })
      .sort((a, b) => a.sc - b.sc || a.idx - b.idx);
    const bosta = esyalar.filter((e) => e.source !== 'soldier' && e.slotKey === yuva).sort((a, b) => guc(b.item) - guc(a.item));
    let t = 0;
    for (const e of bosta) {
      while (t < hedefler.length && guc(e.item) <= hedefler[t].sc) t++;
      if (t >= hedefler.length) break;
      harita.set(esyaAnahtari(e), hedefler[t]);
      t++;
    }
  });
  return harita;
}

const doluYuva = (asker) => YUVALAR.filter((y) => (asker.equipment || {})[y]).length;

/**
 * Asker listesi: ada ya da numaraya göre arama, süzgeç (hepsi | yarali | eksik | on | arka) ve sıralama (sira | guc | can | eksik).
 * @param {object} gs   oyun durumu yöneticisi (getSoldierHealInfo, getSoldierFullStats)
 */
export function askerListesi(gs, { q = '', filtre = 'hepsi', sirala = 'sira' } = {}) {
  const sorgu = kucuk(q).trim();
  let liste = (gs.state.soldierUnits || []).map((s, i) => ({
    s, i,
    heal: gs.getSoldierHealInfo(i) || { hp: s.hp, maxHp: s.maxHp, hpPct: 100, isFull: true },
    stats: gs.getSoldierFullStats(i) || { totalAtk: 0, totalMaxHp: 0 },
    filled: doluYuva(s)
  }));
  if (sorgu) liste = liste.filter((r) => kucuk(r.s.name).includes(sorgu) || String(r.i + 1) === sorgu);
  if (filtre === 'yarali') liste = liste.filter((r) => !r.heal.isFull);
  else if (filtre === 'eksik') liste = liste.filter((r) => r.filled < YUVALAR.length);
  else if (filtre === 'on') liste = liste.filter((r) => r.s.row !== 'back');
  else if (filtre === 'arka') liste = liste.filter((r) => r.s.row === 'back');
  const siralayici = {
    guc: (a, b) => b.stats.totalAtk - a.stats.totalAtk,
    can: (a, b) => a.heal.hpPct - b.heal.hpPct,
    eksik: (a, b) => a.filled - b.filled
  }[sirala];
  if (siralayici) liste.sort(siralayici);
  return liste;
}

/** Süzgeç düğmelerindeki sayılar. */
export function sayilar(gs) {
  const liste = (gs.state.soldierUnits || []).map((s, i) => ({ s, heal: gs.getSoldierHealInfo(i) || { isFull: true }, filled: doluYuva(s) }));
  return {
    hepsi: liste.length,
    yarali: liste.filter((r) => !r.heal.isFull).length,
    eksik: liste.filter((r) => r.filled < YUVALAR.length).length,
    on: liste.filter((r) => r.s.row !== 'back').length,
    arka: liste.filter((r) => r.s.row === 'back').length
  };
}

/** Cephanelik süzgeci: yuva (hepsi | yuva adı) ve konum (bosta | askerde | hepsi); sıralama guc | seviye | yipranmis. */
export function cephanelikListesi(esyalar, { yuva = 'hepsi', nerede = 'bosta', sirala = 'guc' } = {}) {
  const konumUyar = (e) => nerede === 'hepsi' || (nerede === 'bosta') === (e.source !== 'soldier');
  const liste = esyalar.filter((e) => (yuva === 'hepsi' || e.slotKey === yuva) && konumUyar(e));
  const siralayici = {
    guc: (a, b) => guc(b.item) - guc(a.item),
    seviye: (a, b) => (b.item.level || 1) - (a.item.level || 1) || guc(b.item) - guc(a.item),
    yipranmis: (a, b) => dayaniklilik(a.item).cur - dayaniklilik(b.item).cur
  }[sirala] || ((a, b) => guc(b.item) - guc(a.item));
  return liste.sort(siralayici);
}
