// Piyango: kazanç çekildiği an elindeki BÜTÜN biletler yanar; kazanç beklerken yeni bilet alınamaz (19 Ekim 2026).
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: k => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: k => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');

const g = new GameStateManager();
g.state.adAstraBalance = 1e6;
g.state.lotteryPool = 1e7;
g.state.lotteryAmortiPool = 1e5;
g.state.lotterySimHolders = [];   // tek bilet sahibi biziz: çekilişi kesin kazanırız
assert.ok(g.buyLotteryTickets(5).success);
const cekilis = g.drawWeeklyLottery({ scheduled: true });
assert.ok(cekilis.userWon, 'tek bilet sahibi kazanmalı');
assert.equal(g.state.lotteryPendingPayout, 10, '5 bilet x 1 ASTRA x 2 kat');

// Kazanç beklerken yeni bilet alınamaz (parası çekimde boşa giderdi)
const red = g.buyLotteryTickets(3);
assert.equal(red.success, false);
assert.match(red.message, /Önce kazancını çek/);
assert.equal(g.state.lotteryTickets, 0);

// Eski kayıt: kazanç beklerken elde bilet kalmış (önceki sürümde alınmış). Çekimde hepsi yanmalı.
g.state.lotteryTickets = 7;
g.state.lotteryTicketsPaid = 7;
const bakiye = g.state.adAstraBalance;
const cek = g.claimWinnerLotteryPayout();
assert.ok(cek.success);
assert.equal(cek.burnedTickets, 12, 'kilitli 5 + elde kalan 7 bilet yanmalı');
assert.equal(g.state.lotteryTickets, 0, 'elde bilet kalmamalı');
assert.equal(g.state.lotteryTicketsPaid, 0);
assert.equal(g.state.lotteryLockedTickets, 0);
assert.equal(g.state.adAstraBalance - bakiye, 10, 'ödül tam geçmeli');
console.log('✅ piyango kazancı çekilince elindeki bütün biletler yanıyor');

// Çekimden sonra yeniden bilet alınabilir
assert.ok(g.buyLotteryTickets(2).success);
assert.equal(g.state.lotteryTickets, 2);
console.log('✅ çekimden sonra yeni bilet alınabiliyor');

// Kazanç yokken çekim reddedilir, biletlere dokunmaz
assert.equal(g.claimWinnerLotteryPayout().success, false);
assert.equal(g.state.lotteryTickets, 2, 'kazanç yokken biletler yanmaz');
console.log('✅ kazanç yokken biletler yanmıyor');
