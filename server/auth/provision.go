package auth

import (
	"context"
	"fmt"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Provisioner struct {
	db *pgxpool.Pool
}

func NewProvisioner(db *pgxpool.Pool) *Provisioner {
	return &Provisioner{db: db}
}

// defaultProjectName returns the user's display name cleaned for use as a project name,
// falling back to "Personal" if empty.
func defaultProjectName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "Personal"
	}
	return name
}

// defaultProjectPrefix returns the first 3 uppercase alphanumeric chars from name,
// falling back to "PRJ" if name yields fewer than 1 char.
func defaultProjectPrefix(name string) string {
	var chars []rune
	for _, r := range strings.ToUpper(name) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			chars = append(chars, r)
			if len(chars) == 3 {
				break
			}
		}
	}
	if len(chars) == 0 {
		return "PRJ"
	}
	return string(chars)
}

// ProvisionNewUser creates the full default setup for a new user:
// board → statuses → default project (named after the user) → Study epic → 2 starter items.
// Idempotent via ON CONFLICT (user_id) DO NOTHING on the board insert.
// If a concurrent login already provisioned this user, returns nil immediately.
func (p *Provisioner) ProvisionNewUser(ctx context.Context, userID, name string) error {
	tx, err := p.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// RACE-001 fix: guard against concurrent provisioning via a unique sentinel row in users.
	// Boards table no longer exists (dropped in migration 017).
	// We use INSERT INTO statuses ON CONFLICT to detect re-provisioning.
	var existingCount int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM statuses WHERE user_id = $1`, userID).Scan(&existingCount); err != nil {
		return fmt.Errorf("check existing statuses: %w", err)
	}
	if existingCount > 0 {
		return nil // already provisioned
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
			INSERT INTO statuses (user_id, name, position, is_initial, is_done)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id
		`, userID, s.name, s.position, s.isInitial, s.isDone).Scan(&sid); err != nil {
			return fmt.Errorf("create status %s: %w", s.name, err)
		}
		if s.isInitial {
			todoStatusID = sid
		}
	}

	// Default project named after the user
	projName := defaultProjectName(name)
	projPrefix := defaultProjectPrefix(name)
	var projectID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO projects (user_id, name, prefix, color, description, sprint_seq)
		VALUES ($1, $2, $3, '#6366f1', 'Default project', 0)
		RETURNING id
	`, userID, projName, projPrefix).Scan(&projectID); err != nil {
		return fmt.Errorf("create default project: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO epics (user_id, name, type, color, description)
		VALUES ($1, 'Study', 'recurring', '#6366f1', 'Learning and skill building')
	`, userID); err != nil {
		return fmt.Errorf("create study epic: %w", err)
	}

	_ = todoStatusID

	return tx.Commit(ctx)
}
