CREATE TABLE IF NOT EXISTS bridge_history (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  provider TEXT NOT NULL,
  from_chain INTEGER NOT NULL,
  to_chain INTEGER NOT NULL,
  from_token TEXT NOT NULL,
  to_token TEXT NOT NULL,
  amount TEXT NOT NULL,
  recipient TEXT NOT NULL,
  source_tx_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  destination_tx_hash TEXT,
  failure_message TEXT,
  deposit_address TEXT,
  deposit_memo TEXT
);

CREATE INDEX IF NOT EXISTS idx_bridge_history_wallet ON bridge_history (wallet_address);
CREATE INDEX IF NOT EXISTS idx_bridge_history_created ON bridge_history (created_at DESC);
