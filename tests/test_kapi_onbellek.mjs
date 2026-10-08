// Kapı sayımı önbelleği (kurumsal A4.5): her istekte çalışan "kaç vatandaş / kaç sıra" sorgusu (oyuncu sayısıyla orantılı yavaşlar)
// yalnız EKRANDA gösterilen sayılar için kısa süreli önbellekten gelir; kapı her değiştiğinde önbellek anında geçersiz olur.
// Karar veren yerler (admit, fillSeats) her zaman KESİN sayımı kullanır.
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEngine } from '../server/engine.js';
import { createKapi } from '../server/kapi.js';
import { loadConfig } from '../server/config.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

const db = openDb(':memory:');
// Sayım sorgusunun kaç kez çalıştığını say (hazırlanan her ifadeyi sar)
let sayimSorgusu = 0;
const hazirla = db.raw.prepare.bind(db.raw);
db.raw.prepare = sql => {
  const st = hazirla(sql);
  if (/GROUP BY gate/.test(sql)) { const tum = st.all.bind(st); st.all = (...a) => { sayimSorgusu++; return tum(...a); }; }
  return st;
};
const engine = await createEngine(db, { testMode: true });
engine.GAME_CONFIG.KAPI.START_LIMIT = 2;
let T = Date.UTC(2026, 9, 8, 12);
const cfg = { ...loadConfig({}), dbFile: ':memory:', testMode: true };
const kapi = createKapi({ db, engine, accounts: null, mailer: null, cfg, clock: () => T, log: { log() {}, warn() {}, error() {} } });
const kisi = i => { const a = 'acc:' + i; db.q.playerAdd.run(a, T, T); return a; };

// 1) Aynı anda yüzlerce görüntüleme: sayım sorgusu bir kez çalışır
{
  const a = kisi(1);
  kapi.admit(a);
  sayimSorgusu = 0;
  for (let i = 0; i < 200; i++) { kapi.statusOf(a); kapi.publicSummary(); }
  assert.ok(sayimSorgusu <= 1, `200 görüntülemede sayım sorgusu ${sayimSorgusu} kez çalıştı (en çok 1 beklenir)`);
  ok('200 görüntüleme tek sayım sorgusuyla karşılanır');
}

// 2) Kapı değişince önbellek anında geçersiz olur (zaman ilerlemeden bile)
{
  const b = kisi(2), c = kisi(3);
  assert.equal(kapi.publicSummary().citizens, 1);
  kapi.admit(b);   // 2. vatandaş (sınır 2)
  assert.equal(kapi.publicSummary().citizens, 2, 'yeni vatandaş sayıma hemen yansır');
  kapi.admit(c);   // sınır dolu: sıraya girer
  const s = kapi.publicSummary();
  assert.deepEqual([s.citizens, s.waiting], [2, 1], 'bekleyen sayısı hemen yansır');
  assert.equal(kapi.statusOf(c).status, 'waiting');
  assert.equal(kapi.statusOf(c).position, 1);
  kapi.adminSetPlayer(c, 'suspended');
  const s2 = kapi.publicSummary();
  assert.deepEqual([s2.waiting, s2.suspended], [0, 1], 'yönetici değişikliği hemen yansır');
  ok('kapı değişince sayılar anında güncellenir (önbellek geçersiz olur)');
}

// 3) Karar veren yol KESİN sayımı kullanır: önbellek eskimişken bile sınır aşılmaz
{
  const d = kisi(4), e = kisi(5);
  kapi.adminSet({ limit: 100 });
  sayimSorgusu = 0;
  kapi.publicSummary();   // önbelleği doldur (sınır 100, vatandaş 2)
  kapi.adminSet({ limit: 2 });   // sınır düşer; vatandaşlar 2
  assert.equal(kapi.admit(d).status, 'waiting', 'sınır doluyken yeni hesap sıraya girer (önbelleğe değil kesin sayıma bakılır)');
  assert.equal(kapi.admit(e).status, 'waiting');
  ok('karar veren yollar kesin sayım kullanır; sınır aşılmaz');
}

// 4) Süre dolunca (2 sn) yeniden sayılır: dışarıdan eklenen kayıtlar da görünür
{
  const sayim0 = sayimSorgusu;
  kapi.publicSummary();
  T += 2500;
  db.raw.prepare("UPDATE players SET gate = 'waiting' WHERE address = ?").run('acc:1');   // kapı dışından (ör. başka süreç) değişiklik
  kapi.publicSummary();
  assert.ok(sayimSorgusu > sayim0, 'süre dolunca yeniden sayılmalı');
  ok('önbellek 2 saniye sonra kendiliğinden tazelenir');
}

console.log(`\n${passed}/4 kapı önbelleği testi geçti`);
