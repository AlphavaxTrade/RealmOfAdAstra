// Realm of Astra sunucusu — kayıt (tek dosyalık SQLite; Node'un kendi node:sqlite modülü, ek kurulum yok)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS players (
  address TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  deposited_ada REAL NOT NULL DEFAULT 0,
  withdrawn_ada REAL NOT NULL DEFAULT 0,
  pending_withdraw REAL NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS nonces (address TEXT PRIMARY KEY, nonce TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, address TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS deposits (
  tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL, address TEXT NOT NULL, amount REAL NOT NULL,
  block INTEGER NOT NULL, credited_at INTEGER, PRIMARY KEY (tx_hash, log_index)
);
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, epoch INTEGER NOT NULL, kind TEXT NOT NULL, address TEXT NOT NULL,
  amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending', tx_hash TEXT, error TEXT,
  created_at INTEGER NOT NULL, sent_at INTEGER
);
CREATE TABLE IF NOT EXISTS withdraw_log (
  epoch INTEGER NOT NULL, address TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (epoch, address)
);
CREATE TABLE IF NOT EXISTS prices (at INTEGER PRIMARY KEY, price_usd REAL, mcap_usd REAL, supply REAL, dead REAL, avax_usd REAL, graduated INTEGER);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, address TEXT, type TEXT NOT NULL, data TEXT);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
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
  prep('payoutsOf', 'SELECT * FROM payouts WHERE address = ? ORDER BY id DESC LIMIT 50');
  prep('payoutsRecent', 'SELECT * FROM payouts ORDER BY id DESC LIMIT ?');
  prep('payoutMark', 'UPDATE payouts SET status = ?, tx_hash = ?, error = ?, sent_at = ? WHERE id = ?');
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
    close() { db.close(); }
  };
  return api;
}
