// Realm of AdAstra sunucusu — dünya: piyasa verisi, çekim havuzu ve çekim talepleri
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { brakeState, withdrawCapTokens, dualWithdrawCap, priceFactorK, netTokenFlow, WEEKLY_RULES } from '../economy.js';
import { fmt, DAY } from './yardimci.js';

const dayKey = t => new Date(t).toISOString().slice(0, 10);

export function olusturPiyasa(w) {
  const { db, E, chain, cfg, clock, econ, setEcon } = w;
  // ── Piyasa ──────────────────────────────────────────────────────────────
  async function snapshotMarket() {
    if (!chain) return null;
    const m = await chain.readMarket();
    db.q.priceAdd.run(m.at, m.priceUsd, m.mcapUsd, m.supply, m.dead, m.avaxUsd, m.graduated ? 1 : 0);
    const e = econ();
    const hist = db.q.pricesSince.all(clock() - 31 * DAY).map(r => ({ at: r.at, mcapUsd: r.mcap_usd }));
    const brake = brakeState(hist, e.brake || {}, clock());
    // KARAR 5/6: günlük net token akışı (dış alım ölçümü) ve tek fiyat çarpanı k
    const flow = { ...(e.flow || {}) };
    const key = dayKey(m.at);
    flow[key] = (Number(flow[key]) || 0) + netTokenFlow(e.market, m);
    const oldest = dayKey(m.at - 40 * DAY);
    for (const d of Object.keys(flow)) if (d < oldest) delete flow[d];
    const patch = { market: m, brake, flow, k: priceFactorK(brake) };
    if (!(e.launchPriceUsd > 0)) patch.launchPriceUsd = cfg.launchPriceUsd > 0 ? cfg.launchPriceUsd : m.priceUsd;
    setEcon(patch);
    return m;
  }

  // Son 4 haftadaki dış alım (token): piyasadan net alım (negatifse 0) + trade sitesinden oyuna gelen pay
  function externalBuy(now = clock(), e = econ()) {
    const from = now - WEEKLY_RULES.externalWindowDays * DAY;
    const fromKey = dayKey(from);
    let net = 0;
    for (const [d, v] of Object.entries(e.flow || {})) if (d >= fromKey) net += Number(v) || 0;
    const partner = db.raw.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM partner_income WHERE at >= ?').get(from).t;
    return Math.max(0, net) + (Number(partner) || 0);
  }

  function currentCap(market = econ().market) {
    if (!market) return 0;
    const e = econ();
    let cap = dualWithdrawCap({ baseCap: withdrawCapTokens(market), k: e.k, externalBuy: externalBuy(clock(), e) });
    cap = Math.min(cap, cfg.weeklySendCapAda);
    if (chain && chain.gameWallet && market.walletAda != null) cap = Math.min(cap, Math.max(0, market.walletAda));
    return cap;
  }

  // Oyuncunun kapanan haftadaki katkı puanı (kayıttan, oyuncuyu yüklemeden)
  function weekScore(st, epoch) {
    const c = st && st.contribution;
    if (!c) return 0;
    if (c.epochId === epoch) return Number(c.week) || 0;
    if (c.epochId === epoch + 1) return Number(c.lastWeek) || 0;
    return 0;
  }

  // ── Çekim talebi (oyuncu) ──────────────────────────────────────────────
  function requestWithdraw(address, amount) {
    const amt = Math.floor((Number(amount) || 0) * 100) / 100;
    if (!(amt >= cfg.minWithdrawAda)) return { success: false, message: `En az ${fmt(cfg.minWithdrawAda)} ADA çekebilirsin.` };
    if (econ().paused) return { success: false, message: 'Çekimler şu an bakımda. Kısa süre sonra tekrar dene.' };
    const { result } = E.withPlayer(address, gs => {
      const lk = gs.getLockedBalanceInfo();
      if (amt > lk.free + 1e-9) return { success: false, message: `Çekilebilir (serbest) bakiyen ${fmt(lk.free)} ADA.` };
      gs.state.adAstraBalance -= amt;
      gs.state.lockedAda = Math.min(Number(gs.state.lockedAda) || 0, gs.state.adAstraBalance);
      gs.state.pendingWithdrawAda = (Number(gs.state.pendingWithdrawAda) || 0) + amt;
      return { success: true, pending: gs.state.pendingWithdrawAda, message: `🏦 ${fmt(amt)} ADA çekim sırasına alındı. Pazartesi 00:01'de haftalık havuzdan karşılanır; sığmayan kısım bakiyene döner.` };
    });
    if (result.success) db.q.playerSetPending.run(result.pending, address);
    return result;
  }

  function cancelWithdraw(address) {
    const { result } = E.withPlayer(address, gs => {
      const p = Number(gs.state.pendingWithdrawAda) || 0;
      if (!(p > 0)) return { success: false, message: 'Bekleyen çekim talebin yok.' };
      gs.state.adAstraBalance += p;
      gs.state.pendingWithdrawAda = 0;
      return { success: true, returned: p, message: `↩️ ${fmt(p)} ADA bakiyene geri döndü.` };
    });
    if (result.success) db.q.playerSetPending.run(0, address);
    return result;
  }

  function withdrawStatus(address) {
    const st = E.readPlayer(address) || {};
    const e = econ();
    const live = e.live || {};
    const myScore = weekScore(st, E.globalPool.state.epochId);
    const cap = currentCap();
    return {
      pending: Number(st.pendingWithdrawAda) || 0,
      free: Math.max(0, (Number(st.adAstraBalance) || 0) - Math.min(Number(st.lockedAda) || 0, Number(st.adAstraBalance) || 0)),
      locked: Math.min(Number(st.lockedAda) || 0, Number(st.adAstraBalance) || 0),
      weekScore: myScore,
      scoreTotal: live.scoreTotal || 0,
      weeklyCap: cap,
      priceFactorK: Number(e.k) || 1,
      externalBuy4w: externalBuy(clock(), e),
      estimatedRight: live.scoreTotal > 0 ? cap * myScore / live.scoreTotal : 0,
      brake: !!(e.brake && e.brake.on),
      feeRate: e.brake && e.brake.on ? WEEKLY_RULES.feeBrake : WEEKLY_RULES.fee,
      rentRate: WEEKLY_RULES.rent,
      minWithdraw: cfg.minWithdrawAda,
      nextSettlementAt: E.globalPool.state.epochEndTime,
      paused: !!e.paused,
      history: db.q.withdrawLogOf.all(address).map(r => ({ epoch: r.epoch, ...JSON.parse(r.data) })),
      payouts: db.q.payoutsOf.all(address)
    };
  }


  return { snapshotMarket, currentCap, externalBuy, weekScore, requestWithdraw, cancelWithdraw, withdrawStatus };
}
