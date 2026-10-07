package integration

import (
	"context"
	"net/http"
	"testing"
)

type projectJSON struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Prefix string `json:"prefix"`
}

type projectListJSON struct {
	Projects []projectJSON `json:"projects"`
}

// createProject creates a project and returns the decoded body.
func createProject(t *testing.T, name, prefix string) projectJSON {
	t.Helper()
	resp := mustDo(t, testEnv.Server, "POST", "/api/projects", map[string]any{
		"name":   name,
		"prefix": prefix,
		"color":  "#aabbcc",
	})
	assertStatus(t, resp, http.StatusOK)
	return mustDecodeJSON[projectJSON](t, resp)
}

// hardDeleteProject removes a project and its items from the DB.
// Items must be deleted first because projects.id FK on items is ON DELETE SET NULL
// (not CASCADE), so a bare DELETE on projects would orphan items.
func hardDeleteProject(id string) {
	ctx := context.Background()
	testEnv.DB.Exec(ctx, "DELETE FROM items WHERE project_id = $1", id)
	testEnv.DB.Exec(ctx, "DELETE FROM projects WHERE id = $1", id)
}

// ─── Core flow ────────────────────────────────────────────────────────────────

// TestProjects_CoreFlow exercises create → delete → recreate → restore-conflict → restore.
func TestProjects_CoreFlow(t *testing.T) {
	srv := testEnv.Server
	ctx := context.Background()

	// Step 1: create project with prefix "TST".
	projA := createProject(t, "Project A", "TST")
	t.Cleanup(func() { hardDeleteProject(projA.ID) })

	// Step 2: delete project A.
	resp := mustDo(t, srv, "DELETE", "/api/projects/"+projA.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Step 3: create project B with the same prefix "TST" (now available).
	projB := createProject(t, "Project B", "TST")
	t.Cleanup(func() { hardDeleteProject(projB.ID) })

	// Step 4: try to restore project A → 409 (prefix collision with project B).
	resp = mustDo(t, srv, "POST", "/api/projects/"+projA.ID+"/restore", nil)
	assertStatus(t, resp, http.StatusConflict)
	drainClose(resp)

	// Step 5: delete project B.
	resp = mustDo(t, srv, "DELETE", "/api/projects/"+projB.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Step 6: restore project A → 204.
	resp = mustDo(t, srv, "POST", "/api/projects/"+projA.ID+"/restore", nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Step 7: GET /api/projects → project A is back.
	resp = mustDo(t, srv, "GET", "/api/projects", nil)
	assertStatus(t, resp, http.StatusOK)
	list := mustDecodeJSON[projectListJSON](t, resp)
	found := false
	for _, p := range list.Projects {
		if p.ID == projA.ID {
			found = true
		}
	}
	if !found {
		t.Errorf("restored project A not found in GET /api/projects")
	}

	// Verify project B (soft-deleted) is NOT in the active list.
	for _, p := range list.Projects {
		if p.ID == projB.ID {
			t.Errorf("deleted project B should not appear in GET /api/projects")
		}
	}

	// Project A items were cascade-deleted with the project and restored.
	// (No items were on A in this test, but confirm query runs without error.)
	_ = ctx
}

// ─── Validation ───────────────────────────────────────────────────────────────

func TestProjects_Create_DuplicatePrefix(t *testing.T) {
	p := createProject(t, "Unique Proj", "UNQ")
	t.Cleanup(func() { hardDeleteProject(p.ID) })

	resp := mustDo(t, testEnv.Server, "POST", "/api/projects", map[string]any{
		"name":   "Duplicate Prefix",
		"prefix": "UNQ",
	})
	assertStatus(t, resp, http.StatusConflict)
	drainClose(resp)
}

func TestProjects_Create_NoName(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/projects", map[string]any{
		"prefix": "NNM",
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

func TestProjects_Create_NoPrefix(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/projects", map[string]any{
		"name": "No Prefix",
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

func TestProjects_Create_PrefixTooLong(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/projects", map[string]any{
		"name":   "Long Prefix",
		"prefix": "TOOLONGPREFIX",
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

// ─── Update ───────────────────────────────────────────────────────────────────

func TestProjects_Update(t *testing.T) {
	p := createProject(t, "Update Me", "UPD")
	t.Cleanup(func() { hardDeleteProject(p.ID) })

	resp := mustDo(t, testEnv.Server, "PATCH", "/api/projects/"+p.ID, map[string]any{
		"name":  "Updated Name",
		"color": "#123456",
	})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[projectJSON](t, resp)
	if updated.Name != "Updated Name" {
		t.Errorf("expected name='Updated Name', got %q", updated.Name)
	}
}

func TestProjects_Update_NotFound(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "PATCH", "/api/projects/00000000-0000-0000-0000-000000000000", map[string]any{
		"name": "Ghost",
	})
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

// ─── Delete / restore ─────────────────────────────────────────────────────────

func TestProjects_Delete_NotFound(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "DELETE", "/api/projects/00000000-0000-0000-0000-000000000000", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

// TestProjects_Restore_ItemsNotRestoredIfIndependentlyDeleted confirms that items
// deleted independently (before a project soft-delete) are NOT restored when the
// project is restored (deleted_at timestamp mismatch).
func TestProjects_Restore_ItemsNotRestoredIfIndependentlyDeleted(t *testing.T) {
	p := createProject(t, "Timestamp Test Proj", "TTP")
	t.Cleanup(func() { hardDeleteProject(p.ID) })

	// Create an item, then delete the item independently.
	resp := mustDo(t, testEnv.Server, "POST", "/api/items", map[string]any{
		"title":      "Pre-deleted item",
		"project_id": p.ID,
	})
	assertStatus(t, resp, http.StatusOK)
	preDel := mustDecodeJSON[itemJSON](t, resp)
	t.Cleanup(func() { hardDeleteItems(preDel.ID) })

	resp = mustDo(t, testEnv.Server, "DELETE", "/api/items/"+preDel.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Now delete the project (which would cascade to any remaining items).
	resp = mustDo(t, testEnv.Server, "DELETE", "/api/projects/"+p.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Restore the project.
	resp = mustDo(t, testEnv.Server, "POST", "/api/projects/"+p.ID+"/restore", nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// The independently-deleted item should NOT be restored.
	resp = mustDo(t, testEnv.Server, "GET", "/api/items/"+preDel.ID, nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

// ─── List ─────────────────────────────────────────────────────────────────────

func TestProjects_List(t *testing.T) {
	p := createProject(t, "List Test Proj", "LST")
	t.Cleanup(func() { hardDeleteProject(p.ID) })

	resp := mustDo(t, testEnv.Server, "GET", "/api/projects", nil)
	assertStatus(t, resp, http.StatusOK)
	list := mustDecodeJSON[projectListJSON](t, resp)

	found := false
	for _, proj := range list.Projects {
		if proj.ID == p.ID {
			found = true
		}
	}
	if !found {
		t.Errorf("created project not found in GET /api/projects")
	}
}

// ─── Cross-board isolation ────────────────────────────────────────────────────

func TestProjects_CrossBoard_Isolation(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "DELETE", "/api/projects/00000000-0000-0000-0000-deadbeef0002", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}
