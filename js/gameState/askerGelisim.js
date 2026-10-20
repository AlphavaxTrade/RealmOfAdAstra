// Realm of AdAstra — GameStateManager yöntemleri: asker XP ve yetenek açılımı, taktik hazırları, yetenek çeşitliliği, lig
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { cleanName } from './ortak.js';

const ON_AYAR_KIMLIKLERI = [1, 2, 3];

// Asker seviyesine bağlı otomatik yetenek açılımı: [en düşük seviye, yetenek]
const SEVIYE_YETENEKLERI = [
  [10, 'shockwave'],     // 2. slot (başka bir saldırı yeteneği yoksa)
  [25, 'armorBreaker'],  // 3. slot
  [45, 'fieldMedic'],    // 4. slot
  [65, 'lastStand']      // pasif
];

// Yeteneğin ordudaki rolü (Dünya Bossu yetenek çeşitliliği bonusu için)
const YETENEK_ROLLERI = {
  shieldWall: 'Tank',
  shockwave: 'AoE',
  fieldMedic: 'Şifacı',
  armorBreaker: 'Anti-Tank',
  stunStrike: 'Kontrol',
  bloodFrenzy: 'Berserker',
  lastStand: 'Hayatta Kalma'
};

export const askerGelisimYontemleri = {
  // Askere XP ekler; gereken XP = seviye × 100. Seviye atlayınca temel değerler büyür ve yetenekler açılır; can yenilenmez.
  addSoldierXp(soldierIdx, xpAmount) {
    const asker = (this.state.soldierUnits || [])[soldierIdx];
    if (!asker) return { leveledUp: false };

    asker.xp = (asker.xp || 0) + xpAmount;
    let seviyeAtladi = false;
    let yeniSeviye = asker.level || 1;
    const acilanlar = [];

    // Asker, hesap seviyesinden yüksek seviyeye çıkamaz (config ORDU_SINIRI); XP birikir, hesap seviyesi artınca seviye atlar.
    // Önceden kayıtta hesap seviyesini aşmış asker düşürülmez, yalnız yeni seviye atlamaz.
    const sinir = GAME_CONFIG.ORDU_SINIRI || {};
    const hesapSeviyesi = Math.max(1, Math.floor(Number(this.state.level) || 1));
    const tavan = sinir.ASKER_SEVIYESI_HESAP_SEVIYESINI_GECEMEZ ? hesapSeviyesi : Infinity;
    while (asker.xp >= (asker.level * 100) && asker.level < tavan) {
      asker.xp -= (asker.level * 100);
      asker.level += 1;
      asker.baseAtk = 25 + (asker.level - 1) * (GAME_CONFIG.SOLDIER_ATK_PER_LEVEL || 6);
      asker.maxHp = 100 + (asker.level - 1) * (GAME_CONFIG.SOLDIER_HP_PER_LEVEL || 25);
      // Seviye atlamak canı YENİLEMEZ (20 Ekim 2026): kayıtlı can aynı kalır, yalnız azami can büyür; düşmüş asker düşmüş kalır
      asker.hp = Math.min(asker.maxHp, asker.hp != null ? asker.hp : asker.maxHp);
      seviyeAtladi = true;
      yeniSeviye = asker.level;

      const yeni = this.checkSoldierSkillUnlock(asker);
      if (yeni && yeni.length) acilanlar.push(...yeni);
    }

    this.saveState();
    return { leveledUp: seviyeAtladi, newLevel: yeniSeviye, soldierName: asker.name, unlockedSkills: acilanlar };
  },

  // Seviye eşiklerinde otomatik yetenek açılımı (Lv.10, 25, 45, 65). Döndürür: yeni açılan yetenekler.
  checkSoldierSkillUnlock(asker) {
    if (!asker.skills) asker.skills = ['shieldWall'];
    const seviye = asker.level || 1;
    const acilan = [];

    for (const [esik, yetenek] of SEVIYE_YETENEKLERI) {
      if (seviye < esik || asker.skills.includes(yetenek)) continue;
      // 2. slot: zaten Zırh Kırıcı olan asker Şok Dalgası almaz (aynı rol ailesi)
      if (yetenek === 'shockwave' && asker.skills.includes('armorBreaker')) continue;
      asker.skills.push(yetenek);
      acilan.push(yetenek);
    }
    return acilan;
  },

  // ── Taktik hazırları (3 adet: ön / arka saf dizilişi) ──────────────────
  getCombatPresets() {
    if (!this.state.combatPresets) this.state.combatPresets = this.mergeCombatPresets(null);
    return this.state.combatPresets;
  },

  // Mevcut ön/arka saf dizilişini hazıra kaydeder
  saveCombatPreset(presetId = 1, customName = null) {
    const id = Number(presetId) || 1;
    if (!ON_AYAR_KIMLIKLERI.includes(id)) {
      return { success: false, message: 'Geçersiz preset numarası (1, 2 veya 3 olmalıdır).' };
    }
    const hazirlar = this.getCombatPresets();

    const konumlar = {};
    (this.state.soldierUnits || []).forEach((s, i) => {
      konumlar[s.id || `soldier_${i}`] = s.row === 'back' ? 'back' : 'front';
    });

    if (!hazirlar.presets[id]) hazirlar.presets[id] = { id, name: `Taktik ${id}`, positions: {} };
    const hazir = hazirlar.presets[id];
    hazir.positions = konumlar;
    if (customName && typeof customName === 'string' && customName.trim()) {
      hazir.name = cleanName(customName, 32) || `Taktik ${id}`;
    }
    hazirlar.activePresetId = id;

    this.saveState();
    return { success: true, message: `✅ ${hazir.name} başarıyla kaydedildi!`, preset: hazir, activePresetId: id };
  },

  // Kayıtlı hazırı orduya uygular; konumu kayıtlı olmayan asker için hazıra göre varsayılan konum atanır
  applyCombatPreset(presetId = 1) {
    const id = Number(presetId) || 1;
    if (!ON_AYAR_KIMLIKLERI.includes(id)) return { success: false, message: 'Geçersiz preset numarası.' };
    const hazirlar = this.getCombatPresets();
    const hazir = hazirlar.presets[id];
    if (!hazir) return { success: false, message: 'Preset bulunamadı.' };

    (this.state.soldierUnits || []).forEach((s, i) => {
      const anahtar = s.id || `soldier_${i}`;
      if (hazir.positions && hazir.positions[anahtar]) {
        s.row = hazir.positions[anahtar] === 'back' ? 'back' : 'front';
        return;
      }
      if (id === 2) s.row = 'front';                    // savunma hattı: herkes ön saf
      else if (id === 3) s.row = i === 0 ? 'front' : 'back';   // arka saf ağırlıklı
      else s.row = i < 2 ? 'front' : 'back';            // dengeli
      if (!hazir.positions) hazir.positions = {};
      hazir.positions[anahtar] = s.row;
    });

    hazirlar.activePresetId = id;
    this.saveState();
    return { success: true, message: `🎯 ${hazir.name} aktif edildi!`, preset: hazir, activePresetId: id };
  },

  setSoldierRow(soldierIdx, row) {
    const asker = (this.state.soldierUnits || [])[soldierIdx];
    if (!asker) return { success: false, message: 'Asker bulunamadı!' };
    asker.row = row === 'back' ? 'back' : 'front';
    this.saveState();
    return { success: true, soldier: asker, row: asker.row };
  },

  // Ordunun yetenek çeşitliliği: ilk rolden sonraki her farklı rol için bonus (WORLD_BOSS config), tavanlı
  calculateSquadSkillDiversity(soldierIndices = null) {
    const liste = this.state.soldierUnits || [];
    const askerler = soldierIndices ? soldierIndices.map(i => liste[i]).filter(Boolean) : liste;
    if (askerler.length === 0) return { uniqueRoles: 0, diversityMultiplier: 1.0, rolesFound: [] };

    const roller = new Set();
    for (const a of askerler) {
      for (const yetenek of (a.skills || ['shieldWall'])) {
        if (YETENEK_ROLLERI[yetenek]) roller.add(YETENEK_ROLLERI[yetenek]);
      }
    }

    const { SKILL_DIVERSITY_BONUS_PER_ROLE, MAX_SKILL_DIVERSITY_BONUS } = GAME_CONFIG.WORLD_BOSS;
    const carpan = Math.min(1.0 + MAX_SKILL_DIVERSITY_BONUS, 1.0 + Math.max(0, roller.size - 1) * SKILL_DIVERSITY_BONUS_PER_ROLE);
    return {
      uniqueRoles: roller.size,
      diversityMultiplier: parseFloat(carpan.toFixed(2)),
      rolesFound: Array.from(roller)
    };
  },

  // Kolezyum lig kademesi (Bronz / Gümüş / Altın / Elmas / Şampiyon): puana göre sabit
  getColosseumTier(rating = (this.state.colosseumStats?.rating || 1000)) {
    const ligler = GAME_CONFIG.COLOSSEUM.LEAGUES;
    const lig = ligler.find(l => rating >= l.minRating) || ligler[ligler.length - 1];
    return { id: lig.id, name: lig.name, color: lig.color, rewardMult: lig.rewardMult, minRating: lig.minRating };
  }
};
