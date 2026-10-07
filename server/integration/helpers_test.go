package integration

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// mustDo sends an HTTP request to the test server, marshalling body to JSON if non-nil.
// It fatals on request-construction or transport errors; it does NOT assert the status code.
func mustDo(t *testing.T, srv *httptest.Server, method, path string, body any) *http.Response {
	t.Helper()
	var rb io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("mustDo: marshal body: %v", err)
		}
		rb = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, srv.URL+path, rb)
	if err != nil {
		t.Fatalf("mustDo: new request %s %s: %v", method, path, err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("mustDo: do %s %s: %v", method, path, err)
	}
	return resp
}

// mustDecodeJSON decodes the response body into T, closing the body.
// It fatals if decoding fails.
func mustDecodeJSON[T any](t *testing.T, resp *http.Response) T {
	t.Helper()
	defer resp.Body.Close()
	var v T
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		t.Fatalf("mustDecodeJSON: %v", err)
	}
	return v
}

// assertStatus fails the test if resp.StatusCode != want.
func assertStatus(t *testing.T, resp *http.Response, want int) {
	t.Helper()
	if resp.StatusCode != want {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Errorf("expected status %d, got %d — body: %s", want, resp.StatusCode, body)
	}
}

// drainClose discards the response body and closes it.
func drainClose(resp *http.Response) {
	if resp != nil && resp.Body != nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}

// containsID returns true if any element in ids matches target.
func containsID(ids []string, target string) bool {
	for _, id := range ids {
		if id == target {
			return true
		}
	}
	return false
}
