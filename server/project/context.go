package project

import (
	"context"
	"net/http"

	"github.com/ashinsabu/cumin/server/auth"
)

type projectContextKey string

const projectKey projectContextKey = "project"

// ContextMiddleware resolves the user's default project once per request and stashes it in context.
func ContextMiddleware(s *Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := auth.UserIDFromContext(r.Context())
			if userID != "" {
				if p, err := s.GetDefaultForUser(r.Context(), userID); err == nil {
					r = r.WithContext(context.WithValue(r.Context(), projectKey, p))
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

// UserIDFromContext returns the user ID from the stashed project, or "".
func UserIDFromContext(ctx context.Context) string {
	if p, ok := ctx.Value(projectKey).(*Project); ok && p != nil {
		return p.UserID
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
