// Realm of AdAstra — GameStateManager yöntemleri: Canavar canı, seviye faydaları, bot paketi/deneme/yenileme, silo yükseltme finansmanı
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { ammMarket } from '../ammMarket.js';
import { levelWeight as ubiLevelWeight } from '../economy/ubi.js';
import { RES_KEYS, round3 } from './ortak.js';

export const botPaketiYontemleri = {
  // ═══════════════════════════════════════════════════════════════════════
  // 👾 ZİNDAN KALICI (PERSISTENT) CANAVAR CANI YÖNETİMİ
  // ═══════════════════════════════════════════════════════════════════════
  getMonsterCurrentHp(floorLevel, baseHp) {
    if (!this.state.dungeonMonsterCurrentHp) this.state.dungeonMonsterCurrentHp = {};
    const saved = this.state.dungeonMonsterCurrentHp[floorLevel];
    return (saved != null && saved > 0) ? saved : baseHp;
  },

  recordMonsterHp(floorLevel, hp) {
    if (!this.state.dungeonMonsterCurrentHp) this.state.dungeonMonsterCurrentHp = {};
    if (hp <= 0) {
      delete this.state.dungeonMonsterCurrentHp[floorLevel];
    } else {
      this.state.dungeonMonsterCurrentHp[floorLevel] = Math.round(hp);
    }
    this.saveState();
  },

  clearMonsterHp(floorLevel) {
    if (this.state.dungeonMonsterCurrentHp) {
      delete this.state.dungeonMonsterCurrentHp[floorLevel];
      this.saveState();
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🤖 TAVERNA 24 SAATLİK OTOMASYON BOTU (KÂRA ORTAK MODELİ)
  // ═══════════════════════════════════════════════════════════════════════
  // 📈 v1.25: Seviye başına kalıcı üretim çarpanı (Lv.1 = 1,00 · Lv.10 = 1,135 · Lv.81 = 2,20)
  // 📊 v1.25: Seviyenin somut faydaları (ekranda "şimdiki → sonraki seviye" olarak gösterilir)
  getLevelBenefits(level = this.state.level) {
    const L = Math.max(1, Math.min(GAME_CONFIG.MAX_PLAYER_LEVEL || 81, Number(level) || 1));
    const durMin = this.getExpeditionDurationMinutes(L);
    const staminaCost = this.getExpeditionStaminaCost(L);
    // 3 alan birden çalışırken saat başına harcanan stamina ve bunun buğday karşılığı
    const staminaPerHour = (3 * staminaCost) / Math.max(1e-9, durMin / 60);
    const wheatPerHour = staminaPerHour * (GAME_CONFIG.WHEAT_PER_STAMINA || 3.15);
    // 1.000 hammadde (odun) başına stamina için yakılan buğday: seviye başına yalnız %1 iner
    const woodPerHourField = this.getResourceRatePerMinute('wood', L) * 60;
    const wheatPer1000 = woodPerHourField > 0 ? (wheatPerHour / 3) / woodPerHourField * 1000 : 0;
    const minUbi = (GAME_CONFIG.UBI_CONFIG && GAME_CONFIG.UBI_CONFIG.MIN_LEVEL) || 3;
    return {
      level: L,
      productionBonusPct: Math.round((this.getLevelProductionMultiplier(L) - 1) * 1000) / 10,
      woodPerMinute: Math.round(this.getResourceRatePerMinute('wood', L) * 100) / 100,
      expeditionHours: Math.round((durMin / 60) * 100) / 100,
      staminaPerHour: Math.round(staminaPerHour * 10) / 10,
      wheatPerHour: Math.round(wheatPerHour),
      wheatPer1000: Math.round(wheatPer1000 * 10) / 10,
      maxStamina: this.getMaxStamina(L),
      fragmentRate: this.getFragmentDropRate(L),
      boxRate: this.getBoxDropRate(L),
      ubiEligible: L >= minUbi,
      ubiWeight: Math.round(ubiLevelWeight(L, { minLevel: minUbi, weight: (x) => 1 + Math.sqrt(Math.max(1, x) - 1) * 0.75 }) * 100) / 100
    };
  },

  getLevelProductionMultiplier(level = this.state.level) {
    const L = Math.max(1, Math.min(GAME_CONFIG.MAX_PLAYER_LEVEL || 81, Number(level) || 1));
    const per = GAME_CONFIG.LEVEL_PRODUCTION_BONUS_PER_LEVEL || 0;
    return 1 + per * (L - 1);
  },

  // 🤖 Bot ücreti = 24 saatlik tahmini net kârın %50'si.
  // v1.25: Tahmin artık oyuncunun seviyesine (üretim bonusu, sefer süresi, seviyeli stamina maliyeti),
  // doğal stamina yenilenmesine ve kalan haftalık dünya kotasına göre yapılır. Eski formül her seviyede
  // 1. seviyenin sayılarını kullanıyor, kotayı hiç hesaba katmıyordu.
  calculateTavernaBotProfitAndCost() {
    const lvl = this.state.level || 1;
    const mult = this.getLevelProductionMultiplier(lvl);
    const base = GAME_CONFIG.BASE_PRODUCTION;
    const keys = RES_KEYS();
    const prod = {}, prices = {};
    for (const k of keys) {
      prod[k] = (base[k] || 0) * mult;
      prices[k] = ammMarket.getPrice(k) || ((GAME_CONFIG.AMM_CORRIDORS[k] || {}).defaultPriceAda || 0.01);
    }
    const woodPrice = prices.wood, ironPrice = prices.iron, wheatPrice = prices.wheat;

    const grossValuePerMin = keys.reduce((s, k) => s + prod[k] * prices[k], 0);
    const durMin = Math.max(1, this.getExpeditionDurationMinutes(lvl));
    const regenPerMin = 60 / (GAME_CONFIG.STAMINA_NATURAL_REGEN_INTERVAL || 150);
    const staminaPerMin = Math.max(0, (keys.length * this.getExpeditionStaminaCost(lvl)) / durMin - regenPerMin);
    const wheatPerMinForStamina = staminaPerMin * (GAME_CONFIG.WHEAT_PER_STAMINA || 3.15);
    const staminaCostPerMinAda = wheatPerMinForStamina * wheatPrice;

    // Alet aşınması: her alet dakikada 1 dayanıklılık; onarım = dakikalık odun/demir üretiminin %25'i
    // (aletlere bölünmüş) + bu malzemenin değerinin TOOL_REPAIR_ADA_SHARE kadarı ASTRA (v2)
    const toolWoodPerMin = prod.wood * 0.25;
    const toolIronPerMin = prod.iron * 0.25;
    const toolMaterialCostPerMinAda = (toolWoodPerMin * woodPrice) + (toolIronPerMin * ironPrice);
    const toolAdaPerMin = toolMaterialCostPerMinAda * Number(GAME_CONFIG.TOOL_REPAIR_ADA_SHARE ?? 0.3);
    const toolCostPerMinAda = toolMaterialCostPerMinAda + toolAdaPerMin;

    // Üretim Hakkı: kalan hak bir günlük üretimden azsa, o kaynağın kazancı hakla sınırlıdır
    let grossDay = 0;
    let quotaLimited = false;
    for (const r of keys) {
      const dayProd = prod[r] * 1440;
      const info = (globalPool && globalPool.getResourceInfo) ? globalPool.getResourceInfo(r) : null;
      const remaining = info ? Number(info.remaining) : dayProd;
      if (remaining < dayProd) quotaLimited = true;
      grossDay += prices[r] * Math.min(dayProd, Math.max(0, remaining));
    }
    const netProfitPerMin = Math.max(0.0001, grossValuePerMin - staminaCostPerMinAda - toolCostPerMinAda);
    const netProfit24h = Math.max(0.01, round3(Math.min(netProfitPerMin * 1440, grossDay - (staminaCostPerMinAda + toolCostPerMinAda) * 1440)));
    const botCostAda = Math.max(1, round3(netProfit24h * 0.50));

    return {
      grossValuePerMin: round3(grossValuePerMin),
      staminaCostPerMinAda: round3(staminaCostPerMinAda),
      toolCostPerMinAda: round3(toolCostPerMinAda),
      netProfitPerMin: round3(netProfitPerMin),
      netProfit24h: round3(netProfit24h),
      grossRevenueAda: round3(grossValuePerMin * 1440),
      staminaWheatCostAda: round3(staminaCostPerMinAda * 1440),
      toolRepairCostAda: round3(toolCostPerMinAda * 1440),
      netProfitAda: round3(netProfit24h),
      botCostAda,
      dailyGrossValAda: round3(grossValuePerMin * 1440),
      dailyStaminaCostAda: round3(staminaCostPerMinAda * 1440),
      dailyWheatNeededForStamina: Math.round(wheatPerMinForStamina * 1440),
      dailyToolRepairAda: round3(toolCostPerMinAda * 1440),
      dailyNetProfitAda: round3(netProfit24h),
      dailyBotCostAda: botCostAda,
      level: lvl,
      productionMultiplier: mult,
      quotaLimited,
      livePrices: { ...prices }
    };
  },

  // Paket ücreti: günlük ücretin süreye oranı (6 saat = günlüğün 1/4'ü)
  getBotPackageCost(hours = 24) {
    const h = Math.max(1, Number(hours) || 24);
    const daily = this.calculateTavernaBotProfitAndCost().botCostAda;
    return Math.max(0.5, round3(daily * h / 24));
  },

  // 🛡️ Bot güvenlik payı: kasada her zaman bırakılan ASTRA (oto-yenileme açıksa ertesi günün bot ücreti dahil)
  getBotAdaReserve() {
    const minRes = (GAME_CONFIG.TAVERNA_BOT && GAME_CONFIG.TAVERNA_BOT.MIN_ADA_RESERVE) || 5;
    const renew = this.state.botAutoRenew24h ? this.calculateTavernaBotProfitAndCost().botCostAda : 0;
    return Math.max(minRes, renew);
  },

  _botCanSpend(amount) {
    return ((this.state.adAstraBalance || 0) - (Number(amount) || 0)) >= this.getBotAdaReserve();
  },

  buyTavernaAutomationBot(useFree = false, hours = 24) {
    const h = Math.max(1, Number(hours) || 24);
    const durMs = h * 3600 * 1000;
    const cost = useFree ? 0 : this.getBotPackageCost(h);

    if (!useFree && this.state.adAstraBalance < cost) {
      return {
        success: false,
        message: `Yetersiz ASTRA! ${h} Saatlik Otomasyon Botu için ${cost.toLocaleString()} ASTRA gereklidir (Saf kârın %50'si).`
      };
    }

    if (!useFree) {
      this.state.adAstraBalance -= cost;
      this._onAdaSpent(cost);
      globalPool.recordTokenSpend(cost);
    }

    const now = this._now();
    if (this.state.botPaused && this.state.botPausedRemainingMs > 0) {
      this.state.botPausedRemainingMs += durMs;
      this.state.botActiveUntil = now + this.state.botPausedRemainingMs;
      this.state.tavernaBotExpiresAt = this.state.botActiveUntil;
    } else {
      const baseTime = (this.state.botActiveUntil && this.state.botActiveUntil > now) ? this.state.botActiveUntil : now;
      this.state.botActiveUntil = baseTime + durMs;
      this.state.tavernaBotActive = true;
      this.state.tavernaBotExpiresAt = this.state.botActiveUntil;
    }

    // Tüm auto-collector sistemleriyle geriye dönük uyum için activeBuffs'a da yaz
    if (!this.state.activeBuffs) this.state.activeBuffs = {};
    this.state.activeBuffs['auto_collector'] = {
      id: 'auto_collector',
      name: '24 Saatlik Otomasyon Botu',
      expiresAt: this.state.botActiveUntil
    };

    this.saveState();

    // 🚀 Bot satın alındığı saniye derhal ilk otonom döngüyü çalıştır (boştaki tüm seferleri anında başlat)
    try {
      this.runTavernaAutomationCycle();
    } catch (e) {
      console.warn('Bot initial cycle error:', e);
    }

    return {
      success: true,
      botActiveUntil: this.state.botActiveUntil,
      costPaid: cost,
      message: useFree
        ? `🤖 ${h} Saatlik Otomasyon Botu hediye olarak aktifleştirildi!`
        : `🤖 ${h} Saatlik Otomasyon Botu aktifleştirildi! (Maliyet: ${cost.toLocaleString()} ASTRA, Kâr Ortaklığı: %50)`
    };
  },

  // 🎁 Yeni oyunculara bir kerelik ücretsiz bot denemesi
  startBotTrial() {
    if (this.state.botTrialUsed) {
      return { success: false, message: 'Ücretsiz bot denemesini daha önce kullandın.' };
    }
    const hours = (GAME_CONFIG.TAVERNA_BOT && GAME_CONFIG.TAVERNA_BOT.TRIAL_HOURS) || 1;
    this.state.botTrialUsed = true;
    const res = this.buyTavernaAutomationBot(true, hours);
    this.checkOnboardingProgress();
    this.saveState();
    return { ...res, message: `🎁 ${hours} saatlik ücretsiz bot denemesi başladı! Bot seferleri toplayıp aletleri onaracak ve yeniden gönderecek.` };
  },

  setBotSiloOption(autoUpgrade = true) {
    this.state.botSiloAutoUpgrade = !!autoUpgrade;
    if (!this.state.botSettings) this.state.botSettings = {};
    this.state.botSettings.siloAutoUpgrade = !!autoUpgrade;
    this.saveState();
    return { success: true, autoUpgrade: this.state.botSiloAutoUpgrade };
  },

  setBotAutoRenew24h(enabled = true) {
    this.state.botAutoRenew24h = !!enabled;
    this.saveState();
    return { success: true, autoRenew: this.state.botAutoRenew24h };
  },

  /**
   * 🔄 24 Saatlik Botun Süresi Bittiğinde Otomatik Yeniden Satın Alınması
   * Kullanıcı kuralı: Kişi 24 saatlik bot alırsa ve "24 saat bitince hesapta yeterli adastra
   * varsa tekrar bot al ve devam et" seçeneğini seçerse, hesapta yeteri kadar ASTRA olursa
   * bot 24 saat bitince otomatik yine satın alınır ve bir 24 saat daha çalışmaya devam eder.
   */
  checkAndProcessBotAutoRenew() {
    if (!this.state.botAutoRenew24h) return false;
    const now = this._now();
    const rawExp = Math.max(
      this.state.botActiveUntil || 0,
      this.state.tavernaBotExpiresAt || 0,
      this.state.activeBuffs?.auto_collector?.expiresAt || 0
    );

    // Eğer bot hiç başlatılmamışsa (rawExp === 0) veya süresi henüz bitmemişse yenileme yapma
    if (rawExp === 0 || rawExp > now) return false;

    // Eğer bot eksik kaynak nedeniyle duraklatılmış ve dondurulmuş süresi varsa yenileme yapma
    if (this.state.botPaused && (this.state.botPausedRemainingMs || 0) > 0) return false;

    const calc = this.calculateTavernaBotProfitAndCost();
    const cost = calc.dailyBotCostAda || calc.botCostAda || 0;

    if (this.state.adAstraBalance >= cost && cost > 0) {
      const buyRes = this.buyTavernaAutomationBot(false);
      if (buyRes && buyRes.success) {
        this.state.botRenewCount = (this.state.botRenewCount || 0) + 1;
        if (!this.state.lastBotActions) this.state.lastBotActions = [];
        this.state.lastBotActions.push(`🔄 Bot Otomatik Yenilendi: 24 saat tamamlandı. Kasadaki ${cost.toLocaleString()} ASTRA ile bot 24 saat daha uzatıldı ve kesintisiz çalışıyor.`);
        this.saveState();
        return true;
      }
    } else {
      if (!this.state.lastBotActions) this.state.lastBotActions = [];
      this.state.lastBotActions.push(`⚠️ Bot Otomatik Yenilenemedi: 24 saat tamamlandı ancak hesapta yeterli ASTRA (${(this.state.adAstraBalance || 0).toFixed(1)} / ${cost.toLocaleString()} ASTRA) olmadığı için bot durduruldu.`);
      this.state.botActiveUntil = 0;
      this.state.tavernaBotActive = false;
      this.state.tavernaBotExpiresAt = 0;
      if (this.state.activeBuffs && this.state.activeBuffs['auto_collector']) {
        delete this.state.activeBuffs['auto_collector'];
      }
      this.saveState();
    }
    return false;
  },

  /**
   * 🤖 24 Saatlik Otomasyon Botu - Kapsamlı Akıllı Silo Alanı Yönetimi
   * Kullanıcı Talimatları Doğrultusunda:
   * 1. Silonun yükseltilebilip yükseltilemeyeceğini kontrol eder; botSiloAutoUpgrade === true ise HER ZAMAN ÖNCE SİLOYU YÜKSELTİR.
   * 2. Yükseltme için tüm depolar %80 doluluğa ulaşmış fakat yeterli ASTRA yoksa:
   *    Silonun %80 doluluğunu korur, %80 üzerindeki fazlalığı silo yükseltmek için gereken ASTRA birikene kadar AMM'de satar!
   * 3. Silonun yükseltilemediği durumlarda:
   *    Seferden elde edilecek kaynak miktarı kadar siloda yer açacak kadar AMM'den satış yapar (tam gereken yer açılır).
   * 4. botSiloAutoUpgrade === false (Kaynakları Sat Modu) ise:
   *    Silonun yarısını (%50) rezerve korur, fazlasını sürekli AMM'de satarak ASTRA'ya dönüştürür.
   */
  handleBotSiloSpace(nodeId, harvestYield) {
    const capMap = this.getWarehouseCapacity();
    const limit = capMap[nodeId];
    if (limit == null) return { handled: true, reason: 'no_limit' };

    const currentAmount = Number(this.state.inventory[nodeId]) || 0;
    const yieldAmount = Math.max(1, Number(harvestYield) || 0);
    const availableRoom = Math.max(0, limit - currentAmount);

    // KURAL 0: Her sefer sonlandığında silonun yükseltilip yükseltilemeyeceğini kontrol et.
    // Yükseltilebiliyorsa ve kullanıcı "silo yükseltme" seçeneğini seçmişse HER ZAMAN ÖNCE SİLOYU YÜKSELT!
    const now = this._now();
    const canAutoUpgradeTime = this._isFastForwarding || !this.state.lastAutoWarehouseUpgradeTime || (now - this.state.lastAutoWarehouseUpgradeTime >= 3000);

    if (this.state.botSiloAutoUpgrade && canAutoUpgradeTime) {
      const upCost = this.getWarehouseUpgradeCost();
      if (upCost && upCost.canUpgrade && this._botCanSpend(upCost.adAstra)) {
        const upRes = this.upgradeWarehouse();
        if (upRes && upRes.success) {
          this.state.lastAutoWarehouseUpgradeTime = now;
          const newCap = this.getWarehouseCapacity()[nodeId];
          return { handled: true, action: 'upgraded', newCapacity: newCap };
        }
      }
    }

    // KURAL 1 & 2: Kişi "Siloyu Yükselt" (botSiloAutoUpgrade = true) seçmişse:
    if (this.state.botSiloAutoUpgrade) {
      const upCost = this.getWarehouseUpgradeCost();

      // KURAL 2: Eğer siloyu yükseltmek için yeterli adastra yoksa:
      // Silonun %80 dolacağı kadar kaynak bıraksın sadece siloda,
      // geri kalan kaynağı silo yükseltmek için yeterli adastra birikene kadar satsın marketten!
      if (upCost && upCost.is80PercentFull && !(upCost.canAffordCost && this._botCanSpend(upCost.adAstra))) {
        const reqFill = Math.round(limit * 0.8);
        const surplus = Math.max(0, currentAmount - reqFill);
        const adaDeficit = Math.max(0, upCost.adAstra + this.getBotAdaReserve() - (this.state.adAstraBalance || 0));

        if (surplus > 0 && adaDeficit > 0 && typeof ammMarket !== 'undefined' && ammMarket.executeSell) {
          const price = (ammMarket.getPrice && ammMarket.getPrice(nodeId)) ? ammMarket.getPrice(nodeId) : 1;
          const neededUnits = Math.max(1, Math.ceil(adaDeficit / price));
          const amountToSell = Math.min(surplus, neededUnits);

          if (amountToSell > 0) {
            const sellRes = ammMarket.executeSell(nodeId, amountToSell);
            if (sellRes && sellRes.success) {
              this.state.inventory[nodeId] = Math.max(0, (this.state.inventory[nodeId] || 0) - amountToSell);
              this.state.adAstraBalance = (this.state.adAstraBalance || 0) + (sellRes.adAstraReceived || 0);
              this._onAdaEarned(sellRes.adAstraReceived || 0, { saleOf: nodeId });
              this.state.lastBotSiloAction = {
                timestamp: Date.now(),
                nodeId,
                amountSold: amountToSell,
                adAstraEarned: sellRes.adAstraReceived,
                reason: 'silo_upgrade_ada_deficit'
              };
              this.saveState();

              // Satış sonrası ASTRA tamamlandıysa anında yükseltmeyi dene!
              const freshCost = this.getWarehouseUpgradeCost();
              if (freshCost && freshCost.canUpgrade && canAutoUpgradeTime && this._botCanSpend(freshCost.adAstra)) {
                const freshUp = this.upgradeWarehouse();
                if (freshUp && freshUp.success) {
                  this.state.lastAutoWarehouseUpgradeTime = now;
                  return { handled: true, action: 'upgraded', newCapacity: this.getWarehouseCapacity()[nodeId] };
                }
              }

              return {
                handled: true,
                action: 'sold_for_ada',
                amountSold: amountToSell,
                adAstraReceived: sellRes.adAstraReceived,
                message: `🤖 Silo yükseltme ASTRA açığını kapatmak için %80 barajı üzerindeki ${amountToSell} ${nodeId} satıldı (+${sellRes.adAstraReceived.toFixed(1)} ASTRA).`
              };
            }
          }
        }
      }

      // KURAL 1 (Adım 1): Sefer bittiğinde ilgili kaynağın silodaki yerine baksın.
      // Siloda yer varsa kaynağı toplayıp siloya göndersin.
      // Eğer siloda yeteri kadar yer yoksa, seferden elde edilecek kaynak miktarı kadar
      // siloda yer açacak kadar (artan miktar kadar) AMM'den satış yapsın!
      // (Örneğin sefer bitti ve 324 odun toplanacak, siloda 200 yer var: 124 odun markette satılır,
      // 324 odunun hepsi depolanır ve ambar tam 1080 ile %100 dolar, sefer sıfırlanıp biter).
      if (availableRoom < yieldAmount) {
        const shortfall = yieldAmount - availableRoom;
        const amountToSell = Math.min(currentAmount, shortfall);

        if (amountToSell > 0 && typeof ammMarket !== 'undefined' && ammMarket.executeSell) {
          const sellRes = ammMarket.executeSell(nodeId, amountToSell);
          if (sellRes && sellRes.success) {
            this.state.inventory[nodeId] = Math.max(0, (this.state.inventory[nodeId] || 0) - amountToSell);
            this.state.adAstraBalance = (this.state.adAstraBalance || 0) + (sellRes.adAstraReceived || 0);
            this._onAdaEarned(sellRes.adAstraReceived || 0, { saleOf: nodeId });
            this.state.lastBotSiloAction = {
              timestamp: Date.now(),
              nodeId,
              amountSold: amountToSell,
              adAstraEarned: sellRes.adAstraReceived,
              reason: 'make_room_for_expedition_yield'
            };
            this.saveState();

            return {
              handled: true,
              action: 'sold',
              amountSold: amountToSell,
              adAstraReceived: sellRes.adAstraReceived,
              message: `🤖 Sefer hasadı için tam gereken yer açıldı: ${amountToSell} ${nodeId} AMM'de satıldı (+${sellRes.adAstraReceived.toFixed(1)} ASTRA).`
            };
          }
        }
      }

      return { handled: true, reason: 'space_sufficient', neededSell: 0, amountSold: 0 };
    }

    // KURAL 3: Kişi bot seçeneklerinde kaynakların marketten satılması seçeneğini seçmişse (botSiloAutoUpgrade = false):
    // O zaman elde edilen kaynakların hepsini sürekli satsın, sadece silonun YARISI (%50) dolu olacak kadar kaynağı biriktirsin!
    const halfCap = Math.floor(limit * 0.5);
    const projectedTotal = currentAmount + yieldAmount;
    if (projectedTotal > halfCap) {
      const surplusAboveHalf = Math.max(0, currentAmount - halfCap);
      const neededSpace = Math.max(0, projectedTotal - limit);
      const amountToSell = Math.min(currentAmount, Math.max(surplusAboveHalf, neededSpace));

      if (amountToSell > 0 && typeof ammMarket !== 'undefined' && ammMarket.executeSell) {
        const sellRes = ammMarket.executeSell(nodeId, amountToSell);
        if (sellRes && sellRes.success) {
          this.state.inventory[nodeId] = Math.max(0, (this.state.inventory[nodeId] || 0) - amountToSell);
          this.state.adAstraBalance = (this.state.adAstraBalance || 0) + (sellRes.adAstraReceived || 0);
          this._onAdaEarned(sellRes.adAstraReceived || 0, { saleOf: nodeId });
          this.state.lastBotSiloAction = {
            timestamp: Date.now(),
            nodeId,
            amountSold: amountToSell,
            adAstraEarned: sellRes.adAstraReceived,
            reason: 'sell_mode_keep_half_cap'
          };
          this.saveState();

          return {
            handled: true,
            action: 'sold',
            amountSold: amountToSell,
            adAstraReceived: sellRes.adAstraReceived,
            message: `🤖 Kaynak Satış Modu: Silo yarısı (%50) korunup ${amountToSell} ${nodeId} satıldı (+${sellRes.adAstraReceived.toFixed(1)} ASTRA).`
          };
        }
      }
    }

    return { handled: true, reason: 'space_sufficient', neededSell: 0 };
  },

  /**
   * 🤖 Silo Yükseltme & %80 Barajında ASTRA Finansmanı (Adım 4 A Seçeneği 2. Bölüm)
   * Her sefer bitiminde tetiklenir:
   * 1. Tüm depolar %80 doluluğa ulaşmış mı kontrol eder.
   * 2. Gerekli hammadde (odun, demir, buğday) yeterliyse fakat ASTRA eksikse:
   *    Depolardaki %80 güvenlik barajının üstünde kalan fazlalık kaynakları AMM DEX'te satarak
   *    yükseltme için gereken ASTRA'yı finanse eder.
   * 3. ASTRA tamamlandığında siloyu derhal Seviye Atlatır!
   */
  tryAutoUpgradeWarehouseWithAdaFinancing() {
    if (!this.state.botSiloAutoUpgrade) return { success: false, reason: 'auto_upgrade_disabled' };

    const now = this._now();
    if (!this._isFastForwarding && this.state.lastAutoWarehouseUpgradeTime && (now - this.state.lastAutoWarehouseUpgradeTime < 3000)) {
      return { success: false, reason: 'cooldown' };
    }

    let cost = this.getWarehouseUpgradeCost();
    if (!cost) return { success: false, reason: 'max_level' };

    // 🛡️ BOT İŞLETME REZERVİ KORUMASI:
    // Bot alet tamiratı ve operasyonlarını sürdürebilmek için kasada en az 500 ASTRA güvenlik tamponu korur.
    // Eğer kasadaki ASTRA doğrudan harcandığında bakiye 500 ASTRA altına inecekse;
    // Kasadaki nakit yerine ambarlardaki %80 üzeri fazlalık kaynaklar AMM'de satılarak ASTRA temin edilir.
    // Böylece hem piyasa fiyatları düşer hem de kullanıcının kasası sıfırlanmaz!
    // Eğer zaten yükseltilebiliyorsa doğrudan yükselt!
    // v1.25: Bot yükseltme için kasadaki paranın hepsini harcamaz; güvenlik payını (en az 500 ASTRA,
    // oto-yenileme açıksa ertesi günün bot ücreti) her zaman bırakır.
    if (cost.canUpgrade && this._botCanSpend(cost.adAstra)) {
      const upRes = this.upgradeWarehouse();
      if (upRes && upRes.success) {
        this.state.lastAutoWarehouseUpgradeTime = now;
        return { success: true, upgraded: true, newLevel: this.state.warehouseLevel };
      }
    }

    // %80 Barajında ASTRA Finansmanı:
    // Depolar %80 dolu mu fakat ASTRA (güvenlik payı dahil) eksik mi?
    if (cost.is80PercentFull && !(cost.canAffordCost && this._botCanSpend(cost.adAstra))) {
      const inv = this.state.inventory || {};
      const hasAllRes = (cost.keys || RES_KEYS()).every(k => (inv[k] || 0) >= ((cost.costs || {})[k] || 0));

      // Hammaddeler yeterli, sadece ASTRA eksikse:
      if (hasAllRes) {
        let adaDeficit = Math.max(0, cost.adAstra + this.getBotAdaReserve() - (this.state.adAstraBalance || 0));

        if (adaDeficit > 0 && typeof ammMarket !== 'undefined' && ammMarket.executeSell) {
          const cap = cost.currentCap || this.getWarehouseCapacity();
          const nodes = cost.keys || RES_KEYS();
          let totalSoldAda = 0;

          for (const node of nodes) {
            if (adaDeficit <= 0) break;
            const baraj = Math.round((cap[node] || 0) * 0.8);
            const cur = Number(inv[node]) || 0;
            const surplus = Math.max(0, cur - baraj);

            if (surplus > 0) {
              const price = (ammMarket.getPrice && ammMarket.getPrice(node)) ? ammMarket.getPrice(node) : 1;
              const neededUnits = Math.max(1, Math.ceil((adaDeficit * 1.03 + 0.02) / price));
              const amountToSell = Math.min(surplus, neededUnits);

              if (amountToSell > 0) {
                const sellRes = ammMarket.executeSell(node, amountToSell);
                if (sellRes && sellRes.success) {
                  this.state.inventory[node] = Math.max(0, (this.state.inventory[node] || 0) - amountToSell);
                  const earned = sellRes.adAstraReceived || 0;
                  this.state.adAstraBalance = (this.state.adAstraBalance || 0) + earned;
                  this._onAdaEarned(earned, { saleOf: node });
                  totalSoldAda += earned;
                  adaDeficit = Math.max(0, adaDeficit - earned);
                }
              }
            }
          }

          this.saveState();

          // ASTRA tamamlandıysa siloyu derhal seviye atlat!
          const freshCost = this.getWarehouseUpgradeCost();
          if (freshCost && freshCost.canUpgrade && this._botCanSpend(freshCost.adAstra)) {
            const freshUp = this.upgradeWarehouse();
            if (freshUp && freshUp.success) {
              this.state.lastAutoWarehouseUpgradeTime = now;
              return { success: true, upgraded: true, newLevel: this.state.warehouseLevel, totalSoldAda };
            }
          }
        }
      }
    }

    return { success: false, reason: 'conditions_not_met' };
  },

  // Türkçe Kaynak İsimleri Çevirici
  getResourceIcon(key) {
    const m = (GAME_CONFIG.RESOURCE_META || {})[key];
    if (m && m.icon) return m.icon;
    return { fragments: '🧩', boxes: '📦', keys: '🔑', scroll_heal: '📜', scroll_stamina: '⚡' }[key] || '';
  },

  getResourceNameTr(key) {
    if (!key) return '';
    const meta = (GAME_CONFIG.RESOURCE_META || {})[String(key).toLowerCase()];
    if (meta && meta.name) return meta.name;
    const map = {
      wood: 'Odun',
      iron: 'Demir',
      wheat: 'Buğday',
      stone: 'Taş',
      coal: 'Kömür',
      herb: 'Şifalı Ot',
      ada: 'ASTRA',
      adastra: 'ASTRA',
      ticket: 'Bilet',
      fragments: 'Teçhizat Parçası',
      boxes: 'Pandora Kutusu',
      keys: 'Anahtar',
      scroll_heal: 'Şifa Parşömeni',
      scroll_stamina: 'Stamina Parşömeni',
      scroll_teleport: 'Işınlanma Parşömeni'
    };
    return map[String(key).toLowerCase()] || key;
  },
};
