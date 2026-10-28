package config

import (
	"os"
	"strings"
	"testing"
	"time"
)

// setRequiredEnv sets the env that Load insists on, so tests can vary only the session settings.
func setRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("JWT_SECRET", strings.Repeat("s", 32))
	t.Setenv("GOOGLE_CLIENT_ID", "id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "secret")
	t.Setenv("ALLOWED_ORIGINS", "http://localhost:3000")
	t.Setenv("ENV", "development")
	// Hermetic: ignore any session policy exported in the developer's shell. t.Setenv registers the
	// restore, then Unsetenv leaves the variable truly absent for this test.
	for _, k := range []string{"SESSION_IDLE_TIMEOUT", "SESSION_MAX_LIFETIME"} {
		t.Setenv(k, "")
		os.Unsetenv(k)
	}
}

func TestLoad_SessionDefaults(t *testing.T) {
	setRequiredEnv(t)
	cfg := Load()
	if cfg.SessionIdleTimeout != 7*24*time.Hour {
		t.Errorf("idle default = %v, want 168h", cfg.SessionIdleTimeout)
	}
	if cfg.SessionMaxLifetime != 30*24*time.Hour {
		t.Errorf("max default = %v, want 720h", cfg.SessionMaxLifetime)
	}
}

func TestLoad_SessionOverrides(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("SESSION_IDLE_TIMEOUT", "24h")
	t.Setenv("SESSION_MAX_LIFETIME", "48h")
	cfg := Load()
	if cfg.SessionIdleTimeout != 24*time.Hour || cfg.SessionMaxLifetime != 48*time.Hour {
		t.Errorf("got idle=%v max=%v, want 24h/48h", cfg.SessionIdleTimeout, cfg.SessionMaxLifetime)
	}
}

func TestValidateSessions(t *testing.T) {
	tests := []struct {
		name    string
		idle    time.Duration
		max     time.Duration
		wantErr string // substring; empty means valid
	}{
		{"defaults", 168 * time.Hour, 720 * time.Hour, ""},
		{"idle equals max", 24 * time.Hour, 24 * time.Hour, ""},
		{"idle at minimum", minSessionIdle, 24 * time.Hour, ""},
		{"idle below minimum", time.Hour, 24 * time.Hour, "SESSION_IDLE_TIMEOUT"},
		{"zero idle", 0, 24 * time.Hour, "SESSION_IDLE_TIMEOUT"},
		{"negative idle", -time.Hour, 24 * time.Hour, "SESSION_IDLE_TIMEOUT"},
		{"max below idle", 48 * time.Hour, 24 * time.Hour, "SESSION_MAX_LIFETIME"},
		{"zero max", 24 * time.Hour, 0, "SESSION_MAX_LIFETIME"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Config{SessionIdleTimeout: tt.idle, SessionMaxLifetime: tt.max}.validateSessions()
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("err = %v, want containing %q", err, tt.wantErr)
			}
		})
	}
}

// Regression: cookie Secure and the log-mailer decision used to depend on the position of the first
// ALLOWED_ORIGINS entry. A production list like "http://localhost:3000,https://app" turned the
// cookie insecure and, with no Resend key, logged live verification/reset tokens.
func TestDeploymentDecisionsFollowEnv(t *testing.T) {
	mailer := func(c Config) Config { c.ResendAPIKey, c.MailFrom = "key", "from@x.co"; return c }
	prod := Config{Env: "production", AllowedOrigins: "http://localhost:3000,https://cumin.example"}
	dev := Config{Env: "development", AllowedOrigins: "http://localhost:3000"}

	if !prod.SecureCookies() {
		t.Error("production cookies must be Secure whatever the origin order")
	}
	if dev.SecureCookies() {
		t.Error("development cookies must work over plain http")
	}
	if prod.PasswordAuthEnabled() {
		t.Error("production without a mail provider must not enable password auth (log mailer prints tokens)")
	}
	if !mailer(prod).PasswordAuthEnabled() {
		t.Error("production with a mail provider should enable password auth")
	}
	if !dev.PasswordAuthEnabled() {
		t.Error("development without a provider should enable password auth via the log mailer")
	}
	killed := dev
	killed.PasswordAuthDisabled = true
	if killed.PasswordAuthEnabled() || mailer(killed).PasswordAuthEnabled() {
		t.Error("PASSWORD_AUTH_DISABLED must win")
	}
}

func TestValidateOrigins(t *testing.T) {
	tests := []struct {
		name, env, origins, wantErr string
	}{
		{"production https", "production", "https://a.example,https://b.example", ""},
		{"production with an http origin", "production", "https://a.example,http://localhost:3000", "http://localhost:3000"},
		{"production http only", "production", "http://a.example", "http://a.example"},
		{"development allows http", "development", "http://localhost:3000", ""},
		{"spaces around entries", "production", " https://a.example , https://b.example ", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Config{Env: tt.env, AllowedOrigins: tt.origins}.validateOrigins()
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("err = %v, want containing %q", err, tt.wantErr)
			}
		})
	}
}
