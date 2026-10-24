package auth

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestResendMailer_Send(t *testing.T) {
	t.Run("posts the expected request", func(t *testing.T) {
		var gotAuth, gotType, gotMethod string
		var gotBody map[string]any
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotMethod, gotAuth, gotType = r.Method, r.Header.Get("Authorization"), r.Header.Get("Content-Type")
			raw, _ := io.ReadAll(r.Body)
			json.Unmarshal(raw, &gotBody)
			w.WriteHeader(http.StatusOK)
		}))
		defer srv.Close()
		m := NewResendMailer("key123", "Cumin <noreply@cumin.test>")
		m.url = srv.URL

		if err := m.Send(context.Background(), "u@x.co", "Hi", "body text"); err != nil {
			t.Fatal(err)
		}
		if gotMethod != http.MethodPost || gotAuth != "Bearer key123" || gotType != "application/json" {
			t.Errorf("method=%s auth=%q type=%q", gotMethod, gotAuth, gotType)
		}
		to, _ := gotBody["to"].([]any)
		if gotBody["from"] != "Cumin <noreply@cumin.test>" || len(to) != 1 || to[0] != "u@x.co" ||
			gotBody["subject"] != "Hi" || gotBody["text"] != "body text" {
			t.Errorf("payload = %v", gotBody)
		}
	})
	t.Run("provider error surfaces status and message", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnprocessableEntity)
			w.Write([]byte(`{"message":"domain not verified"}`))
		}))
		defer srv.Close()
		m := NewResendMailer("k", "f")
		m.url = srv.URL
		err := m.Send(context.Background(), "u@x.co", "s", "b")
		if err == nil || !strings.Contains(err.Error(), "422") || !strings.Contains(err.Error(), "domain not verified") {
			t.Errorf("err = %v, want it to mention 422 and the provider message", err)
		}
	})
	t.Run("cancelled context aborts", func(t *testing.T) {
		release := make(chan struct{})
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-release }))
		defer srv.Close()
		defer close(release)
		m := NewResendMailer("k", "f")
		m.url = srv.URL
		ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
		defer cancel()
		if err := m.Send(ctx, "u@x.co", "s", "b"); err == nil {
			t.Error("expected an error when the context expires")
		}
	})
	t.Run("unreachable provider", func(t *testing.T) {
		m := NewResendMailer("k", "f")
		m.url = "http://127.0.0.1:1"
		if err := m.Send(context.Background(), "u@x.co", "s", "b"); err == nil {
			t.Error("expected a connection error")
		}
	})
}

func TestLogMailer_NeverFails(t *testing.T) {
	if err := (LogMailer{}).Send(context.Background(), "u@x.co", "s", "b"); err != nil {
		t.Errorf("LogMailer.Send = %v", err)
	}
}
