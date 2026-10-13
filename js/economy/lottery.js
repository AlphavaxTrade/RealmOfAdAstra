// Realm of AdAstra — Haftalık Piyango hesap motoru (saf fonksiyonlar; tarayıcıda ve sunucuda aynı çalışır)
// ============================================================================
// Kurallar (29 Eylül 2026, kullanıcı kararı):
//  • Her bilet 100 ASTRA. Her hesap haftada en fazla belirli sayıda bilet alabilir.
//  • Biletin küçük bir kısmı amorti kasasına, kalanı piyango kasasına gider.
//  • Haftalık çekilişte TEK kazanan seçilir; kazanma şansı = kişinin bileti / toplam bilet.
//  • Kazanan, elindeki biletlere ödediği toplam ASTRA'nın 2 katını kasadan kazanır.
//    Biletleri ödülü çekerken yanar. (Çekilişte kilitlenir, sonraki çekilişlere girmez.)
//  • Kazanamayanların biletleri yanmaz; sonraki haftaya devreder (bilet "stake" edilmiş olur).
//  • Piyango kasası kazananın ödülünü karşılayamazsa kasa biter: kazanan kasada kalan her şeyi alır,
//    amorti kasası kalan tüm biletlere eşit bölünür, bilet sahiplerine amorti olarak ödenir ve
//    bütün biletler kapanır. Piyango sıfırdan, yeni bilet satışlarıyla yeniden dolar.
// ============================================================================

export const DEFAULT_LOTTERY_RULES = {
  ticketPrice: 100,
  winnerMultiplier: 2,
  amortiShare: 0.02,
  // Devreden bileti yaşlandırma (13 Ekim 2026 denetimi EK-08): kazanamayan her çekilişte biletlerin "ödenen" değeri bu oran
  // kadar düşer, ama en çok bilet fiyatının carryValueFloor'una kadar. Eskiden devreden her bilet bekledikçe değerini
  // koruyordu ve kazanınca 2 katı ödeniyordu: biletler satıldığından 2 kat çıktığı için kasa bilet gelirinin ~1,75 katını
  // ödüyor, 520 haftada 12 M tohumdan 4 M eriyordu. Taban 0,5 = en yaşlı bilet kazanırsa yatırdığının 1 katını alır (kayıpsız).
  carryAgingRate: 0.05,
  carryValueFloor: 0.5
};

// Kazanamayanların devreden biletlerinin ödenen değerini yaşlandırır (biletin sayısına dokunmaz; ücretsiz biletin değeri 0 kalır)
function ageHolders(holders, winnerId, rules) {
  const rate = Number(rules.carryAgingRate ?? DEFAULT_LOTTERY_RULES.carryAgingRate) || 0;
  if (!(rate > 0)) return;
  const floor = Number(rules.carryValueFloor ?? DEFAULT_LOTTERY_RULES.carryValueFloor);
  for (const h of holders) {
    if (h.id === winnerId || !(h.tickets > 0)) continue;
    const paid = h.paid != null ? h.paid : h.tickets * rules.ticketPrice;
    const taban = h.tickets * rules.ticketPrice * floor;
    h.paid = Math.max(Math.min(paid, taban), paid * (1 - rate));
  }
}

// Bilet satın alımının kasalara bölünüşü
export function splitTicketPayment(count, rules = DEFAULT_LOTTERY_RULES) {
  const cost = Math.max(0, count) * rules.ticketPrice;
  const toAmorti = Math.round(cost * rules.amortiShare * 100) / 100;
  return { cost, toAmorti, toPool: cost - toAmorti };
}

// Bilete göre ağırlıklı tek kazanan seçimi. holders: [{ id, tickets }]
export function pickWinner(holders, rng = Math.random) {
  const eligible = holders.filter(h => (h.tickets || 0) > 0);
  const total = eligible.reduce((s, h) => s + h.tickets, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const h of eligible) {
    roll -= h.tickets;
    if (roll < 0) return h.id;
  }
  return eligible[eligible.length - 1].id;
}

export function winChance(holderTickets, totalTickets) {
  return totalTickets > 0 ? holderTickets / totalTickets : 0;
}

// Haftalık çekiliş. Girdiyi değiştirmez; yeni durumu döndürür.
// state: { pool, amortiPool, holders: [{ id, tickets, paid }] }  (paid = elindeki biletlere ödediği toplam ASTRA)
export function runDraw(state, rng = Math.random, rules = DEFAULT_LOTTERY_RULES) {
  const holders = state.holders.map(h => ({ ...h }));
  const totalTickets = holders.reduce((s, h) => s + (h.tickets || 0), 0);
  const winnerId = pickWinner(holders, rng);
  if (!winnerId) {
    return { ...state, holders, drawn: false, totalTickets };
  }

  const winner = holders.find(h => h.id === winnerId);
  const prize = (winner.paid != null ? winner.paid : winner.tickets * rules.ticketPrice) * rules.winnerMultiplier;
  let pool = state.pool;
  let amortiPool = state.amortiPool;
  const payouts = [];

  if (pool >= prize) {
    pool -= prize;
    payouts.push({ id: winnerId, amount: prize, kind: 'prize', ticketsLocked: winner.tickets });
    winner.tickets = 0;
    winner.paid = 0;
    ageHolders(holders, winnerId, rules);   // kazanamayanların devreden biletleri bir hafta yaşlanır
    return { pool, amortiPool, holders, drawn: true, winnerId, prize, poolDepleted: false, payouts, totalTickets };
  }

  // Kasa bitti: kazanan kasada kalanı alır, amorti tüm kalan biletlere bölünür, biletler kapanır
  const winnerTickets = winner.tickets;
  payouts.push({ id: winnerId, amount: pool, kind: 'prize', ticketsLocked: winnerTickets });
  winner.tickets = 0;
  winner.paid = 0;
  pool = 0;
  const remaining = holders.reduce((s, h) => s + (h.tickets || 0), 0);
  const perTicket = remaining > 0 ? amortiPool / remaining : 0;
  for (const h of holders) {
    if (h.tickets > 0) {
      payouts.push({ id: h.id, amount: Math.floor(h.tickets * perTicket * 100) / 100, kind: 'amorti', ticketsClosed: h.tickets });
      h.tickets = 0;
      h.paid = 0;
    }
  }
  const paidAmorti = payouts.filter(p => p.kind === 'amorti').reduce((s, p) => s + p.amount, 0);
  amortiPool = Math.max(0, amortiPool - paidAmorti);
  return { pool, amortiPool, holders, drawn: true, winnerId, prize, poolDepleted: true, amortiPerTicket: perTicket, payouts, totalTickets };
}
