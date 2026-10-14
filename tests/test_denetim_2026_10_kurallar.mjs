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

// (Bot ↔ elle alım) Oyuncu pazardan bir kaynak aldıysa bot o kaynağı 2 dakika satmaz; yoksa "Eksikleri al ve döv" akışında bot
// satın alınanı arada geri satıp işlemi "Yetersiz Demir" ile bozuyordu.
{
  const { GAME_CONFIG } = await import('../js/config.js');
  const { ammMarket } = await import('../js/ammMarket.js');
  const { globalPool } = await import('../js/globalPool.js');
  const { treasury } = await import('../js/treasury.js');
  depo.clear(); ammMarket.resetPools(); globalPool.vanillaReset(); treasury.reset();
  const gs = new GameStateManager();
  let T = 1_800_000_000_000;
  gs._now = () => T;
  gs.state.level = 8; gs.state.warehouseLevel = 6; gs.state.adAstraBalance = 100000;
  for (const k of GAME_CONFIG.RESOURCE_KEYS) gs.state.inventory[k] = 50;
  const demirOnce = gs.state.inventory.iron;
  const al = gs.marketBuy('iron', 5);
  assert.equal(al.success, true, 'alım başarılı: ' + al.message);
  assert.equal(gs._botKaynakSat('iron', 3), null, 'elle alınan kaynağı bot satmaz');
  assert.ok(gs.state.inventory.iron >= demirOnce + 5, 'alınan demir yerinde duruyor');
  assert.ok(gs._botKaynakSat('wood', 3), 'başka kaynakta koruma yok');
  T += 121_000;
  assert.ok(gs._botKaynakSat('iron', 3), '2 dakika sonra bot yine satabilir');
  ok('Bot elle alınan kaynağı 2 dakika satmaz; diğer kaynaklar ve süre sonrası etkilenmez');
}
