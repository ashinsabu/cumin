package integration

import (
	"net/http"
	"testing"
)

// fullEpicJSON captures all fields returned by PATCH /api/epics/{id}.
type fullEpicJSON struct {
	ID          string `json:"id"`
	BoardID     string `json:"board_id"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	Color       string `json:"color"`
	Description string `json:"description"`
}

// fullItemJSON captures all fields relevant to PATCH /api/items/{id}.
type fullItemJSON struct {
	ID              string  `json:"id"`
	Title           string  `json:"title"`
	Priority        int     `json:"priority"`
	EstimateMinutes *int    `json:"estimate_minutes"`
	EpicID          *string `json:"epic_id"`
	SprintID        *string `json:"sprint_id"`
}

// createTestEpicFull creates an epic and returns its full JSON.
func createTestEpicFull(t *testing.T, name, color string) fullEpicJSON {
	t.Helper()
	resp := mustDo(t, testEnv.Server, "POST", "/api/epics", map[string]any{
		"name":  name,
		"type":  "catchall",
		"color": color,
	})
	assertStatus(t, resp, http.StatusOK)
	return mustDecodeJSON[fullEpicJSON](t, resp)
}

// ─── Items PATCH ─────────────────────────────────────────────────────────────

func TestItems_Patch_UpdateTitle(t *testing.T) {
	it := createTestItem(t, "Original Title")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp := mustDo(t, testEnv.Server, "PATCH", "/api/items/"+it.ID, map[string]any{
		"title": "Updated Title",
	})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[fullItemJSON](t, resp)

	if updated.Title != "Updated Title" {
		t.Errorf("expected title='Updated Title', got %q", updated.Title)
	}
}

func TestItems_Patch_UpdatePriority(t *testing.T) {
	it := createTestItem(t, "Priority item")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	p := 0 // P0
	resp := mustDo(t, testEnv.Server, "PATCH", "/api/items/"+it.ID, map[string]any{
		"priority": &p,
	})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[fullItemJSON](t, resp)

	if updated.Priority != 0 {
		t.Errorf("expected priority=0, got %d", updated.Priority)
	}
}

func TestItems_Patch_UpdateEstimate(t *testing.T) {
	it := createTestItem(t, "Estimate item")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	est := 90
	resp := mustDo(t, testEnv.Server, "PATCH", "/api/items/"+it.ID, map[string]any{
		"estimate_minutes": &est,
	})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[fullItemJSON](t, resp)

	if updated.EstimateMinutes == nil || *updated.EstimateMinutes != 90 {
		t.Errorf("expected estimate_minutes=90, got %v", updated.EstimateMinutes)
	}
}

// TestItems_Patch_PartialDoesNotClobber verifies that updating only the title
// leaves epic_id and priority unchanged.
func TestItems_Patch_PartialDoesNotClobber(t *testing.T) {
	ep := createTestEpicFull(t, "Clobber guard epic", "#aabbcc")
	t.Cleanup(func() { hardDeleteEpic(ep.ID) })

	it := createTestItem(t, "Clobber test item")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	// Assign epic and set priority to P1.
	p := 1
	resp := mustDo(t, testEnv.Server, "PATCH", "/api/items/"+it.ID, map[string]any{
		"epic_id":  ep.ID,
		"priority": &p,
	})
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	// Now update only the title — epic_id and priority must stay.
	resp = mustDo(t, testEnv.Server, "PATCH", "/api/items/"+it.ID, map[string]any{
		"title": "New Title Only",
	})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[fullItemJSON](t, resp)

	if updated.Title != "New Title Only" {
		t.Errorf("expected title='New Title Only', got %q", updated.Title)
	}
	if updated.EpicID == nil || *updated.EpicID != ep.ID {
		t.Errorf("epic_id was clobbered: expected %s, got %v", ep.ID, updated.EpicID)
	}
	if updated.Priority != 1 {
		t.Errorf("priority was clobbered: expected 1, got %d", updated.Priority)
	}
}

func TestItems_Patch_NotFound(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "PATCH", "/api/items/00000000-0000-0000-0000-000000000000", map[string]any{
		"title": "Ghost",
	})
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

func TestItems_Patch_AssignSprint(t *testing.T) {
	sp := createSprint(t)
	t.Cleanup(func() { hardDeleteSprint(sp.ID) })

	it := createTestItem(t, "Sprint assign via PATCH")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp := mustDo(t, testEnv.Server, "PATCH", "/api/items/"+it.ID, map[string]any{
		"sprint_id": sp.ID,
	})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[fullItemJSON](t, resp)

	if updated.SprintID == nil || *updated.SprintID != sp.ID {
		t.Errorf("expected sprint_id=%s, got %v", sp.ID, updated.SprintID)
	}
}

// ─── Epics PATCH ─────────────────────────────────────────────────────────────

func TestEpics_Patch_UpdateName(t *testing.T) {
	ep := createTestEpicFull(t, "Old Name", "#ff0000")
	t.Cleanup(func() { hardDeleteEpic(ep.ID) })

	resp := mustDo(t, testEnv.Server, "PATCH", "/api/epics/"+ep.ID, map[string]any{
		"name": "New Name",
	})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[fullEpicJSON](t, resp)

	if updated.Name != "New Name" {
		t.Errorf("expected name='New Name', got %q", updated.Name)
	}
}

func TestEpics_Patch_UpdateColor(t *testing.T) {
	ep := createTestEpicFull(t, "Color test epic", "#ff0000")
	t.Cleanup(func() { hardDeleteEpic(ep.ID) })

	resp := mustDo(t, testEnv.Server, "PATCH", "/api/epics/"+ep.ID, map[string]any{
		"color": "#00ff00",
	})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[fullEpicJSON](t, resp)

	if updated.Color != "#00ff00" {
		t.Errorf("expected color='#00ff00', got %q", updated.Color)
	}
}

func TestEpics_Patch_UpdateDescription(t *testing.T) {
	ep := createTestEpicFull(t, "Desc test", "#aabbcc")
	t.Cleanup(func() { hardDeleteEpic(ep.ID) })

	resp := mustDo(t, testEnv.Server, "PATCH", "/api/epics/"+ep.ID, map[string]any{
		"description": "My epic description",
	})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[fullEpicJSON](t, resp)

	if updated.Description != "My epic description" {
		t.Errorf("expected description='My epic description', got %q", updated.Description)
	}
}

// TestEpics_Patch_PartialDoesNotClobber verifies that updating the color only
// leaves name and description unchanged.
func TestEpics_Patch_PartialDoesNotClobber(t *testing.T) {
	ep := createTestEpicFull(t, "Keep this name", "#123456")
	t.Cleanup(func() { hardDeleteEpic(ep.ID) })

	// First set a description.
	resp := mustDo(t, testEnv.Server, "PATCH", "/api/epics/"+ep.ID, map[string]any{
		"description": "initial description",
	})
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	// Now update only the color; name and description must stay.
	resp = mustDo(t, testEnv.Server, "PATCH", "/api/epics/"+ep.ID, map[string]any{
		"color": "#654321",
	})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[fullEpicJSON](t, resp)

	if updated.Name != "Keep this name" {
		t.Errorf("name was clobbered: expected 'Keep this name', got %q", updated.Name)
	}
	if updated.Color != "#654321" {
		t.Errorf("expected color='#654321', got %q", updated.Color)
	}
	if updated.Description != "initial description" {
		t.Errorf("description was clobbered: expected 'initial description', got %q", updated.Description)
	}
}

func TestEpics_Patch_NotFound(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "PATCH", "/api/epics/00000000-0000-0000-0000-000000000000", map[string]any{
		"name": "Ghost Epic",
	})
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

// ─── Epics Create validation ──────────────────────────────────────────────────

func TestEpics_Create_NoName(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/epics", map[string]any{
		"type":  "catchall",
		"color": "#ff0000",
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

func TestEpics_Create_InvalidType(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "POST", "/api/epics", map[string]any{
		"name": "Bad type epic",
		"type": "nonexistent",
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}
