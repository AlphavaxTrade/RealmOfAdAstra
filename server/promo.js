// Realm of AdAstra sunucusu — promo kodları (kullanıcı kararı 6 Ekim 2026)
// ============================================================================
//  • Kodları yönetici üretir (alphavaxtrade.vercel.app paneli → Realm of AdAstra → Promo kodları). Her kodun ödülü ayrı
//    seçilir: kilitli ADA ve/veya hammadde, parça, anahtar, kutu, parşömen (gameState.applyPromoReward).
//  • Ödülün bedeli görev kasasından ödenir; yoktan bir şey basılmaz. Kasa ya da pazar yetmezse kod kullanılmaz
//    (hak düşmez, hiçbir şey değişmez).
//  • Her hesap bir kodu bir kez kullanır; kodun toplam kullanım sınırı ve bitiş tarihi olabilir; kod kapatılabilir.
//  • Yanlış kod denemeleri sınırlıdır: oyuncu başına saatte 10.
//  • Kayıtta yazılan kod bekletilir, e-posta doğrulanınca kullanılır.
// ============================================================================
import crypto from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY, reward TEXT NOT NULL, max_uses INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0,
  expires INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, note TEXT, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS promo_uses (code TEXT NOT NULL, player TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (code, player));
CREATE TABLE IF NOT EXISTS promo_pending (player TEXT PRIMARY KEY, code TEXT NOT NULL, at INTEGER NOT NULL);
`;
export const PROMO_REWARD_KEYS = ['ada', 'wood', 'iron', 'wheat', 'fragments', 'keys', 'boxes', 'scroll_heal', 'scroll_stamina'];
const LIMITS = { ada: 10_000_000, wood: 1_000_000, iron: 1_000_000, wheat: 1_000_000, fragments: 100_000, keys: 1000, boxes: 1000, scroll_heal: 1000, scroll_stamina: 1000 };
// Türkçe klavye: İ ve ı da I sayılır (kodlarda yalnız A-Z, rakam ve tire var)
const norm = c => String(c || '').trim().replace(/[İıi]/g, 'I').toUpperCase();
const CODE_RE = /^[A-Z0-9-]{4,32}$/;

export function createPromo({ db, engine, clock = () => Date.now(), log = console }) {
  db.raw.exec(SCHEMA);
  const E = engine;
  const q = {
    add: db.raw.prepare('INSERT INTO promo_codes (code, reward, max_uses, expires, note, created) VALUES (?, ?, ?, ?, ?, ?)'),
    get: db.raw.prepare('SELECT * FROM promo_codes WHERE code = ?'),
    all: db.raw.prepare('SELECT * FROM promo_codes ORDER BY created DESC LIMIT 200'),
    used: db.raw.prepare('SELECT 1 FROM promo_uses WHERE code = ? AND player = ?'),
    use: db.raw.prepare('INSERT INTO promo_uses (code, player, at) VALUES (?, ?, ?)'),
    inc: db.raw.prepare('UPDATE promo_codes SET used = used + 1 WHERE code = ?'),
    setActive: db.raw.prepare('UPDATE promo_codes SET active = ? WHERE code = ?'),
    usesOf: db.raw.prepare('SELECT player, at FROM promo_uses WHERE code = ? ORDER BY at DESC LIMIT 100'),
    pendSet: db.raw.prepare('INSERT INTO promo_pending (player, code, at) VALUES (?, ?, ?) ON CONFLICT(player) DO UPDATE SET code = excluded.code, at = excluded.at'),
    pendGet: db.raw.prepare('SELECT * FROM promo_pending WHERE player = ?'),
    pendDel: db.raw.prepare('DELETE FROM promo_pending WHERE player = ?')
  };
  const fails = new Map();   // oyuncu → { t, n } yanlış denemeler (saatlik)

  function cleanReward(r) {
    const out = {};
    for (const k of PROMO_REWARD_KEYS) {
      const v = Math.floor(Number(r && r[k]) || 0);
      if (v < 0 || v > LIMITS[k]) throw Object.assign(new Error(`${k} en fazla ${LIMITS[k]} olabilir.`), { userError: true });
      if (v > 0) out[k] = v;
    }
    if (!Object.keys(out).length) throw Object.assign(new Error('Ödül boş: en az bir şey seç.'), { userError: true });
    return out;
  }

  // Yönetici: yeni kod (code boşsa üretilir)
  function create({ code, reward, maxUses = 0, expiresDays = 0, note = '' } = {}) {
    const c = norm(code) || 'ASTRA-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    if (!CODE_RE.test(c)) throw Object.assign(new Error('Kod 4-32 karakter olmalı: harf, rakam ve tire.'), { userError: true });
    if (q.get.get(c)) throw Object.assign(new Error('Bu kod zaten var.'), { userError: true });
    const rw = cleanReward(reward);
    const max = Math.max(0, Math.floor(Number(maxUses) || 0));
    const days = Math.max(0, Number(expiresDays) || 0);
    q.add.run(c, JSON.stringify(rw), max, days > 0 ? clock() + days * 86400000 : 0, String(note || '').slice(0, 200), clock());
    db.event('promo-create', null, { code: c, reward: rw, maxUses: max, days });
    return view(q.get.get(c));
  }
  const view = r => r && ({ code: r.code, reward: JSON.parse(r.reward), maxUses: r.max_uses, used: r.used, expires: r.expires, active: !!r.active, note: r.note, created: r.created });
  const list = () => q.all.all().map(r => ({ ...view(r), uses: q.usesOf.all(r.code) }));
  function setActive(code, active) {
    const c = norm(code);
    if (!q.get.get(c)) throw Object.assign(new Error('Kod bulunamadı.'), { userError: true });
    q.setActive.run(active ? 1 : 0, c);
    db.event(active ? 'promo-open' : 'promo-close', null, { code: c });
    return view(q.get.get(c));
  }

  // Kod şu an kullanılabilir mi (oyuncuya özel kontrol hariç)
  function check(code) {
    const r = q.get.get(norm(code));
    if (!r || !r.active) return { ok: false, error: 'Promo kodu geçersiz.' };
    if (r.expires && clock() > r.expires) return { ok: false, error: 'Bu promo kodunun süresi dolmuş.' };
    if (r.max_uses && r.used >= r.max_uses) return { ok: false, error: 'Bu promo kodu tükendi.' };
    return { ok: true, row: r };
  }

  function redeem(player, code) {
    const now = clock();
    let f = fails.get(player);
    if (f && now - f.t >= 3600000) { fails.delete(player); f = null; }
    if (f && f.n >= 10) return { success: false, message: 'Çok fazla yanlış kod denemesi; bir saat sonra tekrar dene.' };
    const ck = check(code);
    if (!ck.ok) {
      const g = f || { t: now, n: 0 }; g.n++; fails.set(player, g); if (fails.size > 10000) fails.clear();
      return { success: false, message: ck.error };
    }
    const c = ck.row.code;
    if (q.used.get(c, player)) return { success: false, message: 'Bu promo kodunu zaten kullandın.' };
    const reward = JSON.parse(ck.row.reward);
    // Hepsi ya da hiçbiri: ödül verilemezse veritabanı ve bellekteki dünya geri alınır, hak düşmez
    const FAIL = Symbol('promo');
    let out = null;
    try {
      db.tx(() => {
        const { result } = E.withPlayer(player, gs => gs.applyPromoReward(reward));
        out = result;
        if (!result || !result.success) throw FAIL;
        q.use.run(c, player, now);
        q.inc.run(c);
        db.event('promo-use', player, { code: c, reward, cost: result.spentFromQuest });
      });
    } catch (err) {
      E.reloadWorld();
      if (err !== FAIL) { log.error('Promo kodu:', err); return { success: false, message: 'Kod şu an kullanılamadı; daha sonra tekrar dene.' }; }
    }
    return out && out.success ? { success: true, message: out.message, reward } : { success: false, message: (out && out.message) || 'Kod kullanılamadı.' };
  }

  // Kayıtta yazılan kod: e-posta doğrulanınca kullanılır
  const setPending = (player, code) => q.pendSet.run(player, norm(code), clock());
  function redeemPending(player) {
    const p = q.pendGet.get(player);
    if (!p) return null;
    q.pendDel.run(player);
    const r = redeem(player, p.code);
    if (r.success) E.mutatePlayer(player, gs => gs.pushNotice(r.message, 'success'));
    else E.mutatePlayer(player, gs => gs.pushNotice(`🎟️ Kayıtta yazdığın promo kodu kullanılamadı: ${r.message}`, 'info'));
    return r;
  }

  return { create, list, setActive, check, redeem, setPending, redeemPending };
}
