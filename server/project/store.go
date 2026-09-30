package project

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Project struct {
	ID          string    `json:"id"`
	BoardID     string    `json:"board_id"`
	Name        string    `json:"name"`
	Prefix      string    `json:"prefix"`
	ItemSeq     int64     `json:"item_seq"`
	Color       string    `json:"color"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

type TrashProject struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Prefix    string    `json:"prefix"`
	Color     string    `json:"color"`
	DeletedAt time.Time `json:"deleted_at"`
	ItemCount int64     `json:"item_count"`
	EpicCount int64     `json:"epic_count"`
}

type Store struct {
	DB *pgxpool.Pool
}

func (s *Store) List(ctx context.Context, boardID string) ([]Project, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, board_id, name, prefix, item_seq, color, description, created_at
		FROM projects WHERE board_id = $1 AND deleted_at IS NULL ORDER BY created_at
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.BoardID, &p.Name, &p.Prefix, &p.ItemSeq, &p.Color, &p.Description, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

func (s *Store) GetByID(ctx context.Context, id string) (*Project, error) {
	var p Project
	err := s.DB.QueryRow(ctx, `
		SELECT id, board_id, name, prefix, item_seq, color, description, created_at
		FROM projects WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(&p.ID, &p.BoardID, &p.Name, &p.Prefix, &p.ItemSeq, &p.Color, &p.Description, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) Create(ctx context.Context, boardID, name, prefix, color, description string) (*Project, error) {
	var p Project
	err := s.DB.QueryRow(ctx, `
		INSERT INTO projects (board_id, name, prefix, color, description)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, board_id, name, prefix, item_seq, color, description, created_at
	`, boardID, name, prefix, color, description).Scan(
		&p.ID, &p.BoardID, &p.Name, &p.Prefix, &p.ItemSeq, &p.Color, &p.Description, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) Update(ctx context.Context, id, name, color, description string) (*Project, error) {
	var p Project
	err := s.DB.QueryRow(ctx, `
		UPDATE projects SET name = $2, color = $3, description = $4
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, board_id, name, prefix, item_seq, color, description, created_at
	`, id, name, color, description).Scan(
		&p.ID, &p.BoardID, &p.Name, &p.Prefix, &p.ItemSeq, &p.Color, &p.Description, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) ItemCount(ctx context.Context, id string) (int64, error) {
	var count int64
	err := s.DB.QueryRow(ctx, `SELECT COUNT(*) FROM items WHERE project_id = $1 AND deleted_at IS NULL`, id).Scan(&count)
	return count, err
}

// SoftDelete cascades: project → epics → items, all sharing the same deleted_at timestamp.
func (s *Store) SoftDelete(ctx context.Context, id, boardID string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var ts time.Time
	err = tx.QueryRow(ctx, `
		UPDATE projects SET deleted_at = NOW()
		WHERE id = $1 AND board_id = $2 AND deleted_at IS NULL
		RETURNING deleted_at
	`, id, boardID).Scan(&ts)
	if err != nil {
		return err
	}

	// Cascade to epics belonging to this project's board that reference this project
	// (epics belong to board not project, so we cascade items that belong to this project)
	_, err = tx.Exec(ctx, `
		UPDATE epics SET deleted_at = $1
		WHERE board_id = $2 AND deleted_at IS NULL
		AND id IN (SELECT DISTINCT epic_id FROM items WHERE project_id = $3 AND epic_id IS NOT NULL)
	`, ts, boardID, id)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE items SET deleted_at = $1
		WHERE project_id = $2 AND deleted_at IS NULL
	`, ts, id)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// RestoreProject restores project + cascade batch items. Returns 409 on prefix collision.
func (s *Store) RestoreProject(ctx context.Context, id, boardID string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Get the project's prefix and deleted_at
	var prefix string
	var ts time.Time
	err = tx.QueryRow(ctx, `
		SELECT prefix, deleted_at FROM projects WHERE id = $1 AND board_id = $2 AND deleted_at IS NOT NULL
	`, id, boardID).Scan(&prefix, &ts)
	if err != nil {
		return err
	}

	// Check prefix collision
	var conflict bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM projects WHERE board_id = $1 AND prefix = $2 AND deleted_at IS NULL)
	`, boardID, prefix).Scan(&conflict)
	if err != nil {
		return err
	}
	if conflict {
		return &prefixConflictError{Prefix: prefix}
	}

	_, err = tx.Exec(ctx, `UPDATE projects SET deleted_at = NULL WHERE id = $1`, id)
	if err != nil {
		return err
	}

	// Restore items that were cascade-deleted with the same timestamp
	_, err = tx.Exec(ctx, `
		UPDATE items SET deleted_at = NULL WHERE project_id = $1 AND deleted_at = $2
	`, id, ts)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

type prefixConflictError struct {
	Prefix string
}

func (e *prefixConflictError) Error() string {
	return "prefix '" + e.Prefix + "' is in use by another project — rename it before restoring"
}

func IsPrefixConflict(err error) (string, bool) {
	if e, ok := err.(*prefixConflictError); ok {
		return e.Error(), true
	}
	return "", false
}

func (s *Store) ListTrash(ctx context.Context, boardID string) ([]TrashProject, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT p.id, p.name, p.prefix, p.color, p.deleted_at,
		       COUNT(DISTINCT i.id) AS item_count,
		       COUNT(DISTINCT e.id) AS epic_count
		FROM projects p
		LEFT JOIN items i ON i.project_id = p.id AND i.deleted_at IS NOT NULL
		LEFT JOIN epics e ON e.board_id = p.board_id AND e.deleted_at IS NOT NULL
		WHERE p.board_id = $1 AND p.deleted_at IS NOT NULL
		GROUP BY p.id, p.name, p.prefix, p.color, p.deleted_at
		ORDER BY p.deleted_at DESC
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []TrashProject
	for rows.Next() {
		var t TrashProject
		if err := rows.Scan(&t.ID, &t.Name, &t.Prefix, &t.Color, &t.DeletedAt, &t.ItemCount, &t.EpicCount); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, nil
}

// EmptyTrash hard-deletes all soft-deleted rows for this board.
func (s *Store) EmptyTrash(ctx context.Context, boardID string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `DELETE FROM items WHERE board_id = $1 AND deleted_at IS NOT NULL`, boardID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `DELETE FROM epics WHERE board_id = $1 AND deleted_at IS NOT NULL`, boardID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `DELETE FROM projects WHERE board_id = $1 AND deleted_at IS NOT NULL`, boardID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// NextSeq atomically increments and returns the next item sequence for this project.
func (s *Store) NextSeq(ctx context.Context, projectID string) (int64, string, error) {
	var seq int64
	var prefix string
	err := s.DB.QueryRow(ctx, `
		UPDATE projects SET item_seq = item_seq + 1
		WHERE id = $1
		RETURNING item_seq, prefix
	`, projectID).Scan(&seq, &prefix)
	return seq, prefix, err
}
