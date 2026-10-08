// Şema geçişleri (kurumsal A5.4): boş dosya ve ESKİ dosya aynı son şemaya varır; tekrar çalıştırma zararsız; yarıda patlayan
// geçiş geri alınır; yeni dosya eski uygulamayla açılmaz; uygulanmış geçişler mühürlüdür (değiştirilemez).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { gecisleriCalistir } from '../server/gecis/index.js';
import { GECISLER } from '../server/gecis/liste.js';
import { kolonEkle, kolonVarMi } from '../server/gecis/kolon.js';
import { openDb } from '../server/db.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

// Bir veritabanının şema parmak izi: tablo → sütunlar (sırayla, tür/zorunluluk/varsayılan) + indeks adları
function sema(db) {
  const tablolar = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  const out = {};
  for (const t of tablolar) out[t] = db.prepare(`PRAGMA table_info(${t})`).all().map(c => `${c.name}:${c.type}:${c.notnull}:${c.dflt_value}:${c.pk}`);
  const indeksler = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => `${r.tbl_name}.${r.name}`);
  return { out, indeksler };
}
const bos = () => { const d = new DatabaseSync(':memory:'); gecisleriCalistir(d); return d; };
const eski = () => { const d = new DatabaseSync(':memory:'); d.exec(fs.readFileSync(path.join(kok, 'tests/fixtures/eski_sema.sql'), 'utf8')); return d; };

// 1) Boş dosya: bütün tablolar kurulur, geçişler kaydedilir
{
  const d = new DatabaseSync(':memory:');
  const r = gecisleriCalistir(d);
  assert.deepEqual(r.uygulanan, GECISLER.map(g => g.surum));
  const tablolar = Object.keys(sema(d).out);
  for (const t of ['kv', 'players', 'sessions', 'payouts', 'accounts', 'kasa', 'kasa_ops', 'pay_quotes', 'listings', 'promo_codes', 'partner_income', 'schema_migrations']) assert.ok(tablolar.includes(t), 'tablo yok: ' + t);
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, GECISLER.length);
  ok('boş dosya: bütün tablolar kurulur, geçişler kaydedilir');
}

// 2) ESKİ dosya aynı son şemaya gelir; veri korunur; düz oturum anahtarı özetlenir
{
  const e = eski(), y = bos();
  assert.ok(!kolonVarMi(e, 'players', 'gate'), 'eski dosyada gate sütunu yok');
  gecisleriCalistir(e);
  assert.deepEqual(sema(e), sema(y), 'eski dosya geçişten sonra boş dosyayla AYNI şemada olmalı');
  assert.equal(e.prepare('SELECT amount FROM payouts WHERE epoch = 3').get().amount, 12.5, 'eski ödeme verisi durur');
  assert.equal(e.prepare("SELECT email FROM accounts WHERE id = 1").get().email, 'eski@ornek.com');
  assert.equal(e.prepare("SELECT gate FROM players WHERE address = 'acc:1'").get().gate, 'new', 'eski oyuncu yeni sütunun varsayılanını alır');
  const t = e.prepare('SELECT token FROM sessions').get().token;
  assert.equal(t, crypto.createHash('sha256').update('duz-oturum-anahtari').digest('hex'), 'düz oturum anahtarı özetlendi');
  ok('eski sunucu dosyası geçişlerle boş dosyayla aynı şemaya gelir (veri korunur, oturum özetlenir)');
}

// 3) Tekrar çalıştırma zararsız
{
  const d = bos();
  const once = sema(d);
  const r = gecisleriCalistir(d);
  assert.deepEqual(r.uygulanan, []);
  assert.deepEqual(sema(d), once);
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, GECISLER.length);
  ok('tekrar çalıştırma hiçbir şeyi değiştirmez');
}

// 4) Yarıda patlayan geçiş tamamen geri alınır; kayıt tutulmaz; hata hangi geçiş olduğunu söyler
{
  const d = new DatabaseSync(':memory:');
  const iyi = { surum: 1, ad: 'iyi', up: db => db.exec('CREATE TABLE a (x INTEGER)') };
  const kotu = { surum: 2, ad: 'kotu', up: db => { db.exec('CREATE TABLE b (x INTEGER)'); db.exec('INSERT INTO yok_tablo VALUES (1)'); } };
  assert.throws(() => gecisleriCalistir(d, { gecisler: [iyi, kotu] }), /002_kotu başarısız, geri alındı/);
  const tablolar = d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
  assert.ok(tablolar.includes('a'), 'başarılı geçiş kalır');
  assert.ok(!tablolar.includes('b'), 'patlayan geçişin yarım kalan CREATE TABLE\'ı geri alındı');
  assert.deepEqual(d.prepare('SELECT surum FROM schema_migrations').all().map(r => r.surum), [1], 'patlayan geçiş kaydedilmedi');
  // Düzeltilmiş geçişle devam edilebilir
  const duzgun = { surum: 2, ad: 'kotu', up: db => db.exec('CREATE TABLE b (x INTEGER)') };
  assert.deepEqual(gecisleriCalistir(d, { gecisler: [iyi, duzgun] }).uygulanan, [2]);
  ok('yarıda patlayan geçiş geri alınır; düzeltilince kaldığı yerden devam eder');
}

// 5) Koruma: veritabanı uygulamadan YENİ ise ya da uygulanmış geçişin adı değişmişse açık hata
{
  const d = bos();
  d.prepare("INSERT INTO schema_migrations VALUES (99, 'gelecek', 0)").run();
  assert.throws(() => gecisleriCalistir(d), /daha YENİ bir şema sürümünde/);
  const d2 = bos();
  d2.prepare("UPDATE schema_migrations SET ad = 'baska_ad' WHERE surum = 1").run();
  assert.throws(() => gecisleriCalistir(d2), /adı değişmiş/);
  assert.throws(() => gecisleriCalistir(new DatabaseSync(':memory:'), { gecisler: [{ surum: 1, ad: 'a', up() {} }, { surum: 1, ad: 'b', up() {} }] }), /iki kez/);
  ok('yeni şemalı dosya eski uygulamayla açılmaz; yeniden adlandırılan/çakışan geçiş reddedilir');
}

// 6) MÜHÜR: uygulanmış geçiş dosyaları değiştirilemez (içeriğin SHA-256 özeti kayıtlı; satır sonu farkları sayılmaz)
{
  const muhurYolu = path.join(kok, 'server/gecis/MUHUR.json');
  const muhur = JSON.parse(fs.readFileSync(muhurYolu, 'utf8'));
  const ozet = dosya => crypto.createHash('sha256').update(fs.readFileSync(path.join(kok, 'server/gecis', dosya), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
  const dosyalar = fs.readdirSync(path.join(kok, 'server/gecis')).filter(f => /^\d{3}_.*\.js$/.test(f)).sort();
  assert.deepEqual(dosyalar.map(f => f.slice(0, 3)), GECISLER.map(g => String(g.surum).padStart(3, '0')), 'liste.js ile klasördeki geçiş dosyaları uyuşmalı');
  for (const f of dosyalar) {
    if (!muhur[f]) throw new Error(`${f} mühürlenmemiş: yeni geçiş eklediysen server/gecis/MUHUR.json'a özetini ekle (node -e ile ya da test çıktısındaki özet): ${ozet(f)}`);
    assert.equal(muhur[f], ozet(f), `${f} UYGULANMIŞ olabilecek bir geçiş ve DEĞİŞTİRİLDİ. Geçişler değişmez: yeni numaralı bir geçiş ekle.`);
  }
  ok('uygulanmış geçiş dosyaları mühürlü (değiştirilemez)');
}

// 7) kolonEkle yardımcısı
{
  const d = new DatabaseSync(':memory:');
  d.exec('CREATE TABLE t (a INTEGER)');
  assert.equal(kolonEkle(d, 't', "b TEXT NOT NULL DEFAULT 'x'"), true);
  assert.equal(kolonEkle(d, 't', "b TEXT NOT NULL DEFAULT 'x'"), false, 'ikinci kez eklemez');
  assert.ok(kolonVarMi(d, 't', 'b'));
  assert.throws(() => kolonEkle(d, 't; DROP TABLE t', 'c TEXT'), /Geçersiz/);
  assert.throws(() => kolonEkle(d, 't', 'c;DROP TABLE t TEXT'), /Geçersiz/);
  ok('kolonEkle: ekler, tekrar eklemez, geçersiz adı reddeder');
}

// 8) openDb geçişleri kendisi çalıştırır ve eski modüllerin kendi şema kodu kalmadı
{
  const d = openDb(':memory:');
  assert.equal(d.raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, GECISLER.length);
  assert.ok(kolonVarMi(d.raw, 'players', 'gate'));
  d.close();
  const dagnik = [];
  for (const dosya of ['server/accounts.js', 'server/kasa.js', 'server/payments.js', 'server/pazar.js', 'server/promo.js', 'server/kapi.js', 'server/db.js', 'server/world/ortakGelir.js']) {
    const kod = fs.readFileSync(path.join(kok, dosya), 'utf8');
    if (/CREATE TABLE|ALTER TABLE/.test(kod)) dagnik.push(dosya);
  }
  assert.deepEqual(dagnik, [], 'şema değişikliği yalnız server/gecis/ içinde olmalı; dağınık şema kodu: ' + dagnik.join(', '));
  ok('openDb geçişleri çalıştırır; şema kodu yalnız server/gecis/ içinde');
}

console.log(`\n${passed}/8 şema geçişi testi geçti`);
