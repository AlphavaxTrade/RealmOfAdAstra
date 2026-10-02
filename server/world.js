// Realm of Astra sunucusu — dünya işleri: haftalık hesaplaşma, yatırma, çekim, zincir ödemeleri
// ============================================================================
// Haftalık hesaplaşma (her Pazartesi 00:01 TSİ, oyunun hafta değişiminde) — kurallar server/economy.js:
//  1. Çekim talepleri ortak havuzdan katkı puanına göre karşılanır; hak kirası ödenir; sığmayan kısım
//     bakiyeye döner.
//  2. Çekim ücretinin %70'i temel gelire, %30'u yakıma.
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

const fmt = v => Math.floor(Number(v) || 0).toLocaleString('tr-TR');
const DAY = 86400000;

export function createWorld({ db, engine, chain = null, arena = null, cfg, clock = () => Date.now(), log = console }) {
  const E = engine;
  const econ = () => db.kvJson('world:economy', {});
  const setEcon = patch => { const next = { ...econ(), ...patch }; db.kvSetJson('world:economy', next); return next; };
  const creatorWallet = () => E.GAME_CONFIG.CREATOR_WALLET_ADDRESS;
  // Hepsi ya da hiçbiri: hata olursa veritabanı geri alınır, bellekteki kayıt kopyası da boşaltılır
  const atomic = fn => { try { return db.tx(fn); } catch (err) { E.reloadWorld(); throw err; } };

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
    if (!chain || !chain.gameWallet) return 0;
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

  // Kayıtlı oyuncuların yatırmalarını bakiyelerine işler (serbest bakiye; kilit yok)
  function creditDeposits(address = null) {
    const rows = address ? db.q.depositsUncredited.all(address) : db.q.depositsUncreditedAll.all();
    let n = 0;
    for (const d of rows) {
      if (!db.q.playerGet.get(d.address)) continue;
      atomic(() => {
        E.mutatePlayer(d.address, gs => {
          gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + d.amount;
          gs.state.depositedAda = (Number(gs.state.depositedAda) || 0) + d.amount;
          gs.pushNotice(`💰 Yatırman geldi: +${fmt(d.amount)} ADA (serbest bakiye)`, 'success');
        });
        db.q.depositCredit.run(clock(), d.tx_hash, d.log_index);
        db.q.playerAddDeposit.run(d.amount, d.address);
      });
      db.event('deposit', d.address, { amount: d.amount, tx: d.tx_hash });
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
        const requested = Number(st.pendingWithdrawAda) || 0;
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
        queuePayout(closedEpoch, 'withdraw', r.id, r.net);
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
      const free = players.filter(p => !(p.deposited_ada > 0) && p.last_seen >= now - 7 * DAY);
      const f = faucetWeekly({ mcapUsd: market?.mcapUsd || 0, priceUsd: market?.priceUsd || 0, freePlayers: free.length, questPool: T.getPool('quest') });
      if (f.perPlayer > 0) {
        T.state.pools.quest -= f.totalAda;
        T.state.outflow.quest = (Number(T.state.outflow.quest) || 0) + f.totalAda;
        T.state.lifetimeWithdrawn = (Number(T.state.lifetimeWithdrawn) || 0) + f.totalAda;
        for (const p of free) {
          E.mutatePlayer(p.address, gs => {
            gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + f.perPlayer;
            gs._onAdaEarned(f.perPlayer);
            gs.pushNotice(`🎁 Ücretsiz oyuncu payın: +${fmt(f.perPlayer)} ADA (Görev kasasından)`, 'success');
          });
        }
      }
      T.save();
      summary.faucet = { players: free.length, perPlayer: f.perPlayer, totalAda: f.totalAda, usdPerPlayerMonth: f.usdPerPlayerMonth };

      // 4) Fiyat çarpanı (kasa ömrü = hazine / aylık ücretsiz havuz)
      const pools = Object.values(T.state.pools).reduce((s, v) => s + (Number(v) || 0), 0);
      const monthlyFaucet = f.totalAda * WEEKLY_RULES.weeksPerMonth;
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

      setEcon({
        epochSettled: closedEpoch, priceMultiplier, ubiTotalWeight, withdrawCap: cap,
        settled: { burned: Number(gp.state.totalBurned) || 0, creator: Number(gp.state.creatorRoyaltyTotal) || 0 },
        faucetPerPlayer: f.perPlayer, lastWeekly: summary
      });
      db.event('weekly', null, summary);
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
      if (now - last.payouts >= 300000) {
        last.payouts = now;
        await reconcilePayouts().catch(err => log.warn('Ödeme kontrolü:', err.message));
        await processPayouts().catch(err => log.warn('Ödeme:', err.message));
      }
      // Günlük pazar geri alımı (dünya işi; sistem hesabıyla)
      E.withPlayer(SYSTEM, gs => gs.checkDailyAutonomousBuyback());
    } finally {
      ticking = false;
    }
  }

  function setPaused(paused) { setEcon({ paused: !!paused }); db.event(paused ? 'pause' : 'resume'); return { paused: !!paused }; }

  return { reconcilePayouts, runWorldBoss, tick, runWeekly, settleWeek, snapshotMarket, scanDeposits, creditDeposits, processPayouts, requestWithdraw, cancelWithdraw, withdrawStatus, refreshLive, setPaused, econ, setEcon, currentCap };
}
