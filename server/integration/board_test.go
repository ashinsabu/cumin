package integration

import (
	"context"
	"net/http"
	"testing"
)

type statusJSON struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Position  int    `json:"position"`
	IsInitial bool   `json:"is_initial"`
	IsDone    bool   `json:"is_done"`
}

type statusListJSON struct {
	Statuses []statusJSON `json:"statuses"`
}

// createStatus creates a named board status at the given position and returns the decoded body.
func createStatus(t *testing.T, name string, position int) statusJSON {
	t.Helper()
	resp := mustDo(t, testEnv.Server, "POST", "/api/board/statuses", map[string]any{
		"name":     name,
		"position": position,
	})
	assertStatus(t, resp, http.StatusOK)
	return mustDecodeJSON[statusJSON](t, resp)
}

// hardDeleteStatus removes a status directly from the DB (used in Cleanup).
// Note: items must be moved off the status before deletion.
func hardDeleteStatus(id string) {
	testEnv.DB.Exec(context.Background(), "DELETE FROM statuses WHERE id = $1", id)
}

// ─── Core flow ────────────────────────────────────────────────────────────────

// TestBoard_CoreFlow exercises statuses CRUD + item-assignment guard.
func TestBoard_CoreFlow(t *testing.T) {
	srv := testEnv.Server

	// Step 1: GET /api/board/statuses → 4 defaults (TODO/BLOCKED/IN PROGRESS/DONE).
	resp := mustDo(t, srv, "GET", "/api/board/statuses", nil)
	assertStatus(t, resp, http.StatusOK)
	list := mustDecodeJSON[statusListJSON](t, resp)
	initialCount := len(list.Statuses)
	if initialCount != 4 {
		t.Fatalf("expected 4 default statuses, got %d", initialCount)
	}

	// Collect names to verify all defaults are present.
	names := map[string]bool{}
	for _, s := range list.Statuses {
		names[s.Name] = true
	}
	for _, expected := range []string{"TODO", "BLOCKED", "IN PROGRESS", "DONE"} {
		if !names[expected] {
			t.Errorf("expected default status %q to exist", expected)
		}
	}

	// Step 2: create REVIEW status.
	review := createStatus(t, "REVIEW", 10)
	// Cleanup uses API DELETE after the test validates 204 below.
	// We also add a hard-delete fallback in case the test fails before the API call.
	t.Cleanup(func() {
		testEnv.DB.Exec(context.Background(), "DELETE FROM statuses WHERE id = $1", review.ID)
	})

	// Step 3: create an item, then move it to REVIEW.
	it := createTestItem(t, "Board flow item")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp = mustDo(t, srv, "POST", "/api/items/"+it.ID+"/move", map[string]any{
		"status_id": review.ID,
	})
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	// Step 4: DELETE REVIEW with item assigned → 409.
	resp = mustDo(t, srv, "DELETE", "/api/board/statuses/"+review.ID, nil)
	assertStatus(t, resp, http.StatusConflict)
	drainClose(resp)

	// Step 5: move item away from REVIEW, then DELETE REVIEW → 204.
	resp = mustDo(t, srv, "POST", "/api/items/"+it.ID+"/move", map[string]any{
		"status_id": testEnv.TodoStatusID,
	})
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	resp = mustDo(t, srv, "DELETE", "/api/board/statuses/"+review.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Step 6: GET statuses → back to 4.
	resp = mustDo(t, srv, "GET", "/api/board/statuses", nil)
	assertStatus(t, resp, http.StatusOK)
	list = mustDecodeJSON[statusListJSON](t, resp)
	if len(list.Statuses) != 4 {
		t.Errorf("expected 4 statuses after deleting REVIEW, got %d", len(list.Statuses))
	}
}

// ─── Guard: cannot delete the last initial status ─────────────────────────────

func TestBoard_DeleteInitialStatus_Blocked(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "DELETE", "/api/board/statuses/"+testEnv.TodoStatusID, nil)
	assertStatus(t, resp, http.StatusConflict)
	drainClose(resp)
}

// ─── Guard: cannot delete the last done status ────────────────────────────────

func TestBoard_DeleteDoneStatus_Blocked(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "DELETE", "/api/board/statuses/"+testEnv.DoneStatusID, nil)
	assertStatus(t, resp, http.StatusConflict)
	drainClose(resp)
}

// ─── Reorder statuses ─────────────────────────────────────────────────────────

func TestBoard_ReorderStatuses(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "GET", "/api/board/statuses", nil)
	assertStatus(t, resp, http.StatusOK)
	list := mustDecodeJSON[statusListJSON](t, resp)

	// Reverse the order.
	ids := make([]string, len(list.Statuses))
	for i, s := range list.Statuses {
		ids[len(list.Statuses)-1-i] = s.ID
	}

	resp = mustDo(t, testEnv.Server, "PUT", "/api/board/statuses/reorder", map[string]any{
		"ids": ids,
	})
	assertStatus(t, resp, http.StatusOK)
	reordered := mustDecodeJSON[statusListJSON](t, resp)

	// Restore original order as cleanup.
	origIDs := make([]string, len(list.Statuses))
	for i, s := range list.Statuses {
		origIDs[i] = s.ID
	}
	t.Cleanup(func() {
		resp := mustDo(t, testEnv.Server, "PUT", "/api/board/statuses/reorder", map[string]any{
			"ids": origIDs,
		})
		drainClose(resp)
	})

	// Verify the new positions match the reversed order.
	for i, s := range reordered.Statuses {
		if s.ID != ids[i] {
			t.Errorf("position %d: expected status %s, got %s", i, ids[i], s.ID)
		}
	}
}

// ─── Validation ───────────────────────────────────────────────────────────────

func TestBoard_CreateStatus_NoName(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/board/statuses", map[string]any{
		"position": 99,
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

func TestBoard_DeleteStatus_NotFound(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "DELETE", "/api/board/statuses/00000000-0000-0000-0000-000000000000", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

// ─── Board settings ───────────────────────────────────────────────────────────

func TestBoard_Get(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "GET", "/api/board", nil)
	assertStatus(t, resp, http.StatusOK)
	b := mustDecodeJSON[struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}](t, resp)
	if b.ID == "" {
		t.Errorf("expected non-empty board ID")
	}
}

func TestBoard_Update(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "PATCH", "/api/board", map[string]any{
		"sprint_cadence_days": 7,
	})
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)
}
