// Realm of AdAstra — Sponsorluk (docs/v2/SPONSORLUK_TASARIMI.md)
// ============================================================================
// B (sponsor), A'ya (hedef vatandaş) kendi serbest bakiyesinden ASTRA verir. A bu parayı çekemez (`sponsorAda`: bakiyenin içinde, serbest
// bakiyeden hariç), yalnız oyunda harcar (önce sponsorlu para gider). A her haftalık net çekiminin SHARE oranını sponsorlara öder
// (tüm sponsorlara toplam; anapara oranında bölünür), sözleşme DAYS gün ya da getiri anaparanın RETURN_CAP katına ulaşana dek sürer.
// ASTRA yoktan oluşmaz/yok olmaz: yalnız oyuncu bakiyeleri arasında taşınır. Sözleşmeler kv'de tutulur ('sponsor:defter').
// ============================================================================
import { izindeMiState } from './aktiflik.js';

const DAY = 86400000;
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const userError = msg => Object.assign(new Error(msg), { userError: true });
const label = a => (String(a).startsWith('acc:') ? 'Vatandaş #' + String(a).slice(4) : 'Vatandaş ' + String(a).slice(0, 6));

export function createSponsor({ db, engine, kapi = null, accounts = null, clock = () => Date.now(), log = console }) {
  const E = engine;
  const C = () => ({ MIN_AMOUNT: 1000, SHARE: 0.3, DAYS: 365, RETURN_CAP: 2, MAX_PER_TARGET: 5, MAX_PER_SPONSOR: 20, ...(E.GAME_CONFIG.SPONSORLUK || {}) });
  const ledger = () => db.kvJson('sponsor:defter', null) || { seq: 0, items: [] };
  const atomic = fn => { try { return db.tx(fn); } catch (err) { E.reloadWorld(); throw err; } };
  const walletOf = id => (accounts && String(id).startsWith('acc:') ? accounts.activeWallet(id) : null);
  const active = c => c.status === 'active';
  let cache = null;   // herkese açık tablo önbelleği (30 sn); sözleşme değişince hemen düşer
  const save = L => { db.kvSetJson('sponsor:defter', L); cache = null; };

  // Süresi dolanları kapatır (okuma yollarında ve hesaplaşmada çağrılır)
  function expireOld(L) {
    let changed = false;
    for (const c of L.items) if (active(c) && clock() >= c.expiresAt) { c.status = 'expired'; c.closedAt = clock(); changed = true; }
    if (changed) save(L);
    return L;
  }

  function targetProblem(target) {
    const st = E.readPlayer(target);
    if (!st) return 'Hedef oyuncu bulunamadı.';
    if (kapi && kapi.statusOf(target).status !== 'citizen') return 'Sponsorluk yalnız vatandaşlara yapılabilir (askıdaki ya da sıradaki oyunculara yapılamaz).';
    if (izindeMiState(st, clock())) return 'Hedef oyuncu şu an izinde; izindeki oyuncuya sponsor olunamaz.';
    return null;
  }

  // B → A: sponsorluk başlat
  function give(me, target, amount) {
    const c = C();
    const amt = r2(amount);
    if (!(amt >= c.MIN_AMOUNT)) throw userError(`En az ${c.MIN_AMOUNT} ASTRA sponsor olabilirsin.`);
    if (!target || typeof target !== 'string') throw userError('Hedef oyuncu seçilmedi.');
    if (target === me) throw userError('Kendine sponsor olamazsın.');
    const wa = walletOf(me), wb = walletOf(target);
    if (wa && wb && wa === wb) throw userError('Aynı cüzdana bağlı hesaplar birbirine sponsor olamaz.');
    const prob = targetProblem(target);
    if (prob) throw userError(prob);
    return atomic(() => {
      const L = expireOld(ledger());
      if (L.items.filter(x => active(x) && x.target === target).length >= c.MAX_PER_TARGET) throw userError(`Bu oyuncunun zaten en çok sponsoru (${c.MAX_PER_TARGET}) var.`);
      if (L.items.filter(x => active(x) && x.sponsor === me).length >= c.MAX_PER_SPONSOR) throw userError(`En çok ${c.MAX_PER_SPONSOR} açık sponsorluğun olabilir.`);
      E.withPlayer(me, gs => {
        const lk = gs.getLockedBalanceInfo();
        if (amt > lk.free + 1e-9) throw userError(`Sponsor olabileceğin serbest bakiyen ${r2(lk.free)} ASTRA (kilitli ve sponsorlu paralar verilemez).`);
        gs.state.adAstraBalance = r2((Number(gs.state.adAstraBalance) || 0) - amt);
        gs.state.lockedAda = Math.min(Number(gs.state.lockedAda) || 0, gs.state.adAstraBalance);
        gs.state.sponsorAda = Math.min(Math.max(0, Number(gs.state.sponsorAda) || 0), gs.state.adAstraBalance);
        gs.pushNotice(`🤝 ${label(target)} oyuncusuna ${amt} ASTRA ile sponsor oldun. Net çekimlerinin %${Math.round(c.SHARE * 100)}'i (toplam getirin anaparanın ${c.RETURN_CAP} katına ya da ${c.DAYS} güne dek) bakiyene eklenir.`, 'success');
        return null;
      });
      E.withPlayer(target, gs => {
        gs.state.adAstraBalance = r2((Number(gs.state.adAstraBalance) || 0) + amt);
        gs.state.sponsorAda = r2((Number(gs.state.sponsorAda) || 0) + amt);
        gs.pushNotice(`🤝 ${label(me)} sana ${amt} ASTRA ile sponsor oldu. Bu para çekilemez, yalnız oyunda harcanır (önce o harcanır). Haftalık net çekimlerinin %${Math.round(c.SHARE * 100)}'i sponsorlarına gider.`, 'success');
        return null;
      });
      const id = ++L.seq;
      L.items.push({ id, sponsor: me, target, principal: amt, returned: 0, cap: r2(amt * c.RETURN_CAP), createdAt: clock(), expiresAt: clock() + c.DAYS * DAY, status: 'active' });
      save(L);
      db.event('sponsor-give', me, { id, target, amount: amt });
      return { success: true, id, message: `🤝 ${label(target)} oyuncusuna ${amt} ASTRA ile sponsor oldun.` };
    });
  }

  // A'nın bu haftaki net çekiminden sponsor payı. Hesaplaşma içinde (atomik) çağrılır. { total, parts:[{ id, sponsor, amount }] }
  function settleShares(target, net) {
    const out = { total: 0, parts: [] };
    const amount = Number(net) || 0;
    if (!(amount > 0)) return out;
    const c = C();
    const L = expireOld(ledger());
    const cs = L.items.filter(x => active(x) && x.target === target);
    if (!cs.length) return out;
    const principal = cs.reduce((s, x) => s + x.principal, 0);
    const pool = amount * c.SHARE;
    for (const x of cs) {
      const part = Math.min(r2(pool * x.principal / principal), r2(x.cap - x.returned));
      if (!(part > 0)) continue;
      x.returned = r2(x.returned + part);
      if (x.returned >= x.cap - 1e-9) { x.status = 'done'; x.closedAt = clock(); }
      E.mutatePlayer(x.sponsor, gs => {
        gs.state.adAstraBalance = r2((Number(gs.state.adAstraBalance) || 0) + part);
        gs.pushNotice(`🤝 Sponsor payın: ${label(target)} çekim yaptı, +${part} ASTRA bakiyene eklendi (toplam getiri ${x.returned}/${x.cap}).`, 'success');
      });
      out.parts.push({ id: x.id, sponsor: x.sponsor, amount: part });
      out.total = r2(out.total + part);
    }
    save(L);
    if (out.total > 0) db.event('sponsor-share', target, { net: amount, total: out.total, parts: out.parts });
    return out;
  }

  // B vazgeçer: payı bırakır, anaparayı geri almaz (para A'nın oyun içi bakiyesine geçmiştir)
  function feragat(me, id) {
    return atomic(() => {
      const L = expireOld(ledger());
      const x = L.items.find(i => i.id === Number(id) && i.sponsor === me);
      if (!x || !active(x)) throw userError('Açık bir sponsorluğun bulunamadı.');
      x.status = 'feragat'; x.closedAt = clock();
      save(L);
      db.event('sponsor-feragat', me, { id: x.id, target: x.target });
      return { success: true, message: 'Sponsorluk payından vazgeçtin (anapara A\'nın oyun içi bakiyesinde kalır).' };
    });
  }

  // A: sponsorun getirisi anaparaya ulaştıysa sözleşmeyi kapatır ("borcumu ödedim")
  function kapat(me, id) {
    return atomic(() => {
      const L = expireOld(ledger());
      const x = L.items.find(i => i.id === Number(id) && i.target === me);
      if (!x || !active(x)) throw userError('Açık bir sponsorluk bulunamadı.');
      if (x.returned < x.principal - 1e-9) throw userError(`Sponsorun getirisi henüz anaparaya (${x.principal} ASTRA) ulaşmadı (${x.returned}).`);
      x.status = 'kapandi'; x.closedAt = clock();
      save(L);
      db.event('sponsor-kapat', me, { id: x.id, sponsor: x.sponsor });
      return { success: true, message: 'Sponsorluk sözleşmesi kapatıldı.' };
    });
  }

  const view = x => ({ id: x.id, sponsor: label(x.sponsor), target: label(x.target), principal: x.principal, returned: x.returned, cap: x.cap, expiresAt: x.expiresAt, status: x.status, createdAt: x.createdAt });

  // Benim sponsorluklarım (verdiğim ve aldığım)
  function mine(me) {
    const L = expireOld(ledger());
    const c = C();
    const st = E.readPlayer(me) || {};
    return {
      config: { minAmount: c.MIN_AMOUNT, share: c.SHARE, days: c.DAYS, returnCap: c.RETURN_CAP },
      sponsoredBalance: r2(st.sponsorAda || 0),
      given: L.items.filter(x => x.sponsor === me).slice(-50).map(view).reverse(),
      received: L.items.filter(x => x.target === me).slice(-50).map(view).reverse()
    };
  }

  // Herkese açık tablo: vatandaşların gelişimi (kimlik/cüzdan/e-posta yok). 30 sn önbellek.
  function table() {
    const now = clock();
    if (cache && now - cache.at < 30000) return cache.v;
    const L = expireOld(ledger());
    const cur = new Set(), rows = [];
    const addrs = kapi && kapi.citizenAddresses ? kapi.citizenAddresses() : [];
    const net4 = db.raw.prepare('SELECT data FROM withdraw_log WHERE address = ? ORDER BY epoch DESC LIMIT 4');
    for (const a of addrs) {
      const st = E.readPlayer(a);
      if (!st) continue;
      cur.add(a);
      const k = st.katilim || {};
      const act = L.items.filter(x => active(x) && x.target === a);
      const nets = net4.all(a).map(r => { try { return Number(JSON.parse(r.data).net) || 0; } catch { return 0; } });
      rows.push({
        id: a, ad: label(a), level: st.level || 1,
        izinde: izindeMiState(st, now),
        haftaKategori: Object.keys(k.touched || {}).filter(z => k.touched[z]).length,
        ortNetCekim4Hafta: r2(nets.length ? nets.reduce((s, v) => s + v, 0) / nets.length : 0),
        sponsorSayisi: act.length, sponsorluToplam: r2(act.reduce((s, x) => s + x.principal, 0))
      });
    }
    rows.sort((x, y) => y.level - x.level || y.ortNetCekim4Hafta - x.ortNetCekim4Hafta);
    const v = { at: now, rows: rows.slice(0, 200), config: { minAmount: C().MIN_AMOUNT, share: C().SHARE, days: C().DAYS, returnCap: C().RETURN_CAP } };
    cache = { at: now, v };
    return v;
  }
  function clearCache() { cache = null; }

  return { give, settleShares, feragat, kapat, mine, table, clearCache, ledger };
}
