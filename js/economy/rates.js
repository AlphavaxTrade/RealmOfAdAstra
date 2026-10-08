// Realm of AdAstra — ADA dağıtım oranları (saf fonksiyonlar; tarayıcıda, sunucuda ve panelde aynı liste)
// ============================================================================
// Kullanıcı kararı (6 Ekim 2026): oyundaki bütün ADA oranları herkesin görebileceği RealmRates sözleşmesinde durur.
// Oranları yalnız sözleşme sahibi değiştirebilir; değişiklik 24 saat sonra geçerli olur (oyuncular önceden görür).
// Oyun sunucusu oranları sözleşmeden okur ve oyunun ayarlarına (GAME_CONFIG, haftalık kurallar) uygular.
// Oranlar "baz puan" (bps) olarak tutulur: 10000 = %100, 500 = %5.
// SIRA SÖZLEŞMEYLE AYNIDIR (contracts/RealmRates.sol) — değiştirme.
// ============================================================================

export const RATE_KEYS = [
  // 0-3 Her harcamanın bölüşümü (toplam %100)
  { key: 'burn', label: 'Yakım', group: 'spend' },
  { key: 'creator', label: 'Yapımcı payı', group: 'spend' },
  { key: 'ubi', label: 'Haftalık temel gelir', group: 'spend' },
  { key: 'pools', label: 'Ödül kasaları', group: 'spend' },
  // 4-11 Ödül kasaları payının kasalara bölünüşü (toplam %100) — v2: 8 kasa
  { key: 'dungeon', label: 'Zindan kasası', group: 'pool' },
  { key: 'arena', label: 'Kolezyum kasası', group: 'pool' },
  { key: 'worldBoss', label: 'Dünya bossu kasası', group: 'pool' },
  { key: 'ammBuyback', label: 'Pazar destek kasası', group: 'pool' },
  { key: 'quest', label: 'Görev ve ücretsiz oyuncu kasası', group: 'pool' },
  { key: 'carnival', label: 'Karnaval kasası', group: 'pool' },
  { key: 'fatih', label: 'Fatih Ödülü kasası', group: 'pool' },
  { key: 'konsey', label: 'Sirius Konseyi kasası', group: 'pool' },
  // 12-20 Özel kurallar
  { key: 'wheelCarnival', label: 'Şans çarkı: doğrudan karnaval kasasına', group: 'rule', max: 10000 },
  { key: 'dungeonGate', label: 'Zindan kapı harcı: doğrudan zindan kasasına', group: 'rule', max: 10000 },
  { key: 'lotteryAmorti', label: 'Piyango bileti: amorti kasasına', group: 'rule', max: 5000 },
  { key: 'marketFee', label: 'Pazar ADA komisyonu (alım ve satım)', group: 'rule', max: 1000 },
  { key: 'marketResourceBurn', label: 'Pazar hammadde yakımı (alım ve satım)', group: 'rule', max: 1000 },
  { key: 'withdrawFee', label: 'Cüzdana çekim ücreti', group: 'rule', max: 2000 },
  { key: 'withdrawFeeBrake', label: 'Cüzdana çekim ücreti (fiyat düşerken)', group: 'rule', max: 3000 },
  { key: 'withdrawFeeUbi', label: 'Çekim ücretinin temel gelire giden kısmı (kalanı yakılır)', group: 'rule', max: 10000 },
  { key: 'rent', label: 'Çekim hakkı kirası', group: 'rule', max: 1000 }
];
export const RATE_COUNT = RATE_KEYS.length;
// Oyunun bugünkü oranları (sözleşme kurulmadan ya da oyun sunucusuna bağlanmadan gösterilen değerler).
// js/config.js ile aynı olmalı: tests/test_rates_contract.mjs denetler.
// v2 (7 Ekim 2026): 8 kasa — zindan 27, kolezyum 14, boss 12, geri alım 15, görev 18, karnaval 4, Fatih 5, Konsey 5
export const DEFAULT_RATES = [500, 300, 600, 8600, 2700, 1400, 1200, 1500, 1800, 400, 500, 500, 8000, 10000, 200, 200, 200, 300, 600, 5000, 150];
export const POOL_KEYS = ['dungeon', 'arena', 'worldBoss', 'ammBuyback', 'quest', 'carnival', 'fatih', 'konsey'];
export const RATE_CHANGE_DELAY_SEC = 24 * 3600;

// Haftalık çekim kurallarının başlangıç değerleri (server/economy.js WEEKLY_RULES ile aynı)
const WEEKLY_DEFAULTS = { fee: 0.03, feeBrake: 0.06, feeUbiShare: 0.50, rent: 0.015 };

const bps = v => Math.round((Number(v) || 0) * 10000);

// Oyunun mevcut ayarlarından oran dizisi (sözleşme kurulurken başlangıç değeri)
export function ratesFromConfig(cfg, weekly = WEEKLY_DEFAULTS) {
  const A = cfg.TREASURY_ALLOCATION || {};
  const named = {
    burn: bps(cfg.TOKEN_BURN_RATE ?? 0.05),
    creator: bps(cfg.CREATOR_ROYALTY_RATE ?? 0.03),
    ubi: bps(cfg.UBI_POOL_RATE ?? 0.06),
    pools: bps(cfg.TOKEN_REWARD_POOL_RATE ?? 0.86),
    dungeon: bps(A.dungeon), arena: bps(A.arena), worldBoss: bps(A.worldBoss),
    ammBuyback: bps(A.ammBuyback), quest: bps(A.quest), carnival: bps(A.carnival),
    fatih: bps(A.fatih), konsey: bps(A.konsey),
    wheelCarnival: bps(cfg.CARNIVAL?.WHEEL_CARNIVAL_SHARE ?? 0.8),
    dungeonGate: bps(cfg.DUNGEON_GATE_POOL_SHARE ?? 1),
    lotteryAmorti: bps(cfg.CARNIVAL?.LOTTERY?.AMORTI_SHARE ?? 0.02),
    marketFee: bps(cfg.AMM_FEE_RATE ?? 0.02),
    marketResourceBurn: bps(cfg.AMM_RESOURCE_FEE_RATE ?? cfg.AMM_FEE_RATE ?? 0.02),
    withdrawFee: bps(weekly.fee), withdrawFeeBrake: bps(weekly.feeBrake),
    withdrawFeeUbi: bps(weekly.feeUbiShare), rent: bps(weekly.rent)
  };
  return toArray(named);
}

export const toNamed = arr => Object.fromEntries(RATE_KEYS.map((k, i) => [k.key, Number(arr[i]) || 0]));
export const toArray = named => RATE_KEYS.map(k => Math.round(Number(named[k.key]) || 0));

// Sözleşmedeki kontrollerin aynısı. Hata yoksa null döner.
export function validateRates(arr) {
  if (!Array.isArray(arr) || arr.length !== RATE_COUNT) return `Tam ${RATE_COUNT} oran olmalı.`;
  if (arr.some(v => !Number.isInteger(Number(v)) || v < 0 || v > 10000)) return 'Her oran %0 ile %100 arasında olmalı.';
  const n = toNamed(arr);
  if (n.burn + n.creator + n.ubi + n.pools !== 10000) return 'Harcama bölüşümü (yakım + yapımcı + temel gelir + kasalar) toplamı %100 olmalı.';
  if (POOL_KEYS.reduce((s, k) => s + n[k], 0) !== 10000) return 'Kasa payları toplamı %100 olmalı.';
  for (const k of RATE_KEYS) if (k.max != null && n[k.key] > k.max) return `${k.label} en fazla %${k.max / 100} olabilir.`;
  return null;
}

// Oranları oyunun ayarlarına uygula (GAME_CONFIG ve haftalık çekim kuralları yerinde değişir)
export function applyRates(cfg, weekly, arr) {
  if (validateRates(arr)) return false;
  const n = toNamed(arr), f = v => v / 10000;
  cfg.TOKEN_BURN_RATE = f(n.burn);
  cfg.CREATOR_ROYALTY_RATE = f(n.creator);
  cfg.UBI_POOL_RATE = f(n.ubi);
  cfg.TOKEN_REWARD_POOL_RATE = f(n.pools);
  cfg.TREASURY_ALLOCATION = { ...(cfg.TREASURY_ALLOCATION || {}) };
  for (const k of POOL_KEYS) cfg.TREASURY_ALLOCATION[k] = f(n[k]);
  if (cfg.CARNIVAL) {
    cfg.CARNIVAL.WHEEL_CARNIVAL_SHARE = f(n.wheelCarnival);
    if (cfg.CARNIVAL.LOTTERY) cfg.CARNIVAL.LOTTERY.AMORTI_SHARE = f(n.lotteryAmorti);
  }
  cfg.DUNGEON_GATE_POOL_SHARE = f(n.dungeonGate);
  cfg.AMM_FEE_RATE = f(n.marketFee);
  cfg.AMM_RESOURCE_FEE_RATE = f(n.marketResourceBurn);
  if (weekly) {
    weekly.fee = f(n.withdrawFee);
    weekly.feeBrake = f(n.withdrawFeeBrake);
    weekly.feeUbiShare = f(n.withdrawFeeUbi);
    weekly.rent = f(n.rent);
  }
  return true;
}

const POOL_LABEL = { dungeon: 'zindan', arena: 'kolezyum', worldBoss: 'dünya bossu', ammBuyback: 'pazar desteği', quest: 'görev/ücretsiz oyuncu', carnival: 'karnaval', fatih: 'Fatih Ödülü', konsey: 'Sirius Konseyi' };
const pct = v => '%' + (Math.round(v * 100) / 100).toLocaleString('tr-TR');

// "ADA nereye gidiyor" listesi: her oyun alanı için paranın gittiği yerler (yüzdeler harcamanın tamamına göre)
export function moneyFlows(arr) {
  const n = toNamed(arr), P = v => v / 100;
  const std = (scale = 1) => {
    const out = [];
    if (n.burn) out.push([`yakım`, P(n.burn) * scale]);
    if (n.creator) out.push([`yapımcı`, P(n.creator) * scale]);
    if (n.ubi) out.push([`temel gelir`, P(n.ubi) * scale]);
    for (const k of POOL_KEYS) if (n[k]) out.push([`${POOL_LABEL[k]} kasası`, P(n.pools) * n[k] / 10000 * scale]);
    return out;
  };
  const fmt = parts => parts.filter(([, v]) => v > 0.0001).map(([w, v]) => `${pct(v)} ${w}`).join(' · ');
  const standard = fmt(std());
  // Doğrudan kasaya giden kısım + kalanın standart bölüşümü; aynı kasa tek satırda toplanır (ör. %80,69 karnaval kasası)
  const mix = (direct, poolKey) => {
    const d = direct / 10000, label = `${POOL_LABEL[poolKey]} kasası`;
    const parts = std(1 - d);
    const same = parts.find(([w]) => w === label);
    const total = d * 100 + (same ? same[1] : 0);
    const head = [`${label} (${pct(d * 100)} doğrudan)`, total];
    return fmt([head, ...parts.filter(p => p !== same)]);
  };
  const wf = n.withdrawFee / 100, wfb = n.withdrawFeeBrake / 100, wu = n.withdrawFeeUbi / 10000;
  return [
    { area: 'Standart bölüşüm', where: standard, note: 'Asker alma, anında iyileştirme, kendi kendine iyileşme, seviye atlama, taverna güçlendirmeleri ve botu, alet onarımı, silo, demirci (yapma/güçlendirme/onarma), dünya bossu erken çekilme cezası, Genesis NFT, trade sitesinden gelen gelir' },
    { area: 'Şans çarkı (ADA ile)', where: mix(n.wheelCarnival, 'carnival') },
    { area: 'Şans çarkı (biletle)', where: 'biletin bedeli piyango kasasından karnaval kasasına' },
    { area: 'Şans çarkı (hammaddeyle)', where: 'hammaddenin yarısı yakılır, yarısı pazarda satılır ve gelen ADA karnaval kasasına' },
    { area: 'Zindan kapı harcı', where: mix(n.dungeonGate, 'dungeon') },
    { area: 'Piyango bileti', where: `${pct(100 - n.lotteryAmorti / 100)} piyango kasası · ${pct(n.lotteryAmorti / 100)} amorti kasası (ikisi de oyunculara ödenir)` },
    { area: 'Pazardan alım', where: `ödenen ADA pazar havuzuna (hammaddeyi satanlara ödenir) + ${pct(n.marketFee / 100)} komisyon standart bölüşüme · hammaddeden ${pct(n.marketResourceBurn / 100)} yakılır` },
    { area: 'Pazara satış', where: `${pct(n.marketFee / 100)} komisyon standart bölüşüme · satılan hammaddeden ${pct(n.marketResourceBurn / 100)} yakılır` },
    { area: 'Cüzdana çekim', where: `ücret ${pct(wf)} (fiyat düşerken ${pct(wfb)}): ücretten ${pct(wu * 100)} temel gelire, ${pct((1 - wu) * 100)} yakıma` },
    { area: 'Çekim hakkı kirası', where: `başkasının hakkını kullanan ${pct(n.rent / 100)} öder, hakkını kullanmayan oyunculara gider` }
  ];
}
