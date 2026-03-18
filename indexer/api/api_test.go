package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aspect-build/qorebridge-indexer/testutil"
	"github.com/aspect-build/qorebridge-indexer/types"
)

func TestHistoryRequiresAddress(t *testing.T) {
	store := testutil.SetupTestDB(t)
	router := NewRouter(store)

	req := httptest.NewRequest("GET", "/api/history", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHistoryReturnsEvents(t *testing.T) {
	store := testutil.SetupTestDB(t)
	testutil.SeedEvent(t, store, "0xabc", "0xuser1", "cctp", 1000)
	testutil.SeedEvent(t, store, "0xdef", "0xuser1", "cctp", 2000)
	testutil.SeedEvent(t, store, "0xghi", "0xuser2", "cctp", 3000)

	router := NewRouter(store)

	req := httptest.NewRequest("GET", "/api/history?address=0xuser1", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected application/json, got %s", ct)
	}

	var events []types.IndexedBridgeEvent
	if err := json.NewDecoder(w.Body).Decode(&events); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
	if events[0].Timestamp < events[1].Timestamp {
		t.Error("events not sorted by timestamp descending")
	}
}

func TestHistoryPagination(t *testing.T) {
	store := testutil.SetupTestDB(t)
	testutil.SeedEvent(t, store, "0x1", "0xuser", "cctp", 1000)
	testutil.SeedEvent(t, store, "0x2", "0xuser", "cctp", 2000)
	testutil.SeedEvent(t, store, "0x3", "0xuser", "cctp", 3000)

	router := NewRouter(store)

	req := httptest.NewRequest("GET", "/api/history?address=0xuser&limit=2&offset=0", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	var events []types.IndexedBridgeEvent
	json.NewDecoder(w.Body).Decode(&events)
	if len(events) != 2 {
		t.Fatalf("expected 2 events with limit=2, got %d", len(events))
	}

	req = httptest.NewRequest("GET", "/api/history?address=0xuser&limit=2&offset=2", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	json.NewDecoder(w.Body).Decode(&events)
	if len(events) != 1 {
		t.Fatalf("expected 1 event on second page, got %d", len(events))
	}
}

func TestHistoryEmptyResult(t *testing.T) {
	store := testutil.SetupTestDB(t)
	router := NewRouter(store)

	req := httptest.NewRequest("GET", "/api/history?address=0xnoone", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var events []types.IndexedBridgeEvent
	json.NewDecoder(w.Body).Decode(&events)
	if len(events) != 0 {
		t.Errorf("expected empty array, got %d events", len(events))
	}
}

func TestHistoryByTxHash(t *testing.T) {
	store := testutil.SetupTestDB(t)
	testutil.SeedEvent(t, store, "0xabc123", "0xuser", "cctp", 1000)

	router := NewRouter(store)

	req := httptest.NewRequest("GET", "/api/history/0xabc123", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var event types.IndexedBridgeEvent
	if err := json.NewDecoder(w.Body).Decode(&event); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if event.TxHash != "0xabc123" {
		t.Errorf("expected txHash 0xabc123, got %s", event.TxHash)
	}
}

func TestHistoryByTxHashNotFound(t *testing.T) {
	store := testutil.SetupTestDB(t)
	router := NewRouter(store)

	req := httptest.NewRequest("GET", "/api/history/0xnonexistent", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestCORSHeaders(t *testing.T) {
	store := testutil.SetupTestDB(t)
	router := NewRouter(store)

	req := httptest.NewRequest("OPTIONS", "/api/history", nil)
	req.Header.Set("Origin", "https://example.com")
	req.Header.Set("Access-Control-Request-Method", "GET")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if v := w.Header().Get("Access-Control-Allow-Origin"); v != "*" {
		t.Errorf("expected CORS allow-origin *, got %q", v)
	}
}
