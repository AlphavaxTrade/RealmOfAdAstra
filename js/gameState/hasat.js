// Realm of AdAstra — GameStateManager yöntemleri: üretim hızı, sefer hasadı (erken ve tam toplama), silo depolama ve taşan
// kaynağın pazarda satılması, tek tıkla toplama, haftalık temel gelir.
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js).
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { RES_KEYS, kaynakAdi } from './ortak.js';

// Seferin kayıtlı süresi: dakika (yoksa saatten, o da yoksa saniyeden) ve saat
function seferSuresi(sefer) {
  const dakika = sefer.durationMinutes || Math.round((sefer.durationHours || 0.3) * 60) || Math.max(1, Math.round(sefer.durationSeconds / 60));
  const saat = sefer.durationHours || parseFloat((dakika / 60).toFixed(2));
  return { dakika, saat };
}

// Seferin toplam XP'si: süreyle orantılı
const seferXp = (saat) => Math.max(5, Math.floor(35 * saat));

export const hasatYontemleri = {
  // Bir kaynağın dakika başına üretimi: taban üretim x seviye bonusu x köylü bonusu (+%1 / 10 köylü, en çok +%20;
  // Şifa Bahçesi projesi şifalı ota +%5). Seviye arttıkça dakikalık üretim değil sefer süresi uzar.
  getResourceRatePerMinute(nodeId, level = this.state.level) {
    const taban = (GAME_CONFIG.BASE_PRODUCTION && GAME_CONFIG.BASE_PRODUCTION[nodeId]) || 15;
    return taban * this.getLevelProductionMultiplier(level) * (this.getVillageProductionMultiplier ? this.getVillageProductionMultiplier(nodeId) : 1);
  },

  // Sefer şu ana kadar ne kadar mahsul biriktirdi (kısmi toplama sonrası kalan dahil)
  getAccruedExpeditionHarvest(nodeId) {
    const sefer = this.state.activeExpeditions[nodeId];
    if (!sefer) return { accruedAmount: 0, totalYield: 0, pct: 0, remainingSeconds: 0, elapsedSeconds: 0, durationSeconds: 0, isCompleted: false };

    // Sefer başladığı andaki üretim hızı kullanılır (sefer sırasında seviye atlamak geçmişe dönük artırmaz)
    const hiz = sefer.ratePerMinute || this.getResourceRatePerMinute(nodeId);
    const { dakika, saat } = seferSuresi(sefer);
    const toplamVerim = Math.max(10, Math.floor(hiz * dakika));
    const toplamXp = seferXp(saat);

    const ilerleme = Math.min(1, sefer.elapsedSeconds / sefer.durationSeconds);
    let toplanmis = 0;
    if (sefer.claimedAmount != null) toplanmis = sefer.claimedAmount;
    else if (sefer.claimedSeconds) toplanmis = Math.floor(toplamVerim * Math.min(1, sefer.claimedSeconds / sefer.durationSeconds));

    return {
      accruedAmount: Math.max(0, Math.floor(toplamVerim * ilerleme) - toplanmis),
      totalYield: toplamVerim,
      alreadyClaimed: toplanmis,
      accruedXp: sefer.isCompleted ? toplamXp : Math.max(1, Math.floor(toplamXp * ilerleme)),
      totalXp: toplamXp,
      pct: Math.min(100, Math.floor(ilerleme * 100)),
      remainingSeconds: Math.max(0, Math.ceil(sefer.durationSeconds - sefer.elapsedSeconds)),
      elapsedSeconds: sefer.elapsedSeconds,
      durationSeconds: sefer.durationSeconds,
      isCompleted: sefer.isCompleted
    };
  },

  // Bitmemiş seferin o ana kadar biriken mahsulünü (silodaki boş yer ve Üretim Hakkı kadarını) erken toplar
  claimPartialExpedition(nodeId) {
    const sefer = this.state.activeExpeditions[nodeId];
    if (!sefer) return { success: false, message: 'Aktif sefer bulunamadı.' };

    const birikim = this.getAccruedExpeditionHarvest(nodeId);
    if (birikim.accruedAmount <= 0) {
      return { success: false, message: 'Henüz toplanabilir bir kaynak birikmedi (En az 1 adet birikmeli).' };
    }

    const alan = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId];
    const alet = this.state.tools[alan.requiredTool];

    // Silo doluluk ve taşma kontrolü
    const limit = this.getWarehouseCapacity()[nodeId];
    const mevcut = Number(this.state.inventory[nodeId]) || 0;
    const bosYer = limit != null ? Math.max(0, limit - mevcut) : birikim.accruedAmount;
    const etiket = (kaynakAdi(nodeId) || alan.name).toLocaleLowerCase('tr-TR');

    if (limit != null && bosYer <= 0) {
      return {
        success: false,
        isWarehouseFull: true,
        nodeId,
        currentAmount: mevcut,
        limit,
        remainingToClaim: birikim.accruedAmount,
        message: `⚠️ Silo'nuz tamamen dolu (${mevcut}/${limit})! Lütfen ${etiket} seferini tamamlamak için silonuzu büyütün veya silonuzda yer açın.`
      };
    }

    // Boş yeri tam dolduracak kadarını al, kalanı seferde bırak; erken toplama da Üretim Hakkı ile sınırlıdır
    // (ortak kasa payı için hak 1/1,05'e bölünür)
    const hak = this.getUretimHakki(nodeId);
    const istenen = Math.min(birikim.accruedAmount, bosYer);
    const kasaOrani = Number(GAME_CONFIG.OTORITE?.COMMON_CHEST_RATE ?? 0.05);
    const alinacak = Math.max(0, Math.min(istenen, Math.floor(hak.canTake / (1 + kasaOrani))));
    if (istenen > 0 && alinacak <= 0) {
      return {
        success: false, isQuotaWait: true, nodeId,
        message: `⏳ Üretim Hakkın doldu (${Math.floor(hak.used).toLocaleString('tr-TR')} / ${Math.floor(hak.released).toLocaleString('tr-TR')}); biriken mahsul seferde izin bekliyor. Yeni hak ${this._fmtWait(hak.nextReleaseAt - this._now())} sonra açılır.`
      };
    }

    const cekilen = globalPool.harvest(nodeId, alinacak);
    this._takeKonseyShare(nodeId, cekilen);
    const { stored: depolanan, overflow } = this.storeResource(nodeId, cekilen);
    if (alet) alet.totalGathered = (alet.totalGathered || 0) + depolanan;

    const xp = Math.max(1, Math.floor((birikim.accruedXp || 1) * (depolanan / birikim.accruedAmount)));
    const seviyeSonucu = this.addXp(xp);
    sefer.claimedXp = (sefer.claimedXp || 0) + xp;

    // Kısmi tahsilat claimedAmount'a işlenir
    sefer.claimedAmount = (sefer.claimedAmount || birikim.alreadyClaimed || 0) + depolanan;
    sefer.claimedSeconds = birikim.totalYield > 0
      ? Math.min(sefer.durationSeconds, Math.floor((sefer.claimedAmount / birikim.totalYield) * sefer.durationSeconds))
      : sefer.elapsedSeconds;

    this.saveState();

    const bekleyen = Math.max(0, birikim.accruedAmount - depolanan);
    return {
      success: true,
      amount: depolanan,
      overflow,
      xpGained: xp,
      levelResult: seviyeSonucu,
      isPartialSiloFill: bekleyen > 0,
      stillRemaining: bekleyen,
      message: bekleyen > 0
        ? `📥 Silodaki boş alan kadar +${depolanan} ${alan.name} erken toplandı ve ambar doldu (${this.state.inventory[nodeId]}/${limit})! Kalan ${bekleyen} adet mahsul seferde bekletiliyor.`
        : `⚡ ${depolanan} ${alan.name} erken toplandı! (+${xp} XP)`
    };
  },

  // ── Silo ────────────────────────────────────────────────────────────────
  // Son çare koruması: normal oyunda silo taşmaz (hasat sığmayanı seferde bekletir, pazar alımı kapasiteyle sınırlı,
  // ödüller storeResourceOrSell ile sığmayanı satar). Buraya yalnız doğrudan eklemeler düşer; fazlası kesilir ve bildirilir.
  enforceWarehouseLimits() {
    if (!this.state || !this.state.inventory) return;
    const kapasite = this.getWarehouseCapacity();
    for (const kaynak of RES_KEYS()) {
      const limit = kapasite[kaynak];
      if (!(typeof limit === 'number' && limit > 0)) continue;
      const mevcut = Number(this.state.inventory[kaynak]) || 0;
      if (mevcut <= limit) continue;
      this.state.inventory[kaynak] = limit;
      if (!this._isFastForwarding) {
        const ad = kaynakAdi(kaynak);
        this.pushNotice(`⚠️ Silo dolu: ${Math.floor(mevcut - limit).toLocaleString('tr-TR')} ${ad} siloya sığmadı. Siloyu yükselterek kapasiteyi artırabilirsin.`, 'error');
      }
    }
  },

  // Taşan malzemeyi pazarda satar; taban fiyat yüzünden satılamayan kısım bildirilir
  _sellOverflow(resourceKey, qty, reason = 'Silo dolu') {
    const miktar = Math.floor(Number(qty) || 0);
    if (miktar <= 0) return { soldQty: 0, adaGained: 0, lostQty: 0 };
    let satilan = 0;
    let kazanc = 0;
    if (ammMarket && ammMarket.executeSell) {
      const tavan = ammMarket.getMaxSellBeforeFloor ? ammMarket.getMaxSellBeforeFloor(resourceKey) : miktar;
      const satilacak = Math.min(miktar, Math.max(0, Math.floor(tavan)));
      if (satilacak > 0) {
        const r = ammMarket.executeSell(resourceKey, satilacak);
        if (r && r.success) {
          satilan = satilacak;
          kazanc = Number(r.adAstraReceived) || 0;
          this.state.adAstraBalance = (this.state.adAstraBalance || 0) + kazanc;
          this._onAdaEarned(kazanc, { saleOf: resourceKey });
        }
      }
    }
    const kaybolan = miktar - satilan;
    const ad = kaynakAdi(resourceKey);
    if (!this._isFastForwarding) {
      if (satilan > 0) this.pushNotice(`📦 ${reason}: siloya sığmayan ${satilan.toLocaleString('tr-TR')} ${ad} pazarda satıldı (+${kazanc.toFixed(1)} ASTRA).`, 'info');
      if (kaybolan > 0) this.pushNotice(`⚠️ ${reason}: ${kaybolan.toLocaleString('tr-TR')} ${ad} siloya sığmadı ve pazar taban fiyatta olduğu için satılamadı.`, 'error');
    }
    return { soldQty: satilan, adaGained: kazanc, lostQty: kaybolan };
  },

  // Ödül/teslimat girişi: siloya sığan kısmı depolar, sığmayanı pazarda satar
  storeResourceOrSell(resourceKey, amount, reason = 'Silo dolu') {
    const miktar = Number(amount) || 0;
    if (miktar <= 0) return { stored: 0, soldQty: 0, adaGained: 0, lostQty: 0 };
    const { stored, overflow } = this.storeResource(resourceKey, miktar);
    const satis = overflow > 0 ? this._sellOverflow(resourceKey, overflow, reason) : { soldQty: 0, adaGained: 0, lostQty: 0 };
    return { stored, ...satis };
  },

  storeResource(resourceKey, amount) {
    if (!(amount > 0)) return { stored: 0, overflow: 0 };
    const limit = this.getWarehouseCapacity()[resourceKey];
    const mevcut = Math.min(limit != null ? limit : Infinity, Number(this.state.inventory[resourceKey]) || 0);
    if (limit == null) {
      this.state.inventory[resourceKey] = mevcut + amount;
      return { stored: amount, overflow: 0 };
    }
    const depolanan = Math.min(amount, Math.max(0, limit - mevcut));
    this.state.inventory[resourceKey] = Math.min(limit, mevcut + depolanan);
    return { stored: depolanan, overflow: amount - depolanan };
  },

  // ── Biten seferi toplama ────────────────────────────────────────────────
  claimExpedition(nodeId) {
    const sefer = this.state.activeExpeditions[nodeId];
    if (!sefer || !sefer.isCompleted) return { success: false, message: 'Henüz toplanacak bir sefer tamamlanmadı.' };

    const alan = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId];
    const alet = this.state.tools[alan.requiredTool];

    // Verim = dakika başı üretim x dakika (sefer başladığı andaki hızla)
    const hiz = sefer.ratePerMinute || this.getResourceRatePerMinute(nodeId);
    const dakika = sefer.durationMinutes || Math.round((sefer.durationHours || 0.3) * 60) || Math.max(1, Math.round(sefer.durationSeconds / 60));
    const toplamVerim = Math.floor(hiz * dakika);

    // Erken ya da kısmen toplanan miktar düşülür
    const toplanmis = sefer.claimedAmount != null
      ? sefer.claimedAmount
      : Math.floor(toplamVerim * Math.min(1, (sefer.claimedSeconds || 0) / sefer.durationSeconds));
    const kalan = Math.max(0, toplamVerim - toplanmis);
    if (kalan <= 0) {
      delete this.state.activeExpeditions[nodeId];
      this.saveState();
      return { success: true, message: 'Tüm mahsul zaten toplandı.' };
    }

    // Silo doluluk ve taşma kontrolü
    const limit = this.getWarehouseCapacity()[nodeId];
    let mevcut = Number(this.state.inventory[nodeId]) || 0;
    let bosYer = limit != null ? Math.max(0, limit - mevcut) : kalan;
    const etiket = (kaynakAdi(nodeId) || nodeId).toLocaleLowerCase('tr-TR');

    // Otomasyon botu varsa siloda yer açar (fazlayı satar ya da siloyu büyütür). isAutoCollectorActive() önkoşul
    // alım-satımını da tetiklediği için yalnızca bot var mı diye bakılır.
    let botSatilan = 0;
    let botKazanc = 0;
    const botVar = this.hasPurchasedBot();
    if (botVar) {
      const yer = this.handleBotSiloSpace(nodeId, kalan);
      if (yer && (yer.action === 'sold' || yer.action === 'sold_for_ada' || yer.action === 'upgraded')) {
        botSatilan = yer.amountSold || (yer.action === 'upgraded' ? 1 : 0);
        botKazanc = yer.adAstraReceived || 0;
      }
      mevcut = Number(this.state.inventory[nodeId]) || 0;
      const yeniLimit = this.getWarehouseCapacity()[nodeId];
      bosYer = yeniLimit != null ? Math.max(0, yeniLimit - mevcut) : kalan;
    }

    // Hiç yer yok ve bot da yer açamadıysa: sefer bekler
    if (limit != null && bosYer <= 0 && botSatilan <= 0) {
      sefer.isCompleted = true;
      sefer.stillRemaining = kalan;
      this.saveState();
      return {
        success: false,
        isWarehouseFull: true,
        nodeId,
        currentAmount: mevcut,
        limit,
        remainingToClaim: kalan,
        stillRemaining: kalan,
        message: `⚠️ Silo'nuz tamamen dolu (${mevcut}/${limit})! Kalan ${kalan} ${etiket} seferde bekletiliyor. Depoda yer açıldığında veya silonuz büyüdüğünde toplanacaktır.`
      };
    }

    // Üretim Hakkı: kişisel haftalık pay gün gün açılır; hak dolunca mahsul seferde izin bekler. Ortak kasa payı (%5) hakkın
    // içinden ayrıca çıkar: hakkın 1/1,05'i siloya girer.
    const hak = this.getUretimHakki(nodeId);
    const kasaOrani = Number(GAME_CONFIG.OTORITE?.COMMON_CHEST_RATE ?? 0.05);
    const istenen = Math.min(kalan, bosYer);
    const alinacak = Math.max(0, Math.min(istenen, Math.floor(hak.canTake / (1 + kasaOrani))));
    const hakBekleyen = Math.max(0, istenen - alinacak);
    if (istenen > 0 && alinacak <= 0) {
      sefer.isCompleted = true;
      sefer.stillRemaining = kalan;
      this.saveState();
      return {
        success: false,
        isQuotaWait: true,
        nodeId,
        remainingToClaim: kalan,
        stillRemaining: kalan,
        hak,
        message: `⏳ Üretim Hakkın doldu: bu hafta ${alan.name} için ${Math.floor(hak.used).toLocaleString('tr-TR')} / ${Math.floor(hak.released).toLocaleString('tr-TR')} birim çıkardın. Kalan ${kalan} ${etiket} seferde izin bekliyor; yeni hak ${this._fmtWait(hak.nextReleaseAt - this._now())} sonra açılır.`
      };
    }

    let depolanan = 0;
    let konseyPayi = 0;
    if (alinacak > 0) {
      const cekilen = globalPool.harvest(nodeId, alinacak);
      depolanan = this.storeResource(nodeId, cekilen).stored;
      konseyPayi = this._takeKonseyShare(nodeId, cekilen);
    }

    sefer.claimedAmount = (sefer.claimedAmount || toplanmis) + depolanan;
    sefer.claimedSeconds = sefer.durationSeconds;
    if (alet) alet.totalGathered = (alet.totalGathered || 0) + depolanan;

    const hala = Math.max(0, toplamVerim - sefer.claimedAmount);

    // Deneyim: sefer süresine göre tam XP; kısmi toplamada toplanan orana göre
    const saat = sefer.durationHours || parseFloat((dakika / 60).toFixed(2)) || 0.3;
    const toplamXp = seferXp(saat);
    const oncekiXp = sefer.claimedXp || 0;
    let xp = 0;

    if (hala <= 0) {
      // Sefer tamamen bitti: alet aşınır, kalan XP verilir, sefer kaldırılır
      alet.durability = Math.max(0, (alet.durability != null ? alet.durability : 4320) - dakika);
      xp = Math.max(0, toplamXp - oncekiXp);
      if (xp > 0) {
        this.addXp(xp);
        sefer.claimedXp = oncekiXp + xp;
      }
      delete this.state.activeExpeditions[nodeId];

      // Her sefer bitiminde bot silo yükseltmeyi dener (ASTRA finansmanıyla)
      if (botVar && this.state.botSiloAutoUpgrade) this.tryAutoUpgradeWarehouseWithAdaFinancing();
      this.saveState();

      let mesaj = `🌾 ${depolanan} ${alan.name} başarıyla toplandı ve ambarınıza eklendi! (+${xp} XP)`;
      if (konseyPayi > 0) mesaj += ` 🏛️ Ortak kasaya ${konseyPayi} ${alan.name} (%5).`;
      if (botSatilan > 0) {
        mesaj = `🤖 Ambar doldu: ${depolanan} ${alan.name} depolandı (%100 silo). Fazla gelen ${botSatilan} ${alan.name} AMM'de satıldı (+${botKazanc.toFixed(1)} ASTRA, +${xp} XP). Sefer tamamlandı!`;
      }
      return {
        success: true,
        isPartialSiloFill: false,
        amount: depolanan,
        harvestedAmount: depolanan,
        xpGained: xp,
        totalExpXp: toplamXp,
        resourceName: alan.name,
        botSurplusSold: botSatilan,
        botSurplusAdaEarned: botKazanc,
        konseyShare: konseyPayi,
        stillRemaining: 0,
        message: mesaj
      };
    }

    // Silo doldu ya da hak bitti: kalan miktar seferde bekler; XP toplanan oranda işlenir
    if (depolanan > 0 && toplamVerim > 0) {
      const hedefXp = Math.floor(toplamXp * Math.min(1, sefer.claimedAmount / toplamVerim));
      xp = Math.max(0, hedefXp - oncekiXp);
      if (xp > 0) {
        this.addXp(xp);
        sefer.claimedXp = oncekiXp + xp;
      }
    }
    this.saveState();

    const hakMesaji = hakBekleyen > 0
      ? `⏳ Üretim Hakkı: +${depolanan} ${alan.name} toplandı (+${xp} XP); hakkın doldu (${Math.floor(hak.used).toLocaleString('tr-TR')} / ${Math.floor(hak.released).toLocaleString('tr-TR')}). Kalan ${hala} ${etiket} seferde izin bekliyor; yeni hak ${this._fmtWait(hak.nextReleaseAt - this._now())} sonra açılır.`
      : null;
    return {
      success: true,
      isPartialSiloFill: true,
      amount: depolanan,
      harvestedAmount: depolanan,
      xpGained: xp,
      totalExpXp: toplamXp,
      resourceName: alan.name,
      stillRemaining: hala,
      currentAmount: this.state.inventory[nodeId],
      limit,
      message: `📥 Silodaki boş alan kadar +${depolanan} ${alan.name} depoya aktarıldı ve ambarınız doldu (${this.state.inventory[nodeId]}/${limit})! (+${xp} XP) Kalan ${hala} ${alan.name} seferde bekletiliyor. Depoda yer açtığınızda veya silonuzu büyüttüğünüzde kalan mahsulü de toplayabilirsiniz.`,
      ...(hakBekleyen > 0 ? { isQuotaWait: true, message: hakMesaji } : {}),
      konseyShare: konseyPayi
    };
  },

  // ── Tek tıkla toplama ───────────────────────────────────────────────────
  // Bütün alanlardan: biteni toplar, bitmemişin o ana kadar birikenini erken toplar
  claimAllHarvests() {
    let toplam = 0;
    let toplamXp = 0;
    const ayrinti = [];
    for (const alan of RES_KEYS()) {
      const sefer = this.state.activeExpeditions[alan];
      if (!sefer) continue;
      if (sefer.isCompleted) {
        const r = this.claimExpedition(alan);
        if (r && r.success) {
          toplam += r.amount || 0;
          toplamXp += r.xpGained || 0;
          ayrinti.push(`${r.amount} ${r.resourceName || alan}`);
        }
      } else {
        const r = this.claimPartialExpedition(alan);
        if (r && r.success) {
          toplam += r.amount || 0;
          toplamXp += r.xpGained || 0;
          const cfg = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[alan];
          ayrinti.push(`${r.amount} ${cfg ? cfg.name : alan}`);
        }
      }
    }
    if (toplam > 0) {
      this.saveState();
      return { success: true, totalHarvested: toplam, totalXp: toplamXp, message: `✨ Bütün Kasabadan Mahsuller Toplandı: +${ayrinti.join(', ')} (+${toplamXp} XP)` };
    }
    return { success: false, message: 'Toplanacak hazır bir mahsul veya biriken kaynak bulunamadı. Önce tarlalara ve madenlere işçi gönderin!' };
  },

  // Yalnız biten seferleri toplar
  sweepCompletedExpeditions() {
    let toplam = 0;
    let toplamXp = 0;
    const ayrinti = [];
    for (const alan of RES_KEYS()) {
      const sefer = this.state.activeExpeditions[alan];
      if (!(sefer && sefer.isCompleted)) continue;
      const r = this.claimExpedition(alan);
      if (r && r.success) {
        toplam += r.amount || 0;
        toplamXp += r.xpGained || 0;
        const cfg = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[alan];
        ayrinti.push(`+${r.amount} ${cfg ? cfg.name : alan}`);
      }
    }
    if (toplam > 0) {
      this.saveState();
      return { success: true, totalHarvested: toplam, totalXp: toplamXp, message: `⚡ Biten Seferler Başarıyla Toplandı: ${ayrinti.join(', ')} (+${toplamXp} XP)` };
    }
    return { success: false, message: 'Şu an tamamlanmış bir sefer bulunmuyor.' };
  },

  // ── Haftalık temel gelir (UBI) ──────────────────────────────────────────
  claimWeeklyUbi() {
    // İzindeyken temel gelir alınmaz (yer korunur, ekonomiden pay alınmaz)
    if (this.izindeMiOkuma && this.izindeMiOkuma()) {
      return { success: false, message: 'İzindeyken haftalık temel gelir alınmaz; izin bitince yeniden alabilirsin.' };
    }
    const r = globalPool.claimWeeklyUbi(this.state.level || 1, this.state.adAstraBalance || 0, this.state.lastClaimedUbiEpoch || 0);
    if (r.success) {
      this.state.lastClaimedUbiEpoch = r.epochId;
      this.state.adAstraBalance = (this.state.adAstraBalance || 0) + r.amount;
      this._onAdaEarned(r.amount);
      this.state.totalUbiEarned = (this.state.totalUbiEarned || 0) + r.amount;
      this.saveState();
    }
    return r;
  }
};
