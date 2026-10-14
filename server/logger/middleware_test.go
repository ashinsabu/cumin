package logger_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ashinsabu/cumin/server/logger"
)

// flushSpy wraps a ResponseWriter and records whether Flush was called.
type flushSpy struct {
	http.ResponseWriter
	flushed bool
}

func (f *flushSpy) Flush() {
	f.flushed = true
}

func TestRequestLogger_ResponseWriterExposesHTTPFlusher(t *testing.T) {
	// The responseWriter wrapper inside RequestLogger must implement http.Flusher.
	// Without it, SSE handler's w.(http.Flusher) assertion returns ok=false → 500.
	var flusherSeen bool
	handler := logger.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := w.(http.Flusher); ok {
			flusherSeen = true
		}
	}))

	spy := &flushSpy{ResponseWriter: httptest.NewRecorder()}
	handler.ServeHTTP(spy, httptest.NewRequest(http.MethodGet, "/api/events", nil))

	if !flusherSeen {
		t.Error("http.Flusher must be available on the wrapped ResponseWriter (SSE requires it)")
	}
}

func TestRequestLogger_FlushForwardsToUnderlying(t *testing.T) {
	// Flush() on the wrapped writer must reach the real writer so bytes are sent immediately.
	handler := logger.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}))

	spy := &flushSpy{ResponseWriter: httptest.NewRecorder()}
	handler.ServeHTTP(spy, httptest.NewRequest(http.MethodGet, "/api/events", nil))

	if !spy.flushed {
		t.Error("Flush() must be forwarded to the underlying ResponseWriter")
	}
}
