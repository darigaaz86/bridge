package poller

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aspect-build/qorebridge-indexer/db"
	"github.com/aspect-build/qorebridge-indexer/testutil"
)

func setupTestDB(t *testing.T) *db.DB {
	t.Helper()
	return testutil.SetupTestDB(t)
}

func insertPendingEvent(t *testing.T, store *db.DB, txHash, provider string, chainID int64) {
	t.Helper()
	testutil.SeedEvent(t, store, txHash, "0xabc", provider, time.Now().Unix())
}

func TestPollCCTP_Complete(t *testing.T) {
	store := setupTestDB(t)
	txHash := "0xabc123"
	insertPendingEvent(t, store, txHash, "cctp", 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, txHash) {
			t.Errorf("expected path to contain tx hash, got %s", r.URL.Path)
		}
		resp := irisResponse{
			Messages: []irisMessage{{Status: "complete", DestTxHash: "0xdest456"}},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	origURL := cctpBaseURL
	cctpBaseURL = server.URL
	defer func() { cctpBaseURL = origURL }()

	event, _ := store.GetEventByTxHash(txHash)
	client := &http.Client{Timeout: 5 * time.Second}
	err := pollCCTP(context.Background(), store, client, event)
	if err != nil {
		t.Fatalf("pollCCTP failed: %v", err)
	}

	updated, _ := store.GetEventByTxHash(txHash)
	if updated.Status != "done" {
		t.Errorf("expected status 'done', got %q", updated.Status)
	}
	if updated.DestinationTxHash != "0xdest456" {
		t.Errorf("expected destination tx '0xdest456', got %q", updated.DestinationTxHash)
	}
}

func TestPollCCTP_Pending(t *testing.T) {
	store := setupTestDB(t)
	txHash := "0xpending1"
	insertPendingEvent(t, store, txHash, "cctp", 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(irisResponse{Messages: []irisMessage{}})
	}))
	defer server.Close()

	origURL := cctpBaseURL
	cctpBaseURL = server.URL
	defer func() { cctpBaseURL = origURL }()

	event, _ := store.GetEventByTxHash(txHash)
	client := &http.Client{Timeout: 5 * time.Second}
	err := pollCCTP(context.Background(), store, client, event)
	if err != nil {
		t.Fatalf("pollCCTP failed: %v", err)
	}

	updated, _ := store.GetEventByTxHash(txHash)
	if updated.Status != "pending" {
		t.Errorf("expected status 'pending', got %q", updated.Status)
	}
	if updated.LastPolledAt == nil {
		t.Error("expected LastPolledAt to be set")
	}
}

func TestPollLayerZero_Delivered(t *testing.T) {
	store := setupTestDB(t)
	txHash := "0xlz123"
	insertPendingEvent(t, store, txHash, "usdt0", 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := lzScanResponse{
			Messages: []lzMessage{{Status: "DELIVERED", DstTx: lzDstTx{TxHash: "0xlzdest"}}},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	origURL := lzScanBaseURL
	lzScanBaseURL = server.URL
	defer func() { lzScanBaseURL = origURL }()

	event, _ := store.GetEventByTxHash(txHash)
	client := &http.Client{Timeout: 5 * time.Second}
	err := pollLayerZero(context.Background(), store, client, event)
	if err != nil {
		t.Fatalf("pollLayerZero failed: %v", err)
	}

	updated, _ := store.GetEventByTxHash(txHash)
	if updated.Status != "done" {
		t.Errorf("expected status 'done', got %q", updated.Status)
	}
}

func TestPollLayerZero_Failed(t *testing.T) {
	store := setupTestDB(t)
	txHash := "0xlzfail"
	insertPendingEvent(t, store, txHash, "usdt0", 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := lzScanResponse{
			Messages: []lzMessage{{Status: "FAILED"}},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	origURL := lzScanBaseURL
	lzScanBaseURL = server.URL
	defer func() { lzScanBaseURL = origURL }()

	event, _ := store.GetEventByTxHash(txHash)
	client := &http.Client{Timeout: 5 * time.Second}
	err := pollLayerZero(context.Background(), store, client, event)
	if err != nil {
		t.Fatalf("pollLayerZero failed: %v", err)
	}

	updated, _ := store.GetEventByTxHash(txHash)
	if updated.Status != "failed" {
		t.Errorf("expected status 'failed', got %q", updated.Status)
	}
}

func TestPollNEAR_Completed(t *testing.T) {
	store := setupTestDB(t)
	txHash := "0xnear123"
	insertPendingEvent(t, store, txHash, "near-intents", 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := nearStatusResponse{Status: "COMPLETED", TxHash: "0xneardest"}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	origURL := nearBaseURL
	nearBaseURL = server.URL
	defer func() { nearBaseURL = origURL }()

	event, _ := store.GetEventByTxHash(txHash)
	client := &http.Client{Timeout: 5 * time.Second}
	err := pollNEAR(context.Background(), store, client, event)
	if err != nil {
		t.Fatalf("pollNEAR failed: %v", err)
	}

	updated, _ := store.GetEventByTxHash(txHash)
	if updated.Status != "done" {
		t.Errorf("expected status 'done', got %q", updated.Status)
	}
}

func TestPollNEAR_Failed(t *testing.T) {
	store := setupTestDB(t)
	txHash := "0xnearfail"
	insertPendingEvent(t, store, txHash, "near-intents", 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := nearStatusResponse{Status: "FAILED", Reason: "solver timeout"}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	origURL := nearBaseURL
	nearBaseURL = server.URL
	defer func() { nearBaseURL = origURL }()

	event, _ := store.GetEventByTxHash(txHash)
	client := &http.Client{Timeout: 5 * time.Second}
	err := pollNEAR(context.Background(), store, client, event)
	if err != nil {
		t.Fatalf("pollNEAR failed: %v", err)
	}

	updated, _ := store.GetEventByTxHash(txHash)
	if updated.Status != "failed" {
		t.Errorf("expected status 'failed', got %q", updated.Status)
	}
	if updated.FailureMessage != "solver timeout" {
		t.Errorf("expected failure message 'solver timeout', got %q", updated.FailureMessage)
	}
}

func TestPollNEAR_Refunded(t *testing.T) {
	store := setupTestDB(t)
	txHash := "0xnearrefund"
	insertPendingEvent(t, store, txHash, "near-intents", 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := nearStatusResponse{Status: "REFUNDED", Reason: "no solver available"}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	origURL := nearBaseURL
	nearBaseURL = server.URL
	defer func() { nearBaseURL = origURL }()

	event, _ := store.GetEventByTxHash(txHash)
	client := &http.Client{Timeout: 5 * time.Second}
	err := pollNEAR(context.Background(), store, client, event)
	if err != nil {
		t.Fatalf("pollNEAR failed: %v", err)
	}

	updated, _ := store.GetEventByTxHash(txHash)
	if updated.Status != "failed" {
		t.Errorf("expected status 'failed', got %q", updated.Status)
	}
}

func TestPollEvent_APIError_DoesNotMarkFailed(t *testing.T) {
	store := setupTestDB(t)
	txHash := "0xapierr"
	insertPendingEvent(t, store, txHash, "cctp", 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	origURL := cctpBaseURL
	cctpBaseURL = server.URL
	defer func() { cctpBaseURL = origURL }()

	event, _ := store.GetEventByTxHash(txHash)
	client := &http.Client{Timeout: 5 * time.Second}
	err := pollCCTP(context.Background(), store, client, event)
	if err == nil {
		t.Fatal("expected error from API failure")
	}

	updated, _ := store.GetEventByTxHash(txHash)
	if updated.Status != "pending" {
		t.Errorf("expected status to remain 'pending' on API error, got %q", updated.Status)
	}
}

func TestPollEvent_UnknownProvider_Skipped(t *testing.T) {
	store := setupTestDB(t)
	txHash := "0xunknown"
	insertPendingEvent(t, store, txHash, "unknown-provider", 1)

	event, _ := store.GetEventByTxHash(txHash)
	client := &http.Client{Timeout: 5 * time.Second}
	err := pollEvent(context.Background(), store, client, event)
	if err != nil {
		t.Fatalf("expected no error for unknown provider, got: %v", err)
	}

	updated, _ := store.GetEventByTxHash(txHash)
	if updated.Status != "pending" {
		t.Errorf("expected status 'pending', got %q", updated.Status)
	}
}

func TestPollPendingEvents_NoPendingEvents(t *testing.T) {
	store := setupTestDB(t)
	client := &http.Client{Timeout: 5 * time.Second}
	pollPendingEvents(context.Background(), store, client)
}
