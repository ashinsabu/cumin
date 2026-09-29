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

type Store struct {
	DB *pgxpool.Pool
}

func (s *Store) List(ctx context.Context, boardID string) ([]Project, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, board_id, name, prefix, item_seq, color, description, created_at
		FROM projects WHERE board_id = $1 ORDER BY created_at
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
		FROM projects WHERE id = $1
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
		WHERE id = $1
		RETURNING id, board_id, name, prefix, item_seq, color, description, created_at
	`, id, name, color, description).Scan(
		&p.ID, &p.BoardID, &p.Name, &p.Prefix, &p.ItemSeq, &p.Color, &p.Description, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) Delete(ctx context.Context, id string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM projects WHERE id = $1`, id)
	return err
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
