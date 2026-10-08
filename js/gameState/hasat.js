// Realm of AdAstra — GameStateManager yöntemleri: Hasat, depolama, taşan kaynak satışı, sefer toplama, temel gelir
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { sound } from '../audio.js';
import { ammMarket } from '../ammMarket.js';
import { RES_KEYS } from './ortak.js';

export const hasatYontemleri = {
  // Belirli bir kaynak için dakika başına fix (sabit) üretim miktarı
  // Her seviyede fix kalır: Seviye arttıkça dakikalık üretim artmaz, sadece sefer süresi uzar.
  // v1.25: Taban üretim × seviye bonusu (her seviye +%1,5)
  getResourceRatePerMinute(nodeId, level = this.state.level) {
    const base = (GAME_CONFIG.BASE_PRODUCTION && GAME_CONFIG.BASE_PRODUCTION[nodeId]) || 15;
    // v2 (R5): köylü bonusu (+%1 / 10 köylü, en çok +%20) ve Şifa Bahçesi projesi (şifalı ot +%5)
    return base * this.getLevelProductionMultiplier(level) * (this.getVillageProductionMultiplier ? this.getVillageProductionMultiplier(nodeId) : 1);
  },

  getAccruedExpeditionHarvest(nodeId) {
    const exp = this.state.activeExpeditions[nodeId];
    if (!exp) return { accruedAmount: 0, totalYield: 0, pct: 0, remainingSeconds: 0, elapsedSeconds: 0, durationSeconds: 0, isCompleted: false };

    // Sefer başladığı andaki üretim hızı kullanılır (sefer sırasında seviye atlamak geçmişe dönük artırmaz)
    const ratePm = exp.ratePerMinute || this.getResourceRatePerMinute(nodeId);

    const speedMult = this.getExpeditionSpeedMultiplier();
    const durationMins = exp.durationMinutes || Math.round((exp.durationHours || 0.3) * 60) || Math.max(1, Math.round(exp.durationSeconds / 60));
    const durationHours = exp.durationHours || parseFloat((durationMins / 60).toFixed(2));
    const totalYield = Math.max(10, Math.floor(ratePm * durationMins * speedMult));
    const totalXp = Math.max(5, Math.floor(35 * durationHours));

    const progressRatio = Math.min(1, exp.elapsedSeconds / exp.durationSeconds);
    let alreadyClaimed = 0;
    if (exp.claimedAmount != null) {
      alreadyClaimed = exp.claimedAmount;
    } else if (exp.claimedSeconds) {
      alreadyClaimed = Math.floor(totalYield * Math.min(1, exp.claimedSeconds / exp.durationSeconds));
    }

    const earnedSoFar = Math.floor(totalYield * progressRatio);
    const accruedAmount = Math.max(0, earnedSoFar - alreadyClaimed);
    const accruedXp = exp.isCompleted ? totalXp : Math.max(1, Math.floor(totalXp * progressRatio));
    const pct = Math.min(100, Math.floor(progressRatio * 100));
    const remainingSeconds = Math.max(0, Math.ceil(exp.durationSeconds - exp.elapsedSeconds));

    return {
      accruedAmount,
      totalYield,
      alreadyClaimed,
      accruedXp,
      totalXp,
      pct,
      remainingSeconds,
      elapsedSeconds: exp.elapsedSeconds,
      durationSeconds: exp.durationSeconds,
      isCompleted: exp.isCompleted
    };
  },

  claimPartialExpedition(nodeId) {
    const exp = this.state.activeExpeditions[nodeId];
    if (!exp) return { success: false, message: 'Aktif sefer bulunamadı.' };

    const accruedInfo = this.getAccruedExpeditionHarvest(nodeId);
    if (accruedInfo.accruedAmount <= 0) {
      return { success: false, message: 'Henüz toplanabilir bir kaynak birikmedi (En az 1 adet birikmeli).' };
    }

    const nodeConfig = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId];
    const playerTool = this.state.tools[nodeConfig.requiredTool];

    // SİLO / DEPO DOLULUK VE TAŞMA KONTROLÜ (Erken Toplama)
    const cap = this.getWarehouseCapacity();
    const limit = cap[nodeId];
    const currentAmount = Number(this.state.inventory[nodeId]) || 0;
    const availableRoom = limit != null ? Math.max(0, limit - currentAmount) : accruedInfo.accruedAmount;
    const rLabel = (this.getResourceNameTr(nodeId) || nodeConfig.name).toLocaleLowerCase('tr-TR');

    // 1. Durum: Depoda HİÇ boş yer yok
    if (limit != null && availableRoom <= 0) {
      return {
        success: false,
        isWarehouseFull: true,
        nodeId,
        currentAmount,
        limit,
        remainingToClaim: accruedInfo.accruedAmount,
        message: `⚠️ Silo'nuz tamamen dolu (${currentAmount}/${limit})! Lütfen ${rLabel} seferini tamamlamak için silonuzu büyütün veya silonuzda yer açın.`
      };
    }

    // 2. Durum: Depoda yer var - boş yeri tam dolduracak kadarını al, kalanı seferde bırak
    // v2: erken toplama da Üretim Hakkı ile sınırlı (ortak kasa payı için 1/1,05)
    const hakP = this.getUretimHakki(nodeId);
    const wantP = Math.min(accruedInfo.accruedAmount, availableRoom);
    const amountToHarvest = Math.max(0, Math.min(wantP, Math.floor(hakP.canTake / (1 + Number(GAME_CONFIG.OTORITE?.COMMON_CHEST_RATE ?? 0.05)))));
    if (wantP > 0 && amountToHarvest <= 0) {
      return { success: false, isQuotaWait: true, nodeId, message: `⏳ Üretim Hakkın doldu (${Math.floor(hakP.used).toLocaleString('tr-TR')} / ${Math.floor(hakP.released).toLocaleString('tr-TR')}); biriken mahsul seferde izin bekliyor. Yeni hak ${this._fmtWait(hakP.nextReleaseAt - this._now())} sonra açılır.` };
    }
    const requested = globalPool.harvest(nodeId, amountToHarvest);
    this._takeKonseyShare(nodeId, requested);
    const { stored: harvestedAmount, overflow } = this.storeResource(nodeId, requested);
    if (playerTool) {
      playerTool.totalGathered = (playerTool.totalGathered || 0) + harvestedAmount;
    }

    const xpGained = Math.max(1, Math.floor((accruedInfo.accruedXp || 1) * (harvestedAmount / accruedInfo.accruedAmount)));
    const levelResult = this.addXp(xpGained);
    exp.claimedXp = (exp.claimedXp || 0) + xpGained;

    // Kısmi tahsilatı claimedAmount'a ekle
    exp.claimedAmount = (exp.claimedAmount || accruedInfo.alreadyClaimed || 0) + harvestedAmount;
    if (accruedInfo.totalYield > 0) {
      exp.claimedSeconds = Math.min(exp.durationSeconds, Math.floor((exp.claimedAmount / accruedInfo.totalYield) * exp.durationSeconds));
    } else {
      exp.claimedSeconds = exp.elapsedSeconds;
    }

    sound.playHarvest();
    this.saveState();

    const stillWaiting = Math.max(0, accruedInfo.accruedAmount - harvestedAmount);

    return {
      success: true,
      amount: harvestedAmount,
      overflow,
      xpGained,
      levelResult,
      isPartialSiloFill: stillWaiting > 0,
      stillRemaining: stillWaiting,
      message: stillWaiting > 0
        ? `📥 Silodaki boş alan kadar +${harvestedAmount} ${nodeConfig.name} erken toplandı ve ambar doldu (${this.state.inventory[nodeId]}/${limit})! Kalan ${stillWaiting} adet mahsul seferde bekletiliyor.`
        : `⚡ ${harvestedAmount} ${nodeConfig.name} erken toplandı! (+${xpGained} XP)`
    };
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════
  // DEPO KAPASİTESİ — HARD CAP KORUMASI & TAŞMA ENGELLEME
  // ═══════════════════════════════════════════════════════════════════════
  // v1.25: Son çare koruması. Normal oyunda silo artık taşmaz: hasat siloya sığmayanı seferde bekletir,
  // pazar alımı kapasiteyle sınırlıdır, ödüller storeResourceOrSell ile sığmayanı pazarda satar.
  // Buraya yalnızca test menüsü gibi doğrudan eklemeler düşer; fazla kısım kesilir ve eskisi gibi
  // sessizce değil, oyuncuya bildirilerek kesilir.
  enforceWarehouseLimits() {
    if (!this.state || !this.state.inventory) return;
    const cap = this.getWarehouseCapacity();
    for (const res of RES_KEYS()) {
      const limit = cap[res];
      if (limit != null && typeof limit === 'number' && limit > 0) {
        const cur = Number(this.state.inventory[res]) || 0;
        if (cur > limit) {
          const excess = cur - limit;
          this.state.inventory[res] = limit;
          if (!this._isFastForwarding) {
            const name = this.getResourceNameTr ? this.getResourceNameTr(res) : res;
            this.pushNotice(`⚠️ Silo dolu: ${Math.floor(excess).toLocaleString('tr-TR')} ${name} siloya sığmadı. Siloyu yükselterek kapasiteyi artırabilirsin.`, 'error');
          }
        }
      }
    }
  },

  // Taşan malzemeyi pazarda sat; taban fiyat yüzünden satılamayan kısım bildirilir
  _sellOverflow(resourceKey, qty, reason = 'Silo dolu') {
    const amount = Math.floor(Number(qty) || 0);
    if (amount <= 0) return { soldQty: 0, adaGained: 0, lostQty: 0 };
    let soldQty = 0, adaGained = 0;
    if (typeof ammMarket !== 'undefined' && ammMarket && ammMarket.executeSell) {
      const maxSell = ammMarket.getMaxSellBeforeFloor ? ammMarket.getMaxSellBeforeFloor(resourceKey) : amount;
      const sellQty = Math.min(amount, Math.max(0, Math.floor(maxSell)));
      if (sellQty > 0) {
        const r = ammMarket.executeSell(resourceKey, sellQty);
        if (r && r.success) {
          soldQty = sellQty;
          adaGained = Number(r.adAstraReceived) || 0;
          this.state.adAstraBalance = (this.state.adAstraBalance || 0) + adaGained;
          this._onAdaEarned(adaGained, { saleOf: resourceKey });
        }
      }
    }
    const lostQty = amount - soldQty;
    const name = this.getResourceNameTr ? this.getResourceNameTr(resourceKey) : resourceKey;
    if (!this._isFastForwarding) {
      if (soldQty > 0) this.pushNotice(`📦 ${reason}: siloya sığmayan ${soldQty.toLocaleString('tr-TR')} ${name} pazarda satıldı (+${adaGained.toFixed(1)} ASTRA).`, 'info');
      if (lostQty > 0) this.pushNotice(`⚠️ ${reason}: ${lostQty.toLocaleString('tr-TR')} ${name} siloya sığmadı ve pazar taban fiyatta olduğu için satılamadı.`, 'error');
    }
    return { soldQty, adaGained, lostQty };
  },

  // Ödül/teslimat girişi: siloya sığan kısmı depola, sığmayanı pazarda sat
  storeResourceOrSell(resourceKey, amount, reason = 'Silo dolu') {
    const qty = Number(amount) || 0;
    if (qty <= 0) return { stored: 0, soldQty: 0, adaGained: 0, lostQty: 0 };
    const { stored, overflow } = this.storeResource(resourceKey, qty);
    const sold = overflow > 0 ? this._sellOverflow(resourceKey, overflow, reason) : { soldQty: 0, adaGained: 0, lostQty: 0 };
    return { stored, ...sold };
  },

  storeResource(resourceKey, amount) {
    if (!(amount > 0)) return { stored: 0, overflow: 0 };
    const cap = this.getWarehouseCapacity();
    const limit = cap[resourceKey];
    const current = Math.min(limit != null ? limit : Infinity, Number(this.state.inventory[resourceKey]) || 0);

    if (limit == null) {
      this.state.inventory[resourceKey] = current + amount;
      return { stored: amount, overflow: 0 };
    }

    const room = Math.max(0, limit - current);
    const stored = Math.min(amount, room);
    const overflow = amount - stored;
    this.state.inventory[resourceKey] = Math.min(limit, current + stored);
    return { stored, overflow };
  },

  claimExpedition(nodeId) {
    const exp = this.state.activeExpeditions[nodeId];
    if (!exp || !exp.isCompleted) {
      return { success: false, message: 'Henüz toplanacak bir sefer tamamlanmadı.' };
    }

    const nodeConfig = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId];
    const toolConfig = GAME_CONFIG.TOOLS[nodeConfig.requiredTool];
    const playerTool = this.state.tools[nodeConfig.requiredTool];

    // Matematiksel Sefer Verimi (Dakika Başı Fix Üretim * Dakika * Hız Çarpanı)
    // Sefer başladığı andaki üretim hızı kullanılır (sefer sırasında seviye atlamak geçmişe dönük artırmaz)
    const ratePm = exp.ratePerMinute || this.getResourceRatePerMinute(nodeId);
    const speedMult = this.getExpeditionSpeedMultiplier();
    const durationMinutes = exp.durationMinutes || Math.round((exp.durationHours || 0.3) * 60) || Math.max(1, Math.round(exp.durationSeconds / 60));
    const totalYield = Math.floor(ratePm * durationMinutes * speedMult);

    // Erken veya kısmi toplanan miktarı düş
    const alreadyClaimed = exp.claimedAmount != null
      ? exp.claimedAmount
      : Math.floor(totalYield * Math.min(1, (exp.claimedSeconds || 0) / exp.durationSeconds));
    const remainingToClaim = Math.max(0, totalYield - alreadyClaimed);

    if (remainingToClaim <= 0) {
      delete this.state.activeExpeditions[nodeId];
      this.saveState();
      return { success: true, message: 'Tüm mahsul zaten toplandı.' };
    }

    // SİLO / DEPO DOLULUK VE TAŞMA KONTROLÜ
    const cap = this.getWarehouseCapacity();
    const limit = cap[nodeId];
    let currentAmount = Number(this.state.inventory[nodeId]) || 0;
    let availableRoom = limit != null ? Math.max(0, limit - currentAmount) : remainingToClaim;
    const rLabel = (this.getResourceNameTr(nodeId) || nodeId).toLocaleLowerCase('tr-TR');

    // 🤖 Otomasyon Botu Aktifse:
    let botSurplusSold = 0;
    let botSurplusAdaEarned = 0;
    // Yalnızca bot var mı diye bakılır; isAutoCollectorActive() önkoşul alım-satımını da tetiklediği için
    // hasattan önce pazardan gereksiz alım yapıyordu.
    const isBotActive = this.hasPurchasedBot();
    if (isBotActive) {
      const spaceRes = this.handleBotSiloSpace(nodeId, remainingToClaim);
      if (spaceRes && (spaceRes.action === 'sold' || spaceRes.action === 'sold_for_ada' || spaceRes.action === 'upgraded')) {
        botSurplusSold = spaceRes.amountSold || (spaceRes.action === 'upgraded' ? 1 : 0);
        botSurplusAdaEarned = spaceRes.adAstraReceived || 0;
      }
      currentAmount = Number(this.state.inventory[nodeId]) || 0;
      const updatedCap = this.getWarehouseCapacity();
      const updatedLimit = updatedCap[nodeId];
      availableRoom = updatedLimit != null ? Math.max(0, updatedLimit - currentAmount) : remainingToClaim;
    }

    // 1. Durum: Depoda HİÇ boş yer yok (0 yer var) VE bot artanı satamadıysa / manuel kullanıcıysa:
    if (limit != null && availableRoom <= 0 && botSurplusSold <= 0) {
      exp.isCompleted = true;
      exp.stillRemaining = remainingToClaim;
      this.saveState();
      return {
        success: false,
        isWarehouseFull: true,
        nodeId,
        currentAmount,
        limit,
        remainingToClaim,
        stillRemaining: remainingToClaim,
        message: `⚠️ Silo'nuz tamamen dolu (${currentAmount}/${limit})! Kalan ${remainingToClaim} ${rLabel} seferde bekletiliyor. Depoda yer açıldığında veya silonuz büyüdüğünde toplanacaktır.`
      };
    }

    // 2. Durum: Depoda yer var veya bot artanı markette sattı!
    // v2: Üretim Hakkı — kişisel haftalık pay gün gün açılır; hak dolunca mahsul seferde bekler (izin bekliyor).
    // Ortak kasa payı (%5) hakkın içinden ayrıca çıkarılır: hakkın 1/1,05'i siloya girer.
    const hak = this.getUretimHakki(nodeId);
    const chestRate = Number(GAME_CONFIG.OTORITE?.COMMON_CHEST_RATE ?? 0.05);
    const wantAmount = Math.min(remainingToClaim, availableRoom);
    const harvestAmount = Math.max(0, Math.min(wantAmount, Math.floor(hak.canTake / (1 + chestRate))));
    const quotaWait = Math.max(0, wantAmount - harvestAmount);
    if (wantAmount > 0 && harvestAmount <= 0) {
      exp.isCompleted = true;
      exp.stillRemaining = remainingToClaim;
      this.saveState();
      return {
        success: false,
        isQuotaWait: true,
        nodeId,
        remainingToClaim,
        stillRemaining: remainingToClaim,
        hak,
        message: `⏳ Üretim Hakkın doldu: bu hafta ${nodeConfig.name} için ${Math.floor(hak.used).toLocaleString('tr-TR')} / ${Math.floor(hak.released).toLocaleString('tr-TR')} birim çıkardın. Kalan ${remainingToClaim} ${rLabel} seferde izin bekliyor; yeni hak ${this._fmtWait(hak.nextReleaseAt - this._now())} sonra açılır.`
      };
    }
    let harvestedAmount = 0;
    let konseyShare = 0;
    if (harvestAmount > 0) {
      const fromPool = globalPool.harvest(nodeId, harvestAmount);
      const storedRes = this.storeResource(nodeId, fromPool);
      harvestedAmount = storedRes.stored;
      konseyShare = this._takeKonseyShare(nodeId, fromPool);
    }

    const totalClaimedThisStep = harvestedAmount;
    exp.claimedAmount = (exp.claimedAmount || alreadyClaimed) + totalClaimedThisStep;
    exp.claimedSeconds = exp.durationSeconds;

    if (playerTool) {
      playerTool.totalGathered = (playerTool.totalGathered || 0) + totalClaimedThisStep;
    }

    const stillRemaining = Math.max(0, totalYield - exp.claimedAmount);

    // ✨ Deneyim (XP) Hesabı: Sefer süresine göre tam XP (Karakter Seviyesi ve Level Up için)
    const durationHours = exp.durationHours || parseFloat((durationMinutes / 60).toFixed(2)) || 0.3;
    const totalExpXp = Math.max(5, Math.floor(35 * durationHours));
    const prevClaimedXp = exp.claimedXp || 0;
    let xpGained = 0;

    // Eğer seferden kalan miktar tamamen bittiyse (0 kaldıysa): Seferi bitir ve temizle!
    if (stillRemaining <= 0) {
      playerTool.durability = Math.max(0, (playerTool.durability != null ? playerTool.durability : 4320) - durationMinutes);

      xpGained = Math.max(0, totalExpXp - prevClaimedXp);
      if (xpGained > 0) {
        this.addXp(xpGained);
        exp.claimedXp = prevClaimedXp + xpGained;
      }

      delete this.state.activeExpeditions[nodeId];

      if (playerTool.durability === 0) sound.playBreakWarning();
      else sound.playHarvest();

      // 🤖 KURAL 2 (Adım 4 A Seçeneği 2. Bölüm): Her sefer bitiminde tetikle ve olabiliyorsa yap!
      if (isBotActive && this.state.botSiloAutoUpgrade) {
        this.tryAutoUpgradeWarehouseWithAdaFinancing();
      }

      this.saveState();

      let msg = `🌾 ${harvestedAmount} ${nodeConfig.name} başarıyla toplandı ve ambarınıza eklendi! (+${xpGained} XP)`;
      if (konseyShare > 0) msg += ` 🏛️ Ortak kasaya ${konseyShare} ${nodeConfig.name} (%5).`;
      if (botSurplusSold > 0) {
        msg = `🤖 Ambar doldu: ${harvestedAmount} ${nodeConfig.name} depolandı (%100 silo). Fazla gelen ${botSurplusSold} ${nodeConfig.name} AMM'de satıldı (+${botSurplusAdaEarned.toFixed(1)} ASTRA, +${xpGained} XP). Sefer tamamlandı!`;
      }

      return {
        success: true,
        isPartialSiloFill: false,
        amount: totalClaimedThisStep,
        harvestedAmount,
        xpGained,
        totalExpXp,
        resourceName: nodeConfig.name,
        botSurplusSold,
        botSurplusAdaEarned,
        konseyShare,
        stillRemaining: 0,
        message: msg
      };
    } else {
      // Depo doldu, kalan miktar seferde bekliyor!
      // Siloya aktarılan miktar oranında XP'yi hesaba işle
      if (harvestedAmount > 0 && totalYield > 0) {
        const targetXp = Math.floor(totalExpXp * Math.min(1, exp.claimedAmount / totalYield));
        xpGained = Math.max(0, targetXp - prevClaimedXp);
        if (xpGained > 0) {
          this.addXp(xpGained);
          exp.claimedXp = prevClaimedXp + xpGained;
        }
      }

      sound.playHarvest();
      this.saveState();
      const quotaMsg = quotaWait > 0 ? `⏳ Üretim Hakkı: +${harvestedAmount} ${nodeConfig.name} toplandı (+${xpGained} XP); hakkın doldu (${Math.floor(hak.used).toLocaleString('tr-TR')} / ${Math.floor(hak.released).toLocaleString('tr-TR')}). Kalan ${stillRemaining} ${rLabel} seferde izin bekliyor; yeni hak ${this._fmtWait(hak.nextReleaseAt - this._now())} sonra açılır.` : null;

      return {
        success: true,
        isPartialSiloFill: true,
        amount: harvestedAmount,
        harvestedAmount,
        xpGained,
        totalExpXp,
        resourceName: nodeConfig.name,
        stillRemaining,
        currentAmount: this.state.inventory[nodeId],
        limit,
        message: `📥 Silodaki boş alan kadar +${harvestedAmount} ${nodeConfig.name} depoya aktarıldı ve ambarınız doldu (${this.state.inventory[nodeId]}/${limit})! (+${xpGained} XP) Kalan ${stillRemaining} ${nodeConfig.name} seferde bekletiliyor. Depoda yer açtığınızda veya silonuzu büyüttüğünüzde kalan mahsulü de toplayabilirsiniz.`,
        ...(quotaWait > 0 ? { isQuotaWait: true, message: quotaMsg } : {}),
        konseyShare
      };
    }
  },

  // ✨ 60+ YAŞ ÖZEL: TEK TIKLA TÜM KASABADAN MAHSUL & VERGİ TOPLA (SWEEP HARVEST)
  claimAllHarvests() {
    const nodes = RES_KEYS();
    let totalHarvested = 0;
    let totalXp = 0;
    const collectedDetails = [];

    for (const nodeId of nodes) {
      const exp = this.state.activeExpeditions[nodeId];
      if (exp) {
        if (exp.isCompleted) {
          const res = this.claimExpedition(nodeId);
          if (res && res.success) {
            totalHarvested += (res.amount || 0);
            totalXp += (res.xpGained || 0);
            collectedDetails.push(`${res.amount} ${res.resourceName || nodeId}`);
          }
        } else {
          const res = this.claimPartialExpedition(nodeId);
          if (res && res.success) {
            totalHarvested += (res.amount || 0);
            totalXp += (res.xpGained || 0);
            const nodeConfig = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId];
            collectedDetails.push(`${res.amount} ${nodeConfig ? nodeConfig.name : nodeId}`);
          }
        }
      }
    }

    if (totalHarvested > 0) {
      sound.playLevelUp();
      this.saveState();
      return {
        success: true,
        totalHarvested,
        totalXp,
        message: `✨ Bütün Kasabadan Mahsuller Toplandı: +${collectedDetails.join(', ')} (+${totalXp} XP)`
      };
    }

    return {
      success: false,
      message: 'Toplanacak hazır bir mahsul veya biriken kaynak bulunamadı. Önce tarlalara ve madenlere işçi gönderin!'
    };
  },

  sweepCompletedExpeditions() {
    const nodes = RES_KEYS();
    let totalHarvested = 0;
    let totalXp = 0;
    const collectedDetails = [];

    for (const nodeId of nodes) {
      const exp = this.state.activeExpeditions[nodeId];
      if (exp && exp.isCompleted) {
        const res = this.claimExpedition(nodeId);
        if (res && res.success) {
          totalHarvested += (res.amount || 0);
          totalXp += (res.xpGained || 0);
          const nodeConfig = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId];
          collectedDetails.push(`+${res.amount} ${nodeConfig ? nodeConfig.name : nodeId}`);
        }
      }
    }

    if (totalHarvested > 0) {
      sound.playLevelUp();
      this.saveState();
      return {
        success: true,
        totalHarvested,
        totalXp,
        message: `⚡ Biten Seferler Başarıyla Toplandı: ${collectedDetails.join(', ')} (+${totalXp} XP)`
      };
    }

    return {
      success: false,
      message: 'Şu an tamamlanmış bir sefer bulunmuyor.'
    };
  },

  // 🏛️ HAFTALIK EVRENSEL TEMEL GELİR (UBI) TALEP ETME METODU
  claimWeeklyUbi() {
    const res = globalPool.claimWeeklyUbi(
      this.state.level || 1,
      this.state.adAstraBalance || 0,
      this.state.lastClaimedUbiEpoch || 0
    );
    if (res.success) {
      this.state.lastClaimedUbiEpoch = res.epochId;
      this.state.adAstraBalance = (this.state.adAstraBalance || 0) + res.amount;
      this._onAdaEarned(res.amount);
      this.state.totalUbiEarned = (this.state.totalUbiEarned || 0) + res.amount;
      sound.playLevelUp();
      this.saveState();
    }
    return res;
  },
};
