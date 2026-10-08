// Realm of AdAstra — GameStateManager yöntemleri: Asker XP, yetenek, taktik hazırları, Kolezyum ligi
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { cleanName } from './ortak.js';

export const askerGelisimYontemleri = {
  // Asker Birimlerine Zindan XP'si Ekleme ve Seviye Atlattırma
  addSoldierXp(soldierIdx, xpAmount) {
    const s = (this.state.soldierUnits || [])[soldierIdx];
    if (!s) return { leveledUp: false };

    s.xp = (s.xp || 0) + xpAmount;
    let leveledUp = false;
    let newLevel = s.level || 1;
    let unlockedSkills = [];

    // Gerekli XP Formülü: Level * 100
    while (s.xp >= (s.level * 100)) {
      s.xp -= (s.level * 100);
      s.level += 1;
      s.baseAtk = 25 + (s.level - 1) * (GAME_CONFIG.SOLDIER_ATK_PER_LEVEL || 6);
      s.maxHp = 100 + (s.level - 1) * (GAME_CONFIG.SOLDIER_HP_PER_LEVEL || 25);
      s.hp = s.maxHp;
      leveledUp = true;
      newLevel = s.level;

      // Otomatik yetenek slotu ve kilit açımı
      const newly = this.checkSoldierSkillUnlock(s);
      if (newly && newly.length) unlockedSkills.push(...newly);
    }

    this.saveState();
    return { leveledUp, newLevel, soldierName: s.name, unlockedSkills };
  },

  // ⚔️ Seviye Kademelerinde Otomatik Skill Açımı (Lv.10, Lv.25, Lv.45, Lv.65)
  checkSoldierSkillUnlock(soldier) {
    if (!soldier.skills) soldier.skills = ['shieldWall'];
    const lvl = soldier.level || 1;
    const newlyUnlocked = [];

    // Seviye 10: 2. Slot (Şok Dalgası)
    if (lvl >= 10 && !soldier.skills.includes('shockwave') && !soldier.skills.includes('armorBreaker')) {
      soldier.skills.push('shockwave');
      newlyUnlocked.push('shockwave');
    }
    // Seviye 25: 3. Slot (Zırh Kırıcı)
    if (lvl >= 25 && !soldier.skills.includes('armorBreaker')) {
      soldier.skills.push('armorBreaker');
      newlyUnlocked.push('armorBreaker');
    }
    // Seviye 45: 4. Slot (Sahra Merhemi)
    if (lvl >= 45 && !soldier.skills.includes('fieldMedic')) {
      soldier.skills.push('fieldMedic');
      newlyUnlocked.push('fieldMedic');
    }
    // Seviye 65: Pasif Yetenek (Son Nefes)
    if (lvl >= 65 && !soldier.skills.includes('lastStand')) {
      soldier.skills.push('lastStand');
      newlyUnlocked.push('lastStand');
    }
    return newlyUnlocked;
  },

  // 🛡️ 3 Adet Taktiksel Savaş Preseti (Preset 1, 2, 3) Yönetimi
  getCombatPresets() {
    if (!this.state.combatPresets) {
      this.state.combatPresets = this.mergeCombatPresets(null);
    }
    return this.state.combatPresets;
  },

  // 💾 Mevcut Ordu Formasyonunu Presete Kaydetme (1, 2 veya 3)
  saveCombatPreset(presetId = 1, customName = null) {
    const id = Number(presetId) || 1;
    if (![1, 2, 3].includes(id)) {
      return { success: false, message: 'Geçersiz preset numarası (1, 2 veya 3 olmalıdır).' };
    }
    if (!this.state.combatPresets) {
      this.state.combatPresets = this.mergeCombatPresets(null);
    }

    const positions = {};
    const soldiers = this.state.soldierUnits || [];
    soldiers.forEach((s, idx) => {
      const key = s.id || `soldier_${idx}`;
      positions[key] = s.row === 'back' ? 'back' : 'front';
    });

    if (!this.state.combatPresets.presets[id]) {
      this.state.combatPresets.presets[id] = { id, name: `Taktik ${id}`, positions: {} };
    }

    this.state.combatPresets.presets[id].positions = positions;
    if (customName && typeof customName === 'string' && customName.trim()) {
      this.state.combatPresets.presets[id].name = cleanName(customName, 32) || `Taktik ${id}`;
    }
    this.state.combatPresets.activePresetId = id;

    this.saveState();
    return {
      success: true,
      message: `✅ ${this.state.combatPresets.presets[id].name} başarıyla kaydedildi!`,
      preset: this.state.combatPresets.presets[id],
      activePresetId: id
    };
  },

  // ⚡ Kayıtlı Preseti Orduya Tek Tıkla Uygulama
  applyCombatPreset(presetId = 1) {
    const id = Number(presetId) || 1;
    if (![1, 2, 3].includes(id)) {
      return { success: false, message: 'Geçersiz preset numarası.' };
    }
    if (!this.state.combatPresets) {
      this.state.combatPresets = this.mergeCombatPresets(null);
    }

    const p = this.state.combatPresets.presets[id];
    if (!p) return { success: false, message: 'Preset bulunamadı.' };

    const soldiers = this.state.soldierUnits || [];
    soldiers.forEach((s, idx) => {
      const key = s.id || `soldier_${idx}`;
      if (p.positions && p.positions[key]) {
        s.row = p.positions[key] === 'back' ? 'back' : 'front';
      } else {
        // Önceden bu askerin pozisyonu kaydedilmemişse mantıklı varsayılan
        if (id === 2) {
          s.row = 'front'; // Savunma / Hücum Hattı
        } else if (id === 3) {
          s.row = idx === 0 ? 'front' : 'back'; // Arka Saf Ağırlıklı
        } else {
          s.row = idx < 2 ? 'front' : 'back'; // Dengeli
        }
        if (!p.positions) p.positions = {};
        p.positions[key] = s.row;
      }
    });

    this.state.combatPresets.activePresetId = id;
    this.saveState();
    return {
      success: true,
      message: `🎯 ${p.name} aktif edildi!`,
      preset: p,
      activePresetId: id
    };
  },

  // 🛡️ Tekil Asker Formasyonu (Ön Saf / Arka Saf) Ayarlama
  setSoldierRow(soldierIdx, row) {
    const s = (this.state.soldierUnits || [])[soldierIdx];
    if (!s) return { success: false, message: 'Asker bulunamadı!' };
    s.row = row === 'back' ? 'back' : 'front';
    this.saveState();
    return { success: true, soldier: s, row: s.row };
  },

  // 📖 Askere Yeni Skill Öğretme (Skill Loadout: Max 3 Aktif + Pasif)
  learnSoldierSkill(soldierIdx, skillId) {
    const s = (this.state.soldierUnits || [])[soldierIdx];
    if (!s) return { success: false, message: 'Asker bulunamadı!' };
    if (!s.skills) s.skills = ['shieldWall'];
    if (s.skills.includes(skillId)) {
      return { success: false, message: 'Bu asker bu yeteneği zaten biliyor!' };
    }

    const activeSkills = s.skills.filter(sk => sk !== 'lastStand');
    if (skillId !== 'lastStand' && activeSkills.length >= 3) {
      // 3 aktif yetenek dolduysa en eskisini çıkarıp yeniyi ekler
      s.skills = [...activeSkills.slice(1), skillId, ...(s.skills.includes('lastStand') ? ['lastStand'] : [])];
    } else {
      s.skills.push(skillId);
    }

    this.saveState();
    return { success: true, soldier: s, skills: s.skills };
  },

  // 🌋 Dünya Bossu & Ordu Yetenek Çeşitliliği Hasar Çarpanı
  calculateSquadSkillDiversity(soldierIndices = null) {
    const units = soldierIndices
      ? soldierIndices.map(i => (this.state.soldierUnits || [])[i]).filter(Boolean)
      : (this.state.soldierUnits || []);

    if (units.length === 0) return { uniqueRoles: 0, diversityMultiplier: 1.0, rolesFound: [] };

    const roles = new Set();
    units.forEach(u => {
      const skills = u.skills || ['shieldWall'];
      skills.forEach(sk => {
        if (sk === 'shieldWall') roles.add('Tank');
        else if (sk === 'shockwave') roles.add('AoE');
        else if (sk === 'fieldMedic') roles.add('Şifacı');
        else if (sk === 'armorBreaker') roles.add('Anti-Tank');
        else if (sk === 'stunStrike') roles.add('Kontrol');
        else if (sk === 'bloodFrenzy') roles.add('Berserker');
        else if (sk === 'lastStand') roles.add('Hayatta Kalma');
      });
    });

    const uniqueRoles = roles.size;
    // İlk rolden sonraki her farklı taktiksel rol için %6 hasar bonusu (örn. 5 farklı rol = 1.24x hasar)
    const { SKILL_DIVERSITY_BONUS_PER_ROLE, MAX_SKILL_DIVERSITY_BONUS } = GAME_CONFIG.WORLD_BOSS;
    const diversityMultiplier = Math.min(1.0 + MAX_SKILL_DIVERSITY_BONUS, 1.0 + Math.max(0, uniqueRoles - 1) * SKILL_DIVERSITY_BONUS_PER_ROLE);

    return {
      uniqueRoles,
      diversityMultiplier: parseFloat(diversityMultiplier.toFixed(2)),
      rolesFound: Array.from(roles)
    };
  },

  // 🏆 Kolezyum Sabit Lig Kademeleri (Bronz / Gümüş / Altın / Elmas / Şampiyon)
  getColosseumTier(rating = (this.state.colosseumStats?.rating || 1000)) {
    const leagues = GAME_CONFIG.COLOSSEUM.LEAGUES;
    const t = leagues.find(l => rating >= l.minRating) || leagues[leagues.length - 1];
    return { id: t.id, name: t.name, color: t.color, rewardMult: t.rewardMult, minRating: t.minRating };
  },
};
