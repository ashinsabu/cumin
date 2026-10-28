package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func middlewareServer(t *testing.T) *httptest.Server {
	t.Helper()
	r := chi.NewRouter()
	r.Use(Middleware(testJWTSecret))
	r.Get("/protected", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(UserIDFromContext(r.Context())))
	})
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv
}

func get(t *testing.T, url string, header map[string]string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	buf := make([]byte, 256)
	n, _ := resp.Body.Read(buf)
	return resp.StatusCode, string(buf[:n])
}

func TestMiddleware_Bearer(t *testing.T) {
	srv := middlewareServer(t)
	valid, _ := IssueToken(testJWTSecret, "user-1", "u@x.co", time.Hour)
	expired, _ := IssueToken(testJWTSecret, "user-1", "u@x.co", -time.Hour)
	wrongSecret, _ := IssueToken("a-completely-different-secret-value", "user-1", "u@x.co", time.Hour)

	t.Run("valid token exposes the user id", func(t *testing.T) {
		status, body := get(t, srv.URL+"/protected", map[string]string{"Authorization": "Bearer " + valid})
		if status != http.StatusOK || body != "user-1" {
			t.Errorf("status=%d body=%q, want 200 user-1", status, body)
		}
	})
	t.Run("no credentials is 401", func(t *testing.T) {
		if status, _ := get(t, srv.URL+"/protected", nil); status != http.StatusUnauthorized {
			t.Errorf("status = %d", status)
		}
	})
	t.Run("bad tokens are 401", func(t *testing.T) {
		for name, tok := range map[string]string{"expired": expired, "wrong secret": wrongSecret, "garbage": "abc.def.ghi"} {
			if status, _ := get(t, srv.URL+"/protected", map[string]string{"Authorization": "Bearer " + tok}); status != http.StatusUnauthorized {
				t.Errorf("%s: status = %d, want 401", name, status)
			}
		}
	})
	t.Run("non-Bearer schemes are ignored", func(t *testing.T) {
		if status, _ := get(t, srv.URL+"/protected", map[string]string{"Authorization": "Basic " + valid}); status != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", status)
		}
	})
	t.Run("cookies never authenticate an API call", func(t *testing.T) {
		// The refresh cookie only works on /api/auth/refresh; presenting it (or a token in a cookie)
		// to a data endpoint must not log anyone in, otherwise CSRF protection would be needed everywhere.
		for _, name := range []string{"refresh", "token", "session"} {
			if status, _ := get(t, srv.URL+"/protected", map[string]string{"Cookie": name + "=" + valid}); status != http.StatusUnauthorized {
				t.Errorf("cookie %q: status = %d, want 401", name, status)
			}
		}
	})
	t.Run("a refresh token is not an access token", func(t *testing.T) {
		raw, _ := randomToken()
		if status, _ := get(t, srv.URL+"/protected", map[string]string{"Authorization": "Bearer " + raw}); status != http.StatusUnauthorized {
			t.Errorf("status = %d, want 401", status)
		}
	})
}

func TestUserIDFromContext_Empty(t *testing.T) {
	if got := UserIDFromContext(httptest.NewRequest(http.MethodGet, "/", nil).Context()); got != "" {
		t.Errorf("got %q, want empty for an unauthenticated context", got)
	}
}
