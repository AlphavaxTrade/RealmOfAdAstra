// Realm of AdAstra sunucusu — dünya: ortak gelir (trade sitesinden gelen ADASTRA)
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { DAY } from './yardimci.js';

export function olusturOrtakGelir(w) {
  const { db, E, chain, cfg, clock, atomic } = w;
  // ── Ortak gelir: trade sitesinden gelen ADASTRA (kullanıcı kararı 6 Ekim 2026) ──
  // PARTNER_INCOME_FROM cüzdan(lar)ından PARTNER_INCOME_TO (boşsa oyun cüzdanı) adresine gelen her ADASTRA transferi
  // bir kez işlenir ve oyundaki her harcama gibi dağıtılır (%5 yakım, %6 temel gelir, %3 yapımcı, %86 ödül kasaları).
  const piAdd = db.raw.prepare('INSERT OR IGNORE INTO partner_income (tx_hash, log_index, sender, amount, block, at) VALUES (?, ?, ?, ?, ?, ?)');
  const partnerTo = () => (cfg.partnerIncomeTo || (chain && chain.gameWallet) || '').toLowerCase();

  // Gelen bir ortak gelir kaydını işle (aynı işlem iki kez sayılmaz)
  function creditPartnerIncome(l) {
    return atomic(() => {
      const r = piAdd.run(l.txHash, l.logIndex, l.from, l.amount, l.block || null, clock());
      if (Number(r.changes) !== 1 || !(l.amount > 0)) return 0;
      E.globalPool.recordTokenSpend(l.amount);
      db.event('partner-income', null, { tx: l.txHash, from: l.from, amount: l.amount });
      return l.amount;
    });
  }

  async function scanPartnerIncome() {
    const to = partnerTo();
    if (!chain || !chain.scanTransfers || !to || !(cfg.partnerIncomeFrom || []).length) return 0;
    const latest = await chain.latestBlock();
    let from = Number(db.kvGet('chain:partnerBlock')) || 0;
    if (!from) { db.kvSet('chain:partnerBlock', latest + 1); return 0; }   // ilk açılış: bugünden itibaren
    if (from > latest) return 0;
    const upto = Math.min(latest, from + 20000);
    const logs = await chain.scanTransfers(cfg.partnerIncomeFrom, to, from, upto);
    let total = 0;
    for (const l of logs) total += creditPartnerIncome(l);
    db.kvSet('chain:partnerBlock', upto + 1);
    return total;
  }

  function partnerIncomeStatus() {
    const all = db.raw.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS t FROM partner_income').get();
    const week = db.raw.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM partner_income WHERE at >= ?').get(clock() - 7 * DAY);
    return { enabled: !!(partnerTo() && (cfg.partnerIncomeFrom || []).length), to: partnerTo() || null, from: cfg.partnerIncomeFrom || [], count: all.n, totalAda: all.t, weekAda: week.t };
  }


  return { piAdd, partnerTo, creditPartnerIncome, scanPartnerIncome, partnerIncomeStatus };
}
