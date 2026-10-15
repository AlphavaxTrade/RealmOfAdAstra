// Realm of AdAstra sunucusu — dünya: haftalık hesaplaşma (Pazartesi 00:01 TSİ)
// (kurumsal A3.10: server/world.js'ten AYNEN taşındı; davranış değişmedi. Bağımlılıklar createWorld'den `w` ile gelir.)
import { allocateWithdrawals, faucetWeekly, nextMultiplier, runwayPoolTotal, lotteryTicketPrice, odemeKadrani, oyunIciEndeks, etkinCarpan, WEEKLY_RULES } from '../economy.js';
import { runDraw } from '../../js/economy/lottery.js';
import { rastgele } from '../rastgele.js';
import { qualifies, nextStreak, weightOf, distribute, capFraction, FAUCET_DEFAULTS } from '../../js/economy/faucet.js';
import { fmt, DAY } from './yardimci.js';
import { izindeMiState } from '../aktiflik.js';
import { genesisAcikMuhur } from '../../js/economy/genesis.js';

export function olusturHaftalik(w) {
  const { db, E, arena, accounts, kapi, cfg, clock, log, econ, setEcon, creatorWallet, atomic, snapshotMarket, currentCap, akisSerileri, sponsor, weekScore, walletOf, queuePayout, processPayouts, refreshUretim } = w;

  // ÖDEME KADRANI (15 Ekim 2026): son 7 günün ortalama fiyatı ÷ son 91 günün; ödeme yapan kasaların sağlığı düşükse tavanlı
  function kadranHesapla(now, onceki) {
    const R = WEEKLY_RULES;
    const fiyatlar = db.q.pricesSince.all(now - R.kadranLongDays * DAY).map(r => ({ at: r.at, p: Number(r.price_usd) || 0 })).filter(x => x.p > 0);
    const ort = liste => (liste.length ? liste.reduce((s, x) => s + x.p, 0) / liste.length : 0);
    const T = E.treasury;
    const kimlikler = Object.keys((E.GAME_CONFIG.TREASURY_WEEKLY_BUDGET || {}).RATES || {});
    const hedef = kimlikler.reduce((s, id) => s + (Number(E.GAME_CONFIG.TREASURY_TARGET_RESERVE[id]) || 0), 0);
    const bakiye = kimlikler.reduce((s, id) => s + (Number(T.state.pools[id]) || 0), 0);
    return odemeKadrani({
      kisaOrt: ort(fiyatlar.filter(x => x.at >= now - R.kadranShortDays * DAY)),
      uzunOrt: ort(fiyatlar),
      veriGun: fiyatlar.length ? (now - fiyatlar[0].at) / DAY : 0,
      onceki,
      kasaSagligi: hedef > 0 ? bakiye / hedef : 1
    });
  }
  function settleWeek(closedEpoch, market) {
    const now = clock();
    const e = econ();
    const brake = !!(e.brake && e.brake.on);
    const players = db.q.playersAll.all();
    const T = E.treasury;
    const summary = { epoch: closedEpoch, at: now, players: players.length, brake };

    T.bypassBudget = true;   // hesaplaşma ödemeleri (ücretsiz havuz, PvP) KARAR 7 haftalık bütçesine girmez
    try { return atomic(() => {
      // 1) Çekim
      const rows = [];
      const states = new Map();
      for (const p of players) {
        const st = E.readPlayer(p.address);
        if (!st) continue;
        states.set(p.address, st);
        const score = weekScore(st, closedEpoch);
        let requested = Number(st.pendingWithdrawAda) || 0;
        if (requested > 0 && !walletOf(p.address)) {
          // Ödeme gidecek cüzdan yok: talep bakiyeye iade edilir
          E.mutatePlayer(p.address, gs => {
            gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + requested;
            gs.state.pendingWithdrawAda = 0;
            gs.pushNotice('🏦 Çekim talebin bakiyene iade edildi: hesabına bağlı bir cüzdan yok.', 'info');
          });
          db.q.playerSetPending.run(0, p.address);
          requested = 0;
        }
        if (score > 0 || requested > 0) rows.push({ id: p.address, requested, score });
      }
      // AKIŞ DENGESİ (15 Ekim 2026): yapımcı payı da ekosistemden çıkan ASTRA'dır; zarfın içinden önce o ödenir, kalan oyunculara.
      // Zarfa sığmayan yapımcı payı devreder (sonraki haftaların zarfından ödenir).
      const gp = E.globalPool;
      const settled = e.settled || { burned: 0, creator: 0 };
      const creatorDue = Math.max(0, (Number(gp.state.creatorRoyaltyTotal) || 0) - (Number(settled.creator) || 0));
      const zarf = currentCap(market);
      const creatorPay = Math.min(creatorDue, zarf);
      const cap = Math.max(0, zarf - creatorPay);
      const alloc = allocateWithdrawals(rows, cap, { brake });
      let sponsorTotal = 0;
      for (const r of alloc.rows) {
        if (!(r.requested > 0)) continue;
        // Sponsor payı: net çekimin SHARE'i sponsorların oyun bakiyesine gider (atomik), kalanı oyuncunun cüzdanına
        const sp = sponsor && r.net > 0 ? sponsor.settleShares(r.id, r.net) : { total: 0, parts: [] };
        sponsorTotal += sp.total;
        const toWallet = r.net - sp.total;
        E.mutatePlayer(r.id, gs => {
          gs.state.pendingWithdrawAda = 0;
          if (r.returned > 0) gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + r.returned;
          gs.state.withdrawnAda = (Number(gs.state.withdrawnAda) || 0) + r.total;
          if (gs.genesisCekimYaz) gs.genesisCekimYaz(toWallet, market && market.priceUsd);   // Genesis katkı defteri: ekosistemden çıkan (dolar)
          gs.pushNotice(`🏦 Haftalık çekim: ${fmt(toWallet)} ASTRA cüzdanına gönderiliyor (ücret ${fmt(r.fee)}, hak kirası ${fmt(r.rent)}${sp.total > 0 ? `, sponsor payı ${fmt(sp.total)}` : ''}).` +
            (r.returned > 0 ? ` ${fmt(r.returned)} ASTRA bu haftaki havuza sığmadı, bakiyene döndü.` : ''), 'success');
        });
        db.q.playerSetPending.run(0, r.id);
        if (r.total > 0) db.q.playerAddWithdrawn.run(r.total, r.id);
        // Ödeme hesabın ETKİN cüzdanına (48 saati dolmamış değişiklik etkin değildir)
        queuePayout(closedEpoch, 'withdraw', walletOf(r.id), toWallet);
        db.q.withdrawLogSet.run(closedEpoch, r.id, JSON.stringify(r));
      }
      for (const rp of alloc.rentPayouts) {
        E.mutatePlayer(rp.id, gs => {
          gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + rp.amount;
          gs.pushNotice(`🤝 Kullanmadığın çekim hakkın başkasına kiralandı: +${fmt(rp.amount)} ASTRA hak kirası.`, 'success');
        });
      }
      gp.state.ubiWeekAccrued = (Number(gp.state.ubiWeekAccrued) || 0) + alloc.totals.feeToUbi;
      gp.state.ubiPool = (Number(gp.state.ubiClaimPot) || 0) + gp.state.ubiWeekAccrued;
      let burn = alloc.totals.feeBurn;
      const akis = akisSerileri();
      summary.withdraw = { zarf, cap, creatorPay, k: Number(econ().k) || 1, tradeAlimi: akis.tradeAlimi, netAlim: akis.netAlim, ...alloc.totals };
      summary.withdraw.sponsorShare = sponsorTotal;
      summary.withdraw.sent -= sponsorTotal;   // zincire giden = net − sponsor payı (pay oyun içinde kalır)

      // 2) Fiyat savunma yakımı (fren açıkken)
      let defense = 0;
      if (brake) {
        for (const k of Object.keys(T.state.pools)) {
          const v = (Number(T.state.pools[k]) || 0) * WEEKLY_RULES.defenseBurnWeekly;
          T.state.pools[k] -= v;
          defense += v;
        }
        T.state.lifetimeBurned = (Number(T.state.lifetimeBurned) || 0) + defense;
        burn += defense;
      }
      summary.defenseBurn = defense;

      // 3) Ücretsiz oyuncu havuzu: hiç yatırma yapmamış ve bu hafta oynamış oyuncular
      // Ücretsiz oyuncu: hiç para koymamış, bu hafta oynamış, (hesaplı oyuncuda) e-postasını doğrulamış, en az 3. seviye ve
      // o hafta yeterli katkı puanı toplamış. Pay eşit değil: katkı^1,5 × sadakat serisi (sahte hesaplara karşı;
      // ayrıntı js/economy/faucet.js). Pay tamamen kilitli gelir.
      const FP = { ...FAUCET_DEFAULTS, ...(E.GAME_CONFIG.FREE_PLAYER_POOL || {}) };
      const mult = etkinCarpan(e);   // katkı eşikleri bedel çarpanıyla ölçeklenir (oyuncu tarafındaki adaPrice gibi)
      const free = [];
      for (const p of players) {
        if (p.deposited_ada > 0 || p.last_seen < now - 7 * DAY) continue;
        if (accounts && String(p.address).startsWith('acc:') && !accounts.isVerified(p.address)) continue;
        const st = states.get(p.address) || E.readPlayer(p.address);
        if (!st) continue;
        if (izindeMiState(st, now)) continue;      // izindeki vatandaş ücretsiz havuzdan pay almaz (onaylı kural)
        const contribution = weekScore(st, closedEpoch);
        if (!qualifies({ level: st.level, contribution, priceMultiplier: mult }, FP)) continue;
        const streak = nextStreak(st.faucetStreak, closedEpoch);
        free.push({ id: p.address, contribution, streak, weight: weightOf({ contribution, priceMultiplier: mult, streakWeeks: streak.weeks }, FP) });
      }
      // Kişi başı tavan kendi ağırlığıyla ölçeklenir: havuzun üst sınırı = tavanların toplamı (yan hesap havuzu şişiremez)
      const fracs = free.map(x => capFraction(x.weight, FP));
      const f = faucetWeekly({ mcapUsd: market?.mcapUsd || 0, priceUsd: market?.priceUsd || 0, freePlayers: fracs.reduce((s, v) => s + v, 0), questPool: T.getPool('quest') });
      const capFull = market?.priceUsd > 0 ? WEEKLY_RULES.faucetMaxUsdPerPlayer / WEEKLY_RULES.weeksPerMonth / market.priceUsd : 0;
      // v2 düzeltmesi (E-planı S6, 8 Ekim 2026): bu haftanın TOPLAM bütçesi (zaten f.totalAda ile kasanın en çok
      // %1,5'i) tek bir T.withdraw() çağrısından geçer (%2 tek çekim tavanı + kasa sağlığı); tavan/sağlık bütçeyi
      // küçültürse herkesin payı AYNI oranda küçülür, istenen (wanted[i]) değil gerçekten verilen kullanılır. Kesirli
      // bölüşümde kalan ufak artık son hak sahibine eklenir: kasadan çıkan (grantedTotal) ile dağıtılan (paidTotal)
      // tam eşit olsun diye.
      const wanted = f.totalAda > 0 ? distribute(f.totalAda, free.map(x => x.weight), fracs.map(v => v * capFull)) : free.map(() => 0);
      const wantedTotal = wanted.reduce((s, v) => s + v, 0);
      const grantedTotal = wantedTotal > 0 ? (T.withdraw('quest', wantedTotal).granted || 0) : 0;
      let paidTotal = 0;
      const lastIdx = wanted.reduce((last, v, i) => (v > 0 ? i : last), -1);
      const shares = wanted.map((amt, i) => {
        if (!(amt > 0) || !(wantedTotal > 0)) return 0;
        const v = i === lastIdx ? Math.max(0, grantedTotal - paidTotal) : Math.floor(amt * grantedTotal / wantedTotal * 100) / 100;
        paidTotal += v;
        return v;
      });
      free.forEach((x, i) => {
        const amt = shares[i];
        E.mutatePlayer(x.id, gs => {
          gs.state.faucetStreak = x.streak;
          if (!(amt > 0)) return;
          gs.state.adAstraBalance = (Number(gs.state.adAstraBalance) || 0) + amt;
          if (FP.LOCKED !== false) gs.state.lockedAda = Math.min(gs.state.adAstraBalance, (Number(gs.state.lockedAda) || 0) + amt);
          else gs._onAdaEarned(amt);
          gs.pushNotice(`🎁 Ücretsiz oyuncu payın: +${fmt(amt)} ASTRA (kilitli; oyunda harcadıkça çözülür). Sadakat serin: ${x.streak.weeks} hafta.`, 'success');
        });
      });
      T.save();
      const paidCount = shares.filter(v => v > 0).length;
      summary.faucet = { players: free.length, perPlayer: paidCount ? Math.floor(paidTotal / paidCount * 100) / 100 : 0, maxShare: Math.max(0, ...shares), totalAda: paidTotal, usdPerPlayerMonth: f.usdPerPlayerMonth };

      // 4) Fiyat çarpanı (kasa ömrü = hazine / aylık ücretsiz havuz)
      // Kasa ömrü yalnız oyuncuya ödeme yapan kasalarla hesaplanır (kilitli universe/konsey, tek olaylık fatih ve alıp yakan geri alım
      // kasası sayılmaz): eskiden 88 M'nin hepsi sayılıp ömür ~170 ay çıkıyor, fiyat çarpanı kalıcı ×0,8'e iniyordu (EK-10)
      const pools = runwayPoolTotal(T.state.pools, E.GAME_CONFIG.TREASURY_RUNWAY_POOLS);
      const monthlyFaucet = paidTotal * WEEKLY_RULES.weeksPerMonth;
      const runwayMonths = monthlyFaucet > 0 ? pools / monthlyFaucet : 999;
      const priceMultiplier = nextMultiplier({ current: Number(e.priceMultiplier) || 1, priceUsd: market?.priceUsd, launchPriceUsd: e.launchPriceUsd, runwayMonths });
      summary.priceMultiplier = priceMultiplier;
      summary.runwayMonths = Math.round(runwayMonths * 10) / 10;

      // 5) Temel gelir ağırlığı: son 2 haftada oynamış, en az 3. seviye oyuncular
      const minLvl = E.GAME_CONFIG.UBI_CONFIG?.MIN_LEVEL ?? 3;
      let ubiTotalWeight = 0;
      for (const p of players) {
        const st = states.get(p.address);
        if (st && (st.level || 1) >= minLvl && p.last_seen >= now - 14 * DAY && !izindeMiState(st, now)) ubiTotalWeight += E.levelWeight(st.level || 1);
      }

      // 6) Oyun içi yakım ve yapımcı payı → zincir
      // Sunucu dünyası sıfırdan başlar: ilk haftada bugüne kadarki yakımın tamamı aktarılır. Yapımcı payı yalnız çıkış zarfına
      // sığan kadar gider (adım 1); kalanı devreder.
      const burnedDelta = Math.max(0, (Number(gp.state.totalBurned) || 0) - settled.burned);
      burn += burnedDelta;
      queuePayout(closedEpoch, 'burn', cfg.deadAddress, burn);
      queuePayout(closedEpoch, 'creator', creatorWallet(), creatorPay);
      gp.saveState();
      summary.burn = { total: burn, spend: burnedDelta, fee: alloc.totals.feeBurn, defense };
      summary.creator = creatorPay;
      summary.creatorDeferred = Math.max(0, creatorDue - creatorPay);

      // 7) Ortak piyango çekilişi: bütün oyuncuların biletleri arasından TEK kazanan (şans = bilet / toplam).
      // Kazanan biletlerine ödediğinin 2 katını alır; kasa yetmezse kalan biletlere amorti dağıtılır (js/economy/lottery.js).
      const LC = E.GAME_CONFIG.CARNIVAL?.LOTTERY || {};
      // Bilet fiyatı 3 basamağa yuvarlanır (oyuncu tarafındaki adaPrice ile aynı); tam sayıya yuvarlama 1 × 0,4 çarpanında 0'a düşüyordu
      // ve ödenen tutarı sıfırlıyordu (13 Ekim 2026 denetimi EK-08)
      const ticketPrice = lotteryTicketPrice(LC.TICKET_COST_ADA || 100, etkinCarpan(e));
      const rules = { ticketPrice, winnerMultiplier: LC.WINNER_MULTIPLIER || 2, amortiShare: LC.AMORTI_SHARE ?? 0.02, carryAgingRate: LC.CARRY_AGING_RATE ?? 0.05, carryValueFloor: LC.CARRY_VALUE_FLOOR ?? 0.5 };
      const holders = [];
      for (const p of players) {
        const st = states.get(p.address);
        const t = Number(st && st.lotteryTickets) || 0;
        if (t > 0) holders.push({ id: p.address, tickets: t, paid: st.lotteryTicketsPaid != null ? Number(st.lotteryTicketsPaid) : t * rules.ticketPrice });
      }
      const L = E.lottery();
      const draw = runDraw({ pool: L.pool, amortiPool: L.amortiPool, holders }, rastgele, rules);   // gerçek ASTRA ödülü: kriptografik rastgelelik
      if (draw.drawn) {
        for (const h of draw.holders) {
          const mine = draw.payouts.filter(x => x.id === h.id);
          const prize = mine.find(x => x.kind === 'prize');
          const amorti = mine.find(x => x.kind === 'amorti');
          const before = holders.find(x => x.id === h.id)?.tickets || 0;
          E.mutatePlayer(h.id, gs => {
            gs.state.lotteryTickets = h.tickets;
            gs.state.lotteryTicketsPaid = h.paid;
            if (prize) {
              gs.state.lotteryPendingPayout = (Number(gs.state.lotteryPendingPayout) || 0) + prize.amount;
              gs.state.lotteryLockedTickets = (Number(gs.state.lotteryLockedTickets) || 0) + (prize.ticketsLocked || 0);
            }
            if (amorti) gs.state.lotteryPendingPayout = (Number(gs.state.lotteryPendingPayout) || 0) + amorti.amount;
            gs.state.lastLotteryResult = { at: now, userWon: !!prize, wonAmount: prize ? prize.amount : 0, amorti: amorti ? amorti.amount : 0, poolDepleted: !!draw.poolDepleted, epochId: closedEpoch };
            gs.pushNotice(prize
              ? `👑 Piyango sana çıktı! ${fmt(prize.amount)} ASTRA kazandın. Karnaval → Piyango'dan çek; kazanan biletlerin çekerken yanar.`
              : draw.poolDepleted
                ? `🎲 Piyango kasası bitti: kalan biletlere amorti dağıtıldı${amorti ? ` (sana +${fmt(amorti.amount)} ASTRA)` : ''}. Biletler kapandı.`
                : `🎲 Haftalık çekiliş yapıldı, bu hafta sana çıkmadı. ${before} biletin yanmadı, sonraki haftaya devretti.`,
              prize ? 'success' : 'info');
          });
        }
        E.setLottery({ pool: draw.pool, amortiPool: draw.amortiPool, totalTickets: draw.holders.reduce((t, h) => t + (h.tickets || 0), 0) });
        const amortiPaid = draw.payouts.filter(x => x.kind === 'amorti').reduce((s, x) => s + (Number(x.amount) || 0), 0);
        summary.lottery = { winner: draw.winnerId, prize: draw.prize, amorti: amortiPaid, poolDepleted: !!draw.poolDepleted, totalTickets: draw.totalTickets, players: holders.length };
      }

      // 8) Kolezyum (gerçek rakipler) haftalık sıralama ödülleri: ilk 10, Kolezyum kasasından
      if (arena) summary.pvp = arena.settleWeek(closedEpoch);

      // İzleme (14 Ekim 2026 ikinci tur, docs/v2/HAMMADDE_KULLANIM_PLANI.md bölüm 8): kişi başı kotası taban değere (QPP_MIN)
      // inen hammaddeler. Seviye bedeli siloya sığdırıldığı için Sv.20+ taş / kömür / şifalı ot talebi düşüktür; bu kabul edilmiş
      // bir durumdur ve termostat kotayı kısarak fiyatı savunur. Kota tabana dayanırsa kısacak yer kalmamıştır: fiyat çökmeye
      // başlar, yönetici uyarılır (özet kotaTabani listesi + log).
      try {
        const qppMin = Number((E.GAME_CONFIG.URETIM_HAKKI || {}).QPP_MIN ?? 0.05);
        const qpp = (gp.state && gp.state.uretim && gp.state.uretim.qpp) || {};
        const tabanda = Object.keys(qpp).filter(k => Number(qpp[k]) <= qppMin + 1e-9);
        summary.kotaTabani = tabanda;
        if (tabanda.length) log.warn('Kota tabana indi (talep düşük, termostatın kısacak payı kalmadı): ' + tabanda.join(', '));
      } catch (err) { log.warn('Kota izleme:', err.message); }

      // Kapı göstergesi: bu hafta dağıtılan kazanç (ASTRA) ve fiyat → kişi başı aylık dolar ortalamasına girer
      if (kapi) { try { kapi.recordWeek(summary, Number((econ().market || {}).priceUsd) || 0); } catch (err) { log.warn('Kapı göstergesi:', err.message); } }
      // Katılım puanı (E-planı Faz 1): bu haftanın değerlendirmesi — eşiğin altında kalanlara uyarı/izin sorusu
      if (kapi) { try { summary.katilim = kapi.haftalikKatilimDegerlendir(closedEpoch); } catch (err) { log.warn('Katılım puanı:', err.message); } }
      // Ödeme Kadranı: gelecek haftanın kasa bütçeleri bununla açılır (aşağıda openWeekBudgets)
      const kadran = kadranHesapla(now, Number(e.kadran) || 1);
      summary.kadran = kadran;
      // Oyun İçi Fiyat Endeksi (makro plan B1): bu hafta bütçeli kasalardan (zindan, kolezyum, boss, görev, karnaval) oyunculara ödenen
      // ÷ aktif vatandaş, tasarım payına (aynı kasaların tohum × haftalık oranından 100 vatandaşa düşen) oranlanır. Ücretsiz havuz ve
      // temel gelir iki tarafta da sayılmaz (yalnız birinde sayılsa endeks dış para olmadan da kayardı). Trade girişi bu kasalara
      // girdiği ve bütçenin giriş payıyla ödendiği için bolluk bu ölçüde görünür.
      const TBc = E.GAME_CONFIG.TREASURY_WEEKLY_BUDGET || {};
      const butceli = Object.keys(TBc.RATES || {});
      const dagitim = butceli.reduce((s, id) => s + (Number((T.state.weekSpent || {})[id]) || 0), 0);
      const aktifSay = Math.max(Number(TBc.PERSON_CAP_MIN_ACTIVE) || 1, players.filter(p => p.last_seen >= now - 7 * DAY).length);
      const tasarimKisi = butceli.reduce((s, id) => s + (Number(E.GAME_CONFIG.TREASURY_SEED[id]) || 0) * TBc.RATES[id], 0) / (Number((E.GAME_CONFIG.KAPI || {}).START_LIMIT) || 100);
      const dagitimSeri = [...(Array.isArray(e.dagitimSeri) ? e.dagitimSeri : []), dagitim / aktifSay].slice(-WEEKLY_RULES.endeksHafta);
      const oyunEndeksi = oyunIciEndeks({ kisiBasiSeri: dagitimSeri, tasarimKisi, onceki: Number(e.oyunEndeksi) || 1 });
      summary.oyunEndeksi = oyunEndeksi;
      // Genesis Yolu (makro plan B5): açık mühür sayısı = trade aylık geliri × pay ÷ sahip başı aylık ayrıcalık maliyeti (sezon tavanına kadar).
      // Fiyat yoksa (zincirsiz deneme) null: oyun sezon tavanını kullanır.
      const GY = E.GAME_CONFIG.GENESIS_YOLU || {};
      const fiyatUsd = Number(market && market.priceUsd) || 0;
      const tradeAylikUsd = akis.tb.reduce((s, v) => s + (Number(v) || 0), 0) * (30 / (7 * akis.tb.length || 28)) * fiyatUsd;
      const genesisAcik = fiyatUsd > 0 ? genesisAcikMuhur({ tradeAylikUsd, G: GY }) : null;
      summary.genesisAcik = genesisAcik;
      summary.bedelCarpani = etkinCarpan({ priceMultiplier, oyunEndeksi });
      setEcon({
        epochSettled: closedEpoch, priceMultiplier, ubiTotalWeight, withdrawCap: cap, kadran, oyunEndeksi, dagitimSeri, genesisAcik,
        settled: { burned: Number(gp.state.totalBurned) || 0, creator: (Number(settled.creator) || 0) + creatorPay },
        faucetPerPlayer: summary.faucet.perPlayer, lastWeekly: summary
      });
      db.event('weekly', null, summary);
      // Kayıt şişmesin: 90 günden eski olaylar, 400 günden eski fiyat örnekleri ve en son 5.000 dışındaki maç kayıtları silinir
      db.raw.prepare('DELETE FROM events WHERE at < ?').run(now - 90 * DAY);
      db.raw.prepare('DELETE FROM prices WHERE at < ?').run(now - 400 * DAY);
      const seq = Number((db.kvJson('world:arena', {}) || {}).seq) || 0;
      if (seq > 5000) db.raw.prepare("DELETE FROM kv WHERE key >= 'pvp:match:' AND key < 'pvp:match;' AND CAST(substr(key, 11) AS INTEGER) <= ?")   /* LIKE yerine aralık: anahtar indeksini kullanır */.run(seq - 5000);
      // Aktif vatandaş sayısı: son 7 günde görülenler (kişi başı haftalık pay tavanı için, js/treasury.js getPersonWeekCap).
      // Kimse son 7 günde görülmediyse (uzun duraklama, yeni sıfırlama) kayıtlı oyuncu sayısı yedek olur; sayı yine de taban
      // PERSON_CAP_MIN_ACTIVE'in altına inerse hazine defteri tabanı uygular.
      const aktif7 = players.filter(p => p.last_seen >= now - 7 * DAY).length;
      T.openWeekBudgets({ aktif: aktif7 > 0 ? aktif7 : players.length, kadran });
      return summary;
    }); } finally { T.bypassBudget = false; }
  }

  async function runWeekly(closedEpoch) {
    // Her hafta yalnız bir kez hesaplaşılır (çift ödeme olmaz)
    if (!(closedEpoch >= 1)) return { skipped: 'no-closed-week', epoch: closedEpoch };
    if (Number(econ().epochSettled) >= closedEpoch) return { skipped: 'already-settled', epoch: closedEpoch };
    let market = null;
    try { market = await snapshotMarket(); } catch (err) { log.warn('Piyasa okunamadı, son kayıt kullanılıyor:', err.message); }
    market = market || econ().market || null;
    // Piyasa okunurken (await) başka bir çağrı (zamanlayıcı + yönetici düğmesi) hesaplaşmayı bitirmiş olabilir: yeniden kontrol
    if (Number(econ().epochSettled) >= closedEpoch) return { skipped: 'already-settled', epoch: closedEpoch };
    try { refreshUretim(); } catch (err) { log.warn('Üretim Hakkı (hafta başı):', err.message); }
    const summary = settleWeek(closedEpoch, market);
    await processPayouts();
    return summary;
  }


  return { settleWeek, runWeekly };
}
