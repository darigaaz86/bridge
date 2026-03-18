// Package testutil provides shared test helpers for the indexer.
package testutil

import (
	"os"
	"testing"

	"github.com/aspect-build/qorebridge-indexer/db"
	"github.com/aspect-build/qorebridge-indexer/types"
)

// SetupTestDB creates a test database connection and cleans tables before each test.
// Skips the test if TEST_DATABASE_URL is not set.
func SetupTestDB(t *testing.T) *db.DB {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set, skipping database test")
	}

	store, err := db.New(url)
	if err != nil {
		t.Fatalf("failed to connect to test db: %v", err)
	}

	// Clean tables before each test
	store.Conn().Exec("DELETE FROM bridge_events")
	store.Conn().Exec("DELETE FROM indexer_state")

	t.Cleanup(func() { store.Close() })
	return store
}

// SeedEvent inserts a test bridge event with the given parameters.
func SeedEvent(t *testing.T, store *db.DB, txHash, sender, provider string, timestamp int64) {
	t.Helper()
	e := &types.IndexedBridgeEvent{
		Nonce:              1,
		TxHash:             txHash,
		BlockNumber:        100,
		Timestamp:          timestamp,
		ChainID:            1,
		Sender:             sender,
		Recipient:          "0xrecipient",
		SourceChainID:      1,
		DestinationChainID: 42161,
		Token:              "0xtoken",
		Amount:             "1000000",
		PlatformFee:        "500",
		Provider:           provider,
		ProviderData:       "0x",
		Status:             "pending",
	}
	if err := store.InsertBridgeEvent(e); err != nil {
		t.Fatalf("seed event: %v", err)
	}
}
