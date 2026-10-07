package hub

import (
	"net/http"

	"github.com/ashinsabu/cumin/server/board"
)

// statusRecorder captures the HTTP status code written by downstream handlers.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

var mutatingMethods = map[string]bool{
	http.MethodPost:   true,
	http.MethodPatch:  true,
	http.MethodPut:    true,
	http.MethodDelete: true,
}

// NotifyMiddleware intercepts successful mutating HTTP responses and calls
// n.Notify(boardID). Board ID is read from context (stashed by
// board.ContextMiddleware) — no extra DB query per request.
//
// Must run after both auth.Middleware and board.ContextMiddleware.
func NotifyMiddleware(n Notifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !mutatingMethods[r.Method] {
				next.ServeHTTP(w, r)
				return
			}
			rw := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rw, r)
			if rw.status < 400 {
				if boardID := board.IDFromContext(r.Context()); boardID != "" {
					n.Notify(boardID)
				}
			}
		})
	}
}
