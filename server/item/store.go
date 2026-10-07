package item

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Item struct {
	ID              string     `json:"id"`
	BoardID         string     `json:"board_id"`
	ProjectID       *string    `json:"project_id"`
	EpicID          *string    `json:"epic_id"`
	SprintID        *string    `json:"sprint_id"`
	StatusID        string     `json:"status_id"`
	DisplayID       string     `json:"display_id"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	Priority        int        `json:"priority"`
	EstimateMinutes *int       `json:"estimate_minutes"`
	Position        int        `json:"position"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`

	// Enriched (computed from JOINs, not stored)
	EpicName            *string `json:"epic_name"`
	EpicColor           *string `json:"epic_color"`
	TimeInStatusMinutes int     `json:"time_in_status_minutes"`
}

type StatusTransition struct {
	ID             string    `json:"id"`
	ItemID         string    `json:"item_id"`
	FromStatusID   *string   `json:"from_status_id"`
	ToStatusID     string    `json:"to_status_id"`
	TransitionedAt time.Time `json:"transitioned_at"`
}

type Store struct {
	DB *pgxpool.Pool
}

const itemCols = `id, board_id, project_id, epic_id, sprint_id, status_id, display_id,
	title, description, priority, estimate_minutes, position, created_at, updated_at`

const itemAliasedCols = `i.id, i.board_id, i.project_id, i.epic_id, i.sprint_id, i.status_id, i.display_id,
	i.title, i.description, i.priority, i.estimate_minutes, i.position, i.created_at, i.updated_at`

// itemEnrichedCols uses LATERAL join (not correlated scalar subquery) to avoid N+1 index scans.
// Callers must include "LEFT JOIN LATERAL (...) t ON true" in their FROM clause.
const itemEnrichedCols = itemAliasedCols + `,
	e.name, e.color,
	COALESCE(EXTRACT(EPOCH FROM (NOW() - t.transitioned_at)) / 60, 0)::int`

const itemLateralJoin = `LEFT JOIN LATERAL (
	SELECT transitioned_at FROM status_transitions
	WHERE item_id = i.id ORDER BY transitioned_at DESC LIMIT 1
) t ON true`

func scanItemEnriched(row interface{ Scan(...any) error }) (*Item, error) {
	var it Item
	err := row.Scan(&it.ID, &it.BoardID, &it.ProjectID, &it.EpicID, &it.SprintID, &it.StatusID, &it.DisplayID,
		&it.Title, &it.Description, &it.Priority, &it.EstimateMinutes, &it.Position, &it.CreatedAt, &it.UpdatedAt,
		&it.EpicName, &it.EpicColor, &it.TimeInStatusMinutes)
	if err != nil {
		return nil, err
	}
	return &it, nil
}

func scanItemBase(row interface{ Scan(...any) error }) (*Item, error) {
	var it Item
	err := row.Scan(&it.ID, &it.BoardID, &it.ProjectID, &it.EpicID, &it.SprintID, &it.StatusID, &it.DisplayID,
		&it.Title, &it.Description, &it.Priority, &it.EstimateMinutes, &it.Position, &it.CreatedAt, &it.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &it, nil
}

// FilterParams controls optional server-side filtering for item list queries.
// Nil pointer fields are ignored (no filter applied for that dimension).
type FilterParams struct {
	SprintID  *string // filter to specific sprint
	ProjectID *string // filter to specific project
	EpicID    *string // filter to specific epic
	StatusID  *string // filter to specific status
	Priority  *int    // filter to specific priority level
	HideDone  bool    // exclude items whose status has is_done=true
}

func (s *Store) List(ctx context.Context, boardID string, f FilterParams) ([]Item, error) {
	query := `SELECT ` + itemEnrichedCols + ` FROM items i LEFT JOIN epics e ON i.epic_id = e.id ` + itemLateralJoin + ` WHERE i.board_id = $1 AND i.deleted_at IS NULL`
	args := []any{boardID}
	n := 2 // next placeholder index

	add := func(clause string, val any) {
		query += fmt.Sprintf(clause, n)
		args = append(args, val)
		n++
	}

	if f.SprintID != nil {
		add(` AND i.sprint_id = $%d`, *f.SprintID)
	}
	if f.ProjectID != nil {
		add(` AND i.project_id = $%d`, *f.ProjectID)
	}
	if f.EpicID != nil {
		add(` AND i.epic_id = $%d`, *f.EpicID)
	}
	if f.StatusID != nil {
		add(` AND i.status_id = $%d`, *f.StatusID)
	}
	if f.Priority != nil {
		add(` AND i.priority = $%d`, *f.Priority)
	}
	if f.HideDone {
		query += ` AND i.status_id NOT IN (SELECT id FROM statuses WHERE board_id = $1 AND is_done = true)`
	}
	query += ` ORDER BY i.priority, i.position, i.created_at`

	rows, err := s.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Item
	for rows.Next() {
		it, err := scanItemEnriched(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *it)
	}
	return out, nil
}

func (s *Store) Backlog(ctx context.Context, boardID string) ([]Item, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT `+itemEnrichedCols+` FROM items i LEFT JOIN epics e ON i.epic_id = e.id `+itemLateralJoin+`
		WHERE i.board_id = $1 AND i.sprint_id IS NULL AND i.deleted_at IS NULL
		  AND i.status_id NOT IN (SELECT id FROM statuses WHERE board_id = $1 AND is_done = true)
		ORDER BY i.priority, i.position
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Item
	for rows.Next() {
		it, err := scanItemEnriched(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *it)
	}
	return out, nil
}

func (s *Store) GetByID(ctx context.Context, id string) (*Item, error) {
	row := s.DB.QueryRow(ctx, `SELECT `+itemEnrichedCols+` FROM items i LEFT JOIN epics e ON i.epic_id = e.id `+itemLateralJoin+` WHERE i.id = $1 AND i.deleted_at IS NULL`, id)
	return scanItemEnriched(row)
}

// Create inserts item + logs initial transition. Returns created item.
func (s *Store) Create(ctx context.Context, boardID, displayID, statusID, title, description string, epicID, sprintID, projectID *string, priority int, estimate *int) (*Item, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	row := tx.QueryRow(ctx, `
		INSERT INTO items (board_id, project_id, epic_id, sprint_id, status_id, display_id, title, description, priority, estimate_minutes, position)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
			COALESCE((SELECT MAX(position)+1 FROM items WHERE board_id = $1 AND status_id = $5), 0))
		RETURNING `+itemCols, boardID, projectID, epicID, sprintID, statusID, displayID, title, description, priority, estimate)
	it, err := scanItemBase(row)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO status_transitions (item_id, from_status_id, to_status_id)
		VALUES ($1, NULL, $2)
	`, it.ID, statusID)
	if err != nil {
		return nil, err
	}

	return it, tx.Commit(ctx)
}

func (s *Store) Update(ctx context.Context, id, title, description string, epicID, sprintID *string, priority int, estimate *int) (*Item, error) {
	row := s.DB.QueryRow(ctx, `
		UPDATE items SET title = $2, description = $3, epic_id = $4, sprint_id = $5,
		       priority = $6, estimate_minutes = $7, updated_at = NOW()
		WHERE id = $1
		RETURNING `+itemCols, id, title, description, epicID, sprintID, priority, estimate)
	return scanItemBase(row)
}

// Move changes status + logs transition. Atomic.
func (s *Store) Move(ctx context.Context, id, toStatusID string) (*Item, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var fromStatusID string
	err = tx.QueryRow(ctx, `SELECT status_id FROM items WHERE id = $1`, id).Scan(&fromStatusID)
	if err != nil {
		return nil, err
	}

	if fromStatusID == toStatusID {
		tx.Rollback(ctx)
		return s.GetByID(ctx, id)
	}

	row := tx.QueryRow(ctx, `
		UPDATE items SET status_id = $2,
			position = COALESCE((SELECT MAX(position)+1 FROM items WHERE board_id = (SELECT board_id FROM items WHERE id = $1) AND status_id = $2), 0),
			updated_at = NOW()
		WHERE id = $1
		RETURNING `+itemCols, id, toStatusID)
	it, err := scanItemBase(row)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO status_transitions (item_id, from_status_id, to_status_id)
		VALUES ($1, $2, $3)
	`, id, fromStatusID, toStatusID)
	if err != nil {
		return nil, err
	}

	return it, tx.Commit(ctx)
}

func (s *Store) Reorder(ctx context.Context, boardID, statusID string, ids []string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for i, id := range ids {
		_, err := tx.Exec(ctx, `
			UPDATE items SET position = $1, updated_at = NOW()
			WHERE id = $2 AND board_id = $3 AND status_id = $4
		`, i, id, boardID, statusID)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) SoftDelete(ctx context.Context, id string) error {
	_, err := s.DB.Exec(ctx, `UPDATE items SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, id)
	return err
}

// CreateForProject atomically: validates project ownership via board_id, increments the project
// item sequence, inserts the item, and logs the initial status transition — all in one transaction.
// This eliminates the TOCTOU gap where seq could be leaked if the INSERT fails.
func (s *Store) CreateForProject(ctx context.Context, boardID, projectID, statusID, title, description string, epicID, sprintID *string, priority int, estimate *int) (*Item, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var seq int64
	var prefix string
	err = tx.QueryRow(ctx, `
		UPDATE projects SET item_seq = item_seq + 1
		WHERE id = $1 AND board_id = $2
		RETURNING item_seq, prefix
	`, projectID, boardID).Scan(&seq, &prefix)
	if err != nil {
		return nil, fmt.Errorf("project not found or not owned by this board")
	}
	displayID := fmt.Sprintf("%s-%d", prefix, seq)

	pid := &projectID
	row := tx.QueryRow(ctx, `
		INSERT INTO items (board_id, project_id, epic_id, sprint_id, status_id, display_id,
		                   title, description, priority, estimate_minutes, position)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
		    COALESCE((SELECT MAX(position)+1 FROM items WHERE board_id = $1 AND status_id = $5), 0))
		RETURNING `+itemCols,
		boardID, pid, epicID, sprintID, statusID, displayID, title, description, priority, estimate)
	it, err := scanItemBase(row)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO status_transitions (item_id, from_status_id, to_status_id)
		VALUES ($1, NULL, $2)
	`, it.ID, statusID)
	if err != nil {
		return nil, err
	}

	return it, tx.Commit(ctx)
}

// EpicBelongsToBoard checks that the given epic is owned by the given board.
func (s *Store) EpicBelongsToBoard(ctx context.Context, epicID, boardID string) (bool, error) {
	var exists bool
	err := s.DB.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM epics WHERE id = $1 AND board_id = $2)`, epicID, boardID,
	).Scan(&exists)
	return exists, err
}

// SprintBelongsToBoard checks that the given sprint is owned by the given board.
func (s *Store) SprintBelongsToBoard(ctx context.Context, sprintID, boardID string) (bool, error) {
	var exists bool
	err := s.DB.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM sprints WHERE id = $1 AND board_id = $2)`, sprintID, boardID,
	).Scan(&exists)
	return exists, err
}

func (s *Store) Transitions(ctx context.Context, itemID string) ([]StatusTransition, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, item_id, from_status_id, to_status_id, transitioned_at
		FROM status_transitions WHERE item_id = $1 ORDER BY transitioned_at
	`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []StatusTransition
	for rows.Next() {
		var t StatusTransition
		if err := rows.Scan(&t.ID, &t.ItemID, &t.FromStatusID, &t.ToStatusID, &t.TransitionedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, nil
}

func (s *Store) Restore(ctx context.Context, id, boardID string) error {
	tag, err := s.DB.Exec(ctx, `
		UPDATE items SET deleted_at = NULL
		WHERE id = $1 AND board_id = $2 AND deleted_at IS NOT NULL
	`, id, boardID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
