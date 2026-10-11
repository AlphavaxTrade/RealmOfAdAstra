// Realm of AdAstra — GameStateManager yöntemleri: Danışman, XP, seviye, taverna etkileri, alet tamiri, silo, ekonomi oranları
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { RES_KEYS, zeroRes, round3 } from './ortak.js';

export const gelisimYontemleri = {
  // 🧙‍♂️ KRAL DANIŞMANI (BİR CÜMLELİK REHBERLİK & TAVSİYE)
  getRoyalAdvisorAdvice() {
    const inv = this.state.inventory || {};
    const soldiers = this.state.soldierUnits || [];
    const exp = this.state.activeExpeditions || {};
    const dProg = this.state.dungeonProgress || 1;

    // 1. Hazır bekleyen sefer mahsulü varsa
    let readyExpCount = 0;
    for (const node of RES_KEYS()) {
      if (exp[node] && exp[node].isCompleted) readyExpCount++;
    }
    if (readyExpCount > 0) {
      return {
        icon: '🌾',
        title: 'Mahsuller Hazır!',
        advice: `Tarlada ve madenlerde ${readyExpCount} işçin seferden döndü! Yukarıdaki **"TÜM MAHSULÜ TOPLA"** butonuna basarak ambarları doldurabilirsin.`,
        action: 'sweep_harvest',
        actionLabel: '✨ Topla'
      };
    }

    // 2. Yaralı asker varsa ve buğday yeterliyse
    const injuredSoldier = soldiers.find(s => (s.hp || 100) < (s.maxHp || 100));
    if (injuredSoldier && (inv.wheat || 0) >= 10) {
      return {
        icon: '❤️',
        title: 'Askerler Dinlenmek İstiyor',
        advice: `Orduda yaralı askerlerin var. Kışlaya gidip **"Tek Dokunuşla Ordumu Hazırla"** ile onları doyurabilirsin!`,
        action: 'open_barracks',
        actionLabel: '⚔️ Kışlaya Git'
      };
    }

    // 3. İşçiler boştaysa
    const idleNodes = RES_KEYS().filter(n => !exp[n]);
    if (idleNodes.length > 0) {
      return {
        icon: '⛏️',
        title: 'İşçiler Boşta Bekliyor',
        advice: `Madenler ve tarlalar şu an boşta duruyor. Çiftliğe veya Madene tıklayıp işçilerini sefere göndererek hammadde toplat!`,
        action: 'open_dashboard',
        actionLabel: '🏰 Krallık Merkezi'
      };
    }

    // 4. Demirci için yeterli hammadde varsa ve eşyalar boşsa
    if ((inv.iron || 0) >= 60 && (inv.wood || 0) >= 40) {
      return {
        icon: '🔥',
        title: 'Demirci Ocağı Yanıyor',
        advice: `Ambarında yeterli demir ve odun var. Demircide yeni bir kılıç veya zırh döverek askerlerini zırhlandırabilirsin!`,
        action: 'open_blacksmith',
        actionLabel: '⚒️ Demirciye Git'
      };
    }

    // 5. Zindan için tavsiye
    return {
      icon: '💀',
      title: 'Zindan Seni Bekliyor',
      advice: `Ordun hazır durumda! Zindan ${dProg}. Kat Muhafızını yenerek hazineleri krallığına kazandırabilirsin.`,
      action: 'open_dungeon',
      actionLabel: '🗺️ Zindana İn'
    };
  },

  // Sefer/zindan kazanımlarından gelen XP'yi karaktere ekler.
  // Kural: XP tankı dolduğunda fazladan XP, tankı aşamaz. Full (örn. 2000/2000) olarak bekler
  // ve oyuncu seviye atlamadığı sürece yeni XP biriktirilemez.
  // NOT: Seviye atlama otomatik değildir; oyuncu "levelUp()" ile ayrı bir eylem olarak yükselir.
  addXp(amount) {
    if (!amount || amount <= 0) return null;
    const req = this.getNextLevelRequirement();
    const maxXp = req && req.xp ? req.xp : Infinity;
    const current = Number(this.state.currentXp) || 0;

    if (current >= maxXp) {
      this.state.currentXp = maxXp;
      return { capped: true, added: 0, currentXp: maxXp };
    }

    const nextXp = Math.min(maxXp, current + amount);
    const added = nextXp - current;
    this.state.currentXp = nextXp;
    return { capped: nextXp >= maxXp, added, currentXp: nextXp };
  },

  // =========================================================================
  // 2. KARAKTER SEVİYE ATLAMA (MATEMATİKSEL EKONOMİ MODELİ - 180M BALİNA DENGESİ)
  // =========================================================================
  // ═══════════════════════════════════════════════════════════════════════
  // SEVİYE EĞRİSİ — v2: HEDEF SÜREDEN TÜRETİLİR (F-13)
  // ═══════════════════════════════════════════════════════════════════════
  // v1'de XP = 100·n^2,4·1,045^(n-1) idi. XP arzı ise sefer başına yalnızca
  // 35×süreSaat. İki eğri arasındaki uçurum kapatılamıyordu:
  //     Lv.30  →  1.257.370 XP  →  4,1 YIL kesintisiz oyun
  //     Lv.81  → 128.726.298 XP →  420 YIL
  // Alt uçta da kırıktı: Lv.2 için 6.527 ASTRA gerekiyordu ama oyuncu 250 ASTRA
  // ile başlıyor ve TÜM DÜNYANIN haftalık hammadde geliri 6.264 ASTRA idi.
  //
  // v2'de eğri tersinden kurulur: "Lv.81 yaklaşık 1.100 günde (3 yıl)
  // ulaşılabilir olsun" denir ve XP maliyeti buradan türetilir.
  // Günlük XP arzı ≈ 3 düğüm × 35 XP/saat × 24 = 2.520 XP.
  getCumulativeXpForLevel(level) {
    const L = Math.max(1, Math.min(GAME_CONFIG.MAX_PLAYER_LEVEL, level));
    const DAILY_XP_SUPPLY = 2520;
    const TARGET_DAYS_TO_MAX = 1100;
    const days = TARGET_DAYS_TO_MAX * Math.pow((L - 1) / (GAME_CONFIG.MAX_PLAYER_LEVEL - 1), 2.2);
    return Math.round(DAILY_XP_SUPPLY * days);
  },

  getNextLevelRequirement() {
    const maxLvl = GAME_CONFIG.MAX_PLAYER_LEVEL || 81;
    const curLvl = this.state.level || 1;
    const isMaxLevel = curLvl >= maxLvl;
    const nextLvl = isMaxLevel ? maxLvl : curLvl + 1;
    const xp = Math.max(60, this.getCumulativeXpForLevel(nextLvl) - this.getCumulativeXpForLevel(curLvl));

    // Sefer Matematiği (Tüm seferlere eşit gönderilerek XP'nin dolması için gereken sefer sayısı):
    const durMin = this.getExpeditionDurationMinutes(curLvl);
    const durHours = durMin / 60;
    const xpPerExp = Math.max(5, Math.floor(35 * durHours));
    const xpPerCycle = 3 * xpPerExp;
    const cycles = Math.max(1, Math.ceil(xp / Math.max(1, xpPerCycle)));

    // Bu sefer döngülerinde kazanılan toplam hammadde:
    const rateWood = (GAME_CONFIG.BASE_PRODUCTION && GAME_CONFIG.BASE_PRODUCTION.wood) || 18;
    const rateIron = (GAME_CONFIG.BASE_PRODUCTION && GAME_CONFIG.BASE_PRODUCTION.iron) || 12;
    const rateWheat = (GAME_CONFIG.BASE_PRODUCTION && GAME_CONFIG.BASE_PRODUCTION.wheat) || 30;

    const totalWood = cycles * durMin * rateWood;
    const totalIron = cycles * durMin * rateIron;
    const totalWheat = cycles * durMin * rateWheat;

    // Seviye yükseltme maliyeti: Kazanılan kaynakların tam yarısı (%50):
    const wood = Math.round(totalWood / 2);
    const iron = Math.round(totalIron / 2);
    const wheat = Math.round(totalWheat / 2);

    // ASTRA maliyeti: AMM DEX pazar yerinde istenen odun, demir ve buğdayın anlık toplam AdAstra değeri!
    let adAstra = 0;
    let ammBreakdown = { wood: 0, iron: 0, wheat: 0 };
    if (typeof ammMarket !== 'undefined' && ammMarket && ammMarket.calculateResourcesAdAstraValue) {
      const calc = ammMarket.calculateResourcesAdAstraValue({ wood, iron, wheat });
      adAstra = calc.totalAda;
      ammBreakdown = calc.breakdown;
    } else if (typeof ammMarket !== 'undefined' && ammMarket && ammMarket.getEstimatedAdAstraForSell) {
      const sWood = ammMarket.getEstimatedAdAstraForSell('wood', wood);
      const sIron = ammMarket.getEstimatedAdAstraForSell('iron', iron);
      const sWheat = ammMarket.getEstimatedAdAstraForSell('wheat', wheat);
      adAstra = Math.max(0.001, round3(sWood + sIron + sWheat));
      ammBreakdown = { wood: round3(sWood), iron: round3(sIron), wheat: round3(sWheat) };
    } else {
      const P = k => (GAME_CONFIG.AMM_CORRIDORS[k] || {}).defaultPriceAda || 0.01;
      adAstra = round3(wood * P('wood') + iron * P('iron') + wheat * P('wheat'));
      ammBreakdown = { wood: round3(wood * P('wood')), iron: round3(iron * P('iron')), wheat: round3(wheat * P('wheat')) };
    }

    const curFragRate = this.getFragmentDropRate(curLvl);
    const nextFragRate = this.getFragmentDropRate(nextLvl);
    const curBoxRate = this.getBoxDropRate(curLvl);
    const nextBoxRate = this.getBoxDropRate(nextLvl);

    return {
      level: nextLvl,
      xp,
      cycles,
      durMin,
      totalWoodEarned: totalWood,
      totalIronEarned: totalIron,
      totalWheatEarned: totalWheat,
      wood,
      iron,
      wheat,
      adAstra,
      ammBreakdown,
      curFragRate,
      nextFragRate,
      curBoxRate,
      nextBoxRate,
      curFragRateFormatted: this.formatDropChance(curFragRate),
      nextFragRateFormatted: this.formatDropChance(nextFragRate),
      curBoxRateFormatted: this.formatDropChance(curBoxRate),
      nextBoxRateFormatted: this.formatDropChance(nextBoxRate),
      durationHours: this.getExpeditionDurationHours(nextLvl),
      isMaxLevel
    };
  },

  levelUp() {
    const maxLvl = GAME_CONFIG.MAX_PLAYER_LEVEL || 81;
    if ((this.state.level || 1) >= maxLvl) {
      return { success: false, message: `🏆 Tebrikler! Maksimum seviyeye (Lv.${maxLvl}) zaten ulaştın!` };
    }

    const req = this.getNextLevelRequirement();
    const inv = this.state.inventory;

    if (this.state.currentXp < req.xp) {
      return { success: false, message: `Yetersiz XP! (${this.state.currentXp}/${req.xp} XP)` };
    }
    if ((inv.wood || 0) < req.wood) {
      return { success: false, message: `Yetersiz Odun! (${req.wood} Odun gerekli)` };
    }
    if ((inv.iron || 0) < req.iron) {
      return { success: false, message: `Yetersiz Demir! (${req.iron} Demir gerekli)` };
    }
    if ((inv.wheat || 0) < req.wheat) {
      return { success: false, message: `Yetersiz Buğday! (${req.wheat} Buğday gerekli)` };
    }
    if (this.state.adAstraBalance < req.adAstra) {
      return { success: false, message: `Yetersiz AdAstra! (${req.adAstra} ASTRA gerekli)` };
    }

    // Maliyetleri düş
    inv.wood -= req.wood;
    inv.iron -= req.iron;
    inv.wheat -= req.wheat;
    this.burnResources({ wood: req.wood, iron: req.iron, wheat: req.wheat });
    this.state.adAstraBalance -= req.adAstra;
    this._onAdaSpent(req.adAstra);
    globalPool.recordTokenSpend(req.adAstra);

    this.state.currentXp -= req.xp;
    this.state.level += 1;
    this.state.maxStamina = this.getMaxStamina(this.state.level);
    this.state.stamina = this.state.maxStamina;

    this.saveState();

    const newDuration = this.getExpeditionDurationHours();
    return {
      success: true,
      message: `🎉 TEBRİKLER! Seviye ${this.state.level}'e ulaştın! (Maksimum Stamina: ${this.state.maxStamina} ⚡, Sefer Süresi: ${newDuration} Saat)`,
      newLevel: this.state.level,
      newDuration,
      maxStamina: this.state.maxStamina
    };
  },

  // =========================================================================
  // 3. KIŞLA ASKER SATIN ALMA (BARRACKS ARMY)
  // =========================================================================
  buyTroop(troopId) {
    const troop = GAME_CONFIG.TROOP_TYPES[troopId];
    if (!troop) return { success: false, message: 'Geçersiz asker!' };

    const troopCost = this.adaPrice(troop.costAdAstra);
    if (this.state.adAstraBalance < troopCost) {
      return { success: false, message: `Yetersiz AdAstra! (${troopCost} ASTRA gerekli)` };
    }

    this.state.adAstraBalance -= troopCost;
    this._onAdaSpent(troopCost);
    globalPool.recordTokenSpend(troopCost);

    this.state.army[troopId] = (this.state.army[troopId] || 0) + 1;
    this.saveState();

    return {
      success: true,
      message: `⚔️ 1 adet ${troop.name} orduya katıldı! (Toplam: ${this.state.army[troopId]})`
    };
  },

  // =========================================================================
  // 4. TAVERNA GÜÇLENDİRMELERİ (24 SAATLİK BOOSTLAR & BOT)
  // =========================================================================
  isBuffActive(buffId) {
    const buff = this.state.activeBuffs ? this.state.activeBuffs[buffId] : null;
    if (!buff) return false;
    return this._now() < buff.expiresAt;
  },

  buyTavernBuff(buffId) {
    // v1.25: Otomasyon botu yalnızca Taverna'dan güncel (kâr ortaklığı) fiyatıyla alınır. Eski sabit
    // fiyatlı paketler (24 saat 1.800 ASTRA vb.) gerçek ücretin çok altındaydı; bu yol kapatıldı.
    if (String(buffId || '').startsWith('auto_collector')) {
      return { success: false, message: 'Otomasyon botu yalnızca Taverna\'dan güncel fiyatıyla alınabilir.' };
    }
    const buffConfig = GAME_CONFIG.TAVERN_BUFFS[buffId];
    if (!buffConfig) return { success: false, message: 'Geçersiz güçlendirme!' };

    const buffCost = this.adaPrice(buffConfig.costAdAstra);
    if (this.state.adAstraBalance < buffCost) {
      return { success: false, message: `Yetersiz AdAstra! (${buffCost} ASTRA gerekli)` };
    }

    this.state.adAstraBalance -= buffCost;
    this._onAdaSpent(buffCost);
    globalPool.recordTokenSpend(buffCost);

    const now = this._now();
    const currentExpire = (this.state.activeBuffs[buffId] && this.state.activeBuffs[buffId].expiresAt > now)
      ? this.state.activeBuffs[buffId].expiresAt
      : now;

    this.state.activeBuffs[buffId] = {
      id: buffId,
      name: buffConfig.name,
      expiresAt: currentExpire + buffConfig.durationSeconds * 1000
    };

    this.saveState();

    return {
      success: true,
      message: `✨ ${buffConfig.name} 24 saatliğine aktif edildi!`
    };
  },

  // =========================================================================
  // 5. ALET TAMİRATI (Dakika Başına Odun & Demir Üretiminin %25/3'ü + 1 ASTRA)
  // =========================================================================
  calculateRepairCost(toolId) {
    const toolConfig = GAME_CONFIG.TOOLS[toolId];
    const playerTool = this.state.tools ? this.state.tools[toolId] : null;
    if (!toolConfig || !playerTool) return null;

    const maxDur = (playerTool && playerTool.maxDurability != null) ? playerTool.maxDurability : (toolConfig.maxDurability || 4320);
    const curDur = Math.min(maxDur, Math.max(0, playerTool.durability != null ? playerTool.durability : maxDur));
    const missingDurability = maxDur - curDur; // Eksilen dakika sayısı

    // Dakika başına üretilen Odun ve Demir
    const woodRatePm = this.getResourceRatePerMinute('wood');
    const ironRatePm = this.getResourceRatePerMinute('iron');

    // Kural: Dakika başına üretilen odun ve demirin %25'i alınıp 3 alete paylaştırılır (/ 3)
    const woodCostPerMin = (woodRatePm * 0.25) / 3;
    const ironCostPerMin = (ironRatePm * 0.25) / 3;

    if (missingDurability <= 0) {
      return {
        missingDurability: 0,
        woodCost: 0,
        ironCost: 0,
        wheatCost: 0,
        adAstraCost: 0,
        toolName: toolConfig.name,
        maxDurability: maxDur,
        currentDurability: curDur,
        woodCostPerMin: parseFloat(woodCostPerMin.toFixed(2)),
        ironCostPerMin: parseFloat(ironCostPerMin.toFixed(2)),
        adAstraCostPerMin: 0
      };
    }

    const woodCost = Math.ceil(missingDurability * woodCostPerMin);
    const ironCost = Math.ceil(missingDurability * ironCostPerMin);

    // Kural (v2, R3): istenen odun ve demirin pazar değerinin TOOL_REPAIR_ADA_SHARE (%30) kadarı ASTRA
    const adaShare = Number(GAME_CONFIG.TOOL_REPAIR_ADA_SHARE ?? 0.3);
    let adAstraCost = 0;
    let ammBreakdown = { wood: 0, iron: 0 };
    if (missingDurability > 0) {
      if (typeof ammMarket !== 'undefined' && ammMarket && ammMarket.calculateResourcesAdAstraValue) {
        const ammCalc = ammMarket.calculateResourcesAdAstraValue({ wood: woodCost, iron: ironCost });
        adAstraCost = Math.max(0.001, round3(ammCalc.totalAda * adaShare));
        ammBreakdown = ammCalc.breakdown;
      } else {
        const pWood = (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? (ammMarket.getPrice('wood') || 0.025) : 0.025;
        const pIron = (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? (ammMarket.getPrice('iron') || 0.04) : 0.04;
        adAstraCost = Math.max(0.001, round3((woodCost * pWood + ironCost * pIron) * adaShare));
        ammBreakdown = { wood: round3(woodCost * pWood), iron: round3(ironCost * pIron) };
      }
    }
    const adAstraCostPerMin = missingDurability > 0 ? parseFloat((adAstraCost / missingDurability).toFixed(5)) : 0;

    return {
      toolName: toolConfig.name,
      woodCost,
      ironCost,
      wheatCost: 0,
      adAstraCost,
      ammBreakdown,
      missingDurability,
      maxDurability: maxDur,
      currentDurability: curDur,
      woodCostPerMin: parseFloat(woodCostPerMin.toFixed(2)),
      ironCostPerMin: parseFloat(ironCostPerMin.toFixed(2)),
      adAstraCostPerMin
    };
  },

  repairTool(toolId) {
    const cost = this.calculateRepairCost(toolId);
    if (!cost) return { success: false, message: 'Geçersiz alet!' };
    if (cost.missingDurability === 0) return { success: false, message: 'Alet zaten tamamen sağlam!' };

    const inv = this.state.inventory;
    if ((inv.wood || 0) < cost.woodCost) {
      return {
        success: false,
        message: `Yetersiz Odun! (${cost.woodCost} Odun gerekli, ambarında: ${Math.floor(inv.wood || 0)})`
      };
    }
    if ((inv.iron || 0) < cost.ironCost) {
      return {
        success: false,
        message: `Yetersiz Demir! (${cost.ironCost} Demir gerekli, ambarında: ${Math.floor(inv.iron || 0)})`
      };
    }
    if (this.state.adAstraBalance < cost.adAstraCost) {
      // 🤖 KULLANICI KURALI: Eğer alet onarırken hesapta yeteri kadar ASTRA yok ise bot,
      // aletleri onarmak için ihtiyaç duyduğu ASTRA miktarı kadar elindeki kaynaklardan
      // eşit miktarda satarak pazardan ASTRA elde eder!
      const isBotActive = this.hasPurchasedBot();
      if (isBotActive) {
        this.autoFundBotAdaDeficit(cost.adAstraCost, { wood: cost.woodCost, iron: cost.ironCost });
      }
    }

    if (this.state.adAstraBalance < cost.adAstraCost) {
      return {
        success: false,
        message: `Yetersiz ASTRA! (${cost.adAstraCost} ASTRA gerekli, sende: ${Number(this.state.adAstraBalance || 0).toFixed(2)} ASTRA)`
      };
    }

    inv.wood -= cost.woodCost;
    inv.iron -= cost.ironCost;
    this.burnResources({ wood: cost.woodCost, iron: cost.ironCost });
    this.state.adAstraBalance -= cost.adAstraCost;
    this._onAdaSpent(cost.adAstraCost);
    globalPool.recordTokenSpend(cost.adAstraCost);

    const maxDur = (this.state.tools[toolId]?.maxDurability != null) ? this.state.tools[toolId].maxDurability : (GAME_CONFIG.TOOLS[toolId]?.maxDurability || 4320);
    this.state.tools[toolId].durability = maxDur;

    this.saveState();

    return {
      success: true,
      message: `🔧 ${cost.toolName} tamamen onarıldı (${maxDur}/${maxDur} dk)! (-${cost.woodCost} Odun, -${cost.ironCost} Demir, -${cost.adAstraCost} ASTRA)`
    };
  },

  faucetAdAstra(amount = 100) {
    this.state.adAstraBalance += amount;
    this._onAdaEarned(amount);
    this.saveState();
    return this.state.adAstraBalance;
  },

  // =========================================================================
  // 7. WAREHOUSE MANAGEMENT & UPGRADE (MATEMATİKSEL EKONOMİ MODELİ)
  // =========================================================================
  // =========================================================================
  // =========================================================================
  // 7. SİLO / DEPO YÖNETİMİ & YÜKSELTMELERİ (WAREHOUSE / SILO)
  // =========================================================================
  // Maksimum Seviye: 18 (İstifçiliği önleme kuralı)
  // Başlangıç (Seviye 1): 1080 Odun, 720 Demir, 1800 Buğday (30/dk x 60 dk = tam 1 saatlik üretim dengesi)
  // Maksimum (Seviye 18): Haftalık havuz limitlerinin %50'si:
  //   - Odun: 90.000 (180k haftalık havuz limitinin %50'si)
  //   - Demir: 65.000 (130k haftalık havuz limitinin %50'si)
  //   - Buğday: 245.000 (490k haftalık havuz limitinin %50'si)
  // v2: 6 hammadde + parça; 13+ seviye Universe açılana kadar kapalı (universeGateLevel)
  getWarehouseMaxLevel() {
    const W = GAME_CONFIG.WAREHOUSE || {};
    const gate = (GAME_CONFIG.UNIVERSE_STAGE || 0) >= 3 ? (W.baseLevels || 18) : (W.universeGateLevel || W.baseLevels || 18);
    return Math.min(W.baseLevels || 18, gate);
  },

  getWarehouseCapacity(level = this.state.warehouseLevel) {
    const { baseLevels: maxLevel, initialCapacities: min, maxCapacities: max, fragmentsPerLevel } = GAME_CONFIG.WAREHOUSE;
    const lvl = Math.max(1, Math.min(maxLevel, level));
    const step = lvl - 1;
    const grow = res => (lvl === maxLevel ? max[res] : Math.round(min[res] * Math.pow(Math.pow(max[res] / min[res], 1 / (maxLevel - 1)), step)));
    const cap = {};
    // v2: Büyük Ambar projesi bitince herkesin silosu %5 büyür
    const siloMult = 1 + ((typeof globalPool !== 'undefined' && globalPool && globalPool.getProjectBonus) ? globalPool.getProjectBonus('warehouse') : 0);
    for (const k of RES_KEYS()) cap[k] = min[k] != null && max[k] != null ? Math.round(grow(k) * siloMult) : null;
    cap.fragments = lvl === maxLevel ? max.fragments : Math.round(min.fragments + step * fragmentsPerLevel);
    return cap;
  },

  getWarehouseUpgradeCost(currentLevel = this.state.warehouseLevel) {
    const maxLevel = this.getWarehouseMaxLevel();
    if (currentLevel >= maxLevel) return null;

    const currentCap = this.getWarehouseCapacity(currentLevel);
    const nextCap = this.getWarehouseCapacity(currentLevel + 1);
    const keys = RES_KEYS().filter(k => currentCap[k] != null);

    // Kural: her hammadde için mevcut kapasitenin yarısı
    const costs = {};
    for (const k of keys) costs[k] = Math.floor(currentCap[k] / 2);

    // Kural: bu hammaddelerin pazarda (havuz) satılsa kaç ASTRA edeceği
    let adAstra = 0;
    let ammBreakdown = zeroRes();
    if (typeof ammMarket !== 'undefined' && ammMarket && ammMarket.calculateResourcesAdAstraValue) {
      const calc = ammMarket.calculateResourcesAdAstraValue(costs);
      adAstra = calc.totalAda;
      ammBreakdown = calc.breakdown;
    } else {
      for (const k of keys) { const p = (GAME_CONFIG.AMM_CORRIDORS[k] || {}).defaultPriceAda || 0.01; ammBreakdown[k] = round3(costs[k] * p); adAstra += costs[k] * p; }
      adAstra = round3(adAstra);
    }

    // Kural: Siloyu yükseltmek için tüm hammadde depoları %80 DOLU olmak zorunda!
    const inv = this.state.inventory || {};
    const fills = {}, fillOk = {};
    for (const k of keys) { fills[k] = Math.round(currentCap[k] * 0.8); fillOk[k] = (inv[k] || 0) >= fills[k]; }
    const is80PercentFull = keys.every(k => fillOk[k]);
    const canAffordCost = keys.every(k => (inv[k] || 0) >= costs[k]) && (this.state.adAstraBalance || 0) >= adAstra;

    return {
      currentLevel,
      nextLevel: currentLevel + 1,
      maxLevel,
      currentCap,
      nextCap,
      keys,
      costs,
      fills,
      fillOk,
      // geriye dönük alanlar (eski ekranlar ve testler)
      wood: costs.wood || 0, iron: costs.iron || 0, wheat: costs.wheat || 0,
      reqWoodFill: fills.wood || 0, reqIronFill: fills.iron || 0, reqWheatFill: fills.wheat || 0,
      isWood80: fillOk.wood !== false, isIron80: fillOk.iron !== false, isWheat80: fillOk.wheat !== false,
      adAstra,
      ammBreakdown,
      is80PercentFull,
      canAffordCost,
      canUpgrade: is80PercentFull && canAffordCost
    };
  },

  upgradeWarehouse() {
    const cost = this.getWarehouseUpgradeCost();
    if (!cost) {
      const gated = (this.state.warehouseLevel || 1) < ((GAME_CONFIG.WAREHOUSE || {}).baseLevels || 18);
      return { success: false, message: gated ? '🚀 Silonun 13. seviyesi ve üstü Universe alüminyumu ister; Universe açılınca devam eder.' : 'Deponuz zaten maksimum seviyede!' };
    }

    const inv = this.state.inventory || {};
    // 1. ÖN KOŞUL: Tüm hammadde depoları en az %80 dolu olmak zorunda!
    if (!cost.is80PercentFull) {
      const unfulfilled = cost.keys.filter(k => !cost.fillOk[k]).map(k => `${this.getResourceIcon(k)} ${this.getResourceNameTr(k)} (${Math.floor(inv[k] || 0)}/${cost.fills[k]})`);
      return {
        success: false,
        message: `⚠️ Silo yükseltilemez! Tüm depolar en az %80 dolu olmalıdır. Yetersiz olanlar: ${unfulfilled.join(', ')}`
      };
    }

    // 2. MALİYET KONTROLÜ
    for (const k of cost.keys) {
      if ((inv[k] || 0) < cost.costs[k]) return { success: false, message: `Yetersiz ${this.getResourceNameTr(k)}! (${cost.costs[k]} ${this.getResourceNameTr(k)} gerekli)` };
    }
    if ((this.state.adAstraBalance || 0) < cost.adAstra) {
      return { success: false, message: `Yetersiz ASTRA! (${cost.adAstra} ASTRA gerekli)` };
    }

    // Maliyetleri düş
    for (const k of cost.keys) inv[k] -= cost.costs[k];
    this.burnResources(cost.costs);
    this.state.adAstraBalance -= cost.adAstra;
    this._onAdaSpent(cost.adAstra);
    globalPool.recordTokenSpend(cost.adAstra);

    this.state.warehouseLevel += 1;

    this.saveState();

    const newCap = this.getWarehouseCapacity(this.state.warehouseLevel);
    return {
      success: true,
      message: `🏰 Silo Seviye ${this.state.warehouseLevel}'e yükseltildi! Yeni kapasiteler: ${cost.keys.map(k => `${this.getResourceIcon(k)} ${newCap[k]}`).join(' · ')}.`
    };
  },

  // =========================================================================
  // 🤖 AMM DEX ANLIK MALİYET BOTU (Her saniye ve her fiyat değişiminde otomatik tarar)
  // =========================================================================
  tickUpgradeCostBot(deltaSeconds = 1) {
    this._upgradeBotTimer = (this._upgradeBotTimer || 0) + deltaSeconds;
    if (this._upgradeBotTimer < 1.0 && this.liveUpgradeCosts && deltaSeconds > 0) {
      return this.liveUpgradeCosts;
    }
    this._upgradeBotTimer = 0;

    const warehouseCost = this.getWarehouseUpgradeCost();
    const levelReq = this.getNextLevelRequirement();
    const toolsRepair = this.getAllRepairCost();
    const botFinancials = this.calculateTavernaBotProfitAndCost();

    this.liveUpgradeCosts = {
      timestamp: Date.now(),
      warehouse: warehouseCost ? {
        level: warehouseCost.nextLevel,
        wood: warehouseCost.wood,
        iron: warehouseCost.iron,
        wheat: warehouseCost.wheat,
        adAstra: warehouseCost.adAstra,
        breakdown: warehouseCost.ammBreakdown || {},
        canAfford: warehouseCost.canAffordCost,
        canUpgrade: warehouseCost.canUpgrade,
        is80PercentFull: warehouseCost.is80PercentFull
      } : null,
      accountLevel: {
        level: levelReq.level,
        wood: levelReq.wood,
        iron: levelReq.iron,
        wheat: levelReq.wheat,
        adAstra: levelReq.adAstra,
        breakdown: levelReq.ammBreakdown || {},
        canAfford: (this.state.inventory.wood || 0) >= levelReq.wood &&
                   (this.state.inventory.iron || 0) >= levelReq.iron &&
                   (this.state.inventory.wheat || 0) >= levelReq.wheat &&
                   (this.state.adAstraBalance || 0) >= levelReq.adAstra
      },
      toolsRepair,
      bot: botFinancials,
      prices: {
        wheat: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('wheat') : 0.9,
        wood: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('wood') : 2.5,
        iron: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('iron') : 4.0,
        fragments: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('fragments') : 45.0,
        boxes: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('boxes') : 10000.0,
        keys: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('keys') : 1000.0
      }
    };

    return this.liveUpgradeCosts;
  },

  // 🏛️ Anlık Piyasa Fiyatları & Tüm Dinamik Ödeme Maliyetleri Tarayıcısı
  getDynamicEconomyRates() {
    const p = {
      wheat: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('wheat') : 0.9,
      wood: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('wood') : 2.5,
      iron: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('iron') : 4.0,
      fragments: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('fragments') : 45.0,
      boxes: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('boxes') : 10000.0,
      keys: (typeof ammMarket !== 'undefined' && ammMarket.getPrice) ? ammMarket.getPrice('keys') : 1000.0
    };

    return {
      prices: p,
      warehouse: this.getWarehouseUpgradeCost(),
      accountLevel: this.getNextLevelRequirement(),
      toolsRepair: this.getAllRepairCost(),
      equipmentCraft: this.getAllEquipmentCraftCosts(),
      equipmentRepair: this.getAllEquipmentRepairCostInKingdom(),
      soldiersHeal: this.getAllSoldiersHealCost(),
      bot: this.calculateTavernaBotProfitAndCost()
    };
  },
};
