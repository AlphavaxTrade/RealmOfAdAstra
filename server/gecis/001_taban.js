// Geçiş 001: taban şema. Eskiden 8 dosyaya dağılmış CREATE TABLE ifadelerinin AYNEN toplanmış hâli (kurumsal A5.3).
// Hepsi IF NOT EXISTS: eski kayıt dosyalarında (tablolar zaten var) zararsız, boş dosyada hepsini kurar.
// UYGULANMIŞ BİR GEÇİŞ ASLA DEĞİŞTİRİLMEZ: yeni bir şey gerekiyorsa yeni numaralı geçiş eklenir (tests/test_gecis.mjs mühürü denetler).
export const surum = 1;
export const ad = 'taban';

export function up(db) {
  db.exec(`
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
  created_at INTEGER NOT NULL, sent_at INTEGER, raw_tx TEXT, tx_nonce INTEGER
);
CREATE TABLE IF NOT EXISTS withdraw_log (
  epoch INTEGER NOT NULL, address TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (epoch, address)
);
CREATE TABLE IF NOT EXISTS prices (at INTEGER PRIMARY KEY, price_usd REAL, mcap_usd REAL, supply REAL, dead REAL, avax_usd REAL, graduated INTEGER);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, address TEXT, type TEXT NOT NULL, data TEXT);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  wallet TEXT UNIQUE,
  wallet_set_at INTEGER,
  pending_wallet TEXT,
  pending_confirmed INTEGER NOT NULL DEFAULT 0,
  pending_active_at INTEGER
);
CREATE TABLE IF NOT EXISTS email_tokens (
  token TEXT PRIMARY KEY, account_id INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_nonces (account_id INTEGER PRIMARY KEY, address TEXT NOT NULL, message TEXT NOT NULL, expires INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS kasa (
  player TEXT PRIMARY KEY, address TEXT NOT NULL UNIQUE, key_enc TEXT NOT NULL, created INTEGER NOT NULL,
  pending REAL NOT NULL DEFAULT 0, settled REAL NOT NULL DEFAULT 0, approved INTEGER NOT NULL DEFAULT 0,
  ada REAL NOT NULL DEFAULT 0, avax REAL NOT NULL DEFAULT 0, bal_at INTEGER NOT NULL DEFAULT 0, last_settle INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS kasa_ops (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT NOT NULL, kind TEXT NOT NULL, amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', tx_hash TEXT, raw_tx TEXT, tx_nonce INTEGER, error TEXT, created INTEGER NOT NULL, done_at INTEGER
);
CREATE TABLE IF NOT EXISTS kasa_usage (player TEXT NOT NULL, day TEXT NOT NULL, ada REAL NOT NULL, PRIMARY KEY (player, day));

CREATE TABLE IF NOT EXISTS pay_quotes (
  ref TEXT PRIMARY KEY, player TEXT NOT NULL, name TEXT NOT NULL, args TEXT NOT NULL, amount REAL NOT NULL,
  created INTEGER NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open', tx_hash TEXT UNIQUE, paid REAL
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, seller TEXT NOT NULL, item TEXT NOT NULL, price REAL NOT NULL,
  created_at INTEGER NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', buyer TEXT, closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS listings_status ON listings (status, expires);

CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY, reward TEXT NOT NULL, max_uses INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0,
  expires INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, note TEXT, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS promo_uses (code TEXT NOT NULL, player TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (code, player));
CREATE TABLE IF NOT EXISTS promo_pending (player TEXT PRIMARY KEY, code TEXT NOT NULL, at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS partner_income (
  tx_hash TEXT NOT NULL, log_index INTEGER NOT NULL, sender TEXT NOT NULL, amount REAL NOT NULL, block INTEGER, at INTEGER NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);
`);
}
