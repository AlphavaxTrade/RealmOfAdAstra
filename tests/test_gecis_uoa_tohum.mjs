// Geçiş 014 (19 Ekim 2026): Universe rezervi ödeme kapasitesiyle, Konsey kasası eşit dağıtılır; UOA tohumu 0 ile açılır; toplam korunur.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { gecisleriCalistir } from '../server/gecis/index.js';
import { GECISLER } from '../server/gecis/liste.js';

const once = GECISLER.filter((g) => g.surum < 14);
const kur = (hazine) => {
  const d = new DatabaseSync(':memory:');
  gecisleriCalistir(d, { gecisler: once });
  if (hazine) d.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run('ls:adastra_treasury_ledger_v4', JSON.stringify(hazine));
  return d;
};
const oku = (d) => { const r = d.prepare('SELECT value FROM kv WHERE key = ?').get('ls:adastra_treasury_ledger_v4'); return r ? JSON.parse(r.value) : null; };
const topla = (p) => Object.values(p).reduce((s, v) => s + v, 0);
const hazine = () => ({
  pools: { dungeon: 1000, arena: 2000, worldBoss: 3000, ammBuyback: 4000, quest: 5000, carnival: 6000, fatih: 7000, konsey: 10000000, universe: 20000000 },
  inflow: { dungeon: 5, konsey: 1 }, outflow: {}, lifetimeDeposited: 100
});

// 1) Dağıtım: Universe kapasiteyle orantılı, Konsey eşit; toplam korunur; eski anahtarlar silinir; UOA tohumu 0
{
  const d = kur(hazine());
  const onceToplam = topla(hazine().pools);
  assert.deepEqual(gecisleriCalistir(d, { gecisler: GECISLER }).uygulanan, [14]);
  const H = oku(d);
  assert.equal('konsey' in H.pools, false);
  assert.equal('universe' in H.pools, false);
  assert.equal(H.pools.uoaTohum, 0);
  assert.equal(Math.round((topla(H.pools) - onceToplam) * 100), 0, 'toplam ASTRA korundu');
  assert.equal(H.pools.arena - 2000, 1939000 + 1428571.42, 'arena: Universe payı + Konsey eşit payı');
  assert.equal(H.pools.fatih - 7000, 1428571.42, "Fatih yalnız Konsey'den eşit pay alır (Universe'ten almaz)");
  assert.equal(H.lifetimeDeposited, 100, 'iç aktarım: toplam yatırım değişmez');
  assert.equal(H.inflow.konsey, undefined);
  assert.deepEqual(gecisleriCalistir(d, { gecisler: GECISLER }).uygulanan, [], 'ikinci çalıştırma zararsız');
}

// 2) Hazine kaydı yoksa (yeni dünya) hata vermez, bir şey yazmaz
{
  const d = kur(null);
  assert.deepEqual(gecisleriCalistir(d, { gecisler: GECISLER }).uygulanan, [14]);
  assert.equal(oku(d), null);
}

// 3) Zaten yeni biçimli kayıt değişmez
{
  const yeni = { pools: { dungeon: 5, uoaTohum: 12 }, inflow: {}, outflow: {}, lifetimeDeposited: 0 };
  const d = kur(yeni);
  gecisleriCalistir(d, { gecisler: GECISLER });
  assert.deepEqual(oku(d).pools, yeni.pools);
}
console.log('✅ geçiş 014: Universe kapasiteyle, Konsey eşit dağıtıldı; UOA tohumu 0; toplam korundu; tek seferlik');
