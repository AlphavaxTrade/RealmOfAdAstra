// Realm of AdAstra — GameStateManager yöntemleri: Asker satın alma, isim, set bonusu, iyileşme, kuşanma
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { sound } from '../audio.js';
import { cleanName, round3 } from './ortak.js';

export const orduYontemleri = {
  // Asker satın alma maliyeti: İlk asker 5.000 ASTRA, 18. asker 1.800.000 ASTRA kademeli artan model
  getSoldierCost(index = (this.state.soldierUnits || []).length + 1) {
    const n = Math.max(1, index);
    const base = GAME_CONFIG.SOLDIER_COST_BASE || 5000;
    if (n === 1) {
      return this.adaPrice(base);
    }
    if (n === 18 && GAME_CONFIG.SOLDIER_18_TARGET_COST) {
      return this.adaPrice(GAME_CONFIG.SOLDIER_18_TARGET_COST);
    }
    const exponent = (GAME_CONFIG.SOLDIER_COST_EXPONENT != null) ? GAME_CONFIG.SOLDIER_COST_EXPONENT : 2.0364522367650437;
    const rawCost = base * Math.pow(n, exponent);
    return this.adaPrice(round3(rawCost));
  },

  buySoldierUnit() {
    if (!Array.isArray(this.state.soldierUnits)) {
      this.state.soldierUnits = [];
    }
    const maxSoldiers = GAME_CONFIG.MAX_SOLDIERS ?? Infinity;
    if (maxSoldiers !== Infinity && this.state.soldierUnits.length >= maxSoldiers) {
      return { success: false, message: `Maksimum ${maxSoldiers} askere zaten sahipsin!` };
    }
    // v2 (R5): her asker bir köylü ister
    if (this.getVillageInfo) {
      const vi = this.getVillageInfo();
      if (this.state.soldierUnits.length + 1 > vi.soldierCap) {
        return { success: false, message: `🏘️ Yeni asker için köylü gerekir: ${vi.villagers} köylü ile en çok ${vi.soldierCap} asker. Köy Evleri yap, köylüler çoğalsın.` };
      }
    }
    const newIdx = this.state.soldierUnits.length + 1;
    const cost = this.getSoldierCost(newIdx);
    if ((this.state.adAstraBalance || 0) < cost) {
      return { success: false, message: `Yetersiz ASTRA! ${newIdx}. asker için ${cost.toLocaleString()} ASTRA gerekir.` };
    }
    this.state.adAstraBalance -= cost;
    this._onAdaSpent(cost);
    // v1'de bu satır YOKTU: 18 askerlik 324.000 ASTRA'lık harcama ne yakılıyor
    // ne hazineye giriyordu — muhasebe dışı bir delikti (F-06).
    globalPool.recordTokenSpend(cost);

    const newUnit = this.createSoldierUnit(newIdx);
    this.state.soldierUnits.push(newUnit);
    this.saveState();
    sound.playLevelUp();
    return {
      success: true,
      message: `⚔️ ${newUnit.icon} ${newUnit.name} (${newUnit.className}) orduya katıldı! (-${cost.toLocaleString()} ASTRA)`,
      soldier: newUnit,
      cost
    };
  },

  renameSoldierUnit(soldierIndex, newName) {
    if (!Array.isArray(this.state.soldierUnits)) return { success: false, message: 'Ordu bulunamadı.' };
    const soldier = this.state.soldierUnits[soldierIndex];
    if (!soldier) return { success: false, message: 'Asker bulunamadı.' };

    if (String(newName || '').trim().length > 24) return { success: false, message: 'Asker ismi en fazla 24 karakter olabilir.' };
    const safe = cleanName(newName, 24);
    if (!safe) return { success: false, message: 'Asker ismi boş bırakılamaz (yalnız harf, rakam ve basit işaretler).' };

    const oldName = soldier.name;
    soldier.name = safe;
    this.saveState();
    return {
      success: true,
      message: `⚔️ Asker ismi "${safe}" olarak güncellendi!`,
      oldName,
      newName: safe
    };
  },

  getSoldierSetBonus(soldierIndex) {
    const soldier = (this.state.soldierUnits || [])[soldierIndex];
    if (!soldier) return null;
    const eq = soldier.equipment || {};
    // v1.25: Yalnızca askerin kendi üstündeki eşyalar sayılır. Eski sürüm, askerin boş yuvası için
    // depodaki eşyayı da sayıyordu; depodaki tek eşya bütün askerlere aynı anda güç veriyordu.
    const count = ['weapon', 'helmet', 'armor', 'legs', 'boots'].filter(slot => {
      const item = eq[slot];
      return item && (item.durability === undefined || item.durability > 0);
    }).length;

    if (count >= 5 && GAME_CONFIG.EQUIPMENT_SET_BONUSES && GAME_CONFIG.EQUIPMENT_SET_BONUSES[5]) return { count, ...GAME_CONFIG.EQUIPMENT_SET_BONUSES[5] };
    if (count >= 4 && GAME_CONFIG.EQUIPMENT_SET_BONUSES && GAME_CONFIG.EQUIPMENT_SET_BONUSES[4]) return { count, ...GAME_CONFIG.EQUIPMENT_SET_BONUSES[4] };
    if (count >= 2 && GAME_CONFIG.EQUIPMENT_SET_BONUSES && GAME_CONFIG.EQUIPMENT_SET_BONUSES[2]) return { count, ...GAME_CONFIG.EQUIPMENT_SET_BONUSES[2] };
    return null;
  },

  getSoldierFullStats(soldierIndex) {
    const soldier = (this.state.soldierUnits || [])[soldierIndex];
    if (!soldier) return null;

    let bonusAtk = 0;
    let bonusHp = 0;
    const eq = soldier.equipment || {};

    ['weapon', 'helmet', 'armor', 'legs', 'boots'].forEach(slot => {
      const item = eq[slot];
      if (item && (item.durability === undefined || item.durability > 0)) {
        bonusAtk += (item.atkBonus || 0);
        bonusHp += (item.hpBonus || 0);
      }
    });

    const setBonus = this.getSoldierSetBonus(soldierIndex);
    const atkMult = setBonus ? setBonus.atkMultiplier : 1.0;
    const hpMult = setBonus ? setBonus.hpMultiplier : 1.0;

    const baseAtk = soldier.baseAtk || 20;
    const baseHp = soldier.maxHp || 100;

    return {
      totalAtk: Math.round((baseAtk + bonusAtk) * atkMult),
      totalMaxHp: Math.round((baseHp + bonusHp) * hpMult),
      bonusAtk,
      bonusHp,
      setBonus
    };
  },

  // =========================================================================
  // 🌾 18 KİŞİLİK ORDU: OTOMATİK BUĞDAY İLE PASİF İYİLEŞME DÖNGÜSÜ
  // =========================================================================

  // Belirli bir askerin anlık iyileşme bilgisini (HP, kalan süre, gereken buğday/ada) hesaplar. UI bu metoda dayanır.
  getSoldierHealInfo(soldierIndex) {
    const soldier = (this.state.soldierUnits || [])[soldierIndex];
    if (!soldier) return null;

    const passiveCfg = GAME_CONFIG.SOLDIER_PASSIVE_HEAL || {};
    const fastCfg = GAME_CONFIG.SOLDIER_FAST_HEAL || {};
    const maxHp = soldier.maxHp || 100;
    const hp = Math.min(maxHp, Math.max(0, soldier.hp != null ? soldier.hp : maxHp));
    const missingHp = Math.max(0, maxHp - hp);

    // 24 Saatlik Otomatik Pasif İyileşme Oranları (1 HP = 0.30 Buğday + 0.10 ASTRA)
    const passiveWheatRate = passiveCfg.wheatPerHp != null ? passiveCfg.wheatPerHp : 0.30;
    const passiveAdaRate = (passiveCfg.adaPerHp != null ? passiveCfg.adaPerHp : 0.10) * this.getAdaPriceMultiplier();
    const passiveWheatNeeded = Math.round(missingHp * passiveWheatRate * 100) / 100;
    const passiveAdaCost = Math.round(missingHp * passiveAdaRate * 100) / 100;

    // Hızlı Doldurma Oranları (24 Saatlik Formülün 10 Katı: 1 HP = 3 Buğday + 1 ASTRA)
    const fastWheatRate = fastCfg.wheatPerHp != null ? fastCfg.wheatPerHp : 3.0;
    const fastAdaRate = (fastCfg.adAstraPerHp != null ? fastCfg.adAstraPerHp : 1.0) * this.getAdaPriceMultiplier();
    const wheatNeeded = Math.round(missingHp * fastWheatRate * 100) / 100;
    const adaCost = Math.round(missingHp * fastAdaRate * 100) / 100;

    const fullHealSec = passiveCfg.FULL_HEAL_SECONDS || 86400; // 24 Saat
    const secondsRemaining = missingHp > 0 ? Math.ceil((missingHp / maxHp) * fullHealSec) : 0;
    const wheatInStock = Math.floor(this.state.inventory?.wheat || 0);
    const adaInBalance = Number(this.state.adAstraBalance) || 0;   // v2: ASTRA tam sayıya yuvarlanmaz (0,5 ASTRA geçerli bakiye)
    const isPaused = missingHp > 0 && (wheatInStock < passiveWheatRate || adaInBalance < passiveAdaRate);

    return {
      hp: Math.floor(hp),
      maxHp,
      missingHp: Math.ceil(missingHp),
      hpPct: Math.floor((hp / maxHp) * 100),
      isFull: missingHp <= 0,
      isPaused,
      pauseMessage: isPaused ? 'Hesabınızda yeteri kadar ASTRA veya Buğday yok! Askerlerin iyileşmesi durduruldu.' : null,
      // 24 Saatlik Otomatik Pasif İyileşme
      passiveWheatRate,
      passiveAdaRate,
      passiveWheatNeeded,
      passiveAdaCost,
      // Hızlı Doyurma (10x)
      fastWheatRate,
      fastAdaRate,
      wheatNeeded,
      wheatCost: wheatNeeded,
      adaCost,
      adAstraCost: adaCost,
      secondsRemaining,
      wheatInStock,
      adaInBalance
    };
  },

  // Orduda iyileşmesi gereken ancak kaynak yetersizliğinden durdurulan asker var mı?
  isArmyPassiveHealBlocked() {
    const units = this.state.soldierUnits || [];
    const hasWounded = units.some(s => (s.hp != null ? s.hp : (s.maxHp || 100)) < (s.maxHp || 100));
    if (!hasWounded) return false;

    const wheat = this.state.inventory?.wheat || 0;
    const ada = this.state.adAstraBalance || 0;
    return wheat <= 0 || ada <= 0 || wheat < 0.30 || ada < 0.10;
  },

  // 24 Saatlik Otomatik Pasif Asker İyileşmesi:
  // Her 1 HP için: 24 saat boyunca toplam 0.30 Buğday + 0.10 ASTRA tüketerek kendi kendine yavaş yavaş dolar.
  // Kural: Hesapta yeteri kadar buğday VEYA ASTRA yoksa süreç tamamen durdurulur!
  processSoldierPassiveHealing(deltaSeconds) {
    if (!deltaSeconds || deltaSeconds <= 0) return { wheatRanOut: false, isPaused: false };

    const cfg = GAME_CONFIG.SOLDIER_PASSIVE_HEAL || {};
    const fullHealSec = cfg.FULL_HEAL_SECONDS || 86400; // 24 Saat
    const wheatPerHp = cfg.wheatPerHp != null ? cfg.wheatPerHp : 0.30;
    const adaPerHp = cfg.adaPerHp != null ? cfg.adaPerHp : 0.10;

    const units = this.state.soldierUnits || [];
    let changed = false;
    let anyWounded = false;
    let healAdaSpent = 0;

    const availableWheat = this.state.inventory?.wheat || 0;
    const availableAda = this.state.adAstraBalance || 0;

    // Temel kural: Bakiye veya buğday yetersizse iyileşme süreci derhal durdurulur!
    if (availableWheat <= 0 || availableAda <= 0) {
      const hasWounded = units.some(s => (s.hp != null ? s.hp : (s.maxHp || 100)) < (s.maxHp || 100));
      if (hasWounded) {
        this.state.isPassiveHealPaused = true;
        this.state.passiveHealPauseReason = 'insufficient_resources';
      }
      return { wheatRanOut: true, adaRanOut: true, isPaused: hasWounded };
    }

    units.forEach(soldier => {
      const maxHp = soldier.maxHp || 100;
      const currentHp = soldier.hp != null ? soldier.hp : maxHp;
      if (currentHp >= maxHp) return;
      anyWounded = true;

      const missingHp = maxHp - currentHp;
      const hpPerSecond = maxHp / fullHealSec;
      const hpGain = Math.min(missingHp, hpPerSecond * deltaSeconds);
      const wheatCost = hpGain * wheatPerHp;
      const adaCost = hpGain * adaPerHp;

      const curW = this.state.inventory?.wheat || 0;
      const curA = this.state.adAstraBalance || 0;

      // Hesapta yeteri kadar buğday ve adastra yoksa hp doldurma süreci durdurulsun
      if (wheatCost > curW || adaCost > curA) {
        this.state.isPassiveHealPaused = true;
        this.state.passiveHealPauseReason = 'insufficient_resources';
        return;
      }

      if (hpGain > 0) {
        this.state.inventory.wheat = Math.max(0, Math.round((curW - wheatCost) * 100) / 100);
        this.burnResource('wheat', wheatCost);
        this.state.adAstraBalance = Math.max(0, Math.round((curA - adaCost) * 1e6) / 1e6);   // v2: 0,001 ASTRA/HP — kuruşa yuvarlamak bedeli siliyordu
        this._onAdaSpent(curA - this.state.adAstraBalance);
        healAdaSpent += curA - this.state.adAstraBalance;
        soldier.hp = Math.min(maxHp, Math.round((currentHp + hpGain) * 100) / 100);
        changed = true;
      }
    });

    if (anyWounded && !this.isArmyPassiveHealBlocked()) {
      this.state.isPassiveHealPaused = false;
    }

    // Denetim (6 Ekim 2026): iyileşmede harcanan ASTRA eskiden hiçbir kasaya yazılmıyordu (kayboluyordu).
    // Artık her harcama gibi dağıtılır. Küçük tutarlar birikir, 1 ASTRA'yı geçince deftere işlenir (her karede yazmamak için).
    if (healAdaSpent > 0) {
      const due = (Number(this.state.passiveHealAdaPending) || 0) + healAdaSpent;
      if (due >= 0.01) {   // v2 ölçeği: 0,01 ASTRA biriktikçe deftere (eski eşik 1 ASTRA idi)
        globalPool.recordTokenSpend(due);
        this.state.passiveHealAdaPending = 0;
      } else {
        this.state.passiveHealAdaPending = due;
      }
    }

    if (changed) this.requestSave();
    return { 
      wheatRanOut: this.isArmyPassiveHealBlocked(),
      isPaused: this.isArmyPassiveHealBlocked()
    };
  },

  // '⚡ ANINDA DOYUR & İYİLEŞTİR': Kalan Buğday ihtiyacını + hızlı iyileştirme bedelini (ASTRA) anında harcayıp HP'yi MaxHP'ye tamamlar.
  instantHealSoldierUnit(soldierIndex) {
    const soldier = (this.state.soldierUnits || [])[soldierIndex];
    if (!soldier) return { success: false, message: 'Asker bulunamadı!' };

    const info = this.getSoldierHealInfo(soldierIndex);
    if (!info || info.isFull) {
      return { success: false, message: `${soldier.name} zaten tam can!` };
    }

    const inv = this.state.inventory;
    if ((inv.wheat || 0) < info.wheatNeeded) {
      return { success: false, message: `⚠️ Yetersiz Buğday! (${info.wheatNeeded} 🌾 gerekli, Depoda: ${info.wheatInStock})` };
    }
    if ((this.state.adAstraBalance || 0) < info.adaCost) {
      return { success: false, message: `⚠️ Yetersiz ASTRA! (${info.adaCost} 🟣 ASTRA gerekli)` };
    }

    inv.wheat -= info.wheatNeeded;
    this.burnResource('wheat', info.wheatNeeded);
    this.state.adAstraBalance -= info.adaCost;
    this._onAdaSpent(info.adaCost);
    soldier.hp = soldier.maxHp || 100;

    // 🔥 Hazine Muhasebesi ve Deflasyonist Yakım Entegrasyonu
    // Hızlı doyurulan askerin harcanan ASTRA bedeli: bir kısmı kalıcı yakılır, çoğu hazine havuzlarına aktarılır (bkz. recordTokenSpend)
    if (info.adaCost > 0) {
      globalPool.recordTokenSpend(info.adaCost);
    }

    sound.playRepair();
    this.saveState();

    return {
      success: true,
      message: `⚡ ${soldier.name} anında tam cana kavuştu! (-${info.wheatNeeded} 🌾 Buğday, -${info.adaCost} 🟣 ASTRA • 🔥 %${Math.round((GAME_CONFIG.TOKEN_BURN_RATE ?? 0.05) * 100)} Yakıldı)`
    };
  },

  healSoldierInstantly(soldierIndex) {
    return this.instantHealSoldierUnit(soldierIndex);
  },

  equipSoldierSlot(soldierIndex, slotKey) {
    const soldier = (this.state.soldierUnits || [])[soldierIndex];
    if (!soldier) return { success: false, message: 'Asker bulunamadı.' };

    const playerEquip = this.state.equipment ? this.state.equipment[slotKey] : null;
    if (!playerEquip) {
      return { success: false, message: `Demirci'de dövülmüş boş bir ${slotKey} bulunamadı! Önce Demirci'de eşya dövmelisin.` };
    }

    if (!soldier.equipment) soldier.equipment = {};
    const oldItem = soldier.equipment[slotKey];

    soldier.equipment[slotKey] = { ...playerEquip };
    delete this.state.equipment[slotKey];

    if (oldItem) {
      this.state.equipment[slotKey] = oldItem;
    }

    sound.playRepair();
    this.saveState();
    return { success: true, message: `🛡️ ${soldier.name} üzerine ${playerEquip.name} başarıyla kuşandırıldı!` };
  },

  unequipSoldierSlot(soldierIndex, slotKey) {
    const soldier = (this.state.soldierUnits || [])[soldierIndex];
    if (!soldier || !soldier.equipment || !soldier.equipment[slotKey]) {
      return { success: false, message: 'Çıkarılacak ekipman yok.' };
    }

    const item = soldier.equipment[slotKey];
    soldier.equipment[slotKey] = null;

    if (!this.state.equipment) this.state.equipment = {};
    if (!this.state.equipment[slotKey]) {
      this.state.equipment[slotKey] = item;
    } else {
      if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];
      this.state.armoryInventory.push(item);
    }

    sound.playRepair();
    this.saveState();
    return { success: true, message: `🛡️ ${item.name} kuşanmadan çıkarıldı ve depoya aktarıldı!` };
  },
};
