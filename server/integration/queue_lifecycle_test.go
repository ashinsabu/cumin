package integration

import (
	"net/http"
	"testing"
)

func skipUnlessQueue(t *testing.T) {
	t.Helper()
	if !queueEnabled() {
		t.Skip("queue feature flag not set — set FEATURE_FLAGS=queue to run queue tests")
	}
}

func queueIDs(items []queueItemJSON) map[string]bool {
	ids := make(map[string]bool, len(items))
	for _, it := range items {
		ids[it.ID] = true
	}
	return ids
}

func TestQueue_Update(t *testing.T) {
	skipUnlessQueue(t)
	q := createQueueItem(t, "Before", 3)
	t.Cleanup(func() { hardDeleteQueueItem(q.ID) })

	resp := mustDo(t, testEnv.Server, "PATCH", "/api/queue/"+q.ID, map[string]any{"title": "After", "priority": 0})
	assertStatus(t, resp, http.StatusOK)
	updated := mustDecodeJSON[queueItemJSON](t, resp)
	if updated.Title != "After" || updated.Priority != 0 {
		t.Errorf("update not applied: %+v", updated)
	}
	if updated.UrgencyScore <= q.UrgencyScore {
		t.Errorf("urgency should be recomputed for the new priority: before %v, after %v", q.UrgencyScore, updated.UrgencyScore)
	}

	resp = mustDo(t, testEnv.Server, "PATCH", "/api/queue/"+q.ID, map[string]any{"title": ""})
	assertStatus(t, resp, http.StatusBadRequest)
	drainClose(resp)

	resp = mustDo(t, testEnv.Server, "PATCH", "/api/queue/00000000-0000-0000-0000-000000000000", map[string]any{"title": "x"})
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

// Completing moves an item from the live queue to history, and a second complete is a 404
// (completed_at is only ever set once).
func TestQueue_Complete_MovesToHistory(t *testing.T) {
	skipUnlessQueue(t)
	q := createQueueItem(t, "Finish me", 2)
	t.Cleanup(func() { hardDeleteQueueItem(q.ID) })

	resp := mustDo(t, testEnv.Server, "POST", "/api/queue/"+q.ID+"/complete", nil)
	assertStatus(t, resp, http.StatusOK)
	drainClose(resp)

	resp = mustDo(t, testEnv.Server, "GET", "/api/queue", nil)
	assertStatus(t, resp, http.StatusOK)
	if queueIDs(mustDecodeJSON[queueListJSON](t, resp).Items)[q.ID] {
		t.Error("completed item still in live queue")
	}

	resp = mustDo(t, testEnv.Server, "GET", "/api/queue/history", nil)
	assertStatus(t, resp, http.StatusOK)
	if !queueIDs(mustDecodeJSON[queueListJSON](t, resp).Items)[q.ID] {
		t.Error("completed item missing from history")
	}

	resp = mustDo(t, testEnv.Server, "POST", "/api/queue/"+q.ID+"/complete", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}

// Archived items are in neither the queue nor history, and cannot be completed.
func TestQueue_Archived_IsGone(t *testing.T) {
	skipUnlessQueue(t)
	q := createQueueItem(t, "Archive me", 2)
	t.Cleanup(func() { hardDeleteQueueItem(q.ID) })

	resp := mustDo(t, testEnv.Server, "DELETE", "/api/queue/"+q.ID, nil)
	assertStatus(t, resp, http.StatusNoContent)
	drainClose(resp)

	resp = mustDo(t, testEnv.Server, "POST", "/api/queue/"+q.ID+"/complete", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)

	resp = mustDo(t, testEnv.Server, "GET", "/api/queue/history", nil)
	assertStatus(t, resp, http.StatusOK)
	if queueIDs(mustDecodeJSON[queueListJSON](t, resp).Items)[q.ID] {
		t.Error("archived item appeared in history")
	}
}

// Revive sends a stale item to the back of the queue.
func TestQueue_Revive_MovesToBack(t *testing.T) {
	skipUnlessQueue(t)
	first := createQueueItem(t, "Revive first", 2)
	second := createQueueItem(t, "Revive second", 2)
	t.Cleanup(func() { hardDeleteQueueItem(first.ID); hardDeleteQueueItem(second.ID) })

	resp := mustDo(t, testEnv.Server, "POST", "/api/queue/"+first.ID+"/revive", nil)
	assertStatus(t, resp, http.StatusOK)
	revived := mustDecodeJSON[queueItemJSON](t, resp)
	if revived.Position <= second.Position {
		t.Errorf("revived position %d should be after %d", revived.Position, second.Position)
	}

	resp = mustDo(t, testEnv.Server, "POST", "/api/queue/00000000-0000-0000-0000-000000000000/revive", nil)
	assertStatus(t, resp, http.StatusNotFound)
	drainClose(resp)
}
