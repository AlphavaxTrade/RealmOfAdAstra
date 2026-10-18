// Zindan dengesi ölçüm aracı (18 Ekim 2026): "hangi canavarı, kaç askerle, hangi askerin seviyesinde ve hangi tam takım teçhizatla
// %80 ihtimalle yeneriz?" sorusunu GERÇEK savaş motoruyla (js/combat.js predictBattle, sabit tohum: sonuç her çalıştırmada aynı) cevaplar.
//   node scripts/model/zindan_denge.mjs                  Normal mod tablosu, hak = geçilen kat + 1 (2..7 asker)
//   node scripts/model/zindan_denge.mjs --hak=seviye     hak = canavar seviyesi (kodun eski yazılışı)
//   node scripts/model/zindan_denge.mjs --hak=kat        hak = kat (1..6)
//   node scripts/model/zindan_denge.mjs --ayar=ayar.json canavar değerlerini deneme amaçlı değiştir: {"9":{"hp":7000,"atk":400}}
//   node scripts/model/zindan_denge.mjs --maliyet        bir askerin tam takımının birikimli maliyeti (hammadde, ASTRA değeri)
// Oyun dosyalarını DEĞİŞTİRMEZ. Başka betikler ve test: `import { ... } from './zindan_denge.mjs'`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// oyunun kayıt deposu (localStorage) bellekte taklit edilir; modüller içe alınmadan ÖNCE kurulmalı
const depo = new Map();
globalThis.localStorage = { getItem: k => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: k => { depo.delete(k); } };
const imp = p => import(pathToFileURL(path.join(kok, p)).href);
const { GameStateManager } = await imp('js/gameState.js');
const { GAME_CONFIG } = await imp('js/config.js');
const { DUNGEON_LEVELS } = await imp('js/bestiary.js');
const { predictBattle } = await imp('js/combat.js');
const { ammMarket } = await imp('js/ammMarket.js');
const { globalPool } = await imp('js/globalPool.js');
const { treasury } = await imp('js/treasury.js');

export { DUNGEON_LEVELS, GAME_CONFIG };
export const YUVALAR = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
export const ESIK = 80;                     // "yenebiliriz" = en az %80 kazanma ihtimali
export const ORNEK = 60;                    // her hücre için oynanan savaş sayısı (sabit tohumlu)
export const katOf = (seviye) => Math.ceil(seviye / 3);   // 1-3 → 1. kat … 16-18 → 6. kat

// Asker hakkı varyantları (canavar → izin verilen asker sayısı)
export const HAK_KURALLARI = {
  'kat+1': c => katOf(c.level) + 1,
  kat: c => katOf(c.level),
  seviye: c => c.level
};

// Seviye k teçhizatı: yükseltme formülü js/gameState/techizat.js (taban × (1 + (k-1) × 0,35)); ölçü testi bunu gerçek koda karşı korur
export function esyaOlustur(yuva, seviye) {
  const t = GAME_CONFIG.EQUIPMENT_RECIPES[yuva];
  const k = 1 + (seviye - 1) * 0.35;
  return { slot: yuva, level: seviye, baseAtk: t.baseAtk, baseHp: t.baseHp, atkBonus: Math.round(t.baseAtk * k), hpBonus: Math.round(t.baseHp * k), durability: 13, maxDurability: 13, name: t.name };
}

// n askerli, hepsi `seviye` seviyesinde ve `tier` seviyesinde tam takımlı (tier 0 = çıplak) bir oyun durumu
export function ordu(n, seviye, tier) {
  depo.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  gs.state.adAstraBalance = 1e12;
  gs.state.village = { houses: 20, villagers: 400, labor: 0, lastGrowthAt: 0, starvingSince: 0 };
  const eski = GAME_CONFIG.ORDU_SINIRI;
  GAME_CONFIG.ORDU_SINIRI = { ASKER_SEVIYESI_HESAP_SEVIYESINI_GECEMEZ: false, ASKER_HAKKI_ZINDAN_KATINA_BAGLI: false };   // ölçüm sınırsız kurar
  try { for (let i = 0; i < n; i++) gs.buySoldierUnit(); } finally { GAME_CONFIG.ORDU_SINIRI = eski; }
  const atkSeviye = GAME_CONFIG.SOLDIER_ATK_PER_LEVEL || 6, hpSeviye = GAME_CONFIG.SOLDIER_HP_PER_LEVEL || 25;
  for (const a of gs.state.soldierUnits) {
    a.level = seviye; a.baseAtk = 25 + (seviye - 1) * atkSeviye; a.maxHp = 100 + (seviye - 1) * hpSeviye; a.hp = a.maxHp; a.atk = a.baseAtk;
    a.equipment = {};
    if (tier > 0) for (const y of YUVALAR) a.equipment[y] = esyaOlustur(y, tier);
  }
  return gs;
}

// Bir canavara karşı ilk n askerin kazanma yüzdesi (sabit tohum)
export function kazanmaSansi(gs, canavar, n, ornek = ORNEK) {
  const secili = [...Array(n).keys()];
  const kurulum = gs.buildDungeonBattleUnits(canavar, secili);
  return predictBattle(() => gs.buildDungeonBattleUnits(canavar, secili).allies, () => gs.buildDungeonBattleUnits(canavar, secili).enemies, ornek,
    { bossPhases: kurulum.bossPhases, seedBase: 20261018 + canavar.level }).winChance;
}

// %80 için gereken en az tam takım seviyesi (0 = çıplak yeter); en yüksek takımla bile olmazsa null
export function gerekenTakimSeviyesi(canavar, n, askerSeviyesi, { enYuksek = GAME_CONFIG.EQUIPMENT_MAX_LEVEL || 10, ornek = ORNEK } = {}) {
  for (let t = 0; t <= enYuksek; t++) if (kazanmaSansi(ordu(n, askerSeviyesi, t), canavar, n, ornek) >= ESIK) return t;
  return null;
}

// %80 için gereken en az asker sayısı (çıplak, verilen seviyede); `en çok`ta bile olmazsa null
export function gerekenAsker(canavar, askerSeviyesi, { adaylar = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 24, 30, 40], ornek = ORNEK } = {}) {
  const gs = ordu(Math.max(...adaylar), askerSeviyesi, 0);
  for (const n of adaylar) if (kazanmaSansi(gs, canavar, n, ornek) >= ESIK) return n;
  return null;
}

// Bir askerin tam takımının (5 parça) dövme + tüm yükseltmeleriyle birikimli maliyeti
export function takimMaliyeti(seviye) {
  const gs = ordu(1, 1, 0);
  let odun = 0, demir = 0, komur = 0, tas = 0;
  for (const y of YUVALAR) {
    const t = GAME_CONFIG.EQUIPMENT_RECIPES[y];
    const m = gs.getCumulativeEquipmentResourceCost({ level: seviye, slot: y, baseAtk: t.baseAtk, baseHp: t.baseHp });
    odun += m.totalWood; demir += m.totalIron; komur += m.totalCoal; tas += m.totalStone;
  }
  const astra = ammMarket.calculateResourcesAdAstraValue({ wood: odun, iron: demir, coal: komur, stone: tas }).totalAda;
  return { odun, demir, komur, tas, astra: Math.round(astra * 10) / 10 };
}

// Canavar tablosuna deneme amaçlı değişiklik uygular (kopya üzerinde; gerçek tabloyu bozmaz)
export function canavarlar(ayar = {}) {
  return DUNGEON_LEVELS.map(c => ({ ...c, ...(ayar[c.level] || {}) }));
}

// Tablo: satır = canavar, sütun = askerin seviyesi; hücre = gereken tam takım seviyesi (0 çıplak, X yetmez)
export function takimTablosu(hakAdi = 'kat+1', { ayar = {}, seviyeler = [1, 5, 10, 20, 30], ornek = ORNEK } = {}) {
  const hak = HAK_KURALLARI[hakAdi];
  return canavarlar(ayar).map(c => ({ canavar: c, hak: hak(c), hucre: seviyeler.map(s => gerekenTakimSeviyesi(c, hak(c), s, { ornek })) }));
}

// ── komut satırı ────────────────────────────────────────────────────────
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const arg = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
  if (arg.maliyet) {
    console.log('Bir askerin tam takımının birikimli maliyeti:');
    for (const t of [1, 2, 3, 5, 7, 10]) { const m = takimMaliyeti(t); console.log(`  seviye ${String(t).padStart(2)}: odun ${m.odun}, demir ${m.demir}, kömür ${m.komur}, taş ${m.tas} (~${m.astra} ASTRA)`); }
  } else {
    const hakAdi = typeof arg.hak === 'string' ? arg.hak : 'kat+1';
    if (!HAK_KURALLARI[hakAdi]) { console.error('--hak değerleri: ' + Object.keys(HAK_KURALLARI).join(', ')); process.exit(2); }
    const ayar = arg.ayar ? JSON.parse(fs.readFileSync(arg.ayar, 'utf8')) : {};
    const seviyeler = [1, 5, 10, 20, 30];
    console.log(`Hak kuralı: ${hakAdi}. Hücre: %${ESIK} için gereken en az TAM TAKIM seviyesi (0 = çıplak yeter, X = en yüksek takımla bile yok). ${ORNEK} savaş, sabit tohum.`);
    console.log('lv  canavar                    hak | ' + seviyeler.map(s => ('Sv.' + s).padEnd(6)).join(' '));
    for (const s of takimTablosu(hakAdi, { ayar, seviyeler })) {
      console.log(String(s.canavar.level).padStart(2) + '  ' + s.canavar.name.padEnd(26) + String(s.hak).padStart(3) + '  | ' + s.hucre.map(h => String(h ?? 'X').padEnd(6)).join(' '));
    }
  }
}
