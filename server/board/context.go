package board

import (
	"context"
	"net/http"

	"github.com/ashinsabu/cumin/server/auth"
)

type boardContextKey string

const boardIDKey boardContextKey = "boardID"

// ContextMiddleware resolves the board for the authenticated user once per
// request and stashes the board ID in context. Runs after auth middleware.
// Downstream code (hub notify middleware, handlers) reads via IDFromContext
// at zero cost — no second DB query.
func ContextMiddleware(s *Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := auth.UserIDFromContext(r.Context())
			if userID != "" {
				if b, err := s.GetByUser(r.Context(), userID); err == nil {
					r = r.WithContext(context.WithValue(r.Context(), boardIDKey, b.ID))
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// IDFromContext returns the board ID stashed by ContextMiddleware, or "".
func IDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(boardIDKey).(string)
	return v
}
