// Realm of AdAstra — Kapı kuralı (R4/R4c, KARARLAR_KESIN.md bölüm J)
// ============================================================================
// Vatandaş sınırı açılışta 50. Kayıt her zaman açık: yer yoksa hesap BEKLEME SIRASINA girer (misafir gibi gezer,
// işlem yapamaz). Pasiflik: 14 gün giriş yoksa uyarı (e-posta + oyun içi), 30 gün yoksa ASKI: yeri sıradakine
// geçer, hesap saklanır, döndüğünde sıranın ÖNÜNE alınır. Sınır büyümesi: gösterge (son 3 ayda kişi başı aylık
// dağıtılan kazanç, dolar) o dönemin eşiğini (10 → 30 → 100 → 300 $) geçerse sınır ayda %10 büyür; dönem geçişi
// yönetici kolu. Kayıt harcı 1 ASTRA (fiyat çarpanıyla ölçekli): vatandaş olunca borç yazılır, ilk ASTRA'dan düşer.
//
// Kayıt yeri: players tablosuna gate / gate_at / gate_prio / warned_at sütunları; dünya ayarı kv 'world:kapi'.
// Oyunun kendi kurallarına (gameState) dokunmaz: yalnız sunucu katmanı.
// ============================================================================
import { playerIdOf } from './accounts.js';

const DAY = 86400000;
const round3 = x => Math.round((Number(x) || 0) * 1000) / 1000;

export function createKapi({ db, engine, accounts = null, mailer = null, cfg = {}, clock = () => Date.now(), log = console }) {
  const E = engine;
  const K = () => E.GAME_CONFIG.KAPI || {};
  for (const col of ["gate TEXT NOT NULL DEFAULT 'new'", 'gate_at INTEGER', 'gate_prio INTEGER NOT NULL DEFAULT 0', 'warned_at INTEGER']) {
    try { db.raw.exec('ALTER TABLE players ADD COLUMN ' + col); } catch { /* sütun zaten var */ }
  }
  const q = {
    get: db.raw.prepare('SELECT address, last_seen, created_at, gate, gate_at, gate_prio, warned_at FROM players WHERE address = ?'),
    set: db.raw.prepare('UPDATE players SET gate = ?, gate_at = ?, gate_prio = ?, warned_at = ? WHERE address = ?'),
    warn: db.raw.prepare('UPDATE players SET warned_at = ? WHERE address = ?'),
    count: db.raw.prepare('SELECT gate, COUNT(*) AS n FROM players WHERE banned = 0 GROUP BY gate'),
    citizens: db.raw.prepare("SELECT address, last_seen, warned_at FROM players WHERE banned = 0 AND gate = 'citizen'"),
    waiting: db.raw.prepare("SELECT address, gate_at, gate_prio FROM players WHERE banned = 0 AND gate = 'waiting' ORDER BY gate_prio DESC, gate_at ASC, address ASC"),
    suspended: db.raw.prepare("SELECT address, gate_at, last_seen FROM players WHERE banned = 0 AND gate = 'suspended' ORDER BY gate_at ASC"),
    migrate: db.raw.prepare("UPDATE players SET gate = 'citizen', gate_at = created_at WHERE gate = 'new'")
  };

  // ── Dünya ayarı ──
  const state = () => {
    const s = db.kvJson('world:kapi', null);
    if (s) return s;
    // İlk kurulum: kapıdan önce açılmış bütün hesaplar vatandaş kalır (kimse dışarı atılmaz)
    const init = { limit: Number(K().START_LIMIT) || 50, tier: 0, lastGrowthAt: 0, history: [], installedAt: clock() };
    db.kvSetJson('world:kapi', init);
    q.migrate.run();
    return init;
  };
  const setState = patch => { const next = { ...state(), ...patch }; db.kvSetJson('world:kapi', next); return next; };
  state();

  function counts() {
    const out = { citizen: 0, waiting: 0, suspended: 0, new: 0 };
    for (const r of q.count.all()) out[r.gate] = (out[r.gate] || 0) + r.n;
    return out;
  }

  // ── Oyuncuya haber: oyun içi bildirim (bir sonraki girişte görünür) + e-posta ──
  function notify(address, message, subject) {
    try { E.mutatePlayer(address, gs => gs.pushNotice(message, 'warning')); } catch (err) { log.warn && log.warn('Kapı bildirimi:', err.message); }
    if (mailer && accounts) {
      try {
        const me = accounts.me(address);
        if (me && me.email) mailer.send({ to: me.email, subject: `Realm of AdAstra — ${subject}`, text: message }).catch(err => log.warn && log.warn('Kapı e-postası:', err.message));
      } catch (err) { log.warn && log.warn('Kapı e-postası:', err.message); }
    }
  }

  function makeCitizen(address, why) {
    q.set.run('citizen', clock(), 0, null, address);
    db.event('gate-citizen', address, { why });
    // Kayıt harcı: 1 ASTRA (fiyat çarpanıyla ölçekli), ilk ASTRA'dan düşer (motor: engine.withPlayer)
    const fee = Number(K().REGISTRATION_FEE_ADA) || 0;
    try {
      E.mutatePlayer(address, gs => {
        const due = round3(gs.adaPrice ? gs.adaPrice(fee) : fee);
        const old = gs.state.kayitHarci || null;
        if (!old || !(old.paid >= old.due)) gs.state.kayitHarci = { due, paid: old ? Number(old.paid) || 0 : 0, since: clock() };
        if (why !== 'install') gs.pushNotice('🏛️ Sirius Konseyi seni vatandaş olarak kabul etti. Vadiye hoş geldin! Kayıt harcı ' + due + ' ASTRA ilk kazancından düşülür.', 'success');
      });
    } catch (err) { log.warn && log.warn('Kayıt harcı:', err.message); }
  }

  // Yeni doğrulanmış hesap: yer varsa vatandaş, yoksa sıra
  function admit(address) {
    const p = q.get.get(address);
    if (!p || p.gate !== 'new') return statusOf(address);
    const s = state();
    if (counts().citizen < s.limit) makeCitizen(address, 'admit');
    else { q.set.run('waiting', clock(), 0, null, address); db.event('gate-wait', address); }
    return statusOf(address);
  }

  // Girişte: askıdaki hesap döndü → sıranın önüne; sonra boş yer varsa hemen içeri
  function onLogin(address) {
    const p = q.get.get(address);
    if (!p) return null;
    if (p.gate === 'suspended') {
      q.set.run('waiting', clock(), 1, null, address);
      db.event('gate-return', address);
    } else if (p.gate === 'citizen' && p.warned_at) q.warn.run(null, address);
    fillSeats();
    return statusOf(address);
  }

  function fillSeats() {
    const s = state();
    let free = s.limit - counts().citizen;
    if (free <= 0) return 0;
    let n = 0;
    for (const w of q.waiting.all()) {
      if (free <= 0) break;
      makeCitizen(w.address, w.gate_prio ? 'return' : 'queue');
      notify(w.address, '🏛️ Sıran geldi: AdAstra Vadisi\'nde yerin açıldı, artık vatandaşsın. 30 gün hiç girmezsen yerin sıradakine geçer.', 'yerin açıldı');
      free--; n++;
    }
    return n;
  }

  // Pasiflik: 14 gün → uyarı, 30 gün → askı
  function checkInactivity() {
    const now = clock(), warnMs = (Number(K().INACTIVE_WARN_DAYS) || 14) * DAY, suspMs = (Number(K().INACTIVE_SUSPEND_DAYS) || 30) * DAY;
    const out = { warned: [], suspended: [] };
    for (const p of q.citizens.all()) {
      const idle = now - (Number(p.last_seen) || 0);
      if (idle >= suspMs) {
        q.set.run('suspended', now, 0, null, p.address);
        db.event('gate-suspend', p.address, { idleDays: Math.floor(idle / DAY) });
        notify(p.address, `⏸️ ${Math.floor(idle / DAY)} gündür girmediğin için vadideki yerin bekleyen bir vatandaşa verildi. Hesabın ve her şeyin duruyor: tekrar girdiğinde sıranın önüne alınırsın, ilk boşalan yer senin.`, 'yerin askıya alındı');
        out.suspended.push(p.address);
      } else if (idle >= warnMs && !(p.warned_at && p.warned_at >= p.last_seen)) {
        q.warn.run(now, p.address);
        db.event('gate-warn', p.address, { idleDays: Math.floor(idle / DAY) });
        const left = Math.max(1, Math.ceil((suspMs - idle) / DAY));
        notify(p.address, `⚠️ ${Math.floor(idle / DAY)} gündür vadiye uğramadın. ${left} gün içinde girmezsen yerin bekleme sırasındaki bir vatandaşa geçer (hesabın silinmez, dönünce sıranın önüne alınırsın).`, 'yerin tehlikede');
        out.warned.push(p.address);
      }
    }
    return out;
  }

  // ── Gösterge: son 3 ayda kişi başı aylık dağıtılan kazanç (dolar) ──
  function recordWeek(summary, priceUsd) {
    const s = state();
    const distributed = (Number(summary?.faucet?.totalAda) || 0) + (Number(summary?.withdraw?.sent) || 0) + (Number(summary?.lottery?.prize) || 0);
    const row = { epochId: summary?.epoch ?? null, at: clock(), distributedAda: round3(distributed), priceUsd: Number(priceUsd) || 0, citizens: counts().citizen };
    const history = (Array.isArray(s.history) ? s.history : []).concat([row]).slice(-60);
    setState({ history });
    return row;
  }

  function indicator() {
    const s = state();
    const months = Number(K().AVG_MONTHS) || 3;
    const since = clock() - months * 30 * DAY;
    const rows = (s.history || []).filter(r => r.at >= since && r.citizens > 0);
    if (!rows.length) return { usdPerPlayerMonth: 0, weeks: 0 };
    // Haftalık dağıtım → dolar → kişi başı; aylık = ortalama hafta × 4,33
    const perWeek = rows.map(r => r.distributedAda * r.priceUsd / r.citizens);
    const avg = perWeek.reduce((a, b) => a + b, 0) / perWeek.length;
    return { usdPerPlayerMonth: Math.round(avg * 4.33 * 100) / 100, weeks: rows.length };
  }

  // Büyüme: gösterge o dönemin eşiğini geçtiyse sınır ayda bir %10 büyür
  function growth() {
    const s = state(), tiers = K().USD_TIERS || [10, 30, 100, 300];
    const threshold = tiers[Math.min(s.tier, tiers.length - 1)];
    const ind = indicator();
    if (ind.usdPerPlayerMonth < threshold) return null;
    if (clock() - (Number(s.lastGrowthAt) || 0) < 30 * DAY) return null;
    const limit = Math.ceil(s.limit * (1 + (Number(K().GROWTH_STEP) || 0.1)));
    setState({ limit, lastGrowthAt: clock() });
    db.event('gate-grow', null, { from: s.limit, to: limit, indicator: ind.usdPerPlayerMonth, tier: s.tier });
    return { from: s.limit, to: limit };
  }

  function run() {
    const inactivity = checkInactivity();
    const grown = growth();
    const admitted = fillSeats();
    return { ...inactivity, admitted, grown };
  }

  function statusOf(address) {
    const p = q.get.get(address);
    const s = state(), c = counts();
    const base = { status: p ? p.gate : 'new', limit: s.limit, citizens: c.citizen, waiting: c.waiting };
    if (p && p.gate === 'waiting') {
      const pos = q.waiting.all().findIndex(w => w.address === address);
      base.position = pos >= 0 ? pos + 1 : null;
    }
    return base;
  }
  const isCitizen = address => { const p = q.get.get(address); return !!p && p.gate === 'citizen'; };

  // Herkese açık özet (Sirius Konseyi ekranı)
  function publicSummary() {
    const s = state(), c = counts(), tiers = K().USD_TIERS || [10, 30, 100, 300];
    return { limit: s.limit, citizens: c.citizen, waiting: c.waiting, suspended: c.suspended, tier: s.tier,
      threshold: tiers[Math.min(s.tier, tiers.length - 1)], indicator: indicator(), lastGrowthAt: s.lastGrowthAt || 0,
      warnDays: Number(K().INACTIVE_WARN_DAYS) || 14, suspendDays: Number(K().INACTIVE_SUSPEND_DAYS) || 30 };
  }

  // Yönetici özeti: sıra ve askıdakiler (e-postayla)
  function adminSummary() {
    const emailOf = a => { try { const m = accounts ? accounts.me(a) : null; return m ? m.email : null; } catch { return null; } };
    return { ...publicSummary(),
      queue: q.waiting.all().slice(0, 50).map((w, i) => ({ position: i + 1, playerId: w.address, email: emailOf(w.address), since: w.gate_at, returning: !!w.gate_prio })),
      suspendedList: q.suspended.all().slice(0, 50).map(p => ({ playerId: p.address, email: emailOf(p.address), since: p.gate_at, lastSeen: p.last_seen })),
      history: (state().history || []).slice(-13) };
  }

  function adminSet({ limit, tier } = {}) {
    const patch = {};
    if (limit != null) { const n = Math.floor(Number(limit)); if (!Number.isFinite(n) || n < 1 || n > 100000) throw new Error('Sınır 1 ile 100.000 arasında olmalı'); patch.limit = n; }
    if (tier != null) { const t = Math.floor(Number(tier)); const max = (K().USD_TIERS || [10, 30, 100, 300]).length - 1; if (!Number.isFinite(t) || t < 0 || t > max) throw new Error('Dönem 0 ile ' + max + ' arasında olmalı'); patch.tier = t; }
    if (!Object.keys(patch).length) throw new Error('Değişecek bir şey yok');
    const next = setState(patch);
    db.event('gate-admin', null, patch);
    fillSeats();
    return { limit: next.limit, tier: next.tier, ...publicSummary() };
  }

  // Yönetici: bir hesabı elle içeri al / askıya al / sıraya koy
  function adminSetPlayer(address, status) {
    const p = q.get.get(address);
    if (!p) throw new Error('Oyuncu yok');
    if (status === 'citizen') { if (p.gate === 'citizen') return statusOf(address); makeCitizen(address, 'admin'); notify(address, '🏛️ Yönetici seni vadiye aldı: artık vatandaşsın.', 'yerin açıldı'); }
    else if (status === 'suspended') { q.set.run('suspended', clock(), 0, null, address); db.event('gate-suspend', address, { by: 'admin' }); fillSeats(); }
    else if (status === 'waiting') { q.set.run('waiting', clock(), 1, null, address); db.event('gate-wait', address, { by: 'admin' }); fillSeats(); }
    else throw new Error('Durum citizen / waiting / suspended olmalı');
    return statusOf(address);
  }

  return { admit, onLogin, run, fillSeats, checkInactivity, recordWeek, indicator, growth, statusOf, isCitizen, publicSummary, adminSummary, adminSet, adminSetPlayer, state, counts, playerIdOf };
}
