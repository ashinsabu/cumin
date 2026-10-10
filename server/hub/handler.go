package hub

import (
	"fmt"
	"net/http"
	"time"

	"github.com/ashinsabu/cumin/server/auth"
)

// Handler serves the SSE endpoint for real-time sync.
type Handler struct {
	hub     Notifier
	enabled bool
}

func NewHandler(n Notifier, enabled bool) *Handler {
	return &Handler{hub: n, enabled: enabled}
}

// Events streams change notifications to a connected client.
// On any successful mutation, the client receives "data: ping\n\n"
// and should invalidate its local query cache.
func (h *Handler) Events(w http.ResponseWriter, r *http.Request) {
	if !h.enabled {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, `{"error":"streaming not supported"}`, http.StatusInternalServerError)
		return
	}

	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, `{"error":"user not authenticated"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "retry: 5000\n\n")
	flusher.Flush()

	ch, unsub := h.hub.Subscribe(userID)
	defer unsub()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ch:
			if _, err := fmt.Fprintf(w, "data: ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case <-ticker.C:
			if _, err := fmt.Fprintf(w, ": keepalive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
