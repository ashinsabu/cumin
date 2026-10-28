package integration

import (
	"encoding/json"
	"net/http"
	"testing"
)

type savedViewJSON struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	Filters json.RawMessage `json:"filters"`
}

type viewsListJSON struct {
	Views []savedViewJSON `json:"views"`
}

func listViews(t *testing.T) []savedViewJSON {
	t.Helper()
	resp := mustDo(t, testEnv.Server, "GET", "/api/views", nil)
	assertStatus(t, resp, http.StatusOK)
	return mustDecodeJSON[viewsListJSON](t, resp).Views
}

func findView(views []savedViewJSON, id string) *savedViewJSON {
	for i := range views {
		if views[i].ID == id {
			return &views[i]
		}
	}
	return nil
}

func createView(t *testing.T, body map[string]any) savedViewJSON {
	t.Helper()
	resp := mustDo(t, testEnv.Server, "POST", "/api/views", body)
	assertStatus(t, resp, http.StatusOK)
	v := mustDecodeJSON[savedViewJSON](t, resp)
	t.Cleanup(func() { drainClose(mustDo(t, testEnv.Server, "DELETE", "/api/views/"+v.ID, nil)) })
	return v
}

func TestViews_CoreFlow(t *testing.T) {
	filters := map[string]any{"status": []string{"in-progress"}, "priority": "high"}
	v := createView(t, map[string]any{"name": "Urgent in flight", "filters": filters})
	if v.ID == "" || v.Name != "Urgent in flight" {
		t.Fatalf("created view = %+v", v)
	}

	got := findView(listViews(t), v.ID)
	if got == nil {
		t.Fatal("created view missing from list")
	}
	// iOS stores the filter blob as-is, so it must round-trip unchanged.
	var roundTripped map[string]any
	if err := json.Unmarshal(got.Filters, &roundTripped); err != nil {
		t.Fatal(err)
	}
	if roundTripped["priority"] != "high" || len(roundTripped["status"].([]any)) != 1 {
		t.Errorf("filters did not round-trip: %s", got.Filters)
	}

	resp := mustDo(t, testEnv.Server, "DELETE", "/api/views/"+v.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)
	if findView(listViews(t), v.ID) != nil {
		t.Error("deleted view still listed")
	}
}

func TestViews_Create_NameRequired(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/views", map[string]any{"filters": map[string]any{}})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

func TestViews_Create_DefaultsFiltersToEmptyObject(t *testing.T) {
	v := createView(t, map[string]any{"name": "No filters"})
	got := findView(listViews(t), v.ID)
	if got == nil || string(got.Filters) != "{}" {
		t.Errorf("filters = %s, want {}", got.Filters)
	}
}

func TestViews_Delete_NotFoundAndRepeat(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "DELETE", "/api/views/00000000-0000-0000-0000-00000000dead", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)

	v := createView(t, map[string]any{"name": "Once"})
	drainClose(mustDo(t, testEnv.Server, "DELETE", "/api/views/"+v.ID, nil))
	resp = mustDo(t, testEnv.Server, "DELETE", "/api/views/"+v.ID, nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}
