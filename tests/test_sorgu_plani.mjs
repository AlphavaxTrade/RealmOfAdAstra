// Sorgu planı kapısı (kurumsal A5.5): server/ altındaki hiçbir sabit SQL, ÖNCEDEN İNCELENİP NEDENİ YAZILMAMIŞ bir tam tablo taraması yapmamalı.
// Yeni bir sorgu tabloyu baştan sona tarıyorsa bu test kırılır: ya indeks ekle (yeni geçiş) ya da scripts/db/tarama-izin.json'a NEDENİYLE ekle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { rapor, sorgulariBul, planOzeti } from '../scripts/db/sorgu-plani.mjs';
import { gecisleriCalistir } from '../server/gecis/index.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

// 1) AST ile SQL bulma: .prepare('..'), şablon metin, prep('ad','..'); dinamik SQL atlanır
{
  const kod = `
    const a = db.prepare('SELECT 1 FROM kv WHERE key = ?');
    const b = db.raw.prepare(\`UPDATE kv SET value = ?
        WHERE key = ?\`);
    prep('x', 'DELETE FROM sessions WHERE expires < ?');
    const c = db.prepare('SELECT ' + kolon + ' FROM t');
    const d = db.prepare(\`SELECT \${kolon} FROM t\`);
    db.exec('CREATE TABLE z (a)');`;
  const r = sorgulariBul(kod);
  assert.deepEqual(r.map(x => x.sql), ['SELECT 1 FROM kv WHERE key = ?', 'UPDATE kv SET value = ? WHERE key = ?', 'DELETE FROM sessions WHERE expires < ?']);
  assert.deepEqual(r.map(x => x.satir), [2, 3, 5]);
  ok('sorgu bulma: prepare / şablon metin / prep yardımcısı; dinamik SQL atlanır');
}

// 2) Plan özeti: indeksli sorgu taramaz, indekssiz tarar
{
  const d = new DatabaseSync(':memory:');
  d.exec('CREATE TABLE t (a INTEGER, b INTEGER); CREATE INDEX t_a ON t (a)');
  assert.equal(planOzeti(d, 'SELECT * FROM t WHERE a = ?').tarama.length, 0);
  assert.equal(planOzeti(d, 'SELECT * FROM t WHERE b = ?').tarama.length, 1);
  ok('plan özeti: indeksli = arama, indekssiz = tam tarama');
}

// 3) Gerçek sorgular: hepsinin planı alınabilir; tam tarayanlar yalnız İZİNLİ ve NEDENLİ olanlar
{
  const izin = JSON.parse(fs.readFileSync(path.join(kok, 'scripts/db/tarama-izin.json'), 'utf8'));
  for (const i of izin) assert.ok(i.neden && i.neden.length > 15, 'izinli taramanın nedeni yazılı olmalı: ' + i.sql.slice(0, 50));
  const hepsi = rapor();
  assert.ok(hepsi.length > 80, 'sorgu bulunamadı mı? ' + hepsi.length);
  assert.deepEqual(hepsi.filter(b => b.hata).map(b => `${b.dosya}:${b.satir} ${b.hata}`), [], 'planı alınamayan sorgu var');
  const tarayan = hepsi.filter(b => b.tarama && b.tarama.length);
  const izinSql = new Set(izin.map(i => i.sql));
  const izinsiz = tarayan.filter(b => !izinSql.has(b.sql));
  assert.deepEqual(izinsiz.map(b => `${b.dosya}:${b.satir}  ${b.sql.slice(0, 110)}  →  ${b.tarama.join(' | ')}`), [],
    'İNCELENMEMİŞ tam tablo taraması: indeks ekle (yeni gecis/NNN) ya da scripts/db/tarama-izin.json\'a nedeniyle ekle');
  const bayat = izin.filter(i => !tarayan.some(b => b.sql === i.sql));
  assert.deepEqual(bayat.map(i => i.sql.slice(0, 80)), [], 'izin listesinde artık taramayan/olmayan sorgu var: listeden çıkar');
  ok(`${hepsi.length} sorgunun planı alındı; ${tarayan.length} bilinçli tarama dışında tam tarama yok`);
}

// 4) Kritik sıcak yollar kesin olarak indeks kullanır (regresyon koruması)
{
  const d = new DatabaseSync(':memory:');
  gecisleriCalistir(d);
  const ara = (sql, beklenen) => { const p = planOzeti(d, sql); assert.equal(p.tarama.length, 0, sql + ' → ' + p.satirlar.join(' | ')); assert.ok(p.satirlar.some(s => s.includes(beklenen)), sql + ' → ' + p.satirlar.join(' | ') + ' (beklenen: ' + beklenen + ')'); };
  ara('DELETE FROM sessions WHERE expires < ?', 'sessions_bitis');
  ara('DELETE FROM sessions WHERE address = ?', 'sessions_adres');
  ara("SELECT * FROM payouts WHERE status = 'pending' ORDER BY id", 'payouts_durum_id');
  ara('SELECT * FROM payouts WHERE address = ? ORDER BY id DESC LIMIT 50', 'payouts_adres_id');
  ara('SELECT * FROM deposits WHERE address = ? ORDER BY block DESC LIMIT 50', 'deposits_adres_blok');
  ara("SELECT * FROM kasa_ops WHERE status = 'pending' ORDER BY id", 'kasa_ops_durum_id');
  ara('SELECT gate, COUNT(*) AS n FROM players WHERE banned = 0 GROUP BY gate', 'players_banned_gate');
  ara("DELETE FROM kv WHERE key >= 'pvp:match:' AND key < 'pvp:match;' AND CAST(substr(key, 11) AS INTEGER) <= ?", 'sqlite_autoindex_kv_1');
  ok('sıcak yollar (oturum, ödeme, yatırma, Kasa, kapı, maç temizliği) indeks kullanıyor');
}

console.log(`\n${passed}/4 sorgu planı testi geçti`);
