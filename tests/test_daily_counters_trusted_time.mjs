// Günlük haklar bilgisayar saatine değil, sunucu saatiyle düzeltilmiş "güvenilir saate" bağlıdır.
import assert from 'node:assert/strict';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const { GameStateManager } = await import('../js/gameState.js');
const { globalPool } = await import('../js/globalPool.js');

const DAY = 24 * 3600 * 1000;
const realNow = Date.now;
let passed = 0;
const ok = (name) => { passed++; console.log(`✅ ${name}`); };

const gs = new GameStateManager();
gs.state.stamina = 1000;
globalPool.serverTimeOffset = 0;
for (let i = 0; i < 5; i++) gs.beginDungeonEntry(1, false, { soldierCount: 1 });
assert.equal(gs.getDungeonDayStatus().freeLeft, 0);
gs.checkWeeklyAutonomousBuyback(); // bu haftanın işaretini koy

// 1) Oyuncu bilgisayar saatini 2 gün ileri alır; sunucu saati farkı düzeltir → gün değişmez
try {
  Date.now = () => realNow() + 2 * DAY;
  globalPool.serverTimeOffset = -2 * DAY;
  assert.equal(gs.getDungeonDayStatus().freeLeft, 0, 'Saat ileri alınınca günlük haklar yenilenmemeli');
  const d = gs.checkWeeklyAutonomousBuyback();
  assert.notEqual(d.executed, true, 'Saat ileri alınınca haftalık geri alım tekrar çalışmamalı');
  ok('Bilgisayar saatini ileri almak günlük hakları ve haftalık geri alımı yenilemez');
} finally {
  Date.now = realNow;
  globalPool.serverTimeOffset = 0;
}

// 2) Güvenilir saatte gerçekten gün değişince haklar yenilenir
globalPool.serverTimeOffset = DAY;
assert.equal(gs.getDungeonDayStatus().freeLeft, 5, 'Gerçek gün değişiminde haklar yenilenmeli');
globalPool.serverTimeOffset = 0;
ok('Güvenilir saatte gün değişince günlük haklar yenilenir');

console.log(`\n${passed} güvenilir saat testi geçti.`);
