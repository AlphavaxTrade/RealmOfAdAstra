// Realm of AdAstra — GameStateManager yöntemleri: haftalık piyango (kurallar: js/economy/lottery.js)
// Karışım olarak GameStateManager.prototype'a eklenir (bkz. js/gameState.js). Sunucu, temsili sahipleri gerçek
// oyuncu toplamıyla değiştirir (server/engine.js getLotterySimHolders / simulateOtherLotteryBuyers).
import { GAME_CONFIG } from '../config.js';
import { globalPool } from '../globalPool.js';
import { splitTicketPayment, runDraw, winChance } from '../economy/lottery.js';

const tr = n => Number(n).toLocaleString('tr-TR');
const piyangoAyari = () => (GAME_CONFIG.CARNIVAL && GAME_CONFIG.CARNIVAL.LOTTERY) || {};
const donemKimligi = () => (globalPool && globalPool.state && globalPool.state.epochId) || 1;

export const piyangoYontemleri = {
  getLotteryRules() {
    const L = piyangoAyari();
    return { ticketPrice: this.adaPrice(L.TICKET_COST_ADA || 100), winnerMultiplier: L.WINNER_MULTIPLIER || 2, amortiShare: L.AMORTI_SHARE ?? 0.02 };
  },

  // Tarayıcı sürümünde diğer oyuncular temsili bilet sahipleriyle canlandırılır (sunucuda gerçek oyuncular)
  getLotterySimHolders() {
    if (!Array.isArray(this.state.lotterySimHolders)) {
      const n = piyangoAyari().LOCAL_SIM_HOLDERS ?? 20;
      this.state.lotterySimHolders = Array.from({ length: n }, (_, i) => ({ id: `sim_${i + 1}`, tickets: 0, paid: 0 }));
    }
    return this.state.lotterySimHolders;
  },

  // Haftalık bilet alım sınırı: yeni hafta (dönem) başlayınca sayaç sıfırdan sayılır
  getLotteryLimits() {
    const epochId = donemKimligi();
    const maxPerWeek = piyangoAyari().MAX_TICKETS_PER_ACCOUNT || 100;
    const boughtThisWeek = this.state.lotteryWeekEpoch === epochId ? (this.state.lotteryBoughtThisWeek || 0) : 0;
    const weekLeft = Math.max(0, maxPerWeek - boughtThisWeek);
    return { epochId, maxPerWeek, boughtThisWeek, weekLeft, canBuy: weekLeft };
  },

  getLotteryStatus() {
    const { maxPerWeek, boughtThisWeek, weekLeft, canBuy } = this.getLotteryLimits();
    const rules = this.getLotteryRules();
    const myTickets = this.state.lotteryTickets || 0;
    const others = this.getLotterySimHolders().reduce((s, h) => s + (h.tickets || 0), 0);
    const totalTickets = myTickets + others;
    const paid = this.state.lotteryTicketsPaid != null ? this.state.lotteryTicketsPaid : myTickets * rules.ticketPrice;
    return {
      myTickets,
      paid,
      potentialPrize: paid * rules.winnerMultiplier,
      totalTickets,
      chance: winChance(myTickets, totalTickets),
      boughtThisWeek,
      maxPerWeek,
      weekLeft,
      canBuy,
      pool: this.state.lotteryPool || 0,
      amortiPool: this.state.lotteryAmortiPool || 0,
      pendingPayout: this.state.lotteryPendingPayout || 0,
      lockedTickets: this.state.lotteryLockedTickets || 0,
      lastResult: this.state.lastLotteryResult || null
    };
  },

  buyLotteryTickets(ticketCount = 1) {
    const adet = Math.max(1, parseInt(ticketCount) || 1);
    const sinir = this.getLotteryLimits();
    if (this.state.lotteryWeekEpoch !== sinir.epochId) {
      this.state.lotteryWeekEpoch = sinir.epochId;
      this.state.lotteryBoughtThisWeek = 0;
    }
    const alinan = sinir.boughtThisWeek;
    if (adet > sinir.weekLeft) {
      return {
        success: false,
        message: `🚫 Bir hesap haftada en fazla ${sinir.maxPerWeek} bilet alabilir. Bu hafta aldığın: ${alinan}, alabileceğin: ${sinir.weekLeft}.`
      };
    }

    const kurallar = this.getLotteryRules();
    const { cost, toAmorti, toPool } = splitTicketPayment(adet, kurallar);
    if (this.state.adAstraBalance < cost) {
      return { success: false, message: `Yetersiz ASTRA! ${adet} bilet için ${cost} ASTRA gereklidir.` };
    }

    if (this.state.lotteryTicketsPaid == null) this.state.lotteryTicketsPaid = (this.state.lotteryTickets || 0) * kurallar.ticketPrice;
    this.state.adAstraBalance -= cost;
    this._onAdaSpent(cost);
    this.state.lotteryTickets = (this.state.lotteryTickets || 0) + adet;
    this.state.lotteryTicketsPaid += cost;
    this.state.lotteryBoughtThisWeek = alinan + adet;
    this.state.lotteryAmortiPool = (this.state.lotteryAmortiPool || 0) + toAmorti;
    this.state.lotteryPool = (this.state.lotteryPool || 0) + toPool;
    this.saveState();

    return {
      success: true,
      ticketCount: adet,
      totalTickets: this.state.lotteryTickets,
      lotteryPool: this.state.lotteryPool,
      lotteryAmortiPool: this.state.lotteryAmortiPool,
      amortiAdded: toAmorti,
      message: `🎟️ ${adet} bilet alındı (${tr(cost)} ASTRA). Elindeki bilet: ${this.state.lotteryTickets} · Kazanırsan: ${tr(this.state.lotteryTicketsPaid * kurallar.winnerMultiplier)} ASTRA`
    };
  },

  // Haftalık çekiliş takvime bağlıdır: yeni haftaya (Pazartesi 00:01 TSİ) geçildiğinde geçen haftanınki bir kez,
  // kendiliğinden yapılır. Oyuncu çekilişi istediği an tetikleyemez.
  processScheduledLottery() {
    const donem = donemKimligi();
    if (this.state.lastLotteryDrawEpoch == null) {
      this.state.lastLotteryDrawEpoch = donem;
      return null;
    }
    if (donem <= this.state.lastLotteryDrawEpoch) return null;
    this.state.lastLotteryDrawEpoch = donem;

    const sonuc = this.drawWeeklyLottery({ scheduled: true });
    if (!sonuc || !sonuc.drawn) { this.saveState(); return null; }
    this.state.lastLotteryResult = {
      at: Date.now(), userWon: sonuc.userWon, wonAmount: sonuc.wonAmount, amorti: sonuc.amortiAmount || 0,
      poolDepleted: !!sonuc.poolDepleted, epochId: donem
    };
    if (sonuc.userWon || sonuc.amortiAmount > 0 || sonuc.userTicketsBefore > 0) {
      this.pushNotice(sonuc.message, sonuc.userWon ? 'success' : 'info');
    }
    this.saveState();
    return sonuc;
  },

  // Temsili diğer oyuncular her hafta bilet alır (yalnızca tarayıcı sürümünde; sunucuda gerçek alımlar)
  simulateOtherLotteryBuyers() {
    const kurallar = this.getLotteryRules();
    const haftalik = piyangoAyari().LOCAL_SIM_TICKETS_PER_WEEK ?? 20;
    for (const sahip of this.getLotterySimHolders()) {
      const adet = Math.max(0, Math.round(haftalik * (0.5 + Math.random())));
      if (adet <= 0) continue;
      const bolum = splitTicketPayment(adet, kurallar);
      sahip.tickets += adet;
      sahip.paid += bolum.cost;
      this.state.lotteryPool = (this.state.lotteryPool || 0) + bolum.toPool;
      this.state.lotteryAmortiPool = (this.state.lotteryAmortiPool || 0) + bolum.toAmorti;
    }
  },

  // Haftalık çekiliş: tek kazanan, kazanan ödediğinin 2 katını alır; kasa yetmezse amorti dağıtılır
  drawWeeklyLottery({ scheduled = false } = {}) {
    const kurallar = this.getLotteryRules();
    this.simulateOtherLotteryBuyers();
    const biletim = this.state.lotteryTickets || 0;
    const odedigim = this.state.lotteryTicketsPaid != null ? this.state.lotteryTicketsPaid : biletim * kurallar.ticketPrice;
    const sahipler = [{ id: 'me', tickets: biletim, paid: odedigim }, ...this.getLotterySimHolders()];
    const cekilis = runDraw({ pool: this.state.lotteryPool || 0, amortiPool: this.state.lotteryAmortiPool || 0, holders: sahipler }, Math.random, kurallar);
    if (!cekilis.drawn) return { drawn: false };

    this.state.lotteryPool = cekilis.pool;
    this.state.lotteryAmortiPool = cekilis.amortiPool;
    const benSonra = cekilis.holders.find(h => h.id === 'me');
    this.state.lotterySimHolders = cekilis.holders.filter(h => h.id !== 'me');

    const odul = cekilis.payouts.find(p => p.id === 'me' && p.kind === 'prize');
    const amorti = cekilis.payouts.find(p => p.id === 'me' && p.kind === 'amorti');
    let kazanilan = 0;
    let amortiTutari = 0;
    if (odul) {
      kazanilan = odul.amount;
      this.state.lotteryPendingPayout = (this.state.lotteryPendingPayout || 0) + kazanilan;
      // Kazanan biletler ödül çekilirken yanar; o zamana kadar kilitli (sonraki çekilişlere girmez)
      this.state.lotteryLockedTickets = (this.state.lotteryLockedTickets || 0) + (odul.ticketsLocked || 0);
    }
    if (amorti) {
      amortiTutari = amorti.amount;
      this.state.lotteryPendingPayout = (this.state.lotteryPendingPayout || 0) + amortiTutari;
    }
    this.state.lotteryTickets = benSonra ? benSonra.tickets : 0;
    this.state.lotteryTicketsPaid = benSonra ? benSonra.paid : 0;
    if (!scheduled) this.saveState();

    const kazandi = !!odul;
    let mesaj;
    if (kazandi) {
      mesaj = cekilis.poolDepleted
        ? `👑 Piyango sana çıktı! Kasada kalan ${tr(kazanilan)} ASTRA'nın tamamı senin. Karnaval → Piyango'dan çek; biletlerin çekerken yanar.`
        : `👑 Piyango sana çıktı! Biletlerine ödediğinin 2 katı: ${tr(kazanilan)} ASTRA. Karnaval → Piyango'dan çek; biletlerin çekerken yanar.`;
    } else if (cekilis.poolDepleted) {
      mesaj = `🎲 Piyango kasası bitti: kalan tüm biletlere amorti dağıtıldı${amortiTutari > 0 ? ` (sana +${tr(amortiTutari)} ASTRA)` : ''}. Biletler kapandı, piyango yeni satışlarla yeniden dolacak.`;
    } else {
      mesaj = biletim > 0
        ? `🎲 Haftalık çekiliş yapıldı, bu hafta sana çıkmadı. ${biletim} biletin yanmadı, sonraki haftaya devretti.`
        : '🎲 Haftalık çekiliş yapıldı.';
    }

    return {
      drawn: true,
      userWon: kazandi,
      wonAmount: kazanilan,
      amortiAmount: amortiTutari,
      poolDepleted: cekilis.poolDepleted,
      winnerId: cekilis.winnerId,
      totalTickets: cekilis.totalTickets,
      userTicketsBefore: biletim,
      userTicketsRemaining: this.state.lotteryTickets,
      rolloverPool: this.state.lotteryPool,
      message: mesaj
    };
  },

  // Amorti yalnızca piyango kasası bittiğinde, kalan tüm biletlere eşit dağıtılır (elle bilet yakıp amorti alma yok).
  // Biletini erken kullanmak isteyen, çarkta 1 bilet = 1 çevirme olarak yakabilir.
  burnLotteryTicketsForAmorti() {
    return { success: false, message: 'Amorti, piyango kasası bittiğinde kalan tüm biletlere otomatik dağıtılır. Biletini beklemek istemezsen çarkta 1 bilet = 1 çevirme olarak kullanabilirsin.' };
  },

  // Kazanan biletin ödülünü çek: yalnızca haftalık çekilişte gerçekten kazanılmış (kasadan ayrılmış) tutar ödenir.
  claimWinnerLotteryPayout() {
    const bekleyen = Number(this.state.lotteryPendingPayout) || 0;
    if (bekleyen <= 0) {
      return { success: false, message: 'Çekilecek bir piyango kazancın yok. Çekiliş her Pazartesi 00:01 (TSİ) kendiliğinden yapılır; biletlerin yanmaz, kazanana kadar sonraki haftaya devreder.' };
    }
    const yanan = this.state.lotteryLockedTickets || 0;
    this.state.lotteryPendingPayout = 0;
    this.state.lotteryLockedTickets = 0;   // kazanan biletler ödül çekilirken yanar
    this.state.adAstraBalance = (this.state.adAstraBalance || 0) + bekleyen;
    this._onAdaEarned(bekleyen);
    this.saveState();
    return {
      success: true,
      payoutAda: bekleyen,
      burnedTickets: yanan,
      remainingPool: this.state.lotteryPool,
      message: `🏆 Piyango kazancın (+${tr(bekleyen)} ASTRA) cüzdanına aktarıldı!${yanan > 0 ? ` Kazanan ${yanan} bilet yandı.` : ''}`
    };
  },

  // 1 bilet = 1 çark çevirmesi
  useLotteryTicketForWheel() {
    return this.spinCarnivalWheel('ticket');
  }
};
