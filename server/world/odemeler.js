// Realm of AdAstra sunucusu — dünya: zincir ödeme kuyruğu (pending → sending → sent; "sending" tekrar gönderilmez)
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { ethers } from 'ethers';
import { DAY } from './yardimci.js';

export function olusturOdemeler(w) {
  const { db, E, chain, cfg, clock, econ, creatorWallet } = w;
  // ── Haftalık hesaplaşma ─────────────────────────────────────────────────
  // 1 ASTRA'nın altındaki tutarlar ve 2 ondalığın altındaki kırıntılar ESKİDEN sessizce düşüyordu (oyuncunun çekimi bakiyesinden
  // düşülmüş, yapımcı/yakım sayacı ilerlemiş, ama zincire hiçbir şey gitmemişti): 13 Ekim 2026 denetimi. Artık (tür, adres)
  // başına DEVREDİLİR: toplam 1 ASTRA'ya ulaşınca tek ödeme olarak kuyruğa girer, kırıntı bir sonrakine eklenir.
  const DEVIR = 'world:payout:devir';
  function queuePayout(epoch, kind, address, amount) {
    const a = Number(amount);
    if (!(a > 0) || !Number.isFinite(a)) return;
    const k = `${kind}|${String(address).toLowerCase()}`;
    const devir = db.kvJson(DEVIR, {});
    const toplam = Math.round(((Number(devir[k]) || 0) + a) * 1e6) / 1e6;
    const odenecek = Math.floor(toplam * 100 + 1e-7) / 100;
    if (!(odenecek >= 1)) { devir[k] = toplam; db.kvSetJson(DEVIR, devir); return; }
    const kalan = Math.round((toplam - odenecek) * 1e6) / 1e6;
    if (kalan > 0) devir[k] = kalan; else delete devir[k];
    db.kvSetJson(DEVIR, devir);
    db.q.payoutAdd.run(epoch, kind, address, odenecek, clock());
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
      if (chain.vaultEnabled) { await processVault(out); return out; }
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
          const hash = await chain.sendAda(p.address, p.amount, s => { db.q.payoutSigned.run(s.hash, s.raw, s.nonce, p.id); db.durable(); });
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


  // ── Kasa modu (VAULT_CONTRACT): çekim/yakım/yapımcı ödemeleri Oyun Kasası sözleşmesinden çıkar ──────────────────
  // Sözleşme tek ödemeyi kasanın %singleDrawBps'iyle, 24 saatlik toplamı %dailyLimitBps'iyle sınırlar ve durdurulabilir.
  // İmzadan ÖNCE canlı sınırlar okunur (yoksa estimateGas geri döner, satır sonsuza dek yeniden denenirdi); sığmayan satır
  // işlem anında parçalanır: gönderilen parça kendi satırı olur (imzala-kaydet-yayınla çift ödeme güvenliği parça başına),
  // artan kısım yeni "pending" satırı. Günlük bütçe üç çıkışa ortaktır; sıra: oyuncu çekimi, yakım, yapımcı.
  const KASA_SIRA = { withdraw: 0, burn: 1, creator: 2 };
  const KASA_ADIM = 10n ** 16n;                         // 0,01 ASTRA (ödeme satırları 2 ondalıklıdır)
  let kasaKontrol = { at: 0, sonuc: null };
  async function vaultKontrol() {
    if (kasaKontrol.sonuc && clock() - kasaKontrol.at < 60000) return kasaKontrol.sonuc;
    try { kasaKontrol = { at: clock(), sonuc: await chain.checkVault(creatorWallet()) }; }
    catch (err) { kasaKontrol = { at: clock(), sonuc: { ok: false, problems: ['kasa okunamadı: ' + String(err.message).slice(0, 120)] } }; }
    return kasaKontrol.sonuc;
  }
  const bekle = (id, mesaj) => db.q.payoutMark.run('pending', null, mesaj, null, id);

  async function processVault(out) {
    const kontrol = await vaultKontrol();
    if (!kontrol.ok) { out.skipped = 'vault: ' + kontrol.problems.join('; '); return; }
    const todo = db.q.payoutsPending.all().sort((a, b) => (KASA_SIRA[a.kind] ?? 9) - (KASA_SIRA[b.kind] ?? 9) || a.id - b.id);
    const since = Number(E.globalPool.state.epochStartTime) || clock() - 7 * DAY;
    let sentWithdraw = db.raw.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM payouts WHERE kind='withdraw' AND status IN ('sent','sending') AND sent_at >= ?").get(since).t;
    for (let guard = 0; todo.length && guard < 500; guard++) {
      if (econ().paused) break;
      const p = todo.shift();
      if (!(p.kind in KASA_SIRA)) { bekle(p.id, 'Kasa modunda bu ödeme türü yok: ' + p.kind); continue; }
      const v = await chain.readVault();
      if (v.paused) { bekle(p.id, 'Kasa durdurulmuş (acil fren); açılınca devam eder'); out.skipped = 'vault-paused'; break; }
      if (p.kind === 'creator' && String(p.address).toLowerCase() !== v.creator) { bekle(p.id, 'Yapımcı adresi kasadakiyle uyuşmuyor'); continue; }
      const wantWei = ethers.parseUnits(Number(p.amount).toFixed(6), 18);
      let chunkWei = [wantWei, v.capWei, v.remainingWei].reduce((m, x) => (x < m ? x : m));
      chunkWei = chunkWei / KASA_ADIM * KASA_ADIM;
      if (chunkWei <= 0n) { bekle(p.id, 'Kasanın günlük ödeme bütçesi dolu; 24 saat sonra devam eder'); out.skipped = 'vault-budget'; break; }
      const chunk = Number(ethers.formatUnits(chunkWei, 18));
      if (p.kind === 'withdraw' && sentWithdraw + chunk > cfg.weeklySendCapAda) { bekle(p.id, 'Haftalık güvenlik sınırı dolu; gelecek hafta ya da yönetici onayıyla'); continue; }
      let rest = null;
      if (chunkWei < wantWei) {
        const restWei = wantWei - chunkWei;
        if (restWei >= KASA_ADIM) {
          rest = db.tx(() => {
            db.raw.prepare('UPDATE payouts SET amount = ? WHERE id = ?').run(chunk, p.id);
            const id = Number(db.q.payoutAdd.run(p.epoch, p.kind, p.address, Number(ethers.formatUnits(restWei, 18)), p.created_at).lastInsertRowid);
            return db.q.payoutGet.get(id);
          });
          p.amount = chunk;
        } else {
          db.event('payout-dust', null, { id: p.id, kind: p.kind, dust: Number(ethers.formatUnits(restWei, 18)) });
          db.raw.prepare('UPDATE payouts SET amount = ? WHERE id = ?').run(chunk, p.id);
          p.amount = chunk;
        }
      }
      db.q.payoutMark.run('sending', null, null, clock(), p.id);
      if (p.kind === 'withdraw') sentWithdraw += chunk;
      try {
        const hash = await chain.sendVault(p.kind, p.address, chunk, p.id, s => { db.q.payoutSigned.run(s.hash, s.raw, s.nonce, p.id); db.durable(); });
        db.q.payoutMark.run('sent', hash, null, clock(), p.id);
        out.sent++;
        if (rest) todo.unshift(rest);
      } catch (err) {
        const msg = String(err.shortMessage || err.message).slice(0, 300);
        const row = db.q.payoutGet.get(p.id);
        if (row && row.tx_hash && !err.reverted) db.q.payoutSetStatus.run('sending', 'Onay bekleniyor: ' + msg, p.id);
        else { bekle(p.id, msg); if (p.kind === 'withdraw') sentWithdraw -= chunk; }
        out.failed++;
        break;                                     // bir gönderim başarısızsa bu tur biter; kalanlar sonraki turda (satırlar kayıtlı)
      }
    }
  }

  // "Gönderiliyor" kalmış ödemeleri zincirden sonuçlandır: işlendiyse 'sent', hiç işlenmeyecekse yeniden sıraya
  async function reconcilePayouts() {
    if (!chain || !chain.canSend) return { skipped: true };
    const out = { sent: 0, retry: 0, waiting: 0, unknown: 0 };
    for (const r of db.q.payoutsSending.all()) {
      if (!r.tx_hash) { out.unknown++; continue; }        // imza kaydı yok: yönetici kontrol eder
      // 'failed' kararı için zincirde ödeme olayı da aranır (W1): kasa modunda payPlayer/burn/payCreator olayı satır
      // numarasıyla (ref), düz modda gönderen → alıcı → miktar Transfer'i. Belirsizse satır "sending"de kalır.
      const expect = chain.vaultEnabled ? { vaultRef: { kind: r.kind, ref: r.id } }
        : chain.gameWallet ? { transfer: { from: chain.gameWallet, to: r.address, amount: r.amount } } : null;
      const st = await chain.checkPayout({ hash: r.tx_hash, raw: r.raw_tx, nonce: r.tx_nonce, since: r.sent_at || 0, expect }).catch(() => 'waiting');
      if (st === 'sent') { db.q.payoutMark.run('sent', r.tx_hash, null, clock(), r.id); out.sent++; }
      else if (st === 'failed') { db.q.payoutMark.run('pending', null, 'Önceki gönderim zincirde işlenmedi; yeniden denenecek', null, r.id); out.retry++; }
      else out.waiting++;
    }
    return out;
  }


  return { queuePayout, processPayouts, reconcilePayouts };
}
