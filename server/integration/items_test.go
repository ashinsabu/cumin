package integration

import (
	"context"
	"fmt"
	"net/http"
	"testing"
)

// itemJSON is the minimal decoded shape of an item response.
type itemJSON struct {
	ID       string  `json:"id"`
	EpicID   *string `json:"epic_id"`
	SprintID *string `json:"sprint_id"`
	StatusID string  `json:"status_id"`
}

type itemListJSON struct {
	Items []itemJSON `json:"items"`
}

type epicJSON struct {
	ID string `json:"id"`
}

type epicListJSON struct {
	Epics []epicJSON `json:"epics"`
}

type transitionJSON struct {
	ID         string  `json:"id"`
	ToStatusID string  `json:"to_status_id"`
	FromStatus *string `json:"from_status_id"`
}

type transitionsListJSON struct {
	Transitions []transitionJSON `json:"transitions"`
}

// createTestItem posts a minimal item and returns its ID.
func createTestItem(t *testing.T, title string) itemJSON {
	t.Helper()
	resp := mustDo(t, testEnv.Server, "POST", "/api/items", map[string]any{
		"title":      title,
		"project_id": testEnv.ProjectID,
	})
	assertStatus(t, resp, http.StatusOK)
	return mustDecodeJSON[itemJSON](t, resp)
}

// hardDeleteItems removes items by ID directly from the DB (bypasses soft-delete).
func hardDeleteItems(ids ...string) {
	ctx := context.Background()
	for _, id := range ids {
		testEnv.DB.Exec(ctx, "DELETE FROM items WHERE id = $1", id)
	}
}

// hardDeleteEpic removes an epic by ID directly from the DB.
func hardDeleteEpic(id string) {
	testEnv.DB.Exec(context.Background(), "DELETE FROM epics WHERE id = $1", id)
}

// ─── Core flow ────────────────────────────────────────────────────────────────

// TestItems_CoreFlow exercises the full create → assign-epic → delete-item →
// delete-epic → restore-epic → verify-cascade flow.
func TestItems_CoreFlow(t *testing.T) {
	ctx := context.Background()
	srv := testEnv.Server

	// Step 1: create 5 items, assert backlog = 5.
	var ids [5]string
	for i := 0; i < 5; i++ {
		it := createTestItem(t, fmt.Sprintf("Flow item %d", i))
		ids[i] = it.ID
	}
	t.Cleanup(func() { hardDeleteItems(ids[:]...) })

	resp := mustDo(t, srv, "GET", "/api/items/backlog", nil)
	assertStatus(t, resp, http.StatusOK)
	bl := mustDecodeJSON[itemListJSON](t, resp)
	if len(bl.Items) != 5 {
		t.Fatalf("expected 5 items in backlog, got %d", len(bl.Items))
	}

	// Step 2: create an epic.
	resp = mustDo(t, srv, "POST", "/api/epics", map[string]any{
		"name":  "Test Epic",
		"type":  "catchall",
		"color": "#ff0000",
	})
	assertStatus(t, resp, http.StatusOK)
	ep := mustDecodeJSON[epicJSON](t, resp)
	testEpicID := ep.ID
	t.Cleanup(func() {
		testEnv.DB.Exec(ctx, "DELETE FROM epics WHERE id = $1", testEpicID)
	})

	// Step 3: delete item[0], assert 404, assert backlog = 4.
	resp = mustDo(t, srv, "DELETE", "/api/items/"+ids[0], nil)
	assertStatus(t, resp, http.StatusNoContent)

	resp = mustDo(t, srv, "GET", "/api/items/"+ids[0], nil)
	assertStatus(t, resp, http.StatusNotFound)

	resp = mustDo(t, srv, "GET", "/api/items/backlog", nil)
	assertStatus(t, resp, http.StatusOK)
	bl = mustDecodeJSON[itemListJSON](t, resp)
	if len(bl.Items) != 4 {
		t.Errorf("expected 4 items in backlog after item[0] delete, got %d", len(bl.Items))
	}

	// Step 4: assign items[1-4] to the test epic.
	for _, id := range ids[1:] {
		resp = mustDo(t, srv, "PATCH", "/api/items/"+id, map[string]any{
			"epic_id": testEpicID,
		})
		assertStatus(t, resp, http.StatusOK)
		it := mustDecodeJSON[itemJSON](t, resp)
		if it.EpicID == nil || *it.EpicID != testEpicID {
			t.Errorf("item %s: expected epic_id=%s, got %v", id, testEpicID, it.EpicID)
		}
	}

	// Step 5: delete the epic → cascade-deletes items[1-4].
	resp = mustDo(t, srv, "DELETE", "/api/epics/"+testEpicID, nil)
	assertStatus(t, resp, http.StatusNoContent)

	// Epic should no longer appear in list.
	resp = mustDo(t, srv, "GET", "/api/epics", nil)
	assertStatus(t, resp, http.StatusOK)
	epics := mustDecodeJSON[epicListJSON](t, resp)
	for _, e := range epics.Epics {
		if e.ID == testEpicID {
			t.Errorf("deleted epic still appears in GET /api/epics")
		}
	}

	// Backlog empty (all cascade-deleted).
	resp = mustDo(t, srv, "GET", "/api/items/backlog", nil)
	assertStatus(t, resp, http.StatusOK)
	bl = mustDecodeJSON[itemListJSON](t, resp)
	if len(bl.Items) != 0 {
		t.Errorf("expected 0 items in backlog after epic delete, got %d", len(bl.Items))
	}

	// Step 6: restore the epic → cascade-restores items[1-4].
	resp = mustDo(t, srv, "POST", "/api/epics/"+testEpicID+"/restore", nil)
	assertStatus(t, resp, http.StatusNoContent)

	resp = mustDo(t, srv, "GET", "/api/epics", nil)
	assertStatus(t, resp, http.StatusOK)
	epics = mustDecodeJSON[epicListJSON](t, resp)
	foundEpic := false
	for _, e := range epics.Epics {
		if e.ID == testEpicID {
			foundEpic = true
		}
	}
	if !foundEpic {
		t.Errorf("restored epic not found in GET /api/epics")
	}

	// Backlog has 4 (items[1-4] restored; item[0] stays deleted).
	resp = mustDo(t, srv, "GET", "/api/items/backlog", nil)
	assertStatus(t, resp, http.StatusOK)
	bl = mustDecodeJSON[itemListJSON](t, resp)
	if len(bl.Items) != 4 {
		t.Errorf("expected 4 items in backlog after epic restore, got %d", len(bl.Items))
	}

	// Step 7: item[0] (deleted before the epic) is NOT restored.
	resp = mustDo(t, srv, "GET", "/api/items/"+ids[0], nil)
	assertStatus(t, resp, http.StatusNotFound)

	// Step 8: move item[1] to done, assert transition logged.
	resp = mustDo(t, srv, "POST", "/api/items/"+ids[1]+"/move", map[string]any{
		"status_id": testEnv.DoneStatusID,
	})
	assertStatus(t, resp, http.StatusOK)

	resp = mustDo(t, srv, "GET", "/api/items/"+ids[1]+"/transitions", nil)
	assertStatus(t, resp, http.StatusOK)
	tr := mustDecodeJSON[transitionsListJSON](t, resp)
	foundDone := false
	for _, tx := range tr.Transitions {
		if tx.ToStatusID == testEnv.DoneStatusID {
			foundDone = true
		}
	}
	if !foundDone {
		t.Errorf("transition to done status not found in history for item %s", ids[1])
	}
}

// ─── Create validations ───────────────────────────────────────────────────────

func TestItems_Create_NoTitle(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/items", map[string]any{
		"project_id": testEnv.ProjectID,
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

func TestItems_Create_NoProjectID(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/items", map[string]any{
		"title": "Missing project",
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

func TestItems_Create_InvalidProjectID(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/items", map[string]any{
		"title":      "Bad project",
		"project_id": "00000000-0000-0000-0000-000000000000",
	})
	// Server validates project belongs to board → 400
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

// ─── Get / not-found ──────────────────────────────────────────────────────────

func TestItems_Get_NotFound(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "GET", "/api/items/00000000-0000-0000-0000-000000000000", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

// ─── Delete / restore ─────────────────────────────────────────────────────────

func TestItems_Delete_NotFound(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "DELETE", "/api/items/00000000-0000-0000-0000-000000000000", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

func TestItems_Delete_AlreadyDeleted(t *testing.T) {
	it := createTestItem(t, "Double-delete me")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp := mustDo(t, testEnv.Server, "DELETE", "/api/items/"+it.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Second delete → 404 (item is now soft-deleted; handler returns not found).
	resp = mustDo(t, testEnv.Server, "DELETE", "/api/items/"+it.ID, nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

func TestItems_Restore(t *testing.T) {
	it := createTestItem(t, "Restore me")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp := mustDo(t, testEnv.Server, "DELETE", "/api/items/"+it.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	resp = mustDo(t, testEnv.Server, "POST", "/api/items/"+it.ID+"/restore", nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	resp = mustDo(t, testEnv.Server, "GET", "/api/items/"+it.ID, nil)
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)
}

// ─── Move / backlog filtering ─────────────────────────────────────────────────

func TestItems_Move_ToDone_NotInBacklog(t *testing.T) {
	it := createTestItem(t, "Move to done")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	// Confirm it's in the backlog.
	resp := mustDo(t, testEnv.Server, "GET", "/api/items/backlog", nil)
	assertStatus(t, resp, http.StatusOK)
	bl := mustDecodeJSON[itemListJSON](t, resp)
	initialCount := len(bl.Items)

	resp = mustDo(t, testEnv.Server, "POST", "/api/items/"+it.ID+"/move", map[string]any{
		"status_id": testEnv.DoneStatusID,
	})
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	// Backlog should shrink by 1.
	resp = mustDo(t, testEnv.Server, "GET", "/api/items/backlog", nil)
	assertStatus(t, resp, http.StatusOK)
	bl = mustDecodeJSON[itemListJSON](t, resp)
	if len(bl.Items) != initialCount-1 {
		t.Errorf("expected backlog %d after moving item to done, got %d", initialCount-1, len(bl.Items))
	}

	// Transition to done should be recorded.
	resp = mustDo(t, testEnv.Server, "GET", "/api/items/"+it.ID+"/transitions", nil)
	assertStatus(t, resp, http.StatusOK)
	tr := mustDecodeJSON[transitionsListJSON](t, resp)
	found := false
	for _, tx := range tr.Transitions {
		if tx.ToStatusID == testEnv.DoneStatusID {
			found = true
		}
	}
	if !found {
		t.Errorf("transition to done not recorded")
	}
}

func TestItems_Move_InvalidStatus(t *testing.T) {
	it := createTestItem(t, "Move invalid")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp := mustDo(t, testEnv.Server, "POST", "/api/items/"+it.ID+"/move", map[string]any{
		"status_id": "00000000-0000-0000-0000-000000000000",
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

func TestItems_Move_MissingStatusID(t *testing.T) {
	it := createTestItem(t, "Move no status")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp := mustDo(t, testEnv.Server, "POST", "/api/items/"+it.ID+"/move", map[string]any{})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

// TestItems_Move_ReturnsUpdatedStatusID verifies the move endpoint returns the
// item with its new status_id in the response body. The frontend relies on this
// to update the TanStack cache in onSuccess (the authoritative replacement for
// the optimistic update applied in onMutate).
func TestItems_Move_ReturnsUpdatedStatusID(t *testing.T) {
	it := createTestItem(t, "Move returns status")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	if it.StatusID == testEnv.DoneStatusID {
		t.Skip("item already in done status")
	}

	resp := mustDo(t, testEnv.Server, "POST", "/api/items/"+it.ID+"/move", map[string]any{
		"status_id": testEnv.DoneStatusID,
	})
	assertStatus(t, resp, http.StatusOK)
	moved := mustDecodeJSON[itemJSON](t, resp)

	if moved.StatusID != testEnv.DoneStatusID {
		t.Errorf("expected status_id=%s in response, got %s", testEnv.DoneStatusID, moved.StatusID)
	}
	if moved.ID != it.ID {
		t.Errorf("expected id=%s in response, got %s", it.ID, moved.ID)
	}
}

// TestItems_Move_ConsecutiveMoves verifies that two rapid moves end with the
// item in the final requested status. Guards against the server mishandling
// concurrent or back-to-back transitions (e.g. from the drag-and-drop race fix).
func TestItems_Move_ConsecutiveMoves(t *testing.T) {
	it := createTestItem(t, "Rapid move item")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	// Move 1: todo → done.
	resp := mustDo(t, testEnv.Server, "POST", "/api/items/"+it.ID+"/move", map[string]any{
		"status_id": testEnv.DoneStatusID,
	})
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	// Move 2: done → todo (simulates "oops, move it back").
	resp = mustDo(t, testEnv.Server, "POST", "/api/items/"+it.ID+"/move", map[string]any{
		"status_id": testEnv.TodoStatusID,
	})
	assertStatus(t, resp, http.StatusOK)
	final := mustDecodeJSON[itemJSON](t, resp)

	if final.StatusID != testEnv.TodoStatusID {
		t.Errorf("expected final status_id=%s after back-to-back moves, got %s", testEnv.TodoStatusID, final.StatusID)
	}

	// Both transitions should be recorded.
	resp = mustDo(t, testEnv.Server, "GET", "/api/items/"+it.ID+"/transitions", nil)
	assertStatus(t, resp, http.StatusOK)
	tr := mustDecodeJSON[transitionsListJSON](t, resp)
	if len(tr.Transitions) < 2 {
		t.Errorf("expected at least 2 transitions after two moves, got %d", len(tr.Transitions))
	}
}

// ─── Update / clear fields ────────────────────────────────────────────────────

func TestItems_ClearEpic(t *testing.T) {
	// Create an epic to assign.
	resp := mustDo(t, testEnv.Server, "POST", "/api/epics", map[string]any{
		"name": "Temp Epic for ClearEpic test",
		"type": "catchall",
	})
	assertStatus(t, resp, http.StatusOK)
	ep := mustDecodeJSON[epicJSON](t, resp)
	t.Cleanup(func() { hardDeleteEpic(ep.ID) })

	it := createTestItem(t, "Clear epic item")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	// Assign epic.
	resp = mustDo(t, testEnv.Server, "PATCH", "/api/items/"+it.ID, map[string]any{
		"epic_id": ep.ID,
	})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[itemJSON](t, resp)
	if updated.EpicID == nil || *updated.EpicID != ep.ID {
		t.Fatalf("expected epic_id=%s after assign, got %v", ep.ID, updated.EpicID)
	}

	// Clear epic.
	resp = mustDo(t, testEnv.Server, "PATCH", "/api/items/"+it.ID, map[string]any{
		"clear_epic": true,
	})
	assertStatus(t, resp, http.StatusOK)
	cleared := mustDecodeJSON[itemJSON](t, resp)
	if cleared.EpicID != nil {
		t.Errorf("expected epic_id=nil after ClearEpic, got %v", cleared.EpicID)
	}
}

func TestItems_ClearSprint(t *testing.T) {
	// Create a sprint.
	resp := mustDo(t, testEnv.Server, "POST", "/api/sprints", map[string]any{})
	assertStatus(t, resp, http.StatusOK)
	sp := mustDecodeJSON[sprintJSON](t, resp)
	t.Cleanup(func() {
		ctx := context.Background()
		testEnv.DB.Exec(ctx, "DELETE FROM items WHERE sprint_id = $1", sp.ID)
		testEnv.DB.Exec(ctx, "DELETE FROM sprints WHERE id = $1", sp.ID)
	})

	// Create item with sprint.
	resp = mustDo(t, testEnv.Server, "POST", "/api/items", map[string]any{
		"title":      "Clear sprint item",
		"project_id": testEnv.ProjectID,
		"sprint_id":  sp.ID,
	})
	assertStatus(t, resp, http.StatusOK)
	it := mustDecodeJSON[itemJSON](t, resp)
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	if it.SprintID == nil || *it.SprintID != sp.ID {
		t.Fatalf("expected sprint_id=%s after create, got %v", sp.ID, it.SprintID)
	}

	// Clear sprint.
	resp = mustDo(t, testEnv.Server, "PATCH", "/api/items/"+it.ID, map[string]any{
		"clear_sprint": true,
	})
	assertStatus(t, resp, http.StatusOK)
	cleared := mustDecodeJSON[itemJSON](t, resp)
	if cleared.SprintID != nil {
		t.Errorf("expected sprint_id=nil after ClearSprint, got %v", cleared.SprintID)
	}
}

// ─── List by sprint ───────────────────────────────────────────────────────────

func TestItems_ListBySprint(t *testing.T) {
	// Create a sprint.
	resp := mustDo(t, testEnv.Server, "POST", "/api/sprints", map[string]any{})
	assertStatus(t, resp, http.StatusOK)
	sp := mustDecodeJSON[sprintJSON](t, resp)
	t.Cleanup(func() {
		ctx := context.Background()
		testEnv.DB.Exec(ctx, "DELETE FROM items WHERE sprint_id = $1", sp.ID)
		testEnv.DB.Exec(ctx, "DELETE FROM sprints WHERE id = $1", sp.ID)
	})

	// Create 2 items on the sprint, 1 item off the sprint.
	for i := 0; i < 2; i++ {
		resp = mustDo(t, testEnv.Server, "POST", "/api/items", map[string]any{
			"title":      fmt.Sprintf("Sprint item %d", i),
			"project_id": testEnv.ProjectID,
			"sprint_id":  sp.ID,
		})
		assertStatus(t, resp, http.StatusOK)
		it := mustDecodeJSON[itemJSON](t, resp)
		t.Cleanup(func() { hardDeleteItems(it.ID) })
	}

	offSprint := createTestItem(t, "Off sprint item")
	t.Cleanup(func() { hardDeleteItems(offSprint.ID) })

	resp = mustDo(t, testEnv.Server, "GET", "/api/items?sprint_id="+sp.ID, nil)
	assertStatus(t, resp, http.StatusOK)
	list := mustDecodeJSON[itemListJSON](t, resp)
	if len(list.Items) != 2 {
		t.Errorf("expected 2 items for sprint, got %d", len(list.Items))
	}
	for _, item := range list.Items {
		if item.SprintID == nil || *item.SprintID != sp.ID {
			t.Errorf("item %s has wrong sprint_id: %v", item.ID, item.SprintID)
		}
	}
}

// ─── Backlog filters done items ───────────────────────────────────────────────

func TestItems_Backlog_ExcludesDone(t *testing.T) {
	it := createTestItem(t, "Backlog done exclude")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp := mustDo(t, testEnv.Server, "GET", "/api/items/backlog", nil)
	assertStatus(t, resp, http.StatusOK)
	bl := mustDecodeJSON[itemListJSON](t, resp)
	initialCount := len(bl.Items)

	// Move to done.
	resp = mustDo(t, testEnv.Server, "POST", "/api/items/"+it.ID+"/move", map[string]any{
		"status_id": testEnv.DoneStatusID,
	})
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	resp = mustDo(t, testEnv.Server, "GET", "/api/items/backlog", nil)
	assertStatus(t, resp, http.StatusOK)
	bl = mustDecodeJSON[itemListJSON](t, resp)
	if len(bl.Items) != initialCount-1 {
		t.Errorf("backlog should shrink by 1 after moving to done, got %d (was %d)", len(bl.Items), initialCount)
	}
}

// ─── Cross-board isolation ────────────────────────────────────────────────────

func TestItems_CrossBoard_Isolation(t *testing.T) {
	// A random UUID that doesn't belong to our board.
	resp := mustDo(t, testEnv.Server, "GET", "/api/items/00000000-0000-0000-0000-deadbeef0001", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}
