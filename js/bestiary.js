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

export function getDungeonEntry(level) {
  return DUNGEON_LEVELS.find(e => e.level === level) || DUNGEON_LEVELS[0];
}

// Bir kattaki 3 canavar (harita sahnesi için)
export function getFloorMonsters(floor) {
  return DUNGEON_LEVELS.filter(e => e.floor === floor);
}
