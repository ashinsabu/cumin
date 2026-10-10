package board

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Board struct {
	ID                      string     `json:"id"`
	UserID                  string     `json:"user_id"`
	Name                    string     `json:"name"`
	SprintCadenceDays       int        `json:"sprint_cadence_days"`
	SprintStartDay          int        `json:"sprint_start_day"`
	AvailableHoursPerSprint int        `json:"available_hours_per_sprint"`
	ItemSeq                 int64      `json:"item_seq"`
	CreatedAt               time.Time  `json:"created_at"`
	UpdatedAt               time.Time  `json:"updated_at"`
}

type Status struct {
	ID        string    `json:"id"`
	BoardID   string    `json:"board_id"`
	Name      string    `json:"name"`
	Position  int       `json:"position"`
	IsInitial bool      `json:"is_initial"`
	IsDone    bool      `json:"is_done"`
	CreatedAt time.Time `json:"created_at"`
}

type Store struct {
	DB *pgxpool.Pool
}

func (s *Store) GetByUser(ctx context.Context, userID string) (*Board, error) {
	var b Board
	err := s.DB.QueryRow(ctx, `
		SELECT id, user_id, name, sprint_cadence_days, sprint_start_day,
		       available_hours_per_sprint, item_seq, created_at, updated_at
		FROM boards WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1
	`, userID).Scan(&b.ID, &b.UserID, &b.Name, &b.SprintCadenceDays, &b.SprintStartDay,
		&b.AvailableHoursPerSprint, &b.ItemSeq, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (s *Store) Update(ctx context.Context, id, name string, cadence, startDay, hours int) (*Board, error) {
	var b Board
	err := s.DB.QueryRow(ctx, `
		UPDATE boards SET name = $2, sprint_cadence_days = $3, sprint_start_day = $4,
		       available_hours_per_sprint = $5, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, user_id, name, sprint_cadence_days, sprint_start_day,
		          available_hours_per_sprint, item_seq, created_at, updated_at
	`, id, name, cadence, startDay, hours).Scan(&b.ID, &b.UserID, &b.Name, &b.SprintCadenceDays, &b.SprintStartDay,
		&b.AvailableHoursPerSprint, &b.ItemSeq, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (s *Store) NextSeq(ctx context.Context, boardID string) (int64, error) {
	var seq int64
	err := s.DB.QueryRow(ctx, `
		UPDATE boards SET item_seq = item_seq + 1, updated_at = NOW()
		WHERE id = $1 RETURNING item_seq
	`, boardID).Scan(&seq)
	return seq, err
}

func (s *Store) ListStatuses(ctx context.Context, boardID string) ([]Status, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, board_id, name, position, is_initial, is_done, created_at
		FROM statuses WHERE board_id = $1 ORDER BY position
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Status
	for rows.Next() {
		var st Status
		if err := rows.Scan(&st.ID, &st.BoardID, &st.Name, &st.Position, &st.IsInitial, &st.IsDone, &st.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, nil
}

func (s *Store) CreateStatus(ctx context.Context, boardID, userID, name string, position int, isInitial, isDone bool) (*Status, error) {
	var st Status
	err := s.DB.QueryRow(ctx, `
		INSERT INTO statuses (board_id, user_id, name, position, is_initial, is_done)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, board_id, name, position, is_initial, is_done, created_at
	`, boardID, userID, name, position, isInitial, isDone).Scan(&st.ID, &st.BoardID, &st.Name, &st.Position, &st.IsInitial, &st.IsDone, &st.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &st, nil
}

// DeleteStatusSafe deletes a status inside a transaction, checking all guards atomically:
// - cannot delete last done status
// - cannot delete last initial status
// - cannot delete if items are assigned to it
// Returns api.Error for guard violations.
func (s *Store) DeleteStatusSafe(ctx context.Context, id, boardID string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Lock all statuses for this board to prevent concurrent deletes racing the guards
	rows, err := tx.Query(ctx, `SELECT id, is_done, is_initial FROM statuses WHERE board_id = $1 FOR UPDATE`, boardID)
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

	if _, err := tx.Exec(ctx, `DELETE FROM statuses WHERE id = $1 AND board_id = $2`, id, boardID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type notFoundErr struct{ msg string }
type conflictErr struct{ msg string }

func (e *notFoundErr) Error() string { return e.msg }
func (e *conflictErr) Error() string { return e.msg }

func (s *Store) ReorderStatuses(ctx context.Context, boardID string, ids []string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `UPDATE statuses SET position = -(position + 1) WHERE board_id = $1`, boardID)
	if err != nil {
		return err
	}
	for i, id := range ids {
		_, err = tx.Exec(ctx, `UPDATE statuses SET position = $1 WHERE id = $2 AND board_id = $3`, i, id, boardID)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) DoneStatusIDs(ctx context.Context, boardID string) ([]string, error) {
	rows, err := s.DB.Query(ctx, `SELECT id FROM statuses WHERE board_id = $1 AND is_done = true`, boardID)
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

func (s *Store) InitialStatusID(ctx context.Context, boardID string) (string, error) {
	var id string
	err := s.DB.QueryRow(ctx, `
		SELECT id FROM statuses WHERE board_id = $1 AND is_initial = true LIMIT 1
	`, boardID).Scan(&id)
	if err != nil {
		// Fallback to first by position
		err = s.DB.QueryRow(ctx, `
			SELECT id FROM statuses WHERE board_id = $1 ORDER BY position LIMIT 1
		`, boardID).Scan(&id)
	}
	return id, err
}

func (s *Store) UserPrefix(ctx context.Context, userID string) (string, error) {
	var prefix string
	err := s.DB.QueryRow(ctx, `SELECT id_prefix FROM users WHERE id = $1`, userID).Scan(&prefix)
	return prefix, err
}
