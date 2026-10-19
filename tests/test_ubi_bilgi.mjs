// UBI kartı (19 Ekim 2026): bu hafta biriken para Pazartesi açılır; kartta tahmini pay ayrıca gösterilir (açık kasa 0 iken payım 0 görünmesi karışıklık yaratıyordu)
import assert from 'node:assert/strict';
const depo = new Map();
globalThis.localStorage = { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: (k) => { depo.delete(k); } };
const { globalPool } = await import('../js/globalPool.js');
globalPool.vanillaReset();
globalPool.recordTokenSpend(10000);
const u = globalPool.getUbiPoolInfo(7, 0);
assert.ok(u.accruingThisWeek > 0, 'harcama bu hafta birikir');
assert.equal(u.claimRemaining, 0, 'açık kasa Pazartesiye kadar boş');
assert.equal(u.payout, 0, 'şu an alınabilecek pay 0');
assert.ok(u.nextWeekPayout > 0, 'Pazartesi tahmini pay gösterilir');
console.log('✅ UBI: biriken para, açık kasa ve Pazartesi tahmini ayrı ayrı döner');
console.log('\n1 UBI bilgi kontrolü geçti.');
