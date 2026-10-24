package auth

import (
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/alexedwards/scs/v2"
	"github.com/alexedwards/scs/v2/memstore"
	"github.com/go-chi/chi/v5"
)

// middlewareEnv serves /protected behind the real Middleware with an in-memory session store, plus
// test-only routes to create sessions. No database involved.
func middlewareEnv(t *testing.T) (*httptest.Server, *scs.SessionManager) {
	t.Helper()
	sm := scs.New()
	sm.Store = memstore.New()
	configureSessions(sm, false, 24*time.Hour, 48*time.Hour)

	r := chi.NewRouter()
	r.Use(sm.LoadAndSave)
	// /seed?user=u1&touched=<unix> logs a browser in with a chosen last-touched time.
	r.Get("/seed", func(w http.ResponseWriter, r *http.Request) {
		sm.Put(r.Context(), sessionUserKey, r.URL.Query().Get("user"))
		touched, _ := strconv.ParseInt(r.URL.Query().Get("touched"), 10, 64)
		sm.Put(r.Context(), sessionTouchKey, touched)
	})
	r.Get("/touched", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(strconv.FormatInt(sm.GetInt64(r.Context(), sessionTouchKey), 10)))
	})
	r.Group(func(r chi.Router) {
		r.Use(Middleware(testJWTSecret, sm))
		r.Get("/protected", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte(UserIDFromContext(r.Context())))
		})
	})
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv, sm
}

func get(t *testing.T, c *http.Client, url string, header map[string]string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	buf := make([]byte, 256)
	n, _ := resp.Body.Read(buf)
	return resp.StatusCode, string(buf[:n])
}

func newJarClient() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{Jar: jar}
}

func TestMiddleware_Session(t *testing.T) {
	srv, _ := middlewareEnv(t)

	t.Run("no cookie is 401", func(t *testing.T) {
		if status, _ := get(t, newJarClient(), srv.URL+"/protected", nil); status != http.StatusUnauthorized {
			t.Errorf("status = %d", status)
		}
	})
	t.Run("garbage cookie is 401", func(t *testing.T) {
		status, _ := get(t, &http.Client{}, srv.URL+"/protected", map[string]string{"Cookie": "session=not-a-real-token"})
		if status != http.StatusUnauthorized {
			t.Errorf("status = %d", status)
		}
	})
	t.Run("valid session exposes the user id", func(t *testing.T) {
		c := newJarClient()
		get(t, c, srv.URL+"/seed?user=u-42&touched="+strconv.FormatInt(time.Now().Unix(), 10), nil)
		status, body := get(t, c, srv.URL+"/protected", nil)
		if status != http.StatusOK || body != "u-42" {
			t.Errorf("status=%d body=%q, want 200 u-42", status, body)
		}
	})
	t.Run("a session without a user (anonymous) is 401", func(t *testing.T) {
		c := newJarClient()
		get(t, c, srv.URL+"/seed?user=&touched=1", nil)
		if status, _ := get(t, c, srv.URL+"/protected", nil); status != http.StatusUnauthorized {
			t.Errorf("status = %d", status)
		}
	})
}

func TestMiddleware_Bearer(t *testing.T) {
	srv, _ := middlewareEnv(t)
	validJWT, _ := IssueToken(testJWTSecret, "mobile-user", "m@x.co", time.Hour)
	expiredJWT, _ := IssueToken(testJWTSecret, "mobile-user", "m@x.co", -time.Hour)
	wrongSecretJWT, _ := IssueToken("a-completely-different-secret-value", "mobile-user", "m@x.co", time.Hour)

	t.Run("valid JWT authenticates without a cookie", func(t *testing.T) {
		status, body := get(t, &http.Client{}, srv.URL+"/protected", map[string]string{"Authorization": "Bearer " + validJWT})
		if status != http.StatusOK || body != "mobile-user" {
			t.Errorf("status=%d body=%q", status, body)
		}
	})
	t.Run("bad JWTs are 401", func(t *testing.T) {
		for name, tok := range map[string]string{"expired": expiredJWT, "wrong secret": wrongSecretJWT, "garbage": "abc.def.ghi"} {
			if status, _ := get(t, &http.Client{}, srv.URL+"/protected", map[string]string{"Authorization": "Bearer " + tok}); status != http.StatusUnauthorized {
				t.Errorf("%s: status = %d, want 401", name, status)
			}
		}
	})
	t.Run("an invalid Bearer never falls back to a valid session cookie", func(t *testing.T) {
		c := newJarClient()
		get(t, c, srv.URL+"/seed?user=web-user&touched="+strconv.FormatInt(time.Now().Unix(), 10), nil)
		if status, _ := get(t, c, srv.URL+"/protected", nil); status != http.StatusOK {
			t.Fatalf("precondition: cookie session should work, got %d", status)
		}
		if status, _ := get(t, c, srv.URL+"/protected", map[string]string{"Authorization": "Bearer " + expiredJWT}); status != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401: bad token must not be rescued by the cookie", status)
		}
	})
	t.Run("a valid Bearer wins over a cookie for another user", func(t *testing.T) {
		c := newJarClient()
		get(t, c, srv.URL+"/seed?user=web-user&touched=1", nil)
		_, body := get(t, c, srv.URL+"/protected", map[string]string{"Authorization": "Bearer " + validJWT})
		if body != "mobile-user" {
			t.Errorf("acted as %q, want the Bearer identity", body)
		}
	})
	t.Run("non-Bearer schemes are ignored", func(t *testing.T) {
		status, _ := get(t, &http.Client{}, srv.URL+"/protected", map[string]string{"Authorization": "Basic " + validJWT})
		if status != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", status)
		}
	})
}

// Sliding expiry: activity pushes the idle deadline out, but only once per sessionTouchGap so
// ordinary traffic doesn't write to the database on every request.
func TestMiddleware_TouchThrottle(t *testing.T) {
	srv, _ := middlewareEnv(t)
	now := time.Now().Unix()

	t.Run("recent touch is left alone", func(t *testing.T) {
		recent := now - int64(sessionTouchGap/time.Second)/2
		c := newJarClient()
		get(t, c, srv.URL+"/seed?user=u&touched="+strconv.FormatInt(recent, 10), nil)
		get(t, c, srv.URL+"/protected", nil)
		_, got := get(t, c, srv.URL+"/touched", nil)
		if got != strconv.FormatInt(recent, 10) {
			t.Errorf("touched_at = %s, want unchanged %d", got, recent)
		}
	})
	t.Run("stale touch is refreshed", func(t *testing.T) {
		stale := now - int64(sessionTouchGap/time.Second) - 60
		c := newJarClient()
		get(t, c, srv.URL+"/seed?user=u&touched="+strconv.FormatInt(stale, 10), nil)
		get(t, c, srv.URL+"/protected", nil)
		_, got := get(t, c, srv.URL+"/touched", nil)
		gotInt, _ := strconv.ParseInt(got, 10, 64)
		if gotInt < now {
			t.Errorf("touched_at = %d, want >= %d after activity past the throttle", gotInt, now)
		}
	})
}

func TestUserIDFromContext_Empty(t *testing.T) {
	if got := UserIDFromContext(httptest.NewRequest(http.MethodGet, "/", nil).Context()); got != "" {
		t.Errorf("got %q, want empty for an unauthenticated context", got)
	}
}
