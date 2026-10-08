// Realm of AdAstra sunucusu — dünya: zincir ödeme kuyruğu (pending → sending → sent; "sending" tekrar gönderilmez)
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { DAY } from './yardimci.js';

export function olusturOdemeler(w) {
  const { db, E, chain, cfg, clock, econ } = w;
  // ── Haftalık hesaplaşma ─────────────────────────────────────────────────
  function queuePayout(epoch, kind, address, amount) {
    if (!(amount >= 1)) return;
    db.q.payoutAdd.run(epoch, kind, address, Math.floor(amount * 100) / 100, clock());
  }

  // ── Zincir ödemeleri ────────────────────────────────────────────────────
  let paying = false;
  async function processPayouts({ force = false } = {}) {
    const e = econ();
    if (paying) return { skipped: 'busy' };
    if (!chain || !chain.canSend) return { skipped: 'no-wallet' };
    if (e.paused) return { skipped: 'paused' };
    if (cfg.payoutMode !== 'auto' && !force) return { skipped: 'manual' };
    paying = true;
    const out = { sent: 0, failed: 0 };
    try {
      const since = Number(E.globalPool.state.epochStartTime) || clock() - 7 * DAY;
      const rows = db.q.payoutsPending.all();
      let sentWithdraw = db.raw.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM payouts WHERE kind='withdraw' AND status IN ('sent','sending') AND sent_at >= ?").get(since).t;
      for (const p of rows) {
        if (econ().paused) break;
        if (p.kind === 'withdraw' && sentWithdraw + p.amount > cfg.weeklySendCapAda) {
          db.q.payoutMark.run('pending', null, 'Haftalık güvenlik sınırı dolu; gelecek hafta ya da yönetici onayıyla', null, p.id);
          continue;
        }
        db.q.payoutMark.run('sending', null, null, clock(), p.id);
        if (p.kind === 'withdraw') sentWithdraw += p.amount;
        try {
          const hash = await chain.sendAda(p.address, p.amount, s => db.q.payoutSigned.run(s.hash, s.raw, s.nonce, p.id));
          db.q.payoutMark.run('sent', hash, null, clock(), p.id);
          out.sent++;
        } catch (err) {
          const msg = String(err.shortMessage || err.message).slice(0, 300);
          const row = db.q.payoutGet.get(p.id);
          if (row && row.tx_hash && !err.reverted) {
            // İmzalandı, gönderilmiş olabilir: TEKRAR GÖNDERİLMEZ; reconcilePayouts() zincirden sonuçlandırır
            db.q.payoutSetStatus.run('sending', 'Onay bekleniyor: ' + msg, p.id);
          } else {
            db.q.payoutMark.run('pending', null, msg, null, p.id);
            if (p.kind === 'withdraw') sentWithdraw -= p.amount;
          }
          out.failed++;
        }
      }
    } finally {
      paying = false;
    }
    return out;
  }

  // "Gönderiliyor" kalmış ödemeleri zincirden sonuçlandır: işlendiyse 'sent', hiç işlenmeyecekse yeniden sıraya
  async function reconcilePayouts() {
    if (!chain || !chain.canSend) return { skipped: true };
    const out = { sent: 0, retry: 0, waiting: 0, unknown: 0 };
    for (const r of db.q.payoutsSending.all()) {
      if (!r.tx_hash) { out.unknown++; continue; }        // imza kaydı yok: yönetici kontrol eder
      const st = await chain.checkPayout({ hash: r.tx_hash, raw: r.raw_tx, nonce: r.tx_nonce }).catch(() => 'waiting');
      if (st === 'sent') { db.q.payoutMark.run('sent', r.tx_hash, null, clock(), r.id); out.sent++; }
      else if (st === 'failed') { db.q.payoutMark.run('pending', null, 'Önceki gönderim zincirde işlenmedi; yeniden denenecek', null, r.id); out.retry++; }
      else out.waiting++;
    }
    return out;
  }


  return { queuePayout, processPayouts, reconcilePayouts };
}
