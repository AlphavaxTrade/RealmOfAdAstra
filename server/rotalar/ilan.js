// Realm of AdAstra sunucusu — rotalar: İlan pazarı (teçhizat)
// (kurumsal A3.9: server/app.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar app.js'ten ctx ile gelir.)

export default function ilanRotalari(ctx) {
  const { pazar, readBody, pazarOp } = ctx;
  return {
    // ── İlan pazarı (teçhizat; server/pazar.js) ──
    'GET /api/pazar': (req, me) => (pazar ? pazar.list(me) : [404, { error: 'İlan pazarı kapalı' }]),
    'POST /api/pazar/sell': async (req, me) => pazarOp(me, async () => { const { ref, price } = await readBody(req); return pazar.sell(me, ref, price); }),
    'POST /api/pazar/cancel': async (req, me) => pazarOp(me, async () => { const { id } = await readBody(req); return pazar.cancel(me, id); }),
    'POST /api/pazar/buy': async (req, me) => pazarOp(me, async () => { const { id } = await readBody(req); return pazar.buy(me, id); }),
  };
}
