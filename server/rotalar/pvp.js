// Realm of AdAstra sunucusu — rotalar: Kolezyum: sıraya girme, çıkma, durum, maç tekrarı
// (kurumsal A3.9: server/app.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar app.js'ten ctx ile gelir.)

export default function pvpRotalari(ctx) {
  const { db, E, arena, clock, log, readBody, playerPayload } = ctx;
  return {
    // ⚔️ Kolezyum — gerçek rakipler
    'POST /api/pvp/queue': async (req, me) => {
      const { mode, indices } = await readBody(req);
      if (!arena) return [404, { error: 'Kapalı' }];
      if (!['1v1', '3v3'].includes(mode) || !Array.isArray(indices) || indices.length > 3 || !indices.every(i => Number.isInteger(i) && i >= 0 && i < 64)) return [400, { error: 'Geçersiz seçim' }];
      try {
        const out = db.tx(() => { const o = arena.queue(me, mode, indices); db.q.playerSeen.run(clock(), me); return o; });
        return { result: out.result, ...playerPayload(me, out.state) };
      } catch (err) { E.reloadWorld(); log.error('PvP', err); return [500, { error: 'Sunucu hatası' }]; }
    },
    'POST /api/pvp/leave': (req, me) => {
      if (!arena) return [404, { error: 'Kapalı' }];
      try {
        const out = db.tx(() => arena.leave(me));
        return { result: out.result, ...playerPayload(me, out.state) };
      } catch (err) { E.reloadWorld(); log.error('PvP', err); return [500, { error: 'Sunucu hatası' }]; }
    },
    'GET /api/pvp/status': (req, me) => (arena ? arena.status(me) : [404, { error: 'Kapalı' }]),
    'GET /api/pvp/match': (req) => {
      const id = Number(new URL(req.url, 'http://x').searchParams.get('id'));
      const m = arena && Number.isInteger(id) ? arena.getMatch(id) : null;
      return m || [404, { error: 'Maç bulunamadı' }];
    },
  };
}
