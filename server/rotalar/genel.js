// Realm of AdAstra sunucusu — rotalar: sağlık ve herkese açık oranlar
// (kurumsal A3.9: server/app.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar app.js'ten ctx ile gelir.)

export default function genelRotalar(ctx) {
  const { E, world, payments, chain, cfg, clock } = ctx;
  return {
    // ADA nereye gidiyor: oranlar herkese açık (RealmRates sözleşmesi)
    'GET /api/rates': () => (world.ratesStatus ? world.ratesStatus() : [404, { error: 'Kapalı' }]),
    'GET /api/health': () => ({ ok: true, time: clock(), version: E.GAME_CONFIG.GAME_VERSION, chain: !!chain, payoutMode: cfg.payoutMode, testMode: !!cfg.testMode, payments: payments ? payments.info() : null }),
  };
}
