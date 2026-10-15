// Realm of AdAstra sunucusu — rotalar: yönetici uçları (ADMIN_TOKEN gerekir)
// (kurumsal A3.9: server/app.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar app.js'ten ctx ile gelir.)

export default function yonetimRotalari(ctx) {
  const { db, E, world, accounts, promo, kapi, chain, cfg, clock, readBody } = ctx;
  return {
    'GET /api/admin/status': () => {
      const e = world.econ();
      const players = db.q.playersAll.all();
      return {
        time: clock(), epochId: E.globalPool.state.epochId, nextWeekAt: E.globalPool.state.epochEndTime,
        payoutMode: cfg.payoutMode, canSend: !!(chain && chain.canSend), gameWallet: chain ? chain.gameWallet : null,
        paused: !!e.paused, market: e.market || null, brake: e.brake || null, priceMultiplier: e.priceMultiplier || 1,
        lastWeekly: e.lastWeekly || null, weeklyCap: world.currentCap(),
        akis: world.akisSerileri ? world.akisSerileri() : null, kadran: Number(e.kadran) || 1,
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
        // Belirsiz ('sending') satırların TAMAMI: son 50'nin dışına düşse de yönetici görsün ve çözebilsin
        payoutsBelirsiz: db.q.payoutsSending.all().map(p => ({ id: p.id, epoch: p.epoch, kind: p.kind, address: p.address, amount: p.amount, status: p.status, tx_hash: p.tx_hash, error: p.error, created_at: p.created_at, sent_at: p.sent_at })),
        // Oyun Kasası'nda belirsiz ('sending') işlemler: yönetici çözebilsin
        kasaOpsBelirsiz: db.raw.prepare("SELECT id, player, kind, amount, status, tx_hash, error, created FROM kasa_ops WHERE status = 'sending' ORDER BY id").all(),
        // Muhafız Mührü sıfırlaması bekleyen hesaplar (48 saat dolunca mühür kalkar; yönetici iptal edebilir)
        muhurSifirlamaBekleyen: accounts ? accounts.tfaSifirlamaBekleyenler() : [],
        events: db.q.eventsRecent.all(50)
      };
    },
    'GET /api/admin/promo': () => ({ codes: promo.list() }),
    'POST /api/admin/promo/create': async (req) => promo.create(await readBody(req)),
    'POST /api/admin/promo/active': async (req) => { const { code, active } = await readBody(req); return promo.setActive(code, !!active); },
    'POST /api/admin/pause': async (req) => { const { paused } = await readBody(req); return world.setPaused(!!paused); },
    'POST /api/admin/payouts/run': async () => world.processPayouts({ force: true }),
    // Belirsiz ('sending') ödeme satırını yönetici çözer: gönderildi (işlem no) ya da yeniden sıraya; gerekçe zorunlu, olay günlüğüne yazılır
    'POST /api/admin/payouts/resolve': async (req) => {
      const { id, durum, txHash, gerekce } = await readBody(req);
      try { return { ok: true, ...(await world.resolvePayout({ id, durum, txHash, gerekce })) }; }
      catch (err) { if (err && err.kod) return [err.kod, { error: err.message }]; throw err; }
    },
    // Oyun Kasası işlemi (aktarım / çekim / iade) belirsiz kaldıysa yönetici çözer; gerekçe zorunlu, olay günlüğüne yazılır
    'POST /api/admin/kasa/ops/resolve': async (req) => {
      const { id, durum, gerekce } = await readBody(req);
      try { return { ok: true, ...(await world.resolveKasaOp({ id, durum, gerekce })) }; }
      catch (err) { if (err && err.kod) return [err.kod, { error: err.message }]; throw err; }
    },
    // Muhafız Mührü'nü (telefon + yedek kod) kaybeden oyuncu için sıfırlama: 48 saat bekler, e-postadaki bağlantıyla iptal edilebilir
    'POST /api/admin/hesap/muhur-sifirla': async (req) => {
      const b = await readBody(req);
      try { return await accounts.adminTfaSifirla({ email: b.email, playerId: b.playerId, gerekce: b.gerekce }); }
      catch (err) { if (err && err.kod) return [err.kod, { error: err.message }]; throw err; }
    },
    'POST /api/admin/hesap/muhur-sifirla/iptal': async (req) => {
      const b = await readBody(req);
      try { return accounts.adminTfaSifirlaIptal({ email: b.email, playerId: b.playerId }); }
      catch (err) { if (err && err.kod) return [err.kod, { error: err.message }]; throw err; }
    },
    'POST /api/admin/weekly/run': async () => world.runWeekly(E.globalPool.state.epochId - 1),
    'POST /api/admin/rates/sync': async () => (world.syncRates ? (await world.syncRates()) || { skipped: 'oran sözleşmesi tanımlı değil' } : { skipped: true }),
    'POST /api/admin/hotwallet/check': async () => (world.checkHotWallet ? (await world.checkHotWallet()) || { skipped: 'zincir yok' } : { skipped: true }),
    // Kapı kuralı (yönetici kolu): sınır / dönem, şimdi işlet, bir hesabı elle içeri al / sıraya koy / askıya al
    'POST /api/admin/kapi': async (req) => { if (!kapi) return [404, { error: 'Kapı kapalı' }]; const { limit, tier, growthLocked } = await readBody(req); try { return kapi.adminSet({ limit, tier, growthLocked }); } catch (err) { return [400, { error: err.message }]; } },
    'POST /api/admin/universe-stage': async (req) => { const { stage } = await readBody(req); try { return world.setUniverseStage(stage); } catch (err) { return [400, { error: err.message }]; } },
    'POST /api/admin/kapi/run': async () => (kapi ? { ...kapi.run(), ...kapi.publicSummary() } : [404, { error: 'Kapı kapalı' }]),
    // İstemci adresi kotası (yönetici kolu): günlük kabul sayısı ve belirli bir adres / oyuncunun kayıt adresi için muafiyet
    'POST /api/admin/kapi/ip': async (req) => { if (!kapi) return [404, { error: 'Kapı kapalı' }]; const b = await readBody(req); try { return kapi.adminIp({ dailyAdmit: b.dailyAdmit, ip: b.ip, playerId: b.playerId, muaf: b.muaf }); } catch (err) { return [400, { error: err.message }]; } },
    'POST /api/admin/kapi/player': async (req) => { if (!kapi) return [404, { error: 'Kapı kapalı' }]; const { playerId, status } = await readBody(req); try { return kapi.adminSetPlayer(String(playerId || ''), String(status || '')); } catch (err) { return [400, { error: err.message }]; } }
  };
}
