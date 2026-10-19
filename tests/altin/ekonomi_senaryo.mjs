// Ekonomi çekirdeği altın kaydı: hazine defteri + pazar motoru + küresel havuz üzerinde tohumlu, rastgele işlem dizisi.
// Her işlemden sonra üç modülün tüm durumu ve işlemin döndürdüğü değer özetlenir (SHA-256).
// Üç modül baştan yazılırken özetler birebir aynı çıkmak zorundadır. Bilerek değiştirirsen:
//   node tests/altin/ekonomi_uret.mjs   (farkı commit mesajında açıkla)
process.env.TEST_RASTGELE = '1';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

// ── Sabit saat ve sahte localStorage (modüller yüklenmeden ÖNCE) ──
const GercekTarih = Date;
let T = GercekTarih.UTC(2026, 9, 8, 12, 0, 0);
globalThis.Date = class extends GercekTarih {
  constructor(...a) { if (a.length === 0) super(T); else super(...a); }
  static now() { return T; }
};
const depo = new Map();
globalThis.localStorage = {
  getItem: k => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: k => { depo.delete(k); },
  clear: () => depo.clear()
};
function tohumlu(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = tohumlu(3);   // simulateMacroEconomy gibi yerler bunu kullanır

// EKONOMI_KOK: js klasörünün başka bir kopyası (git geçmişinden çıkarılmış eski kod) — altın kaydı üretmek için
const KOK = process.env.EKONOMI_KOK ? pathToFileURL(process.env.EKONOMI_KOK).href + '/' : new URL('../../js/', import.meta.url).href;
const hazineModulu = await import(KOK + 'treasury.js');
const pazarModulu = await import(KOK + 'ammMarket.js');
const havuzModulu = await import(KOK + 'globalPool.js');
const { treasury } = hazineModulu;
const { ammMarket } = pazarModulu;
const { globalPool } = havuzModulu;

const SAAT = 3600000, GUN = 24 * SAAT;

function kararli(x) {
  if (Array.isArray(x)) return x.map(kararli);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, kararli(x[k])]));
  if (typeof x === 'number') return Number.isFinite(x) ? Number(x.toPrecision(12)) : String(x);
  if (x === undefined) return '__undefined__';
  return x;
}
const ozet = x => crypto.createHash('sha256').update(JSON.stringify(kararli(x))).digest('hex').slice(0, 16);

const HAVUZ_ANAHTARLARI = ['wood', 'iron', 'wheat', 'stone', 'coal', 'herb', 'fragments', 'scroll_heal', 'scroll_stamina', 'yok_boyle_bir_sey'];
const KASALAR = ['dungeon', 'arena', 'worldBoss', 'ammBuyback', 'quest', 'carnival', 'fatih', 'uoaTohum', 'olmayan'];

// Her adımın sonunda üç modülün tam durumu
function dunya() {
  return {
    hazine: treasury.state,
    havuzlar: ammMarket.pools,
    ucretler: ammMarket.feeStats,
    kota: globalPool.state
  };
}

function rastgeleMiktar(r, ust) {
  const s = r();
  if (s < 0.04) return 0;
  if (s < 0.07) return -Math.round(r() * 100);
  if (s < 0.10) return NaN;
  if (s < 0.14) return Math.round(r() * ust * 50);   // aşırı büyük
  if (s < 0.5) return Math.round(r() * ust * 0.01);
  return +(r() * ust).toFixed(r() < 0.5 ? 0 : 3);
}

export function islemler(r, adet) {
  const liste = [];
  const sec = a => a[Math.floor(r() * a.length)];
  for (let i = 0; i < adet; i++) {
    const p = r();
    const anahtar = sec(HAVUZ_ANAHTARLARI);
    const kasa = sec(KASALAR);
    if (p < 0.12) liste.push({ ad: 'sat', anahtar, miktar: rastgeleMiktar(r, 3000) });
    else if (p < 0.22) liste.push({ ad: 'al', anahtar, miktar: rastgeleMiktar(r, 3000) });
    else if (p < 0.34) liste.push({ ad: 'harcama', miktar: rastgeleMiktar(r, 20000) });
    else if (p < 0.44) liste.push({ ad: 'cek', kasa, miktar: rastgeleMiktar(r, 80000) });
    else if (p < 0.50) liste.push({ ad: 'cekTam', kasa, miktar: rastgeleMiktar(r, 5000) });
    else if (p < 0.53) liste.push({ ad: 'iade', kasa, miktar: rastgeleMiktar(r, 500) });
    else if (p < 0.57) liste.push({ ad: 'kasayaKoy', kasa, miktar: rastgeleMiktar(r, 50000) });
    else if (p < 0.60) liste.push({ ad: 'kasaPay', miktar: rastgeleMiktar(r, 50000) });
    else if (p < 0.63) liste.push({ ad: 'geriAlimCek', miktar: rastgeleMiktar(r, 80000) });
    else if (p < 0.68) liste.push({ ad: 'hasat', anahtar: sec(['wood', 'iron', 'wheat', 'stone', 'coal', 'herb', 'yok']), miktar: rastgeleMiktar(r, 30000) });
    else if (p < 0.72) liste.push({ ad: 'hammaddeYakimi', anahtar: sec(['wood', 'iron', 'wheat', 'stone', 'coal', 'herb']), miktar: rastgeleMiktar(r, 5000) });
    else if (p < 0.74) liste.push({ ad: 'esyaYakimi', tur: sec(['fragments', '']), miktar: rastgeleMiktar(r, 300) });
    else if (p < 0.77) liste.push({ ad: 'ubi', seviye: 1 + Math.floor(r() * 60), epoch: r() < 0.3 ? -1 : 0 });
    else if (p < 0.80) liste.push({ ad: 'sat', anahtar, miktar: rastgeleMiktar(r, 400) });
    else if (p < 0.83) liste.push({ ad: 'otonomGeriAlim' });
    else if (p < 0.86) liste.push({ ad: 'haftaButceleri' });
    else if (p < 0.89) liste.push({ ad: 'zaman', ms: sec([SAAT, 6 * SAAT, GUN, 3 * GUN, 8 * GUN]) });
    else if (p < 0.91) liste.push({ ad: 'epochDenetimi' });
    else if (p < 0.93) liste.push({ ad: 'harcama', miktar: rastgeleMiktar(r, 900) });
    else if (p < 0.945) liste.push({ ad: 'konseyStok', anahtar: sec(['wood', 'iron', 'wheat', 'stone']), miktar: rastgeleMiktar(r, 2000) });
    else if (p < 0.955) liste.push({ ad: 'konseyAl', anahtar: sec(['wood', 'iron', 'wheat', 'stone']), miktar: rastgeleMiktar(r, 2000) });
    else if (p < 0.965) liste.push({ ad: 'agirlik', miktar: 1 + r() * 400 });
    else if (p < 0.972) liste.push({ ad: 'fiyatOrani', oran: sec([0.5, 0.9, 1, 1.2, 2]) });
    else if (p < 0.978) liste.push({ ad: 'adaletTavani', miktar: r() * 50 });
    else if (p < 0.984) liste.push({ ad: 'yenidenYukle' });
    else if (p < 0.99) liste.push({ ad: 'sorgular' });
    else if (p < 0.994) liste.push({ ad: 'sifirla', ne: sec(['hazine', 'pazar', 'epoch', 'vanilla']) });
    else if (p < 0.9985) liste.push({ ad: 'havuzDusur', anahtar: sec(['wood', 'iron', 'wheat', 'stone', 'coal', 'herb', 'fragments']), carpan: 0.4 + r() * 0.5 });
    else liste.push({ ad: 'simulasyon' });
  }
  return liste;
}

function uygula(o) {
  switch (o.ad) {
    case 'sat': return ammMarket.executeSell(o.anahtar, o.miktar);
    case 'al': return ammMarket.executeBuyAmount(o.anahtar, o.miktar);
    case 'harcama': return globalPool.recordTokenSpend(o.miktar);
    case 'cek': return treasury.withdraw(o.kasa, o.miktar);
    case 'cekTam': return treasury.withdrawWhole(o.kasa, o.miktar);
    case 'iade': return treasury.refund(o.kasa, o.miktar);
    case 'kasayaKoy': return treasury.depositTo(o.kasa, o.miktar);
    case 'kasaPay': return treasury.deposit(o.miktar);
    case 'geriAlimCek': return treasury.drawBuyback(o.miktar);
    case 'hasat': return globalPool.harvest(o.anahtar, o.miktar);
    case 'hammaddeYakimi': return globalPool.recordResourceBurn(o.anahtar, o.miktar);
    case 'esyaYakimi': return globalPool.recordItemBurn(o.tur, o.miktar);
    case 'ubi': return globalPool.claimWeeklyUbi(o.seviye, 0, o.epoch === -1 ? globalPool.state.epochId : 0);
    case 'otonomGeriAlim': return ammMarket.executeAutonomousBuyback();
    case 'haftaButceleri': return treasury.openWeekBudgets();
    case 'zaman': T += o.ms; return T;
    case 'epochDenetimi': return globalPool.checkEpochExpiration();
    case 'konseyStok': return globalPool.addKonseyStock(o.anahtar, o.miktar);
    case 'konseyAl': return globalPool.takeForKonsey(o.anahtar, o.miktar);
    case 'agirlik': return globalPool.setSumWeight(o.miktar);
    case 'fiyatOrani': {
      const oranlar = Object.fromEntries(['wood', 'iron', 'wheat'].map(k => [k, o.oran]));
      return globalPool.recordPriceRatios(oranlar, T);
    }
    case 'adaletTavani': return globalPool.setFairnessCapWeight(o.miktar);
    case 'yenidenYukle': {
      // Kayıttan yüklenen yeni örnekler, çalışan örneklerle aynı durumu görmeli
      const h = new hazineModulu.TreasuryLedger();
      const p = new pazarModulu.AMMMarketEngine();
      const g = new havuzModulu.GlobalResourceManager();
      return { hazine: h.state, havuzlar: p.pools, ucretler: p.feeStats, kota: g.state };
    }
    case 'sorgular': {
      const kaynaklar = ['wood', 'iron', 'wheat', 'stone'];
      return {
        ozet: treasury.getSummary(),
        saglik: treasury.getPoolHealth('dungeon'),
        fiyatlar: ammMarket.getAllPrices(),
        analiz: ammMarket.getBuybackAnalysis(),
        likidite: ammMarket.getTotalAdAstraLiquidity(),
        yakilan: ammMarket.getBurnedResources(),
        deger: ammMarket.calculateResourcesAdAstraValue({ wood: 100, iron: 50, wheat: 1000, stone: 20, fragments: 5, yok: 3, bos: 0 }),
        satTahmin: kaynaklar.map(k => ammMarket.getEstimatedAdAstraForSell(k, 250)),
        alTahmin: kaynaklar.map(k => ammMarket.getEstimatedCostForBuy(k, 250)),
        alKac: kaynaklar.map(k => ammMarket.getEstimatedResourceForBuy(k, 400)),
        tabanaKadar: kaynaklar.map(k => ammMarket.getMaxSellBeforeFloor(k)),
        bilgi: kaynaklar.map(k => globalPool.getResourceInfo(k)),
        ubiBilgi: [1, 3, 10, 40].map(l => globalPool.getUbiPoolInfo(l, 0)),
        saglikOlcusu: globalPool.getEconomicHealthMetrics(),
        konsey: globalPool.getKonseyStock(),
        hak: kaynaklar.map(k => globalPool.weeklyRightPerWeight(k)),
        otorite: [0, 5, 20].map(l => globalPool.otoriteWork(l)),
        bekleyen: treasury.drainWeekGrantedToCitizens(),
        sonRapor: ammMarket.getLastBuybackReport()
      };
    }
    case 'sifirla':
      if (o.ne === 'hazine') { treasury.reset(); return 'hazine'; }
      if (o.ne === 'pazar') { ammMarket.resetPools(); return 'pazar'; }
      if (o.ne === 'epoch') { globalPool.resetEpoch(); return 'epoch'; }
      globalPool.vanillaReset(); return 'vanilla';
    case 'havuzDusur': {   // fiyatı koridorun altına çek: geri alım yolunu sınamak için
      const h = ammMarket.pools[o.anahtar];
      if (!h) return 'yok';
      h.adAstraReserve *= o.carpan;
      ammMarket.savePools();
      return ammMarket.getPrice(o.anahtar);
    }
    case 'simulasyon': return globalPool.simulateMacroEconomy(50, 5);
    default: throw new Error('bilinmeyen işlem ' + o.ad);
  }
}

// n. senaryo kümesi: kendi tohumuyla `adet` işlem koşar, her işlemin özetini döndürür
export function calistir(tohum, adet) {
  const r = tohumlu(tohum);
  const liste = islemler(r, adet);
  const ozetler = [];
  const ham = [];
  for (const o of liste) {
    let sonuc;
    try { sonuc = uygula(o); } catch (e) { sonuc = { hata: String(e && e.message) }; }
    ham.push(sonuc);
    ozetler.push(ozet({ sonuc, dunya: dunya() }));
  }
  return { ozetler, liste, ham };
}

export const ISLEM_SAYISI = 4000;
export const TOHUM = 20261011;
