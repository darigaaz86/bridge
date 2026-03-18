package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/aspect-build/qorebridge-indexer/db"
	"github.com/aspect-build/qorebridge-indexer/types"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
)

// NewRouter returns an http.Handler with the indexer REST API routes.
func NewRouter(store *db.DB) http.Handler {
	r := chi.NewRouter()

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET"},
		AllowedHeaders: []string{"Accept", "Authorization", "Content-Type"},
	}))

	r.Get("/", serveDashboard)
	r.Get("/api/history", handleHistory(store))
	r.Get("/api/history/{txHash}", handleHistoryByTxHash(store))

	return r
}

func handleHistory(store *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		address := r.URL.Query().Get("address")

		limit := 50
		if v := r.URL.Query().Get("limit"); v != "" {
			if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
				limit = parsed
			}
		}

		offset := 0
		if v := r.URL.Query().Get("offset"); v != "" {
			if parsed, err := strconv.Atoi(v); err == nil && parsed >= 0 {
				offset = parsed
			}
		}

		var events []types.IndexedBridgeEvent
		var err error
		if address != "" {
			events, err = store.GetEventsByAddress(address, limit, offset)
		} else {
			events, err = store.GetAllEvents(limit, offset)
		}
		if err != nil {
			http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
			return
		}

		if events == nil {
			events = []types.IndexedBridgeEvent{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(events)
	}
}

func handleHistoryByTxHash(store *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		txHash := chi.URLParam(r, "txHash")

		event, err := store.GetEventByTxHash(txHash)
		if err != nil {
			http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
			return
		}
		if event == nil {
			http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(event)
	}
}
