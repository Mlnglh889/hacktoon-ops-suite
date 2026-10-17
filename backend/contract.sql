-- OpsRegistry design record (contract implementation follows once gas/signer exists).
-- Intended minimal storage:
--   heartbeat_count
--   last_heartbeat_block
--   last_heartbeat_payload_hash
-- Intended callable:
--   heartbeat(bytes32 payload_hash)
-- Each successful call must produce a verifiable PortaldotV3 EVM receipt.

CREATE TABLE IF NOT EXISTS heartbeat_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  network TEXT NOT NULL DEFAULT 'PortaldotV3 Test',
  contract_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  explorer_url TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
