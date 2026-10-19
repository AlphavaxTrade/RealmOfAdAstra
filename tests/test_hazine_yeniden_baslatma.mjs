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
  assert.deepEqual(gecisleriCalistir(d).uygulanan, [12]);
  const H = oku(d, 'ls:adastra_treasury_ledger_v4');
  assert.equal(H.pools.dungeon, 15333363.41);
  assert.equal(H.pools.arena, 9333363.41);
  assert.equal(H.pools.worldBoss, 11333363.41);
  assert.equal(H.pools.quest, 8000000, 'diğer kasalara dokunulmaz');
  const eklenen = Math.round((Object.values(H.pools).reduce((s, v) => s + v, 0) - once) * 100) / 100;
  assert.equal(eklenen, 8000090.23, 'eksik kalan toplam: 16.000.090,23 - 8.000.000');
  assert.equal(Math.round((H.lifetimeDeposited - 5) * 100) / 100, 8000090.23);
  assert.deepEqual(gecisleriCalistir(d).uygulanan, [], 'tek seferlik');
  // başka dünya: piyango bakiyesi farklı → dokunmaz
  const baska = kur({ pool: 4000000.5, amortiPool: 2.02, totalTickets: 94 }, etkilenen);
  gecisleriCalistir(baska);
  assert.equal(oku(baska, 'ls:adastra_treasury_ledger_v4').pools.dungeon, 12666667);
  // kayıtsız dünya
  const bos = new DatabaseSync(':memory:');
  gecisleriCalistir(bos);
  assert.deepEqual(gecisleriCalistir(bos).uygulanan, []);
  ok('geçiş 012: yalnız etkilenen dünyada eksik 8.000.090,23 ASTRA tamamlanır; tek seferlik');
}

console.log(`\n${n} hazine yeniden başlatma kontrolü geçti.`);
process.exit(0);
