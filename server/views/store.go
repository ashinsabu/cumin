package views

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

var errNotFound = errors.New("view not found")

type Store struct {
	DB *pgxpool.Pool
}

func (s *Store) List(ctx context.Context, boardID string) ([]SavedView, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, board_id, name, filters, position, created_at
		FROM saved_views
		WHERE board_id = $1
		ORDER BY position, created_at
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SavedView
	for rows.Next() {
		var v SavedView
		if err := rows.Scan(&v.ID, &v.BoardID, &v.Name, &v.Filters, &v.Position, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

func (s *Store) Create(ctx context.Context, boardID, name string, filters json.RawMessage) (*SavedView, error) {
	// Position = current max + 1 so new views append at the bottom.
	var v SavedView
	err := s.DB.QueryRow(ctx, `
		INSERT INTO saved_views (board_id, name, filters, position)
		VALUES ($1, $2, $3, COALESCE((SELECT MAX(position)+1 FROM saved_views WHERE board_id = $1), 0))
		RETURNING id, board_id, name, filters, position, created_at
	`, boardID, name, filters).Scan(&v.ID, &v.BoardID, &v.Name, &v.Filters, &v.Position, &v.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func (s *Store) Delete(ctx context.Context, id, boardID string) error {
	tag, err := s.DB.Exec(ctx, `DELETE FROM saved_views WHERE id = $1 AND board_id = $2`, id, boardID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errNotFound
	}
	return nil
}
