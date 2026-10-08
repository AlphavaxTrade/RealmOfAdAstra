// Realm of AdAstra sunucusu — rotalar: Sponsorluk (server/sponsor.js, docs/v2/SPONSORLUK_TASARIMI.md)
export default function sponsorRotalari(ctx) {
  const { sponsor, readBody, log } = ctx;
  // Kullanıcı hatası 400, beklenmeyen hata 500 (veritabanı geri alınır); sponsorluk kapalıysa 404
  async function op(me, fn) {
    if (!sponsor) return [404, { error: 'Sponsorluk kapalı' }];
    try { return await fn(); }
    catch (err) { if (err.userError) return [400, { error: err.message }]; log.error('Sponsorluk hatası', me, err); return [500, { error: 'Sunucu hatası, işlem yapılmadı.' }]; }
  }
  return {
    'GET /api/sponsor/tablo': (req, me) => op(me, () => sponsor.table()),
    'GET /api/sponsor/benim': (req, me) => op(me, () => sponsor.mine(me)),
    'POST /api/sponsor/ol': async (req, me) => op(me, async () => { const { hedef, miktar } = await readBody(req); return sponsor.give(me, hedef, miktar); }),
    'POST /api/sponsor/feragat': async (req, me) => op(me, async () => { const { id } = await readBody(req); return sponsor.feragat(me, id); }),
    'POST /api/sponsor/kapat': async (req, me) => op(me, async () => { const { id } = await readBody(req); return sponsor.kapat(me, id); })
  };
}
