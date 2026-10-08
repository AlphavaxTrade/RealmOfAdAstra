// Realm of AdAstra sunucusu — rotalar: yönetici uçları (ADMIN_TOKEN gerekir)
// (kurumsal A3.9: server/app.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar app.js'ten ctx ile gelir.)

export default function yonetimRotalari(ctx) {
  const { db, E, world, promo, kapi, chain, cfg, clock, readBody } = ctx;
  return {
    'GET /api/admin/status': () => {
      const e = world.econ();
      const players = db.q.playersAll.all();
      return {
        time: clock(), epochId: E.globalPool.state.epochId, nextWeekAt: E.globalPool.state.epochEndTime,
        payoutMode: cfg.payoutMode, canSend: !!(chain && chain.canSend), gameWallet: chain ? chain.gameWallet : null,
        paused: !!e.paused, market: e.market || null, brake: e.brake || null, priceMultiplier: e.priceMultiplier || 1,
        lastWeekly: e.lastWeekly || null, weeklyCap: world.currentCap(),
        players: { total: players.length, activeWeek: players.filter(p => p.last_seen >= clock() - 7 * 86400000).length,
          depositors: players.filter(p => p.deposited_ada > 0).length,
          pendingWithdraw: players.reduce((s, p) => s + (p.pending_withdraw || 0), 0) },
        treasury: E.treasury.state.pools,
        kapi: kapi ? kapi.adminSummary() : null,
        universeStage: world.universeStage ? world.universeStage() : (Number(E.GAME_CONFIG.UNIVERSE_STAGE) || 0),
        chainId: cfg.chainId, tokenAddress: cfg.tokenAddress, paymentsContract: cfg.paymentsContract || null,
        reserveWallet: cfg.reserveWallet || null, contractOwner: cfg.contractOwner || null,
        hotWallet: e.hotWallet || null, hotNeed: world.hotWalletNeed ? world.hotWalletNeed() : null,
        partnerIncome: world.partnerIncomeStatus ? world.partnerIncomeStatus() : null,
        rates: world.ratesStatus ? world.ratesStatus() : null,
        payouts: db.q.payoutsRecent.all(50),
        events: db.q.eventsRecent.all(50)
      };
    },
    'GET /api/admin/promo': () => ({ codes: promo.list() }),
    'POST /api/admin/promo/create': async (req) => promo.create(await readBody(req)),
    'POST /api/admin/promo/active': async (req) => { const { code, active } = await readBody(req); return promo.setActive(code, !!active); },
    'POST /api/admin/pause': async (req) => { const { paused } = await readBody(req); return world.setPaused(!!paused); },
    'POST /api/admin/payouts/run': async () => world.processPayouts({ force: true }),
    'POST /api/admin/weekly/run': async () => world.runWeekly(E.globalPool.state.epochId - 1),
    'POST /api/admin/rates/sync': async () => (world.syncRates ? (await world.syncRates()) || { skipped: 'oran sözleşmesi tanımlı değil' } : { skipped: true }),
    'POST /api/admin/hotwallet/check': async () => (world.checkHotWallet ? (await world.checkHotWallet()) || { skipped: 'zincir yok' } : { skipped: true }),
    // Kapı kuralı (yönetici kolu): sınır / dönem, şimdi işlet, bir hesabı elle içeri al / sıraya koy / askıya al
    'POST /api/admin/kapi': async (req) => { if (!kapi) return [404, { error: 'Kapı kapalı' }]; const { limit, tier, growthLocked } = await readBody(req); try { return kapi.adminSet({ limit, tier, growthLocked }); } catch (err) { return [400, { error: err.message }]; } },
    'POST /api/admin/universe-stage': async (req) => { const { stage } = await readBody(req); try { return world.setUniverseStage(stage); } catch (err) { return [400, { error: err.message }]; } },
    'POST /api/admin/kapi/run': async () => (kapi ? { ...kapi.run(), ...kapi.publicSummary() } : [404, { error: 'Kapı kapalı' }]),
    'POST /api/admin/kapi/player': async (req) => { if (!kapi) return [404, { error: 'Kapı kapalı' }]; const { playerId, status } = await readBody(req); try { return kapi.adminSetPlayer(String(playerId || ''), String(status || '')); } catch (err) { return [400, { error: err.message }]; } }
  };
}
