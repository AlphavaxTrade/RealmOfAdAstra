// Sunucu — "aktif vatandaş" tek tanımı (E-planı S7, 8 Ekim 2026): son 7 günde ≥ KAPI.ACTIVE_DAYS_PER_WEEK gün
// sefer tamamlanmış mı. server/aktiflik.js saf fonksiyonları + server/kapi.js'e bağlanışı.
import assert from 'node:assert/strict';
import { activeDaysInLast7, isActiveCitizen } from '../server/aktiflik.js';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createKapi } from '../server/kapi.js';
import { loadConfig } from '../server/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };
const DAY = 86400000;
const now = Date.UTC(2026, 9, 8, 12);
const today = Math.floor(now / DAY);

// 1) Saf fonksiyonlar: son 7 günde farklı gün sayısı, boş/eksik durumlar
{
  assert.equal(activeDaysInLast7(null, now), 0, 'durum yoksa 0');
  assert.equal(activeDaysInLast7({ uretim: { activeDays: [] } }, now), 0, 'hiç aktif gün yoksa 0');
  const gunler = [today, today - 1, today - 2, today - 10];   // son 7 günde 3'ü, 1'i (10 gün önce) dışarıda
  assert.equal(activeDaysInLast7({ uretim: { activeDays: gunler } }, now), 3, '7 günden eski gün sayılmaz');
  assert.equal(isActiveCitizen({ uretim: { activeDays: gunler } }, now, 3), true, '3 gün ≥ eşik(3) → aktif');
  assert.equal(isActiveCitizen({ uretim: { activeDays: [today] } }, now, 3), false, '1 gün < eşik(3) → aktif değil');
  ok('saf fonksiyonlar: son 7 gün sayımı ve eşik karşılaştırması doğru');
}

// 2) Sunucu: kapı publicSummary() "active" sayısını hesaplar; yalnız gerçekten eşiği geçen vatandaş sayılır
{
  const db = openDb(':memory:');
  const E = await createEngine(db, { testMode: true });
  const clock = () => now;
  const cfg = { ...loadConfig({}), dbFile: ':memory:' };
  const kapi = createKapi({ db, engine: E, cfg, clock, log: { warn() {}, error() {} } });

  const aktif = '0x' + 'c3'.repeat(20);   // son 7 günde 4 gün sefer tamamlamış
  const pasif = '0x' + 'd4'.repeat(20);   // son 7 günde 1 gün sefer tamamlamış (eşiğin altında)
  const hicOynmamis = '0x' + 'e5'.repeat(20); // hiç sefer tamamlamamış (uretim alanı yok)
  for (const a of [aktif, pasif, hicOynmamis]) { db.q.playerAdd.run(a, now, now); E.withPlayer(a, () => null); kapi.admit(a); }
  E.mutatePlayer(aktif, gs => { gs.state.uretim = { epochId: 1, used: {}, since: now - 10 * DAY, activeDays: [today, today - 2, today - 4, today - 6] }; });
  E.mutatePlayer(pasif, gs => { gs.state.uretim = { epochId: 1, used: {}, since: now - 10 * DAY, activeDays: [today - 6] }; });
  // hicOynmamis: gs.state.uretim hiç kurulmadı → activeDaysInLast7 güvenle 0 döner (çökme yok)

  kapi.run();   // activeCitizens() hesaplayıp dünya durumuna yazar
  const ozet = kapi.publicSummary();
  assert.equal(ozet.citizens, 3, '3 vatandaş var');
  assert.equal(ozet.active, 1, 'yalnız eşiği (3 gün) geçen oyuncu aktif sayılır');
  assert.equal(ozet.activeDays, 3, 'gösterge eşiği config ile aynı (KAPI.ACTIVE_DAYS_PER_WEEK)');
  ok('kapı publicSummary(): aktif vatandaş sayısı yalnız gerçekten sefer tamamlayanları sayar');
}

console.log(`\n${passed}/2 aktiflik kontrolü geçti`);
