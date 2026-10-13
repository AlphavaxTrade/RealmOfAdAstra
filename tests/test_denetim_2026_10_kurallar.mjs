// 13 Ekim 2026 denetiminin oyun kuralı / yükleme tarafı gerileme testleri.
// (QA-13) Yerel kayıtta soldierUnits içinde null gibi nesne olmayan öğeler varsa oyun hiç açılmıyordu
// ("Cannot read properties of null (reading 'level')", sayfa sonsuza dek boş iskelet).
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GameStateManager } = await import('../js/gameState.js');
const ok = (ad) => console.log(`✅ ${ad}`);

{
  const gs = new GameStateManager();
  const r = gs.mergeSoldierUnits([null, 5, 'x', undefined, { level: 3, name: 'Kaan' }, []]);
  assert.ok(Array.isArray(r));
  assert.equal(r.filter((s) => s && s.name === 'Kaan').length, 1, 'geçerli asker korunur');
  assert.ok(r.every((s) => s && typeof s === 'object' && s.id), 'bozuk öğeler atlanır, çıktıdaki her asker tam kayıt');
  assert.deepEqual(gs.mergeSoldierUnits([null]), [], 'yalnız bozuk öğe varsa boş liste, hata yok');
  ok('QA-13: soldierUnits içindeki null/sayı/yazı öğeleri atlanıyor, geçerli asker korunuyor');
}

{
  // Tam yükleme yolu: bozuk kayıtla oyun açılabilmeli
  depo.clear();
  const ilk = new GameStateManager();
  ilk.saveState();
  const anahtar = 'adastra_player_save_v6';
  assert.ok(anahtar, 'kayıt anahtarı bulundu: ' + [...depo.keys()].join(','));
  const kayit = JSON.parse(depo.get(anahtar));
  const hedef = kayit.state || kayit;
  hedef.soldierUnits = [null, { level: 2, name: 'Berk' }];
  depo.set(anahtar, JSON.stringify(kayit));
  let gs;
  assert.doesNotThrow(() => { gs = new GameStateManager(); }, 'bozuk soldierUnits ile oyun açılmalı');
  assert.ok(gs && gs.state, 'durum kuruldu');
  ok('QA-13: bozuk soldierUnits içeren kayıtla oyun açılıyor');
}
