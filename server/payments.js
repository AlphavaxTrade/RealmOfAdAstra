// Realm of AdAstra sunucusu — cüzdandan ödeme (RealmPayments sözleşmesi)
// ============================================================================
// Kullanıcı kararı (2 Ekim 2026): tıklamalı işlerde önce oyunda kazanılmış bakiye kullanılır; yetmezse kalan
// kısım oyuncunun kendi cüzdanından, ödeme sözleşmesi üzerinden tek işlemle ödenir (ağ ücreti kadar AVAX
// komisyonu bize gelir). Akış:
//  1. quote: sunucu işlemi "deneme" olarak çalıştırıp tutarını ölçer (sonra geri alır). Eksik varsa referanslı
//     bir teklif açar (15 dakika).
//  2. Oyuncu cüzdanından pay(miktar, referans) gönderir.
//  3. confirm: sunucu işlemi zincirden doğrular (doğru sözleşme, oyuncunun ETKİN cüzdanı, aynı referans,
//     yeterli miktar, daha önce kullanılmamış) → ödenen ASTRA oyuncunun bakiyesine eklenir → işlem yapılır.
//     İşlem o anda başarısız olursa (ör. fiyat değişti) ödenen ASTRA bakiyede kalır, kaybolmaz.
// ============================================================================
import crypto from 'node:crypto';
import { validateArgs } from './actions.js';




const MAX_ACIK_TEKLIF = 5;

export function createPayments({ db, engine, accounts, chain, kasa = null, cfg, clock = () => Date.now(), log = console }) {
  const q = {
    add: db.raw.prepare('INSERT INTO pay_quotes (ref, player, name, args, amount, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    get: db.raw.prepare('SELECT * FROM pay_quotes WHERE ref = ?'),
    used: db.raw.prepare('SELECT ref FROM pay_quotes WHERE tx_hash = ?'),
    mark: db.raw.prepare("UPDATE pay_quotes SET status = 'paid', tx_hash = ?, paid = ? WHERE ref = ? AND status = 'open'"),
    // Açık teklifler hemen silinmez: geç gelen bir ödeme yine eşleşebilsin (30 gün)
    purge: db.raw.prepare("DELETE FROM pay_quotes WHERE status = 'open' AND expires < ?"),
    openCount: db.raw.prepare("SELECT COUNT(*) AS n FROM pay_quotes WHERE player = ? AND status = 'open' AND expires > ?"),
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
    // Hesap başına açık teklif sınırı: her teklif tam oyuncu yükleme + deneme çalıştırması demek (ucuz yük çarpanı olmasın)
    if (q.openCount.get(playerId, clock()).n >= MAX_ACIK_TEKLIF) return { ok: false, error: 'Çok fazla açık ödeme teklifin var; birini tamamla ya da 15 dakika bekle.' };
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
      try { p = await chain.verifyPayment(txHash, row.ref); } catch (e) { return { ok: false, error: e.rejected ? 'Ödeme doğrulanamadı: ' + e.message : 'Ödeme zincirde henüz görünmüyor, birazdan tekrar dene.', retry: !e.rejected }; }
      if (!p) return { ok: false, error: 'Ödeme zincirde henüz görünmüyor, birazdan tekrar dene.', retry: true };
      // Aynı işlemde birden çok ödeme varsa her biri kendi anahtarıyla (işlem#ref) kaydedilir: hiçbiri kaybolmaz, hiçbiri iki kez sayılmaz
      if (p.multi) { txHash = txHash + '#' + p.ref; if (q.used.get(txHash)) return { ok: false, error: 'Bu ödeme işlemi zaten kullanıldı.' }; }
      const wallet = accounts ? accounts.activeWallet(playerId) : null;
      if (p.contract !== String(cfg.paymentsContract).toLowerCase()) return { ok: false, error: 'Ödeme bizim sözleşmemize yapılmamış.' };
      if (!wallet || p.payer !== wallet) return { ok: false, error: 'Ödeme, hesabına bağlı cüzdandan yapılmamış.' };
      if (p.ref.toLowerCase() !== row.ref.toLowerCase()) return { ok: false, error: 'Ödeme referansı bu teklife ait değil.' };
      if (p.amount + 1e-9 < row.amount) return { ok: false, error: 'Ödenen miktar teklif edilenden az.' };
      paid = p.amount;
    }
    // Tek seferde: teklifi kapat, ASTRA'yı bakiyeye ekle, işlemi yap (aynı ödeme iki kez kullanılamaz)
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
      if (kasa && kasa.isKasaAddress && kasa.isKasaAddress(l.payer)) continue;   // Oyun Kasası'nın saatlik aktarımı
      const row = q.get.get(l.ref);
      if (!row) { db.event('payment-unmatched', null, l); continue; }
      if (row.status !== 'open') continue;
      if (q.used.get(l.txHash)) continue;
      // Ödeme gerçekten oyun cüzdanına gitmiş mi (aynı denetim); kredilenecek miktar GERÇEKTEN ulaşan miktardır (ücretli token)
      let p;
      try { p = await chain.verifyPayment(l.txHash, l.ref); } catch (e) {
        if (!e.rejected) { log.error('Ödeme kurtarma (geçici hata, aynı blok aralığı yeniden taranacak)', e); return n; }   // RPC hatası ödemeyi sonsuza dek atlamasın
        db.event('payment-rejected', row.player, { ref: l.ref, tx: l.txHash, reason: e.message }); continue;
      }
      if (!p) { log.error('Ödeme kurtarma: işlem makbuzu henüz okunamadı', l.txHash); return n; }
      const anahtar = p.multi ? l.txHash + '#' + p.ref : l.txHash;           // aynı işlemde birden çok ödeme: her biri ayrı anahtar
      if (anahtar !== l.txHash && q.used.get(anahtar)) continue;
      const tutar = p.amount;
      try {
        db.tx(() => {
          if (Number(q.credit.run(anahtar, tutar, row.ref).changes) !== 1) return;
          db.q.playerAddDeposit.run(tutar, row.player);
          engine.mutatePlayer(row.player, gs => {
            gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + tutar;
            gs.state.depositedAda = (Number(gs.state.depositedAda) || 0) + tutar;
            gs.state.walletPaidAda = (Number(gs.state.walletPaidAda) || 0) + tutar;
            gs.pushNotice(`💳 Cüzdan ödemen (${Math.floor(tutar).toLocaleString('tr-TR')} ASTRA) bakiyene eklendi. Yarım kalan işlemi şimdi tekrar yapabilirsin.`, 'success');
          });
          n++;
        });
        db.event('payment-recovered', row.player, { ref: row.ref, tx: l.txHash, amount: tutar, declared: p.declared });
      } catch (e) { engine.reloadWorld(); log.error('Ödeme kurtarma', e); }
    }
    db.kvSet('chain:payBlock', to + 1);
    return n;
  }

  return { info, quote, confirm, scanPaid };
}
