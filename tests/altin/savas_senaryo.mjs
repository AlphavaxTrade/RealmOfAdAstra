// Savaş motoru altın kaydı için rastgele ama KESİN (tohumlu) senaryo üreticisi.
// Aynı senaryolar eski ve yeni motora verilir; sonuçların özeti birebir aynı çıkmalıdır.
// Motoru bilerek değiştirdiğinde: node tests/altin/savas_uret.mjs (farkı commit mesajında açıkla).
import crypto from 'node:crypto';
import { createUnit, simulateBattle, DEFAULT_BOSS_PHASES } from '../../js/combat.js';

// Motordan bağımsız küçük rastgele sayı üreteci (mulberry32), senaryoları kurmak için.
function uretec(tohum) {
  let a = (tohum >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OYUNCU_YETENEKLERI = ['shieldWall', 'shockwave', 'fieldMedic', 'armorBreaker', 'stunStrike', 'bloodFrenzy', 'lastStand'];
const CANAVAR_YETENEKLERI = ['cleave', 'sunder', 'regenerate', 'terrify', 'swoop'];
const DURUMLAR = [
  { type: 'burn', turns: 3, magnitude: 12 },
  { type: 'poison', turns: 4, magnitude: 7 },
  { type: 'weaken', turns: 3 },
  { type: 'chill', turns: 3 },
  { type: 'haste', turns: 3, magnitude: 0.4 },
  { type: 'taunt', turns: 2, stackable: false },
  { type: 'shield', turns: 3, magnitude: 40 },
  { type: 'fortify', turns: 3, magnitude: 0.3, stackable: false }
];

function sec(r, liste, min, max) {
  const n = min + Math.floor(r() * (max - min + 1));
  const kopya = [...liste];
  const sonuc = [];
  for (let i = 0; i < n && kopya.length; i++) sonuc.push(kopya.splice(Math.floor(r() * kopya.length), 1)[0]);
  return sonuc;
}
const aralik = (r, a, b) => a + r() * (b - a);
const tam = (r, a, b) => Math.round(aralik(r, a, b));

function birimSpec(r, taraf, no, guc) {
  const maxHp = tam(r, 40, 400) * guc;
  const spec = {
    uid: `${taraf}${no}`,
    name: `${taraf}-${no}`,
    level: tam(r, 1, 20),
    maxHp,
    atk: tam(r, 8, 60) * guc,
    armor: tam(r, 0, 90) * guc,
    speed: tam(r, 4, 30),
    row: r() < 0.5 ? 'front' : 'back'
  };
  if (r() < 0.4) spec.hp = Math.max(1, Math.round(maxHp * aralik(r, 0.2, 1)));
  if (r() < 0.5) spec.crit = aralik(r, 0, 0.5);
  if (r() < 0.3) spec.critDmg = aralik(r, 1.3, 2.6);
  if (r() < 0.4) spec.pen = tam(r, 0, 50);
  if (r() < 0.25) spec.lifesteal = aralik(r, 0.04, 0.2);
  if (r() < 0.8) spec.skills = sec(r, OYUNCU_YETENEKLERI, 1, 3);
  if (r() < 0.6) spec.abilities = sec(r, CANAVAR_YETENEKLERI, 1, 3);
  if (r() < 0.5) spec.abilityCooldown = tam(r, 1, 4);
  if (r() < 0.25) spec.actionsPerRound = tam(r, 1, 3);
  return spec;
}

// n. senaryo: { allies, enemies, secenek }
export function senaryoKur(n) {
  const r = uretec(0x5A17 + n * 7919);
  const muttefikSayisi = tam(r, 1, 6);
  const dusmanSayisi = r() < 0.2 ? 1 : tam(r, 1, 4);
  const guc = r() < 0.3 ? tam(r, 2, 8) : 1;
  const allies = [];
  const enemies = [];
  for (let i = 0; i < muttefikSayisi; i++) allies.push(createUnit(birimSpec(r, 'a', i, 1)));
  for (let i = 0; i < dusmanSayisi; i++) enemies.push(createUnit(birimSpec(r, 'e', i, guc)));
  // bazı birimlere savaş başında hazır durum ekle (yanma, zehir, hız ...)
  for (const u of [...allies, ...enemies]) {
    if (r() < 0.2) u.statuses.push({ stackable: true, ...DURUMLAR[Math.floor(r() * DURUMLAR.length)] });
  }
  const secenek = { seed: Math.floor(r() * 4294967296) };
  const boss = r() < 0.15;
  if (boss) {
    const seviye = r() < 0.5 ? 9 : 18;
    secenek.bossPhases = DEFAULT_BOSS_PHASES[seviye];
    enemies[0] = createUnit({
      uid: 'boss', name: 'Boss', maxHp: seviye === 9 ? 9500 : 38000, atk: seviye === 9 ? 520 : 1250,
      abilities: ['cleave', 'sunder', 'regenerate'], abilityCooldown: 2, row: 'front'
    });
  }
  if (r() < 0.2) secenek.maxRounds = tam(r, 3, 40);
  if (r() < 0.2) secenek.rageAfterRound = tam(r, 2, 15);
  return { allies, enemies, secenek };
}

// Sonucun karşılaştırılabilir özeti: anahtar sırası ve ölü alanlar sonucu etkilemesin
const YOKSAY = new Set(['element', 'revivedOnce', 'cooldowns']);
function duzenle(x) {
  if (Array.isArray(x)) return x.map(duzenle);
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x).sort()) {
      if (YOKSAY.has(k) || typeof x[k] === 'function') continue;
      o[k] = duzenle(x[k]);
    }
    return o;
  }
  return x;
}
export function ozet(sonuc) {
  const metin = JSON.stringify(duzenle(sonuc));
  return crypto.createHash('sha256').update(metin).digest('hex').slice(0, 16);
}

export function calistir(n) {
  const { allies, enemies, secenek } = senaryoKur(n);
  const sonuc = simulateBattle({ allies, enemies, ...secenek });
  return { sonuc, ozet: ozet(sonuc) };
}

export const SENARYO_SAYISI = 1500;
