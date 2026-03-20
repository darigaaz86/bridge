package db

import (
	"database/sql"
	"fmt"

	"github.com/aspect-build/qorebridge-indexer/types"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// DB wraps a sql.DB connection and provides data-access helpers for the indexer.
type DB struct {
	conn *sql.DB
}

const schema = `
CREATE TABLE IF NOT EXISTS bridge_events (
  id BIGSERIAL PRIMARY KEY,
  nonce BIGINT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  block_number BIGINT NOT NULL,
  timestamp BIGINT NOT NULL,
  chain_id BIGINT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  source_chain_id BIGINT NOT NULL,
  destination_chain_id BIGINT NOT NULL,
  token TEXT NOT NULL,
  amount TEXT NOT NULL,
  platform_fee TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  destination_tx_hash TEXT,
  failure_message TEXT,
  received_amount TEXT,
  last_polled_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_bridge_events_sender ON bridge_events(sender);
CREATE INDEX IF NOT EXISTS idx_bridge_events_status ON bridge_events(status);
CREATE INDEX IF NOT EXISTS idx_bridge_events_timestamp ON bridge_events(timestamp DESC);

CREATE TABLE IF NOT EXISTS indexer_state (
  chain_id BIGINT PRIMARY KEY,
  last_block_number BIGINT NOT NULL
);
`

// New opens a PostgreSQL database with the given connection string and initializes the schema.
func New(connStr string) (*DB, error) {
	conn, err := sql.Open("pgx", connStr)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	if _, err := conn.Exec(schema); err != nil {
		conn.Close()
		return nil, fmt.Errorf("initialize schema: %w", err)
	}

	// Migration: add received_amount column if missing (for existing databases)
	conn.Exec(`ALTER TABLE bridge_events ADD COLUMN IF NOT EXISTS received_amount TEXT`)

	return &DB{conn: conn}, nil
}

// Close closes the underlying database connection.
func (d *DB) Close() error {
	return d.conn.Close()
}

// Conn returns the underlying *sql.DB for advanced usage.
func (d *DB) Conn() *sql.DB {
	return d.conn
}

// InsertBridgeEvent inserts a new bridge event into the database.
func (d *DB) InsertBridgeEvent(e *types.IndexedBridgeEvent) error {
	_, err := d.conn.Exec(`
		INSERT INTO bridge_events (
			nonce, tx_hash, block_number, timestamp, chain_id,
			sender, recipient, source_chain_id, destination_chain_id,
			token, amount, platform_fee, provider, provider_data,
			status, destination_tx_hash, failure_message, received_amount, last_polled_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		e.Nonce, e.TxHash, e.BlockNumber, e.Timestamp, e.ChainID,
		e.Sender, e.Recipient, e.SourceChainID, e.DestinationChainID,
		e.Token, e.Amount, e.PlatformFee, e.Provider, e.ProviderData,
		e.Status, nilIfEmpty(e.DestinationTxHash), nilIfEmpty(e.FailureMessage), nilIfEmpty(e.ReceivedAmount), e.LastPolledAt,
	)
	if err != nil {
		return fmt.Errorf("insert bridge event: %w", err)
	}
	return nil
}

// GetAllEvents returns all bridge events sorted by timestamp descending, with pagination.
func (d *DB) GetAllEvents(limit, offset int) ([]types.IndexedBridgeEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := d.conn.Query(`
		SELECT id, nonce, tx_hash, block_number, timestamp, chain_id,
			sender, recipient, source_chain_id, destination_chain_id,
			token, amount, platform_fee, provider, provider_data,
			status, destination_tx_hash, failure_message, received_amount, last_polled_at
		FROM bridge_events
		ORDER BY timestamp DESC
		LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("query all events: %w", err)
	}
	defer rows.Close()
	return scanEvents(rows)
}

// GetEventsByAddress returns bridge events for a given sender address,
// sorted by timestamp descending, with pagination support.
func (d *DB) GetEventsByAddress(address string, limit, offset int) ([]types.IndexedBridgeEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := d.conn.Query(`
		SELECT id, nonce, tx_hash, block_number, timestamp, chain_id,
			sender, recipient, source_chain_id, destination_chain_id,
			token, amount, platform_fee, provider, provider_data,
			status, destination_tx_hash, failure_message, received_amount, last_polled_at
		FROM bridge_events
		WHERE LOWER(sender) = LOWER($1)
		ORDER BY timestamp DESC
		LIMIT $2 OFFSET $3`,
		address, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("query events by address: %w", err)
	}
	defer rows.Close()
	return scanEvents(rows)
}

// GetEventByTxHash returns a single bridge event by its transaction hash.
func (d *DB) GetEventByTxHash(txHash string) (*types.IndexedBridgeEvent, error) {
	row := d.conn.QueryRow(`
		SELECT id, nonce, tx_hash, block_number, timestamp, chain_id,
			sender, recipient, source_chain_id, destination_chain_id,
			token, amount, platform_fee, provider, provider_data,
			status, destination_tx_hash, failure_message, received_amount, last_polled_at
		FROM bridge_events
		WHERE LOWER(tx_hash) = LOWER($1)`,
		txHash,
	)
	return scanEvent(row)
}

// GetPendingEvents returns all bridge events with status "pending".
func (d *DB) GetPendingEvents() ([]types.IndexedBridgeEvent, error) {
	rows, err := d.conn.Query(`
		SELECT id, nonce, tx_hash, block_number, timestamp, chain_id,
			sender, recipient, source_chain_id, destination_chain_id,
			token, amount, platform_fee, provider, provider_data,
			status, destination_tx_hash, failure_message, received_amount, last_polled_at
		FROM bridge_events
		WHERE status = 'pending'
		ORDER BY timestamp ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("query pending events: %w", err)
	}
	defer rows.Close()
	return scanEvents(rows)
}

// UpdateEventStatus updates the status of a bridge event and optionally sets
// the destination tx hash and failure message.
func (d *DB) UpdateEventStatus(txHash, status, destinationTxHash, failureMessage, receivedAmount string) error {
	_, err := d.conn.Exec(`
		UPDATE bridge_events
		SET status = $1,
			destination_tx_hash = $2,
			failure_message = $3,
			received_amount = $4
		WHERE LOWER(tx_hash) = LOWER($5)`,
		status, nilIfEmpty(destinationTxHash), nilIfEmpty(failureMessage), nilIfEmpty(receivedAmount), txHash,
	)
	if err != nil {
		return fmt.Errorf("update event status: %w", err)
	}
	return nil
}

// UpdateLastPolledAt updates the last_polled_at timestamp for a bridge event.
func (d *DB) UpdateLastPolledAt(txHash string, timestamp int64) error {
	_, err := d.conn.Exec(`
		UPDATE bridge_events
		SET last_polled_at = $1
		WHERE LOWER(tx_hash) = LOWER($2)`,
		timestamp, txHash,
	)
	if err != nil {
		return fmt.Errorf("update last polled at: %w", err)
	}
	return nil
}

// GetLastBlock returns the last processed block number for a given chain.
// Returns 0 if no state exists for the chain.
func (d *DB) GetLastBlock(chainID int64) (int64, error) {
	var blockNumber int64
	err := d.conn.QueryRow(`
		SELECT last_block_number FROM indexer_state WHERE chain_id = $1`,
		chainID,
	).Scan(&blockNumber)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("get last block: %w", err)
	}
	return blockNumber, nil
}

// SetLastBlock upserts the last processed block number for a given chain.
func (d *DB) SetLastBlock(chainID, blockNumber int64) error {
	_, err := d.conn.Exec(`
		INSERT INTO indexer_state (chain_id, last_block_number)
		VALUES ($1, $2)
		ON CONFLICT(chain_id) DO UPDATE SET last_block_number = EXCLUDED.last_block_number`,
		chainID, blockNumber,
	)
	if err != nil {
		return fmt.Errorf("set last block: %w", err)
	}
	return nil
}

// scanEvents scans multiple rows into a slice of IndexedBridgeEvent.
func scanEvents(rows *sql.Rows) ([]types.IndexedBridgeEvent, error) {
	var events []types.IndexedBridgeEvent
	for rows.Next() {
		e, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		events = append(events, *e)
	}
	return events, rows.Err()
}

// scanEvent scans a single row into an IndexedBridgeEvent.
func scanEvent(row *sql.Row) (*types.IndexedBridgeEvent, error) {
	var e types.IndexedBridgeEvent
	var destTxHash, failureMsg, receivedAmt sql.NullString
	var lastPolled sql.NullInt64

	err := row.Scan(
		&e.ID, &e.Nonce, &e.TxHash, &e.BlockNumber, &e.Timestamp, &e.ChainID,
		&e.Sender, &e.Recipient, &e.SourceChainID, &e.DestinationChainID,
		&e.Token, &e.Amount, &e.PlatformFee, &e.Provider, &e.ProviderData,
		&e.Status, &destTxHash, &failureMsg, &receivedAmt, &lastPolled,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("scan event: %w", err)
	}

	if destTxHash.Valid {
		e.DestinationTxHash = destTxHash.String
	}
	if failureMsg.Valid {
		e.FailureMessage = failureMsg.String
	}
	if receivedAmt.Valid {
		e.ReceivedAmount = receivedAmt.String
	}
	if lastPolled.Valid {
		e.LastPolledAt = &lastPolled.Int64
	}
	return &e, nil
}

// scanRow scans a single row from *sql.Rows into an IndexedBridgeEvent.
func scanRow(rows *sql.Rows) (*types.IndexedBridgeEvent, error) {
	var e types.IndexedBridgeEvent
	var destTxHash, failureMsg, receivedAmt sql.NullString
	var lastPolled sql.NullInt64

	err := rows.Scan(
		&e.ID, &e.Nonce, &e.TxHash, &e.BlockNumber, &e.Timestamp, &e.ChainID,
		&e.Sender, &e.Recipient, &e.SourceChainID, &e.DestinationChainID,
		&e.Token, &e.Amount, &e.PlatformFee, &e.Provider, &e.ProviderData,
		&e.Status, &destTxHash, &failureMsg, &receivedAmt, &lastPolled,
	)
	if err != nil {
		return nil, fmt.Errorf("scan row: %w", err)
	}

	if destTxHash.Valid {
		e.DestinationTxHash = destTxHash.String
	}
	if failureMsg.Valid {
		e.FailureMessage = failureMsg.String
	}
	if receivedAmt.Valid {
		e.ReceivedAmount = receivedAmt.String
	}
	if lastPolled.Valid {
		e.LastPolledAt = &lastPolled.Int64
	}
	return &e, nil
}

// nilIfEmpty returns nil if the string is empty, otherwise returns the string.
func nilIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
