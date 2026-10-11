// Realm of AdAstra sunucusu — rotalar: sağlık ve herkese açık oranlar
// (kurumsal A3.9: server/app.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar app.js'ten ctx ile gelir.)

// Zamanlayıcı turu bu süreden uzun süredir bitmediyse (takılmış ya da ölmüş) sunucu "hazır değil" sayılır
const HAZIR_TUR_YASI_MS = 180000;

export default function genelRotalar(ctx) {
  const { E, db, world, payments, chain, cfg, clock, log } = ctx;
  return {
    // Hazırlık denetimi (orkestratör/izleme için): veritabanı yanıt veriyor mu, dünya zamanlayıcısı canlı mı. /api/health yalnız "süreç ayakta" der.
    // Ham hata yanıta girmez (yalnız günlüğe); 503 = trafik verme / uyar
    'GET /api/ready': () => {
      const kontroller = { veritabani: false, zamanlayici: true };
      try { kontroller.veritabani = db.raw.prepare('SELECT 1 AS x').get().x === 1; } catch (err) { log.error('Hazırlık denetimi: veritabanı yanıt vermiyor', err); }
      const t = typeof world.tickDurumu === 'function' ? world.tickDurumu() : null;
      if (t) kontroller.zamanlayici = t.yasMs < HAZIR_TUR_YASI_MS;
      const hazir = kontroller.veritabani && kontroller.zamanlayici;
      const out = { hazir, kontroller, ...(t ? { zamanlayiciTur: t.tur, zamanlayiciHata: t.hataSayisi, zamanlayiciYasSn: Math.round(t.yasMs / 1000) } : {}) };
      return hazir ? out : [503, out];
    },
    // ASTRA nereye gidiyor: oranlar herkese açık (RealmRates sözleşmesi)
    'GET /api/rates': () => (world.ratesStatus ? world.ratesStatus() : [404, { error: 'Kapalı' }]),
    'GET /api/health': () => ({ ok: true, time: clock(), version: E.GAME_CONFIG.GAME_VERSION, chain: !!chain, payoutMode: cfg.payoutMode, testMode: !!cfg.testMode, payments: payments ? payments.info() : null }),
  };
}
