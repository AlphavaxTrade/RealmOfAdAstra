// Bot ücreti dökümü (19 Ekim 2026): ekrandaki satırlar toplamı tutmalı: brüt − stamina − alet − Üretim Hakkı sınırı = net kâr; ücret = net kârın yarısı.
// (Eskiden Üretim Hakkı sınırı tabloda yoktu: 930 − 47 − 138 yazıp net kâr 236 görünüyordu.)
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = { getItem: k => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => { depo.set(k, String(v)); }, removeItem: k => { depo.delete(k); } };
const { GameStateManager } = await import('../js/gameState.js');
const g = new GameStateManager();
g.state.level = 10;

const h = g.calculateTavernaBotProfitAndCost();
const toplam = h.grossRevenueAda - h.staminaWheatCostAda - h.toolRepairCostAda - h.rightsLimitLossAda;
assert.ok(Math.abs(toplam - h.netProfitAda) < 0.01, `satırlar toplamı net kârı vermeli: ${toplam} ≠ ${h.netProfitAda}`);
assert.ok(h.rightsLimitLossAda >= 0, 'sınır kaybı eksi olamaz');
assert.ok(Math.abs(h.botCostAda - Math.max(1, h.netProfitAda * 0.5)) < 0.01, 'bot ücreti net kârın yarısı');
console.log('✅ bot ücreti dökümü: satırlar toplamı net kârı veriyor');

// Üretim Hakkı bol olunca ayrı satır sıfır, tablo yine tutar
g.getUretimHakki = () => ({ canTake: 1e9, weekly: 1e9, used: 0, extra: 0 });
const bol = g.calculateTavernaBotProfitAndCost();
const toplam2 = bol.grossRevenueAda - bol.staminaWheatCostAda - bol.toolRepairCostAda - bol.rightsLimitLossAda;
assert.ok(Math.abs(toplam2 - bol.netProfitAda) < 0.01);
console.log('✅ hak bolken de satırlar tutuyor (sınır kaybı ' + bol.rightsLimitLossAda + ')');
