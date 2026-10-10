package views

import (
	"encoding/json"
	"time"
)

// SavedView is a named, persisted filter preset scoped to a user.
type SavedView struct {
	ID        string          `json:"id"`
	UserID    string          `json:"user_id"`
	Name      string          `json:"name"`
	Filters   json.RawMessage `json:"filters"`
	Position  int             `json:"position"`
	CreatedAt time.Time       `json:"created_at"`
}
