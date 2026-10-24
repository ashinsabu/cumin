package auth

import (
	"net/http"
	"time"

	"github.com/alexedwards/scs/pgxstore"
	"github.com/alexedwards/scs/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// sessionTouchGap is the max lag between real activity and the stored idle deadline.
	// scs only extends a session when it is modified, so the middleware writes a timestamp
	// at most this often per active session.
	sessionTouchGap = time.Hour
	sessionUserKey  = "user_id"
	sessionTouchKey = "touched_at"
)

// NewSessionManager builds the server-side session manager for web clients.
// The cookie is host-only (no Domain) so it is never sent to sibling subdomains.
// idle slides with activity; lifetime is the hard cap from login.
func NewSessionManager(pool *pgxpool.Pool, secureCookie bool, idle, lifetime time.Duration) *scs.SessionManager {
	sm := scs.New()
	sm.Store = pgxstore.New(pool)
	configureSessions(sm, secureCookie, idle, lifetime)
	return sm
}

func configureSessions(sm *scs.SessionManager, secureCookie bool, idle, lifetime time.Duration) {
	sm.IdleTimeout = idle
	sm.Lifetime = lifetime
	sm.Cookie.Name = "session"
	sm.Cookie.HttpOnly = true
	sm.Cookie.Secure = secureCookie
	sm.Cookie.SameSite = http.SameSiteLaxMode
	sm.Cookie.Path = "/"
}
