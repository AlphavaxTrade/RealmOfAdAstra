// Realm of AdAstra — Pazar Motoru (sabit çarpım havuzu: x · y = k)
// ============================================================================
// Her varlığın (6 hammadde, teçhizat parçası, Pandora kutusu, anahtar, parşömenler)
// bir havuzu vardır: bir yanda mal, bir yanda ASTRA. Fiyat = ASTRA ÷ mal.
//
//  • Havuz derinliği tohumdan gelir (AMM_SEED_ASTRA); mal tarafı = ASTRA ÷ açılış fiyatı.
//  • Her işlemde %AMM_FEE_RATE komisyon alınır; globalPool.recordTokenSpend() ile
//    yakım / UBI / telif / hazine olarak bölünür.
//  • Hammaddede ayrıca işlem miktarının %2'si havuza girmeden kalıcı yakılır.
//  • Fiyat koridoru uygulanır: taban altına indiren satış ve tavan üstüne çıkaran alım reddedilir.
//  • Tek işlemde havuzdaki malın en çok %AMM_SINGLE_TRADE_SHARE'i alınıp satılabilir.
//  • Geri alım: fiyat açılışın TRIGGER_DROP kadar altına inen varlıkları hazine kasasından alıp yakar.
// ============================================================================

import { GAME_CONFIG } from './config.js';
import { globalPool } from './globalPool.js';
import { treasury } from './treasury.js';
import { readJSON, writeJSON, removeJSON } from './storage.js';
import { kaydet as gecmiseKaydet, temizle as gecmisiTemizle, aralikSerisi, aralikMs, ozet as gecmisOzeti } from './economy/fiyatGecmisi.js';

const HAMMADDELER = GAME_CONFIG.RESOURCE_KEYS;
const META = GAME_CONFIG.RESOURCE_META || {};
const sifirHammadde = () => Object.fromEntries(HAMMADDELER.map(k => [k, 0]));
const koridorlar = () => GAME_CONFIG.AMM_CORRIDORS;

// Lansman fiyatları: düşüşler hep buna göre ölçülür
export const GENESIS_PRICES = Object.fromEntries(
  Object.entries(koridorlar()).map(([k, c]) => [k, c.defaultPriceAda])
);

// Geri alım öncelik ağırlıkları: hammaddeler üretim değerine göre %75, teçhizat parçası %25
const uretimDegeri = k => ((GAME_CONFIG.BASE_PRODUCTION || {})[k] || 1) * ((koridorlar()[k] || {}).defaultPriceAda || 1);
export const BUYBACK_ASSET_WEIGHTS = (() => {
  const toplam = HAMMADDELER.reduce((t, k) => t + uretimDegeri(k), 0) || 1;
  const w = {};
  for (const k of HAMMADDELER) w[k] = 0.75 * uretimDegeri(k) / toplam;
  w.fragments = 0.25;
  return w;
})();

// ─────────────────────────────────────────────────────────────────────────
// Havuz tohumları
// ─────────────────────────────────────────────────────────────────────────
// Tohumu tanımsız varlıklar için eski derinlik kuralı: haftalık arzın fiyatı ~%7 oynatacağı derinlik
const HEDEF_FIYAT_ETKISI = 0.07;
const HAFTALIK_ARZ_YEDEK = { fragments: 9000, scroll_heal: 1500, scroll_stamina: 1000 };

function haftalikArz(key) {
  const kota = GAME_CONFIG.GLOBAL_RESOURCE_CAPS[key];
  return kota ? kota.totalCap : (HAFTALIK_ARZ_YEDEK[key] || 1000);
}

// Hammadde tohumunun üretim hızı × açılış fiyatı ile ağırlıklı payı
function hammaddeTohumPayi(key) {
  const deger = k => ((GAME_CONFIG.BASE_PRODUCTION || {})[k] || 0) * ((koridorlar()[k] || {}).defaultPriceAda || 0);
  const toplam = HAMMADDELER.reduce((t, k) => t + deger(k), 0);
  return toplam > 0 ? deger(key) / toplam : 1 / HAMMADDELER.length;
}

function havuzKur(key, meta) {
  const koridor = koridorlar()[key];
  const fiyat = koridor ? koridor.defaultPriceAda : 1;
  const tohumlar = GAME_CONFIG.AMM_SEED_ASTRA || {};
  const hammaddeMi = HAMMADDELER.includes(key);

  let astraRezervi;
  if (hammaddeMi && tohumlar.raw > 0) astraRezervi = tohumlar.raw * hammaddeTohumPayi(key);
  else if (tohumlar[key] > 0) astraRezervi = tohumlar[key];
  else {
    const arz = haftalikArz(key);
    const maldaRezerv = hammaddeMi
      ? Math.round(arz * (GAME_CONFIG.AMM_RAW_DEPTH_WEEKS || 80))
      : Math.round(arz * (1 - HEDEF_FIYAT_ETKISI) / HEDEF_FIYAT_ETKISI);
    return { resourceReserve: maldaRezerv, adAstraReserve: Math.round(maldaRezerv * fiyat), ...meta };
  }
  return { resourceReserve: Math.round(astraRezervi / fiyat), adAstraReserve: Math.round(astraRezervi), ...meta };
}

function varsayilanHavuzlar() {
  const havuzlar = {};
  for (const k of HAMMADDELER) {
    havuzlar[k] = havuzKur(k, { name: (META[k] || {}).name || k, icon: (META[k] || {}).icon || '' });
  }
  havuzlar.fragments = havuzKur('fragments', { name: 'Teçhizat Parçaları', icon: '🧩' });
  havuzlar.scroll_heal = havuzKur('scroll_heal', { name: 'Ordu İyileştirme Parşömeni', icon: '📜' });
  havuzlar.scroll_stamina = havuzKur('scroll_stamina', { name: '100 Stamina Doldurma Parşömeni', icon: '⚡' });
  return havuzlar;
}

// ─────────────────────────────────────────────────────────────────────────
// Saf hesap: havuz + miktar → miktar (durum değiştirmez)
// ─────────────────────────────────────────────────────────────────────────
// Hammaddede işlem miktarının yakılan oranı; diğer varlıklarda yakım yok
function hammaddeYakimOrani(key) {
  if (!HAMMADDELER.includes(key)) return 0;
  const oran = GAME_CONFIG.AMM_RESOURCE_FEE_RATE ?? GAME_CONFIG.AMM_FEE_RATE ?? 0.02;
  return Math.max(0, Math.min(0.5, oran));
}

// Satışta havuza giren net mal: yakım oranı düşülür
const satisNetGiris = (key, miktar) => miktar * (1 - hammaddeYakimOrani(key));
// Alışta havuzdan çıkan brüt mal: alıcıya istediği kadar teslim edilir, yakım havuzdan fazladan çıkar
const alisBrutCikis = (key, miktar) => miktar * (1 + hammaddeYakimOrani(key));
// netGiris mal girerse çıkan brüt ASTRA / grossOut mal çıkarsa ödenen net ASTRA
const satistaCikanAstra = (h, netGiris) => (h.adAstraReserve * netGiris) / (h.resourceReserve + netGiris);
const alistaOdenenAstra = (h, brutCikis) => (h.adAstraReserve * brutCikis) / (h.resourceReserve - brutCikis);

const tradCapMesaji = (islem, tavan, ad) =>
  `⛔ Tek işlemde havuzun en fazla %${Math.round((GAME_CONFIG.AMM_SINGLE_TRADE_SHARE ?? 0.05) * 100)}'i ${islem}: şu an ${tavan.toLocaleString('tr-TR')} ${ad}.`;

export class AMMMarketEngine {
  constructor() {
    // v12: 6 hammadde, 100 M tohum, ölçekli fiyatlar (eski kayıtlar yeniden tohumlanır)
    this.storageKey = 'adastra_amm_pools_v12';
    this.listeners = [];
    this.pools = this.loadPools();
    this.feeStats = this.loadFeeStats();
    this.history = this.loadHistory();   // fiyat geçmişi: { varlık: [[zamanMs, fiyat], ...] } (js/economy/fiyatGecmisi.js)
    this._gecmisYazildi = 0;
  }

  // ── Fiyat değişimi aboneliği ───────────────────────────────────────────
  subscribe(fn) {
    if (typeof fn === 'function') this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  notifyPriceChange() {
    if (this.listeners.length === 0) return;
    if (typeof gameState !== 'undefined' && gameState._isFastForwarding) return;
    const fiyatlar = this.getAllPrices();
    for (const fn of this.listeners) {
      try { fn(fiyatlar); } catch (e) { console.error('Fiyat dinleyicisi hata verdi:', e); }
    }
  }

  getAllPrices() {
    return Object.fromEntries(Object.keys(this.pools).map(k => [k, this.getPrice(k)]));
  }

  // ── Kayıt ──────────────────────────────────────────────────────────────
  loadPools() {
    const varsayilan = varsayilanHavuzlar();
    if (typeof localStorage === 'undefined') return varsayilan;
    const { data } = readJSON(this.storageKey);
    if (!data) return varsayilan;
    const birlesik = {};
    for (const key of Object.keys(varsayilan)) {
      const kayitli = data[key];
      birlesik[key] = kayitli && kayitli.resourceReserve > 0 ? { ...varsayilan[key], ...kayitli } : varsayilan[key];
    }
    return birlesik;
  }

  loadFeeStats() {
    const bos = () => ({ collected: 0, burned: 0, burnedResources: sifirHammadde() });
    if (typeof localStorage === 'undefined') return bos();
    const veri = readJSON(this.storageKey + '_fees').data || { collected: 0, burned: 0 };
    veri.burnedResources = { ...sifirHammadde(), ...(veri.burnedResources || {}) };
    return veri;
  }

  savePools() {
    if (typeof localStorage === 'undefined') return;
    if (typeof gameState !== 'undefined' && gameState._isFastForwarding) return;
    writeJSON(this.storageKey, this.pools);
    writeJSON(this.storageKey + '_fees', this.feeStats);
    this.recordPrices();
    this.notifyPriceChange();
  }

  // ── Fiyat geçmişi (19 Ekim 2026) ───────────────────────────────────────
  loadHistory() {
    if (typeof localStorage === 'undefined') return {};
    const { data } = readJSON(this.storageKey + '_hist');
    const cikti = {};
    if (data && typeof data === 'object') for (const k of Object.keys(data)) cikti[k] = gecmisiTemizle(data[k]);
    return cikti;
  }

  // Her havuzun güncel fiyatını geçmişe işler; depoya en çok dakikada bir yazılır (her işlemde yarım megabayt yazılmasın), zorla = hemen yaz
  recordPrices(simdi = Date.now(), zorla = false) {
    if (!this.history) this.history = {};
    for (const key of Object.keys(this.pools)) {
      gecmiseKaydet(this.history[key] || (this.history[key] = []), this.getPrice(key), simdi);
    }
    if (typeof localStorage === 'undefined') return;
    if (zorla || simdi - this._gecmisYazildi >= 60000) {
      this._gecmisYazildi = simdi;
      writeJSON(this.storageKey + '_hist', this.history);
    }
  }

  // Grafik için: { key, aralik, points: [[zamanMs, fiyat], ...], ...özet } (aralik: '24s' | '7g' | '30g')
  getPriceHistory(key, aralik = '24s', simdi = Date.now()) {
    if (!this.pools[key]) return null;
    const noktalar = aralikSerisi((this.history && this.history[key]) || [], simdi, aralikMs(aralik), this.getPrice(key));
    return { key, aralik, name: this.pools[key].name, points: noktalar, ...gecmisOzeti(noktalar) };
  }

  // Kaldırılan havuzların (Pandora kutusu 'boxes' ve Anahtar 'keys', 18 Ekim 2026) KAYITLI ASTRA'sını okur: pazar kaydında hâlâ duruyorsa
  // ASTRA'sı döner (çağıran hazineye aktarır; ASTRA kaybolmaz), kayıt temizlenir. Kayıt yoksa ya da zaten temizse 0. loadPools bu anahtarları
  // artık yüklemez; savePools ilk yazışta kaydı siler, bu yüzden bu yöntem sunucu açılışında HİÇBİR kayıttan önce çağrılmalı.
  kaldirilanHavuzAstrasi() {
    if (typeof localStorage === 'undefined') return 0;
    const { data } = readJSON(this.storageKey);
    if (!data) return 0;
    let toplam = 0;
    for (const k of ['boxes', 'keys']) {
      const h = data[k];
      if (h && Number(h.adAstraReserve) > 0) toplam += Number(h.adAstraReserve);
    }
    return toplam;
  }

  // Parça havuzunu (fragments) güncel tohum derinliğine küçültür; FİYAT korunur (mal ve ASTRA aynı oranda azalır). Havuz zaten o derinlikteyse
  // hiçbir şey yapmaz (tekrar çalıştırmak zararsız). Döner: havuzdan çıkan ASTRA (çağıran, hazineye aktarır; ASTRA kaybolmaz).
  // 18 Ekim 2026: parça onarımda da harcanıyor; havuz eskiden 4 M ASTRA / ~8,9 M parçaydı, kullanım fiyatı oynatamıyordu.
  parcaHavuzunuKucult() {
    const h = this.pools.fragments;
    const hedef = Number((GAME_CONFIG.AMM_SEED_ASTRA || {}).fragments) || 0;
    if (!h || !(hedef > 0) || !(h.adAstraReserve > hedef * 1.05) || !(h.resourceReserve > 0)) return 0;
    const fiyat = h.adAstraReserve / h.resourceReserve;
    const fazla = h.adAstraReserve - hedef;
    h.adAstraReserve = hedef;
    h.resourceReserve = hedef / fiyat;
    this.savePools();
    return fazla;
  }

  // Havuzları ve sayaçları açılış tohumuna döndürür
  resetPools() {
    if (typeof localStorage !== 'undefined') {
      removeJSON(this.storageKey);
      removeJSON(this.storageKey + '_fees');
      removeJSON(this.storageKey + '_hist');
    }
    this.history = {};
    this.pools = varsayilanHavuzlar();
    this.feeStats = { collected: 0, burned: 0, burnedResources: sifirHammadde() };
    this.savePools();
    return this.pools;
  }

  // ── Okuma ──────────────────────────────────────────────────────────────
  getPrice(key) {
    const h = this.pools[key];
    if (!h || h.resourceReserve <= 0) return 0;
    return h.adAstraReserve / h.resourceReserve;
  }

  getCorridor(key) {
    return koridorlar()[key] || null;
  }

  getTotalAdAstraLiquidity() {
    let toplam = 0;
    for (const h of Object.values(this.pools)) toplam += (h.adAstraReserve || 0);
    return Math.round(toplam);
  }

  getBurnedResources() {
    if (!this.feeStats) this.feeStats = this.loadFeeStats();
    if (!this.feeStats.burnedResources) this.feeStats.burnedResources = sifirHammadde();
    const cikti = {};
    for (const k of HAMMADDELER) cikti[k] = Math.round((this.feeStats.burnedResources[k] || 0) * 10) / 10;
    return cikti;
  }

  // Tek işlemde alınıp satılabilecek en fazla mal (havuzdaki malın AMM_SINGLE_TRADE_SHARE'i)
  getSingleTradeCap(key) {
    const h = this.pools[key];
    if (!h) return 0;
    return Math.floor(h.resourceReserve * (GAME_CONFIG.AMM_SINGLE_TRADE_SHARE ?? 0.05));
  }

  // Koridor tabanına inmeden tek seferde satılabilecek en fazla miktar.
  // Satış sonrası fiyat = A·R / (R + x)²  →  x ≤ √(A·R / taban) − R
  getMaxSellBeforeFloor(key) {
    const h = this.pools[key];
    const koridor = this.getCorridor(key);
    if (!h) return 0;
    if (!koridor || !(koridor.minPriceAda > 0)) return Infinity;
    const enFazlaNet = Math.sqrt((h.adAstraReserve * h.resourceReserve) / koridor.minPriceAda) - h.resourceReserve;
    if (!(enFazlaNet > 0)) return 0;
    return Math.floor(enFazlaNet / (1 - hammaddeYakimOrani(key)));
  }

  // miktar mal satarsan alacağın ASTRA (komisyon ve yakım düşülmüş)
  getEstimatedAdAstraForSell(key, miktar) {
    const h = this.pools[key];
    if (!h || miktar <= 0) return 0;
    return satistaCikanAstra(h, satisNetGiris(key, miktar)) * (1 - GAME_CONFIG.AMM_FEE_RATE);
  }

  // miktar mal almak için ödeyeceğin ASTRA (komisyon dahil; yakım havuzdan fazladan çıkar)
  getEstimatedCostForBuy(key, miktar) {
    const h = this.pools[key];
    if (!h || miktar <= 0) return 0;
    const brut = alisBrutCikis(key, miktar);
    if (brut >= h.resourceReserve) return Infinity;
    return alistaOdenenAstra(h, brut) * (1 + GAME_CONFIG.AMM_FEE_RATE);
  }

  // astra ASTRA ile kaç mal alınır (komisyon düşülmüş)
  getEstimatedResourceForBuy(key, astra) {
    const h = this.pools[key];
    if (!h || astra <= 0) return 0;
    const net = astra / (1 + GAME_CONFIG.AMM_FEE_RATE);
    return (h.resourceReserve * net) / (h.adAstraReserve + net);
  }

  // Bir kaynak paketinin pazardaki anlık toplam ASTRA değeri ({ wood: 100, ... })
  calculateResourcesAdAstraValue(kaynaklar = {}) {
    let toplam = 0;
    const dokum = {};
    for (const [key, ham] of Object.entries(kaynaklar)) {
      const miktar = Math.max(0, Number(ham) || 0);
      if (miktar <= 0) { dokum[key] = 0; continue; }

      let deger;
      const h = this.pools[key];
      if (h && h.resourceReserve > 0) {
        deger = this.getEstimatedAdAstraForSell(key, miktar);
        if (!deger || isNaN(deger) || deger <= 0) deger = miktar * (this.getPrice(key) || 1.0);
      } else {
        const koridor = this.getCorridor(key);
        deger = miktar * (koridor ? koridor.defaultPriceAda : 1.0);
      }
      dokum[key] = Math.round(deger * 1000) / 1000;
      toplam += deger;
    }
    // 3 ondalık: küçük fiyatlar (0,009 ASTRA/buğday) 1'e yuvarlanmasın
    return { totalAda: Math.max(0, Math.round(toplam * 1000) / 1000), breakdown: dokum };
  }

  // Bu alım yapılırsa fiyat ne olur? (koridor tavanı kontrolü için)
  previewPriceAfterBuy(key, miktar) {
    const h = this.pools[key];
    const brut = alisBrutCikis(key, miktar);
    if (!h || brut >= h.resourceReserve) return Infinity;
    const maliyet = alistaOdenenAstra(h, brut);
    return (h.adAstraReserve + maliyet) / (h.resourceReserve - brut);
  }

  // ── Hammadde yakım kaydı ───────────────────────────────────────────────
  _yakimKaydet(key, miktar) {
    if (!(miktar > 0)) return;
    if (!this.feeStats.burnedResources) this.feeStats.burnedResources = sifirHammadde();
    this.feeStats.burnedResources[key] = (this.feeStats.burnedResources[key] || 0) + miktar;
    globalPool.recordResourceBurn(key, miktar);
  }

  // Komisyonu ekosistem harcama motoruna (yakım / UBI / telif / hazine) verir; yakılan miktarı döndürür
  _komisyonIsle(komisyon) {
    const dagilim = komisyon > 0 ? globalPool.recordTokenSpend(komisyon) : null;
    const yakilan = dagilim ? dagilim.burned : (komisyon * (GAME_CONFIG.TOKEN_BURN_RATE ?? 0.05));
    this.feeStats.collected += komisyon;
    this.feeStats.burned += yakilan;
    return yakilan;
  }

  // ── İşlemler ───────────────────────────────────────────────────────────
  executeSell(key, miktar) {
    const h = this.pools[key];
    if (!h || !(miktar > 0)) return { success: false, message: 'Geçersiz miktar!' };

    const islemTavani = this.getSingleTradeCap(key);
    if (miktar > islemTavani) {
      return { success: false, tradeCapBlocked: true, maxSellable: islemTavani, message: tradCapMesaji('satılabilir', islemTavani, h.name) };
    }

    // Taban fiyat koruması: satış fiyatı koridor tabanının altına itemez
    const koridor = this.getCorridor(key);
    if (koridor && koridor.minPriceAda > 0) {
      const satilabilir = this.getMaxSellBeforeFloor(key);
      if (miktar > satilabilir) {
        return {
          success: false,
          floorBlocked: true,
          maxSellable: satilabilir,
          message: satilabilir > 0
            ? `⛔ Bu satış ${h.name} fiyatını taban fiyatın (${koridor.minPriceAda} ASTRA) altına düşürür. Şu an en fazla ${satilabilir.toLocaleString('tr-TR')} adet satabilirsin.`
            : `⛔ ${h.name} fiyatı taban seviyede (${koridor.minPriceAda} ASTRA). Hazine geri alımı fiyatı toparlayana kadar satış yapılamaz.`
        };
      }
    }

    const netGiris = satisNetGiris(key, miktar);
    const yakilanMal = miktar - netGiris;
    const brut = satistaCikanAstra(h, netGiris);
    const komisyon = brut * GAME_CONFIG.AMM_FEE_RATE;
    const net = brut - komisyon;
    if (!(net > 0)) return { success: false, message: 'Kazanç hesaplanamadı!' };

    this._yakimKaydet(key, yakilanMal);

    // Havuz: net mal girer, brüt ASTRA çıkar
    h.resourceReserve += netGiris;
    h.adAstraReserve -= brut;

    const burned = this._komisyonIsle(komisyon);
    this.savePools();

    return {
      success: true,
      adAstraReceived: net,
      gross: brut,
      fee: komisyon,
      burned,
      resourceBurnFee: yakilanMal,
      newPrice: this.getPrice(key),
      resourceName: h.name,
      icon: h.icon
    };
  }

  executeBuyAmount(key, miktar) {
    const h = this.pools[key];
    if (!h || !(miktar > 0)) return { success: false, message: 'Geçersiz miktar!' };

    // Alıcı istediği miktarın tamamını alır; yakım için havuzdan biraz fazlası çıkar
    const brutCikis = alisBrutCikis(key, miktar);
    const islemTavani = this.getSingleTradeCap(key);
    if (brutCikis > islemTavani) {
      return { success: false, tradeCapBlocked: true, maxBuyable: islemTavani, message: tradCapMesaji('alınabilir', islemTavani, h.name) };
    }

    const koridor = this.getCorridor(key);
    if (koridor && this.previewPriceAfterBuy(key, miktar) > koridor.maxPriceAda) {
      return {
        success: false,
        message: `⛔ Bu alım ${h.name} fiyatını koridor tavanının (${koridor.maxPriceAda} ASTRA) üstüne çıkarır. Daha küçük bir miktar dene — piyasa tavan koruması devrede.`,
        corridorBlocked: true
      };
    }

    const net = alistaOdenenAstra(h, brutCikis);
    const komisyon = net * GAME_CONFIG.AMM_FEE_RATE;
    const maliyet = net + komisyon;
    if (!isFinite(maliyet) || maliyet <= 0) return { success: false, message: 'Maliyet hesaplanamadı!' };

    // Havuzdan çıkan fazlalık alıcıya ulaşmadan kalıcı olarak silinir
    const yakilanMal = brutCikis - miktar;
    this._yakimKaydet(key, yakilanMal);

    h.adAstraReserve += net;
    h.resourceReserve -= brutCikis;

    const burned = this._komisyonIsle(komisyon);
    this.savePools();

    return {
      success: true,
      cost: maliyet,
      netCost: net,
      fee: komisyon,
      burned,
      resourceBurnFee: yakilanMal,
      resourceReceived: miktar,
      newPrice: this.getPrice(key),
      resourceName: h.name,
      icon: h.icon
    };
  }

  // ── Hazine destekli geri alım ve yakım ─────────────────────────────────
  // Fiyatı açılışın TRIGGER_DROP kadar altına inen varlıklara, düşüşle orantılı yoğunlukta ve
  // ağırlıklarına göre bütçe ayrılır. Düşüşler değişmez açılış fiyatına (GENESIS_PRICES) göre ölçülür.
  getBuybackAnalysis(donguTavani = (GAME_CONFIG.AMM_BUYBACK?.WEEKLY_RATE ?? 0.03)) {
    const kasa = treasury.getPool('ammBuyback') || 0;
    const donguFonu = kasa * donguTavani;
    const tetik = GAME_CONFIG.AMM_BUYBACK?.TRIGGER_DROP ?? 0.2;

    let toplamSkor = 0;
    let enYuksekAciliyet = 0;
    const detay = [];
    for (const key of [...HAMMADDELER, 'fragments']) {
      const h = this.pools[key];
      if (!h) continue;
      const guncel = this.getPrice(key);
      const acilis = GENESIS_PRICES[key] || 1.0;
      const dusus = Math.max(0, (acilis - guncel) / acilis);
      const aciliyet = dusus >= tetik ? Math.min(1, dusus) : 0;   // eşiğin altındaki düşüşe müdahale yok
      const agirlik = BUYBACK_ASSET_WEIGHTS[key] || 0.1;
      const skor = agirlik * aciliyet;

      toplamSkor += skor;
      if (aciliyet > enYuksekAciliyet) enYuksekAciliyet = aciliyet;
      detay.push({
        key, name: h.name, icon: h.icon,
        currentPrice: guncel, genesisPrice: acilis,
        dropRatio: dusus, dropPct: Math.round(dusus * 1000) / 10,
        urgency: aciliyet, weight: agirlik, score: skor
      });
    }

    // Harcanacak toplam bütçe krizin aciliyetiyle ölçeklenir
    const harcanacak = toplamSkor > 0 ? (donguFonu * enYuksekAciliyet) : 0;
    for (const d of detay) {
      const pay = toplamSkor > 0 ? (d.score / toplamSkor) : 0;
      const butce = harcanacak * pay;
      const tahminiMal = butce > 0 && this.pools[d.key] ? this.getEstimatedResourceForBuy(d.key, butce) : 0;
      d.sharePct = Math.round(pay * 1000) / 10;
      d.allocatedBudget = Math.round(butce * 100) / 100;
      d.estimatedUnitsToBurn = Math.round(tahminiMal * 10) / 10;
    }

    return {
      availableTreasury: Math.round(kasa),
      cycleBudgetCap: donguTavani,
      maxCycleFund: Math.round(donguFonu),
      maxUrgency: Math.round(enYuksekAciliyet * 10000) / 10000,
      totalFundToSpend: Math.round(harcanacak * 100) / 100,
      assets: detay
    };
  }

  executeAutonomousBuyback(donguTavani = (GAME_CONFIG.AMM_BUYBACK?.WEEKLY_RATE ?? 0.03)) {
    const analiz = this.getBuybackAnalysis(donguTavani);
    if (!analiz.totalFundToSpend || analiz.totalFundToSpend <= 1) {
      return { success: false, executed: false, message: 'Tüm varlıklar başlangıç fiyatında veya üzerinde, hazine müdahalesine gerek yok.', analysis: analiz };
    }
    if ((treasury.getPool('ammBuyback') || 0) < analiz.totalFundToSpend) {
      return { success: false, executed: false, message: 'Hazine AMM kasasında yeterli bakiye bulunmuyor.', analysis: analiz };
    }

    const kalemler = [];
    let toplamHarcanan = 0;
    let toplamYakilan = 0;

    for (const kalem of analiz.assets) {
      if (kalem.allocatedBudget <= 0) continue;
      const h = this.pools[kalem.key];
      if (!h) continue;

      const eskiFiyat = this.getPrice(kalem.key);
      const cekilen = treasury.drawBuyback(kalem.allocatedBudget);
      if (cekilen <= 0) continue;

      // Hazine kendine komisyon ödemez: çekilen ASTRA'nın tamamı havuza girer
      const alinanMal = (h.resourceReserve * cekilen) / (h.adAstraReserve + cekilen);
      h.adAstraReserve += cekilen;
      h.resourceReserve -= alinanMal;

      // Kalıcı yakım tek sayılır (küresel sayaç + havuz sayacı)
      if (!this.feeStats.burnedResources) this.feeStats.burnedResources = {};
      this.feeStats.burnedResources[kalem.key] = (this.feeStats.burnedResources[kalem.key] || 0) + alinanMal;
      globalPool.recordResourceBurn(kalem.key, alinanMal);

      toplamHarcanan += cekilen;
      toplamYakilan += alinanMal;
      kalemler.push({
        key: kalem.key,
        name: kalem.name,
        icon: kalem.icon,
        budgetSpent: Math.round(cekilen * 100) / 100,
        unitsBurned: Math.round(alinanMal * 10) / 10,
        oldPrice: Math.round(eskiFiyat * 1000) / 1000,
        newPrice: Math.round(this.getPrice(kalem.key) * 1000) / 1000,
        dropPct: kalem.dropPct
      });
    }

    this.savePools();

    const rapor = {
      timestamp: Date.now(),
      totalSpent: Math.round(toplamHarcanan * 100) / 100,
      totalUnitsBurned: Math.round(toplamYakilan * 10) / 10,
      remainingTreasury: Math.round(treasury.getPool('ammBuyback')),
      items: kalemler
    };
    writeJSON(this.storageKey + '_last_buyback', rapor);
    this.lastBuybackReport = rapor;

    return {
      success: true,
      executed: true,
      message: `🎯 Otonom Buyback & Yakım Tamamlandı: ${rapor.totalSpent.toLocaleString('tr-TR')} ASTRA ile piyasadan malzemeler alınıp kalıcı olarak yakıldı!`,
      report: rapor
    };
  }

  getLastBuybackReport() {
    if (this.lastBuybackReport) return this.lastBuybackReport;
    if (typeof localStorage === 'undefined') return null;
    return readJSON(this.storageKey + '_last_buyback').data || null;
  }
}

export const ammMarket = new AMMMarketEngine();
