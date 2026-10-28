package integration

import (
	"context"
	"net/http"
	"os"
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

// queueEnabled is true unless the queue feature is killed via QUEUE_DISABLED (features ship on by default).
func queueEnabled() bool {
	return os.Getenv("QUEUE_DISABLED") != "true"
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
		t.Skip("queue feature disabled (QUEUE_DISABLED=true)")
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

// ─── Promote into a sprint ────────────────────────────────────────────────────

// Capture-to-plan loop (user feedback 2026-10-28): a captured thought could be promoted to an item but
// never into a sprint, so planning always meant a second manual step per item.
func TestQueue_Promote_IntoSprint(t *testing.T) {
	if !queueEnabled() {
		t.Skip("queue feature flag not set")
	}
	sp := createSprint(t)
	t.Cleanup(func() { hardDeleteSprint(sp.ID) })
	q := createQueueItem(t, "Plan me", 2)
	t.Cleanup(func() { hardDeleteQueueItem(q.ID) })

	resp := mustDo(t, testEnv.Server, "POST", "/api/queue/"+q.ID+"/promote", map[string]any{
		"project_id": testEnv.ProjectID,
		"status_id":  testEnv.TodoStatusID,
		"sprint_id":  sp.ID,
	})
	assertStatus(t, resp, http.StatusOK)
	promoted := mustDecodeJSON[promoteResultJSON](t, resp)
	t.Cleanup(func() { hardDeleteItems(promoted.ItemID) })

	resp = mustDo(t, testEnv.Server, "GET", "/api/items/"+promoted.ItemID, nil)
	assertStatus(t, resp, http.StatusOK)
	got := mustDecodeJSON[struct {
		SprintID *string `json:"sprint_id"`
	}](t, resp)
	if got.SprintID == nil || *got.SprintID != sp.ID {
		t.Errorf("promoted item sprint_id = %v, want %s", got.SprintID, sp.ID)
	}
}

func TestQueue_Promote_RejectsUnknownSprint(t *testing.T) {
	if !queueEnabled() {
		t.Skip("queue feature flag not set")
	}
	q := createQueueItem(t, "Bad sprint", 2)
	t.Cleanup(func() { hardDeleteQueueItem(q.ID) })

	resp := mustDo(t, testEnv.Server, "POST", "/api/queue/"+q.ID+"/promote", map[string]any{
		"project_id": testEnv.ProjectID,
		"status_id":  testEnv.TodoStatusID,
		"sprint_id":  "00000000-0000-0000-0000-000000000000",
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)

	// The queue item must survive a rejected promote.
	var promoted *string
	testEnv.DB.QueryRow(context.Background(), `SELECT promoted_item_id::text FROM queue_items WHERE id = $1`, q.ID).Scan(&promoted)
	if promoted != nil {
		t.Errorf("queue item was promoted despite 400")
	}
}

// The queue list carries computed attention and the day summary; ?tz picks the zone the day ends in.
type queueAttentionListJSON struct {
	Items []struct {
		ID        string `json:"id"`
		Attention struct {
			Level string `json:"level"`
		} `json:"attention"`
	} `json:"items"`
	Summary struct {
		PlannedMinutes   int `json:"planned_minutes"`
		BudgetMinutes    int `json:"budget_minutes"`
		MinutesLeftToday int `json:"minutes_left_today"`
	} `json:"summary"`
}

func TestQueue_List_ReturnsAttentionAndSummary(t *testing.T) {
	skipUnlessQueue(t)
	q := mustDo(t, testEnv.Server, "POST", "/api/queue", map[string]any{"title": "Estimated task", "priority": 2, "estimate_minutes": 90})
	assertStatus(t, q, http.StatusOK)
	created := mustDecodeJSON[queueItemJSON](t, q)
	defer hardDeleteQueueItem(created.ID)

	resp := mustDo(t, testEnv.Server, "GET", "/api/queue?tz=Asia/Kolkata", nil)
	assertStatus(t, resp, http.StatusOK)
	body := mustDecodeJSON[queueAttentionListJSON](t, resp)
	if body.Summary.BudgetMinutes != 480 || body.Summary.PlannedMinutes < 90 || body.Summary.MinutesLeftToday <= 0 || body.Summary.MinutesLeftToday > 24*60 {
		t.Fatalf("summary = %+v", body.Summary)
	}
	for _, it := range body.Items {
		if it.Attention.Level == "" {
			t.Fatalf("item %s has no attention level", it.ID)
		}
	}
}

// Quick tasks are all due today, so the queue has no deadline. Older clients (iOS, stale web tabs) may still send
// one; it must be ignored rather than rejected, and must not come back in the response.
func TestQueue_Create_LegacyDeadlineIgnored(t *testing.T) {
	if !queueEnabled() {
		t.Skip("queue feature disabled (QUEUE_DISABLED=true)")
	}
	resp := mustDo(t, testEnv.Server, "POST", "/api/queue", map[string]any{
		"title":    "legacy client",
		"priority": 2,
		"deadline": "2030-01-01T00:00:00Z",
	})
	assertStatus(t, resp, http.StatusOK)
	body := mustDecodeJSON[map[string]any](t, resp)
	t.Cleanup(func() { hardDeleteQueueItem(body["id"].(string)) })
	if _, has := body["deadline"]; has {
		t.Errorf("queue item must not expose a deadline, got %v", body["deadline"])
	}
}

// Undo for a dismissed entry: DELETE then POST /restore brings it back, and a second restore (not archived) is a 404.
// Promoted entries also have deleted_at set but must not be restorable, or undo would duplicate the board item.
func TestQueue_Restore(t *testing.T) {
	if !queueEnabled() {
		t.Skip("queue feature disabled (QUEUE_DISABLED=true)")
	}
	srv := testEnv.Server
	q := createQueueItem(t, "restore me", 2)
	t.Cleanup(func() { hardDeleteQueueItem(q.ID) })

	drainClose(mustDo(t, srv, "DELETE", "/api/queue/"+q.ID, nil))

	resp := mustDo(t, srv, "POST", "/api/queue/"+q.ID+"/restore", nil)
	assertStatus(t, resp, http.StatusOK)
	if got := mustDecodeJSON[queueItemJSON](t, resp); got.ID != q.ID {
		t.Fatalf("restored id = %s, want %s", got.ID, q.ID)
	}

	list := mustDecodeJSON[queueListJSON](t, mustDo(t, srv, "GET", "/api/queue", nil))
	found := false
	for _, qi := range list.Items {
		found = found || qi.ID == q.ID
	}
	if !found {
		t.Errorf("restored entry missing from GET /api/queue")
	}

	assertStatus(t, mustDo(t, srv, "POST", "/api/queue/"+q.ID+"/restore", nil), http.StatusNotFound)

	promotable := createQueueItem(t, "promoted entry", 2)
	t.Cleanup(func() { hardDeleteQueueItem(promotable.ID) })
	resp = mustDo(t, srv, "POST", "/api/queue/"+promotable.ID+"/promote", map[string]any{
		"project_id": testEnv.ProjectID, "status_id": testEnv.TodoStatusID,
	})
	assertStatus(t, resp, http.StatusOK)
	t.Cleanup(func() { hardDeleteItems(mustDecodeJSON[promoteResultJSON](t, resp).ItemID) })
	assertStatus(t, mustDo(t, srv, "POST", "/api/queue/"+promotable.ID+"/restore", nil), http.StatusNotFound)
}

// Regression: restoring keeps the old position, which a newer entry may have taken; ties break by created_at.
func TestQueue_Restore_PositionTieBreaksByAge(t *testing.T) {
	if !queueEnabled() {
		t.Skip("queue feature disabled (QUEUE_DISABLED=true)")
	}
	srv := testEnv.Server
	a := createQueueItem(t, "tie a", 2)
	t.Cleanup(func() { hardDeleteQueueItem(a.ID) })
	drainClose(mustDo(t, srv, "DELETE", "/api/queue/"+a.ID, nil)) // frees a's position for the next create
	b := createQueueItem(t, "tie b", 2)
	t.Cleanup(func() { hardDeleteQueueItem(b.ID) })
	assertStatus(t, mustDo(t, srv, "POST", "/api/queue/"+a.ID+"/restore", nil), http.StatusOK)

	order := func() []string {
		var ids []string
		for _, qi := range mustDecodeJSON[queueListJSON](t, mustDo(t, srv, "GET", "/api/queue", nil)).Items {
			if qi.ID == a.ID || qi.ID == b.ID {
				ids = append(ids, qi.ID)
			}
		}
		return ids
	}
	// a and b share a position; the older entry (a) must come first.
	if got := order(); len(got) != 2 || got[0] != a.ID {
		t.Fatalf("tie order = %v, want a (%s) before b (%s)", got, a.ID, b.ID)
	}
}

// A negative estimate would shorten the simulated day and hide real overload.
func TestQueue_NegativeEstimateRejected(t *testing.T) {
	if !queueEnabled() {
		t.Skip("queue feature disabled (QUEUE_DISABLED=true)")
	}
	resp := mustDo(t, testEnv.Server, "POST", "/api/queue", map[string]any{"title": "neg", "estimate_minutes": -480})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)

	q := createQueueItem(t, "neg update", 2)
	t.Cleanup(func() { hardDeleteQueueItem(q.ID) })
	resp = mustDo(t, testEnv.Server, "PATCH", "/api/queue/"+q.ID, map[string]any{"title": "neg update", "estimate_minutes": -1})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}
