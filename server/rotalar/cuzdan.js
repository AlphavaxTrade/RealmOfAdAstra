// Realm of AdAstra sunucusu — rotalar: cüzdan, çekim, Oyun Kasası, cüzdandan ödeme
// (kurumsal A3.9: server/app.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar app.js'ten ctx ile gelir.)

export default function cuzdanRotalari(ctx) {
  const { db, E, world, accounts, payments, kasa, chain, cfg, log, readBody, playerPayload } = ctx;
  return {
    'GET /api/wallet': (req, me) => ({
      account: accounts.me(me),
      gameWallet: chain ? chain.gameWallet : null,
      tokenAddress: cfg.tokenAddress,
      deposits: db.q.depositsOf.all(me),
      withdraw: world.withdrawStatus(me)
    }),

    'POST /api/withdraw': async (req, me) => {
      const { amount, code } = await readBody(req);
      if (!accounts.isVerified(me)) return { success: false, message: 'Çekim için önce e-posta adresini doğrula.' };
      const g = accounts.check2fa(me, code);
      if (!g.ok) return [403, { error: g.error, need2fa: true }];
      if (!accounts.activeWallet(me)) return { success: false, message: 'Çekim için önce hesabına bir cüzdan bağla.' };
      try { return db.tx(() => world.requestWithdraw(me, amount)); }
      catch (err) { E.reloadWorld(); log.error(err); return [500, { error: 'Sunucu hatası' }]; }
    },

    'POST /api/withdraw/cancel': (req, me) => {
      try { return db.tx(() => world.cancelWithdraw(me)); }
      catch (err) { E.reloadWorld(); log.error(err); return [500, { error: 'Sunucu hatası' }]; }
    },

    // 🏦 Oyun Kasası
    'GET /api/kasa': (req, me) => (kasa ? kasa.status(me) : { enabled: false }),
    'POST /api/kasa/refresh': async (req, me) => {
      if (!kasa || !kasa.enabled) return { enabled: false };
      try { await kasa.refresh(me); } catch (err) { return [503, { error: 'Zincir bakiyesi okunamadı, birazdan tekrar dene.' }]; }
      return kasa.status(me);
    },
    'POST /api/kasa/withdraw': async (req, me) => {
      if (!kasa) return [404, { error: 'Kapalı' }];
      const { asset, amount, code } = await readBody(req);
      const g = accounts.check2fa(me, code);
      if (!g.ok) return [403, { error: g.error, need2fa: true }];
      const r = kasa.withdraw(me, asset, amount);
      return r.ok ? r : [400, { error: r.error }];
    },
    'POST /api/kasa/test-deposit': async (req, me) => {
      if (!kasa || !cfg.testMode) return [404, { error: 'Yalnız deneme sunucusunda' }];
      const { ada, avax } = await readBody(req);
      const r = kasa.simulateDeposit(me, Math.min(1e7, Number(ada) || 0), Math.min(10, Number(avax) || 0));
      return r.ok ? kasa.status(me) : [400, { error: r.error }];
    },

    // 💳 Cüzdandan ödeme (kazanılmış bakiye yetmeyince)
    'POST /api/pay/quote': async (req, me) => {
      if (!payments) return [404, { error: 'Kapalı' }];
      const { name, args } = await readBody(req);
      try {
        const r = payments.quote(me, name, Array.isArray(args) ? args : []);
        return r.ok ? r : [400, { error: r.error }];
      } catch (err) { E.reloadWorld(); log.error('Ödeme teklifi', err); return [500, { error: 'Sunucu hatası' }]; }
    },
    'POST /api/pay/confirm': async (req, me) => {
      if (!payments) return [404, { error: 'Kapalı' }];
      const { ref, txHash } = await readBody(req);
      const r = await payments.confirm(me, ref, txHash);
      if (!r.ok) return [r.retry ? 409 : 400, { error: r.error, retry: !!r.retry }];
      return { paid: r.paid, result: r.result, ...playerPayload(me, r.state) };
    },
  };
}
