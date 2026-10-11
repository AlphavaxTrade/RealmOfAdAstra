// 11 Ekim 2026 — Krallık merkezi özeti: silo doluluğu ve sefer takipçisi oyunun bütün hammaddelerini kapsar (eskiden yalnız odun/demir/buğday)
import assert from 'node:assert/strict';

globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] ?? null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

const { GameStateManager } = await import('../js/gameState.js');
const { GAME_CONFIG } = await import('../js/config.js');

const R = GAME_CONFIG.RESOURCE_KEYS;
let passed = 0;
const ok = (n) => { passed++; console.log(`✅ ${n}`); };

localStorage.clear();
const gs = new GameStateManager();

// 1) bütün hammaddeler özetin içinde
const s = gs.getRealmSummary();
assert.ok(Array.isArray(s.kaynaklar), 'özet "kaynaklar" listesi döndürmeli');
assert.deepEqual(s.kaynaklar.map(r => r.key), R, 'özet oyundaki bütün hammaddeleri aynı sırayla içermeli');
assert.equal(s.kaynaklar.length, 6, 'v2 oyununda altı hammadde var');
ok('özet altı hammaddenin tamamını listeler');

// 2) her satır ad, simge, miktar, kapasite, yüzde taşır; yüzde 0-100 sayıdır
for (const r of s.kaynaklar) {
  assert.ok(r.name && r.icon, `${r.key}: ad ve simge var`);
  assert.ok(Number.isFinite(r.amount) && Number.isFinite(r.cap) && Number.isFinite(r.pct), `${r.key}: sayılar sonlu`);
  assert.ok(r.pct >= 0 && r.pct <= 100, `${r.key}: yüzde 0-100 arası`);
}
ok('her kaynak satırı ad, simge, miktar, kapasite ve yüzde taşır');

// 3) doluluk yüzdesi gerçek stoktan hesaplanır, kapasiteyi aşan stok %100'e kırpılır
const cap = gs.getWarehouseCapacity();
gs.state.inventory.herb = Math.floor(cap.herb / 2);
gs.state.inventory.coal = cap.coal * 3;
const s2 = gs.getRealmSummary();
const herb = s2.kaynaklar.find(r => r.key === 'herb');
const coal = s2.kaynaklar.find(r => r.key === 'coal');
assert.equal(herb.pct, Math.round((Math.floor(cap.herb / 2) / cap.herb) * 100), 'şifalı ot yüzdesi stoktan hesaplanır');
assert.equal(coal.pct, 100, 'kapasiteyi aşan stok %100');
ok('doluluk yüzdesi gerçek stoktan gelir ve %100\'e kırpılır');

// 4) eski üç alanlı alanlar artık yok (yeni ekran yalnız "kaynaklar" listesini kullanır)
assert.equal('woodPct' in s2, false);
assert.equal('ironPct' in s2, false);
assert.equal('wheatPct' in s2, false);
ok('eski woodPct/ironPct/wheatPct alanları kaldırıldı');

console.log(`\n${passed} kontrol geçti.`);
