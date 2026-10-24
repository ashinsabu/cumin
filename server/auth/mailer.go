package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

// Mailer sends transactional email (verification and password reset links).
type Mailer interface {
	Send(ctx context.Context, to, subject, body string) error
}

// ResendMailer sends via the Resend HTTPS API.
type ResendMailer struct {
	apiKey string
	from   string
	client *http.Client
	url    string
}

func NewResendMailer(apiKey, from string) *ResendMailer {
	return &ResendMailer{
		apiKey: apiKey,
		from:   from,
		client: &http.Client{Timeout: 10 * time.Second},
		url:    "https://api.resend.com/emails",
	}
}

func (m *ResendMailer) Send(ctx context.Context, to, subject, body string) error {
	payload, err := json.Marshal(map[string]any{
		"from":    m.from,
		"to":      []string{to},
		"subject": subject,
		"text":    body,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+m.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("resend returned %d: %s", resp.StatusCode, msg)
	}
	return nil
}

// LogMailer prints emails to the log. Local development only: the body contains live tokens.
type LogMailer struct{}

func (LogMailer) Send(ctx context.Context, to, subject, body string) error {
	slog.Info("mail (dev log mailer)", "to", to, "subject", subject, "body", body)
	return nil
}
