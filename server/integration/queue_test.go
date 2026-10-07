package integration

import (
	"context"
	"net/http"
	"os"
	"strings"
	"testing"
)

type queueItemJSON struct {
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	Priority       int     `json:"priority"`
	Position       int     `json:"position"`
	UrgencyScore   float64 `json:"urgency_score"`
	PromotedItemID *string `json:"promoted_item_id"`
}

type queueListJSON struct {
	Items []queueItemJSON `json:"items"`
}

type promoteResultJSON struct {
	ItemID      string `json:"item_id"`
	ItemDisplay string `json:"item_display_id"`
}

// queueEnabled returns true when the FEATURE_FLAGS env var contains "queue".
func queueEnabled() bool {
	return strings.Contains(os.Getenv("FEATURE_FLAGS"), "queue")
}

// hardDeleteQueueItem removes a queue item from the DB.
func hardDeleteQueueItem(id string) {
	testEnv.DB.Exec(context.Background(), "DELETE FROM queue_items WHERE id = $1", id)
}

// createQueueItem creates a queue item and returns the decoded body.
func createQueueItem(t *testing.T, title string, priority int) queueItemJSON {
	t.Helper()
	resp := mustDo(t, testEnv.Server, "POST", "/api/queue", map[string]any{
		"title":    title,
		"priority": priority,
	})
	assertStatus(t, resp, http.StatusOK)
	return mustDecodeJSON[queueItemJSON](t, resp)
}

// ─── Core flow ────────────────────────────────────────────────────────────────

func TestQueue_CoreFlow(t *testing.T) {
	if !queueEnabled() {
		t.Skip("queue feature flag not set — set FEATURE_FLAGS=queue to run queue tests")
	}

	srv := testEnv.Server

	// Step 1: create 3 queue items with different priorities.
	q0 := createQueueItem(t, "Queue item 0", 0) // highest priority
	q1 := createQueueItem(t, "Queue item 1", 2)
	q2 := createQueueItem(t, "Queue item 2", 4) // lowest priority
	t.Cleanup(func() {
		hardDeleteQueueItem(q0.ID)
		hardDeleteQueueItem(q1.ID)
		hardDeleteQueueItem(q2.ID)
	})

	// Step 2: GET /api/queue → 3 items, ordered by position.
	resp := mustDo(t, srv, "GET", "/api/queue", nil)
	assertStatus(t, resp, http.StatusOK)
	list := mustDecodeJSON[queueListJSON](t, resp)
	if len(list.Items) != 3 {
		t.Fatalf("expected 3 queue items, got %d", len(list.Items))
	}
	// positions should be ascending.
	for i := 1; i < len(list.Items); i++ {
		if list.Items[i].Position < list.Items[i-1].Position {
			t.Errorf("queue items not ordered by position at index %d", i)
		}
	}

	// Step 3: PUT /api/queue/reorder with reversed IDs.
	reversed := []string{q2.ID, q1.ID, q0.ID}
	resp = mustDo(t, srv, "PUT", "/api/queue/reorder", map[string]any{
		"order": reversed,
	})
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	// Verify positions updated.
	resp = mustDo(t, srv, "GET", "/api/queue", nil)
	assertStatus(t, resp, http.StatusOK)
	list = mustDecodeJSON[queueListJSON](t, resp)
	if len(list.Items) != 3 {
		t.Fatalf("expected 3 queue items after reorder, got %d", len(list.Items))
	}
	// After reorder, the item at position 0 should be q2.
	if list.Items[0].ID != q2.ID {
		t.Errorf("expected q2 at position 0 after reorder, got %s", list.Items[0].ID)
	}

	// Step 4: POST /api/queue/{id}/promote → item appears in /api/items/backlog.
	resp = mustDo(t, srv, "POST", "/api/queue/"+q0.ID+"/promote", map[string]any{
		"project_id": testEnv.ProjectID,
		"status_id":  testEnv.TodoStatusID,
	})
	assertStatus(t, resp, http.StatusOK)
	promoted := mustDecodeJSON[promoteResultJSON](t, resp)
	if promoted.ItemID == "" {
		t.Errorf("expected non-empty item_id in promote response")
	}
	t.Cleanup(func() { hardDeleteItems(promoted.ItemID) })

	// Promoted item should appear in backlog.
	resp = mustDo(t, srv, "GET", "/api/items/backlog", nil)
	assertStatus(t, resp, http.StatusOK)
	bl := mustDecodeJSON[itemListJSON](t, resp)
	foundItem := false
	for _, it := range bl.Items {
		if it.ID == promoted.ItemID {
			foundItem = true
		}
	}
	if !foundItem {
		t.Errorf("promoted item %s not found in backlog", promoted.ItemID)
	}

	// Step 5: DELETE /api/queue/{id} (archive) → gone from GET /api/queue.
	resp = mustDo(t, srv, "DELETE", "/api/queue/"+q1.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	resp = mustDo(t, srv, "GET", "/api/queue", nil)
	assertStatus(t, resp, http.StatusOK)
	list = mustDecodeJSON[queueListJSON](t, resp)
	for _, qi := range list.Items {
		if qi.ID == q1.ID {
			t.Errorf("archived item q1 still appears in GET /api/queue")
		}
	}
}

// ─── Validation ───────────────────────────────────────────────────────────────

func TestQueue_Create_NoTitle(t *testing.T) {
	if !queueEnabled() {
		t.Skip("queue feature flag not set")
	}
	resp := mustDo(t, testEnv.Server, "POST", "/api/queue", map[string]any{
		"priority": 2,
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

func TestQueue_Promote_MissingFields(t *testing.T) {
	if !queueEnabled() {
		t.Skip("queue feature flag not set")
	}

	q := createQueueItem(t, "Promote test", 2)
	t.Cleanup(func() { hardDeleteQueueItem(q.ID) })

	resp := mustDo(t, testEnv.Server, "POST", "/api/queue/"+q.ID+"/promote", map[string]any{
		// missing project_id and status_id
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

// ─── Urgency ordering ─────────────────────────────────────────────────────────

// TestQueue_UrgencyScore_Priority verifies that a high-priority item gets a
// higher urgency score than an identical low-priority item created at the same time.
func TestQueue_UrgencyScore_Priority(t *testing.T) {
	if !queueEnabled() {
		t.Skip("queue feature flag not set")
	}

	hi := createQueueItem(t, "High prio", 0) // P0
	lo := createQueueItem(t, "Low prio", 4)  // P4
	t.Cleanup(func() {
		hardDeleteQueueItem(hi.ID)
		hardDeleteQueueItem(lo.ID)
	})

	if hi.UrgencyScore <= lo.UrgencyScore {
		t.Errorf("expected high-priority item urgency (%v) > low-priority (%v)",
			hi.UrgencyScore, lo.UrgencyScore)
	}
}

// ─── List ─────────────────────────────────────────────────────────────────────

func TestQueue_List_Empty(t *testing.T) {
	if !queueEnabled() {
		t.Skip("queue feature flag not set")
	}

	// This test just verifies the endpoint is reachable and returns a list shape.
	resp := mustDo(t, testEnv.Server, "GET", "/api/queue", nil)
	assertStatus(t, resp, http.StatusOK)
	list := mustDecodeJSON[queueListJSON](t, resp)
	if list.Items == nil {
		t.Errorf("expected items array (possibly empty), got nil")
	}
}
