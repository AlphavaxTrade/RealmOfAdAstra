// Realm of AdAstra — GameStateManager yöntemleri: Taverna otomasyon botu: döngü, duraklama, kaynak açığı, toplayıcı süresi
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { ammMarket } from '../ammMarket.js';
import { RES_KEYS, zeroRes, round3 } from './ortak.js';

export const botYontemleri = {
  // 🤖 24 SAATLİK TAVERNA OTONOM SEFER, HASAT, TAMİR, STAMİNA & SİLO MOTORU
  // Sıralama:
  // 1. Önce sefer kaynaklarını topla (hasat depoya girsin, eksikler tamamlansın)
  // 2. Aletleri onar
  // 3. Staminayı sadece bir sonraki seferleri karşılayacak kadar doldur (buğdayı tüketmeden)
  // 4. Silo durumunu kontrol et (kullanıcı seçimine göre "siloyu yükselt" veya "akıllı satış")
  // 5. 50x Önkoşul kontrolü (eksik varsa dondur/pause)
  // 6. Sonra tekrar seferi gönder
  runTavernaAutomationCycle() {
    const hasBot = this.hasPurchasedBot();
    if (!hasBot) return { active: false, paused: false, actions: [] };

    const nodes = RES_KEYS();
    const actions = [];

    // =========================================================================
    // 0. BOT ÇALIŞMA DURUMU & ÖNKOŞUL KONTROLÜ (Oto-Finansman / Asgari Oto-Tedarik)
    // Eğer hammadde eksikse ve kasada ASTRA varsa botun durmaması için asgari (50x) tamamlanır.
    // Kasada ASTRA yoksa bot duraklatılır ve süre dondurulur.
    // =========================================================================
    // =========================================================================
    // 1. ÖNCE TAMAMLANAN SEFERLERİ TOPLA (Hasat)
    // v1.25: Hasat artık önkoşul kontrolünden ÖNCE yapılır. Eskiden bot, seferde bekleyen hazır ürünü
    // toplamadan önce eksik malzemeyi pazardan satın alıyordu (gereksiz harcama).
    // =========================================================================
    let hasClaimedAny = false;
    for (const nodeId of nodes) {
      const exp = this.state.activeExpeditions ? this.state.activeExpeditions[nodeId] : null;
      if (exp && (exp.isCompleted || (exp.elapsedSeconds >= exp.durationSeconds))) {
        exp.isCompleted = true;
        const claimRes = this.claimExpedition(nodeId);
        if (claimRes && claimRes.success) {
          actions.push(`✅ ${GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId].name} seferi toplandı.`);
          hasClaimedAny = true;
        }
      }
    }

    this.updateBotPauseState();
    if (this.isBotPaused()) {
      if (actions.length > 0) {
        this.state.lastBotActions = actions;
        this.saveState();
      }
      return { active: false, paused: true, actions };
    }

    // =========================================================================
    // 2. ALETLERİ ONAR
    // Aşınmış veya hasar görmüş aletleri depodaki kaynaklarla otonom tamir et
    // =========================================================================
    for (const nodeId of nodes) {
      const toolId = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId].requiredTool;
      const tool = this.state.tools ? this.state.tools[toolId] : null;
      const maxDur = GAME_CONFIG.TOOLS[toolId]?.maxDurability || 4320;
      if (tool && tool.durability < maxDur) {
        const repCost = this.calculateRepairCost(toolId);
        if (repCost && repCost.missingDurability > 0) {
          // A) Tamir bedeli ödenince kasa güvenlik payının altına inecekse, önce depodaki fazla üründen eşit miktarda
          //    satarak ASTRA temin eder (v1.25: güvenlik payı yalnızca silo için değil, tamir için de korunur).
          //    Satacak ürün kalmadıysa tamir yine yapılır; bot durmaz.
          if (!this._botCanSpend(repCost.adAstraCost)) {
            const fundRes = this.autoFundBotAdaDeficit(repCost.adAstraCost + this.getBotAdaReserve(), { wood: repCost.woodCost, iron: repCost.ironCost });
            if (fundRes && fundRes.funded) {
              actions.push(`⚖️ Bot Alet Tamir Finansmanı: Tamir için gereken ${repCost.adAstraCost} ASTRA için kaynaklardan eşit miktarda (${Object.entries(fundRes.toSell || {}).filter(([, q]) => q > 0).map(([k, q]) => `${q} ${this.getResourceNameTr(k)}`).join(', ')}) satılarak +${fundRes.totalEarned?.toFixed(2)} ASTRA temin edildi.`);
            }
          }
          // B) Yeterli kaynak varsa onarımı gerçekleştir (Kaynak eksikse seferlerden gelmesi beklenir, AMM'den alıp fiyat şişirilmez)
          const curInv = this.state.inventory || {};
          if ((curInv.wood || 0) >= repCost.woodCost && 
              (curInv.iron || 0) >= repCost.ironCost && 
              (this.state.adAstraBalance || 0) >= repCost.adAstraCost) {
            const repRes = this.repairTool(toolId);
            if (repRes && repRes.success) {
              actions.push(`🔨 ${GAME_CONFIG.TOOLS[toolId].name} otomatik tamir edildi (${maxDur}/${maxDur}).`);
            }
          }
        }
      }
    }

    // =========================================================================
    // 3. STAMİNAYI DOLDUR (SADECE BİR SONRAKİ SEFERLERİ KARŞILAYACAK KADAR!)
    // Asla tüm buğdayı tüketip staminayı full'lemez; sadece gönderilecek sefer kadar alır.
    // =========================================================================
    const staminaCostPerExp = this.getExpeditionStaminaCost ? this.getExpeditionStaminaCost() : (GAME_CONFIG.STAMINA_COST_PER_EXPEDITION || 25);
    const readyToLaunchNodes = [];
    for (const nodeId of nodes) {
      const hasExp = this.state.activeExpeditions && this.state.activeExpeditions[nodeId];
      if (!hasExp) {
        const toolId = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId].requiredTool;
        const tool = this.state.tools ? this.state.tools[toolId] : null;
        if (tool && tool.durability > 0) {
          readyToLaunchNodes.push(nodeId);
        }
      }
    }

    if (readyToLaunchNodes.length > 0) {
      const totalStaminaNeeded = readyToLaunchNodes.length * staminaCostPerExp;
      const currentStamina = this.state.stamina || 0;

      if (totalStaminaNeeded > currentStamina) {
        const staminaDeficit = totalStaminaNeeded - currentStamina;
        const refRes = this.refillStaminaExact(staminaDeficit);
        if (refRes && refRes.success && refRes.wheatUsed > 0) {
          actions.push(`🍞 ${refRes.wheatUsed} Buğday ile seferler için +${Math.round(refRes.gainedStamina)} Stamina sağlandı.`);
        }
      }
    }

    // =========================================================================
    // 4. SİLO DURUMUNU KONTROL ET & SİLOYU YÜKSELT (Veya Kaynakları Sat)
    // SADECE VE SADECE bu döngüde tamamlanan bir sefer toplanmışsa (hasClaimedAny) kontrol edilir!
    // Bu sayede bot satın alındığı ilk milisaniyede veya boşta beklerken kontrolsüz ani seviye atlayıp
    // kullanıcının kasasındaki ASTRA'yı eritmesi kökten engellenir.
    // =========================================================================
    if (this.state.botSiloAutoUpgrade) {
      if (hasClaimedAny) {
        const upCost = this.getWarehouseUpgradeCost();
        if (upCost && upCost.is80PercentFull) {
          const upgradeRes = this.tryAutoUpgradeWarehouseWithAdaFinancing();
          if (upgradeRes && upgradeRes.upgraded) {
            actions.push(`🏰 Silo otomatik Seviye ${this.state.warehouseLevel}'e yükseltildi!`);
          }
        }
      }
    } else {
      if (hasClaimedAny) {
        // Kullanıcı açıkça "Kaynakları Sat" seçtiyse:
        // Silonun yarısını (%50) rezerve koru, fazlasını sürekli AMM'de sat
        for (const nid of nodes) {
          const spaceRes = this.handleBotSiloSpace(nid, 1);
          if (spaceRes && spaceRes.action === 'sold') {
            actions.push(`⚖️ Satış Modu (%50 Rezerve): ${spaceRes.amountSold} ${nid} satıldı (+${spaceRes.adAstraReceived?.toFixed(1)} ASTRA).`);
          }
        }
      }
    }

    // =========================================================================
    // 5. 50x ÖNKOŞUL KAYNAK KONTROLÜ VE DONDURMA/UYANMA (Pause/Freeze)
    // Hasat, tamirat ve minimum stamina dolumundan sonra bakiye kontrolü
    // =========================================================================
    this.updateBotPauseState();
    if (this.isBotPaused()) {
      if (actions.length > 0) {
        this.state.lastBotActions = actions;
        this.saveState();
      }
      return { active: false, paused: true, actions };
    }

    // =========================================================================
    // 6. TEKRAR SEFERLERİ GÖNDER (Otonom Başlatma)
    // =========================================================================
    for (const nodeId of readyToLaunchNodes) {
      const hasExp = this.state.activeExpeditions && this.state.activeExpeditions[nodeId];
      if (!hasExp) {
        const toolId = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId].requiredTool;
        const tool = this.state.tools ? this.state.tools[toolId] : null;
        const staminaCost = this.getExpeditionStaminaCost ? this.getExpeditionStaminaCost() : (GAME_CONFIG.STAMINA_COST_PER_EXPEDITION || 25);

        if (tool && tool.durability > 0 && (this.state.stamina || 0) >= staminaCost) {
          const startRes = this.startExpedition(nodeId);
          if (startRes && startRes.success) {
            actions.push(`🚀 ${GAME_CONFIG.GLOBAL_RESOURCE_CAPS[nodeId].name} seferi otonom başlatıldı.`);
          }
        }
      }
    }

    if (actions.length > 0) {
      this.state.lastBotActions = actions;
      this.saveState();
    }

    return { active: true, actions };
  },

  // 🔍 24 Saatlik Otomasyon Botunun Kesintisiz Çalışma Koşulları (Her Kaynaktan Min 50)
  checkBotPrerequisites() {
    const inv = this.state.inventory || {};
    const ada = this.state.adAstraBalance || 0;
    const req = 50;
    const reqAda = Number(GAME_CONFIG.TAVERNA_BOT?.REQUIRED_PREREQUISITES?.adAstra ?? 0.5);
    const missing = [];

    if ((inv.iron || 0) < req) {
      missing.push({ key: 'iron', name: 'Demir', icon: '⛏️', current: (inv.iron || 0), required: req, missing: Math.ceil(req - (inv.iron || 0)) });
    }
    if ((inv.wood || 0) < req) {
      missing.push({ key: 'wood', name: 'Odun', icon: '🌲', current: (inv.wood || 0), required: req, missing: Math.ceil(req - (inv.wood || 0)) });
    }
    if ((inv.wheat || 0) < req) {
      missing.push({ key: 'wheat', name: 'Buğday', icon: '🌾', current: (inv.wheat || 0), required: req, missing: Math.ceil(req - (inv.wheat || 0)) });
    }
    if (ada < reqAda) {
      missing.push({ key: 'adAstra', name: 'ASTRA', icon: '🟣', current: ada, required: reqAda, missing: round3(reqAda - ada) });
    }

    return {
      isMet: missing.length === 0,
      missing,
      missingText: missing.map(m => `${m.missing} ${m.icon} ${m.name}`).join(', ')
    };
  },

  /**
   * 🤖 Bot Çalışırken ASTRA Yetersizliği Durumunda Depodan Eşit Miktarda Kaynak Satışı
   * Kullanıcı kuralı: Bot alet onarırken veya çalışırken hesapta yeteri kadar ASTRA yok ise bot,
   * aletleri onarmak için ihtiyaç duyduğu ASTRA miktarı kadar elindeki kaynaklardan
   * eşit miktarda satarak pazardan ASTRA elde eder.
   * @param {number} neededTarget - Hedef ASTRA tutarı (Örn: aletin onarım bedeli)
   * @param {Object|null} preserveResources - Satılmaması gereken hammadde rezervi (Örn: tamirde harcanacak {wood, iron})
   */
  autoFundBotAdaDeficit(neededTarget = 50, preserveResources = null) {
    const curAda = Number(this.state.adAstraBalance) || 0;
    if (curAda >= neededTarget) {
      return { funded: false, reason: 'sufficient_ada', currentBalance: curAda };
    }

    if (typeof ammMarket === 'undefined' || !ammMarket || !ammMarket.executeSell) {
      return { funded: false, reason: 'amm_unavailable' };
    }

    const deficit = Math.max(0, neededTarget - curAda);
    // Küçük tampon (%3 marj + 0,02 ASTRA) ekleyerek AMM slippage/fiyat kayması olsa bile hedefe tam ulaş (v2 ölçekli)
    const targetToRaise = Math.max(0.01, deficit * 1.03 + 0.02);

    const inv = this.state.inventory = this.state.inventory || {};
    const nodes = RES_KEYS();

    // Her malzemenin anlık satış fiyatını al
    const prices = {};
    let sumPrices = 0;
    for (const node of nodes) {
      let p = 0;
      if (typeof ammMarket.getEstimatedAdAstraForSell === 'function') {
        p = ammMarket.getEstimatedAdAstraForSell(node, 1);
      }
      if (!p || isNaN(p) || p <= 0) {
        p = (typeof ammMarket.getPrice === 'function') ? ammMarket.getPrice(node) : 0.5;
      }
      prices[node] = Math.max(0.01, p || 0.5);
      sumPrices += prices[node];
    }

    if (sumPrices <= 0) return { funded: false, reason: 'zero_prices' };

    // 1. ADIM: Eşit miktarda satılacak birim: unitsPerNode * sumPrices >= targetToRaise
    let unitsPerNode = Math.ceil(targetToRaise / sumPrices);
    if (unitsPerNode < 1) unitsPerNode = 1;

    // Depodaki kullanılabilir stokları kontrol et (preserveResources hariç tutulur).
    // v1.25: Botun çalışma önkoşulu olan 50'lik taban da her zaman korunur; bot hiçbir malzemeyi
    // 50'nin altına satmaz (sat-al kısır döngüsünün kaynağı buydu).
    const floorKeep = 50;
    const curStocks = {};
    for (const n of nodes) curStocks[n] = Math.max(0, (Number(inv[n]) || 0) - (preserveResources?.[n] || 0) - floorKeep);

    // Tüm malzemelerden eşit miktarda satmayı hedefle
    const toSell = zeroRes();
    const minStock = Math.min(...nodes.map(n => curStocks[n]));

    if (minStock >= unitsPerNode) {
      // Her malzemede yeterli stok var: tam olarak eşit miktarda sat!
      for (const n of nodes) toSell[n] = unitsPerNode;
    } else if (minStock > 0) {
      // Ortak minimum kadar eşit sat, kalan açığı stokları elverenler arasında eşit paylaştır
      for (const n of nodes) toSell[n] = minStock;

      const raisedSoFar = minStock * sumPrices;
      let remainingToRaise = Math.max(0, targetToRaise - raisedSoFar);

      if (remainingToRaise > 0) {
        const surplusNodes = nodes.filter(n => (curStocks[n] - minStock) > 0);
        if (surplusNodes.length > 0) {
          const surplusSumPrice = surplusNodes.reduce((acc, n) => acc + prices[n], 0);
          const extraUnitsPerNode = Math.ceil(remainingToRaise / surplusSumPrice);
          for (const sn of surplusNodes) {
            const avail = curStocks[sn] - minStock;
            const extra = Math.min(avail, extraUnitsPerNode);
            toSell[sn] += extra;
          }
        }
      }
    } else {
      // Bir kaynağın stoğu 0 bile olsa, diğer mevcut kaynaklardan eşit miktarda sat
      const availableNodes = nodes.filter(n => curStocks[n] > 0);
      if (availableNodes.length > 0) {
        const availSumPrice = availableNodes.reduce((acc, n) => acc + prices[n], 0);
        let equalQty = Math.ceil(targetToRaise / availSumPrice);
        const minAvail = Math.min(...availableNodes.map(n => curStocks[n]));
        equalQty = Math.min(equalQty, minAvail);
        if (equalQty < 1 && minAvail >= 1) equalQty = 1;
        for (const an of availableNodes) {
          toSell[an] = Math.min(curStocks[an], equalQty);
        }
      }
    }

    const totalUnitsPlanned = nodes.reduce((s, n) => s + (toSell[n] || 0), 0);
    if (totalUnitsPlanned <= 0) {
      return { funded: false, reason: 'no_inventory_available' };
    }

    let totalEarned = 0;
    const soldBreakdown = {};

    for (const node of nodes) {
      const qty = toSell[node] || 0;
      if (qty > 0) {
        const sellRes = ammMarket.executeSell(node, qty);
        if (sellRes && sellRes.success) {
          inv[node] = Math.max(0, (inv[node] || 0) - qty);
          const earned = Number(sellRes.adAstraReceived) || 0;
          totalEarned += earned;
          soldBreakdown[node] = { qty, earned };
        }
      }
    }

    if (totalEarned > 0) {
      this.state.adAstraBalance = (this.state.adAstraBalance || 0) + totalEarned;
      for (const [k, v] of Object.entries(soldBreakdown)) this._onAdaEarned(v.earned, { saleOf: k });
      this.saveState();

      const actionMsg = `⚖️ Bot Oto-Finansman: Alet onarımı / tamir için gereken ASTRA açığı giderildi. Depodan eşit miktarda (${nodes.filter(n => toSell[n] > 0).map(n => `${toSell[n]} ${this.getResourceNameTr(n)}`).join(', ')}) satılarak pazardan +${totalEarned.toFixed(2)} ASTRA elde edildi.`;
      if (!this.state.lastBotActions) this.state.lastBotActions = [];
      this.state.lastBotActions.push(actionMsg);

      return {
        funded: true,
        toSell,
        totalEarned,
        soldBreakdown,
        newBalance: this.state.adAstraBalance,
        message: actionMsg
      };
    }

    return { funded: false, reason: 'sell_execution_failed' };
  },

  /**
   * 🤖 Hesap Seviyesi & Sefer Süresi Odaklı Dinamik Tamirat & Stamina Rezervi Hesaplayıcı
   * Kullanıcı kuralı: Kişi hesap seviyesini 2-3-4 şeklinde artırdıkça sefer süresi uzayacağı için
   * alet tamir bedelleri de artacaktır. Sabit 50 yerine, kişinin o anki hesap seviyesinde sefer süresi
   * üzerinden her sefer için tamirat bedeli olarak kaç odun/demir gerekiyorsa o miktarın en az %50 daha
   * fazlası (+%50 güvenlik tamponu) hesaplanır. Ayrıca 3 seferlik stamina için gereken buğday da aynı
   * şekilde en az %50 marjla eklenir. Böylece seviye atlatmalarda bot durdurma problemi kökünden çözülür.
   */
  getBotDynamicResourceDeficitTargets(level = this.state.level) {
    const lvl = Number(level) || 1;
    const durationMin = this.getExpeditionDurationMinutes ? this.getExpeditionDurationMinutes(lvl) : 18;

    // Üretim hızları üzerinden dakika başına alet aşınma maliyeti
    const woodRatePm = this.getResourceRatePerMinute ? this.getResourceRatePerMinute('wood') : 18;
    const ironRatePm = this.getResourceRatePerMinute ? this.getResourceRatePerMinute('iron') : 12;

    // 3 aletin toplam 1 seferlik aşınma maliyeti: 3 * (durationMin * costPerMin)
    const woodCostPerMin = (woodRatePm * 0.25) / 3;
    const ironCostPerMin = (ironRatePm * 0.25) / 3;
    const singleExpRepairWood = Math.ceil(3 * (durationMin * woodCostPerMin));
    const singleExpRepairIron = Math.ceil(3 * (durationMin * ironCostPerMin));

    // 3 paralel sefer için stamina tüketimi ve buğday karşılığı
    const staminaCostPerExp = this.getExpeditionStaminaCost ? this.getExpeditionStaminaCost(lvl) : 25;
    const totalStaminaNeeded = 3 * staminaCostPerExp;
    const wheatPerStamina = GAME_CONFIG.WHEAT_PER_STAMINA || 3.15;
    const singleExpStaminaWheat = Math.ceil(totalStaminaNeeded * wheatPerStamina);

    // Kural: Her sefer için tamirat bedeli olarak kaç odun/demir gerekiyorsa o miktarın EN AZ %50 DAHA FAZLASI (+%50)
    // Taban değer olarak da en az 50 hammadde güvence altına alınır.
    const targetWood = Math.max(50, Math.ceil(singleExpRepairWood * 1.5));
    const targetIron = Math.max(50, Math.ceil(singleExpRepairIron * 1.5));
    const targetWheat = Math.max(50, Math.ceil(singleExpStaminaWheat * 1.5));

    // Ambar kapasitesi sınırını taşmayacak şekilde sınırla (%80 ambar doluluğu tavanı)
    const cap = this.getWarehouseCapacity ? this.getWarehouseCapacity() : Object.fromEntries(RES_KEYS().map(k => [k, 1000]));

    return {
      level: lvl,
      durationMinutes: durationMin,
      singleExpRepairWood,
      singleExpRepairIron,
      singleExpStaminaWheat,
      targets: {
        wood: Math.min(Math.floor((cap.wood || 1000) * 0.8), targetWood),
        iron: Math.min(Math.floor((cap.iron || 1000) * 0.8), targetIron),
        wheat: Math.min(Math.floor((cap.wheat || 1000) * 0.8), targetWheat)
      }
    };
  },

  /**
   * 🤖 Bot Çalışırken Hammadde Yetersizliği Durumunda Kasadaki ASTRA ile AMM'den Asgari Satın Alma (Oto-Tedarik)
   * KULLANICI KURALI: Botun durmaması için kasada ASTRA varken AMM pazarından SADECE ve SADECE
   * eksik olan miktar kadar (asgari 50 birimlik önkoşulu tamamlayacak kadar minimal) alım yapılır.
   * Siloyu dolduracak biçimde yüzlerce kaynak asla alınmaz; sadece botun kesintisiz çalışması sağlanır.
   */
  autoBuyBotResourceDeficit(customTarget = null) {
    if (typeof ammMarket === 'undefined' || !ammMarket || !ammMarket.executeBuyAmount) {
      return { bought: false, reason: 'amm_unavailable' };
    }

    const inv = this.state.inventory = this.state.inventory || {};
    let curAda = Number(this.state.adAstraBalance) || 0;
    // v1.25: Bot, çalışma önkoşulu olan ASTRA'yı asla harcamaz; yalnızca üstündeki parayla alım yapar. (v2 ölçekli)
    const adaFloor = Number(GAME_CONFIG.TAVERNA_BOT?.REQUIRED_PREREQUISITES?.adAstra ?? 0.5);
    if (curAda - adaFloor <= 0.005) {
      return { bought: false, reason: 'no_ada_balance', currentBalance: curAda };
    }

    // 🎯 ASGARİ ÖNKOŞUL HEDEF MİKTARLARI (SADECE VE SADECE 50 BİRİM):
    // Kullanıcı kuralı: Siloyu dolduracak biçimde yüzlerce kaynak asla alınmaz!
    // Sadece botun durmasını engelleyecek asgari önkoşul barajı (50 Odun, 50 Demir, 50 Buğday) tamamlanır.
    const targets = {
      wood: (customTarget && typeof customTarget === 'object' && customTarget.wood != null) ? customTarget.wood : 50,
      iron: (customTarget && typeof customTarget === 'object' && customTarget.iron != null) ? customTarget.iron : 50,
      wheat: (customTarget && typeof customTarget === 'object' && customTarget.wheat != null) ? customTarget.wheat : 50
    };

    const nodes = Object.keys(targets);
    const missingNodes = [];
    for (const node of nodes) {
      const cur = Number(inv[node]) || 0;
      const reqAmount = targets[node] || 50;
      if (cur < reqAmount) {
        missingNodes.push({
          node,
          current: cur,
          required: reqAmount,
          missing: Math.ceil(reqAmount - cur),
          name: this.getResourceNameTr ? this.getResourceNameTr(node) : node
        });
      }
    }

    if (missingNodes.length === 0) {
      return { bought: false, reason: 'no_missing_resources' };
    }

    let totalSpentAda = 0;
    const boughtBreakdown = {};
    const itemsPurchasedText = [];

    for (const item of missingNodes) {
      const spendable = curAda - adaFloor;
      if (spendable <= 0.001) break;
      const node = item.node;
      let qtyToBuy = item.missing;

      // AMM'den tahmini maliyeti kontrol et
      let estCost = 0;
      if (typeof ammMarket.getEstimatedCostForBuy === 'function') {
        estCost = ammMarket.getEstimatedCostForBuy(node, qtyToBuy);
      }
      if (!isFinite(estCost) || estCost <= 0 || estCost > spendable) {
        // v1.25: Parası yetmeyen miktar alınmaz. Eskiden en az 1 birim alınıyor (Math.max(1, …)),
        // bakiye 0'da kırpıldığı için ödenmeyen fark yoktan kapanıyordu.
        const p = (typeof ammMarket.getPrice === 'function') ? ammMarket.getPrice(node) : 1;
        qtyToBuy = Math.min(item.missing, Math.floor(spendable / (Math.max(0.01, p) * 1.08)));
        while (qtyToBuy > 0 && ammMarket.getEstimatedCostForBuy(node, qtyToBuy) > spendable) qtyToBuy--;
      }

      if (qtyToBuy > 0) {
        const buyRes = ammMarket.executeBuyAmount(node, qtyToBuy);
        if (buyRes && buyRes.success) {
          curAda = curAda - buyRes.cost;
          this.state.adAstraBalance = curAda;
          this._onAdaSpent(buyRes.cost, { boughtResource: node });
          inv[node] = (Number(inv[node]) || 0) + buyRes.resourceReceived;
          totalSpentAda += buyRes.cost;
          boughtBreakdown[node] = {
            units: buyRes.resourceReceived,
            cost: buyRes.cost
          };
          itemsPurchasedText.push(`+${buyRes.resourceReceived} ${buyRes.resourceName || node}`);
        }
      }
    }

    if (totalSpentAda > 0) {
      this.saveState();
      const actionMsg = `🛒 Bot Asgari Oto-Tedarik: Botun durmaması için kasadaki ASTRA ile AMM pazarından ${totalSpentAda.toFixed(1)} ASTRA harcanarak (${itemsPurchasedText.join(', ')}) tamamlandı.`;
      if (!this.state.lastBotActions) this.state.lastBotActions = [];
      this.state.lastBotActions.push(actionMsg);

      return {
        bought: true,
        totalSpentAda,
        boughtBreakdown,
        newBalance: this.state.adAstraBalance,
        message: actionMsg
      };
    }

    return { bought: false, reason: 'buy_execution_failed' };
  },

  // ⏸️ Botun Duraklatılması (Pause) ve Süresinin Azalmadan Dondurulması (Freeze) Motoru
  updateBotPauseState() {
    const now = this._now();
    const isTavernaBotPurchased = (this.state.tavernaBotActive && (this.state.tavernaBotExpiresAt || 0) > now) ||
                                  (this.state.botActiveUntil && this.state.botActiveUntil > now) ||
                                  (this.state.activeBuffs && this.state.activeBuffs['auto_collector'] && (this.state.activeBuffs['auto_collector'].expiresAt || 0) > now) ||
                                  (this.state.botPaused && (this.state.botPausedRemainingMs || 0) > 0);

    if (!isTavernaBotPurchased) {
      // 🔄 24 Saat Bittiğinde Otomatik Yenileme Kontrolü
      if (this.state.botAutoRenew24h && (this.state.botActiveUntil || this.state.tavernaBotExpiresAt || (this.state.activeBuffs && this.state.activeBuffs['auto_collector']))) {
        const renewed = this.checkAndProcessBotAutoRenew();
        if (renewed) {
          return { isBotPurchased: true, isPaused: false, justRenewed: true };
        }
      }
      if (this.state.botPaused) {
        this.state.botPaused = false;
        this.state.botPausedRemainingMs = null;
      }
      return { isBotPurchased: false, isPaused: false };
    }

    const rawExp = Math.max(
      this.state.botActiveUntil || 0,
      this.state.tavernaBotExpiresAt || 0
    );

    let prereq = this.checkBotPrerequisites();

    // 🤖 KULLANICI KURALI: Çift Yönlü Bot Dengeleme ve Kesintisiz Çalışma Motoru!
    // v1.25: Sat-al kısır döngüsü kaldırıldı. Eskiden ASTRA ve bir malzeme aynı anda 50'nin altındayken bot
    // eksik malzemeyi de satıp hemen geri alıyordu (saniyede onlarca işlem, her turda komisyon kaybı).
    // Artık: satış yalnızca 50'nin ÜSTÜNDEKİ fazladan yapılır, alım yalnızca 50 ASTRA'nın ÜSTÜNDEKİ parayla yapılır.
    if (!prereq.isMet) {
      const hasAdaMissing = prereq.missing.some(m => m.key === 'adAstra');
      const resMissing = prereq.missing.filter(m => RES_KEYS().includes(m.key));
      const adaFloor = Number(GAME_CONFIG.TAVERNA_BOT?.REQUIRED_PREREQUISITES?.adAstra ?? 0.5);
      if (hasAdaMissing || resMissing.length > 0) {
        // Eksik malzemenin tahmini alım maliyeti + ASTRA önkoşulu kadar para topla (tek seferde)
        let buyCost = 0;
        for (const m of resMissing) {
          const c = (ammMarket && ammMarket.getEstimatedCostForBuy) ? ammMarket.getEstimatedCostForBuy(m.key, m.missing) : 0;
          if (isFinite(c)) buyCost += c;
        }
        const needAda = adaFloor + buyCost * 1.03 + 0.01;
        if ((this.state.adAstraBalance || 0) < needAda) {
          const fundRes = this.autoFundBotAdaDeficit(needAda);
          if (fundRes && fundRes.funded) prereq = this.checkBotPrerequisites();
        }
      }
    }

    // 2) KULLANICI KURALI: Eğer Hammadde (Odun, Demir, Buğday) < 50 olduğu için duracaksa ve kasada ASTRA varsa:
    // Pazarından SADECE eksik olan kadar (50'ye tamamlayacak kadar minimal) satın al ve botun durmasını engelle!
    if (!prereq.isMet) {
      const hasResourceMissing = prereq.missing.some(m => RES_KEYS().includes(m.key));
      if (hasResourceMissing && (this.state.adAstraBalance || 0) > Number(GAME_CONFIG.TAVERNA_BOT?.REQUIRED_PREREQUISITES?.adAstra ?? 0.5)) {
        const buyRes = this.autoBuyBotResourceDeficit(50);
        if (buyRes && buyRes.bought) {
          prereq = this.checkBotPrerequisites();
        }
      }
    }

    if (!prereq.isMet) {
      // Koşullar sağlanmıyor (Hammadde veya ASTRA < 50 ve kasada satın alacak ASTRA yok) -> BOT DURAKLATILMALI VE SÜRESİ DONDURULMALI!
      if (!this.state.botPaused) {
        this.state.botPaused = true;
        const remainingMs = Math.max(1000, rawExp - now);
        this.state.botPausedRemainingMs = remainingMs;
        this.state.botPausedAt = now;
        this.saveState();
      } else {
        // Zaten duraklatılmış, sürenin 1 saniye bile azalmaması için bitiş süresini sürekli ileri ötele!
        if (this.state.botPausedRemainingMs > 0) {
          this.state.botActiveUntil = now + this.state.botPausedRemainingMs;
          this.state.tavernaBotExpiresAt = this.state.botActiveUntil;
          if (this.state.activeBuffs?.auto_collector) {
            this.state.activeBuffs.auto_collector.expiresAt = this.state.botActiveUntil;
          }
        }
      }
      return { isBotPurchased: true, isPaused: true, prereq };
    } else {
      // Koşullar tam! (En az 50 Demir, 50 Odun, 50 Buğday, 50 ASTRA mevcut)
      if (this.state.botPaused) {
        // Bot duraklatılmıştı, ŞİMDİ ANINDA UYANDIRILACAK (RESUME)!
        this.state.botPaused = false;
        const restoredRemMs = this.state.botPausedRemainingMs || (24 * 3600 * 1000);
        this.state.botActiveUntil = now + restoredRemMs;
        this.state.tavernaBotExpiresAt = this.state.botActiveUntil;
        this.state.botPausedRemainingMs = null;
        this.state.botPausedAt = null;

        if (!this.state.activeBuffs) this.state.activeBuffs = {};
        this.state.activeBuffs['auto_collector'] = {
          id: 'auto_collector',
          name: '24 Saatlik Otomasyon Botu',
          expiresAt: this.state.botActiveUntil
        };

        this.saveState();

        // 🚀 Koşullar tamamlandığı an beklemeden hemen otonom sefer ve tamiratı tetikle!
        try {
          this.runTavernaAutomationCycle();
        } catch (e) {
          console.warn('Bot resume cycle execution error:', e);
        }

        return { isBotPurchased: true, isPaused: false, justResumed: true };
      }

      return { isBotPurchased: true, isPaused: false };
    }
  },

  isBotPaused() {
    return !!this.state.botPaused;
  },

  hasPurchasedBot() {
    const now = this._now();
    const isTavernaBot = (this.state.botActiveUntil && this.state.botActiveUntil > now) ||
                         (this.state.tavernaBotActive && this.state.tavernaBotExpiresAt > now) ||
                         (this.state.botPaused && (this.state.botPausedRemainingMs || 0) > 0);
    return !!isTavernaBot ||
           this.isBuffActive('auto_collector') ||
           this.isBuffActive('auto_collector_weekly') ||
           this.isBuffActive('auto_collector_monthly');
  },

  isAutoCollectorActive() {
    this.updateBotPauseState();

    const now = this._now();
    const isTavernaBot = (this.state.botActiveUntil && this.state.botActiveUntil > now) ||
                         (this.state.tavernaBotActive && this.state.tavernaBotExpiresAt > now) ||
                         (this.state.botPaused && (this.state.botPausedRemainingMs || 0) > 0);
    return !!isTavernaBot ||
           this.isBuffActive('auto_collector') ||
           this.isBuffActive('auto_collector_weekly') ||
           this.isBuffActive('auto_collector_monthly');
  },

  isBotRunning() {
    return this.isAutoCollectorActive() && !this.isBotPaused();
  },

  getAutoCollectorExpiry() {
    if (this.state.botPaused && this.state.botPausedRemainingMs > 0) {
      return this._now() + this.state.botPausedRemainingMs;
    }
    const now = this._now();
    let maxExp = 0;
    if (this.state.botActiveUntil && this.state.botActiveUntil > now) {
      maxExp = Math.max(maxExp, this.state.botActiveUntil);
    }
    if (this.state.tavernaBotActive && this.state.tavernaBotExpiresAt > now) {
      maxExp = Math.max(maxExp, this.state.tavernaBotExpiresAt);
    }
    for (const id of ['auto_collector', 'auto_collector_weekly', 'auto_collector_monthly']) {
      const b = this.state.activeBuffs ? this.state.activeBuffs[id] : null;
      if (b && b.expiresAt > maxExp && b.expiresAt > now) {
        maxExp = b.expiresAt;
      }
    }
    return maxExp;
  },

  getAutoCollectorRemainingSeconds() {
    if (this.state.botPaused && this.state.botPausedRemainingMs > 0) {
      return Math.max(0, Math.floor(this.state.botPausedRemainingMs / 1000));
    }
    const exp = this.getAutoCollectorExpiry();
    return Math.max(0, Math.floor((exp - this._now()) / 1000));
  },

  getAutoCollectorRemainingText() {
    const sec = this.getAutoCollectorRemainingSeconds();
    if (sec <= 0) return 'Pasif';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;

    let timeStr = '';
    if (hrs > 0) timeStr = `${hrs}s ${mins}d`;
    else if (mins > 0) timeStr = `${mins}d ${s}sn`;
    else timeStr = `${s}sn`;

    if (this.state.botPaused) {
      return `⏸️ ${timeStr} (Donduruldu)`;
    }
    return timeStr;
  },
};
