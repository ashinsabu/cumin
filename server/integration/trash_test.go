package integration

import (
	"context"
	"net/http"
	"testing"

	"github.com/ashinsabu/cumin/server/testutil"
)

type trashProjectJSON struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type trashEpicJSON struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type trashResponseJSON struct {
	Projects []trashProjectJSON `json:"projects"`
	Epics    []trashEpicJSON    `json:"epics"`
}

// ─── Trash list ───────────────────────────────────────────────────────────────

func TestTrash_List_ReturnsEmptyLists(t *testing.T) {
	// Ensure no deleted projects/epics exist for our board by cleaning up first.
	ctx := context.Background()
	testEnv.DB.Exec(ctx,
		`UPDATE projects SET deleted_at = NULL WHERE user_id = $1 AND deleted_at IS NOT NULL`,
		testutil.TestUserID)
	testEnv.DB.Exec(ctx,
		`UPDATE epics SET deleted_at = NULL WHERE user_id = $1 AND deleted_at IS NOT NULL`,
		testutil.TestUserID)

	resp := mustDo(t, testEnv.Server, "GET", "/api/trash", nil)
	assertStatus(t, resp, http.StatusOK)
	trash := mustDecodeJSON[trashResponseJSON](t, resp)

	if trash.Projects == nil {
		t.Error("expected projects array (possibly empty), got nil")
	}
	if trash.Epics == nil {
		t.Error("expected epics array (possibly empty), got nil")
	}
}

func TestTrash_List_ContainsDeletedProject(t *testing.T) {
	p := createProject(t, "Trash Project Test", "TPT")
	t.Cleanup(func() { hardDeleteProject(p.ID) })

	// Delete the project.
	resp := mustDo(t, testEnv.Server, "DELETE", "/api/projects/"+p.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Should appear in trash.
	resp = mustDo(t, testEnv.Server, "GET", "/api/trash", nil)
	assertStatus(t, resp, http.StatusOK)
	trash := mustDecodeJSON[trashResponseJSON](t, resp)

	found := false
	for _, tp := range trash.Projects {
		if tp.ID == p.ID {
			found = true
		}
	}
	if !found {
		t.Errorf("deleted project %s not found in GET /api/trash", p.ID)
	}
}

func TestTrash_List_ContainsDeletedEpic(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/epics", map[string]any{
		"name":  "Trash Epic Test",
		"type":  "catchall",
		"color": "#abcdef",
	})
	assertStatus(t, resp, http.StatusOK)
	ep := mustDecodeJSON[epicJSON](t, resp)
	t.Cleanup(func() { hardDeleteEpic(ep.ID) })

	// Delete the epic.
	resp = mustDo(t, testEnv.Server, "DELETE", "/api/epics/"+ep.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Should appear in trash.
	resp = mustDo(t, testEnv.Server, "GET", "/api/trash", nil)
	assertStatus(t, resp, http.StatusOK)
	trash := mustDecodeJSON[trashResponseJSON](t, resp)

	found := false
	for _, te := range trash.Epics {
		if te.ID == ep.ID {
			found = true
		}
	}
	if !found {
		t.Errorf("deleted epic %s not found in GET /api/trash", ep.ID)
	}
}

func TestTrash_DeletedProject_NotInActiveList(t *testing.T) {
	p := createProject(t, "Active then deleted", "ATD")
	t.Cleanup(func() { hardDeleteProject(p.ID) })

	resp := mustDo(t, testEnv.Server, "DELETE", "/api/projects/"+p.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	resp = mustDo(t, testEnv.Server, "GET", "/api/projects", nil)
	assertStatus(t, resp, http.StatusOK)
	list := mustDecodeJSON[projectListJSON](t, resp)
	for _, proj := range list.Projects {
		if proj.ID == p.ID {
			t.Errorf("soft-deleted project %s still appears in GET /api/projects", p.ID)
		}
	}
}

// ─── Trash empty ─────────────────────────────────────────────────────────────

func TestTrash_Empty_HardDeletesProjects(t *testing.T) {
	p := createProject(t, "Empty trash project", "ETP")
	t.Cleanup(func() { hardDeleteProject(p.ID) })

	// Soft-delete the project.
	resp := mustDo(t, testEnv.Server, "DELETE", "/api/projects/"+p.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Confirm it's in trash.
	resp = mustDo(t, testEnv.Server, "GET", "/api/trash", nil)
	assertStatus(t, resp, http.StatusOK)
	trash := mustDecodeJSON[trashResponseJSON](t, resp)
	foundBefore := false
	for _, tp := range trash.Projects {
		if tp.ID == p.ID {
			foundBefore = true
		}
	}
	if !foundBefore {
		t.Fatalf("project %s should be in trash before emptying", p.ID)
	}

	// Empty the trash.
	resp = mustDo(t, testEnv.Server, "DELETE", "/api/trash", nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Trash should no longer contain this project.
	resp = mustDo(t, testEnv.Server, "GET", "/api/trash", nil)
	assertStatus(t, resp, http.StatusOK)
	trash = mustDecodeJSON[trashResponseJSON](t, resp)
	for _, tp := range trash.Projects {
		if tp.ID == p.ID {
			t.Errorf("project %s still in trash after DELETE /api/trash", p.ID)
		}
	}

	// Verify hard-deleted: row must not exist in DB at all.
	ctx := context.Background()
	var count int
	testEnv.DB.QueryRow(ctx, `SELECT COUNT(*) FROM projects WHERE id = $1`, p.ID).Scan(&count)
	if count != 0 {
		t.Errorf("project %s still exists in DB after empty trash", p.ID)
	}
}

// TestTrash_Epic_CascadeDeleteRestoreDoesNotRestoreIndependentItems verifies that
// items deleted independently (before their epic was deleted) are NOT restored
// when the epic is restored via its cascade batch.
func TestTrash_Epic_CascadeDeleteRestoreDoesNotRestoreIndependentItems(t *testing.T) {
	// Create an epic.
	resp := mustDo(t, testEnv.Server, "POST", "/api/epics", map[string]any{
		"name":  "Cascade restore guard",
		"type":  "catchall",
		"color": "#aabbcc",
	})
	assertStatus(t, resp, http.StatusOK)
	ep := mustDecodeJSON[epicJSON](t, resp)
	t.Cleanup(func() { hardDeleteEpic(ep.ID) })

	// Create two items assigned to the epic.
	it1resp := mustDo(t, testEnv.Server, "POST", "/api/items", map[string]any{
		"title":      "Item cascade 1",
		"project_id": testEnv.ProjectID,
	})
	assertStatus(t, it1resp, http.StatusOK)
	it1 := mustDecodeJSON[itemJSON](t, it1resp)
	t.Cleanup(func() { hardDeleteItems(it1.ID) })

	it2resp := mustDo(t, testEnv.Server, "POST", "/api/items", map[string]any{
		"title":      "Item cascade 2",
		"project_id": testEnv.ProjectID,
	})
	assertStatus(t, it2resp, http.StatusOK)
	it2 := mustDecodeJSON[itemJSON](t, it2resp)
	t.Cleanup(func() { hardDeleteItems(it2.ID) })

	// Assign both items to the epic.
	for _, id := range []string{it1.ID, it2.ID} {
		r := mustDo(t, testEnv.Server, "PATCH", "/api/items/"+id, map[string]any{
			"epic_id": ep.ID,
		})
		assertStatus(t, r, http.StatusOK)
		drainClose(r)
	}

	// Delete item 1 independently BEFORE deleting the epic.
	resp = mustDo(t, testEnv.Server, "DELETE", "/api/items/"+it1.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Now delete the epic (cascades to item 2).
	resp = mustDo(t, testEnv.Server, "DELETE", "/api/epics/"+ep.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Restore the epic (should restore item 2 only, not item 1).
	resp = mustDo(t, testEnv.Server, "POST", "/api/epics/"+ep.ID+"/restore", nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	// Item 2 (cascade-deleted with epic) SHOULD be restored.
	resp = mustDo(t, testEnv.Server, "GET", "/api/items/"+it2.ID, nil)
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	// Item 1 (deleted independently before epic) MUST NOT be restored.
	resp = mustDo(t, testEnv.Server, "GET", "/api/items/"+it1.ID, nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

// ─── Trash items ─────────────────────────────────────────────────────────────

type trashItemJSON struct {
	ID          string `json:"id"`
	DisplayID   string `json:"display_id"`
	Title       string `json:"title"`
	ProjectName string `json:"project_name"`
}

type trashWithItemsJSON struct {
	Items []trashItemJSON `json:"items"`
	Epics []trashEpicJSON `json:"epics"`
}

func trashItemIDs(t *testing.T) (items map[string]trashItemJSON, epics map[string]bool) {
	t.Helper()
	resp := mustDo(t, testEnv.Server, "GET", "/api/trash", nil)
	assertStatus(t, resp, http.StatusOK)
	tr := mustDecodeJSON[trashWithItemsJSON](t, resp)
	items, epics = map[string]trashItemJSON{}, map[string]bool{}
	for _, it := range tr.Items {
		items[it.ID] = it
	}
	for _, e := range tr.Epics {
		epics[e.ID] = true
	}
	return items, epics
}

// Regression (user feedback 2026-10-28): a deleted item vanished — Trash listed only projects and
// epics, so an item deleted by mistake could not be found or restored, and "Empty trash" would
// hard-delete such items without ever having shown them.
func TestTrash_List_ShowsIndependentlyDeletedItemAndRestoreWorks(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/items", map[string]any{
		"title": "Deleted by mistake", "project_id": testEnv.ProjectID,
	})
	assertStatus(t, resp, http.StatusOK)
	it := mustDecodeJSON[itemJSON](t, resp)
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp = mustDo(t, testEnv.Server, "DELETE", "/api/items/"+it.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	items, _ := trashItemIDs(t)
	got, ok := items[it.ID]
	if !ok {
		t.Fatal("deleted item missing from /api/trash items")
	}
	if got.Title != "Deleted by mistake" || got.DisplayID == "" || got.ProjectName == "" {
		t.Errorf("trash item missing display fields: %+v", got)
	}

	resp = mustDo(t, testEnv.Server, "POST", "/api/items/"+it.ID+"/restore", nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	items, _ = trashItemIDs(t)
	if _, still := items[it.ID]; still {
		t.Error("restored item still listed in trash")
	}
}

// Items deleted as part of an epic cascade are represented by the epic row; listing them again would
// double-count and invite restoring them out of their batch.
func TestTrash_List_OmitsEpicCascadedItems(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/epics", map[string]any{
		"name": "Cascade list guard", "type": "catchall", "color": "#aabbcc",
	})
	assertStatus(t, resp, http.StatusOK)
	ep := mustDecodeJSON[epicJSON](t, resp)
	t.Cleanup(func() { hardDeleteEpic(ep.ID) })

	resp = mustDo(t, testEnv.Server, "POST", "/api/items", map[string]any{
		"title": "In epic", "project_id": testEnv.ProjectID, "epic_id": ep.ID,
	})
	assertStatus(t, resp, http.StatusOK)
	it := mustDecodeJSON[itemJSON](t, resp)
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp = mustDo(t, testEnv.Server, "DELETE", "/api/epics/"+ep.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	items, epics := trashItemIDs(t)
	if !epics[ep.ID] {
		t.Error("deleted epic missing from trash")
	}
	if _, listed := items[it.ID]; listed {
		t.Error("epic-cascaded item should be represented by its epic, not listed separately")
	}
}
