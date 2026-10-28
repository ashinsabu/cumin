package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/httprate"
)

func resolvedIP(t *testing.T, hops int, remote, xff string) string {
	t.Helper()
	var got string
	h := ClientIP(hops)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { got = clientIP(r) }))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = remote
	if xff != "" {
		req.Header.Set("X-Forwarded-For", xff)
	}
	h.ServeHTTP(httptest.NewRecorder(), req)
	return got
}

func TestClientIP(t *testing.T) {
	cases := []struct {
		name        string
		hops        int
		remote, xff string
		want        string
	}{
		{"direct: socket address", 0, "203.0.113.9:5555", "", "203.0.113.9"},
		{"direct: spoofed XFF ignored", 0, "203.0.113.9:5555", "1.2.3.4", "203.0.113.9"},
		{"one proxy: last XFF entry is the client", 1, "10.0.0.1:80", "198.51.100.7", "198.51.100.7"},
		{"one proxy: client-supplied prefix cannot spoof", 1, "10.0.0.1:80", "6.6.6.6, 198.51.100.7", "198.51.100.7"},
		{"two proxies: second from the right", 2, "10.0.0.1:80", "198.51.100.7, 10.0.0.2", "198.51.100.7"},
		{"proxy header missing: falls back to socket", 1, "10.0.0.1:80", "", "10.0.0.1"},
		{"ipv6 client buckets by /64", 0, "[2001:db8::1]:80", "", "2001:db8::"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := resolvedIP(t, c.hops, c.remote, c.xff); got != c.want {
				t.Errorf("clientIP = %q, want %q", got, c.want)
			}
		})
	}
}

// Regression: behind a reverse proxy every request has the proxy's RemoteAddr, so one client
// exhausting the per-IP limit locked everybody out.
func TestClientIPKey_SeparatesClientsBehindAProxy(t *testing.T) {
	limited := httprate.LimitBy(2, time.Minute, func(r *http.Request) (string, error) { return clientIP(r), nil })
	h := ClientIP(1)(limited(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})))
	do := func(client string) int {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "10.0.0.1:80"
		req.Header.Set("X-Forwarded-For", client)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	do("198.51.100.1")
	do("198.51.100.1")
	if got := do("198.51.100.1"); got != http.StatusTooManyRequests {
		t.Fatalf("third request from one client = %d, want 429", got)
	}
	if got := do("198.51.100.2"); got != http.StatusOK {
		t.Errorf("other client = %d, want 200 (must not share the proxy's bucket)", got)
	}
}
