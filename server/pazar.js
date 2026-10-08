// Realm of AdAstra — İlan pazarı (teçhizat), KARARLAR_KESIN.md bölüm D
// ============================================================================
// Oyuncular arası teçhizat satışı. Kurallar: komisyon %2 (yarısı yakılır, yarısı hazine kasalarına), ilan 7 gün
// (süresi dolan eşya sahibine döner), oyuncu başına en çok 10 açık ilan, alıcı önce KİLİTLİ ASTRA'sından öder,
// satıcıya gelen paranın %80'i kilitli gelir. Yalnız sunucuda çalışır (iki oyuncunun kaydına birden dokunur).
// Eşya ilan verilince oyuncunun kaydından çıkar (ilanda bekler); satılınca alıcının Cephanelik envanterine girer.
// ============================================================================
const round3 = x => Math.round((Number(x) || 0) * 1000) / 1000;
const DAY = 86400000;

export function createPazar({ db, engine, clock = () => Date.now(), log = console }) {
  const E = engine;
  const P = () => ({ FEE: 0.02, FEE_BURN_SHARE: 0.5, DAYS: 7, MAX_LISTINGS: 10, SELLER_LOCKED_SHARE: 0.8, MIN_PRICE: 0.01, MAX_PRICE: 1e9, ...(E.GAME_CONFIG.ILAN_PAZARI || {}) });
  const q = {
    add: db.raw.prepare('INSERT INTO listings (seller, item, price, created_at, expires) VALUES (?, ?, ?, ?, ?)'),
    get: db.raw.prepare('SELECT * FROM listings WHERE id = ?'),
    active: db.raw.prepare("SELECT * FROM listings WHERE status = 'active' ORDER BY id DESC LIMIT 200"),
    mine: db.raw.prepare("SELECT * FROM listings WHERE seller = ? AND status = 'active' ORDER BY id DESC"),
    countMine: db.raw.prepare("SELECT COUNT(*) AS n FROM listings WHERE seller = ? AND status = 'active'"),
    expired: db.raw.prepare("SELECT * FROM listings WHERE status = 'active' AND expires <= ?"),
    close: db.raw.prepare('UPDATE listings SET status = ?, buyer = ?, closed_at = ? WHERE id = ? AND status = \'active\''),
    history: db.raw.prepare("SELECT * FROM listings WHERE (seller = ? OR buyer = ?) AND status != 'active' ORDER BY closed_at DESC LIMIT 20")
  };

  // Hepsi ya da hiçbiri: hata olursa veritabanı geri alınır, bellekteki dünya kopyası da tazelenir
  const atomic = fn => { try { return db.tx(fn); } catch (err) { E.reloadWorld(); throw err; } };
  const userError = msg => Object.assign(new Error(msg), { userError: true });

  // Eşyayı oyuncunun kaydında bulur ve çıkarır (Demirhane geri dönüşümüyle aynı adresleme)
  function takeItem(gs, ref = {}) {
    const { source, slotKey, armoryIndex = null, soldierIndex = null } = ref;
    let item = null, remove = null;
    if (source === 'armory') {
      const list = Array.isArray(gs.state.armoryInventory) ? gs.state.armoryInventory : [];
      const i = Number(armoryIndex);
      item = Number.isInteger(i) ? list[i] : null; remove = () => list.splice(i, 1);
    } else if (source === 'kingdom') {
      item = gs.state.equipment ? gs.state.equipment[slotKey] : null; remove = () => { gs.state.equipment[slotKey] = null; };
    } else if (source === 'soldier') {
      const s = (gs.state.soldierUnits || [])[Number(soldierIndex)];
      item = s && s.equipment ? s.equipment[slotKey] : null; remove = () => { s.equipment[slotKey] = null; };
    }
    if (!item || typeof item !== 'object') return null;
    remove();
    return item;
  }
  const giveItem = (gs, item) => { if (!Array.isArray(gs.state.armoryInventory)) gs.state.armoryInventory = []; gs.state.armoryInventory.push(item); };
  const summary = item => ({ id: item.id, name: item.name, icon: item.icon, slot: item.slot, level: item.level, atkBonus: item.atkBonus, hpBonus: item.hpBonus, durability: item.durability, maxDurability: item.maxDurability });
  const row = (r, me) => ({ id: r.id, seller: r.seller, mine: r.seller === me, item: summary(JSON.parse(r.item)), price: r.price, createdAt: r.created_at, expires: r.expires, status: r.status, buyer: r.buyer || null, closedAt: r.closed_at || null });

  function list(me) {
    const now = clock();
    return { fee: P().FEE, days: P().DAYS, maxListings: P().MAX_LISTINGS, sellerLockedShare: P().SELLER_LOCKED_SHARE, now,
      listings: q.active.all().filter(r => r.expires > now).map(r => row(r, me)),
      mine: q.mine.all(me).map(r => row(r, me)),
      history: q.history.all(me, me).map(r => row(r, me)) };
  }

  // İlan ver: eşya kayıttan çıkar, ilanda bekler
  function sell(me, ref, price) {
    const p = P();
    const pr = round3(price);
    if (!(pr >= p.MIN_PRICE) || pr > p.MAX_PRICE) throw userError(`Fiyat ${p.MIN_PRICE} ile ${p.MAX_PRICE.toLocaleString('tr-TR')} ASTRA arasında olmalı.`);
    if (q.countMine.get(me).n >= p.MAX_LISTINGS) throw userError(`En çok ${p.MAX_LISTINGS} açık ilanın olabilir.`);
    return atomic(() => {
      let item = null;
      const out = E.withPlayer(me, gs => { item = takeItem(gs, ref || {}); if (!item) throw userError('Satılacak eşya bulunamadı.'); return { success: true }; });
      const now = clock();
      const info = q.add.run(me, JSON.stringify(item), pr, now, now + p.DAYS * DAY);
      db.event('listing-new', me, { id: Number(info.lastInsertRowid), price: pr, item: item.name });
      const r = q.get.get(Number(info.lastInsertRowid));
      return { result: { success: true, message: `🏷️ ${item.name || 'Eşya'} ${pr} ASTRA'ya ilana kondu (${p.DAYS} gün). Satılınca %${Math.round(p.FEE * 100)} komisyon düşer.`, listing: row(r, me) }, state: out.state };
    });
  }

  // İlanı geri çek: eşya sahibine döner
  function cancel(me, id) {
    const r = q.get.get(Number(id));
    if (!r || r.status !== 'active') throw userError('İlan bulunamadı ya da kapanmış.');
    if (r.seller !== me) throw userError('Bu ilan senin değil.');
    return atomic(() => {
      const item = JSON.parse(r.item);
      const out = E.withPlayer(me, gs => { giveItem(gs, item); return { success: true }; });
      q.close.run('cancelled', null, clock(), r.id);
      db.event('listing-cancel', me, { id: r.id });
      return { result: { success: true, message: `↩️ ${item.name || 'Eşya'} ilandan çekildi, Cephaneliğe döndü.` }, state: out.state };
    });
  }

  // Satın al: alıcı önce kilitli ASTRA'sından öder; satıcıya %98 (bunun %80'i kilitli); %1 yakım, %1 kasalar
  function buy(me, id) {
    const p = P();
    const r = q.get.get(Number(id));
    if (!r || r.status !== 'active' || r.expires <= clock()) throw userError('İlan bulunamadı, satılmış ya da süresi dolmuş.');
    if (r.seller === me) throw userError('Kendi ilanını satın alamazsın; geri çekebilirsin.');
    const price = round3(r.price), fee = round3(price * p.FEE), burn = round3(fee * p.FEE_BURN_SHARE), toTreasury = round3(fee - burn), proceeds = round3(price - fee);
    return atomic(() => {
      const item = JSON.parse(r.item);
      const out = E.withPlayer(me, gs => {
        const bal = Number(gs.state.adAstraBalance) || 0;
        // Sponsorlu para oyuncudan oyuncuya geçemez (yoksa ortak ilanıyla "çekilebilir" paraya dönüşürdü): yalnız kendi bakiyesiyle ödenir
        const own = bal - Math.min(Math.max(0, Number(gs.state.sponsorAda) || 0), bal);
        if (own < price) throw userError(`⚠️ Yetersiz ASTRA: ${price} gerekli, ${round3(own)} var${own < bal ? ' (sponsorlu para ilan pazarında kullanılamaz)' : ''}.`);
        const locked = Math.max(0, Number(gs.state.lockedAda) || 0);
        gs.state.lockedAda = round3(Math.max(0, locked - price));          // önce kilitliden
        gs.state.adAstraBalance = round3(bal - price);
        gs.state.lockedAda = Math.min(gs.state.lockedAda, gs.state.adAstraBalance);
        gs.state.sponsorAda = Math.min(Math.max(0, Number(gs.state.sponsorAda) || 0), gs.state.adAstraBalance);
        giveItem(gs, item);
        if (typeof gs._addContribution === 'function') gs._addContribution(price * (E.GAME_CONFIG.CONTRIBUTION?.ADA_SPEND_WEIGHT ?? 1));
        return { success: true };
      });
      E.mutatePlayer(r.seller, gs => {
        gs.state.adAstraBalance = round3((Number(gs.state.adAstraBalance) || 0) + proceeds);
        gs.state.lockedAda = Math.min(gs.state.adAstraBalance, round3((Number(gs.state.lockedAda) || 0) + proceeds * p.SELLER_LOCKED_SHARE));
        gs.pushNotice(`💰 İlanın satıldı: ${item.name || 'Eşya'} → ${proceeds} ASTRA (komisyon ${fee}; ${round3(proceeds * p.SELLER_LOCKED_SHARE)} ASTRA kilitli geldi).`, 'success');
      });
      if (burn > 0) { E.globalPool.state.totalBurned = (Number(E.globalPool.state.totalBurned) || 0) + burn; if (typeof E.globalPool.saveState === 'function') E.globalPool.saveState(); E.treasury.recordBurn(burn); }
      if (toTreasury > 0) E.treasury.deposit(toTreasury);
      q.close.run('sold', me, clock(), r.id);
      db.event('listing-sold', r.seller, { id: r.id, buyer: me, price, fee });
      return { result: { success: true, message: `🛒 ${item.name || 'Eşya'} ${price} ASTRA'ya alındı; Cephaneliğine kondu.`, price, fee }, state: out.state };
    });
  }

  // Süresi dolan ilanlar: eşya sahibine döner (dünya zamanlayıcısı saatte bir)
  function expire() {
    const now = clock();
    const rows = q.expired.all(now);
    let n = 0;
    for (const r of rows) {
      try {
        atomic(() => {
          const item = JSON.parse(r.item);
          E.mutatePlayer(r.seller, gs => { giveItem(gs, item); gs.pushNotice(`⌛ İlanın süresi doldu: ${item.name || 'Eşya'} Cephaneliğe döndü.`, 'info'); });
          q.close.run('expired', null, now, r.id);
          db.event('listing-expired', r.seller, { id: r.id });
        });
        n++;
      } catch (err) { log.warn && log.warn('İlan süresi:', err.message); }
    }
    return n;
  }

  return { list, sell, cancel, buy, expire, takeItem };
}
