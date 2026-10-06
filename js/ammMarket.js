// Realm of AdAstra — AMM Swap Motoru (x · y = k)
// ============================================================================
// AMM DEX Dinamik Havuz Mimarisi:
//  • Rezervler AMM_CORRIDORS hedef fiyatlarından türetilir (YASA 3: kıt olan pahalıdır).
//  • Derinlik, haftalık küresel kotanın fiyatı ~%7 hareket ettireceği şekilde seçilir.
//  • %2.00 Market Harcı alınır: %86 Hazine, %5 Kalıcı Yakım, %6 UBI, %3 Telif.
//  • %2.00 Hammadde Yakımı alınır: Alınan/satılan kaynaktan anında yakılıp total arzdan silinir.
//  • Fiyat koridoru UYGULANIR: taban altına inen satış reddedilir, tavan aşımı engellenir.
// ============================================================================

import { GAME_CONFIG } from './config.js';
import { globalPool } from './globalPool.js';
import { treasury } from './treasury.js';
import { readJSON, writeJSON, removeJSON } from './storage.js';

// 🏛️ Lansman / Genesis Değişmez Başlangıç Fiyatları (Tüm düşüşler buna göre hesaplanır)
export const GENESIS_PRICES = {
  wheat: 0.90,       // 🌾 Buğday
  iron: 4.00,        // ⛏️ Demir
  wood: 2.50,        // 🌲 Odun
  fragments: 45.00,  // 🧩 Teçhizat Parçası
  keys: 1000.0,      // 🔑 Arena Anahtarı
  boxes: 10000.0     // 📦 Pandora Kutusu
};

// ⚖️ Hazine Dağıtım Öncelik Ağırlıkları (Ana hammadde üçlüsüne %75 aslan payı)
export const BUYBACK_ASSET_WEIGHTS = {
  wheat: 0.30,       // %30 Aslan Payı (Stamina & Can tüketimi)
  iron: 0.25,        // %25 Ağır Sanayi (Teçhizat & Tamirat)
  wood: 0.20,        // %20 Temel Hammadde (İnşaat & Aletler)
  fragments: 0.10,   // %10 Teçhizat Parçaları
  keys: 0.08,        // %8 Arena Anahtarları
  boxes: 0.07        // %7 Pandora Kutuları
};

// Haftalık küresel kotanın fiyatı ne kadar hareket ettireceği
const TARGET_PRICE_IMPACT = 0.07;

// %2 hammadde yakımı yalnızca ham maddelerde (odun, demir, buğday) uygulanır.
// Parça, anahtar, kutu gibi tekil eşyalar bölünemediği için yakılmaz.
const RAW_RESOURCES = ['wood', 'iron', 'wheat'];
function resourceBurnRateOf(key) {
  if (!RAW_RESOURCES.includes(key)) return 0;
  const r = GAME_CONFIG.AMM_RESOURCE_FEE_RATE ?? GAME_CONFIG.AMM_FEE_RATE ?? 0.02;
  return Math.max(0, Math.min(0.5, r));
}

// Kota bilgisi olmayan varlıklar için varsayılan haftalık arz tahmini
const WEEKLY_SUPPLY_FALLBACK = {
  fragments: 9000,
  boxes: 15,
  keys: 50,
  scroll_heal: 1500,
  scroll_stamina: 1000
};

function weeklySupplyOf(key) {
  const cap = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[key];
  if (cap) return cap.totalCap;
  return WEEKLY_SUPPLY_FALLBACK[key] || 1000;
}

// v1.25 (kullanıcı kararı): odun, demir ve buğday havuzu = haftalık dünya kotasının 80 katı.
// Böylece kotanın TAMAMI her hafta pazara satılsa bile fiyatın %90 düşmesi ~3,4 yıl sürer;
// oyunda harcanan (tamir, silah dövme/geliştirme, silo, seviye, stamina) kısım bu süreyi uzatır.
// Diğer varlıklar (parça, kutu, anahtar, parşömen) eski kuralla: haftalık arzın fiyatı ~%7 oynatacağı derinlik.
function derivePool(key, meta) {
  const corridor = GAME_CONFIG.AMM_CORRIDORS[key];
  const price = corridor ? corridor.defaultPriceAda : 1;
  const supply = weeklySupplyOf(key);
  const depthWeeks = GAME_CONFIG.AMM_RAW_DEPTH_WEEKS || 80;
  const resourceReserve = RAW_RESOURCES.includes(key)
    ? Math.round(supply * depthWeeks)
    : Math.round(supply * (1 - TARGET_PRICE_IMPACT) / TARGET_PRICE_IMPACT);
  return {
    resourceReserve,
    adAstraReserve: Math.round(resourceReserve * price),
    ...meta
  };
}

function buildDefaultPools() {
  return {
    wheat: derivePool('wheat', { name: 'Buğday', icon: '🌾' }),
    wood: derivePool('wood', { name: 'Odun', icon: '🌲' }),
    iron: derivePool('iron', { name: 'Demir', icon: '⛏️' }),
    fragments: derivePool('fragments', { name: 'Teçhizat Parçaları', icon: '🧩' }),
    boxes: derivePool('boxes', { name: 'Pandora Kutusu', icon: '📦' }),
    keys: derivePool('keys', { name: 'Arena Anahtarı', icon: '🔑' }),
    scroll_heal: derivePool('scroll_heal', { name: 'Ordu İyileştirme Parşömeni', icon: '📜' }),
    scroll_stamina: derivePool('scroll_stamina', { name: '100 Stamina Doldurma Parşömeni', icon: '⚡' })
  };
}

export class AMMMarketEngine {
  constructor() {
    // v10: 40M $ADASTRA Derin AMM Havuzları (10k ADA Pandora Kutusu, 1k ADA Anahtar)
    // v11: hammadde havuzları haftalık kotanın 80 katına derinleştirildi (eski kayıtlar yeniden tohumlanır)
    this.storageKey = 'adastra_amm_pools_v11';
    this.listeners = [];
    this.pools = this.loadPools();
    this.feeStats = this.loadFeeStats();
  }

  // ── Canlı Dinamik Fiyat Abonelik ve Bildirim Sistemi ────────────────
  subscribe(fn) {
    if (typeof fn === 'function') {
      if (!this.listeners) this.listeners = [];
      this.listeners.push(fn);
    }
    return () => {
      if (this.listeners) {
        this.listeners = this.listeners.filter(l => l !== fn);
      }
    };
  }

  notifyPriceChange() {
    if (!this.listeners || this.listeners.length === 0) return;
    if (typeof gameState !== 'undefined' && gameState._isFastForwarding) return;
    const prices = this.getAllPrices();
    this.listeners.forEach(fn => {
      try { fn(prices); } catch (e) { console.error('AMM Price listener error:', e); }
    });
  }

  getAllPrices() {
    const prices = {};
    for (const key of Object.keys(this.pools || {})) {
      prices[key] = this.getPrice(key);
    }
    return prices;
  }

  loadPools() {
    const defaults = buildDefaultPools();
    if (typeof localStorage === 'undefined') return defaults;

    const { data: parsed } = readJSON(this.storageKey);
    if (!parsed) return defaults;
    try {
      const merged = {};
      for (const key of Object.keys(defaults)) {
        merged[key] = parsed[key] && parsed[key].resourceReserve > 0
          ? { ...defaults[key], ...parsed[key] }
          : defaults[key];
      }
      return merged;
    } catch (e) {
      console.error('AMM Pool load error, reseeding:', e);
      return defaults;
    }
  }

  loadFeeStats() {
    if (typeof localStorage === 'undefined') return { collected: 0, burned: 0, burnedResources: { wood: 0, iron: 0, wheat: 0 } };
    try {
      const data = readJSON(this.storageKey + '_fees').data || { collected: 0, burned: 0 };
      if (!data.burnedResources) data.burnedResources = { wood: 0, iron: 0, wheat: 0 };
      return data;
    } catch (_) {
      return { collected: 0, burned: 0, burnedResources: { wood: 0, iron: 0, wheat: 0 } };
    }
  }

  getBurnedResources() {
    if (!this.feeStats) this.feeStats = this.loadFeeStats();
    if (!this.feeStats.burnedResources) this.feeStats.burnedResources = { wood: 0, iron: 0, wheat: 0 };
    return {
      wood: Math.round((this.feeStats.burnedResources.wood || 0) * 10) / 10,
      iron: Math.round((this.feeStats.burnedResources.iron || 0) * 10) / 10,
      wheat: Math.round((this.feeStats.burnedResources.wheat || 0) * 10) / 10
    };
  }

  savePools() {
    if (typeof localStorage === 'undefined') return;
    if (typeof gameState !== 'undefined' && gameState._isFastForwarding) return;
    writeJSON(this.storageKey, this.pools);
    writeJSON(this.storageKey + '_fees', this.feeStats);
    this.notifyPriceChange();
  }

  // 🏛️ AMM DEX Havuzlarını İlk 40M $ADASTRA Tohum Dağıtımına Sıfırla
  resetPools() {
    if (typeof localStorage !== 'undefined') {
      removeJSON(this.storageKey);
      removeJSON(this.storageKey + '_fees');
    }
    this.pools = buildDefaultPools();
    this.feeStats = { collected: 0, burned: 0, burnedResources: { wood: 0, iron: 0, wheat: 0 } };
    this.savePools();
    return this.pools;
  }

  // AMM DEX Toplam $ADASTRA Likidite Rezervi
  getTotalAdAstraLiquidity() {
    let total = 0;
    for (const pool of Object.values(this.pools || {})) {
      total += (pool.adAstraReserve || 0);
    }
    return Math.round(total);
  }

  // ── Fiyatlandırma ───────────────────────────────────────────────────
  getPrice(resourceKey) {
    const pool = this.pools[resourceKey];
    if (!pool || pool.resourceReserve <= 0) return 0;
    return pool.adAstraReserve / pool.resourceReserve;
  }

  getCorridor(resourceKey) {
    return GAME_CONFIG.AMM_CORRIDORS[resourceKey] || null;
  }

  // Fiyatın koridor içindeki konumu: 0 = taban, 1 = tavan
  getCorridorPosition(resourceKey) {
    const c = this.getCorridor(resourceKey);
    if (!c) return 0.5;
    const p = this.getPrice(resourceKey);
    return Math.max(0, Math.min(1, (p - c.minPriceAda) / (c.maxPriceAda - c.minPriceAda)));
  }

  getResourceBurnRate(resourceKey) {
    return resourceBurnRateOf(resourceKey);
  }

  // Satışta havuza giren net miktar: %2'si yakılır, kalanı havuza girer
  getNetSellIntoPool(resourceKey, resourceAmount) {
    return resourceAmount * (1 - resourceBurnRateOf(resourceKey));
  }

  // Alışta havuzdan çıkan brüt miktar: alıcıya istediği kadar teslim edilir, işlem miktarının %2'si
  // ayrıca havuzdan çekilip yakılır (1.000 demir alana tam 20 demir yakım).
  getGrossOutForBuy(resourceKey, resourceAmount) {
    return resourceAmount * (1 + resourceBurnRateOf(resourceKey));
  }

  // dx hammadde sat → dy ADA al  (ücret ve %2 yakım düşülmüş net)
  getEstimatedAdAstraForSell(resourceKey, resourceAmount) {
    const pool = this.pools[resourceKey];
    if (!pool || resourceAmount <= 0) return 0;
    const netIn = this.getNetSellIntoPool(resourceKey, resourceAmount);
    const gross = (pool.adAstraReserve * netIn) / (pool.resourceReserve + netIn);
    return gross * (1 - GAME_CONFIG.AMM_FEE_RATE);
  }

  // Koridor tabanına inmeden tek seferde satılabilecek en fazla miktar.
  // Satış sonrası fiyat = A·R / (R + x)²  →  x ≤ √(A·R / taban) − R
  getMaxSellBeforeFloor(resourceKey) {
    const pool = this.pools[resourceKey];
    const corridor = this.getCorridor(resourceKey);
    if (!pool) return 0;
    if (!corridor || !(corridor.minPriceAda > 0)) return Infinity;
    const A = pool.adAstraReserve;
    const R = pool.resourceReserve;
    const maxNetIn = Math.sqrt((A * R) / corridor.minPriceAda) - R;
    if (!(maxNetIn > 0)) return 0;
    return Math.floor(maxNetIn / (1 - resourceBurnRateOf(resourceKey)));
  }

  // dx hammadde al → dy ADA öde  (ücret eklenmiş brüt; %2 yakım havuzdan fazladan çıkar)
  getEstimatedCostForBuy(resourceKey, resourceAmount) {
    const pool = this.pools[resourceKey];
    if (!pool || resourceAmount <= 0) return 0;
    const grossOut = this.getGrossOutForBuy(resourceKey, resourceAmount);
    if (grossOut >= pool.resourceReserve) return Infinity;
    const net = (pool.adAstraReserve * grossOut) / (pool.resourceReserve - grossOut);
    return net * (1 + GAME_CONFIG.AMM_FEE_RATE);
  }

  getEstimatedResourceForBuy(resourceKey, adAstraAmount) {
    const pool = this.pools[resourceKey];
    if (!pool || adAstraAmount <= 0) return 0;
    const net = adAstraAmount / (1 + GAME_CONFIG.AMM_FEE_RATE);
    return (pool.resourceReserve * net) / (pool.adAstraReserve + net);
  }

  // İstenen kaynak paketinin (odun, demir, buğday vb.) AMM DEX pazarındaki anlık toplam $ADASTRA değeri
  calculateResourcesAdAstraValue(resources = {}) {
    let totalAda = 0;
    const breakdown = {};
    for (const [key, amount] of Object.entries(resources)) {
      const numAmount = Math.max(0, Number(amount) || 0);
      if (numAmount <= 0) {
        breakdown[key] = 0;
        continue;
      }
      let adaVal = 0;
      if (this.pools && this.pools[key] && this.pools[key].resourceReserve > 0) {
        adaVal = this.getEstimatedAdAstraForSell(key, numAmount);
        if (!adaVal || isNaN(adaVal) || adaVal <= 0) {
          adaVal = numAmount * (this.getPrice(key) || 1.0);
        }
      } else {
        const corridor = this.getCorridor ? this.getCorridor(key) : null;
        const fallbackPrice = corridor ? corridor.defaultPriceAda : 1.0;
        adaVal = numAmount * fallbackPrice;
      }
      breakdown[key] = Math.round(adaVal * 100) / 100;
      totalAda += adaVal;
    }
    return {
      totalAda: Math.max(1, Math.round(totalAda)),
      breakdown
    };
  }

  // İşlem sonrası fiyat ne olur? (koridor kontrolü için)
  previewPriceAfterSell(resourceKey, amount) {
    const p = this.pools[resourceKey];
    if (!p) return 0;
    const netIn = this.getNetSellIntoPool(resourceKey, amount);
    const gross = (p.adAstraReserve * netIn) / (p.resourceReserve + netIn);
    return (p.adAstraReserve - gross) / (p.resourceReserve + netIn);
  }

  previewPriceAfterBuy(resourceKey, amount) {
    const p = this.pools[resourceKey];
    const grossOut = this.getGrossOutForBuy(resourceKey, amount);
    if (!p || grossOut >= p.resourceReserve) return Infinity;
    const cost = (p.adAstraReserve * grossOut) / (p.resourceReserve - grossOut);
    return (p.adAstraReserve + cost) / (p.resourceReserve - grossOut);
  }

  _recordResourceBurnFee(resourceKey, qty) {
    if (!(qty > 0)) return;
    if (!this.feeStats.burnedResources) this.feeStats.burnedResources = { wood: 0, iron: 0, wheat: 0 };
    this.feeStats.burnedResources[resourceKey] = (this.feeStats.burnedResources[resourceKey] || 0) + qty;
    if (typeof globalPool !== 'undefined' && typeof globalPool.recordResourceBurn === 'function') {
      globalPool.recordResourceBurn(resourceKey, qty);
    }
  }

  // ── İşlemler ────────────────────────────────────────────────────────
  executeSell(resourceKey, resourceAmount) {
    const pool = this.pools[resourceKey];
    if (!pool || !(resourceAmount > 0)) return { success: false, message: 'Geçersiz miktar!' };

    // 🛡️ Taban fiyat koruması: satış fiyatı koridor tabanının altına itemez
    const corridor = this.getCorridor(resourceKey);
    if (corridor && corridor.minPriceAda > 0) {
      const maxSellable = this.getMaxSellBeforeFloor(resourceKey);
      if (resourceAmount > maxSellable) {
        return {
          success: false,
          floorBlocked: true,
          maxSellable,
          message: maxSellable > 0
            ? `⛔ Bu satış ${pool.name} fiyatını taban fiyatın (${corridor.minPriceAda} ADA) altına düşürür. Şu an en fazla ${maxSellable.toLocaleString('tr-TR')} adet satabilirsin.`
            : `⛔ ${pool.name} fiyatı taban seviyede (${corridor.minPriceAda} ADA). Hazine geri alımı fiyatı toparlayana kadar satış yapılamaz.`
        };
      }
    }

    // 🔥 %2 Hammadde Yakımı: satılan malzemenin %2'si havuza hiç girmez, kalıcı olarak silinir
    const netIn = this.getNetSellIntoPool(resourceKey, resourceAmount);
    const resourceBurnFee = resourceAmount - netIn;

    const gross = (pool.adAstraReserve * netIn) / (pool.resourceReserve + netIn);
    const fee = gross * GAME_CONFIG.AMM_FEE_RATE;
    const net = gross - fee;
    if (!(net > 0)) return { success: false, message: 'Kazanç hesaplanamadı!' };

    this._recordResourceBurnFee(resourceKey, resourceBurnFee);

    // Havuz: net hammadde girer, brüt ADA çıkar
    pool.resourceReserve += netIn;
    pool.adAstraReserve -= gross;

    // %2 Market Komisyonu: Doğrudan Ekosistem Token Harcama & Hazine Dağıtım Motoruna aktarılır:
    // (%86 Hazine 6 Ödül Kasası + %5 Kalıcı Yakım + %6 UBI Temel Gelir + %3 Yapımcı)
    let spendResult = null;
    if (fee > 0 && typeof globalPool !== 'undefined' && typeof globalPool.recordTokenSpend === 'function') {
      spendResult = globalPool.recordTokenSpend(fee);
    }

    const burned = spendResult ? spendResult.burned : (fee * (GAME_CONFIG.TOKEN_BURN_RATE ?? 0.05));
    this.feeStats.collected += fee;
    this.feeStats.burned += burned;
    this.savePools();

    return {
      success: true,
      adAstraReceived: net,
      gross,
      fee,
      burned,
      resourceBurnFee,
      newPrice: this.getPrice(resourceKey),
      resourceName: pool.name,
      icon: pool.icon
    };
  }

  executeBuyAmount(resourceKey, resourceAmount) {
    const pool = this.pools[resourceKey];
    if (!pool || !(resourceAmount > 0)) return { success: false, message: 'Geçersiz miktar!' };

    // Alıcı istediği miktarın tamamını alır; %2 yakım için havuzdan biraz fazlası çıkar
    const grossOut = this.getGrossOutForBuy(resourceKey, resourceAmount);
    if (grossOut >= pool.resourceReserve * 0.5) {
      return { success: false, message: `Tek işlemde havuzun yarısından fazlası alınamaz! (Havuz: ${Math.floor(pool.resourceReserve)} ${pool.name})` };
    }

    const corridor = this.getCorridor(resourceKey);
    const priceAfter = this.previewPriceAfterBuy(resourceKey, resourceAmount);
    if (corridor && priceAfter > corridor.maxPriceAda) {
      return {
        success: false,
        message: `⛔ Bu alım ${pool.name} fiyatını koridor tavanının (${corridor.maxPriceAda} ADA) üstüne çıkarır. Daha küçük bir miktar dene — piyasa tavan koruması devrede.`,
        corridorBlocked: true
      };
    }

    const net = (pool.adAstraReserve * grossOut) / (pool.resourceReserve - grossOut);
    const fee = net * GAME_CONFIG.AMM_FEE_RATE;
    const cost = net + fee;
    if (!isFinite(cost) || cost <= 0) return { success: false, message: 'Maliyet hesaplanamadı!' };

    // 🔥 %2 Hammadde Yakımı: havuzdan çıkan fazlalık alıcıya ulaşmadan kalıcı olarak silinir
    const resourceBurnFee = grossOut - resourceAmount;
    this._recordResourceBurnFee(resourceKey, resourceBurnFee);

    pool.adAstraReserve += net;
    pool.resourceReserve -= grossOut;

    // %2 Market Komisyonu: Doğrudan Ekosistem Token Harcama & Hazine Dağıtım Motoruna aktarılır
    let spendResult = null;
    if (fee > 0 && typeof globalPool !== 'undefined' && typeof globalPool.recordTokenSpend === 'function') {
      spendResult = globalPool.recordTokenSpend(fee);
    }

    const burned = spendResult ? spendResult.burned : (fee * (GAME_CONFIG.TOKEN_BURN_RATE ?? 0.05));
    this.feeStats.collected += fee;
    this.feeStats.burned += burned;
    this.savePools();

    return {
      success: true,
      cost,
      netCost: net,
      fee,
      burned,
      resourceBurnFee,
      resourceReceived: resourceAmount,
      newPrice: this.getPrice(resourceKey),
      resourceName: pool.name,
      icon: pool.icon
    };
  }

  // ── Hazine destekli buyback ─────────────────────────────────────────
  // Fiyat koridor tabanına yaklaştığında hazine havuzun ADA tarafını besler.
  // Bu, balinaların çekildiği dönemde F2P satış baskısının havuzu kurutmasını
  // engelleyen denge valfidir.
  injectBuyback(resourceKey, adaAmount) {
    const pool = this.pools[resourceKey];
    if (!pool || adaAmount <= 0) return 0;
    pool.adAstraReserve += adaAmount;
    this.savePools();
    return adaAmount;
  }

  // Hangi havuzlar desteğe muhtaç?
  getPoolsNeedingSupport(threshold = 0.18) {
    return Object.keys(this.pools)
      .filter(k => this.getCorridor(k) && this.getCorridorPosition(k) < threshold)
      .map(k => ({ key: k, name: this.pools[k].name, position: this.getCorridorPosition(k), price: this.getPrice(k) }));
  }

  getMarketSummary() {
    return Object.keys(this.pools).map(key => {
      const pool = this.pools[key];
      const corridor = this.getCorridor(key);
      return {
        key,
        name: pool.name,
        icon: pool.icon,
        price: this.getPrice(key),
        resourceReserve: pool.resourceReserve,
        adAstraReserve: pool.adAstraReserve,
        corridor,
        corridorPosition: this.getCorridorPosition(key),
        tvlAda: pool.adAstraReserve * 2
      };
    });
  }

  // ── 6 Varlıklı Dinamik Buyback & Burn Analiz Raporu ───────────────────
  // Düşüşler değişmez Genesis Başlangıç Fiyatlarına ($P_{genesis}$) göre hesaplanır.
  // Ağırlık %75 ana hammadde üçlüsüne (Buğday %30, Demir %25, Odun %20), %25 diğerlerine verilir.
  getBuybackAnalysis(cycleBudgetCap = 0.10) {
    const availableTreasury = (typeof treasury !== 'undefined' && treasury.getPool)
      ? (treasury.getPool('ammBuyback') || 0)
      : 6000000;

    const maxCycleFund = availableTreasury * cycleBudgetCap;
    const assets = ['wheat', 'iron', 'wood', 'fragments', 'keys', 'boxes'];
    const details = [];
    let totalScore = 0;
    let maxUrgency = 0;

    for (const key of assets) {
      const pool = this.pools[key];
      if (!pool) continue;
      const curPrice = this.getPrice(key);
      const genPrice = GENESIS_PRICES[key] || 1.0;
      // Düşüş oranı: sadece başlangıç fiyatının altına indiğinde devreye girer
      const dropRatio = Math.max(0, (genPrice - curPrice) / genPrice);
      // Kuvvet Yasası: %10 düşüşte binde 3, %90 düşüşte %76.8 harcama yoğunluğu
      const urgency = Math.pow(dropRatio, 2.5);
      const weight = BUYBACK_ASSET_WEIGHTS[key] || 0.1;
      const score = weight * urgency;

      totalScore += score;
      if (urgency > maxUrgency) maxUrgency = urgency;

      details.push({
        key,
        name: pool.name,
        icon: pool.icon,
        currentPrice: curPrice,
        genesisPrice: genPrice,
        dropRatio,
        dropPct: Math.round(dropRatio * 1000) / 10,
        urgency,
        weight,
        score
      });
    }

    // Toplam harcanacak bütçe: krizin aciliyetiyle dinamik ölçeklenir
    const totalFundToSpend = totalScore > 0 ? (maxCycleFund * maxUrgency) : 0;

    // Her varlığa düşen pay ve tahmini yakılacak fiziksel adet
    for (const d of details) {
      const share = totalScore > 0 ? (d.score / totalScore) : 0;
      const budget = totalFundToSpend * share;
      let estUnits = 0;
      if (budget > 0 && this.pools[d.key]) {
        estUnits = this.getEstimatedResourceForBuy(d.key, budget);
      }
      d.sharePct = Math.round(share * 1000) / 10;
      d.allocatedBudget = Math.round(budget * 100) / 100;
      d.estimatedUnitsToBurn = Math.round(estUnits * 10) / 10;
    }

    return {
      availableTreasury: Math.round(availableTreasury),
      cycleBudgetCap,
      maxCycleFund: Math.round(maxCycleFund),
      maxUrgency: Math.round(maxUrgency * 10000) / 10000,
      totalFundToSpend: Math.round(totalFundToSpend * 100) / 100,
      assets: details
    };
  }

  // ── Otonom Buyback & Burn Yürütücü (Döngü Başına) ───────────────────
  executeAutonomousBuyback(cycleBudgetCap = 0.10) {
    const analysis = this.getBuybackAnalysis(cycleBudgetCap);
    if (!analysis.totalFundToSpend || analysis.totalFundToSpend <= 1) {
      return {
        success: false,
        executed: false,
        message: 'Tüm varlıklar başlangıç fiyatında veya üzerinde, hazine müdahalesine gerek yok.',
        analysis
      };
    }

    const availableTreasury = (typeof treasury !== 'undefined' && treasury.getPool)
      ? (treasury.getPool('ammBuyback') || 0)
      : 0;

    if (availableTreasury < analysis.totalFundToSpend) {
      return {
        success: false,
        executed: false,
        message: 'Hazine AMM kasasında yeterli bakiye bulunmuyor.',
        analysis
      };
    }

    const reportItems = [];
    let totalActualSpent = 0;
    let totalUnitsBurned = 0;

    for (const item of analysis.assets) {
      if (item.allocatedBudget <= 0) continue;
      const pool = this.pools[item.key];
      if (!pool) continue;

      const budget = item.allocatedBudget;
      const oldPrice = this.getPrice(item.key);

      // Hazineden fon tahsis edilir (treasury.drawBuyback doğrudan sayı döndürür)
      let withdrawn = budget;
      if (typeof treasury !== 'undefined') {
        if (typeof treasury.drawBuyback === 'function') {
          withdrawn = treasury.drawBuyback(budget);
        } else if (typeof treasury.withdraw === 'function') {
          const wRes = treasury.withdraw('ammBuyback', budget);
          withdrawn = typeof wRes === 'object' && wRes ? (wRes.granted || 0) : Number(wRes) || 0;
        }
      }
      if (withdrawn <= 0) continue;

      // AMM Havuzundan satın alınır ($x \cdot y = k$). Hazine kendi kendine komisyon ödemez:
      // çekilen ADA'nın tamamı havuza girer (eski sürümde %2'lik kısım hiçbir yere gitmeden kayboluyordu).
      const net = withdrawn;
      const unitsToBuy = (pool.resourceReserve * net) / (pool.adAstraReserve + net);

      pool.adAstraReserve += net;
      pool.resourceReserve -= unitsToBuy;

      // 🔥 Kalıcı Yakım (Burn): tek bir kez sayılır. Eski sürüm aynı yakımı hem küresel
      // sayaca hem de oyuncunun kişisel yakım sayacına ikinci kez yazıyordu.
      if (!this.feeStats.burnedResources) this.feeStats.burnedResources = {};
      this.feeStats.burnedResources[item.key] = (this.feeStats.burnedResources[item.key] || 0) + unitsToBuy;

      if (typeof globalPool !== 'undefined' && globalPool && typeof globalPool.recordResourceBurn === 'function') {
        globalPool.recordResourceBurn(item.key, unitsToBuy);
      }

      totalActualSpent += withdrawn;
      totalUnitsBurned += unitsToBuy;

      reportItems.push({
        key: item.key,
        name: item.name,
        icon: item.icon,
        budgetSpent: Math.round(withdrawn * 100) / 100,
        unitsBurned: Math.round(unitsToBuy * 10) / 10,
        oldPrice: Math.round(oldPrice * 1000) / 1000,
        newPrice: Math.round(this.getPrice(item.key) * 1000) / 1000,
        dropPct: item.dropPct
      });
    }

    this.savePools();

    const report = {
      timestamp: Date.now(),
      totalSpent: Math.round(totalActualSpent * 100) / 100,
      totalUnitsBurned: Math.round(totalUnitsBurned * 10) / 10,
      remainingTreasury: (typeof treasury !== 'undefined' && treasury.getPool) ? Math.round(treasury.getPool('ammBuyback')) : 0,
      items: reportItems
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey + '_last_buyback', JSON.stringify(report));
    }
    this.lastBuybackReport = report;

    return {
      success: true,
      executed: true,
      message: `🎯 Otonom Buyback & Yakım Tamamlandı: ${report.totalSpent.toLocaleString('tr-TR')} ADA ile piyasadan malzemeler alınıp kalıcı olarak yakıldı!`,
      report
    };
  }

  getLastBuybackReport() {
    if (this.lastBuybackReport) return this.lastBuybackReport;
    if (typeof localStorage === 'undefined') return null;
    try {
      return JSON.parse(localStorage.getItem(this.storageKey + '_last_buyback')) || null;
    } catch (_) {
      return null;
    }
  }
}

export const ammMarket = new AMMMarketEngine();
