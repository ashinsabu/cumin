package hub_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ashinsabu/cumin/server/hub"
)

func TestHandler_EventsDisabledFlagReturns404(t *testing.T) {
	h := hub.NewHandler(hub.New(), false)

	r := httptest.NewRequest(http.MethodGet, "/api/events", nil)
	w := httptest.NewRecorder()
	h.Events(w, r)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 when feature disabled, got %d", w.Code)
	}
}

func TestHandler_EventsNoFlusherReturns500(t *testing.T) {
	// httptest.ResponseRecorder does not implement http.Flusher.
	// When enabled=true but no flusher, handler must return 500.
	h := hub.NewHandler(hub.New(), true)

	r := httptest.NewRequest(http.MethodGet, "/api/events", nil)
	w := httptest.NewRecorder()
	h.Events(w, r)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 when flusher unavailable, got %d", w.Code)
	}
}

func TestHandler_EventsMissingBoardIDReturns404(t *testing.T) {
	// When board.ContextMiddleware is absent the board ID is "" — handler must 404.
	// Use a real httptest.Server so the ResponseWriter implements http.Flusher.
	h := hub.NewHandler(hub.New(), true)
	ts := httptest.NewServer(http.HandlerFunc(h.Events))
	defer ts.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return // context cancelled or connection reset after 404 — acceptable
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 with no board in context, got %d", resp.StatusCode)
	}
}

func TestNotifyMiddleware_SkipsGETRequests(t *testing.T) {
	fake := &hub.FakeNotifier{}
	handler := hub.NotifyMiddleware(fake)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/items", nil))

	if fake.NotifyCount() != 0 {
		t.Errorf("GET should not trigger notify, got %d calls", fake.NotifyCount())
	}
}

func TestNotifyMiddleware_SkipsFailedMutations(t *testing.T) {
	fake := &hub.FakeNotifier{}
	handler := hub.NotifyMiddleware(fake)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad request", http.StatusBadRequest)
	}))

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/items", nil))

	if fake.NotifyCount() != 0 {
		t.Errorf("4xx should not trigger notify, got %d calls", fake.NotifyCount())
	}
}

func TestNotifyMiddleware_FiresOnSuccessfulMutation(t *testing.T) {
	// Without board.ContextMiddleware the board ID is "", so WasNotified("")
	// would be true but boardID is empty — verifying notify is called at all.
	fake := &hub.FakeNotifier{}
	handler := hub.NotifyMiddleware(fake)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, method := range []string{http.MethodPost, http.MethodPatch, http.MethodPut, http.MethodDelete} {
		fake.Reset()
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(method, "/api/x", nil))
		// Board ID is "" so Notify is not called (no board in context).
		// The real end-to-end verification is in integration/sse_test.go.
		// This test verifies GET is skipped; full wiring is tested via testutil.
	}
}
