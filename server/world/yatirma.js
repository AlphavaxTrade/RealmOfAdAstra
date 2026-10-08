// Realm of AdAstra sunucusu — dünya: zincirden yatırma tarama ve bakiyeye yazma
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { fmt } from './yardimci.js';

export function olusturYatirma(w) {
  const { db, E, chain, accounts, cfg, clock, atomic } = w;
  // ── Yatırma ─────────────────────────────────────────────────────────────
  async function scanDeposits() {
    if (!chain || !chain.gameWallet || !cfg.legacyDeposits) return 0;
    const latest = (await chain.latestBlock()) - 2;                      // 2 blok onay
    let from = Number(db.kvGet('chain:depositBlock')) || 0;
    if (!from) from = cfg.depositStartBlock > 0 ? cfg.depositStartBlock : latest;
    if (from > latest) return 0;
    const to = Math.min(latest, from + 20000);
    const logs = await chain.scanDeposits(from, to);
    for (const l of logs) {
      if (l.from === chain.gameWallet) continue;
      db.q.depositAdd.run(l.txHash, l.logIndex, l.from, l.amount, l.block);
    }
    db.kvSet('chain:depositBlock', to + 1);
    return creditDeposits();
  }

  // Ödeme adresi: hesaplı oyuncuda bağlı cüzdan, eski (cüzdanla giriş) kayıtlarda kimliğin kendisi
  const walletOf = id => (accounts && String(id).startsWith('acc:') ? accounts.activeWallet(id) : id);
  const playerOfWallet = addr => (accounts ? accounts.playerOfWallet(addr) : (db.q.playerGet.get(addr) ? addr : null));

  // Bağlı cüzdandan gelen yatırmaları o hesabın bakiyesine işler (serbest bakiye; kilit yok)
  function creditDeposits(address = null) {
    const rows = address ? db.q.depositsUncredited.all(address) : db.q.depositsUncreditedAll.all();
    let n = 0;
    for (const d of rows) {
      const pid = playerOfWallet(d.address);
      if (!pid) continue;
      atomic(() => {
        E.mutatePlayer(pid, gs => {
          gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + d.amount;
          gs.state.depositedAda = (Number(gs.state.depositedAda) || 0) + d.amount;
          gs.pushNotice(`💰 Yatırman geldi: +${fmt(d.amount)} ADA (serbest bakiye)`, 'success');
        });
        db.q.depositCredit.run(clock(), d.tx_hash, d.log_index);
        db.q.playerAddDeposit.run(d.amount, pid);
      });
      db.event('deposit', pid, { amount: d.amount, tx: d.tx_hash });
      n++;
    }
    return n;
  }


  return { scanDeposits, walletOf, playerOfWallet, creditDeposits };
}
