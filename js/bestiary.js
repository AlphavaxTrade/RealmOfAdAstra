// Realm of AdAstra — Yaratık Kütüğü (Bestiary)
// ============================================================================
// Zindandaki 18 canavarın TEK tablosu. Zindan ekranı (js/ui/zindan/),
// savaş kurulumu (gameState.buildDungeonBattleUnits) ve belge betikleri
// canavar bilgisini yalnızca buradan okur.
//
// hp / atk  : savaşta kullanılan gerçek değerler
// rewardXp  : zaferde savaşa katılan her askere verilen deneyim
// ASTRA ve hesap XP ödülü tablodan değil formülden gelir: gameState.getDungeonBaseReward
// (GAME_CONFIG.DUNGEON.REWARD_*).
// color     : haritadaki oda çerçevesinin rengi (Phaser)
// ============================================================================

import { DEFAULT_BOSS_PHASES } from './combat.js';

// 6 kat × 3 seviye = 18 bölüm
export const DUNGEON_LEVELS = [
  // ── 1. KAT: Kristal Mağarası ─────────────────────────────────────────
  { level: 1,  floor: 1, name: 'Bataklık Balçığı',          icon: '🟢', avatar: 'assets/monster_swamp_slime.jpg',   hp: 200,   atk: 30,   rewardXp: 40,   color: 0x22c55e, abilities: [] },
  { level: 2,  floor: 1, name: 'Mağara Goblini',            icon: '👺', avatar: 'assets/monster_cave_goblin.jpg',   hp: 950,   atk: 125,   rewardXp: 80,   color: 0x06b6d4, abilities: ['swoop'] },
  { level: 3,  floor: 1, name: 'Gölge Kurdu',               icon: '🐺', avatar: 'assets/monster_shadow_wolf.jpg',   hp: 1500,   atk: 190,  rewardXp: 130,  color: 0xf59e0b, abilities: ['swoop'], isFloorGuard: true },

  // ── 2. KAT: Kemik Mahzeni ─────────────────────────────────────────────
  { level: 4,  floor: 2, name: 'Kemik Mahzeni İskeletleri', icon: '💀', avatar: 'assets/monster_skeleton.jpg',      hp: 2750,  atk: 335,  rewardXp: 200,  color: 0x22c55e, abilities: ['sunder'] },
  { level: 5,  floor: 2, name: 'Lanetli Kemik Büyücüsü',    icon: '🧙‍♂️', avatar: 'assets/monster_skeleton.jpg',      hp: 3700,  atk: 410,  rewardXp: 260,  color: 0x06b6d4, abilities: ['terrify'] },
  { level: 6,  floor: 2, name: 'Kemik Taht Muhafızı',       icon: '🗡️', avatar: 'assets/monster_skeleton.jpg',      hp: 4150,  atk: 445,  rewardXp: 320,  color: 0xf59e0b, abilities: ['cleave', 'regenerate'], isFloorGuard: true },

  // ── 3. KAT: Kadim Tapınak — ARA BOSS ──────────────────────────────────
  { level: 7,  floor: 3, name: 'Karanlık Tarikatçı',        icon: '🧙‍♂️', avatar: 'assets/monster_stone_goliath.jpg', hp: 6450,  atk: 645,  rewardXp: 400,  color: 0x22c55e, abilities: ['terrify'] },
  { level: 8,  floor: 3, name: 'Cehennem Tazısı',           icon: '🐺', avatar: 'assets/monster_shadow_wolf.jpg',   hp: 6450,  atk: 645,  rewardXp: 480,  color: 0x06b6d4, abilities: ['swoop', 'cleave'] },
  { level: 9,  floor: 3, name: 'Kadim Taş Golyat',          icon: '🗿', avatar: 'assets/monster_stone_goliath.jpg', hp: 8400,  atk: 635,  rewardXp: 1800, color: 0xef4444, abilities: ['cleave', 'sunder', 'regenerate'], isBoss: true, bossLabel: 'ARA BOSS', bossPhases: DEFAULT_BOSS_PHASES[9] },

  // ── 4. KAT: Lanetli Firavun Mezarı ────────────────────────────────────
  { level: 10, floor: 4, name: 'Sargılı Mumyalar',          icon: '🧟', avatar: 'assets/monster_skeleton.jpg',      hp: 11100,  atk: 970,  rewardXp: 560,  color: 0x22c55e, abilities: ['sunder'] },
  { level: 11, floor: 4, name: 'Gölge Hayaletler',          icon: '👻', avatar: 'assets/monster_shadow_wolf.jpg',   hp: 11900,  atk: 1005,  rewardXp: 640,  color: 0x06b6d4, abilities: ['swoop', 'terrify'] },
  { level: 12, floor: 4, name: 'Lanetli Firavun',           icon: '👑', avatar: 'assets/monster_stone_goliath.jpg', hp: 12550,  atk: 1020,  rewardXp: 720,  color: 0xf59e0b, abilities: ['cleave', 'regenerate', 'terrify'], isFloorGuard: true },

  // ── 5. KAT: Kaynayan Lav Çukuru ──────────────────────────────────────
  { level: 13, floor: 5, name: 'Ateş İblisleri',            icon: '😈', avatar: 'assets/monster_fire_demon.jpg',    hp: 13500,  atk: 1065,  rewardXp: 800,  color: 0x22c55e, abilities: ['cleave'] },
  { level: 14, floor: 5, name: 'Lav Elementalleri',         icon: '🌋', avatar: 'assets/monster_fire_demon.jpg',    hp: 15450, atk: 1175,  rewardXp: 880,  color: 0x06b6d4, abilities: ['cleave', 'regenerate'] },
  { level: 15, floor: 5, name: 'Obsidyen Berserker',        icon: '⚔️', avatar: 'assets/monster_fire_demon.jpg',    hp: 15700, atk: 1175,  rewardXp: 960,  color: 0xf59e0b, abilities: ['cleave', 'sunder'], isFloorGuard: true },

  // ── 6. KAT: Kıyamet Mabedi — FİNAL ───────────────────────────────────
  { level: 16, floor: 6, name: 'Kıyamet Şövalyesi',         icon: '🛡️', avatar: 'assets/monster_fire_demon.jpg',    hp: 18750, atk: 1340, rewardXp: 1100, color: 0x22c55e, abilities: ['cleave', 'sunder'] },
  { level: 17, floor: 6, name: 'Kadim Gölge Lordu',         icon: '👁️', avatar: 'assets/monster_dragon_ignis.jpg',  hp: 21600, atk: 1450, rewardXp: 1300, color: 0x06b6d4, abilities: ['terrify', 'swoop', 'cleave'] },
  { level: 18, floor: 6, name: 'Kıyamet Ejderhası IGNIS',   icon: '🐉', avatar: 'assets/monster_dragon_ignis.jpg',  hp: 32400, atk: 805,  rewardXp: 6000, color: 0xef4444, abilities: ['cleave', 'sunder', 'swoop', 'regenerate'], isBoss: true, bossLabel: 'BÜYÜK BOSS', bossPhases: DEFAULT_BOSS_PHASES[18] }
];

// ── Zindan modları (js/config.js ZINDAN_MODLARI) ─────────────────────────────────────────────────────────
// Zor (1), Uzman (2), Cehennem (3) modlarında aynı 18 canavar çok daha güçlüdür; adları, yetenekleri ve ödül XP'si aynıdır, yalnız
// can (hp) ve saldırı (atk) değişir. Tablo scripts/model/zindan_mod.mjs ile hesaplanır: en hızlı oyuncunun her canavarı modun
// takvimindeki günde yenebilmesi hedeflenir (Zor 140-300. gün, Uzman 320-500, Cehennem 530-800). Normal mod tablosu yukarıdadır.
export const MOD_CANAVARLARI = {
  1: {   // Zor
    1: { hp: 49100, atk: 1040 }, 2: { hp: 52600, atk: 930 }, 3: { hp: 56300, atk: 835 },
    4: { hp: 60100, atk: 1055 }, 5: { hp: 64000, atk: 1260 }, 6: { hp: 68000, atk: 710 },
    7: { hp: 72150, atk: 1385 }, 8: { hp: 76350, atk: 880 }, 9: { hp: 84000, atk: 600 },
    10: { hp: 84950, atk: 1210 }, 11: { hp: 89350, atk: 1275 }, 12: { hp: 93750, atk: 975 },
    13: { hp: 98150, atk: 935 }, 14: { hp: 102600, atk: 945 }, 15: { hp: 106950, atk: 1115 },
    16: { hp: 111300, atk: 1210 }, 17: { hp: 115550, atk: 1300 }, 18: { hp: 127100, atk: 795 }
  },
  2: {   // Uzman
    1: { hp: 162000, atk: 1250 }, 2: { hp: 163600, atk: 1080 }, 3: { hp: 165550, atk: 1120 },
    4: { hp: 167850, atk: 1355 }, 5: { hp: 170500, atk: 1625 }, 6: { hp: 121600, atk: 1430 },
    7: { hp: 176950, atk: 1945 }, 8: { hp: 180750, atk: 1110 }, 9: { hp: 153650, atk: 855 },
    10: { hp: 189800, atk: 1525 }, 11: { hp: 195000, atk: 1655 }, 12: { hp: 200800, atk: 760 },
    13: { hp: 207100, atk: 1185 }, 14: { hp: 214050, atk: 560 }, 15: { hp: 221700, atk: 1405 },
    16: { hp: 230000, atk: 1405 }, 17: { hp: 239100, atk: 1530 }, 18: { hp: 215200, atk: 1065 }
  },
  3: {   // Cehennem
    1: { hp: 288200, atk: 1460 }, 2: { hp: 288200, atk: 1355 }, 3: { hp: 288300, atk: 1265 },
    4: { hp: 289350, atk: 1685 }, 5: { hp: 291150, atk: 1970 }, 6: { hp: 212000, atk: 1700 },
    7: { hp: 297050, atk: 2275 }, 8: { hp: 301200, atk: 1495 }, 9: { hp: 256050, atk: 790 },
    10: { hp: 312000, atk: 2040 }, 11: { hp: 318800, atk: 2060 }, 12: { hp: 326500, atk: 495 },
    13: { hp: 335300, atk: 1490 }, 14: { hp: 297650, atk: 1250 }, 15: { hp: 356250, atk: 1640 },
    16: { hp: 368650, atk: 1775 }, 17: { hp: 382400, atk: 1775 }, 18: { hp: 344150, atk: 1080 }
  }
};

// Bir zindan seviyesinin (1-18) kaydı; mod verilirse can ve saldırı o modun tablosundan gelir (Normal: mod 0, yukarıdaki tablo)
export function getDungeonEntry(level, mod = 0) {
  const e = DUNGEON_LEVELS.find(x => x.level === level) || DUNGEON_LEVELS[0];
  const m = MOD_CANAVARLARI[mod] && MOD_CANAVARLARI[mod][e.level];
  return m ? { ...e, hp: m.hp, atk: m.atk, mod } : e;
}

// Bir kattaki 3 canavar (harita sahnesi için); mod verilirse o modun değerleriyle
export function getFloorMonsters(floor, mod = 0) {
  return DUNGEON_LEVELS.filter(e => e.floor === floor).map(e => getDungeonEntry(e.level, mod));
}
