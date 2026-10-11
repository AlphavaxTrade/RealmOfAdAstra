// Realm of AdAstra — GameStateManager yöntemleri: ordu (asker satın alma, isim, set bonusu, iyileşme, kuşanma)
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { cleanName, round3 } from './ortak.js';

const YUVALAR = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
const SET_ESIKLERI = [5, 4, 2];   // kaç parça takılıysa hangi set bonusu (en yüksek eşik önce)
const BUGDAY_YEDEK = 0.30;        // pasif iyileşmede 1 HP için buğday
const ASTRA_YEDEK = 0.10;         // pasif iyileşmede 1 HP için ASTRA
const TAM_IYILESME_SN = 86400;    // pasif iyileşme: tam can 24 saat

// Kırılmamış (dayanıklılığı bitmemiş) eşya mı
const calisiyorMu = esya => !!esya && (esya.durability === undefined || esya.durability > 0);
const yarali = s => (s.hp != null ? s.hp : (s.maxHp || 100)) < (s.maxHp || 100);

export const orduYontemleri = {
  // Asker maliyeti: ilk asker taban fiyat, 18. asker hedef fiyat, aradakiler üstel eğri
  getSoldierCost(sira = (this.state.soldierUnits || []).length + 1) {
    const n = Math.max(1, sira);
    const taban = GAME_CONFIG.SOLDIER_COST_BASE || 5000;
    if (n === 1) return this.adaPrice(taban);
    if (n === 18 && GAME_CONFIG.SOLDIER_18_TARGET_COST) return this.adaPrice(GAME_CONFIG.SOLDIER_18_TARGET_COST);
    const us = GAME_CONFIG.SOLDIER_COST_EXPONENT != null ? GAME_CONFIG.SOLDIER_COST_EXPONENT : 2.0364522367650437;
    return this.adaPrice(round3(taban * Math.pow(n, us)));
  },

  buySoldierUnit() {
    if (!Array.isArray(this.state.soldierUnits)) this.state.soldierUnits = [];
    const asker = this.state.soldierUnits;

    const enFazla = GAME_CONFIG.MAX_SOLDIERS ?? Infinity;
    if (enFazla !== Infinity && asker.length >= enFazla) {
      return { success: false, message: `Maksimum ${enFazla} askere zaten sahipsin!` };
    }
    // Her asker bir köylü ister
    if (this.getVillageInfo) {
      const koy = this.getVillageInfo();
      if (asker.length + 1 > koy.soldierCap) {
        return { success: false, message: `🏘️ Yeni asker için köylü gerekir: ${koy.villagers} köylü ile en çok ${koy.soldierCap} asker. Köy Evleri yap, köylüler çoğalsın.` };
      }
    }

    const sira = asker.length + 1;
    const bedel = this.getSoldierCost(sira);
    if ((this.state.adAstraBalance || 0) < bedel) {
      return { success: false, message: `Yetersiz ASTRA! ${sira}. asker için ${bedel.toLocaleString()} ASTRA gerekir.` };
    }
    this.state.adAstraBalance -= bedel;
    this._onAdaSpent(bedel);
    globalPool.recordTokenSpend(bedel);   // yakım / UBI / telif / hazine olarak dağılır

    const yeni = this.createSoldierUnit(sira);
    asker.push(yeni);
    this.saveState();
    return {
      success: true,
      message: `⚔️ ${yeni.icon} ${yeni.name} (${yeni.className}) orduya katıldı! (-${bedel.toLocaleString()} ASTRA)`,
      soldier: yeni,
      cost: bedel
    };
  },

  renameSoldierUnit(soldierIndex, newName) {
    if (!Array.isArray(this.state.soldierUnits)) return { success: false, message: 'Ordu bulunamadı.' };
    const asker = this.state.soldierUnits[soldierIndex];
    if (!asker) return { success: false, message: 'Asker bulunamadı.' };

    if (String(newName || '').trim().length > 24) return { success: false, message: 'Asker ismi en fazla 24 karakter olabilir.' };
    const temiz = cleanName(newName, 24);
    if (!temiz) return { success: false, message: 'Asker ismi boş bırakılamaz (yalnız harf, rakam ve basit işaretler).' };

    const eskiAd = asker.name;
    asker.name = temiz;
    this.saveState();
    return { success: true, message: `⚔️ Asker ismi "${temiz}" olarak güncellendi!`, oldName: eskiAd, newName: temiz };
  },

  // Set bonusu yalnız askerin kendi üstündeki (kırılmamış) eşyalardan sayılır; depodaki eşya sayılmaz.
  getSoldierSetBonus(soldierIndex) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    if (!asker) return null;
    const donanim = asker.equipment || {};
    const adet = YUVALAR.filter(y => calisiyorMu(donanim[y])).length;
    const bonuslar = GAME_CONFIG.EQUIPMENT_SET_BONUSES;
    for (const esik of SET_ESIKLERI) {
      if (adet >= esik && bonuslar && bonuslar[esik]) return { count: adet, ...bonuslar[esik] };
    }
    return null;
  },

  getSoldierFullStats(soldierIndex) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    if (!asker) return null;

    let bonusAtk = 0;
    let bonusHp = 0;
    const donanim = asker.equipment || {};
    for (const y of YUVALAR) {
      const esya = donanim[y];
      if (!calisiyorMu(esya)) continue;
      bonusAtk += (esya.atkBonus || 0);
      bonusHp += (esya.hpBonus || 0);
    }

    const set = this.getSoldierSetBonus(soldierIndex);
    const atkCarpani = set ? set.atkMultiplier : 1.0;
    const hpCarpani = set ? set.hpMultiplier : 1.0;
    const taban = asker.baseAtk || 20;
    const tabanHp = asker.maxHp || 100;

    return {
      totalAtk: Math.round((taban + bonusAtk) * atkCarpani),
      totalMaxHp: Math.round((tabanHp + bonusHp) * hpCarpani),
      bonusAtk,
      bonusHp,
      setBonus: set
    };
  },

  // ── İyileşme ───────────────────────────────────────────────────────────
  // Bir askerin iyileşme bilgisi (HP, kalan süre, gereken buğday / ASTRA); arayüz buna dayanır.
  // Pasif: 24 saatte tam can, 1 HP = 0,30 buğday + 0,10 ASTRA. Hızlı: 10 kat (1 HP = 3 buğday + 1 ASTRA).
  getSoldierHealInfo(soldierIndex) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    if (!asker) return null;

    const pasif = GAME_CONFIG.SOLDIER_PASSIVE_HEAL || {};
    const hizli = GAME_CONFIG.SOLDIER_FAST_HEAL || {};
    const maxHp = asker.maxHp || 100;
    const hp = Math.min(maxHp, Math.max(0, asker.hp != null ? asker.hp : maxHp));
    const eksik = Math.max(0, maxHp - hp);
    const carpan = this.getAdaPriceMultiplier();

    const pasifBugday = pasif.wheatPerHp != null ? pasif.wheatPerHp : BUGDAY_YEDEK;
    const pasifAstra = (pasif.adaPerHp != null ? pasif.adaPerHp : ASTRA_YEDEK) * carpan;
    const hizliBugday = hizli.wheatPerHp != null ? hizli.wheatPerHp : 3.0;
    const hizliAstra = (hizli.adAstraPerHp != null ? hizli.adAstraPerHp : 1.0) * carpan;
    const gerekenBugday = Math.round(eksik * hizliBugday * 100) / 100;
    const gerekenAstra = Math.round(eksik * hizliAstra * 100) / 100;

    const tamIyilesmeSn = pasif.FULL_HEAL_SECONDS || TAM_IYILESME_SN;
    const stokBugday = Math.floor(this.state.inventory?.wheat || 0);
    const bakiye = Number(this.state.adAstraBalance) || 0;   // ASTRA tam sayıya yuvarlanmaz
    const duraklatildi = eksik > 0 && (stokBugday < pasifBugday || bakiye < pasifAstra);

    return {
      hp: Math.floor(hp),
      maxHp,
      missingHp: Math.ceil(eksik),
      hpPct: Math.floor((hp / maxHp) * 100),
      isFull: eksik <= 0,
      isPaused: duraklatildi,
      pauseMessage: duraklatildi ? 'Hesabınızda yeteri kadar ASTRA veya Buğday yok! Askerlerin iyileşmesi durduruldu.' : null,
      passiveWheatRate: pasifBugday,
      passiveAdaRate: pasifAstra,
      passiveWheatNeeded: Math.round(eksik * pasifBugday * 100) / 100,
      passiveAdaCost: Math.round(eksik * pasifAstra * 100) / 100,
      fastWheatRate: hizliBugday,
      fastAdaRate: hizliAstra,
      wheatNeeded: gerekenBugday,
      wheatCost: gerekenBugday,
      adaCost: gerekenAstra,
      adAstraCost: gerekenAstra,
      secondsRemaining: eksik > 0 ? Math.ceil((eksik / maxHp) * tamIyilesmeSn) : 0,
      wheatInStock: stokBugday,
      adaInBalance: bakiye
    };
  },

  // Yaralı asker var ama buğday ya da ASTRA yetmediği için iyileşme duruyor mu?
  isArmyPassiveHealBlocked() {
    if (!(this.state.soldierUnits || []).some(yarali)) return false;
    const bugday = this.state.inventory?.wheat || 0;
    const astra = this.state.adAstraBalance || 0;
    return bugday <= 0 || astra <= 0 || bugday < BUGDAY_YEDEK || astra < ASTRA_YEDEK;
  },

  // Pasif iyileşme: her asker zamanla dolar; harcanan buğday yakılır, ASTRA hazineye dağıtılır.
  // Buğday ya da ASTRA yetmiyorsa süreç durur.
  processSoldierPassiveHealing(deltaSeconds) {
    if (!deltaSeconds || deltaSeconds <= 0) return { wheatRanOut: false, isPaused: false };

    const cfg = GAME_CONFIG.SOLDIER_PASSIVE_HEAL || {};
    const tamIyilesmeSn = cfg.FULL_HEAL_SECONDS || TAM_IYILESME_SN;
    const bugdayHp = cfg.wheatPerHp != null ? cfg.wheatPerHp : BUGDAY_YEDEK;
    const astraHp = cfg.adaPerHp != null ? cfg.adaPerHp : ASTRA_YEDEK;
    const asker = this.state.soldierUnits || [];

    if ((this.state.inventory?.wheat || 0) <= 0 || (this.state.adAstraBalance || 0) <= 0) {
      const yaraliVar = asker.some(yarali);
      if (yaraliVar) {
        this.state.isPassiveHealPaused = true;
        this.state.passiveHealPauseReason = 'insufficient_resources';
      }
      return { wheatRanOut: true, adaRanOut: true, isPaused: yaraliVar };
    }

    let degisti = false;
    let yaraliVar = false;
    let harcananAstra = 0;

    for (const s of asker) {
      const maxHp = s.maxHp || 100;
      const mevcutHp = s.hp != null ? s.hp : maxHp;
      if (mevcutHp >= maxHp) continue;
      yaraliVar = true;

      const kazanilan = Math.min(maxHp - mevcutHp, (maxHp / tamIyilesmeSn) * deltaSeconds);
      const bugdayBedeli = kazanilan * bugdayHp;
      const astraBedeli = kazanilan * astraHp;
      const bugday = this.state.inventory?.wheat || 0;
      const bakiye = this.state.adAstraBalance || 0;

      if (bugdayBedeli > bugday || astraBedeli > bakiye) {
        this.state.isPassiveHealPaused = true;
        this.state.passiveHealPauseReason = 'insufficient_resources';
        continue;
      }
      if (!(kazanilan > 0)) continue;

      this.state.inventory.wheat = Math.max(0, Math.round((bugday - bugdayBedeli) * 100) / 100);
      this.burnResource('wheat', bugdayBedeli);
      // 0,001 ASTRA/HP: kuruşa yuvarlamak bedeli siliyordu, bu yüzden 6 ondalık
      this.state.adAstraBalance = Math.max(0, Math.round((bakiye - astraBedeli) * 1e6) / 1e6);
      this._onAdaSpent(bakiye - this.state.adAstraBalance);
      harcananAstra += bakiye - this.state.adAstraBalance;
      s.hp = Math.min(maxHp, Math.round((mevcutHp + kazanilan) * 100) / 100);
      degisti = true;
    }

    if (yaraliVar && !this.isArmyPassiveHealBlocked()) this.state.isPassiveHealPaused = false;

    // İyileşmede harcanan ASTRA her harcama gibi dağıtılır; küçük tutarlar birikir (her karede yazmamak için)
    if (harcananAstra > 0) {
      const toplam = (Number(this.state.passiveHealAdaPending) || 0) + harcananAstra;
      if (toplam >= 0.01) {
        globalPool.recordTokenSpend(toplam);
        this.state.passiveHealAdaPending = 0;
      } else {
        this.state.passiveHealAdaPending = toplam;
      }
    }

    if (degisti) this.requestSave();
    const engelli = this.isArmyPassiveHealBlocked();
    return { wheatRanOut: engelli, isPaused: engelli };
  },

  // Anında doyur ve iyileştir: kalan buğday ihtiyacı + hızlı iyileştirme bedeli (ASTRA) harcanıp can doldurulur
  instantHealSoldierUnit(soldierIndex) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    if (!asker) return { success: false, message: 'Asker bulunamadı!' };

    const bilgi = this.getSoldierHealInfo(soldierIndex);
    if (!bilgi || bilgi.isFull) return { success: false, message: `${asker.name} zaten tam can!` };

    const envanter = this.state.inventory;
    if ((envanter.wheat || 0) < bilgi.wheatNeeded) {
      return { success: false, message: `⚠️ Yetersiz Buğday! (${bilgi.wheatNeeded} 🌾 gerekli, Depoda: ${bilgi.wheatInStock})` };
    }
    if ((this.state.adAstraBalance || 0) < bilgi.adaCost) {
      return { success: false, message: `⚠️ Yetersiz ASTRA! (${bilgi.adaCost} 🟣 ASTRA gerekli)` };
    }

    envanter.wheat -= bilgi.wheatNeeded;
    this.burnResource('wheat', bilgi.wheatNeeded);
    this.state.adAstraBalance -= bilgi.adaCost;
    this._onAdaSpent(bilgi.adaCost);
    asker.hp = asker.maxHp || 100;
    if (bilgi.adaCost > 0) globalPool.recordTokenSpend(bilgi.adaCost);

    this.saveState();
    const yakimYuzde = Math.round((GAME_CONFIG.TOKEN_BURN_RATE ?? 0.05) * 100);
    return {
      success: true,
      message: `⚡ ${asker.name} anında tam cana kavuştu! (-${bilgi.wheatNeeded} 🌾 Buğday, -${bilgi.adaCost} 🟣 ASTRA • 🔥 %${yakimYuzde} Yakıldı)`
    };
  },

  healSoldierInstantly(soldierIndex) {
    return this.instantHealSoldierUnit(soldierIndex);
  },

  // ── Kuşanma ────────────────────────────────────────────────────────────
  // Krallık donanımındaki (Demirci'de dövülmüş) eşyayı askere takar; eski eşya krallık yuvasına döner
  equipSoldierSlot(soldierIndex, slotKey) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    if (!asker) return { success: false, message: 'Asker bulunamadı.' };

    const esya = this.state.equipment ? this.state.equipment[slotKey] : null;
    if (!esya) {
      return { success: false, message: `Demirci'de dövülmüş boş bir ${slotKey} bulunamadı! Önce Demirci'de eşya dövmelisin.` };
    }

    if (!asker.equipment) asker.equipment = {};
    const eskiEsya = asker.equipment[slotKey];
    asker.equipment[slotKey] = { ...esya };
    delete this.state.equipment[slotKey];
    if (eskiEsya) this.state.equipment[slotKey] = eskiEsya;

    this.saveState();
    return { success: true, message: `🛡️ ${asker.name} üzerine ${esya.name} başarıyla kuşandırıldı!` };
  },

  // Askerden çıkarılan eşya boş krallık yuvasına, doluysa depoya (armoryInventory) gider
  unequipSoldierSlot(soldierIndex, slotKey) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    if (!asker || !asker.equipment || !asker.equipment[slotKey]) {
      return { success: false, message: 'Çıkarılacak ekipman yok.' };
    }

    const esya = asker.equipment[slotKey];
    asker.equipment[slotKey] = null;

    if (!this.state.equipment) this.state.equipment = {};
    if (!this.state.equipment[slotKey]) {
      this.state.equipment[slotKey] = esya;
    } else {
      if (!Array.isArray(this.state.armoryInventory)) this.state.armoryInventory = [];
      this.state.armoryInventory.push(esya);
    }

    this.saveState();
    return { success: true, message: `🛡️ ${esya.name} kuşanmadan çıkarıldı ve depoya aktarıldı!` };
  }
};
