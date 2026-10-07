package hub

import (
	"fmt"
	"net/http"
	"time"

	"github.com/ashinsabu/cumin/server/board"
)

// Handler serves the SSE endpoint for real-time board sync.
type Handler struct {
	hub     Notifier
	enabled bool // controlled by FEATURE_FLAGS=realtime
}

func NewHandler(n Notifier, enabled bool) *Handler {
	return &Handler{hub: n, enabled: enabled}
}

// Events streams change notifications to a connected client.
// On any successful mutation to the board, the client receives "data: ping\n\n"
// and should invalidate its local query cache.
//
// @Summary      Subscribe to board change events
// @Tags         meta
// @Produce      text/event-stream
// @Success      200  "SSE stream"
// @Failure      404  {object}  api.ErrorResponse  "feature not enabled"
// @Security     CookieAuth
// @Router       /api/events [get]
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

	boardID := board.IDFromContext(r.Context())
	if boardID == "" {
		http.Error(w, `{"error":"board not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no") // disable Railway/nginx proxy buffering

	ch, unsub := h.hub.Subscribe(boardID)
	defer unsub()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ch:
			if _, err := fmt.Fprintf(w, "data: ping\n\n"); err != nil {
				return // client disconnected
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
