// Realm of AdAstra — İlan pazarı (teçhizat, Anahtar, Pandora kutusu ve koleksiyon eseri), KARARLAR_KESIN.md bölüm D
// ============================================================================
// Oyuncular arası teçhizat satışı. Kurallar: komisyon %2 (yarısı yakılır, yarısı hazine kasalarına), ilan 7 gün
// (süresi dolan eşya sahibine döner), oyuncu başına en çok 10 açık ilan, alıcı önce SERBEST ASTRA'sından öder (yetmezse
// kalanı kilitliden), satıcıya gelen paranın en az %80'i kilitli gelir. Yalnız sunucuda çalışır (iki oyuncunun kaydına birden dokunur).
// Eşya ilan verilince oyuncunun kaydından çıkar (ilanda bekler); satılınca alıcının Cephanelik envanterine girer.
// ANAHTAR (18 Ekim 2026): takas havuzundan kalktı, oyuncular birbirine yalnız burada satar, TOPLU: adet + BİRİM fiyat. İlan kaydında item =
// { kind: 'key', qty: kalan adet }, price = birim fiyat. Alıcı istediği kadarını alır (kısmi alım: ilan kalan adetle açık kalır); komisyon ve
// kilitli pay kuralları teçhizatla aynıdır.
// PANDORA KUTUSU ve KOLEKSİYON ESERİ (19 Ekim 2026): anahtarla aynı toplu ilan: item = { kind: 'box', qty } ve { kind: 'artifact', id, qty }.
// Eser kuralı: bir eserin kopyası satılabilir; ama Genesis için uyandırılmış (ya da uyanmakta olan) eserin SON kopyası satılamaz.
// Alıcıya kopya eklenir ve eser onun için keşfedilmiş sayılır; satıcı son kopyayı satarsa eser onun koleksiyonundan düşer.
// Liste: tür / ad süzgeci ve fiyat sıralaması sunucuda yapılır (varsayılan en ucuzdan pahalıya; en ucuz ilan en üstte).
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
    setItem: db.raw.prepare('UPDATE listings SET item = ? WHERE id = ? AND status = \'active\''),
    history: db.raw.prepare("SELECT * FROM listings WHERE (seller = ? OR buyer = ?) AND status != 'active' ORDER BY closed_at DESC LIMIT 20")
  };

  // Hepsi ya da hiçbiri: hata olursa veritabanı geri alınır, bellekteki dünya kopyası da tazelenir
  const atomic = fn => { try { return db.tx(fn); } catch (err) { E.reloadWorld(); throw err; } };
  const YUVALAR = ['weapon', 'helmet', 'armor', 'legs', 'boots'];
  const userError = msg => Object.assign(new Error(msg), { userError: true });

  // Gerçek bir teçhizat mı: yuvası bilinen, adı olan nesne ({} ya da Object.prototype gibi şeyler eşya sayılmaz)
  const gecerliEsya = it => !!it && typeof it === 'object' && !Array.isArray(it) && YUVALAR.includes(it.slot) && typeof it.name === 'string' && it.name.length > 0;
  // Yuva anahtarı yalnız bilinen yuva adı ve nesnenin KENDİ alanı olabilir ("__proto__", "constructor" geçemez)
  const yuvadaki = (kap, slotKey) => (kap && typeof kap === 'object' && YUVALAR.includes(slotKey) && Object.hasOwn(kap, slotKey) ? kap[slotKey] : null);

  // Eşyayı oyuncunun kaydında bulur ve çıkarır (Demirhane geri dönüşümüyle aynı adresleme)
  function takeItem(gs, ref = {}) {
    const { source, slotKey, armoryIndex = null, soldierIndex = null } = ref;
    let item = null, remove = null;
    if (source === 'armory') {
      const list = Array.isArray(gs.state.armoryInventory) ? gs.state.armoryInventory : [];
      const i = Number(armoryIndex);
      item = Number.isInteger(i) && i >= 0 ? list[i] : null; remove = () => list.splice(i, 1);
    } else if (source === 'kingdom') {
      item = yuvadaki(gs.state.equipment, slotKey); remove = () => { gs.state.equipment[slotKey] = null; };
    } else if (source === 'soldier') {
      const s = (gs.state.soldierUnits || [])[Number(soldierIndex)];
      item = yuvadaki(s && s.equipment, slotKey); remove = () => { s.equipment[slotKey] = null; };
    }
    if (!gecerliEsya(item)) return null;
    remove();
    return item;
  }
  const giveItem = (gs, item) => { if (!Array.isArray(gs.state.armoryInventory)) gs.state.armoryInventory = []; gs.state.armoryInventory.push(item); };
  // Toplu (adetli) ilan türleri: anahtar, Pandora kutusu, koleksiyon eseri
  const TOPLU = ['key', 'box', 'artifact'];
  const anahtarMi = item => !!item && TOPLU.includes(item.kind);      // adı eski: "toplu ilan mı"
  const eserCfg = id => (E.GAME_CONFIG.COLLECTION_ARTIFACTS || []).find(c => c.id === id) || null;
  const eserAdet = a => (a && a.discovered ? Math.max(1, Math.floor(Number(a.count) || 0)) : 0);
  const eserKilitli = (gs, a) => !!(a && (a.uyandi || (gs.state.genesisUyandirma && gs.state.genesisUyandirma.id === a.id)));
  const satilabilirEser = (gs, a) => Math.max(0, eserAdet(a) - (eserKilitli(gs, a) ? 1 : 0));
  const summary = item => {
    if (item.kind === 'key') return { kind: 'key', name: 'Anahtar', icon: '🔑', qty: Number(item.qty) || 0 };
    if (item.kind === 'box') return { kind: 'box', name: 'Pandora Kutusu', icon: '📦', qty: Number(item.qty) || 0 };
    if (item.kind === 'artifact') { const c = eserCfg(item.id) || {}; return { kind: 'artifact', id: item.id, name: c.name || 'Eser', icon: c.icon || '🏺', rarity: c.rarity || 'common', qty: Number(item.qty) || 0 }; }
    return { id: item.id, name: item.name, icon: item.icon, slot: item.slot, level: item.level, atkBonus: item.atkBonus, hpBonus: item.hpBonus, durability: item.durability, maxDurability: item.maxDurability };
  };
  const row = (r, me) => ({ id: r.id, seller: r.seller, mine: r.seller === me, item: summary(JSON.parse(r.item)), price: r.price, createdAt: r.created_at, expires: r.expires, status: r.status, buyer: r.buyer || null, closedAt: r.closed_at || null });
  const adAnahtar = item => (anahtarMi(item) ? `${item.qty} ${summary(item).name}` : (item.name || 'Eşya'));
  // Eseri oyuncunun koleksiyonunda bulur (yoksa boş kayıt ekler)
  const eserKaydi = (gs, id) => {
    if (!Array.isArray(gs.state.collectionArtifacts)) gs.state.collectionArtifacts = [];
    let a = gs.state.collectionArtifacts.find(x => x.id === id);
    if (!a) { a = { id, discovered: false, discoveredAt: null }; gs.state.collectionArtifacts.push(a); }
    return a;
  };
  // İlandaki eşyayı (anahtar, kutu, eser kopyası) sahibine geri verir (geri çekme, süre dolumu, alıcıya teslim)
  const iadeEt = (gs, item) => {
    const n = Number(item.qty) || 0;
    if (item.kind === 'key') gs.state.arenaKeys = (Number(gs.state.arenaKeys) || 0) + n;
    else if (item.kind === 'box') gs.state.lockedBoxes = (Number(gs.state.lockedBoxes) || 0) + n;
    else if (item.kind === 'artifact') {
      const a = eserKaydi(gs, item.id);
      a.count = eserAdet(a) + n;
      a.discovered = true;
      if (!a.discoveredAt) a.discoveredAt = clock();
    } else giveItem(gs, item);
  };
  // Satıcının kaydından toplu ilan için adet düşer (yetmezse kullanıcı hatası)
  function topluAl(gs, kind, adet, eserId) {
    if (kind === 'key') {
      const elde = Math.floor(Number(gs.state.arenaKeys) || 0);
      if (elde < adet) throw userError(`Yetersiz anahtar: ${adet} istedin, ${elde} var.`);
      gs.state.arenaKeys = elde - adet;
    } else if (kind === 'box') {
      const elde = Math.floor(Number(gs.state.lockedBoxes) || 0);
      if (elde < adet) throw userError(`Yetersiz Pandora kutusu: ${adet} istedin, ${elde} var.`);
      gs.state.lockedBoxes = elde - adet;
    } else if (kind === 'artifact') {
      const c = eserCfg(eserId);
      if (!c) throw userError('Eser bulunamadı.');
      const a = (gs.state.collectionArtifacts || []).find(x => x.id === eserId);
      const elde = eserAdet(a), satilabilir = satilabilirEser(gs, a);
      if (satilabilir < adet) {
        throw userError(elde > satilabilir
          ? `${c.name}: uyandırdığın eserin son kopyası satılamaz (satılabilir ${satilabilir}, istenen ${adet}).`
          : `Yetersiz eser: ${adet} istedin, ${elde} kopyan var.`);
      }
      a.count = elde - adet;
      if (a.count <= 0) { a.count = 0; a.discovered = false; a.discoveredAt = null; }
    } else throw userError('Bu tür ilana konamaz.');
  }

  // İlan türü süzgeç anahtarı: 'key' | 'box' | 'artifact' | yuva adı (weapon, helmet, armor, legs, boots)
  const turOf = it => it.kind || it.slot || 'diger';
  const kucuk = s => String(s || '').toLocaleLowerCase('tr-TR');
  const SIRALAR = { ucuz: (a, b) => a.price - b.price || a.id - b.id, pahali: (a, b) => b.price - a.price || a.id - b.id, yeni: (a, b) => b.id - a.id, eski: (a, b) => a.id - b.id };
  // filtre: { tur, ara, sira, limit }. sayilar: süzgeçten bağımsız, başkalarının açık ilanları türe göre (düğme rozetleri için)
  function list(me, filtre = {}) {
    const now = clock();
    const hepsi = q.active.all().filter(r => r.expires > now).map(r => row(r, me));
    const sayilar = { hepsi: 0 };
    for (const r of hepsi) { if (r.mine) continue; sayilar.hepsi++; const t = turOf(r.item); sayilar[t] = (sayilar[t] || 0) + 1; }
    const tur = filtre.tur && filtre.tur !== 'hepsi' ? String(filtre.tur) : null;
    const ara = kucuk(filtre.ara).trim();
    const siraAd = Object.hasOwn(SIRALAR, filtre.sira) ? filtre.sira : 'ucuz';
    const limit = Math.min(200, Math.max(1, Math.floor(Number(filtre.limit)) || 100));
    const suzulen = hepsi.filter(r => (!tur || turOf(r.item) === tur) && (!ara || kucuk(r.item.name).includes(ara))).sort(SIRALAR[siraAd]);
    return { fee: P().FEE, days: P().DAYS, maxListings: P().MAX_LISTINGS, sellerLockedShare: P().SELLER_LOCKED_SHARE, now,
      listings: suzulen.slice(0, limit), toplam: suzulen.length, sayilar, filtre: { tur: tur || 'hepsi', ara, sira: siraAd },
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

  // Toplu ilan (anahtar, Pandora kutusu, koleksiyon eseri): adet + BİRİM fiyat. Oyuncunun kaydından düşer, ilanda bekler.
  function sellBulk(me, kind, qty, unitPrice, eserId = null) {
    const p = P();
    if (!TOPLU.includes(kind)) throw userError('Bu tür ilana konamaz.');
    const adet = Math.floor(Number(qty));
    const pr = round3(unitPrice);
    if (!Number.isFinite(adet) || adet < 1) throw userError('Satılacak adet en az 1 olmalı.');
    if (!(pr >= p.MIN_PRICE) || pr > p.MAX_PRICE) throw userError(`Birim fiyat ${p.MIN_PRICE} ile ${p.MAX_PRICE.toLocaleString('tr-TR')} ASTRA arasında olmalı.`);
    if (q.countMine.get(me).n >= p.MAX_LISTINGS) throw userError(`En çok ${p.MAX_LISTINGS} açık ilanın olabilir.`);
    return atomic(() => {
      const out = E.withPlayer(me, gs => { topluAl(gs, kind, adet, eserId); return { success: true }; });
      const now = clock();
      const item = kind === 'artifact' ? { kind, id: eserId, qty: adet } : { kind, qty: adet };
      const info = q.add.run(me, JSON.stringify(item), pr, now, now + p.DAYS * DAY);
      db.event('listing-new', me, { id: Number(info.lastInsertRowid), price: pr, item: kind, qty: adet, ...(eserId ? { eser: eserId } : {}) });
      const r = q.get.get(Number(info.lastInsertRowid));
      return { result: { success: true, message: `🏷️ ${adet} ${summary(item).name}, tanesi ${pr} ASTRA'ya ilana kondu (${p.DAYS} gün). Satılınca %${Math.round(p.FEE * 100)} komisyon düşer.`, listing: row(r, me) }, state: out.state };
    });
  }
  const sellKey = (me, qty, unitPrice) => sellBulk(me, 'key', qty, unitPrice);

  // İlanı geri çek: eşya (ya da kalan anahtarlar) sahibine döner
  function cancel(me, id) {
    const r = q.get.get(Number(id));
    if (!r || r.status !== 'active') throw userError('İlan bulunamadı ya da kapanmış.');
    if (r.seller !== me) throw userError('Bu ilan senin değil.');
    return atomic(() => {
      const item = JSON.parse(r.item);
      const out = E.withPlayer(me, gs => { iadeEt(gs, item); return { success: true }; });
      q.close.run('cancelled', null, clock(), r.id);
      db.event('listing-cancel', me, { id: r.id });
      return { result: { success: true, message: anahtarMi(item) ? `↩️ ${adAnahtar(item)} ilandan çekildi, sana döndü.` : `↩️ ${item.name || 'Eşya'} ilandan çekildi, Cephaneliğe döndü.` }, state: out.state };
    });
  }

  // Satın al: alıcı önce SERBEST bakiyesinden öder (serbest yetmezse kalanı kilitliden); satıcıya %98 gelir, en az %80'i kilitli.
  // %1 yakım, %1 kasalar. Kilit buradan açılmaz: alıcının kilitli payı satıcıda da kilitli kalır (yoksa iki hesap aralarında
  // al-sat yaparak kilitli ASTRA'yı serbest bırakırdı).
  // Anahtar ilanında qty alınacak adettir (verilmezse kalanın hepsi): bedel = birim fiyat × adet, kalan adetle ilan açık kalır
  function buy(me, id, qty = null) {
    const p = P();
    const r = q.get.get(Number(id));
    if (!r || r.status !== 'active' || r.expires <= clock()) throw userError('İlan bulunamadı, satılmış ya da süresi dolmuş.');
    if (r.seller === me) throw userError('Kendi ilanını satın alamazsın; geri çekebilirsin.');
    const ilanItem = JSON.parse(r.item);
    let alinan = null;                                                      // yalnız anahtar ilanında: bu alımda alınan adet
    if (anahtarMi(ilanItem)) {
      const kalan = Math.floor(Number(ilanItem.qty) || 0);
      alinan = qty == null || qty === '' ? kalan : Math.floor(Number(qty));
      if (!Number.isFinite(alinan) || alinan < 1) throw userError('Alınacak adet en az 1 olmalı.');
      if (alinan > kalan) throw userError(`İlanda yalnız ${kalan} adet kaldı.`);
    }
    const price = round3(alinan == null ? r.price : r.price * alinan), fee = round3(price * p.FEE), burn = round3(fee * p.FEE_BURN_SHARE), toTreasury = round3(fee - burn), proceeds = round3(price - fee);
    return atomic(() => {
      const item = anahtarMi(ilanItem) ? { ...ilanItem, qty: alinan } : ilanItem;
      let fromLocked = 0;                                                   // fiyatın kilitli bakiyeden ödenen kısmı
      const out = E.withPlayer(me, gs => {
        const bal = Number(gs.state.adAstraBalance) || 0;
        // Sponsorlu para oyuncudan oyuncuya geçemez (yoksa ortak ilanıyla "çekilebilir" paraya dönüşürdü): yalnız kendi bakiyesiyle ödenir
        const bilgi = gs.getLockedBalanceInfo();                            // total = kilitli + sponsorlu + serbest (ayrık)
        const own = bal - Math.min(Math.max(0, Number(gs.state.sponsorAda) || 0), bal);
        if (own < price) throw userError(`⚠️ Yetersiz ASTRA: ${price} gerekli, ${round3(own)} var${own < bal ? ' (sponsorlu para ilan pazarında kullanılamaz)' : ''}.`);
        fromLocked = round3(Math.max(0, price - Math.max(0, bilgi.free)));
        gs.state.lockedAda = round3(Math.max(0, bilgi.locked - fromLocked));
        gs.state.adAstraBalance = round3(bal - price);
        gs.state.lockedAda = Math.min(gs.state.lockedAda, gs.state.adAstraBalance);
        gs.state.sponsorAda = Math.min(Math.max(0, Number(gs.state.sponsorAda) || 0), gs.state.adAstraBalance);
        iadeEt(gs, item);
        // Katkı puanı yalnız gerçekten harcanan paya (komisyon: yakım + hazine) verilir; oyuncudan oyuncuya geçen bedel harcama sayılmaz
        // (yoksa iki hesap aralarında al-sat yaparak sahte katkı puanı üretirdi)
        if (typeof gs._addContribution === 'function') gs._addContribution(fee * (E.GAME_CONFIG.CONTRIBUTION?.ADA_SPEND_WEIGHT ?? 1), 'astra', 'Pazar ücreti');
        return { success: true };
      });
      // Satıcıda kilitli kalacak pay: en az SELLER_LOCKED_SHARE, ama alıcı kilitli bakiyesinden ödediyse o oran kadar
      const kilitliPay = Math.min(1, Math.max(p.SELLER_LOCKED_SHARE, price > 0 ? fromLocked / price : 0));
      const kilitliGelen = round3(proceeds * kilitliPay);
      E.mutatePlayer(r.seller, gs => {
        gs.state.adAstraBalance = round3((Number(gs.state.adAstraBalance) || 0) + proceeds);
        gs.state.lockedAda = Math.min(gs.state.adAstraBalance, round3((Number(gs.state.lockedAda) || 0) + kilitliGelen));
        gs.pushNotice(`💰 İlanın satıldı: ${adAnahtar(item)} → ${proceeds} ASTRA (komisyon ${fee}; ${kilitliGelen} ASTRA kilitli geldi).`, 'success');
      });
      if (burn > 0) { E.globalPool.state.totalBurned = (Number(E.globalPool.state.totalBurned) || 0) + burn; if (typeof E.globalPool.saveState === 'function') E.globalPool.saveState(); E.treasury.recordBurn(burn); }
      if (toTreasury > 0) E.treasury.deposit(toTreasury);
      const kalanAdet = anahtarMi(ilanItem) ? (Number(ilanItem.qty) || 0) - alinan : 0;
      if (kalanAdet > 0) q.setItem.run(JSON.stringify({ ...ilanItem, qty: kalanAdet }), r.id);   // kısmi alım: ilan kalan adetle açık
      else q.close.run('sold', me, clock(), r.id);
      db.event('listing-sold', r.seller, { id: r.id, buyer: me, price, fee, ...(alinan != null ? { qty: alinan } : {}) });
      return { result: { success: true, message: anahtarMi(item) ? `🛒 ${adAnahtar(item)} ${price} ASTRA'ya alındı.` : `🛒 ${item.name || 'Eşya'} ${price} ASTRA'ya alındı; Cephaneliğine kondu.`, price, fee }, state: out.state };
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
          E.mutatePlayer(r.seller, gs => { iadeEt(gs, item); gs.pushNotice(anahtarMi(item) ? `⌛ İlanın süresi doldu: ${adAnahtar(item)} sana döndü.` : `⌛ İlanın süresi doldu: ${item.name || 'Eşya'} Cephaneliğe döndü.`, 'info'); });
          q.close.run('expired', null, now, r.id);
          db.event('listing-expired', r.seller, { id: r.id });
        });
        n++;
      } catch (err) { log.warn && log.warn('İlan süresi:', err.message); }
    }
    return n;
  }

  return { list, sell, sellKey, sellBulk, cancel, buy, expire, takeItem };
}
