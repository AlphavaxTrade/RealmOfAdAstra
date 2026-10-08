// Realm of AdAstra — GameStateManager yöntemleri: Toplu işlemler: sefer yenileme, tamir, iyileştirme, otomatik kuşanma, savaş tahmini
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { sound } from '../audio.js';
import { createUnit, predictBattle, DEFAULT_BOSS_PHASES } from '../combat.js';
import { getDungeonEntry } from '../bestiary.js';
import { RES_KEYS } from './ortak.js';

export const topluYontemleri = {
  claimAndRestartAllExpeditions() {
    const results = { claimed: 0, partialClaimed: 0, restarted: 0, totalHarvest: 0, messages: [] };
    const allActive = Object.keys(this.state.activeExpeditions || {});
    for (const nodeId of allActive) {
      const exp = this.state.activeExpeditions[nodeId];
      if (!exp) continue;
      if (exp.isCompleted) {
        const res = this.claimExpedition(nodeId);
        if (res.success) {
          results.claimed++;
          results.totalHarvest += res.amount || 0;
        } else if (res.isWarehouseFull) {
          results.messages.push(res.message);
        }
      } else {
        // Sefer henüz bitmemiş olsa bile o ana kadar çıkartılan kaynakları topla
        const pRes = this.claimPartialExpedition(nodeId);
        if (pRes.success) {
          results.partialClaimed++;
          results.totalHarvest += pRes.amount || 0;
        } else if (pRes.isWarehouseFull) {
          results.messages.push(pRes.message);
        }
      }
    }

    // Alet kontrolü ve otomatik onarım desteği (Özellikle orak/sickle kırık kaldığında buğday/wheat seferinin başlamama sorununu çözer)
    for (const nodeId of RES_KEYS()) {
      const toolId = (GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId] || {}).requiredTool;
      const tool = toolId && this.state.tools ? this.state.tools[toolId] : null;
      if (tool && tool.durability <= 0) {
        this.repairTool(toolId);
      }
    }

    const staminaMissingNodes = [];

    // Yeniden başlatma dene
    for (const nodeId of RES_KEYS()) {
      if (!this.state.activeExpeditions[nodeId]) {
        const res = this.startExpedition(nodeId);
        if (res.success) {
          results.restarted++;
        } else {
          if (res.isInsufficientStamina) {
            staminaMissingNodes.push(this.getResourceNameTr(nodeId) || nodeId);
          }
          if (res.message) {
            results.messages.push(res.message);
          }
        }
      }
    }

    if (staminaMissingNodes.length > 0) {
      results.staminaWarning = `⚠️ ${staminaMissingNodes.join(', ')} seferini başlatmak için yeteri kadar staminanız bulunmamaktadır.`;
    }

    return results;
  },

  repairAllTools() {
    const results = { repaired: 0, totalWood: 0, totalIron: 0, totalWheat: 0, totalAda: 0, messages: [], hasDamagedTools: false, missingAda: false };
    for (const toolId of Object.keys(this.state.tools || {})) {
      const cost = this.calculateRepairCost(toolId);
      if (cost && cost.missingDurability > 0) {
        results.hasDamagedTools = true;
        if ((this.state.adAstraBalance || 0) < cost.adAstraCost) {
          results.missingAda = true;
        }
        const res = this.repairTool(toolId);
        if (res.success) {
          results.repaired++;
          results.totalWood += cost.woodCost;
          results.totalIron += cost.ironCost;
          results.totalWheat += cost.wheatCost;
          results.totalAda += cost.adAstraCost;
        } else {
          results.messages.push(res.message);
        }
      }
    }
    results.success = results.repaired > 0;
    if (results.success) {
      results.message = `🔨 ${results.repaired} Adet Alet Başarıyla Onarıldı! (-${results.totalWood} Odun, -${results.totalIron} Demir, -${results.totalAda} ASTRA)`;
    } else if (results.hasDamagedTools && results.missingAda) {
      results.message = '⚠️ Hesapta yeteri kadar ASTRA yok!';
    } else if (results.messages.length > 0) {
      results.message = results.messages[0];
    } else {
      results.message = 'Tamir edilecek alet yok (Tüm aletler tam sağlam).';
    }
    return results;
  },

  getAllRepairCost() {
    let totalWood = 0, totalIron = 0, totalWheat = 0, totalAda = 0, count = 0;
    for (const toolId of Object.keys(this.state.tools || {})) {
      const cost = this.calculateRepairCost(toolId);
      if (cost && cost.missingDurability > 0) {
        totalWood += cost.woodCost;
        totalIron += cost.ironCost;
        totalWheat += cost.wheatCost;
        totalAda += cost.adAstraCost;
        count++;
      }
    }
    return { totalWood, totalIron, totalWheat, totalAda, count };
  },

  instantHealAllSoldiers() {
    const results = { healed: 0, totalWheat: 0, totalAda: 0, messages: [] };
    const soldiers = this.state.soldierUnits || [];
    for (let i = 0; i < soldiers.length; i++) {
      const info = this.getSoldierHealInfo(i);
      if (info && info.missingHp > 0) {
        const res = this.instantHealSoldierUnit(i);
        if (res.success) {
          results.healed++;
          results.totalWheat += info.wheatNeeded;
          results.totalAda += info.adaCost;
        } else {
          results.messages.push(res.message);
          break;
        }
      }
    }
    return results;
  },

  getAllHealCost() {
    let totalWheat = 0, totalAda = 0, count = 0;
    const soldiers = this.state.soldierUnits || [];
    for (let i = 0; i < soldiers.length; i++) {
      const info = this.getSoldierHealInfo(i);
      if (info && info.missingHp > 0) {
        totalWheat += info.wheatNeeded;
        totalAda += info.adaCost;
        count++;
      }
    }
    return { totalWheat, totalAda, count };
  },

  // =========================================================================
  // SMART ARMORY: OTOMATİK EN İYİ EŞYALARI DAĞIT & TOPLU SÖK
  // =========================================================================
  autoEquipBest() {
    const soldiers = this.state.soldierUnits || [];
    const slots = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
    let totalEquipped = 0;

    if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];

    for (let i = 0; i < soldiers.length; i++) {
      for (const slot of slots) {
        if (!soldiers[i].equipment) soldiers[i].equipment = {};
        if (!soldiers[i].equipment[slot]) {
          // Krallık ana yuvası ve Cephanelik deposundaki tüm adayları topla ve en yüksek seviyeliyi seç
          const candidates = [];
          if (this.state.equipment && this.state.equipment[slot]) {
            candidates.push({ item: this.state.equipment[slot], source: 'kingdom' });
          }
          this.state.armoryInventory.forEach((armItem, aIdx) => {
            if (armItem && armItem.slot === slot) {
              candidates.push({ item: armItem, source: 'armory', armoryIndex: aIdx });
            }
          });

          // En yüksek seviyeli ve dayanıklılığı tam/yüksek olanı seç
          candidates.sort((a, b) => ((b.item.level || 1) - (a.item.level || 1)) || ((b.item.durability || 0) - (a.item.durability || 0)));

          let itemToEquip = null;
          if (candidates.length > 0) {
            const chosen = candidates[0];
            itemToEquip = chosen.item;
            if (chosen.source === 'kingdom') {
              delete this.state.equipment[slot];
            } else {
              const armIdx = this.state.armoryInventory.indexOf(chosen.item);
              if (armIdx !== -1) {
                this.state.armoryInventory.splice(armIdx, 1);
              }
            }
          }

          if (itemToEquip) {
            soldiers[i].equipment[slot] = itemToEquip;
            totalEquipped++;
          }
        }
      }
    }
    if (totalEquipped > 0) {
      sound.playRepair();
      this.saveState();
    }
    return { 
      success: totalEquipped > 0, 
      equipped: totalEquipped, 
      message: totalEquipped > 0 
        ? `⚔️ ${totalEquipped} parça teçhizat otomatik olarak orduna dağıtıldı!` 
        : 'Dağıtılacak boşta teçhizat veya boş asker yuvası bulunamadı.' 
    };
  },

  unequipAllSoldiers() {
    const soldiers = this.state.soldierUnits || [];
    const slots = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
    let totalUnequipped = 0;

    if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];

    for (let i = 0; i < soldiers.length; i++) {
      for (const slot of slots) {
        if (soldiers[i].equipment && soldiers[i].equipment[slot]) {
          const item = soldiers[i].equipment[slot];
          soldiers[i].equipment[slot] = null;
          this.state.armoryInventory.push(item);
          totalUnequipped++;
        }
      }
    }
    if (totalUnequipped > 0) {
      sound.playRepair();
      this.saveState();
    }
    return { 
      success: totalUnequipped > 0, 
      unequipped: totalUnequipped, 
      message: totalUnequipped > 0 
        ? `🔄 ${totalUnequipped} parça eşya askerlerden sökülüp Cephanelik Deposu'na aktarıldı!` 
        : 'Sökülecek eşya bulunamadı.' 
    };
  },

  // =========================================================================
  // PRE-BATTLE: SAVAŞ TAHMİNİ (ORDU VE KUŞANILMIŞ SİLAHLAR)
  // =========================================================================
  // ⚔️ Zindan savaşı birimleri — hem tahmin hem gerçek savaş aynı kurulumu kullanır (tek motor: combat.js)
  buildDungeonBattleUnits(monster, selectedSoldierIndices, monsterHp = null) {
    const soldiers = this.state.soldierUnits || [];
    const allies = (selectedSoldierIndices || []).filter(idx => soldiers[idx]).map((idx, i) => {
      const stats = this.getSoldierFullStats(idx) || { totalAtk: 25, totalMaxHp: 100 };
      const sol = soldiers[idx];
      return createUnit({
        uid: 'a' + i,
        sourceIndex: idx,
        name: sol.name,
        icon: sol.icon || '⚔️',
        level: sol.level || 1,
        maxHp: stats.totalMaxHp,
        hp: Math.min(sol.hp != null ? sol.hp : stats.totalMaxHp, stats.totalMaxHp),
        atk: stats.totalAtk,
        skills: Array.isArray(sol.skills) && sol.skills.length ? sol.skills : ['shieldWall', 'armorBreaker'],
        row: sol.row === 'back' ? 'back' : 'front',
        side: 'ally'
      });
    });
    const isBoss = !!(monster.isBoss || monster.level === 9 || monster.level === 18);
    const entry = getDungeonEntry(monster.level);
    const abilities = entry && Array.isArray(entry.abilities) && entry.abilities.length
      ? entry.abilities
      : (isBoss ? ['cleave', 'terrify'] : null);
    const hp = monsterHp != null ? monsterHp : this.getMonsterCurrentHp(monster.level, monster.hp);
    const enemy = createUnit({
      uid: 'e0',
      name: monster.name,
      icon: monster.icon || '💀',
      level: monster.level,
      maxHp: monster.hp,
      hp: Math.max(1, Math.min(monster.hp, hp)),
      atk: monster.atk,
      abilities,
      abilityCooldown: isBoss ? 2 : 3,
      row: 'front',
      side: 'enemy'
    });
    return { allies, enemies: [enemy], bossPhases: DEFAULT_BOSS_PHASES[monster.level] || null, isBoss };
  },

  // Gerçek savaş motoruyla (combat.js) Monte Carlo kazanma şansı
  predictDungeonBattle(monster, selectedSoldierIndices, samples = 100) {
    if (!selectedSoldierIndices || selectedSoldierIndices.length === 0) {
      return { winChance: 0, difficulty: 'İmkansız', avgRounds: 0, avgCasualties: 0, samples: 0 };
    }
    const setup = this.buildDungeonBattleUnits(monster, selectedSoldierIndices);
    return predictBattle(
      () => this.buildDungeonBattleUnits(monster, selectedSoldierIndices).allies,
      () => this.buildDungeonBattleUnits(monster, selectedSoldierIndices).enemies,
      samples,
      { bossPhases: setup.bossPhases }
    );
  },

  getBattlePrediction(enemyHp, enemyAtk, selectedSoldierIndices) {
    const soldiers = this.state.soldierUnits || [];
    let totalAtk = 0;
    let totalHp = 0;

    for (const idx of selectedSoldierIndices) {
      const stats = this.getSoldierFullStats(idx);
      if (!stats) continue;
      const sol = soldiers[idx];
      if (!sol) continue;

      totalAtk += stats.totalAtk;
      totalHp += Math.min(sol.hp || sol.maxHp || 100, stats.totalMaxHp);
    }

    const turnsToKillEnemy = enemyHp > 0 ? Math.ceil(enemyHp / Math.max(1, totalAtk)) : 1;
    const turnsEnemyKillsUs = totalHp > 0 ? Math.ceil(totalHp / Math.max(1, enemyAtk)) : 1;
    const winChance = Math.min(100, Math.max(5, Math.round((turnsEnemyKillsUs / (turnsToKillEnemy + 0.1)) * 50)));

    let difficulty = 'Kolay';
    if (winChance < 30) difficulty = 'İmkansız';
    else if (winChance < 50) difficulty = 'Zor';
    else if (winChance < 75) difficulty = 'Orta';

    return { totalAtk, totalHp, turnsToKillEnemy, winChance, difficulty, selectedCount: selectedSoldierIndices.length };
  },

  // =========================================================================
  // BOT KAYNAK EKSİKLİĞİ KONTROLÜ (BİLDİRİM MERKEZİ VE PAUSE İÇİN)
  // =========================================================================
  getBotResourceDeficitWarning() {
    const rawExp = Math.max(
      this.state.botActiveUntil || 0,
      this.state.tavernaBotExpiresAt || 0,
      this.state.activeBuffs?.auto_collector?.expiresAt || 0
    );
    const hasBot = (rawExp > Date.now()) || (this.state.botPaused && (this.state.botPausedRemainingMs || 0) > 0);
    if (!hasBot) return null;

    const prereq = this.checkBotPrerequisites();
    if (!prereq.isMet) {
      return {
        type: 'warning',
        icon: '⏸️',
        title: '24s Otomasyon Botu Duraklatıldı (Süreniz Donduruldu)',
        text: `Botun aletleri onarabilmesi ve seferleri aksatmaması için deponuzda en az 50 Demir, 50 Odun, 50 Buğday ve 50 ASTRA bulunmalıdır. Süreniz dondurulmuştur ve asla azalmaz! (Eksikler: ${prereq.missingText}) — Kaynakları tamamladığınız an bot anında otomatik çalışmaya devam edecektir.`,
        missing: prereq.missing
      };
    }
    return null;
  },
};
