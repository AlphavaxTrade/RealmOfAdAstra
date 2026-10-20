// Realm of AdAstra — GameStateManager yöntemleri: ordu (asker satın alma, isim, set bonusu, iyileşme, kuşanma)
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { cleanName, round3 } from './ortak.js';
import { askerHakki, katOf } from '../economy/ordu-hakki.js';

const YUVALAR = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
const SET_ESIKLERI = [5, 4, 2];   // kaç parça takılıysa hangi set bonusu (en yüksek eşik önce)
const OT_YEDEK = 5;               // pasif iyileşmede ekrandaki 1 can için şifalı ot (yedek; asıl değer config SOLDIER_PASSIVE_HEAL.herbPerHp = 0,1 x HAMMADDE_ADEDI_CARPANI)
const ASTRA_YEDEK = 0.002;        // pasif iyileşmede ekrandaki 1 can için ASTRA
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

  // Zindan asker hakkı: { hak, kat, mod, acik } (acik: kural devrede mi). Yalnız YENİ alımı sınırlar; var olan asker silinmez.
  getAskerHakki() {
    const ilerleme = this.state.dungeonProgress || 1;
    const mod = this.state.dungeonMode || 0;
    const sinir = GAME_CONFIG.ORDU_SINIRI || {};
    return { hak: askerHakki({ ilerleme, mod }), kat: katOf(ilerleme), mod, acik: !!sinir.ASKER_HAKKI_ZINDAN_KATINA_BAGLI };
  },

  buySoldierUnit() {
    if (!Array.isArray(this.state.soldierUnits)) this.state.soldierUnits = [];
    const asker = this.state.soldierUnits;

    const enFazla = GAME_CONFIG.MAX_SOLDIERS ?? Infinity;
    if (enFazla !== Infinity && asker.length >= enFazla) {
      return { success: false, message: `Maksimum ${enFazla} askere zaten sahipsin!` };
    }
    // Zindan ilerlemesine bağlı asker hakkı (config ORDU_SINIRI, js/economy/ordu-hakki.js): hak = geçilen kat + 1 (Normal mod 2-7)
    const sinir = GAME_CONFIG.ORDU_SINIRI || {};
    if (sinir.ASKER_HAKKI_ZINDAN_KATINA_BAGLI) {
      const { hak, kat } = this.getAskerHakki();
      if (asker.length + 1 > hak) {
        return { success: false, message: `⚔️ Asker hakkın dolu: ${hak} asker taşıyabilirsin (zindanda ${kat}. kattasın, hak = kat + 1). Zindanda bir kat ilerleyince yeni hak açılır; o zamana kadar askerlerini seviyelendir ve teçhizatla güçlendir.` };
      }
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
    this._orduHarcamasiYaz(bedel);        // Fatih Ödülü için orduya harcanan toplam
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

  // ── Savaş canı (18 Ekim 2026) ──────────────────────────────────────────
  // Askerin kayıtlı canı (asker.hp) TABAN azami cana göre tutulur (iyileşme, Şifahane ve Kışla böyle gösterir); savaşta ise azami can
  // teçhizat ve set çarpanıyla büyür (totalMaxHp). Eskiden savaş kayıtlı canı olduğu gibi alıyordu: tam sağlıklı, 100/100 bir asker
  // 313 azami canlı bir çubukta 100'le başlıyor (ve teçhizatın can bonusu hiç işe yaramıyordu). Artık oran korunur: tam sağlıklı asker
  // teçhizatlı toplam canla başlar, yarım sağlıklı asker yarısıyla; savaştan sonra oran tabana geri çevrilir.
  getSoldierBattleStart(soldierIndex) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    const f = asker ? this.getSoldierFullStats(soldierIndex) : null;
    if (!f) return { hp: 100, maxHp: 100 };
    const taban = asker.maxHp || 100;
    const oran = Math.min(1, Math.max(0, (asker.hp != null ? asker.hp : taban) / taban));
    return { hp: Math.max(1, Math.round(f.totalMaxHp * oran)), maxHp: f.totalMaxHp };
  },

  // Savaş sonu canını (toplam ölçek) kayıtlı tabana çevirip yazar. Asker kalıcı ölmez; ama zindanda canı biterse (dusebilir: true) can 0'da kalır,
  // "düşmüş" sayılır ve iyileştirilmeden savaşa katılamaz (20 Ekim 2026: eskiden en az 1 can yazılıyor, asker ertesi savaşa %1 canla girip
  // yetenekleriyle kendini toparlıyordu). Kolezyum düellosu eskisi gibi en az 1 canla bırakır.
  setSoldierHpFromBattle(soldierIndex, savasCani, { dusebilir = false } = {}) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    const f = asker ? this.getSoldierFullStats(soldierIndex) : null;
    if (!f) return;
    this.isSoldierFallen(soldierIndex);   // tam iyileşmiş askerin eski düşüş bayrağı burada temizlenir (Kolezyum sonrası yanlış "düştü" kalmasın)
    const taban = asker.maxHp || 100;
    if (dusebilir && !((Number(savasCani) || 0) > 0)) { asker.hp = 0; asker.dusmus = true; return; }
    asker.hp = Math.min(taban, Math.max(1, Math.round((Number(savasCani) || 0) / f.totalMaxHp * taban)));
  },

  // Düşmüş asker (zindanda canı sıfırlanmış): TAM iyileşene kadar zindan savaşına giremez. Pasif iyileşme canı hemen artırmaya başladığı için
  // yalnız "can > 0" ölçütü bir saniyede geçersiz olurdu; bu yüzden düşüş bayrağı (asker.dusmus) tam cana kadar kalır, tam canda kendiliğinden kalkar.
  isSoldierFallen(soldierIndex) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    if (!asker) return false;
    if (asker.hp != null && !(asker.hp > 0)) return true;   // can sıfır (bayraksız eski kayıt dahil)
    if (!asker.dusmus) return false;
    const taban = asker.maxHp || 100;
    if ((asker.hp != null ? asker.hp : taban) >= taban - 1e-6) { asker.dusmus = false; return false; }   // tam iyileşti: bayrak kalkar
    return true;
  },

  // ── İyileşme ───────────────────────────────────────────────────────────
  // Bir askerin iyileşme bilgisi (HP, kalan süre, bedeller); arayüz buna dayanır.
  // Pasif (kendiliğinden): 24 saatte tam can; bedel EKRANDA GÖRÜNEN can üzerinden, şifalı otla (SOLDIER_PASSIVE_HEAL.herbPerHp ot + adaPerHp
  // ASTRA, her can için). Hemen iyileştirme (getHerbHealInfo, koyVeKonsey.js) aynı ölçekte ama beş kat pahalı: bekleyen az öder.
  // Kayıtlı can (asker.hp) TABAN ölçektedir; ekranda görünen savaş ölçeği getSoldierBattleStart'tadır.
  getSoldierHealInfo(soldierIndex) {
    const asker = (this.state.soldierUnits || [])[soldierIndex];
    if (!asker) return null;

    const pasif = GAME_CONFIG.SOLDIER_PASSIVE_HEAL || {};
    const maxHp = asker.maxHp || 100;
    const hp = Math.min(maxHp, Math.max(0, asker.hp != null ? asker.hp : maxHp));
    const eksik = Math.max(0, maxHp - hp);
    const carpan = this.getAdaPriceMultiplier();
    const savas = this.getSoldierBattleStart(soldierIndex);
    const eksikSavas = eksik > 0 ? Math.max(1, savas.maxHp - savas.hp) : 0;

    const pasifOt = pasif.herbPerHp != null ? pasif.herbPerHp : OT_YEDEK;
    const pasifAstra = (pasif.adaPerHp != null ? pasif.adaPerHp : ASTRA_YEDEK) * carpan;

    const tamIyilesmeSn = pasif.FULL_HEAL_SECONDS || TAM_IYILESME_SN;
    const stokOt = Number(this.state.inventory?.herb) || 0;
    const bakiye = Number(this.state.adAstraBalance) || 0;   // ASTRA tam sayıya yuvarlanmaz
    const duraklatildi = eksik > 0 && (stokOt < pasifOt || bakiye < pasifAstra);

    return {
      hp: Math.floor(hp),
      maxHp,
      missingHp: Math.ceil(eksik),
      hpPct: Math.floor((hp / maxHp) * 100),
      isFull: eksik <= 0,
      isPaused: duraklatildi,
      pauseMessage: duraklatildi ? 'Hesabınızda yeteri kadar şifalı ot veya ASTRA yok! Askerlerin kendiliğinden iyileşmesi durduruldu.' : null,
      passiveHerbRate: pasifOt,
      passiveAdaRate: pasifAstra,
      passiveHerbNeeded: Math.round(eksikSavas * pasifOt * 100) / 100,
      passiveAdaCost: Math.round(eksikSavas * pasifAstra * 1000) / 1000,
      secondsRemaining: eksik > 0 ? Math.ceil((eksik / maxHp) * tamIyilesmeSn) : 0,
      herbInStock: Math.floor(stokOt),
      adaInBalance: bakiye
    };
  },

  // Yaralı asker var ama şifalı ot ya da ASTRA yetmediği için iyileşme duruyor mu?
  isArmyPassiveHealBlocked() {
    if (!(this.state.soldierUnits || []).some(yarali)) return false;
    const pasif = GAME_CONFIG.SOLDIER_PASSIVE_HEAL || {};
    const ot = Number(this.state.inventory?.herb) || 0;
    const astra = Number(this.state.adAstraBalance) || 0;
    return ot < (pasif.herbPerHp ?? OT_YEDEK) || astra < (pasif.adaPerHp ?? ASTRA_YEDEK);
  },

  // Pasif iyileşme: her asker zamanla dolar; harcanan şifalı ot yakılır, ASTRA hazineye dağıtılır. Bedel ekrandaki can başınadır
  // (1 can = herbPerHp ot + adaPerHp ASTRA). Ot ya da ASTRA yarıda biterse eldekinin yettiği kadar iyileşilir, sonra süreç durur.
  processSoldierPassiveHealing(deltaSeconds) {
    if (!deltaSeconds || deltaSeconds <= 0) return { herbRanOut: false, isPaused: false };

    const cfg = GAME_CONFIG.SOLDIER_PASSIVE_HEAL || {};
    const tamIyilesmeSn = cfg.FULL_HEAL_SECONDS || TAM_IYILESME_SN;
    const otHp = cfg.herbPerHp != null ? cfg.herbPerHp : OT_YEDEK;
    const astraHp = (cfg.adaPerHp != null ? cfg.adaPerHp : ASTRA_YEDEK) * this.getAdaPriceMultiplier();
    const asker = this.state.soldierUnits || [];
    if (!asker.some(yarali)) return { herbRanOut: false, isPaused: false };

    let degisti = false;
    let harcananAstra = 0;

    asker.forEach((s, i) => {
      const maxHp = s.maxHp || 100;
      const mevcutHp = s.hp != null ? s.hp : maxHp;
      if (mevcutHp >= maxHp) return;

      const kazanilan = Math.min(maxHp - mevcutHp, (maxHp / tamIyilesmeSn) * deltaSeconds);   // taban ölçek
      const olcek = this.getSoldierBattleStart(i).maxHp / maxHp;                              // taban → ekrandaki can
      const ekranKazanc = kazanilan * olcek;
      const ot = Number(this.state.inventory?.herb) || 0;
      const bakiye = Number(this.state.adAstraBalance) || 0;
      const yeterOran = Math.min(1, otHp > 0 ? ot / (ekranKazanc * otHp) : 1, astraHp > 0 ? bakiye / (ekranKazanc * astraHp) : 1);
      if (!(yeterOran > 0) || !(kazanilan > 0)) { this.state.isPassiveHealPaused = true; this.state.passiveHealPauseReason = 'insufficient_resources'; return; }

      const gercek = kazanilan * yeterOran;
      const otBedeli = gercek * olcek * otHp;
      const astraBedeli = gercek * olcek * astraHp;
      // Çok küçük adımlarda yuvarlama canı sabit bırakıp bedeli yine kesiyordu (hayalet yakım): can, ot ve ASTRA aynı hassasiyette (1e-6)
      this.state.inventory.herb = Math.max(0, Math.round((ot - otBedeli) * 1e6) / 1e6);
      this.burnResource('herb', otBedeli);
      this.state.adAstraBalance = Math.max(0, Math.round((bakiye - astraBedeli) * 1e6) / 1e6);
      this._onAdaSpent(bakiye - this.state.adAstraBalance);
      harcananAstra += bakiye - this.state.adAstraBalance;
      s.hp = Math.min(maxHp, Math.round((mevcutHp + gercek) * 1e6) / 1e6);
      degisti = true;
    });

    if (!this.isArmyPassiveHealBlocked()) this.state.isPassiveHealPaused = false;

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
    return { herbRanOut: engelli, isPaused: engelli };
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
