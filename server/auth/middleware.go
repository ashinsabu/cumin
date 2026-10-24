package auth

import (
	"context"
	"net/http"
	"time"

	"github.com/alexedwards/scs/v2"
)

type contextKey string

const userIDKey contextKey = "userID"

// Middleware authenticates a request. A Bearer header (mobile) is validated as a JWT and never
// falls back to the session cookie; otherwise the web session must hold a user_id.
// It must run after sm.LoadAndSave.
func Middleware(secret string, sm *scs.SessionManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var userID string
			if tokenStr := bearerToken(r); tokenStr != "" {
				claims, err := ValidateToken(secret, tokenStr)
				if err != nil {
					http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
					return
				}
				userID = claims.UserID
			} else {
				userID = sm.GetString(r.Context(), sessionUserKey)
				if userID == "" {
					http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
					return
				}
				touchSession(r.Context(), sm)
			}
			ctx := context.WithValue(r.Context(), userIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// touchSession slides the idle deadline: writing marks the session modified so scs persists the
// new expiry and re-sends the cookie. Throttled to one write per sessionTouchGap.
func touchSession(ctx context.Context, sm *scs.SessionManager) {
	now := time.Now()
	if now.Unix()-sm.GetInt64(ctx, sessionTouchKey) > int64(sessionTouchGap/time.Second) {
		sm.Put(ctx, sessionTouchKey, now.Unix())
	}
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && h[:7] == "Bearer " {
		return h[7:]
	}
	return ""
}

func DevBypass(testUserID string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), userIDKey, testUserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func UserIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}
