// Realm of AdAstra — GameStateManager yöntemleri: Teçhizat: üretim, geliştirme, onarım, kuşandırma, hurdaya ayırma
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';

const YUVALAR = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
const EKIPMAN_DAYANIKLILIK = 13;   // yeni dövülen ya da yükseltilen eşyanın dayanıklılığı (her zafer -1)

export const techizatYontemleri = {
  // Tüm teçhizat yuvalarının anlık dövme (craft) maliyetlerini AMM DEX fiyatlarıyla hesaplar
  getAllEquipmentCraftCosts() {
    const maliyetler = {};
    for (const yuva of YUVALAR) maliyetler[yuva] = this.calculateEquipmentCraftCost(yuva);
    return maliyetler;
  },

  // Krallıktaki (çanta, cephanelik ve ordudaki) tüm hasarlı teçhizatların anlık onarım maliyetini hesaplar
  getAllEquipmentRepairCostInKingdom() {
    const all = this.getAllArmoryEquipmentList ? this.getAllArmoryEquipmentList() : [];
    let totalIron = 0, totalWood = 0, totalAda = 0, repairedCount = 0;
    all.forEach(entry => {
      if (entry && entry.item) {
        const cost = this.calculateEquipmentRepairCost(entry.item);
        if (cost && cost.missingDurability > 0) {
          totalIron += cost.ironCost;
          totalWood += cost.woodCost;
          totalAda += cost.adaCost;
          repairedCount++;
        }
      }
    });
    return {
      count: repairedCount,
      totalIron,
      totalWood,
      totalAda,
      canAfford: (this.state.inventory?.iron || 0) >= totalIron &&
                 (this.state.inventory?.wood || 0) >= totalWood &&
                 (this.state.adAstraBalance || 0) >= totalAda
    };
  },

  // Ordudaki tüm yaralı askerlerin anlık doyurma & iyileştirme maliyetini hesaplar
  getAllSoldiersHealCost() {
    const units = this.state.soldierUnits || [];
    let totalWheat = 0, totalAda = 0, woundedCount = 0;
    units.forEach((_, idx) => {
      const info = this.getSoldierHealInfo(idx);
      if (info && !info.isFull) {
        totalWheat += info.wheatNeeded;
        totalAda += info.adaCost;
        woundedCount++;
      }
    });
    return {
      woundedCount,
      totalWheat: Math.round(totalWheat * 100) / 100,
      totalAda: Math.round(totalAda * 100) / 100,
      canAfford: (this.state.inventory?.wheat || 0) >= totalWheat &&
                 (this.state.adAstraBalance || 0) >= totalAda
    };
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🔨 YENİ MATEMATİKSEL TEÇHİZAT CRAFT, UPGRADE VE ONARIM MOTORU
  // ═══════════════════════════════════════════════════════════════════════
  // 1 ATK = 18 dk Odun (324) + 18 dk Demir (216) + AMM DEX ASTRA + 1 Parça
  // 1 HP  = 21 dk Odun (378) + 21 dk Demir (252) + AMM DEX ASTRA + 1 Parça
  // Upgrade: Hammadde +%18 (1.18x), Parça 2 katı (1 -> 2 -> 4 -> 8 -> 16)
  // Dayanıklılık: 13/13 (Zafere -1). Sıfırlanınca yenileme: Kümülatif üretimin %10'u
  // ═══════════════════════════════════════════════════════════════════════

  getCumulativeEquipmentResourceCost(item) {
    const lvl = Math.max(1, item?.level || 1);
    const atk = item?.baseAtk || (item?.slot === 'weapon' ? 25 : 0);
    const hp = item?.baseHp || (item?.slot !== 'weapon' ? 50 : 0);
    // v2: eşyanın gücü dakikalık taban üretimle çarpılır (GAME_CONFIG.EQUIPMENT_CRAFT_MINUTES; dövme bedeliyle aynı formül)
    const CM = GAME_CONFIG.EQUIPMENT_CRAFT_MINUTES || { PER_ATK: 2, PER_HP: 0.8 };
    const minutes = atk * CM.PER_ATK + hp * CM.PER_HP;
    const baseWood = Math.max(15, Math.round(minutes * (GAME_CONFIG.BASE_PRODUCTION?.wood ?? 18)));
    const baseIron = Math.max(20, Math.round(minutes * (GAME_CONFIG.BASE_PRODUCTION?.iron ?? 12)));

    let totalWood = 0;
    let totalIron = 0;
    for (let l = 1; l <= lvl; l++) {
      const mult = Math.pow(1.18, l - 1);
      totalWood += baseWood * mult;
      totalIron += baseIron * mult;
    }
    return {
      baseWood,
      baseIron,
      totalWood: Math.round(totalWood),
      totalIron: Math.round(totalIron)
    };
  },

  // 1. Ekipman Dövme Maliyetini Hesapla
  calculateEquipmentCraftCost(recipeOrSlot) {
    const recipe = typeof recipeOrSlot === 'string'
      ? (GAME_CONFIG.EQUIPMENT_RECIPES[recipeOrSlot] || {})
      : (recipeOrSlot || {});
    const atk = recipe.baseAtk || 0;
    const hp = recipe.baseHp || 0;
    // v2: 1 ATK ve 1 CAN kaç dakikalık üretim ister (GAME_CONFIG.EQUIPMENT_CRAFT_MINUTES); kömür demirin üçte biri kadar dakika
    const CM = GAME_CONFIG.EQUIPMENT_CRAFT_MINUTES || { PER_ATK: 2, PER_HP: 0.8 };
    const minutes = atk * CM.PER_ATK + hp * CM.PER_HP;
    const P = GAME_CONFIG.BASE_PRODUCTION || {};
    const wood = Math.max(15, Math.round(minutes * (P.wood ?? 18)));
    const iron = Math.max(20, Math.round(minutes * (P.iron ?? 12)));
    const coal = P.coal > 0 ? Math.max(10, Math.round(minutes * P.coal / 3)) : 0;
    const fragments = 1;
    const adaCost = ammMarket.calculateResourcesAdAstraValue(coal > 0 ? { wood, iron, coal } : { wood, iron }).totalAda;

    return {
      wood,
      iron,
      coal,
      fragments,
      adAstra: adaCost,
      woodCost: wood,
      ironCost: iron,
      coalCost: coal,
      fragCost: fragments,
      adaCost: adaCost
    };
  },

  // Ekipman dövme (sınırsız): bedel envanterden ve bakiyeden düşer; yuva boşsa eşya doğrudan kuşanılır,
  // doluysa Cephanelik Deposu'na eklenir.
  craftEquipment(slotKey) {
    const tarif = GAME_CONFIG.EQUIPMENT_RECIPES[slotKey];
    if (!tarif) return { success: false, message: 'Geçersiz ekipman parçası!' };

    if (!this.state.equipment) this.state.equipment = Object.fromEntries(YUVALAR.map(y => [y, null]));
    if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];

    const bedel = this.calculateEquipmentCraftCost(tarif);
    const envanter = this.state.inventory;
    const komurGerekli = (bedel.coal || 0) > 0;

    if ((envanter.fragments || 0) < bedel.fragments) {
      return { success: false, message: `Yetersiz Teçhizat Parçası! (${bedel.fragments} Teçhizat Parçaları gerekli)` };
    }
    if ((envanter.iron || 0) < bedel.iron) return { success: false, message: `Yetersiz Demir! (${bedel.iron} Demir gerekli)` };
    if ((envanter.wood || 0) < bedel.wood) return { success: false, message: `Yetersiz Odun! (${bedel.wood} Odun gerekli)` };
    if (komurGerekli && (envanter.coal || 0) < bedel.coal) return { success: false, message: `Yetersiz Kömür! (${bedel.coal} Kömür gerekli)` };
    if (this.state.adAstraBalance < bedel.adAstra) {
      return { success: false, message: `Yetersiz AdAstra! (${bedel.adAstra} ASTRA gerekli)` };
    }

    envanter.fragments = (envanter.fragments || 0) - bedel.fragments;
    this.burnItem('fragments', bedel.fragments);
    envanter.iron -= bedel.iron;
    envanter.wood -= bedel.wood;
    if (komurGerekli) envanter.coal = (envanter.coal || 0) - bedel.coal;
    this.burnResources({ wood: bedel.wood, iron: bedel.iron, coal: bedel.coal || 0 });
    this.state.adAstraBalance -= bedel.adAstra;
    this._onAdaSpent(bedel.adAstra);
    globalPool.recordTokenSpend(bedel.adAstra);

    const esya = {
      id: `${tarif.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      slot: tarif.slot,
      name: tarif.name,
      icon: tarif.icon,
      level: 1,
      baseAtk: tarif.baseAtk,
      baseHp: tarif.baseHp,
      atkBonus: tarif.baseAtk,
      hpBonus: tarif.baseHp,
      durability: EKIPMAN_DAYANIKLILIK,
      maxDurability: EKIPMAN_DAYANIKLILIK,
      craftedAt: Date.now()
    };

    let varis;
    if (!this.state.equipment[slotKey]) {
      this.state.equipment[slotKey] = esya;
      varis = 've krallık ana yuvasına kuşandırıldı';
    } else {
      this.state.armoryInventory.push(esya);
      varis = "ve Cephanelik Deposu'na eklendi";
    }

    this.saveState();

    return {
      success: true,
      message: `⚒️ ${tarif.icon} ${tarif.name} başarıyla dövüldü ${varis}! (${EKIPMAN_DAYANIKLILIK}/${EKIPMAN_DAYANIKLILIK} Dayanıklılık)`,
      item: esya
    };
  },

  // 2. Ekipman Geliştirme Maliyeti (Upgrade Cost)
  // Kaynaklar +%18 artar, Parçalar 2 katına çıkar, ASTRA ise AMM DEX pazar değerine eşittir
  calculateEquipmentUpgradeCost(itemOrSlot, soldierIndex = null) {
    let item = null;
    if (typeof itemOrSlot === 'object' && itemOrSlot !== null) {
      item = itemOrSlot;
    } else if (soldierIndex !== null && soldierIndex !== undefined && soldierIndex !== '') {
      const soldier = (this.state.soldierUnits || [])[soldierIndex];
      item = soldier?.equipment ? soldier.equipment[itemOrSlot] : null;
    } else {
      item = this.state.equipment ? this.state.equipment[itemOrSlot] : null;
    }
    if (!item) return null;

    const currentLvl = item.level || 1;
    if (currentLvl >= (GAME_CONFIG.EQUIPMENT_MAX_LEVEL || 10)) {
      return { isMaxLevel: true, currentLevel: currentLvl };
    }

    const nextLvl = currentLvl + 1;
    const cum = this.getCumulativeEquipmentResourceCost(item);
    const mult = Math.pow(1.18, currentLvl);
    const woodCost = Math.max(15, Math.round(cum.baseWood * mult));
    const ironCost = Math.max(20, Math.round(cum.baseIron * mult));
    const fragmentCost = Math.pow(2, currentLvl); // 1 -> 2 -> 4 -> 8 -> 16
    const adAstraCost = ammMarket.calculateResourcesAdAstraValue({ wood: woodCost, iron: ironCost }).totalAda;

    return {
      isMaxLevel: false,
      currentLevel: currentLvl,
      nextLevel: nextLvl,
      ironCost,
      woodCost,
      fragmentCost,
      adAstraCost,
      fragCost: fragmentCost,     // Cephanelik kartı bu adları okur (eskiden undefined yazıyor, düğme hep kapalı kalıyordu)
      adaCost: adAstraCost,
      nextAtk: Math.round(item.baseAtk * (1 + (nextLvl - 1) * 0.35)),
      nextHp: Math.round(item.baseHp * (1 + (nextLvl - 1) * 0.35)),
      item
    };
  },

  // Ekipmanı Geliştir
  upgradeEquipment(itemOrSlot, soldierIndex = null) {
    const cost = this.calculateEquipmentUpgradeCost(itemOrSlot, soldierIndex);
    if (!cost) return { success: false, message: 'Ekipman bulunamadı!' };
    if (cost.isMaxLevel) return { success: false, message: 'Bu ekipman zaten maksimum seviyede (Lv.10 Master)!' };

    const inv = this.state.inventory;
    if ((inv.fragments || 0) < cost.fragmentCost) {
      return { success: false, message: `Yetersiz Teçhizat Parçası! (${cost.fragmentCost} Teçhizat Parçaları gerekli)` };
    }
    if ((inv.iron || 0) < cost.ironCost) {
      return { success: false, message: `Yetersiz Demir! (${cost.ironCost} Demir gerekli)` };
    }
    if ((inv.wood || 0) < cost.woodCost) {
      return { success: false, message: `Yetersiz Odun! (${cost.woodCost} Odun gerekli)` };
    }
    if (this.state.adAstraBalance < cost.adAstraCost) {
      return { success: false, message: `Yetersiz AdAstra! (${cost.adAstraCost} ASTRA gerekli)` };
    }

    inv.fragments = (inv.fragments || 0) - cost.fragmentCost;
    this.burnItem('fragments', cost.fragmentCost);
    inv.iron -= cost.ironCost;
    inv.wood -= cost.woodCost;
    this.burnResources({ wood: cost.woodCost, iron: cost.ironCost });
    this.state.adAstraBalance -= cost.adAstraCost;
    this._onAdaSpent(cost.adAstraCost);
    globalPool.recordTokenSpend(cost.adAstraCost);

    const item = cost.item;
    item.level = cost.nextLevel;
    item.atkBonus = cost.nextAtk;
    item.hpBonus = cost.nextHp;
    item.durability = EKIPMAN_DAYANIKLILIK;   // yükseltme dayanıklılığı da tamamlar

    this.saveState();

    return {
      success: true,
      message: `✨ ${item.icon} ${item.name} Seviye ${item.level}'e yükseltildi! (+${item.atkBonus} Saldırı, +${item.hpBonus} Can, ${EKIPMAN_DAYANIKLILIK}/${EKIPMAN_DAYANIKLILIK} Dayanıklılık)`
    };
  },

  // 3. Teçhizat Onarım Maliyeti (Repair Cost)
  // Kural: Dayanıklılık sıfırlanınca üretim kaynaklarının %10'u (Odun+Demir+AMM DEX ASTRA). Kısmi hasarda oranlanır.
  calculateEquipmentRepairCost(itemOrSlot, soldierIndex = null) {
    let item = null;
    if (typeof itemOrSlot === 'object' && itemOrSlot !== null) {
      item = itemOrSlot;
    } else if (soldierIndex !== null && soldierIndex !== undefined && soldierIndex !== '') {
      const soldier = (this.state.soldierUnits || [])[soldierIndex];
      item = soldier?.equipment ? soldier.equipment[itemOrSlot] : null;
    } else {
      item = this.state.equipment ? this.state.equipment[itemOrSlot] : null;
    }
    if (!item) return { missingDurability: 0, ironCost: 0, woodCost: 0, fragCost: 0, adaCost: 0, isRepaired: true };

    const maxDur = item.maxDurability || EKIPMAN_DAYANIKLILIK;
    const curDur = item.durability != null ? item.durability : maxDur;
    const missing = Math.max(0, maxDur - curDur);
    if (missing <= 0) return { missingDurability: 0, ironCost: 0, woodCost: 0, fragCost: 0, adaCost: 0, isRepaired: true, item };

    const cum = this.getCumulativeEquipmentResourceCost(item);
    const damageRatio = missing / maxDur;
    // Sıfır dayanıklılıkta kümülatif kaynağın %10'u, kısmi hasarda oranlanır
    const woodCost = Math.max(1, Math.round(cum.totalWood * 0.10 * damageRatio));
    const ironCost = Math.max(1, Math.round(cum.totalIron * 0.10 * damageRatio));
    const adaCost = ammMarket.calculateResourcesAdAstraValue({ wood: woodCost, iron: ironCost }).totalAda;

    return {
      missingDurability: missing,
      ironCost,
      woodCost,
      fragCost: 0,
      adaCost,
      isRepaired: false,
      itemName: item.name,
      level: item.level || 1,
      item
    };
  },

  repairEquipment(itemOrSlot, soldierIndex = null) {
    const cost = this.calculateEquipmentRepairCost(itemOrSlot, soldierIndex);
    if (!cost || !cost.item) return { success: false, message: 'Onarılacak ekipman bulunamadı!' };
    const item = cost.item;
    const soldier = (soldierIndex !== null && soldierIndex !== undefined && soldierIndex !== '') ? (this.state.soldierUnits || [])[soldierIndex] : null;
    if (cost.missingDurability <= 0) {
      return { success: false, message: `${item.name} zaten tamamen sağlam (${EKIPMAN_DAYANIKLILIK}/${EKIPMAN_DAYANIKLILIK})!` };
    }

    const inv = this.state.inventory;
    if ((inv.iron || 0) < cost.ironCost) {
      return { success: false, message: `Yetersiz Demir! (${cost.ironCost} Demir gerekli)` };
    }
    if ((inv.wood || 0) < cost.woodCost) {
      return { success: false, message: `Yetersiz Odun! (${cost.woodCost} Odun gerekli)` };
    }
    if ((inv.fragments || 0) < cost.fragCost) {
      return { success: false, message: `Yetersiz Teçhizat Parçası! (${cost.fragCost} Teçhizat Parçaları gerekli)` };
    }
    if ((this.state.adAstraBalance || 0) < cost.adaCost) {
      return { success: false, message: `Yetersiz ASTRA! (${cost.adaCost} ASTRA gerekli)` };
    }

    inv.iron -= cost.ironCost;
    inv.wood -= cost.woodCost;
    this.burnResources({ wood: cost.woodCost, iron: cost.ironCost });
    if (cost.fragCost > 0) { inv.fragments = (inv.fragments || 0) - cost.fragCost; this.burnItem('fragments', cost.fragCost); }
    this.state.adAstraBalance -= cost.adaCost;
    this._onAdaSpent(cost.adaCost);
    globalPool.recordTokenSpend(cost.adaCost);

    const maxDur = item.maxDurability || EKIPMAN_DAYANIKLILIK;
    item.durability = maxDur;

    this.saveState();

    const ownerText = soldier ? `${soldier.name} üzerindeki ` : '';
    return {
      success: true,
      message: `🔨 ${ownerText}${item.name} başarıyla tamir edildi! (${maxDur}/${maxDur} Dayanıklılık)`
    };
  },

  repairEquipmentItem(soldierIndex, slot) {
    return this.repairEquipment(slot, soldierIndex);
  },

  // =========================================================================
  // 5.5. GENİŞLETİLMİŞ CEPHANELİK (ARMORY) VE BÜTÜNLEŞİK EŞYA YÖNETİMİ
  // =========================================================================

  // Krallıktaki tüm teçhizatları (Krallık Ana Yuvaları, Cephanelik Deposu, 18 Asker Üzerindekiler) tek bir listede toplar
  getAllArmoryEquipmentList() {
    const list = [];
    const slots = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
    const slotNames = { weapon: 'Silah', helmet: 'Miğfer', armor: 'Gövde Zırhı', legs: 'Pantolon', boots: 'Ayakkabı' };

    // 1. Krallık Ana Yuvalarındaki Eşyalar
    slots.forEach(slot => {
      const item = this.state.equipment ? this.state.equipment[slot] : null;
      if (item && item.level > 0) {
        list.push({
          source: 'kingdom',
          slotKey: slot,
          slotName: slotNames[slot] || slot,
          soldierIndex: null,
          soldierName: null,
          locationLabel: 'Krallık Ana Yuvası',
          item
        });
      }
    });

    // 2. Cephanelik Deposundaki Boşta Duran Eşyalar
    (this.state.armoryInventory || []).forEach((item, armoryIdx) => {
      if (item && item.level > 0) {
        list.push({
          source: 'armory',
          armoryIndex: armoryIdx,
          slotKey: item.slot,
          slotName: slotNames[item.slot] || item.slot,
          soldierIndex: null,
          soldierName: null,
          locationLabel: 'Cephanelik Deposu (Boşta)',
          item
        });
      }
    });

    // 3. Askerlerin Üzerindeki Eşyalar
    (this.state.soldierUnits || []).forEach((sol, sIdx) => {
      slots.forEach(slot => {
        const item = sol.equipment ? sol.equipment[slot] : null;
        if (item && item.level > 0) {
          list.push({
            source: 'soldier',
            slotKey: slot,
            slotName: slotNames[slot] || slot,
            soldierIndex: sIdx,
            soldierName: sol.name,
            locationLabel: `${sol.name} Üzerinde`,
            item
          });
        }
      });
    });

    return list;
  },

  // Herhangi bir yerdeki eşyayı (Krallık, Cephanelik veya Asker Üzerindeki) tek tıkla seviye atlatır
  upgradeAnyEquipment({ source, slotKey, armoryIndex = null, soldierIndex = null, itemId = null }) {
    let item = null;
    if (source === 'kingdom') {
      item = this.state.equipment ? this.state.equipment[slotKey] : null;
    } else if (source === 'armory') {
      if (armoryIndex !== null && armoryIndex !== undefined && this.state.armoryInventory) {
        item = this.state.armoryInventory[armoryIndex];
      }
    } else if (source === 'soldier') {
      const soldier = (this.state.soldierUnits || [])[soldierIndex];
      item = soldier?.equipment ? soldier.equipment[slotKey] : null;
    }

    if (!item && itemId) {
      // ID bazlı fallback arama
      const all = this.getAllArmoryEquipmentList();
      const match = all.find(e => e.item && e.item.id === itemId);
      if (match) item = match.item;
    }

    if (!item) return { success: false, message: 'Yükseltilecek ekipman bulunamadı!' };
    return this.upgradeEquipment(item);
  },

  // Cephanelikteki veya Krallıktaki eşyayı seçilen askere kuşandırır
  equipSoldierFromDepot(soldierIndex, { source, slotKey, armoryIndex }) {
    const soldier = (this.state.soldierUnits || [])[soldierIndex];
    if (!soldier) return { success: false, message: 'Asker bulunamadı.' };
    if (!soldier.equipment) soldier.equipment = {};

    let itemToEquip = null;

    if (source === 'armory' && this.state.armoryInventory) {
      if (armoryIndex >= 0 && armoryIndex < this.state.armoryInventory.length) {
        itemToEquip = this.state.armoryInventory.splice(armoryIndex, 1)[0];
      }
    } else if (source === 'kingdom' && this.state.equipment) {
      itemToEquip = this.state.equipment[slotKey];
      delete this.state.equipment[slotKey];
    }

    if (!itemToEquip) {
      return { success: false, message: 'Kuşanılacak eşya bulunamadı!' };
    }

    const targetSlot = itemToEquip.slot || slotKey;
    const oldItem = soldier.equipment[targetSlot];

    soldier.equipment[targetSlot] = itemToEquip;

    // Eskiden takılı olan eşyayı cephanelik deposuna güvenle aktar
    if (oldItem) {
      if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];
      this.state.armoryInventory.push(oldItem);
    }

    this.saveState();

    return {
      success: true,
      message: `🛡️ ${soldier.name} üzerine ${itemToEquip.name} kuşandırıldı!${oldItem ? ` (Eski ${oldItem.name} Cephaneliğe aktarıldı)` : ''}`
    };
  },

  // Askerin üzerindeki eşyayı Cephanelik Deposuna çıkarır
  unequipSoldierToArmory(soldierIndex, slotKey) {
    const soldier = (this.state.soldierUnits || [])[soldierIndex];
    if (!soldier || !soldier.equipment || !soldier.equipment[slotKey]) {
      return { success: false, message: 'Çıkarılacak ekipman yok.' };
    }

    const item = soldier.equipment[slotKey];
    soldier.equipment[slotKey] = null;

    if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];
    this.state.armoryInventory.push(item);

    this.saveState();

    return {
      success: true,
      message: `🔄 ${item.name} kuşanmadan çıkarıldı ve Cephanelik Deposu'na eklendi!`
    };
  },

  // ♻️ Düşük Kalite / Seviye 1 Fazlalık Boştaki Eşyaları Hurdaya Çevirip Parça Kazanma
  scrapAllLowTierEquipment(maxLevel = 1) {
    if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];
    let scrappedCount = 0;
    let gainedFragments = 0;
    let gainedIron = 0;
    const scrappedItems = [];

    const slotIcons = {
      weapon: '🗡️',
      helmet: '🪖',
      armor: '🛡️',
      legs: '👖',
      boots: '👢'
    };

    // Cephanelikteki boşta kalan eşyaları filtrele
    const remaining = [];
    for (const item of this.state.armoryInventory) {
      if (item && (item.level || 1) <= maxLevel) {
        scrappedCount++;
        const fragGained = Math.max(1, Math.floor((item.level || 1) * 2));
        const ironGained = Math.max(5, Math.floor((item.level || 1) * 10));
        gainedFragments += fragGained;
        gainedIron += ironGained;
        scrappedItems.push({
          name: item.name || `${item.slot || 'Eşya'}`,
          icon: item.icon || slotIcons[item.slot] || '⚔️',
          slot: item.slot || 'weapon',
          level: item.level || 1,
          fragGained,
          ironGained
        });
      } else if (item) {
        remaining.push(item);
      }
    }
    this.state.armoryInventory = remaining;

    // Krallık ana yuvasında boşta ve kullanılmayan Lv.1 eşyalar varsa onları da değerlendir
    const slots = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
    slots.forEach(slot => {
      const item = this.state.equipment ? this.state.equipment[slot] : null;
      if (item && (item.level || 1) <= maxLevel) {
        scrappedCount++;
        const fragGained = Math.max(1, Math.floor((item.level || 1) * 2));
        const ironGained = Math.max(5, Math.floor((item.level || 1) * 10));
        gainedFragments += fragGained;
        gainedIron += ironGained;
        scrappedItems.push({
          name: item.name || `${slot} Yuvası`,
          icon: item.icon || slotIcons[slot] || '⚔️',
          slot,
          level: item.level || 1,
          fragGained,
          ironGained
        });
        delete this.state.equipment[slot];
      }
    });

    if (scrappedCount === 0) {
      return {
        success: false,
        scrappedCount: 0,
        gainedFragments: 0,
        gainedIron: 0,
        scrappedItems: [],
        message: 'Hurdaya çevrilecek boşta Lv.1 veya düşük seviye eşya bulunamadı.'
      };
    }

    this.state.inventory.fragments = (this.state.inventory.fragments || 0) + gainedFragments;
    this.state.inventory.iron = (this.state.inventory.iron || 0) + gainedIron;

    this.saveState();

    return {
      success: true,
      scrappedCount,
      gainedFragments,
      gainedIron,
      scrappedItems,
      message: `♻️ ${scrappedCount} adet düşük seviye boşta eşya hurdaya ayrıldı! (+${gainedFragments} 💎 Teçhizat Parçaları, +${gainedIron} ⛏️ Demir)`
    };
  },

  // Krallıktaki, cephanelikteki ve askerlerdeki tüm hasarlı eşyaları tek seferde onarır
  // Krallıktaki, cephanelikteki ve askerlerdeki tüm hasarlı eşyaları tek seferde onarır
  repairAllEquipmentInKingdom() {
    const all = this.getAllArmoryEquipmentList();
    let totalIron = 0, totalWood = 0, totalAda = 0, repairedCount = 0;
    const toRepair = [];

    all.forEach(entry => {
      const cost = this.calculateEquipmentRepairCost(entry.item);
      if (cost && cost.missingDurability > 0) {
        totalIron += cost.ironCost;
        totalWood += cost.woodCost;
        totalAda += cost.adaCost;
        repairedCount++;
        toRepair.push({ item: entry.item, cost });
      }
    });

    if (repairedCount === 0) {
      return { success: false, message: `Tüm silah ve zırhlar zaten ${EKIPMAN_DAYANIKLILIK}/${EKIPMAN_DAYANIKLILIK} maksimum dayanıklılıkta!` };
    }

    const inv = this.state.inventory;
    if ((inv.iron || 0) < totalIron) return { success: false, message: `Yetersiz Demir! (${totalIron} Demir gerekli)` };
    if ((inv.wood || 0) < totalWood) return { success: false, message: `Yetersiz Odun! (${totalWood} Odun gerekli)` };
    if ((this.state.adAstraBalance || 0) < totalAda) return { success: false, message: `Yetersiz ASTRA! (${totalAda} ASTRA gerekli)` };

    inv.iron -= totalIron;
    inv.wood -= totalWood;
    this.burnResources({ wood: totalWood, iron: totalIron });
    this.state.adAstraBalance -= totalAda;
    this._onAdaSpent(totalAda);
    globalPool.recordTokenSpend(totalAda);

    toRepair.forEach(({ item }) => {
      item.durability = item.maxDurability || EKIPMAN_DAYANIKLILIK;
    });

    this.saveState();

    return {
      success: true,
      repairedCount,
      message: `🔨 Krallıktaki ${repairedCount} parça teçhizat tek seferde onarıldı! (-${totalWood} Odun, -${totalIron} Demir, -${totalAda} ASTRA)`
    };
  },

  // Özelleştirilmiş Geliştirme: Belirli kategori (silah, miğfer vb.) ve belirli seviyedeki eşyaları geliştirir
  // Örnek: "Sadece Seviye 2 Silahları Geliştir" veya "Sadece Seviye 1 Miğferleri Geliştir"
  upgradeEquipmentByTypeAndLevel(targetSlot = null, targetLevel = null) {
    const all = this.getAllArmoryEquipmentList();
    let upgradedCount = 0;
    let messages = [];

    for (const entry of all) {
      const item = entry.item;
      if (!item) continue;
      const matchSlot = !targetSlot || targetSlot === 'all' || item.slot === targetSlot;
      const matchLevel = targetLevel == null || item.level === targetLevel;
      if (matchSlot && matchLevel && (item.level || 1) < (GAME_CONFIG.EQUIPMENT_MAX_LEVEL || 10)) {
        const res = this.upgradeEquipment(item);
        if (res.success) {
          upgradedCount++;
        } else {
          messages.push(res.message);
          break; // Kaynak yetmediğinde dur
        }
      }
    }

    if (upgradedCount === 0 && messages.length > 0) {
      return { success: false, message: messages[0] };
    }
    if (upgradedCount === 0) {
      return { success: false, message: 'Geliştirilecek uygun teçhizat bulunamadı!' };
    }

    return {
      success: true,
      upgradedCount,
      message: `✨ ${upgradedCount} adet teçhizat başarıyla bir sonraki seviyeye yükseltildi!`
    };
  },

  // Tüm Cephanelikteki Geliştirilebilir Eşyaları Toplu Geliştir
  upgradeAllEquipmentInKingdom() {
    return this.upgradeEquipmentByTypeAndLevel('all', null);
  },
};
