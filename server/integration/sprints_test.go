package integration

import (
	"context"
	"net/http"
	"testing"
)

type sprintJSON struct {
	ID    string `json:"id"`
	State string `json:"state"`
}

type sprintListJSON struct {
	Sprints []sprintJSON `json:"sprints"`
}

type spilloverPreviewJSON struct {
	Count int `json:"count"`
}

type closeResponseJSON struct {
	SpilledCount int        `json:"spilled_count"`
	NextSprint   *sprintJSON `json:"next_sprint"`
}

// hardDeleteSprint removes a sprint and any items assigned to it.
func hardDeleteSprint(id string) {
	ctx := context.Background()
	testEnv.DB.Exec(ctx, "DELETE FROM items WHERE sprint_id = $1", id)
	testEnv.DB.Exec(ctx, "DELETE FROM sprints WHERE id = $1", id)
}

// createSprint creates a planning sprint and returns its decoded body.
func createSprint(t *testing.T) sprintJSON {
	t.Helper()
	resp := mustDo(t, testEnv.Server, "POST", "/api/sprints", map[string]any{})
	assertStatus(t, resp, http.StatusOK)
	return mustDecodeJSON[sprintJSON](t, resp)
}

// ─── Core flow ────────────────────────────────────────────────────────────────

func TestSprints_CoreFlow(t *testing.T) {
	srv := testEnv.Server

	// Step 1: create a sprint in planning state.
	sp := createSprint(t)
	t.Cleanup(func() { hardDeleteSprint(sp.ID) })

	if sp.State != "planning" {
		t.Fatalf("expected state=planning, got %s", sp.State)
	}

	// Step 2: create 3 items assigned to the sprint.
	var itemIDs [3]string
	for i := 0; i < 3; i++ {
		resp := mustDo(t, srv, "POST", "/api/items", map[string]any{
			"title":      "Sprint item",
			"project_id": testEnv.ProjectID,
			"sprint_id":  sp.ID,
		})
		assertStatus(t, resp, http.StatusOK)
		it := mustDecodeJSON[itemJSON](t, resp)
		itemIDs[i] = it.ID
		t.Cleanup(func() { hardDeleteItems(it.ID) })
	}

	// Step 3: activate the sprint.
	resp := mustDo(t, srv, "POST", "/api/sprints/"+sp.ID+"/activate", nil)
	assertStatus(t, resp, http.StatusOK)
	activated := mustDecodeJSON[sprintJSON](t, resp)
	if activated.State != "active" {
		t.Fatalf("expected state=active after activate, got %s", activated.State)
	}

	// Step 4: trying to activate a SECOND sprint while one is active → 409.
	sp2 := createSprint(t)
	t.Cleanup(func() { hardDeleteSprint(sp2.ID) })

	resp = mustDo(t, srv, "POST", "/api/sprints/"+sp2.ID+"/activate", nil)
	assertStatus(t, resp, http.StatusConflict)
	drainClose(resp)

	// Step 5: move item[0] to done.
	resp = mustDo(t, srv, "POST", "/api/items/"+itemIDs[0]+"/move", map[string]any{
		"status_id": testEnv.DoneStatusID,
	})
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	// Step 6: spillover preview → 2 items would spill.
	resp = mustDo(t, srv, "GET", "/api/sprints/"+sp.ID+"/spillover-preview", nil)
	assertStatus(t, resp, http.StatusOK)
	preview := mustDecodeJSON[spilloverPreviewJSON](t, resp)
	if preview.Count != 2 {
		t.Errorf("expected spillover count=2, got %d", preview.Count)
	}

	// Step 7: close the sprint.
	resp = mustDo(t, srv, "POST", "/api/sprints/"+sp.ID+"/close", nil)
	assertStatus(t, resp, http.StatusOK)
	closeResp := mustDecodeJSON[closeResponseJSON](t, resp)

	if closeResp.SpilledCount != 2 {
		t.Errorf("expected 2 spilled items, got %d", closeResp.SpilledCount)
	}
	if closeResp.NextSprint == nil {
		t.Fatal("expected next_sprint in close response")
	}
	nextSprintID := closeResp.NextSprint.ID
	t.Cleanup(func() { hardDeleteSprint(nextSprintID) })

	// Old sprint should be completed.
	resp = mustDo(t, srv, "GET", "/api/sprints", nil)
	assertStatus(t, resp, http.StatusOK)
	list := mustDecodeJSON[sprintListJSON](t, resp)
	var oldState, nextState string
	for _, s := range list.Sprints {
		if s.ID == sp.ID {
			oldState = s.State
		}
		if s.ID == nextSprintID {
			nextState = s.State
		}
	}
	if oldState != "completed" {
		t.Errorf("old sprint: expected state=completed, got %s", oldState)
	}
	if nextState != "planning" {
		t.Errorf("new sprint: expected state=planning, got %s", nextState)
	}

	// item[0] (done) stays on old sprint; items[1,2] spilled to new sprint.
	ctx := context.Background()
	var sprintForItem0 string
	testEnv.DB.QueryRow(ctx, "SELECT sprint_id FROM items WHERE id = $1", itemIDs[0]).Scan(&sprintForItem0)
	if sprintForItem0 != sp.ID {
		t.Errorf("item[0] (done): expected sprint_id=%s, got %s", sp.ID, sprintForItem0)
	}

	for _, id := range itemIDs[1:] {
		var sprintForItem string
		testEnv.DB.QueryRow(ctx, "SELECT sprint_id FROM items WHERE id = $1", id).Scan(&sprintForItem)
		if sprintForItem != nextSprintID {
			t.Errorf("item %s: expected sprint_id=%s (next sprint), got %s", id, nextSprintID, sprintForItem)
		}
	}
}

// ─── Edge cases ───────────────────────────────────────────────────────────────

func TestSprints_Activate_AlreadyActive(t *testing.T) {
	sp := createSprint(t)
	t.Cleanup(func() { hardDeleteSprint(sp.ID) })

	resp := mustDo(t, testEnv.Server, "POST", "/api/sprints/"+sp.ID+"/activate", nil)
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	// Create a second sprint and try to activate it while the first is active.
	sp2 := createSprint(t)
	t.Cleanup(func() { hardDeleteSprint(sp2.ID) })

	resp = mustDo(t, testEnv.Server, "POST", "/api/sprints/"+sp2.ID+"/activate", nil)
	assertStatus(t, resp, http.StatusConflict)
	drainClose(resp)

	// Cleanup: must close sp1 so subsequent tests don't have a dangling active sprint.
	resp = mustDo(t, testEnv.Server, "POST", "/api/sprints/"+sp.ID+"/close", nil)
	assertStatus(t, resp, http.StatusOK)
	cr := mustDecodeJSON[closeResponseJSON](t, resp)
	if cr.NextSprint != nil {
		t.Cleanup(func() { hardDeleteSprint(cr.NextSprint.ID) })
	}
}

func TestSprints_Activate_NotFound(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/sprints/00000000-0000-0000-0000-000000000000/activate", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

func TestSprints_Close_NotActive_Returns409(t *testing.T) {
	sp := createSprint(t)
	t.Cleanup(func() { hardDeleteSprint(sp.ID) })

	// Sprint is in planning, not active → close should fail.
	resp := mustDo(t, testEnv.Server, "POST", "/api/sprints/"+sp.ID+"/close", nil)
	assertStatus(t, resp, http.StatusConflict)
	drainClose(resp)
}

func TestSprints_GetActive_NoneActive(t *testing.T) {
	// Ensure no active sprint exists for the board.
	ctx := context.Background()
	var activeID string
	err := testEnv.DB.QueryRow(ctx,
		`SELECT id FROM sprints WHERE board_id = $1 AND state = 'active'`, testEnv.BoardID,
	).Scan(&activeID)
	if err == nil {
		// There IS an active sprint — skip rather than break state.
		t.Skip("active sprint exists; skipping no-active-sprint test")
	}

	resp := mustDo(t, testEnv.Server, "GET", "/api/sprints/active", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

func TestSprints_Create_BasicPlanningState(t *testing.T) {
	sp := createSprint(t)
	t.Cleanup(func() { hardDeleteSprint(sp.ID) })

	if sp.State != "planning" {
		t.Errorf("expected state=planning, got %s", sp.State)
	}
	if sp.ID == "" {
		t.Errorf("expected non-empty ID")
	}
}

func TestSprints_List(t *testing.T) {
	sp := createSprint(t)
	t.Cleanup(func() { hardDeleteSprint(sp.ID) })

	resp := mustDo(t, testEnv.Server, "GET", "/api/sprints", nil)
	assertStatus(t, resp, http.StatusOK)
	list := mustDecodeJSON[sprintListJSON](t, resp)

	found := false
	for _, s := range list.Sprints {
		if s.ID == sp.ID {
			found = true
		}
	}
	if !found {
		t.Errorf("created sprint not found in GET /api/sprints")
	}
}

func TestSprints_SpilloverPreview_NotFound(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "GET", "/api/sprints/00000000-0000-0000-0000-000000000000/spillover-preview", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}
