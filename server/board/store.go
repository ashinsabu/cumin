package board

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Status is user-scoped. board_id column was dropped in migration 017.
type Status struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id"`
	Name      string `json:"name"`
	Position  int    `json:"position"`
	IsInitial bool   `json:"is_initial"`
	IsDone    bool   `json:"is_done"`
}

type Store struct {
	DB *pgxpool.Pool
}

func (s *Store) ListStatuses(ctx context.Context, userID string) ([]Status, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, user_id, name, position, is_initial, is_done
		FROM statuses WHERE user_id = $1 ORDER BY position
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Status
	for rows.Next() {
		var st Status
		if err := rows.Scan(&st.ID, &st.UserID, &st.Name, &st.Position, &st.IsInitial, &st.IsDone); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, nil
}

func (s *Store) CreateStatus(ctx context.Context, userID, name string, position int, isInitial, isDone bool) (*Status, error) {
	var st Status
	err := s.DB.QueryRow(ctx, `
		INSERT INTO statuses (user_id, name, position, is_initial, is_done)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, user_id, name, position, is_initial, is_done
	`, userID, name, position, isInitial, isDone).Scan(
		&st.ID, &st.UserID, &st.Name, &st.Position, &st.IsInitial, &st.IsDone)
	if err != nil {
		return nil, err
	}
	return &st, nil
}

func (s *Store) DeleteStatusSafe(ctx context.Context, id, userID string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `SELECT id, is_done, is_initial FROM statuses WHERE user_id = $1 FOR UPDATE`, userID)
	if err != nil {
		return err
	}
	var target *struct{ isDone, isInitial bool }
	doneCount, initialCount := 0, 0
	for rows.Next() {
		var sid string
		var isDone, isInitial bool
		if err := rows.Scan(&sid, &isDone, &isInitial); err != nil {
			rows.Close()
			return err
		}
		if isDone {
			doneCount++
		}
		if isInitial {
			initialCount++
		}
		if sid == id {
			target = &struct{ isDone, isInitial bool }{isDone, isInitial}
		}
	}
	rows.Close()

	if target == nil {
		return &notFoundErr{msg: "status not found"}
	}
	if target.isDone && doneCount == 1 {
		return &conflictErr{msg: "cannot delete the last done status"}
	}
	if target.isInitial && initialCount == 1 {
		return &conflictErr{msg: "cannot delete the last initial status"}
	}

	var itemCount int64
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM items WHERE status_id = $1`, id).Scan(&itemCount); err != nil {
		return err
	}
	if itemCount > 0 {
		return &conflictErr{msg: fmt.Sprintf("status has %d item(s) — reassign them first", itemCount)}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM statuses WHERE id = $1 AND user_id = $2`, id, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type notFoundErr struct{ msg string }
type conflictErr struct{ msg string }

func (e *notFoundErr) Error() string { return e.msg }
func (e *conflictErr) Error() string { return e.msg }

func (s *Store) ReorderStatuses(ctx context.Context, userID string, ids []string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `UPDATE statuses SET position = -(position + 1) WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	for i, id := range ids {
		_, err = tx.Exec(ctx, `UPDATE statuses SET position = $1 WHERE id = $2 AND user_id = $3`, i, id, userID)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) DoneStatusIDs(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.DB.Query(ctx, `SELECT id FROM statuses WHERE user_id = $1 AND is_done = true`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func (s *Store) InitialStatusID(ctx context.Context, userID string) (string, error) {
	var id string
	err := s.DB.QueryRow(ctx, `
		SELECT id FROM statuses WHERE user_id = $1 AND is_initial = true LIMIT 1
	`, userID).Scan(&id)
	if err != nil {
		err = s.DB.QueryRow(ctx, `
			SELECT id FROM statuses WHERE user_id = $1 ORDER BY position LIMIT 1
		`, userID).Scan(&id)
	}
	return id, err
}
