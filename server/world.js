// Realm of AdAstra sunucusu — dünya işleri: haftalık hesaplaşma, yatırma, çekim, zincir ödemeleri
// ============================================================================
// Haftalık hesaplaşma (her Pazartesi 00:01 TSİ, oyunun hafta değişiminde) — kurallar server/economy.js:
//  1. Çekim talepleri ortak havuzdan katkı puanına göre karşılanır; hak kirası ödenir; sığmayan kısım
//     bakiyeye döner.
//  2. Çekim ücretinin %70'i temel gelire, %30'u yakıma (oranlar RealmRates sözleşmesinden değişebilir).
//  3. Fren açıksa hazine kasalarının %1'i yakılır.
//  4. Ücretsiz oyunculara (hiç yatırma yapmamış, bu hafta oynamış) görev kasasından pay.
//  5. Fiyat çarpanı, temel gelir ağırlıkları güncellenir.
//  6. Oyun içi yakım ve yapımcı payı zincire aktarılır (yakım → ölü adres, yapımcı → yapımcı cüzdanı).
// Zincir ödemeleri "pending → sending → sent" sırasıyla işlenir. Sunucu gönderim sırasında kapanırsa
// kayıt "sending" kalır ve TEKRAR GÖNDERİLMEZ; yönetici panelinden kontrol edilir (çift ödeme olmaz).
// ============================================================================
import { allocateWithdrawals, brakeState, faucetWeekly, nextMultiplier, withdrawCapTokens, WEEKLY_RULES } from './economy.js';
import { SYSTEM } from './engine.js';
import { runDraw } from '../js/economy/lottery.js';
import { qualifies, nextStreak, weightOf, distribute, capFraction, FAUCET_DEFAULTS } from '../js/economy/faucet.js';
import { applyRates, ratesFromConfig, validateRates, toNamed, moneyFlows, RATE_KEYS, RATE_CHANGE_DELAY_SEC } from '../js/economy/rates.js';

const fmt = v => Math.floor(Number(v) || 0).toLocaleString('tr-TR');
const DAY = 86400000;

export function createWorld({ db, engine, chain = null, arena = null, accounts = null, kasa = null, mailer = null, kapi = null, pazar = null, cfg, clock = () => Date.now(), log = console }) {
  const E = engine;
  const econ = () => db.kvJson('world:economy', {});
  const setEcon = patch => { const next = { ...econ(), ...patch }; db.kvSetJson('world:economy', next); return next; };
  const creatorWallet = () => E.GAME_CONFIG.CREATOR_WALLET_ADDRESS;
  // Hepsi ya da hiçbiri: hata olursa veritabanı geri alınır, bellekteki kayıt kopyası da boşaltılır
  const atomic = fn => { try { return db.tx(fn); } catch (err) { E.reloadWorld(); throw err; } };

  // ── ADA oranları (RealmRates sözleşmesi, kullanıcı kararı 6 Ekim 2026) ──
  // Sunucu açılışta en son okunan oranları uygular; 5 dakikada bir sözleşmeden okur. Sözleşme yoksa oyunun kendi
  // ayarları geçerlidir. Okunan oranlar geçersizse (olmamalı: sözleşme de denetler) uygulanmaz.
  const ratesDefault = ratesFromConfig(E.GAME_CONFIG, WEEKLY_RULES);
  const storedRates = () => db.kvJson('world:rates', null);
  { const st = storedRates(); if (st && Array.isArray(st.active)) applyRates(E.GAME_CONFIG, WEEKLY_RULES, st.active); }
  const currentRates = () => { const st = storedRates(); return st && Array.isArray(st.active) ? st.active : ratesFromConfig(E.GAME_CONFIG, WEEKLY_RULES); };

  async function syncRates() {
    if (!chain || !chain.readRates || !cfg.ratesContract) return null;
    const prev = storedRates() || {};
    let r;
    try { r = await chain.readRates(cfg.ratesContract); }
    catch (err) { db.kvSetJson('world:rates', { ...prev, error: err.message, errorAt: clock() }); throw err; }
    if (!r) return null;
    const bad = validateRates(r.active);
    if (bad) { log.warn('Oran sözleşmesi geçersiz oran döndürdü:', bad); db.kvSetJson('world:rates', { ...prev, error: bad, errorAt: clock() }); return null; }
    const changed = !Array.isArray(prev.active) || prev.active.join(',') !== r.active.join(',');
    applyRates(E.GAME_CONFIG, WEEKLY_RULES, r.active);
    const next = { contract: cfg.ratesContract.toLowerCase(), active: r.active, pending: r.pending, pendingAt: r.pendingAt, owner: r.owner, pendingOwner: r.pendingOwner, readAt: clock() };
    db.kvSetJson('world:rates', next);
    if (changed) db.event('rates-changed', null, { from: prev.active || ratesDefault, to: r.active });
    return next;
  }

  function ratesStatus() {
    const st = storedRates() || {};
    const active = currentRates();
    return {
      contract: cfg.ratesContract || null, chainId: cfg.chainId, source: cfg.ratesContract ? 'contract' : 'config',
      keys: RATE_KEYS, delaySec: RATE_CHANGE_DELAY_SEC,
      active, named: toNamed(active), flows: moneyFlows(active),
      pending: st.pending || null, pendingAt: st.pendingAt || 0, pendingFlows: st.pending ? moneyFlows(st.pending) : null,
      owner: st.owner || null, pendingOwner: st.pendingOwner && !/^0x0+$/.test(st.pendingOwner) ? st.pendingOwner : null,
      readAt: st.readAt || 0, error: st.error && (st.errorAt || 0) > (st.readAt || 0) ? st.error : null,
      pools: Object.fromEntries(Object.entries(E.treasury.state.pools || {}).map(([k, v]) => [k, Math.round(Number(v) || 0)])),
      ubi: { accruing: Math.round(Number(E.globalPool.state.ubiWeekAccrued) || 0), claimable: Math.round(Number(E.globalPool.state.ubiClaimPot) || 0) },
      totals: { spent: Math.round(Number(E.globalPool.state.totalSpent) || 0), burned: Math.round(Number(E.globalPool.state.totalBurned) || 0), creator: Math.round(Number(E.globalPool.state.creatorRoyaltyTotal) || 0) },
      burnedResources: E.globalPool.state.totalBurnedResources || {}, burnedItems: E.globalPool.state.totalBurnedItems || {}
    };
  }

  // ── Piyasa ──────────────────────────────────────────────────────────────
  async function snapshotMarket() {
    if (!chain) return null;
    const m = await chain.readMarket();
    db.q.priceAdd.run(m.at, m.priceUsd, m.mcapUsd, m.supply, m.dead, m.avaxUsd, m.graduated ? 1 : 0);
    const e = econ();
    const hist = db.q.pricesSince.all(clock() - 31 * DAY).map(r => ({ at: r.at, mcapUsd: r.mcap_usd }));
    const patch = { market: m, brake: brakeState(hist, e.brake || {}, clock()) };
    if (!(e.launchPriceUsd > 0)) patch.launchPriceUsd = cfg.launchPriceUsd > 0 ? cfg.launchPriceUsd : m.priceUsd;
    setEcon(patch);
    return m;
  }

  function currentCap(market = econ().market) {
    if (!market) return 0;
    let cap = withdrawCapTokens(market);
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

  // ── Yatırma ─────────────────────────────────────────────────────────────
  async function scanDeposits() {
    if (!chain || !chain.gameWallet || !cfg.legacyDeposits) return 0;
    const latest = (await chain.latestBlock()) - 2;                      // 2 blok onay
    let from = Number(db.kvGet('chain:depositBlock')) || 0;
    if (!from) from = cfg.depositStartBlock > 0 ? cfg.depositStartBlock : latest;
    if (from > latest) return 0;
    const to = Math.min(latest, from + 20000);
    const logs = await chain.scanDeposits(from, to);
    for (const l of logs) {
      if (l.from === chain.gameWallet) continue;
      db.q.depositAdd.run(l.txHash, l.logIndex, l.from, l.amount, l.block);
    }
    db.kvSet('chain:depositBlock', to + 1);
    return creditDeposits();
  }

  // Ödeme adresi: hesaplı oyuncuda bağlı cüzdan, eski (cüzdanla giriş) kayıtlarda kimliğin kendisi
  const walletOf = id => (accounts && String(id).startsWith('acc:') ? accounts.activeWallet(id) : id);
  const playerOfWallet = addr => (accounts ? accounts.playerOfWallet(addr) : (db.q.playerGet.get(addr) ? addr : null));

  // Bağlı cüzdandan gelen yatırmaları o hesabın bakiyesine işler (serbest bakiye; kilit yok)
  function creditDeposits(address = null) {
    const rows = address ? db.q.depositsUncredited.all(address) : db.q.depositsUncreditedAll.all();
    let n = 0;
    for (const d of rows) {
      const pid = playerOfWallet(d.address);
      if (!pid) continue;
      atomic(() => {
        E.mutatePlayer(pid, gs => {
          gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + d.amount;
          gs.state.depositedAda = (Number(gs.state.depositedAda) || 0) + d.amount;
          gs.pushNotice(`💰 Yatırman geldi: +${fmt(d.amount)} ADA (serbest bakiye)`, 'success');
        });
        db.q.depositCredit.run(clock(), d.tx_hash, d.log_index);
        db.q.playerAddDeposit.run(d.amount, pid);
      });
      db.event('deposit', pid, { amount: d.amount, tx: d.tx_hash });
      n++;
    }
    return n;
  }

  // ── Haftalık hesaplaşma ─────────────────────────────────────────────────
  function queuePayout(epoch, kind, address, amount) {
    if (!(amount >= 1)) return;
    db.q.payoutAdd.run(epoch, kind, address, Math.floor(amount * 100) / 100, clock());
  }

  function settleWeek(closedEpoch, market) {
    const now = clock();
    const e = econ();
    const brake = !!(e.brake && e.brake.on);
    const players = db.q.playersAll.all();
    const T = E.treasury;
    const summary = { epoch: closedEpoch, at: now, players: players.length, brake };

    return atomic(() => {
      // 1) Çekim
      const rows = [];
      const states = new Map();
      for (const p of players) {
        const st = E.readPlayer(p.address);
        if (!st) continue;
        states.set(p.address, st);
        const score = weekScore(st, closedEpoch);
        let requested = Number(st.pendingWithdrawAda) || 0;
        if (requested > 0 && !walletOf(p.address)) {
          // Ödeme gidecek cüzdan yok: talep bakiyeye iade edilir
          E.mutatePlayer(p.address, gs => {
            gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + requested;
            gs.state.pendingWithdrawAda = 0;
            gs.pushNotice('🏦 Çekim talebin bakiyene iade edildi: hesabına bağlı bir cüzdan yok.', 'info');
          });
          db.q.playerSetPending.run(0, p.address);
          requested = 0;
        }
        if (score > 0 || requested > 0) rows.push({ id: p.address, requested, score });
      }
      const cap = currentCap(market);
      const alloc = allocateWithdrawals(rows, cap, { brake });
      for (const r of alloc.rows) {
        if (!(r.requested > 0)) continue;
        E.mutatePlayer(r.id, gs => {
          gs.state.pendingWithdrawAda = 0;
          if (r.returned > 0) gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + r.returned;
          gs.state.withdrawnAda = (Number(gs.state.withdrawnAda) || 0) + r.total;
          gs.pushNotice(`🏦 Haftalık çekim: ${fmt(r.net)} ADA cüzdanına gönderiliyor (ücret ${fmt(r.fee)}, hak kirası ${fmt(r.rent)}).` +
            (r.returned > 0 ? ` ${fmt(r.returned)} ADA bu haftaki havuza sığmadı, bakiyene döndü.` : ''), 'success');
        });
        db.q.playerSetPending.run(0, r.id);
        if (r.total > 0) db.q.playerAddWithdrawn.run(r.total, r.id);
        // Ödeme hesabın ETKİN cüzdanına (48 saati dolmamış değişiklik etkin değildir)
        queuePayout(closedEpoch, 'withdraw', walletOf(r.id), r.net);
        db.q.withdrawLogSet.run(closedEpoch, r.id, JSON.stringify(r));
      }
      for (const rp of alloc.rentPayouts) {
        E.mutatePlayer(rp.id, gs => {
          gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + rp.amount;
          gs.pushNotice(`🤝 Kullanmadığın çekim hakkın başkasına kiralandı: +${fmt(rp.amount)} ADA hak kirası.`, 'success');
        });
      }
      const gp = E.globalPool;
      gp.state.ubiWeekAccrued = (Number(gp.state.ubiWeekAccrued) || 0) + alloc.totals.feeToUbi;
      gp.state.ubiPool = (Number(gp.state.ubiClaimPot) || 0) + gp.state.ubiWeekAccrued;
      let burn = alloc.totals.feeBurn;
      summary.withdraw = { cap, ...alloc.totals };

      // 2) Fiyat savunma yakımı (fren açıkken)
      let defense = 0;
      if (brake) {
        for (const k of Object.keys(T.state.pools)) {
          const v = (Number(T.state.pools[k]) || 0) * WEEKLY_RULES.defenseBurnWeekly;
          T.state.pools[k] -= v;
          defense += v;
        }
        T.state.lifetimeBurned = (Number(T.state.lifetimeBurned) || 0) + defense;
        burn += defense;
      }
      summary.defenseBurn = defense;

      // 3) Ücretsiz oyuncu havuzu: hiç yatırma yapmamış ve bu hafta oynamış oyuncular
      // Ücretsiz oyuncu: hiç para koymamış, bu hafta oynamış, (hesaplı oyuncuda) e-postasını doğrulamış, en az 3. seviye ve
      // o hafta yeterli katkı puanı toplamış. Pay eşit değil: katkı^1,5 × sadakat serisi (sahte hesaplara karşı;
      // ayrıntı js/economy/faucet.js). Pay tamamen kilitli gelir.
      const FP = { ...FAUCET_DEFAULTS, ...(E.GAME_CONFIG.FREE_PLAYER_POOL || {}) };
      const mult = Number(e.priceMultiplier) || 1;
      const free = [];
      for (const p of players) {
        if (p.deposited_ada > 0 || p.last_seen < now - 7 * DAY) continue;
        if (accounts && String(p.address).startsWith('acc:') && !accounts.isVerified(p.address)) continue;
        const st = states.get(p.address) || E.readPlayer(p.address);
        if (!st) continue;
        const contribution = weekScore(st, closedEpoch);
        if (!qualifies({ level: st.level, contribution, priceMultiplier: mult }, FP)) continue;
        const streak = nextStreak(st.faucetStreak, closedEpoch);
        free.push({ id: p.address, contribution, streak, weight: weightOf({ contribution, priceMultiplier: mult, streakWeeks: streak.weeks }, FP) });
      }
      // Kişi başı tavan kendi ağırlığıyla ölçeklenir: havuzun üst sınırı = tavanların toplamı (yan hesap havuzu şişiremez)
      const fracs = free.map(x => capFraction(x.weight, FP));
      const f = faucetWeekly({ mcapUsd: market?.mcapUsd || 0, priceUsd: market?.priceUsd || 0, freePlayers: fracs.reduce((s, v) => s + v, 0), questPool: T.getPool('quest') });
      const capFull = market?.priceUsd > 0 ? WEEKLY_RULES.faucetMaxUsdPerPlayer / WEEKLY_RULES.weeksPerMonth / market.priceUsd : 0;
      const shares = f.totalAda > 0 ? distribute(f.totalAda, free.map(x => x.weight), fracs.map(v => v * capFull)) : free.map(() => 0);
      const paidTotal = shares.reduce((s, v) => s + v, 0);
      if (paidTotal > 0) {
        T.state.pools.quest -= paidTotal;
        T.state.outflow.quest = (Number(T.state.outflow.quest) || 0) + paidTotal;
        T.state.lifetimeWithdrawn = (Number(T.state.lifetimeWithdrawn) || 0) + paidTotal;
      }
      free.forEach((x, i) => {
        const amt = shares[i];
        E.mutatePlayer(x.id, gs => {
          gs.state.faucetStreak = x.streak;
          if (!(amt > 0)) return;
          gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + amt;
          if (FP.LOCKED !== false) gs.state.lockedAda = Math.min(gs.state.adAstraBalance, (Number(gs.state.lockedAda) || 0) + amt);
          else gs._onAdaEarned(amt);
          gs.pushNotice(`🎁 Ücretsiz oyuncu payın: +${fmt(amt)} ADA (kilitli; oyunda harcadıkça çözülür). Sadakat serin: ${x.streak.weeks} hafta.`, 'success');
        });
      });
      T.save();
      const paidCount = shares.filter(v => v > 0).length;
      summary.faucet = { players: free.length, perPlayer: paidCount ? Math.floor(paidTotal / paidCount * 100) / 100 : 0, maxShare: Math.max(0, ...shares), totalAda: paidTotal, usdPerPlayerMonth: f.usdPerPlayerMonth };

      // 4) Fiyat çarpanı (kasa ömrü = hazine / aylık ücretsiz havuz)
      const pools = Object.values(T.state.pools).reduce((s, v) => s + (Number(v) || 0), 0);
      const monthlyFaucet = paidTotal * WEEKLY_RULES.weeksPerMonth;
      const runwayMonths = monthlyFaucet > 0 ? pools / monthlyFaucet : 999;
      const priceMultiplier = nextMultiplier({ current: Number(e.priceMultiplier) || 1, priceUsd: market?.priceUsd, launchPriceUsd: e.launchPriceUsd, runwayMonths });
      summary.priceMultiplier = priceMultiplier;
      summary.runwayMonths = Math.round(runwayMonths * 10) / 10;

      // 5) Temel gelir ağırlığı: son 2 haftada oynamış, en az 3. seviye oyuncular
      const minLvl = E.GAME_CONFIG.UBI_CONFIG?.MIN_LEVEL ?? 3;
      let ubiTotalWeight = 0;
      for (const p of players) {
        const st = states.get(p.address);
        if (st && (st.level || 1) >= minLvl && p.last_seen >= now - 14 * DAY) ubiTotalWeight += E.levelWeight(st.level || 1);
      }

      // 6) Oyun içi yakım ve yapımcı payı → zincir
      // Sunucu dünyası sıfırdan başlar: ilk haftada bugüne kadarki yakım ve yapımcı payının tamamı aktarılır
      const settled = e.settled || { burned: 0, creator: 0 };
      const burnedDelta = Math.max(0, (Number(gp.state.totalBurned) || 0) - settled.burned);
      const creatorDelta = Math.max(0, (Number(gp.state.creatorRoyaltyTotal) || 0) - settled.creator);
      burn += burnedDelta;
      queuePayout(closedEpoch, 'burn', cfg.deadAddress, burn);
      queuePayout(closedEpoch, 'creator', creatorWallet(), creatorDelta);
      gp.saveState();
      summary.burn = { total: burn, spend: burnedDelta, fee: alloc.totals.feeBurn, defense };
      summary.creator = creatorDelta;

      // 7) Ortak piyango çekilişi: bütün oyuncuların biletleri arasından TEK kazanan (şans = bilet / toplam).
      // Kazanan biletlerine ödediğinin 2 katını alır; kasa yetmezse kalan biletlere amorti dağıtılır (js/economy/lottery.js).
      const LC = E.GAME_CONFIG.CARNIVAL?.LOTTERY || {};
      const rules = { ticketPrice: Math.round((LC.TICKET_COST_ADA || 100) * (Number(e.priceMultiplier) || 1)), winnerMultiplier: LC.WINNER_MULTIPLIER || 2, amortiShare: LC.AMORTI_SHARE ?? 0.02 };
      const holders = [];
      for (const p of players) {
        const st = states.get(p.address);
        const t = Number(st && st.lotteryTickets) || 0;
        if (t > 0) holders.push({ id: p.address, tickets: t, paid: st.lotteryTicketsPaid != null ? Number(st.lotteryTicketsPaid) : t * rules.ticketPrice });
      }
      const L = E.lottery();
      const draw = runDraw({ pool: L.pool, amortiPool: L.amortiPool, holders }, Math.random, rules);
      if (draw.drawn) {
        for (const h of draw.holders) {
          const mine = draw.payouts.filter(x => x.id === h.id);
          const prize = mine.find(x => x.kind === 'prize');
          const amorti = mine.find(x => x.kind === 'amorti');
          const before = holders.find(x => x.id === h.id)?.tickets || 0;
          E.mutatePlayer(h.id, gs => {
            gs.state.lotteryTickets = h.tickets;
            gs.state.lotteryTicketsPaid = h.paid;
            if (prize) {
              gs.state.lotteryPendingPayout = (Number(gs.state.lotteryPendingPayout) || 0) + prize.amount;
              gs.state.lotteryLockedTickets = (Number(gs.state.lotteryLockedTickets) || 0) + (prize.ticketsLocked || 0);
            }
            if (amorti) gs.state.lotteryPendingPayout = (Number(gs.state.lotteryPendingPayout) || 0) + amorti.amount;
            gs.state.lastLotteryResult = { at: now, userWon: !!prize, wonAmount: prize ? prize.amount : 0, amorti: amorti ? amorti.amount : 0, poolDepleted: !!draw.poolDepleted, epochId: closedEpoch };
            gs.pushNotice(prize
              ? `👑 Piyango sana çıktı! ${fmt(prize.amount)} ADA kazandın. Karnaval → Piyango'dan çek; kazanan biletlerin çekerken yanar.`
              : draw.poolDepleted
                ? `🎲 Piyango kasası bitti: kalan biletlere amorti dağıtıldı${amorti ? ` (sana +${fmt(amorti.amount)} ADA)` : ''}. Biletler kapandı.`
                : `🎲 Haftalık çekiliş yapıldı, bu hafta sana çıkmadı. ${before} biletin yanmadı, sonraki haftaya devretti.`,
              prize ? 'success' : 'info');
          });
        }
        E.setLottery({ pool: draw.pool, amortiPool: draw.amortiPool, totalTickets: draw.holders.reduce((t, h) => t + (h.tickets || 0), 0) });
        summary.lottery = { winner: draw.winnerId, prize: draw.prize, poolDepleted: !!draw.poolDepleted, totalTickets: draw.totalTickets, players: holders.length };
      }

      // 8) Kolezyum (gerçek rakipler) haftalık sıralama ödülleri: ilk 10, Kolezyum kasasından
      if (arena) summary.pvp = arena.settleWeek(closedEpoch);

      // Kapı göstergesi: bu hafta dağıtılan kazanç (ASTRA) ve fiyat → kişi başı aylık dolar ortalamasına girer
      if (kapi) { try { kapi.recordWeek(summary, Number((econ().market || {}).priceUsd) || 0); } catch (err) { log.warn('Kapı göstergesi:', err.message); } }
      setEcon({
        epochSettled: closedEpoch, priceMultiplier, ubiTotalWeight, withdrawCap: cap,
        settled: { burned: Number(gp.state.totalBurned) || 0, creator: Number(gp.state.creatorRoyaltyTotal) || 0 },
        faucetPerPlayer: summary.faucet.perPlayer, lastWeekly: summary
      });
      db.event('weekly', null, summary);
      // Kayıt şişmesin: 90 günden eski olaylar ve en son 5.000 dışındaki maç kayıtları silinir
      db.raw.prepare('DELETE FROM events WHERE at < ?').run(now - 90 * DAY);
      const seq = Number((db.kvJson('world:arena', {}) || {}).seq) || 0;
      if (seq > 5000) db.raw.prepare("DELETE FROM kv WHERE key LIKE 'pvp:match:%' AND CAST(substr(key, 11) AS INTEGER) <= ?").run(seq - 5000);
      return summary;
    });
  }

  async function runWeekly(closedEpoch) {
    // Her hafta yalnız bir kez hesaplaşılır (çift ödeme olmaz)
    if (!(closedEpoch >= 1)) return { skipped: 'no-closed-week', epoch: closedEpoch };
    if (Number(econ().epochSettled) >= closedEpoch) return { skipped: 'already-settled', epoch: closedEpoch };
    let market = null;
    try { market = await snapshotMarket(); } catch (err) { log.warn('Piyasa okunamadı, son kayıt kullanılıyor:', err.message); }
    market = market || econ().market || null;
    try { refreshUretim(); } catch (err) { log.warn('Üretim Hakkı (hafta başı):', err.message); }
    const summary = settleWeek(closedEpoch, market);
    await processPayouts();
    return summary;
  }

  // ── Ortak dünya bossu (her Pazar 18:00 TSİ) ─────────────────────────────
  // Ordusunu kilitlemiş bütün oyuncular aynı bossa vurur. Boss kasasının o haftaki payı (WEEKLY_DISTRIBUTION_RATE,
  // %10) verilen hasar oranında paylaşılır: kim önce talep ederse kasayı boşaltamaz. Ödül Kışla → World Boss'tan toplanır.
  function runWorldBoss(battleTime) {
    return atomic(() => {
      const players = db.q.playersAll.all();
      const fighters = players.map(p => p.address).filter(a => { const st = E.readPlayer(a); return !!(st && st.worldBoss && st.worldBoss.userStaked); });
      const dmg = new Map();
      let total = 0;
      for (const a of fighters) {
        E.mutatePlayer(a, gs => { const d = Math.max(0, Number(gs.calculateUserWorldBossPower().calculatedDamage) || 0); dmg.set(a, d); total += d; });
      }
      const T = E.treasury;
      const budget = Math.floor(T.getPool('worldBoss') * (E.GAME_CONFIG.WORLD_BOSS?.WEEKLY_DISTRIBUTION_RATE ?? 0.10));
      let paid = 0;
      for (const a of fighters) {
        const d = dmg.get(a) || 0;
        const reward = total > 0 ? Math.floor(budget * d / total) : 0;
        paid += reward;
        E.mutatePlayer(a, gs => {
          const b = gs.getWorldBossInfo();
          b.userDamage = d;
          b.claimableRewardAda = (Number(b.claimableRewardAda) || 0) + reward;
          b.lastBattleTimestamp = battleTime;
          b.userStaked = false;
          b.realmDamage = total;
          b.realmFighters = fighters.length;
          if (gs.state.worldBoss) gs.state.worldBoss = b;
          gs.pushNotice(`🌋 Dünya Bossu savaşı bitti: krallık toplam ${fmt(total)} hasar vurdu (${fighters.length} ordu). Senin payın %${total > 0 ? (100 * d / total).toFixed(2).replace('.', ',') : '0'} → ${fmt(reward)} ADA. Kışla → World Boss'tan topla.`, 'success');
        });
      }
      if (paid > 0) {
        T.state.pools.worldBoss -= paid;
        T.state.outflow.worldBoss = (Number(T.state.outflow.worldBoss) || 0) + paid;
        T.state.lifetimeWithdrawn = (Number(T.state.lifetimeWithdrawn) || 0) + paid;
        T.save();
      }
      db.kvSet('world:bossLastBattle', battleTime);
      const info = { at: battleTime, fighters: fighters.length, totalDamage: total, budget, paid };
      setEcon({ lastBoss: info });
      db.event('worldBoss', null, info);
      return info;
    });
  }

  // ── Zincir ödemeleri ────────────────────────────────────────────────────
  let paying = false;
  async function processPayouts({ force = false } = {}) {
    const e = econ();
    if (paying) return { skipped: 'busy' };
    if (!chain || !chain.canSend) return { skipped: 'no-wallet' };
    if (e.paused) return { skipped: 'paused' };
    if (cfg.payoutMode !== 'auto' && !force) return { skipped: 'manual' };
    paying = true;
    const out = { sent: 0, failed: 0 };
    try {
      const since = Number(E.globalPool.state.epochStartTime) || clock() - 7 * DAY;
      const rows = db.q.payoutsPending.all();
      let sentWithdraw = db.raw.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM payouts WHERE kind='withdraw' AND status IN ('sent','sending') AND sent_at >= ?").get(since).t;
      for (const p of rows) {
        if (econ().paused) break;
        if (p.kind === 'withdraw' && sentWithdraw + p.amount > cfg.weeklySendCapAda) {
          db.q.payoutMark.run('pending', null, 'Haftalık güvenlik sınırı dolu; gelecek hafta ya da yönetici onayıyla', null, p.id);
          continue;
        }
        db.q.payoutMark.run('sending', null, null, clock(), p.id);
        if (p.kind === 'withdraw') sentWithdraw += p.amount;
        try {
          const hash = await chain.sendAda(p.address, p.amount, s => db.q.payoutSigned.run(s.hash, s.raw, s.nonce, p.id));
          db.q.payoutMark.run('sent', hash, null, clock(), p.id);
          out.sent++;
        } catch (err) {
          const msg = String(err.shortMessage || err.message).slice(0, 300);
          const row = db.q.payoutGet.get(p.id);
          if (row && row.tx_hash && !err.reverted) {
            // İmzalandı, gönderilmiş olabilir: TEKRAR GÖNDERİLMEZ; reconcilePayouts() zincirden sonuçlandırır
            db.q.payoutSetStatus.run('sending', 'Onay bekleniyor: ' + msg, p.id);
          } else {
            db.q.payoutMark.run('pending', null, msg, null, p.id);
            if (p.kind === 'withdraw') sentWithdraw -= p.amount;
          }
          out.failed++;
        }
      }
    } finally {
      paying = false;
    }
    return out;
  }

  // "Gönderiliyor" kalmış ödemeleri zincirden sonuçlandır: işlendiyse 'sent', hiç işlenmeyecekse yeniden sıraya
  async function reconcilePayouts() {
    if (!chain || !chain.canSend) return { skipped: true };
    const out = { sent: 0, retry: 0, waiting: 0, unknown: 0 };
    for (const r of db.q.payoutsSending.all()) {
      if (!r.tx_hash) { out.unknown++; continue; }        // imza kaydı yok: yönetici kontrol eder
      const st = await chain.checkPayout({ hash: r.tx_hash, raw: r.raw_tx, nonce: r.tx_nonce }).catch(() => 'waiting');
      if (st === 'sent') { db.q.payoutMark.run('sent', r.tx_hash, null, clock(), r.id); out.sent++; }
      else if (st === 'failed') { db.q.payoutMark.run('pending', null, 'Önceki gönderim zincirde işlenmedi; yeniden denenecek', null, r.id); out.retry++; }
      else out.waiting++;
    }
    return out;
  }

  // ── Canlı çekim tahmini (her 10 dakikada) ───────────────────────────────
  // v2: Sirius Çıkarma Kapasitesi = aktif oyuncu ağırlıkları toplamı × kişi başı hak. Saatte bir tazelenir (yeni oyuncu
  // gelince kapasite büyür); fiyat/açılış oranı da kaydedilir (haftalık termostat girdisi).
  function refreshUretim() {
    let sum = 0;
    const cutoff = clock() - 14 * DAY;
    for (const p of db.q.playersAll.all()) {
      const st = E.readPlayer(p.address);
      if (!st || (Number(st.lastSeenAt) || 0) < cutoff) continue;
      const r = E.withPlayer(p.address, gs => gs.getUretimWeight().weight);
      sum += Number(r && r.result) || 0;
    }
    try { E.gs.snapshotPriceRatios(true); } catch (err) { log.warn('Fiyat oranı:', err.message); }
    E.globalPool.setSumWeight(Math.max(1, sum));
    return sum;
  }

  function refreshLive() {
    const ep = E.globalPool.state.epochId;
    let scoreTotal = 0;
    for (const p of db.q.playersAll.all()) scoreTotal += weekScore(E.readPlayer(p.address), ep);
    setEcon({ live: { scoreTotal, at: clock() } });
  }

  // ── Zamanlayıcı ─────────────────────────────────────────────────────────
  const last = { market: 0, deposits: 0, live: 0, payouts: 0 };
  let ticking = false;
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      E.globalPool.checkEpochExpiration();
      const ep = E.globalPool.state.epochId;
      const done = db.kvGet('world:epochProcessed');
      if (done == null) db.kvSet('world:epochProcessed', ep);
      else if (ep > Number(done)) {
        await runWeekly(ep - 1);
        db.kvSet('world:epochProcessed', ep);
      }
      const now = clock();
      // Dünya bossu: bu haftanın savaş anı geçtiyse ve henüz yapılmadıysa (ilk açılışta geçmişe dönük savaş yapılmaz)
      const bossTime = E.gs.getWorldBossSchedule(now).lastBattleTime;
      const bossDone = Number(db.kvGet('world:bossLastBattle')) || 0;
      if (!bossDone) db.kvSet('world:bossLastBattle', bossTime);
      else if (bossTime > bossDone) runWorldBoss(bossTime);
      if (chain && now - last.market >= 3600000) { last.market = now; await snapshotMarket().catch(err => log.warn('Piyasa:', err.message)); }
      if (chain && now - last.deposits >= 120000) { last.deposits = now; await scanDeposits().catch(err => log.warn('Yatırma tarama:', err.message)); }
      if (now - last.live >= 600000) { last.live = now; refreshLive(); }
      if (now - (last.uretim || 0) >= 3600000) { last.uretim = now; try { refreshUretim(); } catch (err) { log.warn('Üretim Hakkı:', err.message); } }
      // Kapı kuralı (saatte bir): pasiflik uyarı/askı, boş yerleri sıradan doldur, sınır büyümesi
      if (kapi && now - (last.kapi || 0) >= 3600000) { last.kapi = now; try { kapi.run(); } catch (err) { log.warn('Kapı:', err.message); } }
      // İlan pazarı: süresi dolan ilanların eşyası sahibine döner
      if (pazar && now - (last.pazar || 0) >= 3600000) { last.pazar = now; try { pazar.expire(); } catch (err) { log.warn('İlan pazarı:', err.message); } }
      if (kasa && now - (last.kasaRefresh || 0) >= 120000) { last.kasaRefresh = now; await kasa.refreshActive().catch(err => log.warn('Kasa bakiyeleri:', err.message)); }
      if (kasa && now - (last.kasaSettle || 0) >= 3600000) { last.kasaSettle = now; kasa.queueSettlements(); if (kasa.enforceCaps) kasa.enforceCaps(); }
      if (kasa && now - (last.kasaOps || 0) >= 300000) {
        last.kasaOps = now;
        await kasa.reconcileOps().catch(err => log.warn('Kasa kontrolü:', err.message));
        await kasa.processOps().catch(err => log.warn('Kasa işlemleri:', err.message));
      }
      if (now - last.payouts >= 300000) {
        last.payouts = now;
        await reconcilePayouts().catch(err => log.warn('Ödeme kontrolü:', err.message));
        await processPayouts().catch(err => log.warn('Ödeme:', err.message));
      }
      if (chain && cfg.ratesContract && now - (last.rates || 0) >= 300000) { last.rates = now; await syncRates().catch(err => log.warn('Oran sözleşmesi:', err.message)); }
      if (chain && now - (last.partner || 0) >= 300000) { last.partner = now; await scanPartnerIncome().catch(err => log.warn('Ortak gelir:', err.message)); }
      if (chain && now - (last.hotWallet || 0) >= DAY) { last.hotWallet = now; await checkHotWallet().catch(err => log.warn('Oyun cüzdanı:', err.message)); }
      // Günlük pazar geri alımı (dünya işi; sistem hesabıyla)
      E.withPlayer(SYSTEM, gs => gs.checkDailyAutonomousBuyback());
    } finally {
      ticking = false;
    }
  }

  // ── Ortak gelir: trade sitesinden gelen ADASTRA (kullanıcı kararı 6 Ekim 2026) ──
  // PARTNER_INCOME_FROM cüzdan(lar)ından PARTNER_INCOME_TO (boşsa oyun cüzdanı) adresine gelen her ADASTRA transferi
  // bir kez işlenir ve oyundaki her harcama gibi dağıtılır (%5 yakım, %6 temel gelir, %3 yapımcı, %86 ödül kasaları).
  db.raw.exec(`CREATE TABLE IF NOT EXISTS partner_income (
    tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL, sender TEXT NOT NULL, amount REAL NOT NULL, block INTEGER, at INTEGER NOT NULL,
    PRIMARY KEY (tx_hash, log_index))`);
  const piAdd = db.raw.prepare('INSERT OR IGNORE INTO partner_income (tx_hash, log_index, sender, amount, block, at) VALUES (?, ?, ?, ?, ?, ?)');
  const partnerTo = () => (cfg.partnerIncomeTo || (chain && chain.gameWallet) || '').toLowerCase();

  // Gelen bir ortak gelir kaydını işle (aynı işlem iki kez sayılmaz)
  function creditPartnerIncome(l) {
    return atomic(() => {
      const r = piAdd.run(l.txHash, l.logIndex, l.from, l.amount, l.block || null, clock());
      if (Number(r.changes) !== 1 || !(l.amount > 0)) return 0;
      E.globalPool.recordTokenSpend(l.amount);
      db.event('partner-income', null, { tx: l.txHash, from: l.from, amount: l.amount });
      return l.amount;
    });
  }

  async function scanPartnerIncome() {
    const to = partnerTo();
    if (!chain || !chain.scanTransfers || !to || !(cfg.partnerIncomeFrom || []).length) return 0;
    const latest = await chain.latestBlock();
    let from = Number(db.kvGet('chain:partnerBlock')) || 0;
    if (!from) { db.kvSet('chain:partnerBlock', latest + 1); return 0; }   // ilk açılış: bugünden itibaren
    if (from > latest) return 0;
    const upto = Math.min(latest, from + 20000);
    const logs = await chain.scanTransfers(cfg.partnerIncomeFrom, to, from, upto);
    let total = 0;
    for (const l of logs) total += creditPartnerIncome(l);
    db.kvSet('chain:partnerBlock', upto + 1);
    return total;
  }

  function partnerIncomeStatus() {
    const all = db.raw.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS t FROM partner_income').get();
    const week = db.raw.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM partner_income WHERE at >= ?').get(clock() - 7 * DAY);
    return { enabled: !!(partnerTo() && (cfg.partnerIncomeFrom || []).length), to: partnerTo() || null, from: cfg.partnerIncomeFrom || [], count: all.n, totalAda: all.t, weekAda: week.t };
  }

  // ── Sıcak / soğuk cüzdan (kullanıcı kararı 4 Ekim 2026) ─────────────────
  // Oyun cüzdanında (anahtarı sunucuda = "sıcak") yalnız bir haftalık ihtiyaç kadar ADA durur. İhtiyaç: son 4 haftanın
  // en yüksek haftalık gönderimi, bu haftaki bekleyen çekim talepleri ve HOT_WALLET_MIN_ADA'nın büyüğü; üstüne sırada
  // bekleyen ödemeler. Cüzdan bunun 1,5 katını aşarsa fazlası yedek cüzdana (RESERVE_WALLET, donanım cüzdanı) gider.
  // Azalırsa yönetici panelinde ve e-postayla "yedek cüzdandan şu kadar gönder" uyarısı çıkar.
  const okAddr = a => /^0x[0-9a-fA-F]{40}$/.test(String(a || ''));
  function hotWalletNeed() {
    const ep = Number(E.globalPool.state.epochId) || 1;
    const hist = db.raw.prepare("SELECT epoch, SUM(amount) AS t FROM payouts WHERE kind != 'reserve' AND epoch >= ? GROUP BY epoch").all(ep - 4);
    const histMax = hist.reduce((m, h) => Math.max(m, Number(h.t) || 0), 0);
    const requests = db.q.playersAll.all().reduce((s, p) => s + (Number(p.pending_withdraw) || 0), 0);
    const queued = db.raw.prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM payouts WHERE kind != 'reserve' AND status IN ('pending', 'sending')").get().t;
    const weekly = Math.max(histMax, requests, Number(cfg.hotWalletMinAda) || 0);
    return { weekly, queued, need: weekly * (Number(cfg.hotWalletWeeks) || 1) + queued };
  }
  async function checkHotWallet() {
    if (!chain || !chain.gameWallet) return null;
    const m = (await snapshotMarket().catch(() => null)) || econ().market;
    if (!m || m.walletAda == null) return null;
    const n = hotWalletNeed();
    const reserve = okAddr(cfg.reserveWallet) ? cfg.reserveWallet.toLowerCase() : null;
    const st = { at: clock(), walletAda: m.walletAda, ...n, reserve, low: m.walletAda + 1e-9 < n.need, swept: 0 };
    const open = db.raw.prepare("SELECT 1 FROM payouts WHERE kind = 'reserve' AND status IN ('pending', 'sending') LIMIT 1").get();
    if (reserve && chain.canSend && cfg.payoutMode === 'auto' && !econ().paused && !open && m.walletAda > Math.max(1, n.need * 1.5)) {
      const amount = Math.floor(m.walletAda - n.need);
      queuePayout(Number(E.globalPool.state.epochId) || 0, 'reserve', reserve, amount);
      st.swept = amount;
      db.event('reserve-sweep', null, { amount, need: n.need, walletAda: m.walletAda, to: reserve });
    }
    const prev = econ().hotWallet || {};
    st.alertAt = prev.alertAt || 0;
    if (st.low && clock() - st.alertAt > DAY) {
      st.alertAt = clock();
      const gap = Math.ceil(n.need - m.walletAda);
      db.event('hot-wallet-low', null, { walletAda: m.walletAda, need: n.need, gap });
      if (mailer && cfg.adminEmail) {
        await mailer.send({ to: cfg.adminEmail, subject: 'Realm of AdAstra — oyun cüzdanı azaldı',
          text: `Oyun cüzdanında ${fmt(m.walletAda)} ADA var; bu haftanın ihtiyacı ${fmt(n.need)} ADA.

Yedek cüzdanından (Ledger) oyun cüzdanına en az ${fmt(gap)} ADA gönder:
${chain.gameWallet}

Yönetici panelindeki "Yedek cüzdandan oyun cüzdanına gönder" düğmesini de kullanabilirsin.` }).catch(err => log.warn('Uyarı e-postası:', err.message));
      }
    }
    if (chain.readPaymentsAdmin) {
      try {
        const pa = await chain.readPaymentsAdmin();
        if (pa) {
          const hot = [chain.gameWallet].filter(Boolean).map(a => a.toLowerCase());
          st.contract = { ...pa, expectedOwner: okAddr(cfg.contractOwner) ? cfg.contractOwner.toLowerCase() : null,
            ownerIsHot: hot.includes(pa.owner),
            ownerOk: okAddr(cfg.contractOwner) ? pa.owner === cfg.contractOwner.toLowerCase() : !hot.includes(pa.owner) };
        }
      } catch (err) { log.warn('Sözleşme bilgisi:', err.message); }
    }
    setEcon({ hotWallet: st });
    return st;
  }

  function setPaused(paused) { setEcon({ paused: !!paused }); db.event(paused ? 'pause' : 'resume'); return { paused: !!paused }; }
  // Universe aşaması (R3): 0 Realm, 1 Hazırlık (Hazırlık Deposu açılır), 2 Ön sipariş, 3 Universe — yalnız yönetici değiştirir; kayıt kv'de
  { const st = db.kvGet('world:universeStage'); if (st != null) E.GAME_CONFIG.UNIVERSE_STAGE = Math.max(0, Math.min(3, Number(st) || 0)); }
  function setUniverseStage(stage) {
    const n = Math.floor(Number(stage));
    if (!Number.isInteger(n) || n < 0 || n > 3) throw new Error('Aşama 0 ile 3 arasında olmalı');
    const from = Number(E.GAME_CONFIG.UNIVERSE_STAGE) || 0;
    E.GAME_CONFIG.UNIVERSE_STAGE = n;
    db.kvSet('world:universeStage', n);
    db.event('universe-stage', null, { from, to: n });
    return { universeStage: n };
  }
  const universeStage = () => Number(E.GAME_CONFIG.UNIVERSE_STAGE) || 0;

  return { setUniverseStage, universeStage, refreshUretim, syncRates, ratesStatus, currentRates, scanPartnerIncome, creditPartnerIncome, partnerIncomeStatus, checkHotWallet, hotWalletNeed, reconcilePayouts, runWorldBoss, tick, runWeekly, settleWeek, snapshotMarket, scanDeposits, creditDeposits, processPayouts, requestWithdraw, cancelWithdraw, withdrawStatus, refreshLive, setPaused, econ, setEcon, currentCap };
}
