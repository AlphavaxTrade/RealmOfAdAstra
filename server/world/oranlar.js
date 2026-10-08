// Realm of AdAstra sunucusu — dünya: ADA oranları (RealmRates sözleşmesi)
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { WEEKLY_RULES } from '../economy.js';
import { applyRates, ratesFromConfig, validateRates, toNamed, moneyFlows, RATE_KEYS, RATE_CHANGE_DELAY_SEC } from '../../js/economy/rates.js';

export function olusturOranlar(w) {
  const { db, E, chain, cfg, clock, log } = w;

  // ── ADA oranları (RealmRates sözleşmesi, kullanıcı kararı 6 Ekim 2026) ──
  // Sunucu açılışta en son okunan oranları uygular; 5 dakikada bir sözleşmeden okur. Sözleşme yoksa oyunun kendi
  // ayarları geçerlidir. Okunan oranlar geçersizse (olmamalı: sözleşme de denetler) uygulanmaz.
  const ratesDefault = ratesFromConfig(E.GAME_CONFIG, WEEKLY_RULES);
  const storedRates = () => db.kvJson('world:rates', null);
  { const st = storedRates(); if (st && Array.isArray(st.active)) applyRates(E.GAME_CONFIG, WEEKLY_RULES, st.active); }
  const currentRates = () => { const st = storedRates(); return st && Array.isArray(st.active) ? st.active : ratesFromConfig(E.GAME_CONFIG, WEEKLY_RULES); };

  async function syncRates() {
    if (!chain || !chain.readRates || !cfg.ratesContract) return null;
    const prev = storedRates() || {};
    let r;
    try { r = await chain.readRates(cfg.ratesContract); }
    catch (err) { db.kvSetJson('world:rates', { ...prev, error: err.message, errorAt: clock() }); throw err; }
    if (!r) return null;
    const bad = validateRates(r.active);
    if (bad) { log.warn('Oran sözleşmesi geçersiz oran döndürdü:', bad); db.kvSetJson('world:rates', { ...prev, error: bad, errorAt: clock() }); return null; }
    const changed = !Array.isArray(prev.active) || prev.active.join(',') !== r.active.join(',');
    applyRates(E.GAME_CONFIG, WEEKLY_RULES, r.active);
    const next = { contract: cfg.ratesContract.toLowerCase(), active: r.active, pending: r.pending, pendingAt: r.pendingAt, owner: r.owner, pendingOwner: r.pendingOwner, readAt: clock() };
    db.kvSetJson('world:rates', next);
    if (changed) db.event('rates-changed', null, { from: prev.active || ratesDefault, to: r.active });
    return next;
  }

  function ratesStatus() {
    const st = storedRates() || {};
    const active = currentRates();
    return {
      contract: cfg.ratesContract || null, chainId: cfg.chainId, source: cfg.ratesContract ? 'contract' : 'config',
      keys: RATE_KEYS, delaySec: RATE_CHANGE_DELAY_SEC,
      active, named: toNamed(active), flows: moneyFlows(active),
      pending: st.pending || null, pendingAt: st.pendingAt || 0, pendingFlows: st.pending ? moneyFlows(st.pending) : null,
      owner: st.owner || null, pendingOwner: st.pendingOwner && !/^0x0+$/.test(st.pendingOwner) ? st.pendingOwner : null,
      readAt: st.readAt || 0, error: st.error && (st.errorAt || 0) > (st.readAt || 0) ? st.error : null,
      pools: Object.fromEntries(Object.entries(E.treasury.state.pools || {}).map(([k, v]) => [k, Math.round(Number(v) || 0)])),
      ubi: { accruing: Math.round(Number(E.globalPool.state.ubiWeekAccrued) || 0), claimable: Math.round(Number(E.globalPool.state.ubiClaimPot) || 0) },
      totals: { spent: Math.round(Number(E.globalPool.state.totalSpent) || 0), burned: Math.round(Number(E.globalPool.state.totalBurned) || 0), creator: Math.round(Number(E.globalPool.state.creatorRoyaltyTotal) || 0) },
      burnedResources: E.globalPool.state.totalBurnedResources || {}, burnedItems: E.globalPool.state.totalBurnedItems || {}
    };
  }


  return { ratesDefault, storedRates, currentRates, syncRates, ratesStatus };
}
