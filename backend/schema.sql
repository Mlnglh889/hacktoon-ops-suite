PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS blocks (
  block_number INTEGER PRIMARY KEY,
  block_hash TEXT NOT NULL,
  captured_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS validators (
  address TEXT PRIMARY KEY,
  first_seen_block INTEGER,
  nickname TEXT,
  last_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS era_stake (
  era INTEGER NOT NULL,
  address TEXT NOT NULL,
  total_pot TEXT NOT NULL,
  own_pot TEXT NOT NULL,
  nominator_count INTEGER NOT NULL,
  commission_pct TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  PRIMARY KEY (era, address)
);

CREATE TABLE IF NOT EXISTS era_points (
  era INTEGER NOT NULL,
  address TEXT NOT NULL,
  points INTEGER NOT NULL,
  captured_at INTEGER NOT NULL,
  PRIMARY KEY (era, address)
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS heartbeat_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  network TEXT NOT NULL,
  contract_address TEXT,
  tx_hash TEXT,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_era_stake_address ON era_stake(address);
CREATE INDEX IF NOT EXISTS idx_blocks_captured_at ON blocks(captured_at);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);

PRAGMA user_version = 1;

INSERT OR IGNORE INTO validators(address, first_seen_block, nickname, last_seen)
VALUES ('schema-placeholder', NULL, 'placeholder', 0);
DELETE FROM validators WHERE address = 'schema-placeholder';

INSERT OR IGNORE INTO alerts(kind, message, created_at)
VALUES ('schema', 'Ops Suite schema initialized', 0);
DELETE FROM alerts WHERE kind = 'schema' AND created_at = 0;

