// Realm of AdAstra sunucusu — rotalar: oyuncu durumu, oyun işlemleri, promo kodu, deneme sunucusu sıfırlama
// (kurumsal A3.9: server/app.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar app.js'ten ctx ile gelir.)

import { kategoriOf } from '../aktiflik.js';
import { MISAFIR_ACTIONS, runMisafirAction } from '../actions.js';

export default function oyunRotalari(ctx) {
  const { E, world, promo, kapi, cfg, readBody, safePlayer, playerPayload } = ctx;
  return {
    'GET /api/state': (req, me) => {
      const out = safePlayer(me, () => null);
      if (out.error) return [500, { error: out.result.message }];
      return playerPayload(me, out.state);
    },

    'POST /api/action': async (req, me) => {
      const { name, args } = await readBody(req);
      if (typeof name !== 'string') return [400, { error: 'İşlem adı gerekli' }];
      // Sırada bekleyen (misafir modu) adayın tek yapabildiği şey: hazır aday onayı (E-planı Faz 1). Oyun
      // aksiyonu değildir, vatandaşlık kontrolünü atlar; gerçek vatandaş için de zararsızdır (aynı sonucu verir).
      if (Object.hasOwn(MISAFIR_ACTIONS, name)) {
        const res = safePlayer(me, g => runMisafirAction(g, name, Array.isArray(args) ? args : []));
        if (res.error) return [500, { error: res.result.message }];
        if (res.result && res.result.rejected) return [400, { error: res.result.message }];
        return { result: res.result, ...playerPayload(me, res.state) };
      }
      // Davetli bir adayın İLK gerçek aksiyonu daveti kabul eder, vatandaş olur (E-planı Faz 1: 72 saatlik davet)
      if (kapi && !kapi.isCitizen(me) && kapi.kabulEtDavet) kapi.kabulEtDavet(me);
      if (kapi && !kapi.isCitizen(me)) {
        const g = kapi.statusOf(me);
        return [403, { error: g.status === 'waiting' ? `⏳ Bekleme sırasındasın (${g.position || '?'}. sıra, ${g.citizens}/${g.limit} vatandaş). Vadiyi gezebilirsin; yerin açılınca haber veririz.` : '⏸️ Yerin askıda. Yeniden giriş yaptığında sıranın önüne alınırsın; ilk boşalan yer senin.' }];
      }
      // Katılım puanı (E-planı Faz 1): gerçekten başarılı bir oyun aksiyonu, aynı yükle/kaydet turunda o
      // haftanın kategorisini işaretler (ayrı bir veritabanı turu açmaz).
      const kategori = kategoriOf(name);
      const res = safePlayer(me, g => {
        const r = E.runAction(g, name, Array.isArray(args) ? args : []);
        if (kategori && r && r.success !== false) g._markKatilimTouch(kategori);
        return r;
      });
      if (res.error) return [500, { error: res.result.message }];
      if (res.result && res.result.rejected) return [400, { error: res.result.message }];
      return { result: res.result, ...playerPayload(me, res.state) };
    },
    // 🧪 Deneme sunucusu: test menüsündeki "vanilla sıfırla" — dünya ve bütün kayıtlar ilk güne (giriş gerekli)
    'POST /api/dev/vanilla-reset': (req, me) => {
      if (!cfg.testMode) return [404, { error: 'Yalnız deneme sunucusunda' }];
      try { return world.vanillaReset(); } catch (err) { return [400, { error: err.message }]; }
    },
    'POST /api/promo/redeem': async (req, me) => {
      const { code } = await readBody(req);
      const r = promo.redeem(me, code);
      return r.success ? { ok: true, message: r.message } : [400, { error: r.message }];
    },
  };
}
