// Realm of AdAstra sunucusu — dünya: sıcak/soğuk cüzdan denetimi
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { fmt, DAY } from './yardimci.js';

export function olusturSicakCuzdan(w) {
  const { db, E, chain, mailer, cfg, clock, log, econ, setEcon, snapshotMarket, queuePayout, creatorWallet } = w;
  // ── Sıcak / soğuk cüzdan (kullanıcı kararı 4 Ekim 2026) ─────────────────
  // Oyun cüzdanında (anahtarı sunucuda = "sıcak") yalnız bir haftalık ihtiyaç kadar ASTRA durur. İhtiyaç: son 4 haftanın
  // en yüksek haftalık gönderimi, bu haftaki bekleyen çekim talepleri ve HOT_WALLET_MIN_ADA'nın büyüğü; üstüne sırada
  // bekleyen ödemeler. Cüzdan bunun 1,5 katını aşarsa fazlası yedek cüzdana (RESERVE_WALLET, donanım cüzdanı) gider.
  // Azalırsa yönetici panelinde ve e-postayla "yedek cüzdandan şu kadar gönder" uyarısı çıkar.
  const okAddr = a => /^0x[0-9a-fA-F]{40}$/.test(String(a || ''));
  function hotWalletNeed() {
    const ep = Number(E.globalPool.state.epochId) || 1;
    const hist = db.raw.prepare("SELECT epoch, SUM(amount) AS t FROM payouts WHERE kind != 'reserve' AND epoch >= ? GROUP BY epoch").all(ep - 4);
    const histMax = hist.reduce((m, h) => Math.max(m, Number(h.t) || 0), 0);
    const requests = db.q.playersAll.all().reduce((s, p) => s + (Number(p.pending_withdraw) || 0), 0);
    const queued = db.raw.prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM payouts WHERE kind != 'reserve' AND status IN ('pending', 'sending')").get().t;
    const weekly = Math.max(histMax, requests, Number(cfg.hotWalletMinAda) || 0);
    return { weekly, queued, need: weekly * (Number(cfg.hotWalletWeeks) || 1) + queued };
  }
  // Kasa modunda (VAULT_CONTRACT) oyun cüzdanı para tutmaz: yedek cüzdana aktarım YOK (kasanın böyle bir çıkışı bilerek yok).
  // Günlük denetim: kasa bu sunucuya uygun mu, durmuş mu, dağıtıcı anahtarın işlem ücreti için AVAX'ı yetiyor mu.
  async function checkVaultWallet() {
    const st = { at: clock(), vault: true, swept: 0, low: false, weekly: 0, queued: 0, need: 0 };
    const sorunlar = [];
    try {
      const k = await chain.checkVault(creatorWallet());
      sorunlar.push(...k.problems);
      Object.assign(st, { walletAda: k.vault.balance, vaultAddress: k.vault.address, vaultPaused: k.vault.paused, vaultOk: k.ok });
      if (k.vault.paused) sorunlar.push('kasa durdurulmuş (acil fren açık)');
    } catch (err) { sorunlar.push('kasa okunamadı: ' + String(err.message).slice(0, 120)); st.vaultOk = false; }
    try {
      const b = await chain.balances(chain.gameWallet);
      st.gameAvax = b.avax;
      if (b.avax < 0.05) sorunlar.push(`dağıtıcı anahtarın AVAX'ı az (${b.avax.toFixed(4)}); ödemelerin işlem ücreti karşılanamayabilir`);   // 0,05 AVAX ≈ yüzlerce ödeme
    } catch (err) { log.warn('Dağıtıcı AVAX bakiyesi:', err.message); }
    st.problems = sorunlar;
    const prev = econ().hotWallet || {};
    st.alertAt = prev.alertAt || 0;
    if (sorunlar.length && clock() - st.alertAt > DAY) {
      st.alertAt = clock();
      db.event('vault-problem', null, { sorunlar });
      if (mailer && cfg.adminEmail) {
        await mailer.send({ to: cfg.adminEmail, subject: 'Realm of AdAstra — Oyun Kasası uyarısı', text: `Oyun Kasası denetiminde sorun var:

- ${sorunlar.join('\n- ')}

Kasa: ${chain.vaultAddress}` })
          .catch(err => log.warn('Uyarı e-postası:', err.message));
      }
    }
    setEcon({ hotWallet: st });
    return st;
  }
  async function checkHotWallet() {
    if (!chain || !chain.gameWallet) return null;
    if (chain.vaultEnabled) return checkVaultWallet();
    const m = (await snapshotMarket().catch(() => null)) || econ().market;
    if (!m || m.walletAda == null) return null;
    const n = hotWalletNeed();
    const reserve = okAddr(cfg.reserveWallet) ? cfg.reserveWallet.toLowerCase() : null;
    const st = { at: clock(), walletAda: m.walletAda, ...n, reserve, low: m.walletAda + 1e-9 < n.need, swept: 0 };
    const open = db.raw.prepare("SELECT 1 FROM payouts WHERE kind = 'reserve' AND status IN ('pending', 'sending') LIMIT 1").get();
    if (reserve && chain.canSend && cfg.payoutMode === 'auto' && !econ().paused && !open && m.walletAda > Math.max(1, n.need * 1.5)) {
      const amount = Math.floor(m.walletAda - n.need);
      queuePayout(Number(E.globalPool.state.epochId) || 0, 'reserve', reserve, amount);
      st.swept = amount;
      db.event('reserve-sweep', null, { amount, need: n.need, walletAda: m.walletAda, to: reserve });
    }
    const prev = econ().hotWallet || {};
    st.alertAt = prev.alertAt || 0;
    if (st.low && clock() - st.alertAt > DAY) {
      st.alertAt = clock();
      const gap = Math.ceil(n.need - m.walletAda);
      db.event('hot-wallet-low', null, { walletAda: m.walletAda, need: n.need, gap });
      if (mailer && cfg.adminEmail) {
        await mailer.send({ to: cfg.adminEmail, subject: 'Realm of AdAstra — oyun cüzdanı azaldı',
          text: `Oyun cüzdanında ${fmt(m.walletAda)} ASTRA var; bu haftanın ihtiyacı ${fmt(n.need)} ASTRA.

Yedek cüzdanından (Ledger) oyun cüzdanına en az ${fmt(gap)} ASTRA gönder:
${chain.gameWallet}

Yönetici panelindeki "Yedek cüzdandan oyun cüzdanına gönder" düğmesini de kullanabilirsin.` }).catch(err => log.warn('Uyarı e-postası:', err.message));
      }
    }
    if (chain.readPaymentsAdmin) {
      try {
        const pa = await chain.readPaymentsAdmin();
        if (pa) {
          const hot = [chain.gameWallet].filter(Boolean).map(a => a.toLowerCase());
          st.contract = { ...pa, expectedOwner: okAddr(cfg.contractOwner) ? cfg.contractOwner.toLowerCase() : null,
            ownerIsHot: hot.includes(pa.owner),
            ownerOk: okAddr(cfg.contractOwner) ? pa.owner === cfg.contractOwner.toLowerCase() : !hot.includes(pa.owner) };
        }
      } catch (err) { log.warn('Sözleşme bilgisi:', err.message); }
    }
    setEcon({ hotWallet: st });
    return st;
  }


  return { okAddr, hotWalletNeed, checkHotWallet };
}
