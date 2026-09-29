package epic

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Epic struct {
	ID          string     `json:"id"`
	BoardID     string     `json:"board_id"`
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	Color       string     `json:"color"`
	Deadline    *time.Time `json:"deadline"`
	Description string     `json:"description"`
	CreatedAt   time.Time  `json:"created_at"`
}

type Store struct {
	DB *pgxpool.Pool
}

func (s *Store) List(ctx context.Context, boardID string) ([]Epic, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, board_id, name, type, color, deadline, description, created_at
		FROM epics WHERE board_id = $1 ORDER BY created_at
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Epic
	for rows.Next() {
		var e Epic
		if err := rows.Scan(&e.ID, &e.BoardID, &e.Name, &e.Type, &e.Color, &e.Deadline, &e.Description, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

func (s *Store) GetByID(ctx context.Context, id string) (*Epic, error) {
	var e Epic
	err := s.DB.QueryRow(ctx, `
		SELECT id, board_id, name, type, color, deadline, description, created_at
		FROM epics WHERE id = $1
	`, id).Scan(&e.ID, &e.BoardID, &e.Name, &e.Type, &e.Color, &e.Deadline, &e.Description, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *Store) Create(ctx context.Context, boardID, name, typ, color, description string, deadline *time.Time) (*Epic, error) {
	var e Epic
	err := s.DB.QueryRow(ctx, `
		INSERT INTO epics (board_id, name, type, color, deadline, description)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, board_id, name, type, color, deadline, description, created_at
	`, boardID, name, typ, color, deadline, description).Scan(
		&e.ID, &e.BoardID, &e.Name, &e.Type, &e.Color, &e.Deadline, &e.Description, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *Store) Update(ctx context.Context, id, name, typ, color, description string, deadline *time.Time) (*Epic, error) {
	var e Epic
	err := s.DB.QueryRow(ctx, `
		UPDATE epics SET name = $2, type = $3, color = $4, deadline = $5, description = $6
		WHERE id = $1
		RETURNING id, board_id, name, type, color, deadline, description, created_at
	`, id, name, typ, color, deadline, description).Scan(
		&e.ID, &e.BoardID, &e.Name, &e.Type, &e.Color, &e.Deadline, &e.Description, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *Store) Delete(ctx context.Context, id string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM epics WHERE id = $1`, id)
	return err
}
