// Realm of AdAstra — GameStateManager yöntemleri: Promo ödülü, Karnaval çarkı, parşömen, ortak piyango
// (kurumsal A3.11: js/gameState.js'ten AYNEN taşındı; davranış değişmedi. Karışım olarak GameStateManager.prototype'a eklenir.)
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { sound } from '../audio.js';
import { ammMarket } from '../ammMarket.js';
import { treasury } from '../treasury.js';
import { splitTicketPayment, runDraw, winChance as lotteryWinChance } from '../economy/lottery.js';
import { decayedStreak, streakMultiplier, minContribution, FAUCET_DEFAULTS } from '../economy/faucet.js';
import { RES_KEYS } from './ortak.js';

export const karnavalYontemleri = {
  // ═══════════════════════════════════════════════════════════════════════
  // 🎪 KRALLIK KARNAVALI: 14 ÖDÜLLÜ ŞANS ÇARKI & HAFTALIK PİYANGO
  // ═══════════════════════════════════════════════════════════════════════
  // 🏛️ Karnaval kasasından ödeme: kasada yoksa ödenmez (v1.25 öncesi boş kasada ödül yoktan ödeniyordu)
  // 🎟️ Promo kodu ödülü (kullanıcı kararı 6 Ekim 2026): her kodun ne vereceğini yönetici seçer. Yoktan bir şey basılmaz:
  // ASTRA görev kasasından gelir ve KİLİTLİ verilir (oyunda harcandıkça açılır); hammadde ve eşyalar görev kasasının
  // parasıyla pazardan satın alınıp verilir. Kasa yetmezse ya da pazarda yeterli mal yoksa hiçbir şey verilmez.
  // reward: { ada, wood, iron, wheat, fragments, keys, boxes, scroll_heal, scroll_stamina } (tam sayılar)
  applyPromoReward(reward = {}) {
    const ITEMS = [...RES_KEYS(), 'fragments', 'keys', 'boxes', 'scroll_heal', 'scroll_stamina'];
    const ada = Math.max(0, Math.floor(Number(reward.ada) || 0));
    const items = ITEMS.map(k => [k, Math.max(0, Math.floor(Number(reward[k]) || 0))]).filter(([, v]) => v > 0);
    if (!ada && !items.length) return { success: false, message: 'Bu kodun ödülü yok.' };
    const pools = treasury && treasury.state && treasury.state.pools;
    if (!pools) return { success: false, message: 'Hazine okunamadı.' };
    let need = ada;
    for (const [k, v] of items) {
      const est = ammMarket.getEstimatedCostForBuy(k, v);
      if (!isFinite(est)) return { success: false, message: `Pazarda yeterli ${this.getResourceNameTr ? this.getResourceNameTr(k) : k} yok; kod şu an kullanılamıyor.` };
      need += est;
    }
    if ((pools.quest || 0) < need * 1.02) return { success: false, message: 'Görev kasası şu an bu ödülü karşılayamıyor; daha sonra tekrar dene.' };
    const got = [];
    let spent = 0;
    for (const [k, v] of items) {
      const r = ammMarket.executeBuyAmount(k, v);
      if (!r || !r.success) return { success: false, failedMidway: true, message: (r && r.message) || 'Pazardan alınamadı.' };
      spent += r.cost;
      if (RES_KEYS().includes(k)) this.storeResourceOrSell(k, v, 'Promo kodu');
      else if (k === 'keys') this.state.arenaKeys = (this.state.arenaKeys || 0) + v;
      else if (k === 'boxes') this.state.lockedBoxes = (this.state.lockedBoxes || 0) + v;
      else this.state.inventory[k] = (Number(this.state.inventory[k]) || 0) + v;
      got.push(`${v.toLocaleString('tr-TR')} ${this.getResourceNameTr ? this.getResourceNameTr(k) : k}`);
    }
    spent += ada;
    pools.quest = (pools.quest || 0) - spent;
    if (!treasury.state.outflow) treasury.state.outflow = {};
    treasury.state.outflow.quest = (treasury.state.outflow.quest || 0) + spent;
    treasury.state.lifetimeWithdrawn = (treasury.state.lifetimeWithdrawn || 0) + spent;
    treasury.save();
    if (ada > 0) {
      this.state.adAstraBalance = (Number(this.state.adAstraBalance) || 0) + ada;
      this.state.lockedAda = Math.min(this.state.adAstraBalance, (Number(this.state.lockedAda) || 0) + ada);
      got.unshift(`${ada.toLocaleString('tr-TR')} ASTRA (kilitli)`);
    }
    this.saveState();
    return { success: true, spentFromQuest: spent, message: `🎟️ Promo kodu: ${got.join(', ')} hesabına eklendi.` };
  },

  _drawCarnival(amount) {
    const want = Math.max(0, Number(amount) || 0);
    if (!treasury || !treasury.state || !treasury.state.pools) return 0;
    const pool = treasury.state.pools.carnival || 0;
    const paid = Math.min(pool, want);
    if (paid <= 0) return 0;
    treasury.state.pools.carnival = pool - paid;
    if (!treasury.state.outflow) treasury.state.outflow = {};
    treasury.state.outflow.carnival = (treasury.state.outflow.carnival || 0) + paid;
    treasury.state.lifetimeWithdrawn = (treasury.state.lifetimeWithdrawn || 0) + paid;
    treasury.save();
    return paid;
  },

  isCarnivalWheelOpen() {
    const minBal = GAME_CONFIG.CARNIVAL?.WHEEL_MIN_CARNIVAL_BALANCE || 5000;
    const bal = (treasury && treasury.getPool) ? treasury.getPool('carnival') : 0;
    return { open: bal >= minBal, balance: bal, minBalance: minBal };
  },

  // 🎪 Karnaval coşkusu: günde bir kez +10 stamina (önceden sınırsızdı; bedava stamina açığıydı)
  carnivalCheer() {
    const c = this.getDailyCounters();
    if (c.carnivalCheer) return { success: false, message: '🎪 Bugün karnaval coşkusuna zaten katıldın. Yarın yine gel!' };
    c.carnivalCheer = 1;
    this.state.stamina = Math.min(this.getMaxStamina(), (this.state.stamina || 0) + 10);
    this.saveState();
    return { success: true, message: '🎪 Karnaval coşkusuna katıldın! +10 ⚡ Moral Staminası kazandın!' };
  },

  // Hammaddeyle bugün kalan çevirme hakkı
  getWheelResourceSpinsLeft() {
    const lim = GAME_CONFIG.CARNIVAL?.WHEEL_RESOURCE_DAILY_LIMIT ?? 3;
    return Math.max(0, lim - (this.getDailyCounters().wheelResourceSpins || 0));
  },

  // 🎁 Ücretsiz oyuncu payı: şartlar ve sadakat serisi (panel için; dağıtım sunucuda, haftalık)
  getFreePlayerPoolInfo() {
    const FP = { ...FAUCET_DEFAULTS, ...(GAME_CONFIG.FREE_PLAYER_POOL || {}) };
    const mult = this.getAdaPriceMultiplier();
    const ep = (globalPool && globalPool.state && globalPool.state.epochId) || 1;
    const level = Number(this.state.level) || 1;
    const week = this.getContributionInfo().week;
    const need = Math.ceil(minContribution(mult, FP));
    const streakNow = decayedStreak(this.state.faucetStreak, ep);
    const ifQualify = (this.state.faucetStreak && this.state.faucetStreak.lastEpoch === ep) ? streakNow : streakNow + 1;
    return {
      deposited: (Number(this.state.depositedAda) || 0) > 0,
      minLevel: FP.MIN_LEVEL, level, levelOk: level >= FP.MIN_LEVEL,
      needContribution: need, weekContribution: week, contributionOk: week >= need,
      streakWeeks: streakNow, streakMultiplier: streakMultiplier(Math.max(1, ifQualify), FP), streakMax: FP.STREAK_MAX,
      locked: FP.LOCKED !== false
    };
  },

  // Çark bedeli (ASTRA fiyat çarpanıyla)
  getWheelCostAda() {
    return this.adaPrice(GAME_CONFIG.CARNIVAL?.WHEEL_COST_ADA || 100);
  },

  spinCarnivalWheel(paymentMethod = 'ada') {
    const costAda = this.getWheelCostAda();
    const inv = this.state.inventory;

    // v1.25: Kasa en büyük ödülü karşılayamıyorsa çark geçici olarak kapalı
    const wheelStatus = this.isCarnivalWheelOpen();
    if (!wheelStatus.open) {
      return { success: false, wheelClosed: true, message: `🎪 Karnaval kasası yenileniyor (${Math.floor(wheelStatus.balance).toLocaleString('tr-TR')} / ${wheelStatus.minBalance.toLocaleString('tr-TR')} ASTRA). Pazar ve harcama komisyonlarıyla kasa dolunca çark yeniden açılacak.` };
    }

    let burnedInfo = null;

    if (paymentMethod === 'ada') {
      if (this.state.adAstraBalance < costAda) {
        return { success: false, message: `Yetersiz ASTRA! Çark çevirmek için ${costAda} ASTRA gereklidir.` };
      }
      this.state.adAstraBalance -= costAda;
      this._onAdaSpent(costAda);
      // Bedelin %80'i doğrudan Karnaval kasasına (ödüller buradan ödenir), %20'si her harcama gibi dağıtılır
      const share = Math.max(0, Math.min(1, GAME_CONFIG.CARNIVAL?.WHEEL_CARNIVAL_SHARE ?? 0.8));
      if (share > 0 && treasury.depositTo) treasury.depositTo('carnival', costAda * share);
      globalPool.recordTokenSpend(costAda * (1 - share));
    } else if (paymentMethod === 'ticket') {
      if ((this.state.lotteryTickets || 0) < 1) {
        return { success: false, message: 'Çark çevirmek için en az 1 Piyango Biletine sahip olmalısın!' };
      }
      // Yakılan biletin ödenen bedeli de piyango ödül hesabından düşer (bilet başına ortalama)
      const tk = this.state.lotteryTickets || 0;
      const avgPaid = this.state.lotteryTicketsPaid != null && tk > 0 ? this.state.lotteryTicketsPaid / tk : 0;
      if (this.state.lotteryTicketsPaid != null && tk > 0) {
        this.state.lotteryTicketsPaid = Math.max(0, this.state.lotteryTicketsPaid - avgPaid);
      }
      // Satın alınmış biletin piyango kasasındaki payı Karnaval kasasına geçer (ödülü artık çark öder)
      const moved = Math.min(avgPaid * (1 - (GAME_CONFIG.CARNIVAL?.LOTTERY?.AMORTI_SHARE ?? 0.02)), Math.max(0, Number(this.state.lotteryPool) || 0));
      if (moved > 0 && treasury.depositTo) { this.state.lotteryPool -= moved; treasury.depositTo('carnival', moved); }
      this.state.lotteryTickets -= 1;
    } else if (RES_KEYS().includes(paymentMethod)) {
      const resLimit = GAME_CONFIG.CARNIVAL?.WHEEL_RESOURCE_DAILY_LIMIT ?? 3;
      const dcRes = this.getDailyCounters();
      if ((dcRes.wheelResourceSpins || 0) >= resLimit) {
        return { success: false, message: `🎪 Bugün hammaddeyle ${resLimit} kez çevirdin (günlük sınır). Yarın yine gel ya da ASTRA / biletle çevir.` };
      }
      const price = ammMarket.getPrice(paymentMethod) || 1.0;
      const requiredAmount = Math.ceil(costAda / price);
      const resNameTr = this.getResourceNameTr(paymentMethod);
      if ((inv[paymentMethod] || 0) < requiredAmount) {
        return { success: false, message: `Yetersiz ${resNameTr}! ${costAda} ASTRA değerinde hammadde için ${requiredAmount} adet gereklidir.` };
      }
      inv[paymentMethod] -= requiredAmount;
      dcRes.wheelResourceSpins = (dcRes.wheelResourceSpins || 0) + 1;
      // Kullanıcı kararı (4 Ekim 2026): ödenen hammaddenin YARISI yakılır, YARISI pazarda satılır ve gelen ASTRA
      // Karnaval kasasına girer (ödüller bu kasadan ödenir). Pazar fiyatı tabandaysa satılamayan kısım da yakılır.
      const toSell = Math.min(Math.floor(requiredAmount / 2), ammMarket.getMaxSellBeforeFloor(paymentMethod));
      let soldQty = 0, carnivalIn = 0;
      if (toSell > 0) {
        const sale = ammMarket.executeSell(paymentMethod, toSell);
        if (sale && sale.success && sale.adAstraReceived > 0) {
          soldQty = toSell;
          carnivalIn = treasury.depositTo ? treasury.depositTo('carnival', sale.adAstraReceived) : 0;
        }
      }
      const burnQty = requiredAmount - soldQty;
      this.recordCarnivalResourceBurn(paymentMethod, burnQty);
      burnedInfo = { resource: paymentMethod, resourceNameTr: resNameTr, amount: burnQty, soldQty, carnivalIn, fromPayment: true };
      // Güvenlik (4 Ekim 2026): burada eskiden recordTokenSpend(100 ASTRA) çağrılıyordu. Ortada ASTRA yokken hazineye,
      // yakıma ve yapımcı payına para yazıyordu (yoktan para); sunucuda bunun yakım/yapımcı kısmı gerçek ADASTRA olarak
      // zincire gönderilirdi. Hammadde yukarıda zaten yakılıyor; ASTRA kaydı yapılmaz.
    } else {
      return { success: false, message: 'Geçersiz ödeme yöntemi!' };
    }

    const rewards = GAME_CONFIG.CARNIVAL.WHEEL_REWARDS;
    const totalWeight = rewards.reduce((s, r) => s + (r.weight || 1), 0);
    let rand = Math.random() * totalWeight;
    let selectedReward = rewards[0];

    for (const r of rewards) {
      if (rand < r.weight) {
        selectedReward = r;
        break;
      }
      rand -= r.weight;
    }

    let rewardSummaryText = selectedReward.name;
    let buybackInfo = null;

    // Pazardan alınamayan eşya ödülünün yerine, ödülün ASTRA karşılığı kasadan verilir
    const payAdaFallback = (valueAda, label) => {
      const paid = this._drawCarnival(valueAda);
      this.state.adAstraBalance += paid;
      this._onAdaEarned(paid);
      rewardSummaryText = `${label} yerine ${paid.toLocaleString('tr-TR')} ASTRA (pazarda şu an alınamadı; 🏛️ Karnaval Hazinesinden)`;
    };

    if (selectedReward.type === 'ada') {
      // 🏛️ KARNAVAL HAZİNESİNDEN ASTRA ÖDÜLÜ: Havadan basılmaz, doğrudan Karnaval Hazine Kasasından karşılanır!
      const rewardAmount = this.adaPrice(selectedReward.amount || 0);
      const adaToPay = this._drawCarnival(rewardAmount);

      this.state.adAstraBalance += adaToPay;
      this._onAdaEarned(adaToPay);
      rewardSummaryText = `${adaToPay.toLocaleString('tr-TR')} ASTRA (🏛️ Karnaval Hazinesinden Karşılandı)`;

    } else if (selectedReward.key === 'fragments' || (selectedReward.type === 'resource' && selectedReward.key === 'fragments')) {
      // 🏛️ TEÇHİZAT PARÇALARI: Havadan basılmaz, Karnaval Hazinesi bütçesiyle AMM marketten fiziki buyback yapılır!
      const fragAmount = selectedReward.amount || 1;
      const oldPrice = ammMarket.getPrice('fragments') || 45.0;
      
      // AMM DEX Marketinden Fiziki Satın Alma (Havuzdan parça eksilir, fiyata yukarı yönlü etki eder)
      const estCost = ammMarket.getEstimatedCostForBuy('fragments', fragAmount);
      const buyRes = (isFinite(estCost) && estCost <= (treasury.getPool ? treasury.getPool('carnival') : 0))
        ? ammMarket.executeBuyAmount('fragments', fragAmount)
        : { success: false };
      if (!buyRes.success) {
        payAdaFallback(selectedReward.valAda || Math.round(fragAmount * oldPrice), `${fragAmount} Teçhizat Parçası`);
      } else {
      const newPrice = ammMarket.getPrice('fragments') || oldPrice;
      const priceDelta = newPrice - oldPrice;
      const priceDeltaPct = oldPrice > 0 ? (priceDelta / oldPrice) * 100 : 0;
      const costAda = buyRes.cost;

      // Karnaval Hazine Kasasından Maliyeti Düş
      this._drawCarnival(costAda);

      // Kullanıcıya teslim edilir
      inv.fragments = (inv.fragments || 0) + fragAmount;
      const pctSign = priceDeltaPct >= 0 ? '+' : '';
      rewardSummaryText = `${fragAmount} Teçhizat Parçası (🏛️ Karnaval AMM Buyback: ${oldPrice.toFixed(2)} ➔ ${newPrice.toFixed(2)} ASTRA, ${pctSign}%${priceDeltaPct.toFixed(2)} 📈)`;
      buybackInfo = {
        item: `${fragAmount} Teçhizat Parçası`,
        resourceKey: 'fragments',
        amount: fragAmount,
        adaSpent: costAda,
        oldPrice,
        newPrice,
        priceDelta,
        priceDeltaPct,
        poolName: 'Teçhizat Parçası',
        poolIcon: '🧩'
      };
      }

    } else if (selectedReward.type === 'amm_raw' || RES_KEYS().includes(selectedReward.key)) {
      // 🏛️ HAMMADDELER (Odun, Demir, Buğday): Havadan basılmaz, Karnaval Hazinesi bütçesiyle AMM marketten fiziki buyback yapılır!
      const resKey = selectedReward.key;
      const oldPrice = ammMarket.getPrice(resKey) || 1.0;
      const grantAmount = selectedReward.amount || Math.max(1, Math.round((selectedReward.adaVal || 50) / oldPrice));
      
      // AMM DEX Marketinden Fiziki Satın Alma (Havuzdan hammadde çekilir, fiyat FİZİKİ OLARAK ARTAR!)
      const estCostRaw = ammMarket.getEstimatedCostForBuy(resKey, grantAmount);
      const buyRes = (isFinite(estCostRaw) && estCostRaw <= (treasury.getPool ? treasury.getPool('carnival') : 0))
        ? ammMarket.executeBuyAmount(resKey, grantAmount)
        : { success: false };
      if (!buyRes.success) {
        payAdaFallback(selectedReward.adaVal || selectedReward.valAda || 50, selectedReward.name);
      } else {
      const newPrice = ammMarket.getPrice(resKey) || oldPrice;
      const priceDelta = newPrice - oldPrice;
      const priceDeltaPct = oldPrice > 0 ? (priceDelta / oldPrice) * 100 : 0;
      const costAda = buyRes.cost;

      // Karnaval Hazine Kasasından Maliyeti Düş
      this._drawCarnival(costAda);

      // Kullanıcıya teslim edilir — silo doluysa sığmayan kısım kaybolmaz, pazarda satılıp ASTRA olarak verilir
      const stored = this.storeResourceOrSell(resKey, grantAmount, 'Çark ödülü');
      const grantResNameTr = this.getResourceNameTr(resKey);
      const pctSign = priceDeltaPct >= 0 ? '+' : '';
      rewardSummaryText = `${grantAmount.toLocaleString('tr-TR')} ${grantResNameTr} (🏛️ Karnaval AMM Buyback: ${oldPrice.toFixed(4)} ➔ ${newPrice.toFixed(4)} ASTRA, ${pctSign}%${priceDeltaPct.toFixed(2)} 📈)`;
      buybackInfo = {
        item: `${grantAmount.toLocaleString('tr-TR')} ${grantResNameTr}`,
        resourceKey: resKey,
        amount: grantAmount,
        adaSpent: costAda,
        oldPrice,
        newPrice,
        priceDelta,
        priceDeltaPct,
        poolName: grantResNameTr,
        poolIcon: resKey === 'wood' ? '🌲' : (resKey === 'iron' ? '⛏️' : '🌾')
      };
      if (stored.soldQty > 0) {
        rewardSummaryText += ` — silo dolu olduğu için ${stored.soldQty.toLocaleString('tr-TR')} adedi pazarda satıldı (+${stored.adaGained.toFixed(1)} ASTRA)`;
      }
      }

    } else if (selectedReward.type === 'key' || selectedReward.id === 'box_key') {
      // 🏛️ PANDORA KUTUSU ANAHTARLARI: Havadan basılmaz, Karnaval Hazinesi bütçesiyle AMM marketten fiziki buyback yapılır!
      const keyAmount = selectedReward.amount || 1;
      const oldPrice = ammMarket.getPrice('keys') || 1000.0;
      
      // AMM DEX Marketinden Fiziki Satın Alma (Havuzdan anahtar eksilir, fiyat FİZİKİ OLARAK ARTAR!)
      const estCostKey = ammMarket.getEstimatedCostForBuy('keys', keyAmount);
      const buyRes = (isFinite(estCostKey) && estCostKey <= (treasury.getPool ? treasury.getPool('carnival') : 0))
        ? ammMarket.executeBuyAmount('keys', keyAmount)
        : { success: false };
      if (!buyRes.success) {
        payAdaFallback(selectedReward.valAda || Math.round(keyAmount * oldPrice), `${keyAmount} Pandora Kutusu Anahtarı`);
      } else {
      const newPrice = ammMarket.getPrice('keys') || oldPrice;
      const priceDelta = newPrice - oldPrice;
      const priceDeltaPct = oldPrice > 0 ? (priceDelta / oldPrice) * 100 : 0;
      const costAda = buyRes.cost;

      // Karnaval Hazine Kasasından Maliyeti Düş
      this._drawCarnival(costAda);

      // Kullanıcıya teslim edilir
      this.state.arenaKeys = (this.state.arenaKeys || 0) + keyAmount;
      const pctSign = priceDeltaPct >= 0 ? '+' : '';
      rewardSummaryText = `${keyAmount} Pandora Kutusu Anahtarı (🏛️ Karnaval AMM Buyback: ${oldPrice.toFixed(1)} ➔ ${newPrice.toFixed(1)} ASTRA, ${pctSign}%${priceDeltaPct.toFixed(2)} 📈)`;
      buybackInfo = {
        item: `${keyAmount} Pandora Kutusu Anahtarı`,
        resourceKey: 'keys',
        amount: keyAmount,
        adaSpent: costAda,
        oldPrice,
        newPrice,
        priceDelta,
        priceDeltaPct,
        poolName: 'Arena Anahtarı',
        poolIcon: '🔑'
      };
      }

    } else if (selectedReward.type === 'bot_free') {
      this.buyTavernaAutomationBot(true, selectedReward.hours || 24);
    } else if (selectedReward.type === 'scroll') {
      inv[selectedReward.key] = (inv[selectedReward.key] || 0) + selectedReward.amount;
    } else if (selectedReward.type === 'ticket_shard') {
      // 🎟️ AMORTİ BİLETLERİ: 10'dan 3'e indirildi! 3 adet amorti bileti geldiğinde 1 çark çevirme hakkı verir!
      this.state.wheelTicketShards = (this.state.wheelTicketShards || 0) + 1;
      if (this.state.wheelTicketShards >= 3) {
        this.state.wheelTicketShards -= 3;
        this.state.lotteryTickets = (this.state.lotteryTickets || 0) + 1;
        rewardSummaryText += ' (🎉 3 Parça Birikti: +1 Çark Çevirme / Piyango Bileti Kazanıldı!)';
      }
    } else if (selectedReward.type === 'analysis_code') {
      const code = `ALPHAVAX-COIN-${Date.now().toString(36).toUpperCase()}`;
      if (!Array.isArray(this.state.redeemCodes)) this.state.redeemCodes = [];
      this.state.redeemCodes.push({ code, type: 'coin_analysis', created: Date.now(), status: 'pending_integration' });
      // v1.25: Dürüst açıklama — kod henüz AlphavaxTrade sitesinde geçmiyor, sunucu bağlantısından sonra etkinleşecek
      rewardSummaryText = `🎫 Coin Analiz Kuponu: ${code} — Envanterinde saklandı. AlphavaxTrade sitesiyle bağlantı kurulduğunda kullanılabilecek (şu an sitede geçerli değil).`;
    }

    sound.playLevelUp();
    this.saveState();

    return {
      success: true,
      reward: selectedReward,
      slice: selectedReward,
      rewardSummaryText,
      burnedInfo,
      buybackInfo,
      message: buybackInfo
        ? `🎉 Çarktan kazandın: ${rewardSummaryText}! (🏛️ Karnaval Hazine Kasasından ${buybackInfo.adaSpent.toLocaleString('tr-TR')} ASTRA ile AMM DEX pazarından buyback yapılıp teslim edildi)`
        : burnedInfo
        ? `🔥 ${burnedInfo.amount.toLocaleString('tr-TR')} ${burnedInfo.resourceNameTr} yakıldı${burnedInfo.soldQty > 0 ? `, ${burnedInfo.soldQty.toLocaleString('tr-TR')} adedi pazarda satılıp Karnaval kasasına ${Math.floor(burnedInfo.carnivalIn).toLocaleString('tr-TR')} ASTRA kazandırdı` : ''}! Çarktan kazandın: ${rewardSummaryText}`
        : `🎉 Tebrikler! Çarktan kazandın: ${rewardSummaryText}`
    };
  },

  useScroll(scrollType, targetId = null) {
    if (!this.state.inventory) this.state.inventory = {};
    const inv = this.state.inventory;
    const count = inv[scrollType] || 0;
    if (count <= 0) {
      return { success: false, message: 'Envanterinde bu parşömenden hiç bulunmuyor!' };
    }

    if (scrollType === 'scroll_heal') {
      const soldiers = (this.state.soldierUnits && this.state.soldierUnits.length > 0) ? this.state.soldierUnits : (this.state.soldiers || []);
      if (soldiers.length === 0) {
        return { success: false, message: 'İyileştirilecek bir askerin bulunmuyor!' };
      }
      let target = null;
      if (targetId !== null && targetId !== undefined) {
        target = soldiers.find((s, idx) => s.id === targetId || String(idx) === String(targetId));
      }
      if (!target) {
        target = soldiers.find(s => (s.hp || 0) < (s.maxHp || 100));
      }
      if (!target) {
        return { success: false, message: 'Ordudaki tüm AdAstra Şampiyonlarının canı zaten tam dolu!' };
      }
      const healAmount = 10;
      target.hp = Math.min(target.maxHp || 100, (target.hp || 0) + healAmount);
      inv.scroll_heal -= 1;
      this.burnItem('scroll_heal', 1);
      this.saveState();
      return {
        success: true,
        message: `📜 Ordu İyileştirme Parşömeni kullanıldı! ${target.name} +10 Can kazandı (${target.hp}/${target.maxHp || 100} HP).`
      };
    }

    if (scrollType === 'scroll_stamina') {
      const maxStamina = this.getMaxStamina();
      const curStam = this.state.stamina || 0;
      if (curStam >= maxStamina) {
        return { success: false, message: 'Dayanıklılığın (Stamina) zaten tamamen dolu!' };
      }
      const actualGain = Math.min(100, maxStamina - curStam);
      this.state.stamina = Math.min(maxStamina, curStam + 100);
      inv.scroll_stamina -= 1;
      this.burnItem('scroll_stamina', 1);
      this.saveState();
      return {
        success: true,
        message: `⚡ 100 Stamina Parşömeni kullanıldı! +${Math.round(actualGain)} Dayanıklılık dolduruldu (${Math.floor(this.state.stamina)}/${maxStamina} ⚡).`
      };
    }

    if (scrollType === 'scroll_repair') {
      return { success: false, message: '🔨 Alet onarım parşömenleri oyundan kaldırılmıştır. Aletlerinizi Demirci aracılığıyla (Odun + Demir + ASTRA) tamir edebilirsiniz.' };
    }

    return { success: false, message: 'Bilinmeyen parşömen türü!' };
  },

  // ── 🎟️ HAFTALIK PİYANGO (v1.25 kuralları: js/economy/lottery.js) ─────────────
  getLotteryRules() {
    const L = GAME_CONFIG.CARNIVAL?.LOTTERY || {};
    return { ticketPrice: this.adaPrice(L.TICKET_COST_ADA || 100), winnerMultiplier: L.WINNER_MULTIPLIER || 2, amortiShare: L.AMORTI_SHARE ?? 0.02 };
  },

  // Tarayıcı sürümünde diğer oyuncular temsili bilet sahipleriyle canlandırılır (sunucuda gerçek oyuncular)
  getLotterySimHolders() {
    if (!Array.isArray(this.state.lotterySimHolders)) {
      const n = GAME_CONFIG.CARNIVAL?.LOTTERY?.LOCAL_SIM_HOLDERS ?? 20;
      this.state.lotterySimHolders = Array.from({ length: n }, (_, i) => ({ id: `sim_${i + 1}`, tickets: 0, paid: 0 }));
    }
    return this.state.lotterySimHolders;
  },

  getLotteryLimits() {
    const L = GAME_CONFIG.CARNIVAL?.LOTTERY || {};
    const epochId = (globalPool && globalPool.state && globalPool.state.epochId) || 1;
    const maxPerWeek = L.MAX_TICKETS_PER_ACCOUNT || 100;
    const boughtThisWeek = this.state.lotteryWeekEpoch === epochId ? (this.state.lotteryBoughtThisWeek || 0) : 0;
    const weekLeft = Math.max(0, maxPerWeek - boughtThisWeek);
    return { epochId, maxPerWeek, boughtThisWeek, weekLeft, canBuy: weekLeft };
  },

  getLotteryStatus() {
    const { maxPerWeek, boughtThisWeek, weekLeft, canBuy } = this.getLotteryLimits();
    const myTickets = this.state.lotteryTickets || 0;
    const others = this.getLotterySimHolders().reduce((s, h) => s + (h.tickets || 0), 0);
    const totalTickets = myTickets + others;
    const paid = this.state.lotteryTicketsPaid != null ? this.state.lotteryTicketsPaid : myTickets * this.getLotteryRules().ticketPrice;
    return {
      myTickets,
      paid,
      potentialPrize: paid * this.getLotteryRules().winnerMultiplier,
      totalTickets,
      chance: lotteryWinChance(myTickets, totalTickets),
      boughtThisWeek,
      maxPerWeek,
      weekLeft,
      canBuy,
      pool: this.state.lotteryPool || 0,
      amortiPool: this.state.lotteryAmortiPool || 0,
      pendingPayout: this.state.lotteryPendingPayout || 0,
      lockedTickets: this.state.lotteryLockedTickets || 0,
      lastResult: this.state.lastLotteryResult || null
    };
  },

  buyLotteryTickets(ticketCount = 1) {
    const count = Math.max(1, parseInt(ticketCount) || 1);
    const lim = this.getLotteryLimits();
    if (this.state.lotteryWeekEpoch !== lim.epochId) {
      this.state.lotteryWeekEpoch = lim.epochId;
      this.state.lotteryBoughtThisWeek = 0;
    }
    const bought = lim.boughtThisWeek;
    if (count > lim.weekLeft) {
      return {
        success: false,
        message: `🚫 Bir hesap haftada en fazla ${lim.maxPerWeek} bilet alabilir. Bu hafta aldığın: ${bought}, alabileceğin: ${lim.weekLeft}.`
      };
    }

    const rules = this.getLotteryRules();
    const { cost, toAmorti, toPool } = splitTicketPayment(count, rules);
    if (this.state.adAstraBalance < cost) {
      return { success: false, message: `Yetersiz ASTRA! ${count} bilet için ${cost} ASTRA gereklidir.` };
    }

    if (this.state.lotteryTicketsPaid == null) this.state.lotteryTicketsPaid = (this.state.lotteryTickets || 0) * rules.ticketPrice;
    this.state.adAstraBalance -= cost;
    this._onAdaSpent(cost);
    this.state.lotteryTickets = (this.state.lotteryTickets || 0) + count;
    this.state.lotteryTicketsPaid += cost;
    this.state.lotteryBoughtThisWeek = bought + count;
    this.state.lotteryAmortiPool = (this.state.lotteryAmortiPool || 0) + toAmorti;
    this.state.lotteryPool = (this.state.lotteryPool || 0) + toPool;

    sound.playHarvest();
    this.saveState();

    return {
      success: true,
      ticketCount: count,
      totalTickets: this.state.lotteryTickets,
      lotteryPool: this.state.lotteryPool,
      lotteryAmortiPool: this.state.lotteryAmortiPool,
      amortiAdded: toAmorti,
      message: `🎟️ ${count} bilet alındı (${cost.toLocaleString('tr-TR')} ASTRA). Elindeki bilet: ${this.state.lotteryTickets} · Kazanırsan: ${(this.state.lotteryTicketsPaid * rules.winnerMultiplier).toLocaleString('tr-TR')} ASTRA`
    };
  },

  // 🗓️ v1.25: Haftalık piyango çekilişi takvime bağlıdır. Yeni haftaya (Pazartesi 00:01 TSİ) geçildiğinde
  // geçen haftanın çekilişi bir kez, kendiliğinden yapılır. Oyuncu çekilişi istediği an tetikleyemez.
  processScheduledLottery() {
    const epochId = (globalPool && globalPool.state && globalPool.state.epochId) || 1;
    if (this.state.lastLotteryDrawEpoch == null) {
      this.state.lastLotteryDrawEpoch = epochId;
      return null;
    }
    if (epochId <= this.state.lastLotteryDrawEpoch) return null;
    this.state.lastLotteryDrawEpoch = epochId;
    const res = this.drawWeeklyLottery({ scheduled: true });
    if (!res || !res.drawn) { this.saveState(); return null; }
    this.state.lastLotteryResult = { at: Date.now(), userWon: res.userWon, wonAmount: res.wonAmount, amorti: res.amortiAmount || 0, poolDepleted: !!res.poolDepleted, epochId };
    if (res.userWon || res.amortiAmount > 0 || res.userTicketsBefore > 0) this.pushNotice(res.message, res.userWon ? 'success' : 'info');
    this.saveState();
    return res;
  },

  // Temsili diğer oyuncular her hafta bilet alır (yalnızca tarayıcı sürümünde; sunucuda gerçek alımlar)
  simulateOtherLotteryBuyers() {
    const rules = this.getLotteryRules();
    const perWeek = GAME_CONFIG.CARNIVAL?.LOTTERY?.LOCAL_SIM_TICKETS_PER_WEEK ?? 20;
    for (const h of this.getLotterySimHolders()) {
      const n = Math.max(0, Math.round(perWeek * (0.5 + Math.random())));
      if (n <= 0) continue;
      const split = splitTicketPayment(n, rules);
      h.tickets += n;
      h.paid += split.cost;
      this.state.lotteryPool = (this.state.lotteryPool || 0) + split.toPool;
      this.state.lotteryAmortiPool = (this.state.lotteryAmortiPool || 0) + split.toAmorti;
    }
  },

  // Haftalık çekiliş: tek kazanan, kazanan ödediğinin 2 katını alır; kasa yetmezse amorti dağıtılır
  drawWeeklyLottery({ scheduled = false } = {}) {
    const rules = this.getLotteryRules();
    this.simulateOtherLotteryBuyers();
    const myTickets = this.state.lotteryTickets || 0;
    const myPaid = this.state.lotteryTicketsPaid != null ? this.state.lotteryTicketsPaid : myTickets * rules.ticketPrice;
    const holders = [{ id: 'me', tickets: myTickets, paid: myPaid }, ...this.getLotterySimHolders()];
    const result = runDraw({ pool: this.state.lotteryPool || 0, amortiPool: this.state.lotteryAmortiPool || 0, holders }, Math.random, rules);
    if (!result.drawn) return { drawn: false };

    this.state.lotteryPool = result.pool;
    this.state.lotteryAmortiPool = result.amortiPool;
    const meAfter = result.holders.find(h => h.id === 'me');
    this.state.lotterySimHolders = result.holders.filter(h => h.id !== 'me');

    const myPrize = result.payouts.find(p => p.id === 'me' && p.kind === 'prize');
    const myAmorti = result.payouts.find(p => p.id === 'me' && p.kind === 'amorti');
    let wonAmount = 0;
    let amortiAmount = 0;
    if (myPrize) {
      wonAmount = myPrize.amount;
      this.state.lotteryPendingPayout = (this.state.lotteryPendingPayout || 0) + wonAmount;
      // Kazanan biletler ödül çekilirken yanar; o zamana kadar kilitli (sonraki çekilişlere girmez)
      this.state.lotteryLockedTickets = (this.state.lotteryLockedTickets || 0) + (myPrize.ticketsLocked || 0);
      sound.playLevelUp();
    }
    if (myAmorti) {
      amortiAmount = myAmorti.amount;
      this.state.lotteryPendingPayout = (this.state.lotteryPendingPayout || 0) + amortiAmount;
    }
    this.state.lotteryTickets = meAfter ? meAfter.tickets : 0;
    this.state.lotteryTicketsPaid = meAfter ? meAfter.paid : 0;
    if (!scheduled) this.saveState();

    const userWon = !!myPrize;
    let message;
    if (userWon) {
      message = result.poolDepleted
        ? `👑 Piyango sana çıktı! Kasada kalan ${wonAmount.toLocaleString('tr-TR')} ASTRA'nın tamamı senin. Karnaval → Piyango'dan çek; biletlerin çekerken yanar.`
        : `👑 Piyango sana çıktı! Biletlerine ödediğinin 2 katı: ${wonAmount.toLocaleString('tr-TR')} ASTRA. Karnaval → Piyango'dan çek; biletlerin çekerken yanar.`;
    } else if (result.poolDepleted) {
      message = `🎲 Piyango kasası bitti: kalan tüm biletlere amorti dağıtıldı${amortiAmount > 0 ? ` (sana +${amortiAmount.toLocaleString('tr-TR')} ASTRA)` : ''}. Biletler kapandı, piyango yeni satışlarla yeniden dolacak.`;
    } else {
      message = myTickets > 0
        ? `🎲 Haftalık çekiliş yapıldı, bu hafta sana çıkmadı. ${myTickets} biletin yanmadı, sonraki haftaya devretti.`
        : '🎲 Haftalık çekiliş yapıldı.';
    }

    return {
      drawn: true,
      userWon,
      wonAmount,
      amortiAmount,
      poolDepleted: result.poolDepleted,
      winnerId: result.winnerId,
      totalTickets: result.totalTickets,
      userTicketsBefore: myTickets,
      userTicketsRemaining: this.state.lotteryTickets,
      rolloverPool: this.state.lotteryPool,
      message
    };
  },

  // v1.25: Amorti yalnızca piyango kasası bittiğinde, kalan tüm biletlere eşit dağıtılır (elle bilet yakıp amorti alma yok).
  // Biletini erken kullanmak isteyen, çarkta 1 bilet = 1 çevirme olarak yakabilir.
  burnLotteryTicketsForAmorti() {
    return { success: false, message: 'Amorti, piyango kasası bittiğinde kalan tüm biletlere otomatik dağıtılır. Biletini beklemek istemezsen çarkta 1 bilet = 1 çevirme olarak kullanabilirsin.' };
  },

  // 👑 KAZANAN BİLETİN ÖDÜLÜNÜ ÇEK
  // v1.25: Yalnızca haftalık çekilişte gerçekten kazanılmış (kasadan ayrılmış) tutar ödenir.
  // Eski sürüm, çekiliş kazanılmamış olsa bile bileti olan herkese bilet bedelinin 2 katını ödüyordu
  // (100 bilet al → 10.000 öde → 20.000 çek; sonsuz para açığı).
  claimWinnerLotteryPayout() {
    const pending = Number(this.state.lotteryPendingPayout) || 0;
    if (pending <= 0) {
      return { success: false, message: 'Çekilecek bir piyango kazancın yok. Çekiliş her Pazartesi 00:01 (TSİ) kendiliğinden yapılır; biletlerin yanmaz, kazanana kadar sonraki haftaya devreder.' };
    }
    const burned = this.state.lotteryLockedTickets || 0;
    this.state.lotteryPendingPayout = 0;
    this.state.lotteryLockedTickets = 0; // kazanan biletler ödül çekilirken yanar
    this.state.adAstraBalance = (this.state.adAstraBalance || 0) + pending;
    this._onAdaEarned(pending);
    sound.playLevelUp();
    this.saveState();
    return {
      success: true,
      payoutAda: pending,
      burnedTickets: burned,
      remainingPool: this.state.lotteryPool,
      message: `🏆 Piyango kazancın (+${pending.toLocaleString('tr-TR')} ASTRA) cüzdanına aktarıldı!${burned > 0 ? ` Kazanan ${burned} bilet yandı.` : ''}`
    };
  },

  useLotteryTicketForWheel() {
    return this.spinCarnivalWheel('ticket');
  },
};
