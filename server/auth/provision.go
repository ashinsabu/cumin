package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Provisioner struct {
	db *pgxpool.Pool
}

func NewProvisioner(db *pgxpool.Pool) *Provisioner {
	return &Provisioner{db: db}
}

// ProvisionNewUser creates the full default setup for a new user:
// board → statuses → default project → Study epic → 2 starter items.
// Idempotent via ON CONFLICT (user_id) DO NOTHING on the board insert.
// If a concurrent login already provisioned this user, returns nil immediately.
func (p *Provisioner) ProvisionNewUser(ctx context.Context, userID string) error {
	tx, err := p.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// RACE-001 fix: ON CONFLICT (user_id) DO NOTHING + RETURNING id
	// If the conflict fires (concurrent provision already ran), RETURNING yields no rows → pgx.ErrNoRows.
	var boardID string
	err = tx.QueryRow(ctx, `
		INSERT INTO boards (user_id, name)
		VALUES ($1, 'Life')
		ON CONFLICT (user_id) DO NOTHING
		RETURNING id
	`, userID).Scan(&boardID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // already provisioned by a concurrent request
		}
		return fmt.Errorf("create board: %w", err)
	}

	statuses := []struct {
		name      string
		position  int
		isInitial bool
		isDone    bool
	}{
		{"TODO", 0, true, false},
		{"BLOCKED", 1, false, false},
		{"IN PROGRESS", 2, false, false},
		{"DONE", 3, false, true},
	}

	var todoStatusID string
	for _, s := range statuses {
		var sid string
		if err := tx.QueryRow(ctx, `
			INSERT INTO statuses (board_id, name, position, is_initial, is_done)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id
		`, boardID, s.name, s.position, s.isInitial, s.isDone).Scan(&sid); err != nil {
			return fmt.Errorf("create status %s: %w", s.name, err)
		}
		if s.isInitial {
			todoStatusID = sid
		}
	}

	// Default project
	var projectID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO projects (board_id, name, prefix, color, description)
		VALUES ($1, 'Life', 'LIF', '#6366f1', 'Default project for life goals')
		RETURNING id
	`, boardID).Scan(&projectID); err != nil {
		return fmt.Errorf("create default project: %w", err)
	}

	// Study epic: recurring — the first place new users will add tickets
	var epicID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO epics (board_id, name, type, color, description)
		VALUES ($1, 'Study', 'recurring', '#6366f1', 'Learning and skill building')
		RETURNING id
	`, boardID).Scan(&epicID); err != nil {
		return fmt.Errorf("create study epic: %w", err)
	}

	// Two starter items to give the board something to look at on first login
	starters := []struct{ title, desc string }{
		{"Read for 30 min", "Daily reading habit — any book or article"},
		{"Practice problems", "Solve at least one coding or learning problem"},
	}
	for _, item := range starters {
		var seq int64
		var prefix string
		if err := tx.QueryRow(ctx, `
			UPDATE projects SET item_seq = item_seq + 1
			WHERE id = $1 RETURNING item_seq, prefix
		`, projectID).Scan(&seq, &prefix); err != nil {
			return fmt.Errorf("increment project seq for %q: %w", item.title, err)
		}
		displayID := fmt.Sprintf("%s-%d", prefix, seq)

		var itemID string
		if err := tx.QueryRow(ctx, `
			INSERT INTO items (board_id, project_id, epic_id, sprint_id, status_id, display_id,
			                   title, description, priority, position)
			VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 4,
			    COALESCE((SELECT MAX(position)+1 FROM items WHERE board_id = $1 AND status_id = $4), 0))
			RETURNING id
		`, boardID, projectID, epicID, todoStatusID, displayID, item.title, item.desc).Scan(&itemID); err != nil {
			return fmt.Errorf("create starter item %q: %w", item.title, err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO status_transitions (item_id, from_status_id, to_status_id)
			VALUES ($1, NULL, $2)
		`, itemID, todoStatusID); err != nil {
			return fmt.Errorf("create transition for %q: %w", item.title, err)
		}
	}

	return tx.Commit(ctx)
}
