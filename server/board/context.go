package board

import (
	"context"
	"net/http"

	"github.com/ashinsabu/cumin/server/auth"
)

type boardContextKey string

const boardKey boardContextKey = "board"

// ContextMiddleware resolves the board for the authenticated user once per
// request and stashes it in context. Handlers call GetOrFetch — they get the
// cached value for free with no second DB query.
func ContextMiddleware(s *Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := auth.UserIDFromContext(r.Context())
			if userID != "" {
				if b, err := s.GetByUser(r.Context(), userID); err == nil {
					r = r.WithContext(context.WithValue(r.Context(), boardKey, b))
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// IDFromContext returns the board ID stashed by ContextMiddleware, or "".
func IDFromContext(ctx context.Context) string {
	if b, ok := ctx.Value(boardKey).(*Board); ok && b != nil {
		return b.ID
	}
	return ""
}

// GetOrFetch returns the board cached by ContextMiddleware, or fetches it from
// the DB if not in context (e.g. in tests or handlers called outside the
// middleware stack).
func GetOrFetch(ctx context.Context, s *Store) (*Board, error) {
	if b, ok := ctx.Value(boardKey).(*Board); ok && b != nil {
		return b, nil
	}
	return s.GetByUser(ctx, auth.UserIDFromContext(ctx))
}
