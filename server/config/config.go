package config

import (
	"log"

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
	FrontendURL        string `envconfig:"FRONTEND_URL" default:"http://localhost:3000"`
	Env                string `envconfig:"ENV" default:"development"`
	AuthDisabled       bool   `envconfig:"AUTH_DISABLED" default:"false"`
}

func Load() Config {
	_ = godotenv.Load()

	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		log.Fatalf("config: %v", err)
	}

	if cfg.JWTSecret == "" {
		log.Fatal("JWT_SECRET must be set")
	}
	if cfg.Env != "development" && len(cfg.JWTSecret) < 32 {
		log.Fatal("JWT_SECRET must be at least 32 characters in non-development environments")
	}

	return cfg
}

func (c Config) IsDev() bool {
	return c.Env == "development"
}
