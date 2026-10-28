package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// loggedIn returns a browser logged in as a fresh verified user.
func loggedIn(t *testing.T, e *authEnv) (*client, string) {
	t.Helper()
	email := e.signupAndVerify(t, goodPassword)
	c := e.newClient(t)
	if status, body := c.login(email, goodPassword); status != http.StatusOK {
		t.Fatalf("login = %d %v", status, body)
	}
	return c, email
}

func TestRefresh_CookieAttributes(t *testing.T) {
	e := newAuthEnv(t)
	e.h.cfg.SecureCookies = true
	email := e.signupAndVerify(t, goodPassword)

	body := strings.NewReader(`{"email":"` + email + `","password":"` + goodPassword + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/password/login", body)
	rec := httptest.NewRecorder()
	e.srv.Config.Handler.ServeHTTP(rec, req)

	var cookie *http.Cookie
	for _, ck := range rec.Result().Cookies() {
		if ck.Name == refreshCookieName {
			cookie = ck
		}
	}
	if cookie == nil {
		t.Fatalf("no refresh cookie in %v", rec.Result().Header)
	}
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/api/auth" || cookie.Domain != "" {
		t.Errorf("cookie = %+v, want HttpOnly, Secure, SameSite=Lax, Path=/api/auth, host-only", cookie)
	}
	if cookie.MaxAge <= 0 || time.Duration(cookie.MaxAge)*time.Second > 8*24*time.Hour {
		t.Errorf("MaxAge = %ds, want the idle window (default 7d)", cookie.MaxAge)
	}
}

// The SPA's boot sequence: no access token in memory, only the cookie.
func TestRefresh_BootRestoresLoginAndRotates(t *testing.T) {
	e := newAuthEnv(t)
	c, email := loggedIn(t, e)
	before := c.refreshCookie()
	c.access = "" // page reload: memory is gone

	status, body := c.refresh()
	wantStatus(t, status, http.StatusOK, body)
	if user, _ := body["user"].(map[string]any); user["email"] != email {
		t.Errorf("refresh user = %v", body["user"])
	}
	if after := c.refreshCookie(); after == "" || after == before {
		t.Errorf("refresh cookie not rotated: before=%q after=%q", before, after)
	}
	if _, leaked := body["refresh_token"]; leaked {
		t.Error("browser refresh must not expose the refresh token in the body")
	}
	if status, body := c.get("/api/auth/me"); status != http.StatusOK || body["email"] != email {
		t.Errorf("/me with the new access token = %d %v", status, body)
	}
	if e.activeRefreshTokens(t, email) != 2 { // rotated token stays (for reuse detection) until it expires
		t.Errorf("stored tokens = %d, want old+new", e.activeRefreshTokens(t, email))
	}
}

func TestRefresh_AccessTokenExpiresIn(t *testing.T) {
	e := newAuthEnv(t)
	c, _ := loggedIn(t, e)
	_, body := c.refresh()
	if got, _ := body["expires_in"].(float64); int(got) != int(AccessTokenTTL.Seconds()) {
		t.Errorf("expires_in = %v, want %v", body["expires_in"], AccessTokenTTL.Seconds())
	}
	claims, err := ValidateToken(testJWTSecret, c.access)
	if err != nil {
		t.Fatal(err)
	}
	if ttl := time.Until(claims.ExpiresAt.Time); ttl > AccessTokenTTL || ttl < AccessTokenTTL-time.Minute {
		t.Errorf("access token lifetime = %v, want ~%v", ttl, AccessTokenTTL)
	}
}

func TestRefresh_RequiresCSRFHeaderAndAllowedOrigin(t *testing.T) {
	e := newAuthEnv(t)
	c, email := loggedIn(t, e)

	t.Run("missing custom header", func(t *testing.T) {
		c.noCSRF = true
		defer func() { c.noCSRF = false }()
		if status, _ := c.refresh(); status != http.StatusForbidden {
			t.Errorf("status = %d, want 403", status)
		}
	})
	t.Run("foreign origin", func(t *testing.T) {
		status, _ := c.do(http.MethodPost, "/api/auth/refresh", nil, map[string]string{"Origin": "https://evil.example"})
		if status != http.StatusForbidden {
			t.Errorf("status = %d, want 403", status)
		}
	})
	t.Run("logout is protected the same way", func(t *testing.T) {
		c.noCSRF = true
		defer func() { c.noCSRF = false }()
		if status, _ := c.post("/api/auth/logout", nil); status != http.StatusForbidden {
			t.Errorf("status = %d, want 403", status)
		}
	})
	t.Run("allowed origin passes", func(t *testing.T) {
		status, _ := c.do(http.MethodPost, "/api/auth/refresh", nil, map[string]string{"Origin": testFrontendURL})
		if status != http.StatusOK {
			t.Errorf("status = %d, want 200", status)
		}
	})
	if e.activeRefreshTokens(t, email) == 0 {
		t.Error("rejected CSRF attempts must not revoke or rotate the login")
	}
}

func TestRefresh_NoOrBadTokenIs401(t *testing.T) {
	e := newAuthEnv(t)

	if status, _ := e.newClient(t).refresh(); status != http.StatusUnauthorized {
		t.Errorf("no cookie = %d, want 401", status)
	}
	c := e.newClient(t)
	c.http.Jar.SetCookies(mustURL(c.base+"/api/auth/refresh"), []*http.Cookie{{Name: refreshCookieName, Value: "forged", Path: "/api/auth"}})
	if status, _ := c.refresh(); status != http.StatusUnauthorized {
		t.Errorf("forged cookie = %d, want 401", status)
	}
	if c.refreshCookie() != "" {
		t.Error("a rejected cookie should be cleared so the SPA stops retrying it")
	}
}

// A copied refresh token used after the legitimate client already rotated it must kill the login
// for both parties.
func TestRefresh_ReuseDetectionEndsTheLogin(t *testing.T) {
	e := newAuthEnv(t)
	victim, email := loggedIn(t, e)
	stolen := victim.refreshCookie()
	if status, _ := victim.refresh(); status != http.StatusOK { // victim rotates normally
		t.Fatalf("victim refresh = %d", status)
	}
	if _, err := e.pool.Exec(t.Context(), `UPDATE refresh_tokens SET rotated_at = NOW() - interval '1 minute' WHERE token_hash = $1`, hashToken(stolen)); err != nil {
		t.Fatal(err)
	}

	thief := e.newClient(t)
	thief.http.Jar.SetCookies(mustURL(thief.base+"/api/auth/refresh"), []*http.Cookie{{Name: refreshCookieName, Value: stolen, Path: "/api/auth"}})
	if status, _ := thief.refresh(); status != http.StatusUnauthorized {
		t.Fatalf("replayed token = %d, want 401", status)
	}
	if status, _ := victim.refresh(); status != http.StatusUnauthorized {
		t.Errorf("victim after theft detected = %d, want 401 (family revoked)", status)
	}
	if n := e.activeRefreshTokens(t, email); n != 0 {
		t.Errorf("active tokens = %d, want 0", n)
	}
}

// Two tabs boot at once with the same cookie. Both must get an access token.
func TestRefresh_ConcurrentTabsWithinGrace(t *testing.T) {
	e := newAuthEnv(t)
	c, _ := loggedIn(t, e)
	cookie := c.refreshCookie()

	var wg sync.WaitGroup
	statuses := make([]int, 4)
	for i := range statuses {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tab := e.newClient(t)
			tab.http.Jar.SetCookies(mustURL(tab.base+"/api/auth/refresh"), []*http.Cookie{{Name: refreshCookieName, Value: cookie, Path: "/api/auth"}})
			statuses[i], _ = tab.refresh()
		}()
	}
	wg.Wait()
	for i, s := range statuses {
		if s != http.StatusOK {
			t.Errorf("tab %d = %d, want 200", i, s)
		}
	}
}

func TestLogout(t *testing.T) {
	e := newAuthEnv(t)

	t.Run("revokes the login but not other devices", func(t *testing.T) {
		laptop, email := loggedIn(t, e)
		phone := e.newClient(t)
		phone.login(email, goodPassword)
		if status, _ := laptop.post("/api/auth/logout", nil); status != http.StatusOK {
			t.Fatalf("logout = %d", status)
		}
		if status, _ := laptop.refresh(); status != http.StatusUnauthorized {
			t.Errorf("laptop refresh after logout = %d", status)
		}
		if status, _ := phone.refresh(); status != http.StatusOK {
			t.Errorf("phone refresh = %d, want 200", status)
		}
	})
	t.Run("is idempotent without a token", func(t *testing.T) {
		if status, _ := e.newClient(t).post("/api/auth/logout", nil); status != http.StatusOK {
			t.Errorf("status = %d, want 200", status)
		}
	})
}

// Native clients have no cookie jar: tokens travel in the body and nothing sets a cookie.
func TestRefresh_NativeBodyMode(t *testing.T) {
	e := newAuthEnv(t)
	c, email := loggedIn(t, e)
	user, _ := e.repo.GetUserByEmail(t.Context(), email)
	resp, err := e.h.startNativeLogin(t.Context(), user)
	if err != nil || resp.RefreshToken == "" || resp.AccessToken == "" {
		t.Fatalf("native login = %+v, %v", resp, err)
	}

	native := e.newClient(t)
	native.noCSRF = true // apps don't send the browser header
	status, body := native.post("/api/auth/refresh", map[string]string{"refresh_token": resp.RefreshToken})
	wantStatus(t, status, http.StatusOK, body)
	next, _ := body["refresh_token"].(string)
	if next == "" || next == resp.RefreshToken || body["access_token"] == "" {
		t.Errorf("body = %v, want rotated refresh_token and an access_token", body)
	}
	if native.refreshCookie() != "" {
		t.Error("native mode must not set a cookie")
	}
	if status, _ := native.post("/api/auth/logout", map[string]string{"refresh_token": next}); status != http.StatusOK {
		t.Errorf("logout = %d", status)
	}
	if status, _ := native.post("/api/auth/refresh", map[string]string{"refresh_token": next}); status != http.StatusUnauthorized {
		t.Errorf("refresh after logout = %d, want 401", status)
	}
	_ = c
}
