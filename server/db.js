// Realm of AdAstra sunucusu — kayıt (tek dosyalık SQLite; Node'un kendi node:sqlite modülü, ek kurulum yok)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { gecisleriCalistir } from './gecis/index.js';

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  // WAL: okuyucular yazarı beklemez. NORMAL: her işlemde disk senkronu yok (işletim sistemi çökerse en çok son birkaç yazma kaybolur,
  // veritabanı bozulmaz). busy_timeout: yedek betiği ya da başka süreç kilit tutarken hemen "database is locked" yerine 5 sn bekle.
  // journal_size_limit: WAL dosyası kontrol noktasından sonra en çok 64 MB'a küçülür. temp_store: geçici sıralama tabloları bellekte.
  // cache_size (-KB): 64 MB sayfa önbelleği.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA journal_size_limit = 67108864; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -65536;');
  gecisleriCalistir(db);   // şema: server/gecis/ (sıralı, tek seferlik, işlem içinde; kurumsal A5)
  const q = {};
  const prep = (name, sql) => { q[name] = db.prepare(sql); };
  prep('kvGet', 'SELECT value FROM kv WHERE key = ?');
  prep('kvSet', 'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  prep('kvDel', 'DELETE FROM kv WHERE key = ?');
  prep('playerGet', 'SELECT * FROM players WHERE address = ?');
  prep('playerAdd', 'INSERT OR IGNORE INTO players (address, created_at, last_seen) VALUES (?, ?, ?)');
  prep('playerSeen', 'UPDATE players SET last_seen = ? WHERE address = ?');
  prep('playersAll', 'SELECT * FROM players WHERE banned = 0');
  prep('playerAddDeposit', 'UPDATE players SET deposited_ada = deposited_ada + ? WHERE address = ?');
  prep('playerAddWithdrawn', 'UPDATE players SET withdrawn_ada = withdrawn_ada + ? WHERE address = ?');
  prep('playerSetPending', 'UPDATE players SET pending_withdraw = ? WHERE address = ?');
  prep('nonceSet', 'INSERT INTO nonces (address, nonce, expires) VALUES (?, ?, ?) ON CONFLICT(address) DO UPDATE SET nonce = excluded.nonce, expires = excluded.expires');
  prep('nonceGet', 'SELECT * FROM nonces WHERE address = ?');
  prep('nonceDel', 'DELETE FROM nonces WHERE address = ?');
  prep('sessionAdd', 'INSERT INTO sessions (token, address, expires) VALUES (?, ?, ?)');
  prep('sessionGet', 'SELECT * FROM sessions WHERE token = ?');
  prep('sessionsPurge', 'DELETE FROM sessions WHERE expires < ?');
  prep('depositAdd', 'INSERT OR IGNORE INTO deposits (tx_hash, log_index, address, amount, block) VALUES (?, ?, ?, ?, ?)');
  prep('depositsUncredited', 'SELECT * FROM deposits WHERE credited_at IS NULL AND address = ?');
  prep('depositsUncreditedAll', 'SELECT * FROM deposits WHERE credited_at IS NULL');
  prep('depositCredit', 'UPDATE deposits SET credited_at = ? WHERE tx_hash = ? AND log_index = ?');
  prep('depositsOf', 'SELECT * FROM deposits WHERE address = ? ORDER BY block DESC LIMIT 50');
  prep('payoutAdd', 'INSERT INTO payouts (epoch, kind, address, amount, created_at) VALUES (?, ?, ?, ?, ?)');
  prep('payoutsPending', "SELECT * FROM payouts WHERE status = 'pending' ORDER BY id");
  prep('payoutsOf', 'SELECT id, epoch, kind, amount, status, tx_hash, created_at, sent_at FROM payouts WHERE address = ? ORDER BY id DESC LIMIT 50');
  prep('payoutsRecent', 'SELECT id, epoch, kind, address, amount, status, tx_hash, error, created_at, sent_at FROM payouts ORDER BY id DESC LIMIT ?');
  prep('payoutMark', 'UPDATE payouts SET status = ?, tx_hash = ?, error = ?, sent_at = ? WHERE id = ?');
  prep('payoutSigned', "UPDATE payouts SET status = 'sending', tx_hash = ?, raw_tx = ?, tx_nonce = ? WHERE id = ?");
  prep('payoutsSending', "SELECT * FROM payouts WHERE status = 'sending' ORDER BY id");
  prep('payoutGet', 'SELECT * FROM payouts WHERE id = ?');
  prep('payoutSetStatus', 'UPDATE payouts SET status = ?, error = ? WHERE id = ?');
  prep('noncesPurge', 'DELETE FROM nonces WHERE expires < ?');
  prep('payoutsSentSince', "SELECT COALESCE(SUM(amount), 0) AS total FROM payouts WHERE status = 'sent' AND sent_at >= ?");
  prep('withdrawLogSet', 'INSERT INTO withdraw_log (epoch, address, data) VALUES (?, ?, ?) ON CONFLICT(epoch, address) DO UPDATE SET data = excluded.data');
  prep('withdrawLogOf', 'SELECT * FROM withdraw_log WHERE address = ? ORDER BY epoch DESC LIMIT 20');
  prep('priceAdd', 'INSERT OR REPLACE INTO prices (at, price_usd, mcap_usd, supply, dead, avax_usd, graduated) VALUES (?, ?, ?, ?, ?, ?, ?)');
  prep('pricesSince', 'SELECT * FROM prices WHERE at >= ? ORDER BY at');
  prep('priceLast', 'SELECT * FROM prices ORDER BY at DESC LIMIT 1');
  prep('eventAdd', 'INSERT INTO events (at, address, type, data) VALUES (?, ?, ?, ?)');
  prep('eventsRecent', 'SELECT * FROM events ORDER BY id DESC LIMIT ?');

  const api = {
    raw: db,
    q,
    kvGet(key) { const r = q.kvGet.get(key); return r ? r.value : null; },
    kvSet(key, value) { q.kvSet.run(key, String(value)); },
    kvDel(key) { q.kvDel.run(key); },
    kvJson(key, fallback = null) { const v = api.kvGet(key); if (v == null) return fallback; try { return JSON.parse(v); } catch { return fallback; } },
    kvSetJson(key, obj) { api.kvSet(key, JSON.stringify(obj)); },
    event(type, address = null, data = null) { q.eventAdd.run(Date.now(), address, type, data == null ? null : JSON.stringify(data)); },
    // Birden çok yazmayı tek seferde (ya hep ya hiç) yapar
    tx(fn) {
      db.exec('BEGIN');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    // Kapanışta SQLite'ın istatistiklerini tazele (sorgu planlayıcı doğru indeksi seçsin)
    close() { try { db.exec('PRAGMA optimize'); } catch { /* salt okunur ya da zaten kapalı: önemsiz */ } db.close(); }
  };
  return api;
}
