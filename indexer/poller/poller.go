// Package poller queries pending bridge events and polls downstream status APIs
// to update transaction status. It supports Circle Iris (CCTP), LayerZero Scan
// (USDT0), and NEAR 1Click (NEAR Intents) providers.
package poller

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/aspect-build/qorebridge-indexer/db"
	"github.com/aspect-build/qorebridge-indexer/types"
	"github.com/ethereum/go-ethereum/common"
)

// CCTP source domain mapping: EVM chain ID → Circle CCTP domain ID.
var cctpDomainMap = map[int64]int{
	1:     0, // Ethereum
	43114: 1, // Avalanche
	10:    2, // Optimism
	42161: 3, // Arbitrum
	8453:  6, // Base
	137:   7, // Polygon
}

// Base URLs for downstream status APIs. Package-level vars to allow overriding in tests.
var (
	cctpBaseURL   = "https://iris-api.circle.com"
	lzScanBaseURL = "https://scan.layerzero-api.com"
	nearBaseURL   = "https://1click.chaindefuser.com"
)

// --- Circle Iris API types ---

type irisResponse struct {
	Messages []irisMessage `json:"messages"`
}

type irisMessage struct {
	Status        string `json:"status"`
	DestTxHash    string `json:"destTxHash"`
	DestinationTx string `json:"destinationTransaction"`
}

// --- LayerZero Scan API types ---

type lzScanResponse struct {
	Messages []lzMessage `json:"messages"`
}

type lzMessage struct {
	Status string  `json:"status"`
	DstTx  lzDstTx `json:"dstTxHash"`
}

type lzDstTx struct {
	TxHash string `json:"txHash"`
}

// --- NEAR 1Click API types ---

type nearStatusResponse struct {
	Status      string          `json:"status"`
	TxHash      string          `json:"txHash"`
	Reason      string          `json:"reason"`
	SwapDetails nearSwapDetails `json:"swapDetails"`
}

type nearSwapDetails struct {
	AmountOut string `json:"amountOut"`
}

// StartPoller starts the status polling loop. It queries pending events from the
// database at the configured interval and polls the appropriate downstream API
// for each event. It blocks until the context is cancelled.
func StartPoller(ctx context.Context, store *db.DB, config types.IndexerConfig) {
	interval := config.StatusPollInterval
	if interval == 0 {
		interval = 10 * time.Second
	}

	client := &http.Client{Timeout: 15 * time.Second}

	log.Printf("[poller] starting status poller (interval: %s)", interval)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[poller] stopped")
			return
		case <-ticker.C:
			pollPendingEvents(ctx, store, client)
		}
	}
}

// maxPendingAge is the maximum time a bridge event can stay in "pending" status
// before the poller marks it as failed. This prevents indefinite polling for
// events that will never resolve (e.g. test transactions with dummy addresses).
const maxPendingAge = 1 * time.Hour

// pollPendingEvents fetches all pending events and polls their status.
func pollPendingEvents(ctx context.Context, store *db.DB, client *http.Client) {
	events, err := store.GetPendingEvents()
	if err != nil {
		log.Printf("[poller] failed to get pending events: %v", err)
		return
	}

	if len(events) == 0 {
		return
	}

	log.Printf("[poller] polling %d pending events", len(events))

	now := time.Now().Unix()

	for i := range events {
		select {
		case <-ctx.Done():
			return
		default:
		}

		// Auto-fail events that have been pending longer than maxPendingAge.
		eventAge := time.Duration(now-events[i].Timestamp) * time.Second
		if eventAge > maxPendingAge {
			log.Printf("[poller] tx %s (%s) exceeded max pending age (%s), marking as failed",
				events[i].TxHash, events[i].Provider, maxPendingAge)
			if err := store.UpdateEventStatus(events[i].TxHash, "failed", "", "Timed out: no status update within "+maxPendingAge.String(), ""); err != nil {
				log.Printf("[poller] failed to mark tx %s as timed out: %v", events[i].TxHash, err)
			}
			continue
		}

		if err := pollEvent(ctx, store, client, &events[i]); err != nil {
			log.Printf("[poller] error polling tx %s (%s): %v", events[i].TxHash, events[i].Provider, err)
		}
	}
}

// pollEvent polls the downstream API for a single event and updates the database.
func pollEvent(ctx context.Context, store *db.DB, client *http.Client, event *types.IndexedBridgeEvent) error {
	switch event.Provider {
	case "cctp":
		return pollCCTP(ctx, store, client, event)
	case "usdt0":
		return pollLayerZero(ctx, store, client, event)
	case "near-intents":
		return pollNEAR(ctx, store, client, event)
	default:
		log.Printf("[poller] unknown provider %q for tx %s, skipping", event.Provider, event.TxHash)
		return nil
	}
}

// pollCCTP polls the Circle Iris API for CCTP transaction status.
// Endpoint: GET https://iris-api.circle.com/v2/messages/{sourceDomain}/{txHash}
func pollCCTP(ctx context.Context, store *db.DB, client *http.Client, event *types.IndexedBridgeEvent) error {
	sourceDomain, ok := cctpDomainMap[event.ChainID]
	if !ok {
		return fmt.Errorf("no CCTP domain mapping for chain %d", event.ChainID)
	}

	url := fmt.Sprintf("%s/v2/messages/%d/%s", cctpBaseURL, sourceDomain, event.TxHash)

	body, err := doGet(ctx, client, url)
	if err != nil {
		// API error — log and skip, retry next cycle.
		return fmt.Errorf("iris API request: %w", err)
	}

	var resp irisResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return fmt.Errorf("parse iris response: %w", err)
	}

	if len(resp.Messages) == 0 {
		// No messages yet — still pending, update last polled time.
		return store.UpdateLastPolledAt(event.TxHash, time.Now().Unix())
	}

	msg := resp.Messages[0]
	status := strings.ToLower(msg.Status)

	switch status {
	case "complete":
		destTx := msg.DestTxHash
		if destTx == "" {
			destTx = msg.DestinationTx
		}
		return store.UpdateEventStatus(event.TxHash, "done", destTx, "", "")
	default:
		// Still in progress — update last polled time.
		return store.UpdateLastPolledAt(event.TxHash, time.Now().Unix())
	}
}

// pollLayerZero polls the LayerZero Scan API for USDT0 transaction status.
// Endpoint: GET https://scan.layerzero-api.com/v1/messages/tx/{txHash}
func pollLayerZero(ctx context.Context, store *db.DB, client *http.Client, event *types.IndexedBridgeEvent) error {
	url := fmt.Sprintf("%s/v1/messages/tx/%s", lzScanBaseURL, event.TxHash)

	body, err := doGet(ctx, client, url)
	if err != nil {
		return fmt.Errorf("layerzero scan API request: %w", err)
	}

	var resp lzScanResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return fmt.Errorf("parse layerzero response: %w", err)
	}

	if len(resp.Messages) == 0 {
		return store.UpdateLastPolledAt(event.TxHash, time.Now().Unix())
	}

	msg := resp.Messages[0]
	status := strings.ToUpper(msg.Status)

	switch status {
	case "DELIVERED":
		return store.UpdateEventStatus(event.TxHash, "done", msg.DstTx.TxHash, "", "")
	case "FAILED":
		return store.UpdateEventStatus(event.TxHash, "failed", "", "LayerZero message delivery failed", "")
	default:
		return store.UpdateLastPolledAt(event.TxHash, time.Now().Unix())
	}
}

// pollNEAR polls the NEAR 1Click status API for NEAR Intents transaction status.
// The 1Click API uses depositAddress (not txHash) as the lookup key.
// The deposit address is ABI-encoded in providerData: abi.encode(address).
// Endpoint: GET https://1click.chaindefuser.com/v0/status?depositAddress={addr}
func pollNEAR(ctx context.Context, store *db.DB, client *http.Client, event *types.IndexedBridgeEvent) error {
	// Extract deposit address from providerData (ABI-encoded address = 32 bytes, address in last 20)
	depositAddr, err := extractDepositAddress(event.ProviderData)
	if err != nil {
		return fmt.Errorf("extract deposit address from providerData: %w", err)
	}

	url := fmt.Sprintf("%s/v0/status?depositAddress=%s", nearBaseURL, depositAddr)

	body, err := doGet(ctx, client, url)
	if err != nil {
		// 404 means the deposit address isn't known to 1Click yet (or was never a real
		// deposit address, e.g. in testing). Treat as still pending, don't log as error.
		if strings.Contains(err.Error(), "status 404") {
			return store.UpdateLastPolledAt(event.TxHash, time.Now().Unix())
		}
		return fmt.Errorf("near 1click API request: %w", err)
	}

	var resp nearStatusResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return fmt.Errorf("parse near response: %w", err)
	}

	status := strings.ToUpper(resp.Status)

	switch status {
	case "COMPLETED", "SUCCESS":
		return store.UpdateEventStatus(event.TxHash, "done", resp.TxHash, "", resp.SwapDetails.AmountOut)
	case "FAILED":
		reason := resp.Reason
		if reason == "" {
			reason = "NEAR Intents transaction failed"
		}
		return store.UpdateEventStatus(event.TxHash, "failed", "", reason, "")
	case "REFUNDED":
		reason := resp.Reason
		if reason == "" {
			reason = "NEAR Intents transaction refunded"
		}
		return store.UpdateEventStatus(event.TxHash, "failed", "", reason, "")
	default:
		return store.UpdateLastPolledAt(event.TxHash, time.Now().Unix())
	}
}

// extractDepositAddress extracts the deposit address from ABI-encoded providerData.
// providerData is hex-encoded (with 0x prefix): abi.encode(address) = 32 bytes,
// where the address occupies the last 20 bytes.
func extractDepositAddress(providerData string) (string, error) {
	data := strings.TrimPrefix(providerData, "0x")
	if len(data) < 64 {
		return "", fmt.Errorf("providerData too short: %d hex chars", len(data))
	}
	// ABI-encoded address is 32 bytes (64 hex chars), address is in the last 20 bytes (40 hex chars)
	b, err := hex.DecodeString(data[:64])
	if err != nil {
		return "", fmt.Errorf("decode hex: %w", err)
	}
	addr := common.BytesToAddress(b)
	return addr.Hex(), nil
}

// doGet performs an HTTP GET request and returns the response body.
// Returns an error on non-2xx status codes or network failures.
func doGet(ctx context.Context, client *http.Client, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
}
