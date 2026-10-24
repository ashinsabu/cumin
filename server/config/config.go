package config

import (
	"errors"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/kelseyhightower/envconfig"
)

type Config struct {
	Port               string `envconfig:"PORT" default:"8080"`
	DatabaseURL        string `envconfig:"DATABASE_URL" default:"postgres://cumin:cumin@localhost:5432/cumin?sslmode=disable"`
	JWTSecret          string `envconfig:"JWT_SECRET"`
	GoogleClientID     string `envconfig:"GOOGLE_CLIENT_ID"`
	GoogleClientSecret string `envconfig:"GOOGLE_CLIENT_SECRET"`
	GoogleRedirectURL  string `envconfig:"GOOGLE_REDIRECT_URL" default:"http://localhost:8080/api/auth/google/callback"`
	// GoogleAppClientIDs are the native app (iOS) OAuth client IDs accepted by /api/auth/google/mobile.
	GoogleAppClientIDs []string `envconfig:"GOOGLE_MOBILE_CLIENT_IDS"`
	// AllowedOrigins is a comma-separated list of allowed frontend origins for CORS and post-auth redirect.
	AllowedOrigins string `envconfig:"ALLOWED_ORIGINS"`
	Env            string `envconfig:"ENV" default:"production"`

	// Web session policy (Go durations, e.g. 168h). Idle slides with activity; max is the hard cap from login.
	SessionIdleTimeout time.Duration `envconfig:"SESSION_IDLE_TIMEOUT" default:"168h"`
	SessionMaxLifetime time.Duration `envconfig:"SESSION_MAX_LIFETIME" default:"720h"`

	// Email+password auth needs a mailer. RESEND_API_KEY + MAIL_FROM enable it in production;
	// in local dev (http origin) emails are logged instead.
	ResendAPIKey string `envconfig:"RESEND_API_KEY"`
	MailFrom     string `envconfig:"MAIL_FROM"`

	// Inverted feature flags — features are ON by default.
	// Set the env var to true to disable the feature (kill switch pattern).
	QueueDisabled    bool `envconfig:"QUEUE_DISABLED" default:"false"`
	RealtimeDisabled bool `envconfig:"REALTIME_DISABLED" default:"false"`
	// PasswordAuthDisabled kills email+password auth. It also needs a mail provider to be on at all
	// (see PasswordAuthEnabled).
	PasswordAuthDisabled bool `envconfig:"PASSWORD_AUTH_DISABLED" default:"false"`
}

// IsFeatureEnabled returns true when the feature is not disabled.
// Features ship enabled; set FEATURE_DISABLED=true in Railway to kill them.
func (c Config) IsFeatureEnabled(flag string) bool {
	switch flag {
	case "queue":
		return !c.QueueDisabled
	case "realtime":
		return !c.RealtimeDisabled
	case "password_auth":
		return c.PasswordAuthEnabled()
	}
	return false
}

func Load() Config {
	_ = godotenv.Load()

	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		slog.Error("config load failed", "err", err)
		os.Exit(1)
	}

	fatal := func(msg string, args ...any) {
		slog.Error(msg, args...)
		os.Exit(1)
	}

	if cfg.JWTSecret == "" {
		fatal("JWT_SECRET must be set")
	}
	if len(cfg.JWTSecret) < 32 {
		fatal("JWT_SECRET must be at least 32 characters")
	}
	if cfg.GoogleClientID == "" {
		fatal("GOOGLE_CLIENT_ID must be set")
	}
	if cfg.GoogleClientSecret == "" {
		fatal("GOOGLE_CLIENT_SECRET must be set")
	}
	if cfg.AllowedOrigins == "" {
		fatal("ALLOWED_ORIGINS must be set", "example", "http://localhost:3000,https://cumin.ashinsabu.com")
	}
	if err := cfg.validateSessions(); err != nil {
		fatal("invalid session config", "err", err)
	}

	return cfg
}

// minSessionIdle keeps the idle timeout well above the hourly activity-touch throttle in the auth
// package, otherwise an active session could expire between touches.
const minSessionIdle = 2 * time.Hour

func (c Config) validateSessions() error {
	if c.SessionIdleTimeout < minSessionIdle {
		return errors.New("SESSION_IDLE_TIMEOUT must be at least " + minSessionIdle.String())
	}
	if c.SessionMaxLifetime < c.SessionIdleTimeout {
		return errors.New("SESSION_MAX_LIFETIME must be >= SESSION_IDLE_TIMEOUT")
	}
	return nil
}

func (c Config) IsDev() bool {
	return c.Env == "development"
}

// AllowedOriginsList parses the comma-separated ALLOWED_ORIGINS into a slice.
func (c Config) AllowedOriginsList() []string {
	var out []string
	for _, o := range strings.Split(c.AllowedOrigins, ",") {
		if s := strings.TrimSpace(o); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// SecureCookies reports whether the frontend is served over https (first allowed origin),
// which decides the session cookie's Secure attribute.
func (c Config) SecureCookies() bool {
	origins := c.AllowedOriginsList()
	return len(origins) > 0 && strings.HasPrefix(origins[0], "https://")
}

// MailerConfigured reports whether a real mail provider is set up.
func (c Config) MailerConfigured() bool {
	return c.ResendAPIKey != "" && c.MailFrom != ""
}

// PasswordAuthEnabled is the single source of truth for email+password auth, used both for the
// /api/flags value and for registering the routes. It needs email delivery: without a provider it is
// only on for local http development, where emails are logged. Never on an https origin, because the
// log mailer prints live tokens.
func (c Config) PasswordAuthEnabled() bool {
	return !c.PasswordAuthDisabled && (c.MailerConfigured() || !c.SecureCookies())
}
