// UOA tohumu (19 Ekim 2026, kullanıcı kararı): oyunda harcanan her ASTRA'nın %4'ü ikinci oyun UOA için biriktirilir; kasa kilitlidir.
import assert from 'node:assert/strict';

const depo = new Map();
globalThis.localStorage = {
  getItem: (k) => (depo.has(k) ? depo.get(k) : null),
  setItem: (k, v) => { depo.set(k, String(v)); },
  removeItem: (k) => { depo.delete(k); }
};
const { GAME_CONFIG: C } = await import('../js/config.js');
const { treasury } = await import('../js/treasury.js');
const { globalPool } = await import('../js/globalPool.js');

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const yakin = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// 1) Yeni dünya: UOA tohumu 0, eski kasalar yok, toplam tohum 103,82 M
{
  treasury.reset();
  assert.equal(treasury.getPool('uoaTohum'), 0);
  assert.equal(treasury.state.pools.konsey, undefined);
  assert.equal(treasury.state.pools.universe, undefined);
  assert.equal(Object.values(treasury.state.pools).reduce((s, v) => s + v, 0), 103820000);
  ok('yeni dünya: UOA tohumu 0, Konsey/Universe kasası yok, toplam 103,82 M');
}

// 2) Ortak dağılım: harcamanın %4,0'ı UOA tohumuna (%86 × 465/10000)
{
  treasury.reset();
  const once = treasury.getPool('uoaTohum');
  globalPool.recordTokenSpend(1000000);
  assert.ok(yakin(treasury.getPool('uoaTohum') - once, 1000000 * C.TOKEN_REWARD_POOL_RATE * C.TREASURY_ALLOCATION.uoaTohum, 1e-3));
  assert.ok(Math.abs((treasury.getPool('uoaTohum') - once) / 1000000 - 0.04) < 0.0005, 'harcamanın ~%4\'ü');
  ok('ortak dağılım: harcamanın %4\'ü UOA tohumuna girer');
}

// 3) Doğrudan paylı harcama (zindan, çark, kolezyum): önce %4 UOA tohumuna, kalanı kasaya
{
  for (const kasa of ['dungeon', 'carnival', 'arena']) {
    treasury.reset();
    const k0 = treasury.getPool(kasa), u0 = treasury.getPool('uoaTohum');
    const girenKasa = treasury.depositDirect(kasa, 100000);
    assert.ok(yakin(treasury.getPool('uoaTohum') - u0, 4000, 1e-6), `${kasa}: 100.000 ASTRA'nın 4.000'i UOA tohumuna`);
    assert.ok(yakin(girenKasa, 96000));
    assert.ok(yakin(treasury.getPool(kasa) - k0, 96000, 1e-3), `${kasa}: kalan 96.000 kasaya girer`);
  }
  ok('doğrudan paylı harcamada %4 UOA tohumuna ayrılır, kalan kasaya girer');
}

// 4) Kilitli: UOA tohumundan ödeme çıkmaz; eski kayıttaki artık kasalar yüklemede atılır
{
  treasury.reset();
  treasury.depositTo('uoaTohum', 1000);
  const r = treasury.withdraw('uoaTohum', 500);
  assert.equal(r.granted, 0, 'kilitli kasadan ödeme yok');
  assert.equal(treasury.getPool('uoaTohum'), 1000);
  treasury.state.pools.konsey = 5; treasury.state.pools.universe = 7;
  treasury.save && treasury.save();
  const yuklenen = treasury.load();
  assert.equal(yuklenen.pools.konsey, undefined, 'eski konsey kasası yüklenmez');
  assert.equal(yuklenen.pools.universe, undefined, 'eski universe kasası yüklenmez');
  treasury.reset();
  ok('UOA tohumu kilitli; eski kasa anahtarları yüklemede atılır');
}

console.log(`\n${n} UOA tohumu kontrolü geçti.`);
