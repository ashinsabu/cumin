package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func wantStatus(t *testing.T, got, want int, body map[string]any) {
	t.Helper()
	if got != want {
		t.Fatalf("status = %d, want %d (body %v)", got, want, body)
	}
}

// The whole story a new user lives through, end to end, plus the properties that make it safe.
func TestPassword_SignupVerifyLoginLogout(t *testing.T) {
	e := newAuthEnv(t)
	email := uniqueEmail(t, e.pool)
	c := e.newClient(t)

	// Signup with a mixed-case address: stored lowercased, link points at the frontend.
	status, body := c.post("/api/auth/password/signup", map[string]string{"email": strings.ToUpper(email), "password": goodPassword, "name": "  Tester  "})
	wantStatus(t, status, http.StatusAccepted, body)
	mails := e.mail.all()
	if len(mails) != 1 || mails[0].To != email {
		t.Fatalf("mails = %+v, want exactly one to %s", mails, email)
	}
	if !strings.Contains(mails[0].Body, testFrontendURL+"/verify-email?token=") {
		t.Errorf("verify link missing frontend URL: %q", mails[0].Body)
	}

	// Correct password but unverified: 403, and no session is created.
	status, body = c.login(email, goodPassword)
	wantStatus(t, status, http.StatusForbidden, body)
	if body["error"] != "email_not_verified" || c.refreshCookie() != "" || c.access != "" {
		t.Errorf("unverified login: body=%v, want email_not_verified and no tokens issued", body)
	}
	if status, _ = c.get("/api/auth/me"); status != http.StatusUnauthorized {
		t.Errorf("/me before login = %d, want 401", status)
	}

	status, body = c.post("/api/auth/email/verify", map[string]string{"token": tokenFrom(t, mails[0]), "password": goodPassword})
	wantStatus(t, status, http.StatusOK, body)

	// Login (email typed in different case) returns an access token and the user, never credential
	// fields; the refresh token travels only in the cookie.
	status, body = c.login("  "+strings.ToUpper(email)+" ", goodPassword)
	wantStatus(t, status, http.StatusOK, body)
	user, _ := body["user"].(map[string]any)
	if user["email"] != email || user["display_name"] != "Tester" {
		t.Errorf("user = %v, want email %s and trimmed name", user, email)
	}
	for _, leaked := range []string{"password_hash", "PasswordHash", "google_id"} {
		if _, ok := user[leaked]; ok {
			t.Errorf("response leaks %q", leaked)
		}
	}
	if _, ok := body["refresh_token"]; ok {
		t.Error("browser login must not expose the refresh token in the body")
	}
	if c.access == "" || c.refreshCookie() == "" || e.activeRefreshTokens(t, email) != 1 {
		t.Fatalf("expected an access token, a refresh cookie and one stored login (access=%q)", c.access)
	}
	if got := e.provisioned.Load(); got != 1 {
		t.Errorf("provisioned %d times after first login, want 1", got)
	}

	status, body = c.get("/api/auth/me")
	wantStatus(t, status, http.StatusOK, body)
	if body["email"] != email {
		t.Errorf("/me email = %v", body["email"])
	}

	// A second login (new browser) must not provision again.
	other := e.newClient(t)
	status, body = other.login(email, goodPassword)
	wantStatus(t, status, http.StatusOK, body)
	if got := e.provisioned.Load(); got != 1 {
		t.Errorf("provisioned %d times after second login, want still 1", got)
	}

	// Logout revokes that login: its refresh token is dead even if replayed.
	oldCookie := c.refreshCookie()
	status, body = c.post("/api/auth/logout", nil)
	wantStatus(t, status, http.StatusOK, body)
	if c.refreshCookie() != "" {
		t.Error("refresh cookie not cleared on logout")
	}
	replay := e.newClient(t)
	replay.http.Jar.SetCookies(mustURL(c.base+"/api/auth/refresh"), []*http.Cookie{{Name: refreshCookieName, Value: oldCookie, Path: "/api/auth"}})
	if status, _ = replay.refresh(); status != http.StatusUnauthorized {
		t.Errorf("replayed refresh token after logout = %d, want 401", status)
	}
	if status, _ = other.refresh(); status != http.StatusOK {
		t.Errorf("logging out one browser ended the other's login (%d)", status)
	}
}

func TestPassword_SignupValidation(t *testing.T) {
	e := newAuthEnv(t)
	valid := uniqueEmail(t, e.pool)

	cases := []struct {
		name string
		body any
	}{
		{"empty email", map[string]string{"email": "", "password": goodPassword}},
		{"not an email", map[string]string{"email": "nope", "password": goodPassword}},
		{"domain without dot", map[string]string{"email": "a@localhost", "password": goodPassword}},
		{"display-name form", map[string]string{"email": "Eve <" + valid + ">", "password": goodPassword}},
		{"too long email", map[string]string{"email": strings.Repeat("a", 250) + "@b.co", "password": goodPassword}},
		{"short password", map[string]string{"email": valid, "password": "short"}},
		{"nine char password", map[string]string{"email": valid, "password": "123456789"}},
		{"129 char password", map[string]string{"email": valid, "password": strings.Repeat("x", 129)}},
		{"malformed json", `{"email":`},
		{"empty body", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, body := e.newClient(t).post("/api/auth/password/signup", tc.body)
			wantStatus(t, status, http.StatusBadRequest, body)
		})
	}
	if n := len(e.mail.all()); n != 0 {
		t.Errorf("%d mails sent for rejected signups, want 0", n)
	}

	t.Run("boundary lengths accepted", func(t *testing.T) {
		// 10 multi-byte runes is 10 characters, not 30 bytes; 128 is the maximum.
		for _, pw := range []string{strings.Repeat("é", 10), strings.Repeat("x", 128)} {
			email := uniqueEmail(t, e.pool)
			status, body := e.newClient(t).post("/api/auth/password/signup", map[string]string{"email": email, "password": pw})
			wantStatus(t, status, http.StatusAccepted, body)
		}
	})
}

// Signup must not reveal whether an address is registered, and must not touch a verified account.
func TestPassword_SignupOverVerifiedAccountIsSilentNoOp(t *testing.T) {
	e := newAuthEnv(t)
	email := e.signupAndVerify(t, goodPassword)
	before := len(e.mail.all())

	status, body := e.newClient(t).post("/api/auth/password/signup", map[string]string{"email": email, "password": "attacker-chosen-pw", "name": "Mallory"})
	wantStatus(t, status, http.StatusAccepted, body)
	if body["status"] != "check_email" {
		t.Errorf("body = %v, want the same check_email response as a fresh signup", body)
	}
	if after := len(e.mail.all()); after != before {
		t.Errorf("signup over a verified account sent %d extra mails, want 0", after-before)
	}
	if status, _ := e.newClient(t).login(email, goodPassword); status != http.StatusOK {
		t.Errorf("original password stopped working (%d)", status)
	}
	if status, _ := e.newClient(t).login(email, "attacker-chosen-pw"); status != http.StatusUnauthorized {
		t.Errorf("attacker password accepted (%d)", status)
	}
}

// Regression (pre-registration hijack): an attacker registers the victim's address with a password of
// their choosing; if the victim clicks the emailed link, the account must NOT become verified for
// the attacker's password. Verification therefore requires the signup password, and a wrong one must
// not burn the link.
func TestPassword_VerifyRequiresSignupPassword(t *testing.T) {
	e := newAuthEnv(t)
	email := uniqueEmail(t, e.pool)
	attacker := e.newClient(t)
	attacker.post("/api/auth/password/signup", map[string]string{"email": email, "password": "attacker-password"})
	mail, _ := e.mail.last(email)
	token := tokenFrom(t, mail)

	victim := e.newClient(t)
	for _, wrong := range []string{"", goodPassword} {
		if status, _ := victim.post("/api/auth/email/verify", map[string]string{"token": token, "password": wrong}); status != http.StatusUnauthorized {
			t.Fatalf("verify with password %q = %d, want 401", wrong, status)
		}
	}
	if status, _ := e.newClient(t).login(email, "attacker-password"); status != http.StatusForbidden {
		t.Errorf("attacker login after victim's click = %d, want 403 (still unverified)", status)
	}
	// The link survived the failed attempts; the person who knows the password can still use it.
	if status, body := attacker.post("/api/auth/email/verify", map[string]string{"token": token, "password": "attacker-password"}); status != http.StatusOK {
		t.Errorf("verify with the right password = %d %v, want 200 (wrong attempts must not burn the link)", status, body)
	}
}

// Whoever signs up last for an unverified address wins: a squatter cannot keep the real owner out
// or keep a working password.
func TestPassword_SignupOverUnverifiedReplacesCredentials(t *testing.T) {
	e := newAuthEnv(t)
	email := uniqueEmail(t, e.pool)
	squatter := e.newClient(t)
	squatter.post("/api/auth/password/signup", map[string]string{"email": email, "password": "squatter-password"})
	oldMail, _ := e.mail.last(email)

	owner := e.newClient(t)
	status, body := owner.post("/api/auth/password/signup", map[string]string{"email": email, "password": goodPassword, "name": "Owner"})
	wantStatus(t, status, http.StatusAccepted, body)
	newMail, _ := e.mail.last(email)
	if oldMail.Body == newMail.Body {
		t.Fatal("second signup did not issue a fresh verification link")
	}

	// The squatter's link is dead; the owner's works.
	if status, _ := owner.post("/api/auth/email/verify", map[string]string{"token": tokenFrom(t, oldMail), "password": goodPassword}); status != http.StatusBadRequest {
		t.Errorf("old verification link = %d, want 400", status)
	}
	if status, body := owner.post("/api/auth/email/verify", map[string]string{"token": tokenFrom(t, newMail), "password": goodPassword}); status != http.StatusOK {
		t.Fatalf("new verification link = %d %v", status, body)
	}
	if status, _ := e.newClient(t).login(email, "squatter-password"); status != http.StatusUnauthorized {
		t.Errorf("squatter password still works (%d)", status)
	}
	status, body = e.newClient(t).login(email, goodPassword)
	wantStatus(t, status, http.StatusOK, body)
	if user, _ := body["user"].(map[string]any); user["display_name"] != "Owner" {
		t.Errorf("display_name = %v, want Owner", user["display_name"])
	}
}

func TestPassword_LoginFailures(t *testing.T) {
	e := newAuthEnv(t)
	email := e.signupAndVerify(t, goodPassword)
	ghost := uniqueEmail(t, e.pool) // never registered

	t.Run("wrong password and unknown email are indistinguishable", func(t *testing.T) {
		s1, b1 := e.newClient(t).login(email, "wrong-password-1")
		s2, b2 := e.newClient(t).login(ghost, "wrong-password-1")
		wantStatus(t, s1, http.StatusUnauthorized, b1)
		wantStatus(t, s2, http.StatusUnauthorized, b2)
		if b1["error"] != b2["error"] {
			t.Errorf("error differs: %q vs %q", b1["error"], b2["error"])
		}
	})
	t.Run("missing fields", func(t *testing.T) {
		for _, body := range []map[string]string{{"email": "", "password": "x"}, {"email": email, "password": ""}, {}} {
			status, resp := e.newClient(t).post("/api/auth/password/login", body)
			wantStatus(t, status, http.StatusBadRequest, resp)
		}
	})
	t.Run("malformed json", func(t *testing.T) {
		status, resp := e.newClient(t).post("/api/auth/password/login", "{")
		wantStatus(t, status, http.StatusBadRequest, resp)
	})
	t.Run("unverified account with wrong password does not disclose its state", func(t *testing.T) {
		unverified := uniqueEmail(t, e.pool)
		e.newClient(t).post("/api/auth/password/signup", map[string]string{"email": unverified, "password": goodPassword})
		status, resp := e.newClient(t).login(unverified, "not-the-password")
		wantStatus(t, status, http.StatusUnauthorized, resp)
	})
	t.Run("google-only account has no password to log in with", func(t *testing.T) {
		googleEmail := uniqueEmail(t, e.pool)
		if _, err := e.repo.UpsertGoogleUser(context.Background(), "g-"+googleEmail, googleEmail, "G", ""); err != nil {
			t.Fatal(err)
		}
		status, resp := e.newClient(t).login(googleEmail, goodPassword)
		wantStatus(t, status, http.StatusUnauthorized, resp)
	})
}

func TestPassword_VerifyTokenRules(t *testing.T) {
	e := newAuthEnv(t)
	signup := func() (string, string) {
		email := uniqueEmail(t, e.pool)
		e.newClient(t).post("/api/auth/password/signup", map[string]string{"email": email, "password": goodPassword})
		m, _ := e.mail.last(email)
		return email, tokenFrom(t, m)
	}
	verify := func(token string) int {
		status, _ := e.newClient(t).post("/api/auth/email/verify", map[string]string{"token": token, "password": goodPassword})
		return status
	}

	t.Run("single use", func(t *testing.T) {
		_, token := signup()
		if got := verify(token); got != http.StatusOK {
			t.Fatalf("first use = %d", got)
		}
		if got := verify(token); got != http.StatusBadRequest {
			t.Errorf("second use = %d, want 400", got)
		}
	})
	t.Run("expired", func(t *testing.T) {
		_, token := signup()
		if _, err := e.pool.Exec(context.Background(),
			`UPDATE auth_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE token_hash = $1`, hashToken(token)); err != nil {
			t.Fatal(err)
		}
		if got := verify(token); got != http.StatusBadRequest {
			t.Errorf("expired token = %d, want 400", got)
		}
	})
	t.Run("garbage and empty", func(t *testing.T) {
		for _, token := range []string{"", "not-a-token", strings.Repeat("A", 500)} {
			if got := verify(token); got != http.StatusBadRequest {
				t.Errorf("token %.10q = %d, want 400", token, got)
			}
		}
	})
	t.Run("a reset token cannot verify an email", func(t *testing.T) {
		email := e.signupAndVerify(t, goodPassword)
		e.newClient(t).post("/api/auth/password/forgot", map[string]string{"email": email})
		m, _ := e.mail.last(email)
		if got := verify(tokenFrom(t, m)); got != http.StatusBadRequest {
			t.Errorf("reset token used as verify token = %d, want 400", got)
		}
	})
	t.Run("concurrent use succeeds exactly once", func(t *testing.T) {
		_, token := signup()
		const n = 8
		results := make(chan int, n)
		for i := 0; i < n; i++ {
			go func() { results <- verify(token) }()
		}
		ok := 0
		for i := 0; i < n; i++ {
			if <-results == http.StatusOK {
				ok++
			}
		}
		if ok != 1 {
			t.Errorf("%d concurrent requests succeeded, want exactly 1", ok)
		}
	})
}

func TestPassword_ResendVerification(t *testing.T) {
	e := newAuthEnv(t)
	resend := func(email string) (int, map[string]any) {
		return e.newClient(t).post("/api/auth/email/resend", map[string]string{"email": email})
	}

	t.Run("unverified account gets a new link and the old one dies", func(t *testing.T) {
		email := uniqueEmail(t, e.pool)
		e.newClient(t).post("/api/auth/password/signup", map[string]string{"email": email, "password": goodPassword})
		first, _ := e.mail.last(email)

		status, body := resend(email)
		wantStatus(t, status, http.StatusAccepted, body)
		second, _ := e.mail.last(email)
		if first.Body == second.Body {
			t.Fatal("no new link issued")
		}
		if got, _ := e.newClient(t).post("/api/auth/email/verify", map[string]string{"token": tokenFrom(t, first), "password": goodPassword}); got != http.StatusBadRequest {
			t.Errorf("superseded link = %d, want 400", got)
		}
		if got, _ := e.newClient(t).post("/api/auth/email/verify", map[string]string{"token": tokenFrom(t, second), "password": goodPassword}); got != http.StatusOK {
			t.Errorf("new link = %d, want 200", got)
		}
	})
	t.Run("verified, unknown and google-only accounts get the same answer and no mail", func(t *testing.T) {
		verified := e.signupAndVerify(t, goodPassword)
		unknown := uniqueEmail(t, e.pool)
		googleOnly := uniqueEmail(t, e.pool)
		if _, err := e.repo.UpsertGoogleUser(context.Background(), "g-"+googleOnly, googleOnly, "G", ""); err != nil {
			t.Fatal(err)
		}
		before := len(e.mail.all())
		for _, email := range []string{verified, unknown, googleOnly} {
			status, body := resend(email)
			wantStatus(t, status, http.StatusAccepted, body)
			if body["status"] != "check_email" {
				t.Errorf("%s: body = %v", email, body)
			}
		}
		if after := len(e.mail.all()); after != before {
			t.Errorf("%d mails sent, want 0", after-before)
		}
	})
	t.Run("empty email", func(t *testing.T) {
		status, body := resend("")
		wantStatus(t, status, http.StatusBadRequest, body)
	})
}

func TestPassword_ForgotAndReset(t *testing.T) {
	e := newAuthEnv(t)
	email := e.signupAndVerify(t, goodPassword)
	const newPassword = "brand-new-password"

	// Two browsers logged in as the user, one as somebody else.
	laptop, phone := e.newClient(t), e.newClient(t)
	laptop.login(email, goodPassword)
	phone.login(email, goodPassword)
	bystanderEmail := e.signupAndVerify(t, goodPassword)
	bystander := e.newClient(t)
	bystander.login(bystanderEmail, goodPassword)

	t.Run("unknown address gets the same answer and no mail", func(t *testing.T) {
		before := len(e.mail.all())
		status, body := e.newClient(t).post("/api/auth/password/forgot", map[string]string{"email": uniqueEmail(t, e.pool)})
		wantStatus(t, status, http.StatusAccepted, body)
		if len(e.mail.all()) != before {
			t.Error("mail sent for unknown address")
		}
	})
	t.Run("empty email", func(t *testing.T) {
		status, body := e.newClient(t).post("/api/auth/password/forgot", map[string]string{"email": " "})
		wantStatus(t, status, http.StatusBadRequest, body)
	})

	status, body := e.newClient(t).post("/api/auth/password/forgot", map[string]string{"email": email})
	wantStatus(t, status, http.StatusAccepted, body)
	mail, ok := e.mail.last(email)
	if !ok || !strings.Contains(mail.Body, testFrontendURL+"/reset-password?token=") {
		t.Fatalf("reset mail = %+v", mail)
	}
	token := tokenFrom(t, mail)

	// A rejected new password must not burn the single-use link.
	status, body = e.newClient(t).post("/api/auth/password/reset", map[string]string{"token": token, "password": "short"})
	wantStatus(t, status, http.StatusBadRequest, body)

	status, body = e.newClient(t).post("/api/auth/password/reset", map[string]string{"token": token, "password": newPassword})
	wantStatus(t, status, http.StatusOK, body)

	if status, _ := e.newClient(t).login(email, goodPassword); status != http.StatusUnauthorized {
		t.Errorf("old password still works (%d)", status)
	}
	if status, body := e.newClient(t).login(email, newPassword); status != http.StatusOK {
		t.Errorf("new password rejected (%d %v)", status, body)
	}

	// Every existing login of that user can no longer renew; unrelated users are untouched.
	// (Access tokens already issued stay valid until they expire, at most AccessTokenTTL.)
	for name, c := range map[string]*client{"laptop": laptop, "phone": phone} {
		if status, _ := c.refresh(); status != http.StatusUnauthorized {
			t.Errorf("%s login survived the reset (%d)", name, status)
		}
	}
	if status, _ := bystander.refresh(); status != http.StatusOK {
		t.Errorf("reset for one user ended another user's login (%d)", status)
	}

	if status, _ := e.newClient(t).post("/api/auth/password/reset", map[string]string{"token": token, "password": "another-password"}); status != http.StatusBadRequest {
		t.Errorf("reusing the reset link = %d, want 400", status)
	}
}

// Possessing the reset link proves control of the mailbox, so it also unlocks an unverified account.
func TestPassword_ResetVerifiesEmail(t *testing.T) {
	e := newAuthEnv(t)
	email := uniqueEmail(t, e.pool)
	e.newClient(t).post("/api/auth/password/signup", map[string]string{"email": email, "password": "initial-password"})
	e.newClient(t).post("/api/auth/password/forgot", map[string]string{"email": email})
	m, _ := e.mail.last(email)

	status, body := e.newClient(t).post("/api/auth/password/reset", map[string]string{"token": tokenFrom(t, m), "password": goodPassword})
	wantStatus(t, status, http.StatusOK, body)
	status, body = e.newClient(t).login(email, goodPassword)
	wantStatus(t, status, http.StatusOK, body)
}

func TestPassword_ResetWithBadToken(t *testing.T) {
	e := newAuthEnv(t)
	for _, token := range []string{"", "bogus"} {
		status, body := e.newClient(t).post("/api/auth/password/reset", map[string]string{"token": token, "password": goodPassword})
		wantStatus(t, status, http.StatusBadRequest, body)
	}
}

// A mail provider outage must not change what the caller sees (it would leak which addresses exist).
func TestPassword_MailFailureIsInvisibleToCaller(t *testing.T) {
	e := newAuthEnv(t)
	e.mail.err = errors.New("provider down")
	email := uniqueEmail(t, e.pool)

	status, body := e.newClient(t).post("/api/auth/password/signup", map[string]string{"email": email, "password": goodPassword})
	wantStatus(t, status, http.StatusAccepted, body)
	if _, err := e.repo.GetUserByEmail(context.Background(), email); err != nil {
		t.Errorf("account not created when mail failed: %v", err)
	}
	status, body = e.newClient(t).post("/api/auth/password/forgot", map[string]string{"email": email})
	wantStatus(t, status, http.StatusAccepted, body)
}

func TestPassword_RateLimits(t *testing.T) {
	e := newAuthEnv(t)

	t.Run("login is limited per email, not globally", func(t *testing.T) {
		email := e.signupAndVerify(t, goodPassword)
		c := e.newClient(t)
		for i := 1; i <= 10; i++ {
			if status, _ := c.login(email, "wrong-password-x"); status != http.StatusUnauthorized {
				t.Fatalf("attempt %d = %d, want 401", i, status)
			}
		}
		if status, _ := c.login(email, goodPassword); status != http.StatusTooManyRequests {
			t.Errorf("11th attempt = %d, want 429 even with the right password", status)
		}
		other := e.signupAndVerify(t, goodPassword)
		if status, _ := e.newClient(t).login(other, goodPassword); status != http.StatusOK {
			t.Errorf("another account was throttled too (%d)", status)
		}
	})
	t.Run("signup", func(t *testing.T) {
		email := uniqueEmail(t, e.pool)
		for i := 1; i <= 5; i++ {
			if status, _ := e.newClient(t).post("/api/auth/password/signup", map[string]string{"email": email, "password": goodPassword}); status != http.StatusAccepted {
				t.Fatalf("signup %d = %d", i, status)
			}
		}
		if status, _ := e.newClient(t).post("/api/auth/password/signup", map[string]string{"email": email, "password": goodPassword}); status != http.StatusTooManyRequests {
			t.Errorf("6th signup = %d, want 429", status)
		}
	})
	t.Run("forgot", func(t *testing.T) {
		email := e.signupAndVerify(t, goodPassword)
		for i := 1; i <= 3; i++ {
			if status, _ := e.newClient(t).post("/api/auth/password/forgot", map[string]string{"email": email}); status != http.StatusAccepted {
				t.Fatalf("forgot %d = %d", i, status)
			}
		}
		if status, _ := e.newClient(t).post("/api/auth/password/forgot", map[string]string{"email": email}); status != http.StatusTooManyRequests {
			t.Errorf("4th forgot = %d, want 429", status)
		}
	})
	t.Run("resend", func(t *testing.T) {
		email := uniqueEmail(t, e.pool)
		e.newClient(t).post("/api/auth/password/signup", map[string]string{"email": email, "password": goodPassword})
		for i := 1; i <= 3; i++ {
			if status, _ := e.newClient(t).post("/api/auth/email/resend", map[string]string{"email": email}); status != http.StatusAccepted {
				t.Fatalf("resend %d = %d", i, status)
			}
		}
		if status, _ := e.newClient(t).post("/api/auth/email/resend", map[string]string{"email": email}); status != http.StatusTooManyRequests {
			t.Errorf("4th resend = %d, want 429", status)
		}
	})
}

// With no mailer configured the feature must be fully off: no routes, so nothing to probe.
func TestPassword_DisabledWithoutMailer(t *testing.T) {
	h := &Handler{}
	if h.PasswordEnabled() {
		t.Error("PasswordEnabled() = true without a mailer")
	}
	r := chi.NewRouter()
	h.PasswordRoutes(r)
	for _, path := range []string{"/api/auth/password/signup", "/api/auth/password/login", "/api/auth/email/verify"} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s = %d, want 404 when disabled", path, rec.Code)
		}
	}
}

// Regression: a name whose third byte fell inside a multi-byte character produced an invalid
// id_prefix, so the INSERT failed with a 500 for new addresses only (revealing which exist).
func TestPassword_SignupWithMultiByteName(t *testing.T) {
	e := newAuthEnv(t)
	email := uniqueEmail(t, e.pool)
	status, body := e.newClient(t).post("/api/auth/password/signup", map[string]string{"email": email, "password": goodPassword, "name": "Aaé"})
	wantStatus(t, status, http.StatusAccepted, body)
	user, err := e.repo.GetUserByEmail(context.Background(), email)
	if err != nil {
		t.Fatal(err)
	}
	if user.IDPrefix != "AAÉ" {
		t.Errorf("id_prefix = %q, want AAÉ", user.IDPrefix)
	}
}

func mustURL(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		panic(err)
	}
	return u
}
