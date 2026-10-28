package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ashinsabu/cumin/server/config"
	"github.com/ashinsabu/cumin/server/db"
	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultTestDBURL = "postgres://cumin:cumin@localhost:5432/cumin?sslmode=disable"

// testPool mirrors the auth tests: CI sets TEST_DATABASE_URL (unreachable = failure), locally an
// unreachable default database skips.
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
		t.Skipf("no test database (%v)", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func freePort(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	_, port, _ := net.SplitHostPort(l.Addr().String())
	return port
}

// Regression: shutdown used to cancel the server's base context, i.e. the context of every
// request, so a deploy aborted in-flight work (sprint close, reorder, signup) mid-query instead of
// letting it finish inside the graceful-shutdown window.
func TestServer_ShutdownLetsInFlightRequestsFinish(t *testing.T) {
	port := freePort(t)
	s := NewServer(config.Config{
		Port: port, Env: "development", JWTSecret: strings.Repeat("s", 32),
		AllowedOrigins: "http://localhost:3000",
	}, testPool(t))

	started := make(chan struct{})
	var ctxErrDuringRequest atomic.Value // error, stored as a string ("" = never cancelled)
	inner := s.http.Handler
	s.http.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/slow" {
			inner.ServeHTTP(w, r)
			return
		}
		close(started)
		select {
		case <-time.After(600 * time.Millisecond):
		case <-r.Context().Done():
		}
		msg := ""
		if err := r.Context().Err(); err != nil {
			msg = err.Error()
		}
		ctxErrDuringRequest.Store(msg)
		io.WriteString(w, "done")
	})

	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	runErr := make(chan error, 1)
	go func() { runErr <- s.Run(ctx) }()

	base := "http://127.0.0.1:" + port
	deadline := time.Now().Add(5 * time.Second)
	for {
		resp, err := http.Get(base + "/healthz")
		if err == nil {
			resp.Body.Close()
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("server did not come up: %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}

	type result struct {
		body string
		err  error
	}
	got := make(chan result, 1)
	go func() {
		resp, err := http.Get(base + "/slow")
		if err != nil {
			got <- result{err: err}
			return
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		got <- result{body: string(b)}
	}()

	<-started
	stop() // SIGTERM equivalent while /slow is in flight

	select {
	case r := <-got:
		if r.err != nil || r.body != "done" {
			t.Fatalf("in-flight request = %q, %v; want it to finish normally", r.body, r.err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("in-flight request never completed")
	}
	if msg, _ := ctxErrDuringRequest.Load().(string); msg != "" {
		t.Errorf("request context was cancelled by shutdown: %s", msg)
	}
	select {
	case err := <-runErr:
		if err != nil {
			t.Errorf("Run returned %v after graceful shutdown", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return after shutdown")
	}
}
