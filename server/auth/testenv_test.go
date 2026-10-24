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

	mu      sync.Mutex
	clients []*client // browsers created by the test; their sessions are deleted on cleanup
}

// newAuthEnv wires the real auth layer (handlers, scs session manager on Postgres, middleware)
// behind an httptest server, with a capturing mailer and synchronous mail sending.
func newAuthEnv(t *testing.T) *authEnv {
	t.Helper()
	pool := testPool(t)
	e := &authEnv{pool: pool, repo: NewRepo(pool), mail: &fakeMailer{}}

	sm := NewSessionManager(pool, false, 24*time.Hour, 48*time.Hour)
	e.h = NewHandler(OAuthConfig{
		AllowedOrigins: []string{testFrontendURL},
		JWTSecret:      testJWTSecret,
	}, e.repo, sm, func(ctx context.Context, userID, name string) error {
		e.provisioned.Add(1)
		return nil
	})
	e.h.EnablePassword(e.mail)
	e.h.async = func(f func()) { f() }

	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		r.Use(sm.LoadAndSave)
		e.h.PasswordRoutes(r)
		// Creates an anonymous session, to test that login rotates the session id.
		r.Get("/test/anon", func(w http.ResponseWriter, r *http.Request) {
			sm.Put(r.Context(), "anon", "1")
		})
	})
	r.Group(func(r chi.Router) {
		r.Use(sm.LoadAndSave)
		r.Use(Middleware(testJWTSecret, sm))
		r.Get("/api/auth/me", e.h.HandleMe)
		r.Post("/api/auth/logout", e.h.HandleLogout)
	})
	e.srv = httptest.NewServer(r)
	t.Cleanup(e.srv.Close)
	// Sessions are rows in the shared database; remove the ones this test created so repeated
	// runs don't accumulate them.
	t.Cleanup(func() {
		e.mu.Lock()
		defer e.mu.Unlock()
		for _, c := range e.clients {
			if tok := c.sessionToken(); tok != "" {
				pool.Exec(context.Background(), `DELETE FROM sessions WHERE token = $1`, tok)
			}
		}
	})
	return e
}

// client is an HTTP client with its own cookie jar, i.e. one browser.
type client struct {
	t    *testing.T
	base string
	http *http.Client
}

func (e *authEnv) newClient(t *testing.T) *client {
	jar, _ := cookiejar.New(nil)
	c := &client{t: t, base: e.srv.URL, http: &http.Client{Jar: jar, Timeout: 10 * time.Second}}
	e.mu.Lock()
	e.clients = append(e.clients, c)
	e.mu.Unlock()
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

// sessionToken returns the value of this browser's session cookie ("" if none).
func (c *client) sessionToken() string {
	u, _ := url.Parse(c.base)
	for _, ck := range c.http.Jar.Cookies(u) {
		if ck.Name == "session" {
			return ck.Value
		}
	}
	return ""
}

func (e *authEnv) sessionRowExists(t *testing.T, token string) bool {
	t.Helper()
	var n int
	if err := e.pool.QueryRow(context.Background(), `SELECT count(*) FROM sessions WHERE token = $1`, token).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n == 1
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
	if status, body := c.post("/api/auth/email/verify", map[string]string{"token": tokenFrom(t, mail)}); status != http.StatusOK {
		t.Fatalf("verify = %d %v", status, body)
	}
	return email
}

func (c *client) login(email, password string) (int, map[string]any) {
	c.t.Helper()
	return c.post("/api/auth/password/login", map[string]string{"email": email, "password": password})
}
