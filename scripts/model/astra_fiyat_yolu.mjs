// Realm of AdAstra v2 — R4c ASTRA FİYAT YOLU MODELİ (zincir tarafı, 3 yıl, haftalık)
// ============================================================================
// Soru: oyun ayda ~5 M ASTRA dağıtırken, yakım + kilit + haftalık çekim sınırı + oyuncu alımları + trade girişi ile
// ASTRA fiyatı nereye gider; kapı kuralı (kişi başı aylık 100 $) hangi ayda açılır; yakım ve kilit ne kadar fark eder?
// Zincir: Arena eğrisi (fiyat ∝ arz², a=901, c=232210432401), 7,3 milyarda mezuniyet, sonra sabit çarpımlı borsa havuzu.
// Kullanım: node scripts/model/astra_fiyat_yolu.mjs senaryo=orta [yakim=1 kilit=1 sat=0.25 weeks=156 out=dosya.json]
// Öneri aracıdır; oyuna bağlı değildir.
// ============================================================================
// 13 Ekim 2026 denetimi EK-09: oyun tarafı sabitleri (harcama bölüşümü, kilit, kasa tohumları, haftalık ödeme oranı, çekim ücreti ve
// UBI payı) artık js/config.js ve server/economy.js'ten okunur. Eskiden elle yazılıydı ve kodla uyumsuzdu (çekim ücretinin UBI payı
// 0,70 idi, kodda 0,50; kasa tohumu 48 M elle yazılmıştı).
import fs from 'fs';
import { GAME_CONFIG as C } from '../../js/config.js';
import { WEEKLY_RULES as WR } from '../../server/economy.js';
import { zincirOlustur } from './zincir.mjs';
const A = Object.fromEntries(process.argv.slice(2).map(x => x.split('=')));
const num = (k, d) => (A[k] != null ? Number(A[k]) : d);
const SENARYO = {
  dusuk: { aliciPay: 0.20, aliciUsdAy: 2, tradeUsdAy: 0, destekUsd: 0, destekAy: 0 },
  orta:  { aliciPay: 0.30, aliciUsdAy: 5, tradeUsdAy: 500, destekUsd: 0, destekAy: 0 },
  yuksek:{ aliciPay: 0.40, aliciUsdAy: 10, tradeUsdAy: 2000, destekUsd: 20000, destekAy: 6 }
};
const S = SENARYO[A.senaryo || 'orta'];
const P = {
  weeks: num('weeks', 156), avaxUsd: num('avax', 11.43),
  N0: num('N0', 50), Nmax: num('Nmax', 1000), kapiHedefUsd: num('hedef', 100), kapiArtis: 0.10,
  // havuz: oyuncuya ödeme yapan + proje kasaları (TREASURY_SEED'den); ödeme oranı: kasaların haftalık bütçe oranlarının ortalaması
  havuz0: num('havuz', ['dungeon', 'arena', 'worldBoss', 'ammBuyback', 'quest', 'carnival', 'konsey'].reduce((s, k) => s + C.TREASURY_SEED[k], 0)),
  odemeHafta: num('odeme', (() => { const R = C.TREASURY_WEEKLY_BUDGET.RATES; const v = Object.values(R); return v.reduce((s, x) => s + x, 0) / v.length; })()),
  pazarNet0: num('pazarNet', 0.55e6), pazarNetAzalma: 0.97,
  harcamaPayi: num('harcama', 0.6),           // dağıtılan gelirin oyun içinde yeniden harcanan payı
  yakim: num('yakim', 1), kilit: num('kilit', 1),
  burnSpend: C.TOKEN_BURN_RATE, creator: C.CREATOR_ROYALTY_RATE, ubi: C.UBI_POOL_RATE,  // harcama bölüşümü (kalan %86 kasalara)
  freeShare: C.LOCKED_BALANCE.FREE_SHARE, unlockWeek: C.LOCKED_BALANCE.WEEKLY_UNLOCK_BASE + C.LOCKED_BALANCE.WEEKLY_UNLOCK_ACTIVE, unlockSpend: C.LOCKED_BALANCE.UNLOCK_ON_SPEND,
  sat: num('sat', 0.25),                      // serbest bakiyenin haftada satılmak istenen payı
  wdPriceDrop: WR.maxPriceDrop, wdFee: WR.fee, wdFeeUbi: WR.feeUbiShare,   // çekim ücretinin %50'si UBI'ye, %50'si yakılır (KARAR 4, 8 Ekim 2026)
  tradeBurn: 0.2, tradeGame: 0.4, tradeHold: 0.3, tradeReward: 0.1,   // trade gelirinin bolusumu (kullanici 7 Ekim)
  ...S
};
// ── zincir (ortak hesap: scripts/model/zincir.mjs) ──
const Z = zincirOlustur({ avaxUsd: P.avaxUsd });
const { M, price, circ, sellAda } = Z;
const buyUsd = usd => Z.buyUsd(usd, W);
const wdCap = () => Z.wdCap(P.wdPriceDrop);
const burn = q => { if (!(q > 0)) return; if (P.yakim) { Z.burnTokens(q); T.burned += q; } else { H.free += q; } };   // yakım kapalıysa token oyuncularda kalır
// ── oyun tarafı (toplu) ──
let N = P.N0, havuz = P.havuz0, ubiNext = 0, W = 0;
const H = { free: 0, locked: 0 };
const T = { burned: 0, soldUsd: 0, boughtUsd: 0, distributed: 0, wdUsdMonth: 0, incMonth: 0, kapiAy: null, N200Ay: null, N1000Ay: null };
const monthly = []; const usdHist = [];
for (W = 1; W <= P.weeks; W++) {
  // 1) dağıtım
  const pazarNet = P.pazarNet0 * Math.pow(P.pazarNetAzalma, W);
  const odeme = havuz * P.odemeHafta; havuz -= odeme;
  const inc = odeme + pazarNet + ubiNext; ubiNext = 0; T.distributed += inc; T.incMonth += inc;
  if (P.kilit) { H.free += inc * P.freeShare; H.locked += inc * (1 - P.freeShare); } else H.free += inc;
  // 2) oyun içi harcama (önce kilitliden)
  let spend = inc * P.harcamaPayi;
  const fromL = Math.min(H.locked, spend); H.locked -= fromL; const fromF = Math.min(H.free, spend - fromL); H.free -= fromF; spend = fromL + fromF;
  if (P.kilit) { const un = Math.min(H.locked, spend * P.unlockSpend); H.locked -= un; H.free += un; }
  // 3) alımlar: oyun içi ihtiyaç (alınan ASTRA hemen harcanır), trade girişi (yarısı yakılır, yarısı kasalara), destekçi
  const buyersUsd = N * P.aliciPay * P.aliciUsdAy / 4.33; const gotGame = buyUsd(buyersUsd); T.boughtUsd += buyersUsd; spend += gotGame;
  const tradeUsd = P.tradeUsdAy / 4.33; if (tradeUsd > 0) { const got = buyUsd(tradeUsd); T.boughtUsd += tradeUsd; burn(got * P.tradeBurn); havuz += got * P.tradeGame; T.tutulan = (T.tutulan || 0) + got * P.tradeHold; H.free += got * P.tradeReward; }   // kullanici beyani 7 Ekim: %20 yakim, %40 oyun kasalari, %30 kullanici (tutulur, satilmaz), %10 trade odul havuzu (trade kullanicilarina)
  if (P.destekUsd > 0 && Math.ceil(W / 4.33) === P.destekAy && (W % 4 === 1)) { const got = buyUsd(P.destekUsd); T.boughtUsd += P.destekUsd; H.locked += got; }   // destekçi tutar (kilitli sayılır)
  // harcama bölüşümü
  burn(spend * P.burnSpend); ubiNext += spend * P.ubi; havuz += spend * (1 - P.burnSpend - P.creator - P.ubi);
  // 4) kilit açılması
  if (P.kilit) { const un = H.locked * P.unlockWeek; H.locked -= un; H.free += un; }
  // 5) çekim ve satış (haftalık sınır: fiyat ≤%2 düşer)
  const want = H.free * P.sat; const sold = Math.min(want, wdCap()); H.free -= sold;
  const fee = sold * P.wdFee; burn(fee * (1 - P.wdFeeUbi)); ubiNext += fee * P.wdFeeUbi;
  const usd = sellAda(sold - fee); T.soldUsd += usd; T.wdUsdMonth += usd;
  // 6) ay sonu: kapı kuralı ve kayıt
  if (W % 4 === 0) {
    const ay = W / 4; const p = price();
    const usdPerPlayer = T.incMonth * p / N; usdHist.push(usdPerPlayer);
    const avg3 = usdHist.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, usdHist.length);
    if (usdHist.length >= 3 && avg3 >= P.kapiHedefUsd && N < P.Nmax) { if (T.kapiAy == null) T.kapiAy = ay; N = Math.min(P.Nmax, Math.round(N * (1 + P.kapiArtis))); }
    if (T.N200Ay == null && N >= 200) T.N200Ay = ay; if (T.N1000Ay == null && N >= 1000) T.N1000Ay = ay;
    monthly.push({ ay, N, fiyatUsd: p, fiyat1M: +(p * 1e6).toFixed(2), mcapUsd: Math.round(p * circ()), havuzAvax: Math.round(Z.rezervAvax()), mezun: M.grad, usdPerPlayer: +usdPerPlayer.toFixed(2), wdUsdPerPlayer: +(T.wdUsdMonth / N).toFixed(2), burned: Math.round(T.burned), locked: Math.round(H.locked), free: Math.round(H.free), havuzAstra: Math.round(havuz), circ: Math.round(circ()) });
    T.incMonth = 0; T.wdUsdMonth = 0;
  }
}
const out = { senaryo: A.senaryo || 'orta', yakim: P.yakim, kilit: P.kilit, sat: P.sat, kapiAy: T.kapiAy, N200Ay: T.N200Ay, N1000Ay: T.N1000Ay, mezunHafta: M.gradWeek, boughtUsd: Math.round(T.boughtUsd), soldUsd: Math.round(T.soldUsd), burned: Math.round(T.burned), son: monthly[monthly.length - 1], monthly };
const fmt = v => Math.round(v).toLocaleString('tr-TR');
console.log(`senaryo=${out.senaryo} yakım=${P.yakim} kilit=${P.kilit} satış eğilimi=${P.sat} | alıcı %${P.aliciPay * 100} × ${P.aliciUsdAy} $/ay, trade ${P.tradeUsdAy} $/ay, destek ${P.destekUsd} $ (${P.destekAy}. ay)`);
console.log('ay | vatandaş | 1M ASTRA $ | piyasa değeri $ | havuz AVAX | mezun | kişi başı $/ay (dağıtılan) | kişi başı çekilen $/ay | yakılan | kilitli | oyun kasası ASTRA');
for (const r of monthly.filter(r => [3, 6, 12, 18, 24, 36].includes(r.ay))) console.log(`${r.ay} | ${r.N} | ${r.fiyat1M} | ${fmt(r.mcapUsd)} | ${fmt(r.havuzAvax)} | ${r.mezun ? 'evet' : 'hayır'} | ${r.usdPerPlayer} | ${r.wdUsdPerPlayer} | ${fmt(r.burned)} | ${fmt(r.locked)} | ${fmt(r.havuzAstra)}`);
console.log(`ÖZET kapı açıldı: ${out.kapiAy ?? 'hiç'} · 200 vatandaş: ${out.N200Ay ?? 'hiç'} · 1000: ${out.N1000Ay ?? 'hiç'} · mezuniyet haftası: ${out.mezunHafta ?? 'hiç'} · alınan ${fmt(out.boughtUsd)} $ · satılan ${fmt(out.soldUsd)} $ · yakılan ${fmt(out.burned)} ASTRA`);
if (A.out) fs.writeFileSync(A.out, JSON.stringify(out, null, 1));
