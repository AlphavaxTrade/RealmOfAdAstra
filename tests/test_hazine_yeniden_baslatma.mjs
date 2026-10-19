// Sunucu yeniden başlayınca hazine defteri (kasa bakiyeleri) DİSKTEN okunur, tohuma dönmez (19 Ekim 2026 olayı).
// Eski hata: js/treasury.js, depolama taklidi kurulmadan önce (statik içe aktarma zinciriyle) tohumla oluşuyor ve engine.js'teki openWeekBudgets()
// bu tohum durumunu diske yazıp gerçek bakiyeleri siliyordu. Bu test aynı sırayı birebir kurar: önce server/engine.js statik içe aktarılır
// (js/treasury.js depolamasız oluşur), sonra createEngine çalışır.
// + Geçiş 012: 011'in canlıda eksik kalan yarısını yalnız etkilenen dünyada tamamlar.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { gecisleriCalistir } from '../server/gecis/index.js';
import { GECISLER } from '../server/gecis/liste.js';
import { createEngine } from '../server/engine.js';   // statik içe aktarma zinciri: treasury depolamasız oluşur (üretimdeki sıra)
import { openDb } from '../server/db.js';

let n = 0;
const ok = (ad) => { n++; console.log(`✅ ${ad}`); };
const hazine = (pools, ekstra = {}) => ({ pools, inflow: {}, outflow: {}, lifetimeDeposited: 0, ...ekstra });

// 1) Kayıtlı hazine bakiyeleri motor açılınca korunur
{
  const db = openDb(':memory:');   // açılışta geçişler çalışır (bellek içi: dosya kilidi sorunu yok)
  const kayitli = { dungeon: 12666673.4, arena: 6666659.3, worldBoss: 8666668.8, ammBuyback: 10910003.5, quest: 7999842.2, carnival: 6910000.9, fatih: 20000001.1, konsey: 10000001.1, universe: 20000000 };
  db.kvSetJson('ls:adastra_treasury_ledger_v4', hazine(kayitli, { lifetimeDeposited: 123 }));
  const E = await createEngine(db, { testMode: true });
  for (const [id, v] of Object.entries(kayitli)) assert.equal(E.treasury.state.pools[id], v, `${id} bakiyesi korunmalı (tohuma dönmemeli)`);
  assert.equal(E.treasury.state.lifetimeDeposited, 123);
  const diskte = JSON.parse(db.kvGet('ls:adastra_treasury_ledger_v4'));
  assert.equal(diskte.pools.quest, 7999842.2, 'diskteki kayıt da tohumla ezilmemeli');
  ok('hazine bakiyeleri yeniden başlatmada diskten okunur ve ezilmez');
}

// 2) Kayıt hiç yoksa (yeni dünya) tohumla başlar
{
  const db = openDb(':memory:');
  const E = await createEngine(db, { testMode: true });
  assert.equal(E.treasury.state.pools.dungeon, E.GAME_CONFIG.TREASURY_SEED.dungeon);
  ok('yeni dünya tohumla başlar');
}

// 3) Geçiş 012: yalnız olaydan etkilenen dünyayı onarır, toplamı doğru ekler, tek seferlik
{
  const oncekiler = GECISLER.filter((g) => g.surum < 12);
  const kur = (piyango, pools) => {
    const d = new DatabaseSync(':memory:');
    gecisleriCalistir(d, { gecisler: oncekiler });
    const yaz = (k, v) => d.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run(k, JSON.stringify(v));
    if (piyango) yaz('world:lottery', piyango);
    yaz('ls:adastra_treasury_ledger_v4', hazine(pools, { lifetimeDeposited: 5 }));
    return d;
  };
  const oku = (d, k) => JSON.parse(d.prepare('SELECT value FROM kv WHERE key = ?').get(k).value);
  const etkilenen = { dungeon: 12666667, arena: 6666667, worldBoss: 8666666, ammBuyback: 10910000, quest: 8000000, carnival: 6910000, fatih: 20000000, konsey: 10000000, universe: 20000000 };
  const d = kur({ pool: 4000000, amortiPool: 2.02, totalTickets: 94 }, etkilenen);
  const once = Object.values(etkilenen).reduce((s, v) => s + v, 0);
  const ile012 = GECISLER.filter((g) => g.surum <= 12);
  assert.deepEqual(gecisleriCalistir(d, { gecisler: ile012 }).uygulanan, [12]);
  const H = oku(d, 'ls:adastra_treasury_ledger_v4');
  assert.equal(H.pools.dungeon, 15333363.41);
  assert.equal(H.pools.arena, 9333363.41);
  assert.equal(H.pools.worldBoss, 11333363.41);
  assert.equal(H.pools.quest, 8000000, 'diğer kasalara dokunulmaz');
  const eklenen = Math.round((Object.values(H.pools).reduce((s, v) => s + v, 0) - once) * 100) / 100;
  assert.equal(eklenen, 8000090.23, 'eksik kalan toplam: 16.000.090,23 - 8.000.000');
  assert.equal(Math.round((H.lifetimeDeposited - 5) * 100) / 100, 8000090.23);
  assert.deepEqual(gecisleriCalistir(d, { gecisler: ile012 }).uygulanan, [], 'tek seferlik');
  // 013 düzeltilmiş dünyada (kasalar zaten 2,67 M yukarıda) hiçbir şey yapmaz
  assert.deepEqual(gecisleriCalistir(d).uygulanan, [13]);
  assert.equal(oku(d, 'ls:adastra_treasury_ledger_v4').pools.dungeon, 15333363.41, '013 düzeltilmiş dünyaya dokunmaz');
  // başka dünya: piyango bakiyesi farklı → dokunmaz
  const baska = kur({ pool: 4000000.5, amortiPool: 2.02, totalTickets: 94 }, etkilenen);
  gecisleriCalistir(baska, { gecisler: ile012 });
  assert.equal(oku(baska, 'ls:adastra_treasury_ledger_v4').pools.dungeon, 12666667);
  // kayıtsız dünya
  const bos = new DatabaseSync(':memory:');
  gecisleriCalistir(bos);
  assert.deepEqual(gecisleriCalistir(bos).uygulanan, []);
  ok('geçiş 012: yalnız etkilenen dünyada eksik 8.000.090,23 ASTRA tamamlanır; tek seferlik');
}

// 4) Geçiş 013: 012'nin kaçırdığı gerçek canlı durum (piyango 4.000.097, 193 bilet, kasalarda küçük farklar) onarılır; küçük farklar korunur; tek seferlik
{
  const oncekiler13 = GECISLER.filter((g) => g.surum < 13);
  const d = new DatabaseSync(':memory:');
  gecisleriCalistir(d, { gecisler: oncekiler13 });
  const yaz = (k, v) => d.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(k, JSON.stringify(v));
  yaz('world:lottery', { pool: 4000097.04, amortiPool: 4.02, totalTickets: 193 });
  yaz('ls:adastra_treasury_ledger_v4', hazine({ dungeon: 12667142, arena: 6666889, worldBoss: 8667062, ammBuyback: 10910489, quest: 8000303, carnival: 6910211, fatih: 20000116, konsey: 10000116, universe: 20000000 }));
  assert.deepEqual(gecisleriCalistir(d).uygulanan, [13]);
  const H = JSON.parse(d.prepare('SELECT value FROM kv WHERE key = ?').get('ls:adastra_treasury_ledger_v4').value);
  assert.equal(H.pools.dungeon, 12667142 + 2666696.41, 'küçük fark korunur, sabit tutar eklenir');
  assert.equal(H.pools.arena, 6666889 + 2666696.41);
  assert.equal(H.pools.worldBoss, 8667062 + 2666697.41);
  assert.equal(H.pools.quest, 8000303, 'diğer kasalara dokunulmaz');
  assert.deepEqual(gecisleriCalistir(d).uygulanan, [], 'tek seferlik');
  // bilet sayısı az (etkilenmemiş dünya): dokunmaz
  const e = new DatabaseSync(':memory:');
  gecisleriCalistir(e, { gecisler: oncekiler13 });
  e.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run('world:lottery', JSON.stringify({ pool: 4000000, amortiPool: 0, totalTickets: 3 }));
  e.prepare('INSERT INTO kv (key, value) VALUES (?, ?)').run('ls:adastra_treasury_ledger_v4', JSON.stringify(hazine({ dungeon: 12666667, arena: 6666667, worldBoss: 8666666 })));
  gecisleriCalistir(e);
  assert.equal(JSON.parse(e.prepare('SELECT value FROM kv WHERE key = ?').get('ls:adastra_treasury_ledger_v4').value).pools.dungeon, 12666667);
  ok('geçiş 013: canlıdaki gerçek durum (piyango 4.000.097, 193 bilet) onarılır, küçük farklar korunur, etkilenmemiş dünyaya dokunmaz');
}

console.log(`\n${n} hazine yeniden başlatma kontrolü geçti.`);
process.exit(0);
