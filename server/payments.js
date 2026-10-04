// Realm of Astra sunucusu — cüzdandan ödeme (RealmPayments sözleşmesi)
// ============================================================================
// Kullanıcı kararı (2 Ekim 2026): tıklamalı işlerde önce oyunda kazanılmış bakiye kullanılır; yetmezse kalan
// kısım oyuncunun kendi cüzdanından, ödeme sözleşmesi üzerinden tek işlemle ödenir (ağ ücreti kadar AVAX
// komisyonu bize gelir). Akış:
//  1. quote: sunucu işlemi "deneme" olarak çalıştırıp tutarını ölçer (sonra geri alır). Eksik varsa referanslı
//     bir teklif açar (15 dakika).
//  2. Oyuncu cüzdanından pay(miktar, referans) gönderir.
//  3. confirm: sunucu işlemi zincirden doğrular (doğru sözleşme, oyuncunun ETKİN cüzdanı, aynı referans,
//     yeterli miktar, daha önce kullanılmamış) → ödenen ADA oyuncunun bakiyesine eklenir → işlem yapılır.
//     İşlem o anda başarısız olursa (ör. fiyat değişti) ödenen ADA bakiyede kalır, kaybolmaz.
// ============================================================================
import crypto from 'node:crypto';
import { validateArgs } from './actions.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pay_quotes (
  ref TEXT PRIMARY KEY, player TEXT NOT NULL, name TEXT NOT NULL, args TEXT NOT NULL, amount REAL NOT NULL,
  created INTEGER NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', tx_hash TEXT UNIQUE, paid REAL
);`;

const INSUFFICIENT_RE = /Yetersiz\s*(\$?ADASTRA|AdAstra|ADA)\b/i;
export const isInsufficientAda = msg => INSUFFICIENT_RE.test(String(msg || ''));

export function createPayments({ db, engine, accounts, chain, cfg, clock = () => Date.now(), log = console }) {
  db.raw.exec(SCHEMA);
  const q = {
    add: db.raw.prepare('INSERT INTO pay_quotes (ref, player, name, args, amount, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    get: db.raw.prepare('SELECT * FROM pay_quotes WHERE ref = ?'),
    used: db.raw.prepare('SELECT ref FROM pay_quotes WHERE tx_hash = ?'),
    mark: db.raw.prepare("UPDATE pay_quotes SET status = 'paid', tx_hash = ?, paid = ? WHERE ref = ? AND status = 'open'"),
    // Açık teklifler hemen silinmez: geç gelen bir ödeme yine eşleşebilsin (30 gün)
    purge: db.raw.prepare("DELETE FROM pay_quotes WHERE status = 'open' AND expires < ?"),
    credit: db.raw.prepare("UPDATE pay_quotes SET status = 'credited', tx_hash = ?, paid = ? WHERE ref = ? AND status = 'open'")
  };
  const simulated = () => cfg.testMode && !cfg.paymentsContract;     // deneme sunucusu, sözleşme yok: ödeme taklidi

  function info() {
    return {
      enabled: !!cfg.paymentsContract || simulated(),
      simulated: simulated(),
      contract: cfg.paymentsContract || null,
      token: cfg.tokenAddress,
      chainId: cfg.chainId,
      feeGas: cfg.payFeeGas
    };
  }

  // 1) Teklif
  function quote(playerId, name, args) {
    const err = validateArgs(name, args);
    if (err) return { ok: false, error: err };
    const c = engine.quoteCost(playerId, name, args);
    if (!c) return { ok: false, error: 'İşlem hesaplanamadı.' };
    if (!c.succeeds) return { ok: true, needPayment: false, message: c.message || 'Bu işlem şu an yapılamaz.' };
    const shortfall = c.spent > c.balance ? Math.ceil((c.spent - c.balance) * 1.02 + 1) : 0;   // %2 pay: fiyat oynarsa yetmeme olmasın
    if (shortfall <= 0) return { ok: true, needPayment: false, message: 'Bakiyen bu işlem için yeterli.' };
    const p = info();
    if (!p.enabled) return { ok: false, error: 'Cüzdandan ödeme henüz açılmadı.' };
    const wallet = accounts ? accounts.activeWallet(playerId) : null;
    q.purge.run(clock() - 30 * 86400000);
    const ref = '0x' + crypto.randomBytes(32).toString('hex');
    q.add.run(ref, playerId, name, JSON.stringify(args || []), shortfall, clock(), clock() + 15 * 60000);
    return { ok: true, needPayment: true, ref, amountAda: shortfall, cost: Math.ceil(c.spent), balance: Math.floor(c.balance), wallet, ...p };
  }

  // 2-3) Ödeme doğrulama ve işlem
  async function confirm(playerId, ref, txHash) {
    const row = typeof ref === 'string' ? q.get.get(ref) : null;
    if (!row || row.player !== playerId) return { ok: false, error: 'Teklif bulunamadı.' };
    if (row.status === 'credited') return { ok: false, error: 'Ödemen zaten bakiyene eklendi; işlemi şimdi tekrar yapabilirsin.' };
    if (row.status !== 'open') return { ok: false, error: 'Bu teklif zaten kullanıldı.' };
    let paid;
    if (simulated()) {
      if (txHash !== 'test') return { ok: false, error: 'Deneme modunda ödeme taklidi kullanılır.' };
      paid = row.amount;
      txHash = 'test:' + ref;
    } else {
      if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ''))) return { ok: false, error: 'Geçersiz işlem numarası.' };
      if (q.used.get(txHash)) return { ok: false, error: 'Bu ödeme işlemi zaten kullanıldı.' };
      let p;
      try { p = await chain.verifyPayment(txHash); } catch (e) { return { ok: false, error: 'Ödeme zincirde henüz görünmüyor, birazdan tekrar dene.', retry: true }; }
      if (!p) return { ok: false, error: 'Ödeme zincirde henüz görünmüyor, birazdan tekrar dene.', retry: true };
      const wallet = accounts ? accounts.activeWallet(playerId) : null;
      if (p.contract !== String(cfg.paymentsContract).toLowerCase()) return { ok: false, error: 'Ödeme bizim sözleşmemize yapılmamış.' };
      if (!wallet || p.payer !== wallet) return { ok: false, error: 'Ödeme, hesabına bağlı cüzdandan yapılmamış.' };
      if (p.ref.toLowerCase() !== row.ref.toLowerCase()) return { ok: false, error: 'Ödeme referansı bu teklife ait değil.' };
      if (p.amount + 1e-9 < row.amount) return { ok: false, error: 'Ödenen miktar teklif edilenden az.' };
      paid = p.amount;
    }
    // Tek seferde: teklifi kapat, ADA'yı bakiyeye ekle, işlemi yap (aynı ödeme iki kez kullanılamaz)
    let out;
    try {
      out = db.tx(() => {
        const r = q.mark.run(txHash, paid, row.ref);
        if (Number(r.changes) !== 1) throw Object.assign(new Error('Bu teklif zaten kullanıldı.'), { userError: true });
        db.q.playerAddDeposit.run(paid, playerId);
        const res = engine.withPlayer(playerId, gs => {
          gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + paid;   // kendi parası: serbest (kilitsiz)
          gs.state.depositedAda = (Number(gs.state.depositedAda) || 0) + paid;
          gs.state.walletPaidAda = (Number(gs.state.walletPaidAda) || 0) + paid;
          return engine.runAction(gs, row.name, JSON.parse(row.args));
        });
        db.q.playerSeen.run(clock(), playerId);
        return res;
      });
    } catch (e) {
      engine.reloadWorld();
      if (e.userError) return { ok: false, error: e.message };
      log.error('Ödeme işlemi', e);
      return { ok: false, error: 'Sunucu hatası.' };
    }
    db.event('wallet-payment', playerId, { ref: row.ref, tx: txHash, amount: paid, action: row.name });
    return { ok: true, paid, result: out.result, state: out.state };
  }

  // 🔎 Kurtarma: oyuncu ödeyip onay gelmeden tarayıcıyı kapatırsa para kaybolmasın. Sözleşmedeki ödemeler zincirden
  // taranır; açık bir teklifle eşleşen her ödeme oyuncunun bakiyesine eklenir (işlem yapılmaz, oyuncu tekrar dener).
  async function scanPaid() {
    if (!chain || !cfg.paymentsContract || simulated()) return 0;
    const latest = await chain.latestBlock();                 // Avalanche: işlem blokta görünür görünmez kesindir
    let from = Number(db.kvGet('chain:payBlock')) || 0;
    if (!from) { db.kvSet('chain:payBlock', latest + 1); return 0; }
    if (from > latest) return 0;
    const to = Math.min(latest, from + 20000);
    const logs = await chain.scanPaid(from, to);
    let n = 0;
    for (const l of logs) {
      const row = q.get.get(l.ref);
      if (!row) { db.event('payment-unmatched', null, l); continue; }
      if (row.status !== 'open') continue;
      if (q.used.get(l.txHash)) continue;
      try {
        db.tx(() => {
          if (Number(q.credit.run(l.txHash, l.amount, row.ref).changes) !== 1) return;
          db.q.playerAddDeposit.run(l.amount, row.player);
          engine.mutatePlayer(row.player, gs => {
            gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + l.amount;
            gs.state.depositedAda = (Number(gs.state.depositedAda) || 0) + l.amount;
            gs.state.walletPaidAda = (Number(gs.state.walletPaidAda) || 0) + l.amount;
            gs.pushNotice(`💳 Cüzdan ödemen (${Math.floor(l.amount).toLocaleString('tr-TR')} ADA) bakiyene eklendi. Yarım kalan işlemi şimdi tekrar yapabilirsin.`, 'success');
          });
          n++;
        });
        db.event('payment-recovered', row.player, { ref: row.ref, tx: l.txHash, amount: l.amount });
      } catch (e) { engine.reloadWorld(); log.error('Ödeme kurtarma', e); }
    }
    db.kvSet('chain:payBlock', to + 1);
    return n;
  }

  return { info, quote, confirm, scanPaid };
}
