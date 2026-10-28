package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ashinsabu/cumin/server/db"
)

const (
	defaultTestDBURL = "postgres://cumin:cumin@localhost:5432/cumin?sslmode=disable"
	testJWTSecret    = "0123456789abcdef0123456789abcdef" // gitleaks:allow (dummy key for tests)
	testFrontendURL  = "http://app.test"
	goodPassword     = "correct-horse-battery"
	testIOSClientID  = "ios-client"
)

var migrateOnce sync.Once

// testPool connects to the integration database. CI sets TEST_DATABASE_URL, so an unreachable DB
// there is a hard failure; locally (no env var) the DB-backed tests skip instead of failing.
func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	required := url != ""
	if url == "" {
		url = defaultTestDBURL
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := db.Connect(ctx, url)
	if err == nil {
		err = pool.Ping(ctx)
	}
	if err != nil {
		if required {
			t.Fatalf("TEST_DATABASE_URL set but database unreachable: %v", err)
		}
		t.Skipf("no test database (%v); set TEST_DATABASE_URL to run", err)
	}
	t.Cleanup(pool.Close)

	var migrateErr error
	migrateOnce.Do(func() {
		_, file, _, _ := runtime.Caller(0)
		migrateErr = db.RunMigrations(url, filepath.Join(filepath.Dir(file), "..", "migrations"))
	})
	if migrateErr != nil {
		t.Fatalf("migrations: %v", migrateErr)
	}
	return pool
}

// uniqueEmail returns an address no other test (or earlier run) uses, and deletes the account
// afterwards. Tests run in parallel with the integration suite on the same database, so they
// only ever touch rows they created.
func uniqueEmail(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	b := make([]byte, 6)
	rand.Read(b)
	email := fmt.Sprintf("authtest-%s@example.test", hex.EncodeToString(b))
	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM users WHERE lower(email) = $1`, email)
	})
	return email
}

type sentMail struct{ To, Subject, Body string }

// fakeMailer records outgoing mail instead of sending it.
type fakeMailer struct {
	mu   sync.Mutex
	sent []sentMail
	err  error
}

func (m *fakeMailer) Send(_ context.Context, to, subject, body string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, sentMail{to, subject, body})
	return m.err
}

func (m *fakeMailer) all() []sentMail {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]sentMail(nil), m.sent...)
}

// last returns the most recent mail to the address.
func (m *fakeMailer) last(to string) (sentMail, bool) {
	all := m.all()
	for i := len(all) - 1; i >= 0; i-- {
		if all[i].To == to {
			return all[i], true
		}
	}
	return sentMail{}, false
}

// tokenFrom extracts the raw token from the link in a mail body.
func tokenFrom(t *testing.T, mail sentMail) string {
	t.Helper()
	i := strings.Index(mail.Body, "token=")
	if i < 0 {
		t.Fatalf("no token link in mail body: %q", mail.Body)
	}
	return strings.TrimSpace(mail.Body[i+len("token="):])
}

type authEnv struct {
	pool        *pgxpool.Pool
	repo        *Repo
	h           *Handler
	srv         *httptest.Server
	mail        *fakeMailer
	provisioned atomic.Int32 // provision callback invocations

}

// newAuthEnv wires the real auth layer (handlers, refresh tokens on Postgres, middleware) behind an
// httptest server, with a capturing mailer and synchronous mail sending. Refresh-token rows are
// removed with their users (ON DELETE CASCADE) by uniqueEmail's cleanup.
func newAuthEnv(t *testing.T) *authEnv {
	t.Helper()
	pool := testPool(t)
	e := &authEnv{pool: pool, repo: NewRepo(pool), mail: &fakeMailer{}}

	e.h = NewHandler(OAuthConfig{
		AllowedOrigins: []string{testFrontendURL},
		JWTSecret:      testJWTSecret,
		AppClientIDs:   []string{testIOSClientID},
	}, e.repo, func(ctx context.Context, userID, name string) error {
		e.provisioned.Add(1)
		return nil
	})
	e.h.EnablePassword(e.mail)
	e.h.async = func(f func()) { f() }

	r := chi.NewRouter()
	e.h.PasswordRoutes(r)
	r.Post("/api/auth/google/mobile", e.h.HandleMobileLogin)
	e.h.SessionRoutes(r)
	r.Group(func(r chi.Router) {
		r.Use(Middleware(testJWTSecret))
		r.Get("/api/auth/me", e.h.HandleMe)
	})
	e.srv = httptest.NewServer(r)
	t.Cleanup(e.srv.Close)
	return e
}

// client is an HTTP client with its own cookie jar, i.e. one browser.
type client struct {
	t      *testing.T
	base   string
	http   *http.Client
	access string // access token held "in memory", as the SPA does
	noCSRF bool   // omit the X-Requested-With header
}

func (e *authEnv) newClient(t *testing.T) *client {
	jar, _ := cookiejar.New(nil)
	c := &client{t: t, base: e.srv.URL, http: &http.Client{Jar: jar, Timeout: 10 * time.Second}}
	return c
}

// do sends the request and returns status plus the decoded JSON object (nil if the body isn't one).
func (c *client) do(method, path string, body any, header map[string]string) (int, map[string]any) {
	c.t.Helper()
	var rd io.Reader
	switch b := body.(type) {
	case nil:
	case string:
		rd = strings.NewReader(b)
	default:
		raw, _ := json.Marshal(b)
		rd = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, c.base+path, rd)
	if err != nil {
		c.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if !c.noCSRF {
		req.Header.Set(csrfHeader, csrfHeaderValue)
	}
	if c.access != "" {
		req.Header.Set("Authorization", "Bearer "+c.access)
	}
	for k, v := range header {
		req.Header.Set(k, v)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	var out map[string]any
	raw, _ := io.ReadAll(resp.Body)
	json.Unmarshal(raw, &out)
	return resp.StatusCode, out
}

func (c *client) post(path string, body any) (int, map[string]any) {
	c.t.Helper()
	return c.do(http.MethodPost, path, body, nil)
}

func (c *client) get(path string) (int, map[string]any) {
	c.t.Helper()
	return c.do(http.MethodGet, path, nil, nil)
}

// refreshCookie returns the value of this browser's refresh cookie ("" if none). The cookie's Path
// is /api/auth, so it is looked up for a URL under that path.
func (c *client) refreshCookie() string {
	u, _ := url.Parse(c.base + "/api/auth/refresh")
	for _, ck := range c.http.Jar.Cookies(u) {
		if ck.Name == refreshCookieName {
			return ck.Value
		}
	}
	return ""
}

// refresh renews the access token the way the SPA does on boot or after a 401.
func (c *client) refresh() (int, map[string]any) {
	c.t.Helper()
	status, body := c.post("/api/auth/refresh", nil)
	c.keepAccess(body)
	return status, body
}

func (c *client) keepAccess(body map[string]any) {
	if tok, ok := body["access_token"].(string); ok {
		c.access = tok
	}
}

// activeRefreshTokens counts the user's unrevoked refresh tokens.
func (e *authEnv) activeRefreshTokens(t *testing.T, email string) int {
	t.Helper()
	var n int
	if err := e.pool.QueryRow(context.Background(), `
		SELECT count(*) FROM refresh_tokens r JOIN users u ON u.id = r.user_id
		WHERE lower(u.email) = $1 AND r.revoked_at IS NULL`, email).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// signupAndVerify creates a verified password account and returns its email.
func (e *authEnv) signupAndVerify(t *testing.T, password string) string {
	t.Helper()
	email := uniqueEmail(t, e.pool)
	c := e.newClient(t)
	if status, body := c.post("/api/auth/password/signup", map[string]string{"email": email, "password": password, "name": "Tester"}); status != http.StatusAccepted {
		t.Fatalf("signup = %d %v", status, body)
	}
	mail, ok := e.mail.last(email)
	if !ok {
		t.Fatal("no verification mail sent")
	}
	if status, body := c.post("/api/auth/email/verify", map[string]string{"token": tokenFrom(t, mail), "password": password}); status != http.StatusOK {
		t.Fatalf("verify = %d %v", status, body)
	}
	return email
}

func (c *client) login(email, password string) (int, map[string]any) {
	c.t.Helper()
	status, body := c.post("/api/auth/password/login", map[string]string{"email": email, "password": password})
	c.keepAccess(body)
	return status, body
}
