package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
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
