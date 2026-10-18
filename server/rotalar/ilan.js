// Realm of AdAstra sunucusu — rotalar: İlan pazarı (teçhizat, Anahtar, Pandora kutusu, eser)
// (kurumsal A3.9: server/app.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar app.js'ten ctx ile gelir.)

export default function ilanRotalari(ctx) {
  const { pazar, readBody, pazarOp } = ctx;
  return {
    // ── İlan pazarı (teçhizat; server/pazar.js) ──
    'GET /api/pazar': (req, me) => {
      if (!pazar) return [404, { error: 'İlan pazarı kapalı' }];
      const q = new URL(req.url, 'http://x').searchParams;   // süzgeç: ?tur=&ara=&sira=ucuz|pahali|yeni|eski&limit=
      return pazar.list(me, { tur: q.get('tur') || undefined, ara: q.get('ara') || undefined, sira: q.get('sira') || undefined, limit: q.get('limit') || undefined });
    },
    'POST /api/pazar/sell': async (req, me) => pazarOp(me, async () => { const { ref, price } = await readBody(req); return pazar.sell(me, ref, price); }),
    'POST /api/pazar/sell-key': async (req, me) => pazarOp(me, async () => { const { qty, price } = await readBody(req); return pazar.sellKey(me, qty, price); }),
    'POST /api/pazar/sell-bulk': async (req, me) => pazarOp(me, async () => { const { kind, qty, price, id } = await readBody(req); return pazar.sellBulk(me, kind, qty, price, id); }),
    'POST /api/pazar/cancel': async (req, me) => pazarOp(me, async () => { const { id } = await readBody(req); return pazar.cancel(me, id); }),
    'POST /api/pazar/buy': async (req, me) => pazarOp(me, async () => { const { id, qty } = await readBody(req); return pazar.buy(me, id, qty); }),
  };
}
