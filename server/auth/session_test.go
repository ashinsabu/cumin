package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alexedwards/scs/v2"
	"github.com/alexedwards/scs/v2/memstore"
)

// Regression guard: the configured durations must reach scs, not hardcoded defaults.
func TestConfigureSessions_AppliesPolicy(t *testing.T) {
	sm := scs.New()
	configureSessions(sm, true, 36*time.Hour, 100*time.Hour)

	if sm.IdleTimeout != 36*time.Hour || sm.Lifetime != 100*time.Hour {
		t.Errorf("idle=%v lifetime=%v, want 36h/100h", sm.IdleTimeout, sm.Lifetime)
	}
	c := sm.Cookie
	if c.Name != "session" || !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode || c.Domain != "" {
		t.Errorf("unexpected cookie settings: %+v", c)
	}
}

func TestConfigureSessions_InsecureForHTTPDev(t *testing.T) {
	sm := scs.New()
	configureSessions(sm, false, time.Hour*24, time.Hour*48)
	if sm.Cookie.Secure {
		t.Error("cookie must not be Secure when the frontend is http")
	}
}

// End to end through scs: a login-style write must produce a cookie whose lifetime follows the
// configured idle timeout (the shorter bound), and a request without a write must set no cookie.
func TestSessionCookie_FollowsConfiguredIdleTimeout(t *testing.T) {
	sm := scs.New()
	sm.Store = memstore.New()
	configureSessions(sm, false, 36*time.Hour, 100*time.Hour)

	mux := http.NewServeMux()
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		sm.Put(r.Context(), sessionUserKey, "u1")
	})
	mux.HandleFunc("/noop", func(w http.ResponseWriter, r *http.Request) {})
	h := sm.LoadAndSave(mux)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/login", nil))
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "session" {
		t.Fatalf("cookies = %+v, want one session cookie", cookies)
	}
	// scs rounds the expiry up to whole seconds, so allow a little slack on both sides.
	got := time.Duration(cookies[0].MaxAge) * time.Second
	if got < 36*time.Hour-time.Minute || got > 36*time.Hour+time.Minute {
		t.Errorf("cookie max-age = %v, want ~36h (idle timeout, not the 100h lifetime)", got)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/noop", nil))
	if n := len(rec.Result().Cookies()); n != 0 {
		t.Errorf("unmodified anonymous request set %d cookies, want 0", n)
	}
}
