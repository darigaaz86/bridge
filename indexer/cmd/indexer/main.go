package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/aspect-build/qorebridge-indexer/api"
	"github.com/aspect-build/qorebridge-indexer/db"
	"github.com/aspect-build/qorebridge-indexer/listener"
	"github.com/aspect-build/qorebridge-indexer/poller"
	"github.com/aspect-build/qorebridge-indexer/types"
)

func main() {
	// Load configuration from environment variables.
	databaseURL := envOrDefault("DATABASE_URL", "postgres://qorebridge:changeme@localhost:5432/qorebridge?sslmode=disable")
	apiPort := envOrDefault("API_PORT", "8080")
	pollInterval := parseDurationSeconds(envOrDefault("POLL_INTERVAL", "10"))
	statusPollInterval := parseDurationSeconds(envOrDefault("STATUS_POLL_INTERVAL", "10"))

	chains, err := parseChainsConfig(os.Getenv("CHAINS"))
	if err != nil {
		log.Fatalf("failed to parse CHAINS config: %v", err)
	}

	config := types.IndexerConfig{
		Chains:             chains,
		PollInterval:       pollInterval,
		StatusPollInterval: statusPollInterval,
	}

	// Initialize database.
	store, err := db.New(databaseURL)
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer store.Close()

	// Set up graceful shutdown on SIGINT/SIGTERM.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	log.Printf("QoreBridge Indexer starting")
	log.Printf("Database: PostgreSQL")
	log.Printf("API port: %s", apiPort)
	log.Printf("Poll interval: %s", pollInterval)
	log.Printf("Status poll interval: %s", statusPollInterval)
	log.Printf("Chains configured: %d", len(chains))

	// Start event listener in a goroutine.
	go listener.StartListener(ctx, store, config)

	// Start status poller in a goroutine.
	go poller.StartPoller(ctx, store, config)

	// Start HTTP API server.
	router := api.NewRouter(store)
	srv := &http.Server{
		Addr:    ":" + apiPort,
		Handler: router,
	}

	// Run server in a goroutine so we can listen for shutdown signals.
	go func() {
		log.Printf("API server listening on :%s", apiPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("API server error: %v", err)
		}
	}()

	// Block until shutdown signal.
	<-ctx.Done()
	log.Println("Shutting down...")

	// Give the HTTP server a grace period to finish in-flight requests.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	log.Println("QoreBridge Indexer stopped")
}

// envOrDefault returns the value of the environment variable named by key,
// or defaultVal if the variable is not set or empty.
func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// parseDurationSeconds parses a string as an integer number of seconds and
// returns the corresponding time.Duration.
func parseDurationSeconds(s string) time.Duration {
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return 10 * time.Second
	}
	return time.Duration(n) * time.Second
}

// parseChainsConfig parses the CHAINS environment variable as a JSON array of
// ChainConfig objects. Returns an empty slice if the input is empty.
func parseChainsConfig(raw string) ([]types.ChainConfig, error) {
	if raw == "" {
		return nil, nil
	}
	var chains []types.ChainConfig
	if err := json.Unmarshal([]byte(raw), &chains); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	return chains, nil
}
