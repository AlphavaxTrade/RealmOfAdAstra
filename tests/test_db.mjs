// server/db.js: anahtar-değer deposu, işlem (tx) geri alma, dosya kaydı (WAL), kapanış (kurumsal A3.3)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';

let passed = 0;
const ok = n => { passed++; console.log(`✅ ${n}`); };

// 1) kv: yaz, oku, üzerine yaz, sil, JSON; bozuk JSON varsayılana düşer
{
  const db = openDb(':memory:');
  assert.equal(db.kvGet('yok'), null);
  db.kvSet('a', 5);
  assert.equal(db.kvGet('a'), '5', 'değerler metin saklanır');
  db.kvSet('a', 'yeni');
  assert.equal(db.kvGet('a'), 'yeni', 'üzerine yazar');
  db.kvDel('a');
  assert.equal(db.kvGet('a'), null);
  db.kvSetJson('j', { x: [1, 2], y: 'ş' });
  assert.deepEqual(db.kvJson('j'), { x: [1, 2], y: 'ş' });
  assert.equal(db.kvJson('yok', 'varsayilan'), 'varsayilan');
  db.kvSet('bozuk', '{kapanmamis');
  assert.deepEqual(db.kvJson('bozuk', { ok: true }), { ok: true }, 'bozuk JSON varsayılana düşer, çökmez');
  db.close();
  ok('kv: yaz/oku/sil/JSON, bozuk JSON varsayılana düşer');
}

// 2) tx: ya hep ya hiç; hata dışarı fırlar; sonuç döner
{
  const db = openDb(':memory:');
  assert.equal(db.tx(() => { db.kvSet('t1', 'a'); db.kvSet('t2', 'b'); return 42; }), 42);
  assert.equal(db.kvGet('t2'), 'b');
  assert.throws(() => db.tx(() => { db.kvSet('t3', 'c'); db.kvSet('t4', 'd'); throw new Error('ortada patladi'); }), /ortada patladi/);
  assert.equal(db.kvGet('t3'), null, 'hata olunca işlemdeki bütün yazmalar geri alınır');
  assert.equal(db.kvGet('t4'), null);
  assert.equal(db.kvGet('t1'), 'a', 'önceki başarılı işlem durur');
  db.kvSet('sonra', 'calisir');
  assert.equal(db.kvGet('sonra'), 'calisir', 'geri alma sonrası bağlantı sağlam');
  db.close();
  ok('tx: hata olunca tümü geri alınır, sonuç döner, bağlantı sağlam kalır');
}

// 3) Dosya kaydı: klasör kendiliğinden açılır, WAL modu, kapat-aç sonrası veri durur
{
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
  const dosya = path.join(kok, 'alt', 'klasor', 'realm.db');
  try {
    const db = openDb(dosya);
    assert.equal(db.raw.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    db.kvSet('kalici', 'evet');
    db.event('deneme', 'acc:1', { n: 1 });
    db.close();
    const db2 = openDb(dosya);
    assert.equal(db2.kvGet('kalici'), 'evet', 'kapat-aç sonrası veri duruyor');
    assert.equal(db2.q.eventsRecent.all(5).length, 1);
    db2.close();
    ok('dosya kaydı: klasör açılır, WAL, veri kalıcı');
  } finally { fs.rmSync(kok, { recursive: true, force: true }); }
}

// 4) Şema: beklenen tablolar var; yeniden açmak (idempotent) hata vermez
{
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
  const dosya = path.join(kok, 'realm.db');
  try {
    openDb(dosya).close();
    const db = openDb(dosya);
    const tablolar = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
    for (const t of ['kv', 'players', 'nonces', 'sessions', 'deposits', 'payouts', 'withdraw_log', 'prices', 'events']) assert.ok(tablolar.includes(t), 'tablo yok: ' + t);
    const kolonlar = db.raw.prepare('PRAGMA table_info(payouts)').all().map(r => r.name);
    assert.ok(kolonlar.includes('raw_tx') && kolonlar.includes('tx_nonce'), 'eski dosyalara eklenen sütunlar var');
    db.close();
    ok('şema tam ve yeniden açmak güvenli');
  } finally { fs.rmSync(kok, { recursive: true, force: true }); }
}

console.log(`\n${passed}/4 veritabanı testi geçti`);
