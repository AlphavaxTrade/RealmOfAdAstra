// Sunucu — Üretim Hakkı adalet tavanı (E-planı S8, 8 Ekim 2026): docs/v2/KARARLAR_KESIN.md "adalet tavanı: en
// yüksek ağırlık en düşüğün 3 katını geçmez." Kişinin KENDİ hakkı bu tavanla sınırlanır; dünya kapasitesi (sumWeight)
// HAM ağırlıklardan hesaplanır (tavan pastayı küçültmez, yalnız dağılımı adilleştirir).
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createWorld } from '../server/world.js';
import { loadConfig } from '../server/config.js';
import { GAME_CONFIG } from '../js/config.js';

const db = openDb(':memory:');
const E = await createEngine(db);
const world = createWorld({ db, engine: E, cfg: { ...loadConfig({}), dbFile: ':memory:' }, log: { warn() {}, error() {} } });

const low = '0x' + 'a1'.repeat(20);
const high = '0x' + 'b2'.repeat(20);
for (const a of [low, high]) { db.q.playerAdd.run(a, Date.now(), Date.now()); E.withPlayer(a, () => null); }

// low: Sv.1, katkı yok, 7 günden eski kayıt + hiç aktif gün yok → aktiflik tabanı (0,25) = dünyanın en düşük ham ağırlığı
E.mutatePlayer(low, gs => {
  gs.state.level = 1;
  gs.state.uretim = { epochId: E.globalPool.state.epochId, used: {}, since: Date.now() - 30 * 86400000, activeDays: [] };
});
// high: Sv.81 (seviye çarpanı ×2 tavanı), geçen hafta 10.000 katkı puanı (Elmas kademe ×1,5), yeni kayıt (ilk hafta tam aktif)
E.mutatePlayer(high, gs => {
  gs.state.level = 81;
  gs.state.contribution = { total: 0, week: 0, lastWeek: 10000, epochId: E.globalPool.state.epochId, buyCredit: {} };
});

const rawLow = E.withPlayer(low, gs => gs._getUretimWeightRaw().weight).result;
const rawHigh = E.withPlayer(high, gs => gs._getUretimWeightRaw().weight).result;
assert.ok(rawHigh > rawLow * 3, `test anlamlı olsun diye ham oran 3 katından büyük olmalı (${(rawHigh / rawLow).toFixed(1)}×)`);
console.log(`✅ Senaryo kuruldu: ham ağırlık düşük=${rawLow}, yüksek=${rawHigh} (oran ${(rawHigh / rawLow).toFixed(1)}×, tavansız)`);

const sum = world.refreshUretim();
assert.ok(Math.abs(sum - (rawLow + rawHigh)) < 1e-6, 'dünya kapasitesi (sumWeight) HAM ağırlıkların toplamından hesaplanır, tavandan değil');
console.log('✅ Dünya kapasitesi (sumWeight) ham toplamdan hesaplanıyor: adalet tavanı pastayı küçültmüyor');

const ratio = GAME_CONFIG.URETIM_HAKKI.FAIRNESS_CAP ?? 3;
const cappedLow = E.withPlayer(low, gs => gs.getUretimWeight().weight).result;
const cappedHigh = E.withPlayer(high, gs => gs.getUretimWeight().weight).result;
const cappedFlag = E.withPlayer(high, gs => gs.getUretimWeight().weightCapped).result;
assert.equal(cappedLow, rawLow, 'en düşük aktif oyuncunun kendi ağırlığı tavana çarpmaz, değişmez');
assert.ok(Math.abs(cappedHigh - rawLow * ratio) < 1e-3, `yüksek ağırlık en düşüğün ${ratio} katına tavanlanır (${cappedHigh} ≈ ${rawLow * ratio})`);
assert.equal(cappedFlag, true, 'tavana çarpan oyuncunun bilgisinde işaretlenir (weightCapped)');
assert.ok(cappedHigh / cappedLow <= ratio + 1e-6, `tavanlı oran ${ratio}×'i geçmez (${(cappedHigh / cappedLow).toFixed(2)}×)`);
console.log(`✅ Adalet tavanı uygulandı: tavanlı oran ${(cappedHigh / cappedLow).toFixed(2)}× (sınır ${ratio}×)`);

// Kişisel hak hesabı (getUretimHakki) da tavanlı ağırlığı kullanır
const perWeightWood = E.globalPool.weeklyRightPerWeight('wood');
const hakHigh = E.withPlayer(high, gs => gs.getUretimHakki('wood').weekly).result;
assert.equal(hakHigh, Math.floor(perWeightWood * cappedHigh), 'Kişisel haftalık hak tavanlı ağırlıkla hesaplanır');
console.log('✅ Kişisel hak (getUretimHakki) tavanlı ağırlığı kullanıyor');

// Tarayıcı / tek oyuncu modunda (sunucu hiç yazmadıysa) tavan yoktur, davranış değişmez
{
  const { GlobalResourceManager } = await import('../js/globalPool.js');
  globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; }, clear() { this.store = {}; } };
  const tekOyunculuHavuz = new GlobalResourceManager();
  assert.equal(tekOyunculuHavuz.state.uretim.fairnessCapWeight, undefined, 'tarayıcı tek oyuncu modunda tavan hiç yazılmaz');
}
console.log('✅ Tarayıcı tek oyuncu modunda tavan yok (davranış değişmedi)');

console.log('\n5 adalet tavanı kontrolü geçti.');
