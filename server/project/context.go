package project

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/ashinsabu/cumin/server/auth"
	"github.com/jackc/pgx/v5"
)

type projectContextKey string

const projectKey projectContextKey = "project"

// ContextMiddleware resolves the user's default project once per request and stashes it in context.
// A pgx.ErrNoRows (user has no projects) is silently ignored — handlers decide how to respond.
// Any other DB error is logged; the request continues without the project context set.
func ContextMiddleware(s *Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := auth.UserIDFromContext(r.Context())
			if userID != "" {
				p, err := s.GetDefaultForUser(r.Context(), userID)
				if err == nil {
					r = r.WithContext(context.WithValue(r.Context(), projectKey, p))
				} else if !errors.Is(err, pgx.ErrNoRows) {
					slog.ErrorContext(r.Context(), "project context middleware: db error", "user_id", userID, "err", err)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// IDFromContext returns the project ID stashed by ContextMiddleware, or "".
func IDFromContext(ctx context.Context) string {
	if p, ok := ctx.Value(projectKey).(*Project); ok && p != nil {
		return p.ID
	}
	return ""
}

// GetOrFetch returns the project cached by ContextMiddleware, or fetches from DB.
func GetOrFetch(ctx context.Context, s *Store) (*Project, error) {
	if p, ok := ctx.Value(projectKey).(*Project); ok && p != nil {
		return p, nil
	}
	return s.GetDefaultForUser(ctx, auth.UserIDFromContext(ctx))
}
