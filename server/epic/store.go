package epic

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Epic struct {
	ID          string     `json:"id"`
	BoardID     string     `json:"board_id"`
	UserID      string     `json:"user_id"`
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	Color       string     `json:"color"`
	Deadline    *time.Time `json:"deadline"`
	Description string     `json:"description"`
	CreatedAt   time.Time  `json:"created_at"`
}

type TrashEpic struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	DeletedAt time.Time `json:"deleted_at"`
	ItemCount int64     `json:"item_count"`
}

type Store struct {
	DB *pgxpool.Pool
}

func (s *Store) List(ctx context.Context, userID string) ([]Epic, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, board_id, user_id, name, type, color, deadline, description, created_at
		FROM epics WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Epic
	for rows.Next() {
		var e Epic
		if err := rows.Scan(&e.ID, &e.BoardID, &e.UserID, &e.Name, &e.Type, &e.Color, &e.Deadline, &e.Description, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

func (s *Store) GetByID(ctx context.Context, id string) (*Epic, error) {
	var e Epic
	err := s.DB.QueryRow(ctx, `
		SELECT id, board_id, user_id, name, type, color, deadline, description, created_at
		FROM epics WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(&e.ID, &e.BoardID, &e.UserID, &e.Name, &e.Type, &e.Color, &e.Deadline, &e.Description, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *Store) Create(ctx context.Context, boardID, userID, name, typ, color, description string, deadline *time.Time) (*Epic, error) {
	var e Epic
	err := s.DB.QueryRow(ctx, `
		INSERT INTO epics (board_id, user_id, name, type, color, deadline, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, board_id, user_id, name, type, color, deadline, description, created_at
	`, boardID, userID, name, typ, color, deadline, description).Scan(
		&e.ID, &e.BoardID, &e.UserID, &e.Name, &e.Type, &e.Color, &e.Deadline, &e.Description, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *Store) Update(ctx context.Context, id, name, typ, color, description string, deadline *time.Time) (*Epic, error) {
	var e Epic
	err := s.DB.QueryRow(ctx, `
		UPDATE epics SET name = $2, type = $3, color = $4, deadline = $5, description = $6
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, board_id, user_id, name, type, color, deadline, description, created_at
	`, id, name, typ, color, deadline, description).Scan(
		&e.ID, &e.BoardID, &e.UserID, &e.Name, &e.Type, &e.Color, &e.Deadline, &e.Description, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// SoftDelete sets deleted_at on the epic and cascades to its items.
func (s *Store) SoftDelete(ctx context.Context, id, userID string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var ts time.Time
	err = tx.QueryRow(ctx, `
		UPDATE epics SET deleted_at = NOW()
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
		RETURNING deleted_at
	`, id, userID).Scan(&ts)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE items SET deleted_at = $1
		WHERE epic_id = $2 AND deleted_at IS NULL
	`, ts, id)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// RestoreEpic restores the epic and cascade-batch items.
func (s *Store) RestoreEpic(ctx context.Context, id, userID string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var ts time.Time
	err = tx.QueryRow(ctx, `
		SELECT deleted_at FROM epics WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
	`, id, userID).Scan(&ts)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `UPDATE epics SET deleted_at = NULL WHERE id = $1`, id)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE items SET deleted_at = NULL WHERE epic_id = $1 AND deleted_at = $2
	`, id, ts)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (s *Store) ListTrashEpics(ctx context.Context, userID string) ([]TrashEpic, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT e.id, e.name, e.color, e.deleted_at, COUNT(i.id) AS item_count
		FROM epics e
		LEFT JOIN items i ON i.epic_id = e.id AND i.deleted_at IS NOT NULL
		WHERE e.user_id = $1 AND e.deleted_at IS NOT NULL
		GROUP BY e.id, e.name, e.color, e.deleted_at
		ORDER BY e.deleted_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []TrashEpic
	for rows.Next() {
		var t TrashEpic
		if err := rows.Scan(&t.ID, &t.Name, &t.Color, &t.DeletedAt, &t.ItemCount); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, nil
}
