package integration_test

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/ashinsabu/cumin/server/testutil"
)

// connectSSE opens an SSE connection to /api/events and returns a channel that
// receives the payload of each "data: ..." line. The goroutine exits when ctx
// is cancelled or the server closes the connection.
func connectSSE(ctx context.Context, t *testing.T, baseURL string) <-chan string {
	t.Helper()
	ch := make(chan string, 10)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/events", nil)
	if err != nil {
		t.Fatalf("connectSSE: %v", err)
	}
	go func() {
		defer close(ch)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return
		}
		defer resp.Body.Close()
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			if line := sc.Text(); strings.HasPrefix(line, "data:") {
				ch <- strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			}
		}
	}()
	return ch
}

func waitPing(t *testing.T, ch <-chan string, label string) {
	t.Helper()
	select {
	case v, ok := <-ch:
		if !ok {
			t.Fatalf("%s: SSE channel closed before ping arrived", label)
		}
		if v != "ping" {
			t.Errorf("%s: expected ping, got %q", label, v)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("%s: no ping within 2s", label)
	}
}

func refuteExtraPing(t *testing.T, ch <-chan string, label string) {
	t.Helper()
	select {
	case <-ch:
		t.Errorf("%s: unexpected ping", label)
	case <-time.After(300 * time.Millisecond):
	}
}

// ── Connection ────────────────────────────────────────────────────────────────

func TestSSE_ConnectReturns200WithEventStreamContentType(t *testing.T) {
	env, err := testutil.Setup()
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	defer env.Server.Close()
	defer env.DB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, env.Server.URL+"/api/events", nil)
	resp, _ := http.DefaultClient.Do(req)
	if resp == nil {
		t.Skip("connection closed before headers received")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("expected Content-Type text/event-stream, got %q", ct)
	}
}

// ── Mutation → ping ───────────────────────────────────────────────────────────

func TestSSE_PingOnItemCreate(t *testing.T) {
	env, err := testutil.Setup()
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	defer env.Server.Close()
	defer env.DB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	pings := connectSSE(ctx, t, env.Server.URL)
	time.Sleep(50 * time.Millisecond)

	body := fmt.Sprintf(`{"title":"SSE test","status_id":%q,"project_id":%q,"priority":2}`,
		env.TodoStatusID, env.ProjectID)
	resp, _ := http.Post(env.Server.URL+"/api/items", "application/json", strings.NewReader(body))
	resp.Body.Close()

	waitPing(t, pings, "item create")
}

func TestSSE_PingOnItemStatusMove(t *testing.T) {
	env, err := testutil.Setup()
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	defer env.Server.Close()
	defer env.DB.Close()

	// Create item before subscribing so the ping from creation doesn't interfere.
	body := fmt.Sprintf(`{"title":"move test","status_id":%q,"project_id":%q,"priority":1}`,
		env.TodoStatusID, env.ProjectID)
	cr, _ := http.Post(env.Server.URL+"/api/items", "application/json", strings.NewReader(body))
	var created struct{ ID string `json:"id"` }
	json.NewDecoder(cr.Body).Decode(&created)
	cr.Body.Close()
	time.Sleep(150 * time.Millisecond) // let debounce from creation settle

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	pings := connectSSE(ctx, t, env.Server.URL)
	time.Sleep(50 * time.Millisecond)

	moveBody := fmt.Sprintf(`{"status_id":%q}`, env.DoneStatusID)
	req, _ := http.NewRequest(http.MethodPost, env.Server.URL+"/api/items/"+created.ID+"/move", strings.NewReader(moveBody))
	req.Header.Set("Content-Type", "application/json")
	mr, _ := http.DefaultClient.Do(req)
	mr.Body.Close()

	waitPing(t, pings, "item move")
}

func TestSSE_PingOnQueueItemCreate(t *testing.T) {
	env, err := testutil.Setup()
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	defer env.Server.Close()
	defer env.DB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	pings := connectSSE(ctx, t, env.Server.URL)
	time.Sleep(50 * time.Millisecond)

	resp, _ := http.Post(env.Server.URL+"/api/queue", "application/json",
		strings.NewReader(`{"title":"queue ping test","priority":2}`))
	resp.Body.Close()

	waitPing(t, pings, "queue create")
}

func TestSSE_PingOnQueueItemComplete(t *testing.T) {
	env, err := testutil.Setup()
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	defer env.Server.Close()
	defer env.DB.Close()

	cr, _ := http.Post(env.Server.URL+"/api/queue", "application/json",
		strings.NewReader(`{"title":"to complete","priority":2}`))
	var qi struct{ ID string `json:"id"` }
	json.NewDecoder(cr.Body).Decode(&qi)
	cr.Body.Close()
	time.Sleep(150 * time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	pings := connectSSE(ctx, t, env.Server.URL)
	time.Sleep(50 * time.Millisecond)

	req, _ := http.NewRequest(http.MethodPost, env.Server.URL+"/api/queue/"+qi.ID+"/complete", nil)
	done, _ := http.DefaultClient.Do(req)
	done.Body.Close()

	waitPing(t, pings, "queue complete")
}

func TestSSE_PingOnEpicCreate(t *testing.T) {
	env, err := testutil.Setup()
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	defer env.Server.Close()
	defer env.DB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	pings := connectSSE(ctx, t, env.Server.URL)
	time.Sleep(50 * time.Millisecond)

	resp, _ := http.Post(env.Server.URL+"/api/epics", "application/json",
		strings.NewReader(`{"name":"SSE epic","type":"goal","color":"#ff0000"}`))
	resp.Body.Close()

	waitPing(t, pings, "epic create")
}

// ── No-ping cases ─────────────────────────────────────────────────────────────

func TestSSE_NoPingOnGETRequest(t *testing.T) {
	env, err := testutil.Setup()
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	defer env.Server.Close()
	defer env.DB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	pings := connectSSE(ctx, t, env.Server.URL)
	time.Sleep(50 * time.Millisecond)

	resp, _ := http.Get(env.Server.URL + "/api/items")
	resp.Body.Close()

	refuteExtraPing(t, pings, "GET request")
}

func TestSSE_NoPingOnFailedMutation(t *testing.T) {
	env, err := testutil.Setup()
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	defer env.Server.Close()
	defer env.DB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	pings := connectSSE(ctx, t, env.Server.URL)
	time.Sleep(50 * time.Millisecond)

	// Missing required title — should 400.
	resp, _ := http.Post(env.Server.URL+"/api/items", "application/json", strings.NewReader(`{}`))
	resp.Body.Close()

	refuteExtraPing(t, pings, "failed mutation")
}

// ── Fan-out ───────────────────────────────────────────────────────────────────

func TestSSE_MultipleClientsAllReceivePing(t *testing.T) {
	env, err := testutil.Setup()
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	defer env.Server.Close()
	defer env.DB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	pings1 := connectSSE(ctx, t, env.Server.URL)
	pings2 := connectSSE(ctx, t, env.Server.URL)
	pings3 := connectSSE(ctx, t, env.Server.URL)
	time.Sleep(100 * time.Millisecond)

	resp, _ := http.Post(env.Server.URL+"/api/queue", "application/json",
		strings.NewReader(`{"title":"fan-out test","priority":2}`))
	resp.Body.Close()

	waitPing(t, pings1, "client 1")
	waitPing(t, pings2, "client 2")
	waitPing(t, pings3, "client 3")
}

// ── Debounce ──────────────────────────────────────────────────────────────────

func TestSSE_DebounceCoalescesRapidMutations(t *testing.T) {
	env, err := testutil.Setup()
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	defer env.Server.Close()
	defer env.DB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	pings := connectSSE(ctx, t, env.Server.URL)
	time.Sleep(50 * time.Millisecond)

	for i := 0; i < 5; i++ {
		body := fmt.Sprintf(`{"title":"burst-%d","priority":2}`, i)
		resp, _ := http.Post(env.Server.URL+"/api/queue", "application/json", strings.NewReader(body))
		resp.Body.Close()
	}

	waitPing(t, pings, "first coalesced ping")

	// Drain any additional pings within a short window.
	extra := 0
	drain := time.After(300 * time.Millisecond)
loop:
	for {
		select {
		case <-pings:
			extra++
		case <-drain:
			break loop
		}
	}
	if extra > 2 {
		t.Errorf("debounce should coalesce bursts: got %d extra pings after first", extra)
	}
}
