package integration

import (
	"net/http"
	"testing"
)

// ─── Item reorder ────────────────────────────────────────────────────────────

// TestItems_Reorder_WithinStatus verifies that PUT /api/items/reorder
// persists the new position order for items within a status column.
func TestItems_Reorder_WithinStatus(t *testing.T) {
	srv := testEnv.Server

	// Create 3 items in the Todo column.
	it0 := createTestItem(t, "Reorder item 0")
	it1 := createTestItem(t, "Reorder item 1")
	it2 := createTestItem(t, "Reorder item 2")
	t.Cleanup(func() { hardDeleteItems(it0.ID, it1.ID, it2.ID) })

	// Reorder: reverse the order.
	resp := mustDo(t, srv, "PUT", "/api/items/reorder", map[string]any{
		"status_id": testEnv.TodoStatusID,
		"ids":       []string{it2.ID, it1.ID, it0.ID},
	})
	assertStatus(t, resp, http.StatusOK)
	result := mustDecodeJSON[itemListJSON](t, resp)

	if len(result.Items) == 0 {
		t.Fatal("expected non-empty items list after reorder")
	}

	// Find the positions of our 3 items in the response.
	posMap := map[string]int{}
	for _, item := range result.Items {
		posMap[item.ID] = 0 // placeholder; we'll use index order
	}
	// Build an ordered index of our 3 items among all returned items.
	var myOrder []string
	for _, item := range result.Items {
		if item.ID == it0.ID || item.ID == it1.ID || item.ID == it2.ID {
			myOrder = append(myOrder, item.ID)
		}
	}

	// After reversing [it0, it1, it2] → [it2, it1, it0], items should appear in that order.
	wantOrder := []string{it2.ID, it1.ID, it0.ID}
	if len(myOrder) != 3 {
		t.Fatalf("expected 3 of our items in response, got %d", len(myOrder))
	}
	for i, id := range wantOrder {
		if myOrder[i] != id {
			t.Errorf("position %d: expected item %s, got %s", i, id, myOrder[i])
		}
	}
}

// TestItems_Reorder_EmptyIDs verifies that reorder with no IDs returns 400.
func TestItems_Reorder_EmptyIDs(t *testing.T) {
	resp := mustDo(t, testEnv.Server, "PUT", "/api/items/reorder", map[string]any{
		"status_id": testEnv.TodoStatusID,
		"ids":       []string{},
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

// TestItems_Reorder_MissingStatusID verifies that reorder without status_id returns 400.
func TestItems_Reorder_MissingStatusID(t *testing.T) {
	it := createTestItem(t, "Reorder missing status")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp := mustDo(t, testEnv.Server, "PUT", "/api/items/reorder", map[string]any{
		"ids": []string{it.ID},
	})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)
}

// TestItems_Reorder_SingleItem verifies that a single-item reorder is idempotent (200 OK).
func TestItems_Reorder_SingleItem(t *testing.T) {
	it := createTestItem(t, "Single reorder item")
	t.Cleanup(func() { hardDeleteItems(it.ID) })

	resp := mustDo(t, testEnv.Server, "PUT", "/api/items/reorder", map[string]any{
		"status_id": testEnv.TodoStatusID,
		"ids":       []string{it.ID},
	})
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)
}
