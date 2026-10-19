// Realm of AdAstra v2 — R4 DENGE MODELİ (tek başına Realm, 12 ay, 50-1000 oyuncu)
// ============================================================================
// Soru: haftalık kota, Üretim Hakkı dağılımı, pazar tohumu, bataklar ve geri alım hangi ayarlarla
// (a) fiyatları bir yılda %50'den fazla düşürmez, (b) kasaları 12 ay yaşatır, (c) ücretsiz oyuncuyu ilerletir,
// (d) gelir uçurumu yaratmaz, (e) kotayı boşa harcamaz? Bütün sayılar docs/v2/R2, R3, EKONOMI_ILKELERI'nden.
// Kullanım: node scripts/model/denge_modeli.mjs N=200 [weeks=52 fiyat=sabit|x3|yarim qpp=0.4 pazar=100e6 ...] [grid=1] [out=dosya.json]
// Bu bir öneri aracıdır; oyuna bağlı değildir. Kesin oyun sayıları R8'de bu modelden türetilir.
// ============================================================================
// 13 Ekim 2026 denetimi EK-09: sabitler artık js/config.js GAME_CONFIG'ten okunur (eskiden v1 değerleri elle yazılıydı: üretim
// hızı 3,3 kat, fiyat listesi 100 kat büyüktü; Otorite "çelik payı" ASTRA ile ödeniyordu; seviye bedeli ve süresi uydurmaydı).
// Seviye bedeli ve XP, gerçek oyun motorundan (getNextLevelRequirement) çekilir; kural değişince model kendiliğinden güncellenir.
import fs from 'fs';
import { GAME_CONFIG as C, URETIM_CARPANI as URETIM } from '../../js/config.js';
const depo = new Map();
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: (k) => { depo.delete(k); } };
const { GameStateManager } = await import('../../js/gameState.js');
const { havuzDagit, oyuncuPayi, yeniHavuzCarpani } = await import('../../js/economy/uretimDagitimi.js');
const URETIM_HAKKI = C.URETIM_HAKKI;
const A = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const num = (k, d) => (A[k] != null ? Number(A[k]) : d);

const RES = ['bugday', 'tas', 'odun', 'komur', 'demir', 'ot'];
const ANAHTAR = { bugday: 'wheat', tas: 'stone', odun: 'wood', komur: 'coal', demir: 'iron', ot: 'herb' };   // model adı -> oyun adı
const TABAN = Object.fromEntries(RES.map(r => [r, C.BASE_PRODUCTION[ANAHTAR[r]] * 60]));                  // birim/saat (BASE_PRODUCTION dakika başına; x URETIM_CARPANI)
const P0BASE = Object.fromEntries(RES.map(r => [r, C.AMM_CORRIDORS[ANAHTAR[r]].defaultPriceAda]));       // ASTRA/birim açılış fiyatı (config)
const TYPES = ['f2p', 'mid', 'whale'];
const KORIDOR = C.AMM_CORRIDORS.wheat;                                                                     // koridor oranı tüm hammaddelerde aynı (0,5-2,5)
const OT = C.OTORITE;
const WB = C.TREASURY_WEEKLY_BUDGET.RATES;
const SEED = C.TREASURY_SEED;
const ALLOC = C.TREASURY_ALLOCATION;

// Seviye tablosu gerçek motordan: [seviye] -> { adAstra, xp, costs } (fiyat çarpanı 1, silo tavanı kuralı dahil)
const LEVEL = (() => {
  const gs = new GameStateManager();
  const t = [null];
  for (let L = 1; L <= 80; L++) { gs.state.level = L; const r = gs.getNextLevelRequirement(); t.push({ adAstra: r.adAstra, xp: r.xp, costs: Object.fromEntries(RES.map(k => [k, r.costs[ANAHTAR[k]] || 0])) }); }
  return t;
})();
const XP_GUNLUK = 6 * 35 * 24;   // altı alan kesintisiz: saatte alan başına 35 XP (gelisim.js GUNLUK_XP_ARZI'nın altı alanlı hâli)

export function defaults() {
  return {
    N: num('N', 200), weeks: num('weeks', 52), growth: num('growth', 0.03),
    mix: { f2p: 0.70, mid: 0.25, whale: 0.05 },
    act: { f2p: num('actF2p', 0.5), mid: 1, whale: 1 },           // günün ne kadarı sefer dönüyor (orta/balina bot)
    katki: { f2p: 1.0, mid: 1.1, whale: 1.25 },                   // katkı kademesi çarpanı (Bronz…)
    qpp: num('qpp', 0.4),            // kişi başı haftalık kota = tek alanın kesintisiz haftalık üretiminin bu katı (Otorite 0); termostatta başlangıç
    kota: num('kota', 1),            // yönetici çarpanı (ana ayar kolu)
    kotaModu: A.kotaModu || 'termostat',   // sabit | termostat (fiyat açılışın üstündeyse kota %10 artar, altındaysa azalır; kişi başı en az qppMin)
    termoAdim: num('termoAdim', 0.10), termoHedef: num('termoHedef', 1.0), qppMin: num('qppMin', 0.08), qppMax: num('qppMax', 1.2),
    havuz: A.havuz !== 'eski',          // 19 Ekim 2026 ekonomi planı: global havuz (oyuncu sayısından bağımsız) + taban/üst pay; havuz=eski eski kişi başı kota modelini çalıştırır
    havuzKisisel: num('havuzKisisel', URETIM_HAKKI.KISISEL_QPP), havuzRef: num('havuzRef', URETIM_HAKKI.REFERANS_AGIRLIK), tabanPayi: num('tabanPayi', URETIM_HAKKI.TABAN_PAYI),   // kişi başı kota: en az tam alanın %5'i, en çok tamamı
    otoriteTaban: num('otoriteTaban', OT.BASE_UNITS), otoriteKat: OT.LEVEL_MULT,   // Otorite 1. sv 2 M birim, her sv ×1,4; karışımın tamamı hammadde (çelik payı kömürdür, ASTRA değil)
    hazirlikToplam: num('hazirlikToplam', 10e6),   // Hazırlık Deposu toplam vaadi (ASTRA değeri, P0 ile) — Universe rezervinin yarısı
    hakTavan: num('hakTavan', 3),    // en yüksek Üretim Hakkı / en düşük (adalet tavanı)
    pazar: num('pazar', C.AMM_SEED_ASTRA.raw),      // pazar havuzlarına ayrılan ASTRA (6 hammadde, değer ağırlıklı; config AMM_SEED_ASTRA.raw)
    taban: num('taban', KORIDOR.minPriceAda / KORIDOR.defaultPriceAda), tavan: num('tavan', KORIDOR.maxPriceAda / KORIDOR.defaultPriceAda),           // fiyat koridoru (açılış fiyatının katı)
    fee: C.AMM_FEE_RATE, resFee: C.AMM_RESOURCE_FEE_RATE,
    geriAlimEsik: num('geriAlimEsik', 1 - C.AMM_BUYBACK.TRIGGER_DROP), geriAlimHiz: num('geriAlimHiz', C.AMM_BUYBACK.WEEKLY_RATE),  // fiyat < eşik×P0 ise kasanın %x'i ile al-yak
    ortak: OT.COMMON_CHEST_RATE, otoriteShare: num('otorite', 0.10), hazirlik: num('hazirlik', 0.20), hazirlikCapWeeks: num('hazirlikCap', 4),
    toolRes: 0.25, toolAda: 0.3, staminaWheat: 0.15,
    split: { burn: C.TOKEN_BURN_RATE, creator: C.CREATOR_ROYALTY_RATE, ubi: C.UBI_POOL_RATE },
    alloc: { dungeon: ALLOC.dungeon, arena: ALLOC.arena, boss: ALLOC.worldBoss, buyback: ALLOC.ammBuyback, quest: ALLOC.quest, carnival: ALLOC.carnival, fatih: ALLOC.fatih, uoaTohum: ALLOC.uoaTohum },
    seed: { dungeon: SEED.dungeon, arena: SEED.arena, boss: SEED.worldBoss, buyback: SEED.ammBuyback, quest: SEED.quest, carnival: SEED.carnival, fatih: SEED.fatih, uoaTohum: SEED.uoaTohum, lottery: C.CARNIVAL.LOTTERY.SEED_POOL_ADA },
    pay: { dungeon: num('pDungeon', WB.dungeon), arena: num('pArena', WB.arena), boss: num('pBoss', WB.worldBoss), quest: num('pQuest', WB.quest) },   // haftalık ödeme oranları (12 ay ömür için ~%2-3)
    faucetSupplyShareMonth: 0.01, faucetPoolCapWeek: num('faucetCap', C.FREE_PLAYER_POOL.WEEKLY_POOL_CAP),
    fiyatOlcek: num('fiyatOlcek', 1),   // ASTRA fiyat listesinin ölçeği (1 = config'teki liste, zaten v2 ölçekli); yalnız "ya olsaydı" denemeleri için
    askerBirim: num('askerBirim', C.SOLDIER_COST_BASE),   // ordu gücü birimi = 1. askerin bedeli (ASTRA)
    supply: 2.13e9, p0usd: 2e-7, fiyat: A.fiyat || 'sabit',
    yatir: { f2p: 0, mid: num('yatirMid', 0), whale: num('yatirWhale', 0) },   // yıllık dış para (ASTRA), haftalara yayılır; varsayılan 0 = hiç para girmeyen dünya
    armyShare: { f2p: 0.3, mid: 0.5, whale: 0.6 },   // ASTRA gelirinin orduya (asker + teçhizat) giden payı
    botFee: 0.30,                                     // bot ücreti ≈ haftalık üretim değerinin %30'u (24 s net kârın %50'si)
    siloWeeks: 2,                                     // silo = 2 haftalık üretim; fazlası çöp
    // Makro plan Aşama 1a (15 Ekim 2026): Oyun İçi Fiyat Endeksi denemesi. Varsayılanlar eski davranışı korur.
    disGiris: num('disGiris', 0),        // 1. haftada dışarıdan kasalara giren ASTRA (trade payı: her harcama gibi bölünür); haftada azalır
    disYari: num('disYari', 12),         // dış girişin yarılanma süresi (hafta): fiyat yükseldikçe aynı dolar daha az ASTRA eder
    odulCarpan: num('odulCarpan', 1),    // 1: kasa ödemeleri de çarpanla çarpılır (eski model); 0: oyundaki gibi çarpılmaz (yüzdeyle ödeme)
    endeks: num('endeks', 0), endeksPazar: num('endeksPazar', 0),            // 1: bedel çarpanı = en büyüğü(Oyun İçi Fiyat Endeksi, fiyat çarpanı)
    endeksYukari: 0.25, endeksAsagi: 0.05   // endeks haftada en çok %25 yükselir, %5 iner
  };
}

export function run(P) {
  const P0 = Object.fromEntries(RES.map(r => [r, P0BASE[r] * P.fiyatOlcek]));
  // ── pazar havuzları: ASTRA değer ağırlıklı tohum ──
  const wSum = RES.reduce((s, r) => s + TABAN[r] * P0[r], 0);
  const pool = {}; for (const r of RES) { const a = P.pazar * TABAN[r] * P0[r] / wSum; pool[r] = { A: a, R: a / P0[r] }; }
  const price = r => pool[r].A / pool[r].R;
  const K = { ...P.seed, ubi: 0 };                       // kasalar (ASTRA)
  const T = { burn: 0, creator: 0, spent: 0, deposits: 0, buybackSpent: 0, resBurned: 0, waste: 0, hazirlik: 0, sold: {}, unsold: {} };
  const spend = (amt) => { if (!(amt > 0)) return; T.spent += amt; T.burn += amt * P.split.burn; T.creator += amt * P.split.creator; K.ubi += amt * P.split.ubi;
    const t = amt * (1 - P.split.burn - P.split.creator - P.split.ubi); for (const k in P.alloc) K[k] += t * P.alloc[k]; };
  // ── oyuncu grupları ──
  const cohorts = []; const addWave = (n, w) => { for (const t of TYPES) { const c = Math.round(n * P.mix[t]); if (c > 0) cohorts.push({ type: t, count: c, since: w, level: 1, xp: 0, bal: 250, stock: Object.fromEntries(RES.map(r => [r, 0])), haz: Object.fromEntries(RES.map(r => [r, 0])), army: 0, inc: 0, out: 0, incHist: [], outHist: [] }); } };
  addWave(P.N, 0);
  let otorite = 0, otoritePool = 0;
  const otoriteCost = L => P.otoriteTaban * Math.pow(P.otoriteKat, L);
  const monthly = []; let m = 1;      // fiyat çarpanı
  const qppNow = Object.fromEntries(RES.map(r => [r, P.qpp]));   // termostatta kaynak başına kişi başı kota
  let ubiPaid = 0;
  // x40: makro modelin "trade 750 $/ay" senaryosundaki gibi fiyat bir yılda ~40 katına çıkar (üstel)
  const priceAt = w => { const f = w / P.weeks; return P.fiyat === 'x3' ? P.p0usd * (1 + 2 * f) : P.fiyat === 'yarim' ? P.p0usd * (1 - 0.5 * f) : P.fiyat === 'x40' ? P.p0usd * Math.pow(40, w / 48) : P.p0usd; };
  let weeklyPay = 0;
  // Oyun İçi Fiyat Endeksi: son 4 haftada kişi başı haftalık dağıtım ÷ tasarım dağıtımı (tohum kasaların haftalık oranıyla, N oyuncuya)
  const tasarimKisi = (P.seed.dungeon * P.pay.dungeon + P.seed.arena * P.pay.arena + P.seed.boss * P.pay.boss + P.seed.quest * P.pay.quest) / P.N;
  const dagitimGecmis = []; let endeks = 1, fiyatCarpani = 1;
  const olcum = { endeksEnYuksek: 1, karsilanabilirlik: [] };   // karşılanabilirlik: ücretsiz oyuncunun seviye ASTRA bedeli ÷ haftalık geliri

  for (let w = 1; w <= P.weeks; w++) {
    if (w % 4 === 1 && w > 1) addWave(cohorts.reduce((s, c) => s + c.count, 0) * P.growth, w);
    const N = cohorts.reduce((s, c) => s + c.count, 0);
    const p = priceAt(w); const target = p < P.p0usd ? P.p0usd / p : Math.pow(P.p0usd / p, 0.6);
    fiyatCarpani = Math.max(fiyatCarpani * 0.95, Math.min(fiyatCarpani * 1.05, target));
    if (P.endeks && dagitimGecmis.length) {
      const son = dagitimGecmis.slice(-4); const hedefE = Math.max(1, son.reduce((s, v) => s + v, 0) / son.length / tasarimKisi);
      endeks = Math.max(endeks * (1 - P.endeksAsagi), Math.min(endeks * (1 + P.endeksYukari), hedefE));
      olcum.endeksEnYuksek = Math.max(olcum.endeksEnYuksek, endeks);
    }
    m = P.endeks ? Math.max(endeks, fiyatCarpani) : fiyatCarpani;
    const mPazar = P.endeks && !P.endeksPazar ? fiyatCarpani : m;   // pazar koridoru, termostat ve geri alım: endeks yalnız bedellere (endeksPazar=1 ise pazara da)
    if (P.disGiris > 0) spend(P.disGiris * Math.pow(0.5, (w - 1) / P.disYari));   // trade payı oyuna: her harcama gibi bölünür
    // Otorite etkisi
    const oMult = 1 + OT.PER_LEVEL_BONUS * otorite, oHours = ((OT.HOURS_BASE + OT.HOURS_PER_LEVEL * otorite) * (OT.DAYS_BASE + OT.DAYS_PER_LEVEL * otorite)) / 168;
    // ── 1) kota ve Üretim Hakkı dağılımı ──
    if (P.kotaModu === 'termostat' && w > 1) for (const r of RES) {   // arz fiyatı izler: fiyat hedefin üstündeyse kota artar, altındaysa azalır
      const rel = price(r) / (P0[r] * mPazar) / P.termoHedef;
      if (P.havuz) qppNow[r] = yeniHavuzCarpani(qppNow[r], rel, 1, { ...URETIM_HAKKI, QPP_MIN: P.qppMin, QPP_MAX: P.qppMax });   // fiyat bandı (0,8-1,5): altında arz kısılır, üstünde açılır
      else { const step = Math.max(-P.termoAdim, Math.min(P.termoAdim, (rel - 1))); qppNow[r] = Math.min(P.qppMax, Math.max(P.qppMin, qppNow[r] * (1 + step))); }
    }
    let ws = cohorts.map(c => P.act[c.type] * (1 + 0.025 * c.level) * P.katki[c.type]);
    const wMin = Math.min(...ws); ws = ws.map(x => Math.min(x, P.hakTavan * wMin));
    const W = cohorts.reduce((s, c, i) => s + ws[i] * c.count, 0);
    // Havuz modeli: G (oyuncu sayısından bağımsız) taban pay + üst pay olarak dağıtılır; eski model: kişi başı kota x N
    const dagit = {};
    const Q = Object.fromEntries(RES.map(r => {
      if (!P.havuz) return [r, qppNow[r] * TABAN[r] * 168 * N * oMult * oHours * P.kota];
      const birim = TABAN[r] * 168 * P.havuzKisisel * oMult * oHours * P.kota;
      const liste = []; cohorts.forEach((c, i) => { for (let j = 0; j < c.count; j++) liste.push({ L: birim * ws[i] / P.katki[c.type], S: P.katki[c.type] }); });
      const G = qppNow[r] * TABAN[r] * 168 * P.havuzRef * oMult * oHours * P.kota;
      dagit[r] = havuzDagit(liste, G, P.tabanPayi);
      return [r, dagit[r].total];
    }));
    const prod = cohorts.map(() => ({})); let used = {};
    for (const r of RES) {
      const out = cohorts.map(c => TABAN[r] * 168 * P.act[c.type] * (1 + 0.01 * c.level));
      let hak = P.havuz
        ? cohorts.map((c, i) => oyuncuPayi(TABAN[r] * 168 * P.havuzKisisel * oMult * oHours * P.kota * ws[i] / P.katki[c.type], P.katki[c.type], dagit[r]))
        : cohorts.map((c, i) => Q[r] * ws[i] / W);
      let take = out.map((o, i) => Math.min(o, hak[i]));
      let unused = cohorts.reduce((s, c, i) => s + (hak[i] - take[i]) * c.count, 0);
      const needers = cohorts.map((c, i) => Math.max(0, out[i] - take[i]) * c.count); const needTot = needers.reduce((a, b) => a + b, 0);
      if (unused > 0 && needTot > 0) { const f = Math.min(1, unused / needTot); take = take.map((t, i) => t + Math.max(0, out[i] - t) * f); }
      cohorts.forEach((c, i) => { prod[i][r] = take[i]; });
      used[r] = cohorts.reduce((s, c, i) => s + take[i] * c.count, 0);
    }
    const quotaUse = RES.reduce((s, r) => s + used[r] / Q[r], 0) / RES.length;
    // ── 2) oyuncu haftası ──
    const sellWant = Object.fromEntries(RES.map(r => [r, []]));
    let income = { f2p: 0, mid: 0, whale: 0 }, outgo = { f2p: 0, mid: 0, whale: 0 };
    const earn = (c, a) => { if (a > 0) { c.bal += a; c.inc += a; income[c.type] += a * c.count; } };
    const pay = (c, a) => { const x = Math.min(a, Math.max(0, c.bal)); c.bal -= x; c.out += x; outgo[c.type] += x * c.count; spend(x * c.count); return x; };
    cohorts.forEach((c, i) => {
      c.inc = 0; c.out = 0;
      const pr = { ...prod[i] };
      for (const r of RES) { const o = pr[r] * P.ortak; pr[r] -= o; otoritePool += o * c.count; }        // ortak kasa %5 → Otorite
      // ihtiyaçlar (hammadde)
      const need = Object.fromEntries(RES.map(r => [r, 0]));
      need.odun += pr.odun * P.toolRes; need.demir += pr.demir * P.toolRes;                           // alet onarımı
      need.bugday += pr.bugday * P.staminaWheat + c.army * 14 * URETIM;                                        // stamina + asker beslemesi
      need.ot += c.army * 0.5 * URETIM;
      pay(c, (pr.odun * P.toolRes * price('odun') + pr.demir * P.toolRes * price('demir')) * P.toolAda);   // onarımın ASTRA kısmı
      // seviye
      // seviye: XP altı alan sürekli çalışmaya göre (gerçek tablo); bedel gerçek motordan (silo tavanına kırpılmış hammadde + ASTRA)
      c.xp += 7 * P.act[c.type]; const lv = LEVEL[Math.min(80, c.level)]; const needDays = Math.max(0.1, lv.xp / XP_GUNLUK);
      // 19 Ekim 2026: seviye ancak hammadde de varsa atlanır (eldeki + bu haftaki üretim + eksiği pazardan alacak ASTRA); eskiden yalnız XP ve ASTRA bakılıyordu
      if (c.xp >= needDays) {
        const cost = lv.adAstra * m * P.fiyatOlcek; let alimMaliyeti = 0, olur = true;
        for (const r of RES) { const eksik = lv.costs[r] - (pr[r] + c.stock[r]); if (eksik > 0) { if (eksik >= pool[r].R * 0.4) { olur = false; break; } alimMaliyeti += pool[r].A * eksik / (pool[r].R - eksik); } }
        if (olur && c.bal >= cost + alimMaliyeti) { pay(c, cost); for (const r of RES) need[r] += lv.costs[r]; c.level++; c.xp -= needDays; }
      }
      // bot ücreti
      if (c.type !== 'f2p') pay(c, RES.reduce((s, r) => s + pr[r] * price(r), 0) * P.botFee);
      // yatırım (dış para)
      if (P.yatir[c.type] > 0) { const d = P.yatir[c.type] / 52; c.bal += d; T.deposits += d * c.count; }
      // fazla / eksik
      for (const r of RES) {
        let s = pr[r] + c.stock[r] - need[r];
        if (s < 0) {   // pazardan al
          const q = -s; const cost = pool[r].A * q / (pool[r].R - Math.min(q, pool[r].R * 0.4));
          if (c.bal >= cost) { pay(c, 0); c.bal -= cost; c.out += cost; outgo[c.type] += cost * c.count; pool[r].A += cost * c.count; pool[r].R -= q * c.count; spend(cost * c.count * P.fee); }
          c.stock[r] = 0; continue;
        }
        if (['tas', 'demir', 'odun'].includes(r)) { const o = s * P.otoriteShare; s -= o; otoritePool += o * c.count; }   // Otorite'ye gönüllü katkı
        const capH = P.hazirlikCapWeeks * pr[r]; const roomTot = Math.max(0, P.hazirlikToplam - T.hazirlik) / P0[r] / c.count;
        const h = Math.min(s * P.hazirlik, Math.max(0, capH - c.haz[r]), roomTot); c.haz[r] += h; s -= h; T.hazirlik += h * c.count * P0[r];
        sellWant[r].push({ c, i, q: s });
      }
    });
    // ── 3) pazar satışı (taban fiyata kadar, orantılı) ──
    for (const r of RES) {
      const { A: Aa, R } = pool[r]; const floor = P.taban * P0[r] * mPazar;
      const maxNet = Math.max(0, Math.sqrt(Aa * R / floor) - R);          // taban fiyata kadar satılabilecek net miktar
      const want = sellWant[r].reduce((s, x) => s + x.q * x.c.count, 0);
      const f = want > 0 ? Math.min(1, maxNet / (want * (1 - P.resFee))) : 0;
      let netIn = 0, astraOut = 0;
      for (const x of sellWant[r]) {
        const q = x.q * f * x.c.count, net = q * (1 - P.resFee); T.resBurned += q * P.resFee;
        const gross = pool[r].A * net / (pool[r].R + net); pool[r].R += net; pool[r].A -= gross;
        const got = gross * (1 - P.fee); spend(gross * P.fee); earn(x.c, got / x.c.count); netIn += net; astraOut += got;
        const left = x.q * (1 - f); const cap = P.siloWeeks * prod[x.i][r]; x.c.stock[r] = Math.min(left, cap); T.waste += Math.max(0, left - cap) * x.c.count;
      }
      T.sold[r] = (T.sold[r] || 0) + netIn; T.unsold[r] = (T.unsold[r] || 0) + want * (1 - f);
    }
    // ── 4) kasalardan ödemeler ──
    weeklyPay = 0;
    const payPool = (k, rate, weightFn) => { const budget = K[k] * rate * (P.odulCarpan ? m : 1); const ws = cohorts.map(weightFn); const tot = ws.reduce((s, x, i) => s + x * cohorts[i].count, 0); if (!(tot > 0) || !(budget > 0)) return; K[k] -= budget; weeklyPay += budget; cohorts.forEach((c, i) => earn(c, budget * ws[i] / tot)); };
    payPool('dungeon', P.pay.dungeon, c => c.army > 0 ? c.army : 0);
    payPool('arena', P.pay.arena, c => (c.type === 'f2p' ? 0 : Math.max(1, c.army)));
    payPool('boss', P.pay.boss, c => P.act[c.type] * (1 + 0.1 * c.level));
    payPool('quest', P.pay.quest, c => 1);
    { const f2pN = cohorts.filter(c => c.type === 'f2p' && c.level >= 3).reduce((s, c) => s + c.count, 0);   // ücretsiz pay: ayda arzın %1'i (token), kasanın haftada ≤%2'si
      const want = P.faucetSupplyShareMonth * P.supply / 4.33, give = Math.min(want, K.quest * P.faucetPoolCapWeek); if (f2pN > 0 && give > 0) { K.quest -= give; weeklyPay += give; cohorts.filter(c => c.type === 'f2p' && c.level >= 3).forEach(c => earn(c, give / f2pN)); } }
    ubiPaid = 0;
    { const ws = cohorts.map(c => c.level >= 3 ? 1 + 0.75 * Math.sqrt(c.level - 1) : 0); const tot = ws.reduce((s, x, i) => s + x * cohorts[i].count, 0); if (tot > 0) { const b = K.ubi; K.ubi = 0; ubiPaid = b; cohorts.forEach((c, i) => earn(c, b * ws[i] / tot)); } }
    // ── 5) ordu harcaması (ASTRA + pazardan hammadde alıp yakma) ──
    cohorts.forEach(c => {
      const a = c.inc * P.armyShare[c.type]; if (!(a > 0)) return;
      const x = pay(c, a * 0.5);                                   // asker/teçhizat ASTRA kısmı
      let budget = Math.min(a * 0.5, Math.max(0, c.bal)) * c.count; // hammadde kısmı: demir %50, kömür %30, taş %20
      for (const [r, s] of [['demir', 0.5], ['komur', 0.3], ['tas', 0.2]]) { const b = budget * s; const ceil = P.tavan * P0[r] * mPazar; const xMax = Math.max(0, pool[r].R - Math.sqrt(pool[r].A * pool[r].R / ceil)); const q = Math.min(pool[r].R * b / (pool[r].A + b), xMax); if (q > 0) { const cost = pool[r].A * q / (pool[r].R - q); pool[r].A += cost; pool[r].R -= q; c.bal -= cost / c.count; c.out += cost / c.count; outgo[c.type] += cost; spend(cost * P.fee); T.resBurned += q; } }
      c.army += (x + budget / c.count) / (P.askerBirim * P.fiyatOlcek * (P.endeks ? m : 1));    // askerBirim ASTRA ≈ 1 asker gücü
    });
    // ── 6) geri alım: fiyat eşiğin altındaysa kasanın %x'i ile al-yak ──
    for (const r of RES) { const thr = P.geriAlimEsik * P0[r] * mPazar; if (price(r) < thr && K.buyback > 0) { const B = K.buyback * P.geriAlimHiz / RES.length; const xThr = Math.max(0, pool[r].R - Math.sqrt(pool[r].A * pool[r].R / thr)); const xB = pool[r].R * B / (pool[r].A + B); const q = Math.min(xThr, xB); if (q > 0) { const cost = pool[r].A * q / (pool[r].R - q); pool[r].A += cost; pool[r].R -= q; K.buyback -= cost; T.buybackSpent += cost; T.resBurned += q; } } }
    // ── 7) Otorite ilerlemesi (karışımın TAMAMI hammadde: çelik payı kömürdür, Konsey kasasından ASTRA çıkmaz; 13 Ekim 2026) ──
    while (otorite < OT.MAX_LEVEL && otoritePool >= otoriteCost(otorite)) { otoritePool -= otoriteCost(otorite); otorite++; }
    cohorts.forEach(c => { c.incHist.push(c.inc); c.outHist.push(c.out); });
    dagitimGecmis.push(weeklyPay / Math.max(1, N));
    { const f = cohorts.filter(c => c.type === 'f2p'); const n = f.reduce((s, c) => s + c.count, 0); const gelir = n ? f.reduce((s, c) => s + c.inc * c.count, 0) / n : 0;
      const sv = n ? Math.round(f.reduce((s, c) => s + c.level * c.count, 0) / n) : 1; const bedel = LEVEL[Math.min(80, sv)].adAstra * m * P.fiyatOlcek;
      if (w % 4 === 0) olcum.karsilanabilirlik.push(gelir > 0 ? +(bedel / gelir).toFixed(3) : null); }
    // ── aylık kayıt ──
    if (w % 4 === 0) {
      const idx = Math.exp(RES.reduce((s, r) => s + Math.log(price(r) / (P0[r] * mPazar)), 0) / RES.length);   // çarpan düzeltilmiş fiyat endeksi
      const idxUsd = Math.exp(RES.reduce((s, r) => s + Math.log(price(r) * p / (P0[r] * P.p0usd)), 0) / RES.length);
      const byType = {}; for (const t of TYPES) { const cs = cohorts.filter(c => c.type === t); const n = cs.reduce((s, c) => s + c.count, 0); byType[t] = { n, inc: income[t] / Math.max(1, n), net: (income[t] - outgo[t]) / Math.max(1, n), level: cs.length ? Math.round(cs.reduce((s, c) => s + c.level * c.count, 0) / n) : 0, bal: cs.length ? cs.reduce((s, c) => s + c.bal * c.count, 0) / n : 0 }; }
      const incTot = TYPES.reduce((s, t) => s + income[t], 0);
      const pools = ['dungeon', 'arena', 'boss', 'buyback', 'quest', 'carnival'].reduce((s, k) => s + K[k], 0);
      monthly.push({ ay: w / 4, N, idx: +idx.toFixed(3), idxUsd: +idxUsd.toFixed(3), fiyat: Object.fromEntries(RES.map(r => [r, +price(r).toFixed(2)])), m: +m.toFixed(3), quotaUse: +quotaUse.toFixed(2), qpp: +(RES.reduce((s, r) => s + qppNow[r], 0) / RES.length).toFixed(3), otorite, pools: Math.round(pools), pazarASTRA: Math.round(RES.reduce((s, r) => s + pool[r].A, 0)), runwayMonths: weeklyPay > 0 ? +(pools / (weeklyPay * 4.33)).toFixed(1) : 999, byType, top5Share: incTot > 0 ? +(income.whale / incTot).toFixed(2) : 0, whaleF2pRatio: byType.f2p.inc > 0 ? +(byType.whale.inc / byType.f2p.inc).toFixed(1) : 0, burned: Math.round(T.burn), buyback: Math.round(T.buybackSpent), waste: Math.round(T.waste), hazirlikASTRA: Math.round(T.hazirlik) });
    }
  }
  const last = monthly[monthly.length - 1];
  const idxMin = Math.min(...monthly.map(x => x.idx)), idxUsdMin = Math.min(...monthly.map(x => x.idxUsd));
  const runwayMin = Math.min(...monthly.map(x => x.runwayMonths));
  const f2pUsdMonth = last.byType.f2p.net * 4.33 * priceAt(P.weeks);
  const checks = { fiyat: idxMin >= 0.5, kasa: runwayMin >= 12, f2pSeviye: last.byType.f2p.level >= 8, adalet: last.whaleF2pRatio <= 6 && last.top5Share <= 0.35, kota: last.quotaUse >= 0.6 };
  const passed = Object.values(checks).filter(Boolean).length;
  return { P: { N: P.N, fiyatOlcek: P.fiyatOlcek, qpp: P.qpp, qppSon: last.qpp, kotaModu: P.kotaModu, kota: P.kota, pazar: P.pazar, geriAlimEsik: P.geriAlimEsik, hazirlik: P.hazirlik, fiyat: P.fiyat, hakTavan: P.hakTavan, yatirMid: P.yatir.mid, yatirWhale: P.yatir.whale }, idxMin: +idxMin.toFixed(2), idxUsdMin: +idxUsdMin.toFixed(2), runwayMin, f2pLevel: last.byType.f2p.level, f2pNetMonth: Math.round(last.byType.f2p.net * 4.33), f2pUsdMonth: +f2pUsdMonth.toFixed(4), whaleF2pRatio: last.whaleF2pRatio, top5Share: last.top5Share, quotaUse: last.quotaUse, otorite: last.otorite, pazarASTRA: last.pazarASTRA, pools: last.pools, burned: last.burned, buyback: last.buyback, waste: last.waste, hazirlik: last.hazirlikASTRA, deposits: Math.round(T.deposits), endeksEnYuksek: +olcum.endeksEnYuksek.toFixed(2), karsilanabilirlik: olcum.karsilanabilirlik, checks, passed, monthly };
}

const fmt = v => Math.round(v).toLocaleString('tr-TR');
if (A.grid) {
  const combos = []; const grid = { qpp: [0.25, 0.4, 0.6], pazar: [60e6, 100e6], geriAlimEsik: [0.7, 0.85], hazirlik: [0.1, 0.3] };
  for (const qpp of grid.qpp) for (const pazar of grid.pazar) for (const g of grid.geriAlimEsik) for (const h of grid.hazirlik) {
    const rows = [50, 200, 500, 1000].map(N => run({ ...defaults(), N, qpp, pazar, geriAlimEsik: g, hazirlik: h }));
    const worst = { passed: Math.min(...rows.map(r => r.passed)), idxMin: Math.min(...rows.map(r => r.idxMin)), runwayMin: Math.min(...rows.map(r => r.runwayMin)), f2pLevel: Math.min(...rows.map(r => r.f2pLevel)), ratio: Math.max(...rows.map(r => r.whaleF2pRatio)), quotaUse: Math.min(...rows.map(r => r.quotaUse)) };
    combos.push({ qpp, pazar, geriAlimEsik: g, hazirlik: h, worst, rows: rows.map(r => ({ N: r.P.N, passed: r.passed, idxMin: r.idxMin, runwayMin: r.runwayMin, f2pLevel: r.f2pLevel, ratio: r.whaleF2pRatio, quotaUse: r.quotaUse, waste: r.waste })) });
  }
  combos.sort((a, b) => b.worst.passed - a.worst.passed || b.worst.idxMin - a.worst.idxMin);
  console.log('qpp | pazar | geriAlım eşik | hazırlık | en kötü N: geçen/5 | fiyat endeksi min | kasa ömrü min (ay) | f2p seviye min | balina/f2p gelir max | kota kullanımı min');
  for (const c of combos) console.log(`${c.qpp} | ${fmt(c.pazar / 1e6)} M | ${c.geriAlimEsik} | ${c.hazirlik} | ${c.worst.passed} | ${c.worst.idxMin} | ${c.worst.runwayMin} | ${c.worst.f2pLevel} | ${c.worst.ratio} | ${c.worst.quotaUse}`);
  if (A.out) fs.writeFileSync(A.out, JSON.stringify(combos, null, 1));
} else {
  const r = run(defaults());
  console.log(`N=${r.P.N} fiyatÖlçek=${r.P.fiyatOlcek} kota=${r.P.kotaModu} qpp=${r.P.qpp}→${r.P.qppSon} kota×${r.P.kota} pazar=${fmt(r.P.pazar)} geriAlım<${r.P.geriAlimEsik} hazırlık=${r.P.hazirlik} fiyat=${r.P.fiyat} yatırım orta/balina=${fmt(r.P.yatirMid)}/${fmt(r.P.yatirWhale)}`);
  console.log('ay | oyuncu | fiyat endeksi (ASTRA / $) | çarpan | kota kull. | kişi başı kota | Otorite | kasalar | kasa ömrü ay | pazar ASTRA | f2p sv / aylık net | orta sv | balina sv | balina/f2p | ilk %5 payı | yakılan | geri alım | çöp | hazırlık deposu (ASTRA değeri)');
  for (const x of r.monthly) console.log(`${x.ay} | ${fmt(x.N)} | ${x.idx} / ${x.idxUsd} | ${x.m} | ${x.quotaUse} | ${x.qpp} | ${x.otorite} | ${fmt(x.pools)} | ${x.runwayMonths} | ${fmt(x.pazarASTRA)} | ${x.byType.f2p.level} / ${fmt(x.byType.f2p.net * 4.33)} | ${x.byType.mid.level} | ${x.byType.whale.level} | ${x.whaleF2pRatio} | ${x.top5Share} | ${fmt(x.burned)} | ${fmt(x.buyback)} | ${fmt(x.waste)} | ${fmt(x.hazirlikASTRA)}`);
  console.log('SONUÇ', JSON.stringify({ ...r, monthly: undefined }));
  if (A.out) fs.writeFileSync(A.out, JSON.stringify(r, null, 1));
}
