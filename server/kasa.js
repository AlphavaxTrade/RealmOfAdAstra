// Realm of AdAstra sunucusu — Oyun Kasası (her oyuncuya sunucunun yönettiği gerçek bir zincir cüzdanı)
// ============================================================================
// Kullanıcı kararı (2 Ekim 2026, B seçeneği):
//  • Oyuncu kendi Oyun Kasası adresine ADASTRA ve biraz AVAX yatırır. Kasa YALNIZ oyuncu yokken çalışan
//    otomatik işler içindir (pasif iyileşme, bot ücreti, botun pazar işleri, alet onarımı). Bu işler önce oyunda
//    kazanılmış bakiyeyi, yetmezse kasayı kullanır; ikisi de bitince durur.
//  • Kasadan harcanan ASTRA birikir ve saatte bir, tek işlemle ödeme sözleşmesi (RealmPayments) üzerinden oyuna
//    aktarılır; ağ ücreti kadar AVAX komisyonu da bu işlemle alınır.
//  • Kasadaki para oyuncunun kendi parasıdır: kesinti ve haftalık havuz olmadan, istediği an bağlı (etkin)
//    cüzdanına çekebilir. Kazanılmış ASTRA kasaya aktarılamaz (kesintiden kaçış yolu yok).
//  • Gizli anahtarlar KASA_MASTER_KEY ile şifreli saklanır (AES-256-GCM). Sunucu ele geçirilirse kasalar risk
//    altındadır; bu yüzden oyuncuya kasada az para tutması öğütlenir ("Sandık Tavsiyesi").
//  • Üst sınır (kullanıcı kararı 4 Ekim 2026): kasada "günlük ortalama harcama × 30 gün"den (yeni oyuncu için en az
//    KASA_CAP_FLOOR_ADA) fazlası birikirse fazlası saatte bir oyuncunun bağlı cüzdanına kendiliğinden geri gönderilir.
//  • DENEME SUNUCUSUNDA (TEST_MODE) kasa zincire bağlanmaz: bakiyeler taklittir, gerçek ASTRA yatırılamaz.
// ============================================================================
import crypto from 'node:crypto';
import { ethers } from 'ethers';



const ERC20 = new ethers.Interface(['function approve(address,uint256) returns (bool)', 'function transfer(address,uint256) returns (bool)']);
const PAY = new ethers.Interface(['function pay(uint256 amount, bytes32 ref) payable']);
const dayKey = t => new Date(t + 3 * 3600000).toISOString().slice(0, 10);   // TSİ günü

export function createKasa({ db, chain = null, accounts = null, cfg, clock = () => Date.now(), log = console, priceMultiplier = () => 1, notify = null }) {
  const simulated = !!cfg.testMode;
  let master = null;
  if (/^[0-9a-fA-F]{64}$/.test(cfg.kasaMasterKey || '')) master = Buffer.from(cfg.kasaMasterKey, 'hex');
  else if (simulated) {
    let k = db.kvGet('dev:kasaMasterKey');
    if (!k) { k = crypto.randomBytes(32).toString('hex'); db.kvSet('dev:kasaMasterKey', k); }
    master = Buffer.from(k, 'hex');
  }
  const enabled = !!master && (simulated || !!(chain && cfg.paymentsContract));

  const q = {
    get: db.raw.prepare('SELECT * FROM kasa WHERE player = ?'),
    add: db.raw.prepare('INSERT INTO kasa (player, address, key_enc, created) VALUES (?, ?, ?, ?)'),
    setBal: db.raw.prepare('UPDATE kasa SET ada = ?, avax = ?, bal_at = ? WHERE player = ?'),
    addPending: db.raw.prepare('UPDATE kasa SET pending = pending + ? WHERE player = ?'),
    usage: db.raw.prepare('INSERT INTO kasa_usage (player, day, ada) VALUES (?, ?, ?) ON CONFLICT(player, day) DO UPDATE SET ada = ada + excluded.ada'),
    usageSince: db.raw.prepare('SELECT day, ada FROM kasa_usage WHERE player = ? AND day >= ? ORDER BY day'),
    toSettle: db.raw.prepare('SELECT * FROM kasa WHERE pending >= ? OR (pending > 0 AND last_settle < ?)'),
    active: db.raw.prepare('SELECT k.* FROM kasa k JOIN players p ON p.address = k.player WHERE p.last_seen >= ? OR k.pending > 0 ORDER BY k.bal_at LIMIT ?'),
    opAdd: db.raw.prepare('INSERT INTO kasa_ops (player, kind, amount, created) VALUES (?, ?, ?, ?)'),
    opsOpen: db.raw.prepare("SELECT * FROM kasa_ops WHERE status = 'pending' ORDER BY id"),
    opsSending: db.raw.prepare("SELECT * FROM kasa_ops WHERE status = 'sending' ORDER BY id"),
    opsOf: db.raw.prepare('SELECT id, kind, amount, status, tx_hash, error, created, done_at FROM kasa_ops WHERE player = ? ORDER BY id DESC LIMIT 10'),
    inflight: db.raw.prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM kasa_ops WHERE player = ? AND kind IN ('settle', 'withdraw_ada', 'return_ada') AND status IN ('pending', 'sending')"),
    returnOpen: db.raw.prepare("SELECT 1 FROM kasa_ops WHERE player = ? AND kind = 'return_ada' AND status IN ('pending', 'sending') LIMIT 1"),
    withBalance: db.raw.prepare('SELECT * FROM kasa WHERE ada > 0'),
    inflightAvax: db.raw.prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM kasa_ops WHERE player = ? AND kind = 'withdraw_avax' AND status IN ('pending', 'sending')"),
    opSigned: db.raw.prepare("UPDATE kasa_ops SET status = 'sending', tx_hash = ?, raw_tx = ?, tx_nonce = ? WHERE id = ?"),
    opDone: db.raw.prepare("UPDATE kasa_ops SET status = ?, error = ?, done_at = ? WHERE id = ?"),
    settled: db.raw.prepare('UPDATE kasa SET settled = settled + ?, last_settle = ? WHERE player = ?'),
    approved: db.raw.prepare('UPDATE kasa SET approved = 1 WHERE player = ?'),
    takePending: db.raw.prepare('UPDATE kasa SET pending = pending - ?, last_settle = ? WHERE player = ?')
  };

  function encrypt(pk) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', master, iv);
    const ct = Buffer.concat([c.update(pk, 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), ct].map(b => b.toString('base64')).join('.');
  }
  function decrypt(s) {
    const [iv, tag, ct] = s.split('.').map(x => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', master, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  }
  const signerOf = row => new ethers.Wallet(decrypt(row.key_enc));

  function ensure(playerId) {
    if (!enabled) return null;
    let row = q.get.get(playerId);
    if (!row) {
      const w = ethers.Wallet.createRandom();
      q.add.run(playerId, w.address.toLowerCase(), encrypt(w.privateKey), clock());
      row = q.get.get(playerId);
      db.event('kasa-created', playerId, { address: row.address });
    }
    return row;
  }

  // Oyun motorunun kullanabileceği kasa ASTRA'sı (AVAX gaz payı yoksa 0: aktarım yapılamaz → kasa kullanılmaz)
  function available(playerId) {
    if (!enabled) return 0;
    const row = q.get.get(playerId);
    if (!row) return 0;
    if (!simulated && row.avax < cfg.kasaMinAvax) return 0;
    return Math.max(0, row.ada - row.pending - q.inflight.get(playerId).t);
  }

  // Motor kasadan harcadı: aktarılmayı bekleyen tutara eklenir
  function consume(playerId, amount) {
    const v = Number(amount) || 0;
    if (!(v > 0)) return;
    q.addPending.run(v, playerId);
    q.usage.run(playerId, dayKey(clock()), v);
  }

  async function refresh(playerId) {
    const row = q.get.get(playerId);
    if (!row || simulated || !chain) return row;
    const b = await chain.balances(row.address);
    q.setBal.run(b.ada, b.avax, clock(), playerId);
    return q.get.get(playerId);
  }

  // 🧪 Deneme sunucusu: kasaya taklit para
  function simulateDeposit(playerId, ada, avax) {
    if (!simulated) return { ok: false, error: 'Yalnız deneme sunucusunda.' };
    const row = ensure(playerId);
    q.setBal.run(row.ada + Math.max(0, Number(ada) || 0), row.avax + Math.max(0, Number(avax) || 0), clock(), playerId);
    return { ok: true };
  }

  function withdraw(playerId, asset, amount) {
    if (!enabled) return { ok: false, error: 'Oyun Kasası kapalı.' };
    const row = q.get.get(playerId);
    if (!row) return { ok: false, error: 'Oyun Kasan yok.' };
    const to = accounts ? accounts.activeWallet(playerId) : null;
    if (!to) return { ok: false, error: 'Çekim için önce hesabına bir cüzdan bağla.' };
    const v = Math.floor((Number(amount) || 0) * 1e6) / 1e6;
    if (!(v > 0)) return { ok: false, error: 'Geçerli bir miktar yaz.' };
    if (asset === 'ADA') {
      const av = Math.max(0, row.ada - row.pending - q.inflight.get(playerId).t);
      if (v > av + 1e-9) return { ok: false, error: `Kasadan çekilebilir ASTRA: ${Math.floor(av)}` };
      if (!simulated && row.avax < cfg.kasaMinAvax) return { ok: false, error: 'Kasada işlem ücreti için yeterli AVAX yok.' };
    } else if (asset === 'AVAX') {
      const av = Math.max(0, row.avax - q.inflightAvax.get(playerId).t - (simulated ? 0 : cfg.kasaMinAvax / 2));
      if (v > av + 1e-12) return { ok: false, error: `Kasadan çekilebilir AVAX: ${av.toFixed(4)} (işlem ücreti için biraz bırakılır)` };
    } else return { ok: false, error: 'Geçersiz varlık' };
    q.opAdd.run(playerId, asset === 'ADA' ? 'withdraw_ada' : 'withdraw_avax', v, clock());
    db.event('kasa-withdraw', playerId, { asset, amount: v, to });
    processOps().catch(e => log.warn('Kasa işlemi:', e.message));
    return { ok: true, message: `🏦 ${v} ${asset} kasandan ${to.slice(0, 6)}…${to.slice(-4)} cüzdanına gönderiliyor.` };
  }

  // Kasa üst sınırı: son 14 günün günlük ortalama harcaması × KASA_CAP_DAYS; en az alt sınır (fiyat çarpanıyla)
  function capOf(playerId, row = q.get.get(playerId)) {
    if (!row) return 0;
    const usage = q.usageSince.all(playerId, dayKey(clock() - 14 * 86400000));
    const span = Math.max(1, Math.min(14, (clock() - row.created) / 86400000));
    const perDay = usage.reduce((s, u) => s + u.ada, 0) / span;
    const floor = (Number(cfg.kasaCapFloorAda) || 0) * (Number(priceMultiplier()) || 1);
    return Math.max(perDay * (Number(cfg.kasaCapDays) || 30), floor);
  }

  // Saatlik: sınırı aşan kasaların fazlasını bağlı cüzdana geri gönder (küçük kırıntılar için işlem açılmaz)
  function enforceCaps() {
    if (!enabled || !(cfg.kasaCapDays > 0)) return 0;
    let n = 0;
    for (const row of q.withBalance.all()) {
      if (q.returnOpen.get(row.player)) continue;
      const free = row.ada - row.pending - q.inflight.get(row.player).t;
      const cap = capOf(row.player, row);
      const excess = Math.floor((free - cap) * 100) / 100;
      if (!(excess >= Math.max(1, cap * 0.05))) continue;
      if (!simulated && row.avax < cfg.kasaMinAvax) continue;
      const to = accounts ? accounts.activeWallet(row.player) : null;
      if (!to) continue;                                  // bağlı cüzdan yok: panel uyarır, para kasada kalır
      q.opAdd.run(row.player, 'return_ada', excess, clock());
      db.event('kasa-return', row.player, { amount: excess, cap, to });
      if (notify) try { notify(row.player, `🛡️ Oyun Kasan üst sınırı (${Math.floor(cap).toLocaleString('tr-TR')} ASTRA) aştı: fazla ${Math.floor(excess).toLocaleString('tr-TR')} ASTRA güvenliğin için cüzdanına geri gönderiliyor.`); } catch { /* bildirim olmasa da olur */ }
      n++;
    }
    return n;
  }

  function status(playerId) {
    if (!enabled) return { enabled: false };
    const row = ensure(playerId);
    const cap = capOf(playerId, row);
    const since = dayKey(clock() - 3 * 86400000);
    const usage = q.usageSince.all(playerId, since);
    const today = usage.find(u => u.day === dayKey(clock()))?.ada || 0;
    const days = Math.max(1, Math.min(3, usage.length));
    const avg = usage.reduce((s, u) => s + u.ada, 0) / days;
    const avail = available(playerId);
    return {
      enabled: true, simulated, address: row.address, ada: row.ada, avax: row.avax, pending: row.pending,
      available: avail, minAvax: cfg.kasaMinAvax, avaxLow: !simulated && row.avax < cfg.kasaMinAvax,
      usageToday: today, usagePerDay: avg, daysLeft: avg > 0 ? avail / avg : null,
      balanceAt: row.bal_at, ops: q.opsOf.all(playerId), cap, capDays: cfg.kasaCapDays,
      overCap: row.ada - row.pending > cap * 1.05, hasWallet: !!(accounts && accounts.activeWallet(playerId))
    };
  }

  // ── Zincir işlemleri (sırayla; çift gönderim yok — imzala → kaydet → yay) ──
  // Aynı anda tek tur çalışır; çalışan bir tur varsa onun bitişi beklenir, sonra bekleyenler için bir tur daha
  let running = null, again = false;
  function processOps() {
    if (!enabled) return Promise.resolve();
    if (running) { again = true; return running; }
    running = runOps().finally(() => { running = null; if (again) { again = false; return processOps(); } });
    return running;
  }
  async function runOps() {
    {
      for (const op of q.opsOpen.all()) {
        const row = q.get.get(op.player);
        if (!row) { q.opDone.run('failed', 'Kasa yok', clock(), op.id); continue; }
        if (simulated) {
          if (op.kind === 'withdraw_avax') q.setBal.run(row.ada, Math.max(0, row.avax - op.amount), clock(), op.player);
          else q.setBal.run(Math.max(0, row.ada - op.amount), row.avax, clock(), op.player);
          if (op.kind === 'settle') q.settled.run(op.amount, clock(), op.player);
          q.opDone.run('sent', null, clock(), op.id);
          continue;
        }
        const signer = signerOf(row);
        try {
          if (op.kind === 'settle' && !row.approved) {
            await chain.sendTx(signer, { to: cfg.tokenAddress, data: ERC20.encodeFunctionData('approve', [cfg.paymentsContract, ethers.MaxUint256]) });
            q.approved.run(op.player);
          }
          let fields;
          if (op.kind === 'settle') {
            const gp = await chain.gasPrice();
            const maxFee = gp * 3n / 2n;
            fields = { to: cfg.paymentsContract, data: PAY.encodeFunctionData('pay', [ethers.parseUnits(op.amount.toFixed(6), 18), ethers.zeroPadValue(ethers.toBeHex(op.id), 32)]),
              value: maxFee * BigInt(cfg.payFeeGas), maxFeePerGas: maxFee, maxPriorityFeePerGas: gp / 10n };
          } else {
            const to = accounts ? accounts.activeWallet(op.player) : null;
            if (!to) { q.opDone.run('failed', 'Bağlı cüzdan yok', clock(), op.id); continue; }
            fields = op.kind === 'withdraw_ada' || op.kind === 'return_ada'
              ? { to: cfg.tokenAddress, data: ERC20.encodeFunctionData('transfer', [to, ethers.parseUnits(op.amount.toFixed(6), 18)]) }
              : { to, value: ethers.parseEther(op.amount.toFixed(9)) };
          }
          await chain.sendTx(signer, fields, s => q.opSigned.run(s.hash, s.raw, s.nonce, op.id));
          q.opDone.run('sent', null, clock(), op.id);
          // Zincirden yeniden okunana kadar kasa fazla görünmesin: tutarı hemen düş
          const r2 = q.get.get(op.player);
          if (op.kind === 'withdraw_avax') q.setBal.run(r2.ada, Math.max(0, r2.avax - op.amount), r2.bal_at, op.player);
          else q.setBal.run(Math.max(0, r2.ada - op.amount), r2.avax, r2.bal_at, op.player);
          if (op.kind === 'settle') { q.settled.run(op.amount, clock(), op.player); db.q.playerAddDeposit.run(op.amount, op.player); }
          await refresh(op.player).catch(() => {});
        } catch (err) {
          const msg = String(err.shortMessage || err.message).slice(0, 300);
          const cur = db.raw.prepare('SELECT tx_hash FROM kasa_ops WHERE id = ?').get(op.id);
          if (cur && cur.tx_hash && !err.reverted) q.opDone.run('sending', 'Onay bekleniyor: ' + msg, null, op.id);
          else if (op.kind === 'settle') { q.opDone.run('failed', msg, clock(), op.id); q.addPending.run(op.amount, op.player); }   // aktarılamadı: borç geri
          else q.opDone.run('failed', msg, clock(), op.id);
        }
      }
    }
  }

  // "Gönderiliyor" kalmış kasa işlemlerini zincirden sonuçlandır
  async function reconcileOps() {
    if (simulated || !chain) return;
    for (const op of q.opsSending.all()) {
      if (!op.tx_hash) continue;
      const row = q.get.get(op.player);
      const st = await chain.checkPayout({ hash: op.tx_hash, raw: op.raw_tx, nonce: op.tx_nonce, from: row.address }).catch(() => 'waiting');
      if (st === 'sent') {
        q.opDone.run('sent', null, clock(), op.id);
        if (op.kind === 'settle') { q.settled.run(op.amount, clock(), op.player); db.q.playerAddDeposit.run(op.amount, op.player); }
        await refresh(op.player).catch(() => {});
      } else if (st === 'failed') {
        q.opDone.run('failed', 'Zincirde işlenmedi', clock(), op.id);
        if (op.kind === 'settle') q.addPending.run(op.amount, op.player);
      }
    }
  }

  // Saatlik: biriken kasa harcamalarını oyuna aktar (en az KASA_MIN_SETTLE ASTRA ya da 24 saattir bekleyen)
  function queueSettlements() {
    if (!enabled) return 0;
    let n = 0;
    for (const row of q.toSettle.all(cfg.kasaMinSettle, clock() - 86400000)) {
      const amount = Math.floor(row.pending * 100) / 100;
      if (!(amount > 0)) continue;
      db.tx(() => { q.takePending.run(amount, clock(), row.player); q.opAdd.run(row.player, 'settle', amount, clock()); });
      n++;
    }
    return n;
  }

  // Aktif oyuncuların kasa bakiyelerini zincirden tazele (yatırmalar böyle görünür)
  async function refreshActive(limit = 25) {
    if (simulated || !chain || !enabled) return;
    for (const row of q.active.all(clock() - 86400000, limit)) await refresh(row.player).catch(() => {});
  }

  const isKasaAddress = addr => !!db.raw.prepare('SELECT 1 FROM kasa WHERE address = ?').get(String(addr || '').toLowerCase());

  return { capOf, enforceCaps, isKasaAddress, enabled, simulated, ensure, available, consume, refresh, simulateDeposit, withdraw, status, processOps, reconcileOps, queueSettlements, refreshActive };
}
