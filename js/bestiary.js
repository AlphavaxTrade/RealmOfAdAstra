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
  { level: 2,  floor: 1, name: 'Mağara Goblini',            icon: '👺', avatar: 'assets/monster_cave_goblin.jpg',   hp: 600,   atk: 80,   rewardXp: 80,   color: 0x06b6d4, abilities: ['swoop'] },
  { level: 3,  floor: 1, name: 'Gölge Kurdu',               icon: '🐺', avatar: 'assets/monster_shadow_wolf.jpg',   hp: 900,   atk: 115,  rewardXp: 130,  color: 0xf59e0b, abilities: ['swoop'], isFloorGuard: true },

  // ── 2. KAT: Kemik Mahzeni ─────────────────────────────────────────────
  { level: 4,  floor: 2, name: 'Kemik Mahzeni İskeletleri', icon: '💀', avatar: 'assets/monster_skeleton.jpg',      hp: 1900,  atk: 230,  rewardXp: 200,  color: 0x22c55e, abilities: ['sunder'] },
  { level: 5,  floor: 2, name: 'Lanetli Kemik Büyücüsü',    icon: '🧙‍♂️', avatar: 'assets/monster_skeleton.jpg',      hp: 2750,  atk: 305,  rewardXp: 260,  color: 0x06b6d4, abilities: ['terrify'] },
  { level: 6,  floor: 2, name: 'Kemik Taht Muhafızı',       icon: '🗡️', avatar: 'assets/monster_skeleton.jpg',      hp: 2850,  atk: 305,  rewardXp: 320,  color: 0xf59e0b, abilities: ['cleave', 'regenerate'], isFloorGuard: true },

  // ── 3. KAT: Kadim Tapınak — ARA BOSS ──────────────────────────────────
  { level: 7,  floor: 3, name: 'Karanlık Tarikatçı',        icon: '🧙‍♂️', avatar: 'assets/monster_stone_goliath.jpg', hp: 4500,  atk: 450,  rewardXp: 400,  color: 0x22c55e, abilities: ['terrify'] },
  { level: 8,  floor: 3, name: 'Cehennem Tazısı',           icon: '🐺', avatar: 'assets/monster_shadow_wolf.jpg',   hp: 4500,  atk: 450,  rewardXp: 480,  color: 0x06b6d4, abilities: ['swoop', 'cleave'] },
  { level: 9,  floor: 3, name: 'Kadim Taş Golyat',          icon: '🗿', avatar: 'assets/monster_stone_goliath.jpg', hp: 5850,  atk: 425,  rewardXp: 1800, color: 0xef4444, abilities: ['cleave', 'sunder', 'regenerate'], isBoss: true, bossLabel: 'ARA BOSS', bossPhases: DEFAULT_BOSS_PHASES[9] },

  // ── 4. KAT: Lanetli Firavun Mezarı ────────────────────────────────────
  { level: 10, floor: 4, name: 'Sargılı Mumyalar',          icon: '🧟', avatar: 'assets/monster_skeleton.jpg',      hp: 7600,  atk: 665,  rewardXp: 560,  color: 0x22c55e, abilities: ['sunder'] },
  { level: 11, floor: 4, name: 'Gölge Hayaletler',          icon: '👻', avatar: 'assets/monster_shadow_wolf.jpg',   hp: 8000,  atk: 675,  rewardXp: 640,  color: 0x06b6d4, abilities: ['swoop', 'terrify'] },
  { level: 12, floor: 4, name: 'Lanetli Firavun',           icon: '👑', avatar: 'assets/monster_stone_goliath.jpg', hp: 9050,  atk: 735,  rewardXp: 720,  color: 0xf59e0b, abilities: ['cleave', 'regenerate', 'terrify'], isFloorGuard: true },

  // ── 5. KAT: Kaynayan Lav Çukuru ──────────────────────────────────────
  { level: 13, floor: 5, name: 'Ateş İblisleri',            icon: '😈', avatar: 'assets/monster_fire_demon.jpg',    hp: 9650,  atk: 760,  rewardXp: 800,  color: 0x22c55e, abilities: ['cleave'] },
  { level: 14, floor: 5, name: 'Lav Elementalleri',         icon: '🌋', avatar: 'assets/monster_fire_demon.jpg',    hp: 10600, atk: 805,  rewardXp: 880,  color: 0x06b6d4, abilities: ['cleave', 'regenerate'] },
  { level: 15, floor: 5, name: 'Obsidyen Berserker',        icon: '⚔️', avatar: 'assets/monster_fire_demon.jpg',    hp: 10750, atk: 805,  rewardXp: 960,  color: 0xf59e0b, abilities: ['cleave', 'sunder'], isFloorGuard: true },

  // ── 6. KAT: Kıyamet Mabedi — FİNAL ───────────────────────────────────
  { level: 16, floor: 6, name: 'Kıyamet Şövalyesi',         icon: '🛡️', avatar: 'assets/monster_fire_demon.jpg',    hp: 14100, atk: 1010, rewardXp: 1100, color: 0x22c55e, abilities: ['cleave', 'sunder'] },
  { level: 17, floor: 6, name: 'Kadim Gölge Lordu',         icon: '👁️', avatar: 'assets/monster_dragon_ignis.jpg',  hp: 15450, atk: 1035, rewardXp: 1300, color: 0x06b6d4, abilities: ['terrify', 'swoop', 'cleave'] },
  { level: 18, floor: 6, name: 'Kıyamet Ejderhası IGNIS',   icon: '🐉', avatar: 'assets/monster_dragon_ignis.jpg',  hp: 23200, atk: 650,  rewardXp: 6000, color: 0xef4444, abilities: ['cleave', 'sunder', 'swoop', 'regenerate'], isBoss: true, bossLabel: 'BÜYÜK BOSS', bossPhases: DEFAULT_BOSS_PHASES[18] }
];

// ── Zindan modları (js/config.js ZINDAN_MODLARI) ─────────────────────────────────────────────────────────
// Zor (1), Uzman (2), Cehennem (3) modlarında aynı 18 canavar çok daha güçlüdür; adları, yetenekleri ve ödül XP'si aynıdır, yalnız
// can (hp) ve saldırı (atk) değişir. Tablo scripts/model/zindan_mod.mjs ile hesaplanır: en hızlı oyuncunun her canavarı modun
// takvimindeki günde yenebilmesi hedeflenir (Zor 140-300. gün, Uzman 320-500, Cehennem 530-800). Normal mod tablosu yukarıdadır.
export const MOD_CANAVARLARI = {
  1: {   // Zor
    1: { hp: 23500, atk: 1075 }, 2: { hp: 26000, atk: 930 }, 3: { hp: 28550, atk: 865 },
    4: { hp: 31250, atk: 1015 }, 5: { hp: 34000, atk: 1355 }, 6: { hp: 36750, atk: 760 },
    7: { hp: 39550, atk: 1385 }, 8: { hp: 42300, atk: 835 }, 9: { hp: 55000, atk: 645 },
    10: { hp: 47650, atk: 1170 }, 11: { hp: 50100, atk: 1185 }, 12: { hp: 52450, atk: 1125 },
    13: { hp: 54550, atk: 920 }, 14: { hp: 56450, atk: 1020 }, 15: { hp: 58100, atk: 1035 },
    16: { hp: 59450, atk: 1300 }, 17: { hp: 60500, atk: 1400 }, 18: { hp: 78650, atk: 990 }
  },
  2: {   // Uzman
    1: { hp: 106150, atk: 1250 }, 2: { hp: 109300, atk: 1120 }, 3: { hp: 112450, atk: 1080 },
    4: { hp: 115600, atk: 1265 }, 5: { hp: 118750, atk: 1565 }, 6: { hp: 121900, atk: 880 },
    7: { hp: 125050, atk: 1685 }, 8: { hp: 128150, atk: 1035 }, 9: { hp: 153800, atk: 630 },
    10: { hp: 134350, atk: 1420 }, 11: { hp: 137400, atk: 1540 }, 12: { hp: 140450, atk: 1260 },
    13: { hp: 143450, atk: 1185 }, 14: { hp: 146350, atk: 1200 }, 15: { hp: 149250, atk: 1310 },
    16: { hp: 152100, atk: 1405 }, 17: { hp: 154900, atk: 1640 }, 18: { hp: 185900, atk: 1065 }
  },
  3: {   // Cehennem
    1: { hp: 234850, atk: 1460 }, 2: { hp: 235550, atk: 1355 }, 3: { hp: 236700, atk: 1355 },
    4: { hp: 238200, atk: 1565 }, 5: { hp: 240150, atk: 1835 }, 6: { hp: 242500, atk: 720 },
    7: { hp: 245300, atk: 1970 }, 8: { hp: 248550, atk: 1340 }, 9: { hp: 223700, atk: 1130 },
    10: { hp: 256500, atk: 1765 }, 11: { hp: 261250, atk: 1850 }, 12: { hp: 266500, atk: 1355 },
    13: { hp: 272350, atk: 1385 }, 14: { hp: 278800, atk: 1050 }, 15: { hp: 285900, atk: 1525 },
    16: { hp: 293650, atk: 1655 }, 17: { hp: 302150, atk: 1775 }, 18: { hp: 302150, atk: 1245 }
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
