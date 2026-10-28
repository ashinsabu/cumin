package auth

import (
	"context"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

// fakeTokenInfo stands in for Google's tokeninfo endpoint.
func fakeTokenInfo(t *testing.T, status int, body string) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	old := tokenInfoURL
	tokenInfoURL = srv.URL
	t.Cleanup(func() { tokenInfoURL = old })
}

func TestVerifyGoogleIDToken(t *testing.T) {
	const valid = `{"iss":"https://accounts.google.com","aud":"ios-client","sub":"123","email":"a@b.com","email_verified":"true","name":"A","picture":"p"}`

	cases := []struct {
		name    string
		status  int
		body    string
		wantErr bool
	}{
		{"valid", http.StatusOK, valid, false},
		{"rejected by google", http.StatusBadRequest, `{"error":"invalid_token"}`, true},
		{"other app's token", http.StatusOK, strings.Replace(valid, "ios-client", "someone-else", 1), true},
		{"wrong issuer", http.StatusOK, strings.Replace(valid, "https://accounts.google.com", "evil.com", 1), true},
		{"unverified email", http.StatusOK, strings.Replace(valid, `"email_verified":"true"`, `"email_verified":"false"`, 1), true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fakeTokenInfo(t, c.status, c.body)
			info, err := verifyGoogleIDToken(context.Background(), "tok", []string{"ios-client"})
			if (err != nil) != c.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, c.wantErr)
			}
			if !c.wantErr && (info.Sub != "123" || info.Email != "a@b.com") {
				t.Fatalf("unexpected info: %+v", info)
			}
		})
	}
}

func TestMobileLoginRejectsBeforeTouchingDB(t *testing.T) {
	fakeTokenInfo(t, http.StatusBadRequest, `{"error":"invalid_token"}`)

	cases := []struct {
		name      string
		clientIDs []string
		body      string
		status    int
	}{
		{"not configured", nil, `{"id_token":"x"}`, http.StatusNotFound},
		{"missing token", []string{"ios-client"}, `{}`, http.StatusBadRequest},
		{"bad json", []string{"ios-client"}, `nope`, http.StatusBadRequest},
		{"invalid token", []string{"ios-client"}, `{"id_token":"x"}`, http.StatusUnauthorized},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// repo is nil: any of these reaching the DB would panic.
			h := &Handler{cfg: OAuthConfig{AppClientIDs: c.clientIDs}}
			req := httptest.NewRequest(http.MethodPost, "/api/auth/google/mobile", strings.NewReader(c.body))
			rec := httptest.NewRecorder()
			h.HandleMobileLogin(rec, req)
			if rec.Code != c.status {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, c.status, rec.Body)
			}
		})
	}
}

// Regression: a different Google identity with the same email as an already-linked account must be
// refused, not handed the account.
func TestMobileLoginRefusesAccountLinkedToAnotherIdentity(t *testing.T) {
	pool := testPool(t)
	repo := NewRepo(pool)
	email := uniqueEmail(t, pool)
	if _, err := repo.UpsertGoogleUser(context.Background(), "owner-sub-"+email, email, "Owner", ""); err != nil {
		t.Fatal(err)
	}
	fakeTokenInfo(t, http.StatusOK, `{"iss":"https://accounts.google.com","aud":"ios-client","sub":"stranger-sub-`+email+`","email":"`+email+`","email_verified":"true","name":"Stranger"}`)

	h := &Handler{cfg: OAuthConfig{AppClientIDs: []string{"ios-client"}, JWTSecret: testJWTSecret}, repo: repo}
	rec := httptest.NewRecorder()
	h.HandleMobileLogin(rec, httptest.NewRequest(http.MethodPost, "/api/auth/google/mobile", strings.NewReader(`{"id_token":"x"}`)))
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (body %s)", rec.Code, rec.Body)
	}
	if strings.Contains(rec.Body.String(), "token") && strings.Contains(rec.Body.String(), "eyJ") {
		t.Errorf("response contains a JWT: %s", rec.Body)
	}
}

// The native iOS app is the user's main client and depends on this exact response shape. Changing
// it breaks installed builds, so this test pins it: update the app first, then this test.
func TestMobileLogin_ResponseContract(t *testing.T) {
	e := newAuthEnv(t)
	email := uniqueEmail(t, e.pool)
	fakeTokenInfo(t, http.StatusOK, fmt.Sprintf(
		`{"iss":"https://accounts.google.com","aud":%q,"sub":"sub-%s","email":%q,"email_verified":"true","name":"Ios User","picture":"p"}`,
		testIOSClientID, email, email))

	app := e.newClient(t)
	app.noCSRF = true // native apps send no browser headers
	status, body := app.post("/api/auth/google/mobile", map[string]string{"id_token": "google-id-token"})
	wantStatus(t, status, http.StatusOK, body)

	gotKeys := slices.Sorted(maps.Keys(body))
	if want := []string{"access_token", "expires_in", "refresh_token", "user"}; !slices.Equal(gotKeys, want) {
		t.Errorf("response keys = %v, want %v", gotKeys, want)
	}
	if exp, _ := body["expires_in"].(float64); exp != AccessTokenTTL.Seconds() {
		t.Errorf("expires_in = %v, want %v", body["expires_in"], AccessTokenTTL.Seconds())
	}
	user, _ := body["user"].(map[string]any)
	for _, k := range []string{"id", "email", "display_name", "avatar_url", "id_prefix"} {
		if _, ok := user[k]; !ok {
			t.Errorf("user is missing %q: %v", k, user)
		}
	}
	if app.refreshCookie() != "" {
		t.Error("native login must not set a cookie")
	}

	// The tokens work the way the app uses them: Bearer on data endpoints, body-mode refresh.
	app.keepAccess(body)
	if status, _ := app.get("/api/auth/me"); status != http.StatusOK {
		t.Errorf("/me with the access token = %d, want 200", status)
	}
	status, refreshed := app.post("/api/auth/refresh", map[string]string{"refresh_token": body["refresh_token"].(string)})
	wantStatus(t, status, http.StatusOK, refreshed)
	if refreshed["refresh_token"] == "" || refreshed["access_token"] == "" {
		t.Errorf("refresh response = %v, want rotated tokens", refreshed)
	}
}
