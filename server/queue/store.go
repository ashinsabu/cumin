package queue

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type QueueItem struct {
	ID              string     `json:"id"`
	UserID          string     `json:"user_id"`
	CreatedBy       string     `json:"created_by"`
	Title           string     `json:"title"`
	Notes           string     `json:"notes"`
	Deadline        *time.Time `json:"deadline"`
	Priority        int        `json:"priority"`
	EstimateMinutes *int       `json:"estimate_minutes"`
	Position        int        `json:"position"`
	UrgencyScore    float64    `json:"urgency_score"`
	PromotedItemID  *string    `json:"promoted_item_id"`
	CompletedAt     *time.Time `json:"completed_at"`
	CreatedAt       time.Time  `json:"created_at"`
}

type Store struct {
	DB *pgxpool.Pool
}

// UrgencyScore computes the sort weight for a queue item.
// The frontend mirrors this in QueueContext.computeUrgencyScore — keep them in sync.
func UrgencyScore(title string, createdAt time.Time, deadline *time.Time, priority int) float64 {
	ageScore := math.Min(time.Since(createdAt).Hours()/24.0, 10.0)

	deadlineScore := 0.0
	if deadline != nil {
		daysUntil := time.Until(*deadline).Hours() / 24.0
		deadlineScore = math.Max(0, 10.0-daysUntil*2.0)
	}

	kwScore := 0.0
	lower := strings.ToLower(title)
	for _, kw := range []string{"bug", "prod", "blocker", "critical"} {
		if strings.Contains(lower, kw) {
			kwScore += 2.0
		}
	}

	// P0=0 → adds 8; P4=4 → adds 0
	priorityScore := float64(4-priority) * 2.0

	return ageScore + deadlineScore + kwScore + priorityScore
}

const listCols = `id, user_id, created_by, title, COALESCE(notes,''), deadline, priority, estimate_minutes, position, promoted_item_id, completed_at, created_at`

func scanQueueItem(row interface{ Scan(...any) error }) (*QueueItem, error) {
	var q QueueItem
	if err := row.Scan(&q.ID, &q.UserID, &q.CreatedBy, &q.Title, &q.Notes, &q.Deadline, &q.Priority, &q.EstimateMinutes, &q.Position, &q.PromotedItemID, &q.CompletedAt, &q.CreatedAt); err != nil {
		return nil, err
	}
	q.UrgencyScore = UrgencyScore(q.Title, q.CreatedAt, q.Deadline, q.Priority)
	return &q, nil
}

func (s *Store) List(ctx context.Context, userID string) ([]QueueItem, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT `+listCols+`
		FROM queue_items
		WHERE user_id = $1 AND deleted_at IS NULL AND promoted_item_id IS NULL AND completed_at IS NULL
		ORDER BY position ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []QueueItem
	for rows.Next() {
		q, err := scanQueueItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *q)
	}

	if out == nil {
		out = []QueueItem{}
	}
	return out, nil
}

func (s *Store) Create(ctx context.Context, boardID, userID, createdBy, title, notes string, deadline *time.Time, priority int, estimateMinutes *int) (*QueueItem, error) {
	var q QueueItem
	err := s.DB.QueryRow(ctx, `
		INSERT INTO queue_items (board_id, user_id, created_by, title, notes, deadline, priority, estimate_minutes, position)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
		    COALESCE((SELECT MAX(position)+1 FROM queue_items WHERE user_id=$2 AND deleted_at IS NULL), 0))
		RETURNING `+listCols+`
	`, boardID, userID, createdBy, title, notes, deadline, priority, estimateMinutes).Scan(
		&q.ID, &q.UserID, &q.CreatedBy, &q.Title, &q.Notes, &q.Deadline, &q.Priority, &q.EstimateMinutes, &q.Position, &q.PromotedItemID, &q.CompletedAt, &q.CreatedAt)
	if err != nil {
		return nil, err
	}
	q.UrgencyScore = UrgencyScore(q.Title, q.CreatedAt, q.Deadline, q.Priority)
	return &q, nil
}

func (s *Store) Update(ctx context.Context, id, userID, title, notes string, deadline *time.Time, priority int, estimateMinutes *int) (*QueueItem, error) {
	var q QueueItem
	err := s.DB.QueryRow(ctx, `
		UPDATE queue_items SET title=$3, notes=$4, deadline=$5, priority=$6, estimate_minutes=$7
		WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND promoted_item_id IS NULL
		RETURNING `+listCols+`
	`, id, userID, title, notes, deadline, priority, estimateMinutes).Scan(
		&q.ID, &q.UserID, &q.CreatedBy, &q.Title, &q.Notes, &q.Deadline, &q.Priority, &q.EstimateMinutes, &q.Position, &q.PromotedItemID, &q.CompletedAt, &q.CreatedAt)
	if err != nil {
		return nil, err
	}
	q.UrgencyScore = UrgencyScore(q.Title, q.CreatedAt, q.Deadline, q.Priority)
	return &q, nil
}

func (s *Store) Revive(ctx context.Context, id, userID string) (*QueueItem, error) {
	var q QueueItem
	err := s.DB.QueryRow(ctx, `
		UPDATE queue_items SET created_at = NOW(), position =
		    COALESCE((SELECT MAX(position)+1 FROM queue_items WHERE user_id=$2 AND deleted_at IS NULL), 0)
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
		RETURNING `+listCols+`
	`, id, userID).Scan(&q.ID, &q.UserID, &q.CreatedBy, &q.Title, &q.Notes, &q.Deadline, &q.Priority, &q.EstimateMinutes, &q.Position, &q.PromotedItemID, &q.CompletedAt, &q.CreatedAt)
	if err != nil {
		return nil, err
	}
	q.UrgencyScore = UrgencyScore(q.Title, q.CreatedAt, q.Deadline, q.Priority)
	return &q, nil
}

func (s *Store) Complete(ctx context.Context, id, userID string) (*QueueItem, error) {
	var q QueueItem
	err := s.DB.QueryRow(ctx, `
		UPDATE queue_items SET completed_at = NOW()
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND completed_at IS NULL
		RETURNING `+listCols+`
	`, id, userID).Scan(&q.ID, &q.UserID, &q.CreatedBy, &q.Title, &q.Notes, &q.Deadline, &q.Priority, &q.EstimateMinutes, &q.Position, &q.PromotedItemID, &q.CompletedAt, &q.CreatedAt)
	if err != nil {
		return nil, err
	}
	q.UrgencyScore = UrgencyScore(q.Title, q.CreatedAt, q.Deadline, q.Priority)
	return &q, nil
}

func (s *Store) History(ctx context.Context, userID string) ([]QueueItem, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT `+listCols+`
		FROM queue_items
		WHERE user_id = $1 AND completed_at IS NOT NULL AND deleted_at IS NULL
		ORDER BY completed_at DESC
		LIMIT 100
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []QueueItem
	for rows.Next() {
		q, err := scanQueueItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *q)
	}
	if out == nil {
		out = []QueueItem{}
	}
	return out, nil
}

func (s *Store) Archive(ctx context.Context, id, userID string) error {
	_, err := s.DB.Exec(ctx, `
		UPDATE queue_items SET deleted_at = NOW()
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, id, userID)
	return err
}

func (s *Store) Reorder(ctx context.Context, userID string, ids []string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for i, id := range ids {
		if _, err := tx.Exec(ctx,
			`UPDATE queue_items SET position=$1 WHERE id=$2 AND user_id=$3 AND deleted_at IS NULL`,
			i, id, userID,
		); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

type PromoteResult struct {
	ItemID      string `json:"item_id"`
	ItemDisplay string `json:"item_display_id"`
}

func (s *Store) Promote(ctx context.Context, queueID, boardID, userID, projectID, statusID string, epicID *string) (*PromoteResult, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var title string
	var priority int
	var estimateMinutes *int
	err = tx.QueryRow(ctx, `
		SELECT title, priority, estimate_minutes FROM queue_items
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND promoted_item_id IS NULL
	`, queueID, userID).Scan(&title, &priority, &estimateMinutes)
	if err != nil {
		return nil, err
	}

	var seq int64
	var prefix string
	err = tx.QueryRow(ctx, `
		UPDATE projects SET item_seq = item_seq + 1
		WHERE id = $1 AND user_id = $2
		RETURNING item_seq, prefix
	`, projectID, userID).Scan(&seq, &prefix)
	if err != nil {
		return nil, err
	}

	displayID := fmt.Sprintf("%s-%d", prefix, seq)

	var itemID string
	err = tx.QueryRow(ctx, `
		INSERT INTO items (board_id, project_id, epic_id, status_id, display_id, title, description, priority, estimate_minutes, position)
		VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8,
		    COALESCE((SELECT MAX(position)+1 FROM items WHERE project_id=$2 AND status_id=$4), 0))
		RETURNING id
	`, boardID, projectID, epicID, statusID, displayID, title, priority, estimateMinutes).Scan(&itemID)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO status_transitions (item_id, from_status_id, to_status_id) VALUES ($1, NULL, $2)
	`, itemID, statusID)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		UPDATE queue_items SET promoted_item_id = $1, deleted_at = NOW()
		WHERE id = $2
	`, itemID, queueID)
	if err != nil {
		return nil, err
	}

	return &PromoteResult{ItemID: itemID, ItemDisplay: displayID}, tx.Commit(ctx)
}
