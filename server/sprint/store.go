package sprint

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Sprint struct {
	ID            string    `json:"id"`
	ProjectID     string    `json:"project_id"`
	Name          string    `json:"name"`
	SprintNumber  int       `json:"sprint_number"`
	StartDate     time.Time `json:"start_date"`
	EndDate       time.Time `json:"end_date"`
	State         string    `json:"state"`
	CreatedAt     time.Time `json:"created_at"`
	DaysTotal     int       `json:"days_total"`
	DaysRemaining int       `json:"days_remaining"`
}

type CloseResult struct {
	SpilledCount int
	NextSprint   *Sprint
}

type Store struct {
	DB *pgxpool.Pool
}

const sprintCols = `id, project_id, name, sprint_number, start_date, end_date, state, created_at`

func scanSprint(row interface{ Scan(...any) error }) (*Sprint, error) {
	var sp Sprint
	if err := row.Scan(&sp.ID, &sp.ProjectID, &sp.Name, &sp.SprintNumber,
		&sp.StartDate, &sp.EndDate, &sp.State, &sp.CreatedAt); err != nil {
		return nil, err
	}
	sp.computeDays()
	return &sp, nil
}

func (sp *Sprint) computeDays() {
	now := time.Now().UTC()
	start := sp.StartDate.UTC()
	end := sp.EndDate.UTC()
	sp.DaysTotal = int(end.Sub(start).Hours()/24) + 1
	if now.Before(start) {
		sp.DaysRemaining = sp.DaysTotal
	} else if now.After(end) {
		sp.DaysRemaining = 0
	} else {
		sp.DaysRemaining = int(end.Sub(now).Hours()/24) + 1
	}
}

// ComputeName derives "Sprint N (Month Half 1/2)" based on which half-month majority of the sprint falls in.
func ComputeName(number int, start, end time.Time) string {
	type bucket struct{ month, half int }
	counts := map[bucket]int{}
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		h := 1
		if d.Day() > 15 {
			h = 2
		}
		counts[bucket{int(d.Month()), h}]++
	}
	best := bucket{int(start.Month()), 1}
	if start.Day() > 15 {
		best.half = 2
	}
	bestCount := 0
	for b, c := range counts {
		if c > bestCount {
			bestCount = c
			best = b
		}
	}
	return fmt.Sprintf("Sprint %d (%s Half %d)", number, time.Month(best.month).String(), best.half)
}

func (s *Store) List(ctx context.Context, projectID string) ([]Sprint, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT `+sprintCols+` FROM sprints WHERE project_id = $1
		ORDER BY sprint_number DESC, start_date DESC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Sprint
	for rows.Next() {
		sp, err := scanSprint(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sp)
	}
	return out, nil
}

func (s *Store) GetActive(ctx context.Context, projectID string) (*Sprint, error) {
	return scanSprint(s.DB.QueryRow(ctx,
		`SELECT `+sprintCols+` FROM sprints WHERE project_id = $1 AND state = 'active'`, projectID))
}

func (s *Store) GetByID(ctx context.Context, id string) (*Sprint, error) {
	return scanSprint(s.DB.QueryRow(ctx,
		`SELECT `+sprintCols+` FROM sprints WHERE id = $1`, id))
}

// CreateNext atomically increments the project's sprint_seq and inserts a new planning sprint.
// Both writes are inside a single transaction — a failed INSERT rolls back the seq increment.
// boardID is kept until Phase 3 drops the column from sprints.
func (s *Store) CreateNext(ctx context.Context, boardID, projectID string, startDate time.Time, cadenceDays int) (*Sprint, error) {
	endDate := startDate.AddDate(0, 0, cadenceDays-1)

	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var seq int
	if err := tx.QueryRow(ctx,
		`UPDATE projects SET sprint_seq = sprint_seq + 1 WHERE id = $1 RETURNING sprint_seq`, projectID,
	).Scan(&seq); err != nil {
		return nil, fmt.Errorf("increment sprint_seq: %w", err)
	}

	name := ComputeName(seq, startDate, endDate)
	sp, err := scanSprint(tx.QueryRow(ctx, `
		INSERT INTO sprints (board_id, project_id, name, sprint_number, start_date, end_date, state)
		VALUES ($1, $2, $3, $4, $5, $6, 'planning')
		RETURNING `+sprintCols,
		boardID, projectID, name, seq, startDate, endDate))
	if err != nil {
		return nil, err
	}
	return sp, tx.Commit(ctx)
}

// Activate transitions planning → active.
func (s *Store) Activate(ctx context.Context, id string) (*Sprint, error) {
	sp, err := scanSprint(s.DB.QueryRow(ctx,
		`UPDATE sprints SET state = 'active' WHERE id = $1 AND state = 'planning' RETURNING `+sprintCols, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("sprint not in planning state or another sprint is already active")
		}
		return nil, err
	}
	return sp, nil
}

// Close transitions the sprint active → completed, spills unfinished items, and atomically creates
// the next sprint (planning).
func (s *Store) Close(ctx context.Context, sprintID, boardID, projectID string, cadenceDays int, doneStatusIDs []string) (*CloseResult, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var endDate time.Time
	err = tx.QueryRow(ctx,
		`UPDATE sprints SET state = 'completed' WHERE id = $1 AND state = 'active' RETURNING end_date`,
		sprintID).Scan(&endDate)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("sprint not active")
		}
		return nil, err
	}

	var nextSeq int
	if err = tx.QueryRow(ctx,
		`UPDATE projects SET sprint_seq = sprint_seq + 1 WHERE id = $1 RETURNING sprint_seq`, projectID,
	).Scan(&nextSeq); err != nil {
		return nil, err
	}

	nextStart := endDate.AddDate(0, 0, 1)
	nextEnd := nextStart.AddDate(0, 0, cadenceDays-1)
	nextName := ComputeName(nextSeq, nextStart, nextEnd)

	var next Sprint
	err = tx.QueryRow(ctx, `
		INSERT INTO sprints (board_id, project_id, name, sprint_number, start_date, end_date, state)
		VALUES ($1, $2, $3, $4, $5, $6, 'planning')
		RETURNING `+sprintCols,
		boardID, projectID, nextName, nextSeq, nextStart, nextEnd,
	).Scan(&next.ID, &next.ProjectID, &next.Name, &next.SprintNumber,
		&next.StartDate, &next.EndDate, &next.State, &next.CreatedAt)
	if err != nil {
		return nil, err
	}
	next.computeDays()

	spillTag, err := tx.Exec(ctx, `
		UPDATE items SET sprint_id = $1, updated_at = NOW()
		WHERE sprint_id = $2 AND status_id != ALL($3)
	`, next.ID, sprintID, doneStatusIDs)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &CloseResult{SpilledCount: int(spillTag.RowsAffected()), NextSprint: &next}, nil
}

// SpilloverPreview returns how many items would spill if the sprint were closed now.
func (s *Store) SpilloverPreview(ctx context.Context, sprintID string, doneStatusIDs []string) (int, error) {
	var count int
	err := s.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM items WHERE sprint_id = $1 AND status_id != ALL($2)
	`, sprintID, doneStatusIDs).Scan(&count)
	return count, err
}
