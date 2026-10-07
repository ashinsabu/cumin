package config

import (
	"log/slog"
	"os"
	"strings"

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
	Env string `envconfig:"ENV" default:"production"`

	// Inverted feature flags — features are ON by default.
	// Set the env var to true to disable the feature (kill switch pattern).
	QueueDisabled    bool `envconfig:"QUEUE_DISABLED" default:"false"`
	RealtimeDisabled bool `envconfig:"REALTIME_DISABLED" default:"false"`
}

// IsFeatureEnabled returns true when the feature is not disabled.
// Features ship enabled; set FEATURE_DISABLED=true in Railway to kill them.
func (c Config) IsFeatureEnabled(flag string) bool {
	switch flag {
	case "queue":
		return !c.QueueDisabled
	case "realtime":
		return !c.RealtimeDisabled
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

	return cfg
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
