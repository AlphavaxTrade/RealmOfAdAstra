// Geçiş 011 (19 Ekim 2026): piyango kasası 4 M'de bırakılır, fazlası dünya bossu / Kolezyum / zindan kasalarına eşit bölünür; toplam korunur.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { gecisleriCalistir } from '../server/gecis/index.js';
import { GECISLER } from '../server/gecis/liste.js';

const oncekiler = GECISLER.filter((g) => g.surum < 11);
const kur = (piyango, hazine) => {
  const d = new DatabaseSync(':memory:');
  gecisleriCalistir(d, { gecisler: oncekiler });
  const yaz = (k, v) => d.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run(k, JSON.stringify(v));
  if (piyango) yaz('world:lottery', piyango);
  if (hazine) yaz('ls:adastra_treasury_ledger_v4', hazine);
  return d;
};
const oku = (d, k) => { const r = d.prepare('SELECT value FROM kv WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const hazine = () => ({ pools: { dungeon: 10000000, arena: 4000000, worldBoss: 6000000, quest: 8000000 }, inflow: { dungeon: 5 }, outflow: {}, lifetimeDeposited: 100 });
const topla = (p) => Object.values(p).reduce((s, v) => s + v, 0);

// 1) 20 M'lik kasa: 4 M kalır, 16 M üçe bölünür, toplam korunur
{
  const d = kur({ pool: 20000000, amortiPool: 123, totalTickets: 7 }, hazine());
  const once = topla(hazine().pools) + 20000000;
  assert.deepEqual(gecisleriCalistir(d).uygulanan, [11]);
  const L = oku(d, 'world:lottery'); const H = oku(d, 'ls:adastra_treasury_ledger_v4');
  assert.equal(L.pool, 4000000);
  assert.equal(L.amortiPool, 123, 'amorti kasası ve bilet sayısı değişmez');
  assert.equal(L.totalTickets, 7);
  const fark = (id, eski) => Math.round((H.pools[id] - eski) * 100) / 100;
  assert.equal(fark('worldBoss', 6000000), 5333333.33);
  assert.equal(fark('arena', 4000000), 5333333.33);
  assert.equal(fark('dungeon', 10000000), 5333333.34, 'kuruş farkı son kasaya');
  assert.equal(H.pools.quest, 8000000, 'diğer kasalara dokunulmaz');
  assert.equal(Math.round((topla(H.pools) + L.pool - once) * 100), 0, 'toplam ASTRA korundu');
  assert.equal(Math.round((H.lifetimeDeposited - 100) * 100) / 100, 16000000);
  assert.equal(Math.round((H.inflow.dungeon - 5) * 100) / 100, 5333333.34);
  // ikinci çalıştırma zararsız (geçiş tek seferlik)
  assert.deepEqual(gecisleriCalistir(d).uygulanan, []);
  assert.equal(oku(d, 'world:lottery').pool, 4000000);
}

// 2) Kasa zaten 4 M ya da altında: hiçbir şey değişmez
for (const havuz of [4000000, 3000000]) {
  const d = kur({ pool: havuz, amortiPool: 0, totalTickets: 0 }, hazine());
  gecisleriCalistir(d);
  assert.equal(oku(d, 'world:lottery').pool, havuz);
  assert.deepEqual(oku(d, 'ls:adastra_treasury_ledger_v4').pools, hazine().pools);
}

// 3) Dünya ya da hazine kaydı yoksa (yeni dünya) hata vermez, bir şey yazmaz
for (const [p, h] of [[null, null], [{ pool: 9000000 }, null], [null, hazine()]]) {
  const d = kur(p, h);
  assert.deepEqual(gecisleriCalistir(d).uygulanan, [11]);
  assert.deepEqual(oku(d, 'world:lottery'), p);
}
console.log('✅ geçiş 011: piyango kasası 4 M, fazlası üç kasaya eşit, toplam korunur, tek seferlik');
