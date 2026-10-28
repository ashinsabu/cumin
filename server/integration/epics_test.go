package integration

import (
	"net/http"
	"testing"
)

func epicIDs(t *testing.T) map[string]bool {
	t.Helper()
	resp := mustDo(t, testEnv.Server, "GET", "/api/epics", nil)
	assertStatus(t, resp, http.StatusOK)
	ids := map[string]bool{}
	for _, e := range mustDecodeJSON[epicListJSON](t, resp).Epics {
		ids[e.ID] = true
	}
	return ids
}

// Delete hides an epic from the list, restore brings it back, and neither is repeatable.
func TestEpics_DeleteRestoreLifecycle(t *testing.T) {
	ep := createTestEpicFull(t, "Lifecycle epic", "#123456")
	t.Cleanup(func() { hardDeleteEpic(ep.ID) })

	if !epicIDs(t)[ep.ID] {
		t.Fatal("new epic missing from list")
	}

	resp := mustDo(t, testEnv.Server, "DELETE", "/api/epics/"+ep.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)
	if epicIDs(t)[ep.ID] {
		t.Error("deleted epic still listed")
	}

	resp = mustDo(t, testEnv.Server, "POST", "/api/epics/"+ep.ID+"/restore", nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)
	if !epicIDs(t)[ep.ID] {
		t.Error("restored epic missing from list")
	}

	// Restoring a live epic has nothing to restore.
	resp = mustDo(t, testEnv.Server, "POST", "/api/epics/"+ep.ID+"/restore", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

func TestEpics_DeleteAndRestore_NotFound(t *testing.T) {
	const missing = "/api/epics/00000000-0000-0000-0000-00000000dead"
	resp := mustDo(t, testEnv.Server, "DELETE", missing, nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
	resp = mustDo(t, testEnv.Server, "POST", missing+"/restore", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

// Restore of an id that doesn't exist (or isn't deleted) must be a 404 for every soft-deletable type.
func TestRestore_NotFound(t *testing.T) {
	for _, kind := range []string{"epics", "projects", "items"} {
		t.Run(kind, func(t *testing.T) {
			resp := mustDo(t, testEnv.Server, "POST", "/api/"+kind+"/00000000-0000-0000-0000-00000000dead/restore", nil)
			assertStatus(t, resp, http.StatusNotFound)
			drainClose(resp)
		})
	}
}
