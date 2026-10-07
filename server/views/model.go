package views

import (
	"encoding/json"
	"time"
)

// SavedView is a named, persisted filter preset scoped to a board.
// Filters are stored as raw JSON so the frontend can evolve the shape
// without requiring a backend migration.
type SavedView struct {
	ID        string          `json:"id"`
	BoardID   string          `json:"board_id"`
	Name      string          `json:"name"`
	Filters   json.RawMessage `json:"filters"`
	Position  int             `json:"position"`
	CreatedAt time.Time       `json:"created_at"`
}
