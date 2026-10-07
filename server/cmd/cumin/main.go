package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/board"
	"github.com/ashinsabu/cumin/server/config"
	"github.com/ashinsabu/cumin/server/db"
	"github.com/ashinsabu/cumin/server/epic"
	"github.com/ashinsabu/cumin/server/flags"
	"github.com/ashinsabu/cumin/server/item"
	applogger "github.com/ashinsabu/cumin/server/logger"
	"github.com/ashinsabu/cumin/server/project"
	"github.com/ashinsabu/cumin/server/queue"
	"github.com/ashinsabu/cumin/server/sprint"
	"github.com/ashinsabu/cumin/server/trash"
	"github.com/ashinsabu/cumin/server/version"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	applogger.Setup()

	cfg := config.Load()

	migrationsPath := migrationsDir()
	if err := db.RunMigrations(cfg.DatabaseURL, migrationsPath); err != nil {
		slog.Error("migrations failed", "err", err)
		os.Exit(1)
	}
	slog.Info("migrations applied")

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("db connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	startPurgeWorker(pool)

	r := chi.NewRouter()
	r.Use(applogger.RequestLogger)
	r.Use(middleware.Recoverer)

	// Browser-navigation routes: no CORS needed (not XHR, Origin header from Google would be blocked)
	r.Get("/healthz", healthz(pool))
	r.Get("/api/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(version.Get().JSON())
	})
	r.Get("/api/flags", flags.NewHandler(cfg).ServeHTTP)
	oauthHandler := newAuthHandler(cfg, pool)
	r.Get("/api/auth/google/login", oauthHandler.HandleLogin)
	r.Get("/api/auth/google/callback", oauthHandler.HandleCallback)

	// All XHR API routes — CORS required
	r.Group(func(r chi.Router) {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   cfg.AllowedOriginsList(),
			AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"Content-Type", "Authorization", "sentry-trace", "baggage"},
			AllowCredentials: true,
		}))
		// Explicit OPTIONS handler so chi routes preflights through the CORS middleware
		// instead of returning 405 before middleware runs.
		r.Options("/*", func(w http.ResponseWriter, r *http.Request) {})

		// Protected routes
		r.Group(func(r chi.Router) {
			if cfg.AuthDisabled {
				if !cfg.IsDev() {
					slog.Error("AUTH_DISABLED=true is not allowed outside of development environment")
					os.Exit(1)
				}
				r.Use(auth.DevBypass("00000000-0000-0000-0000-000000000001"))
			} else {
				r.Use(auth.Middleware(cfg.JWTSecret))
			}

			r.Get("/api/auth/me", oauthHandler.HandleMe)
			r.Post("/api/auth/logout", oauthHandler.HandleLogout)

			registerDomainRoutes(r, pool)
		})
	})

	slog.Info("cumin server starting", "port", cfg.Port, "auth_disabled", cfg.AuthDisabled)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func registerDomainRoutes(r chi.Router, pool *pgxpool.Pool) {
	boardStore := &board.Store{DB: pool}
	projectStore := &project.Store{DB: pool}
	epicStore := &epic.Store{DB: pool}
	sprintStore := &sprint.Store{DB: pool}
	itemStore := &item.Store{DB: pool}

	board.NewHandler(boardStore).Routes(r)
	project.NewHandler(projectStore, boardStore).Routes(r)
	epic.NewHandler(epicStore, boardStore).Routes(r)
	sprint.NewHandler(sprintStore, boardStore).Routes(r)
	item.NewHandler(itemStore, boardStore).Routes(r)
	trash.NewHandler(projectStore, epicStore, boardStore).Routes(r)
	queue.NewHandler(&queue.Store{DB: pool}, boardStore).Routes(r)
}

// startPurgeWorker hard-deletes soft-deleted rows older than 30 days, running daily.
// FK order: items first (references epics + projects), then epics, then projects.
func startPurgeWorker(pool *pgxpool.Pool) {
	ticker := time.NewTicker(24 * time.Hour)
	go func() {
		defer ticker.Stop()
		for range ticker.C {
			purge := func(query string) {
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				if _, err := pool.Exec(ctx, query); err != nil {
					slog.Error("purge worker failed", "err", err)
				}
			}
			purge(`DELETE FROM items    WHERE deleted_at < NOW() - INTERVAL '30 days'`)
			purge(`DELETE FROM epics    WHERE deleted_at < NOW() - INTERVAL '30 days'`)
			purge(`DELETE FROM projects WHERE deleted_at < NOW() - INTERVAL '30 days'`)
		}
	}()
}

func newAuthHandler(cfg config.Config, pool *pgxpool.Pool) *auth.Handler {
	repo := auth.NewRepo(pool)
	provisioner := auth.NewProvisioner(pool)
	return auth.NewHandler(auth.OAuthConfig{
		ClientID:       cfg.GoogleClientID,
		ClientSecret:   cfg.GoogleClientSecret,
		RedirectURL:    cfg.GoogleRedirectURL,
		AllowedOrigins: cfg.AllowedOriginsList(),
		JWTSecret:      cfg.JWTSecret,
	}, repo, provisioner.ProvisionNewUser)
}

func healthz(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := pool.Ping(r.Context()); err != nil {
			http.Error(w, `{"status":"unhealthy"}`, http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	}
}

func migrationsDir() string {
	if p := os.Getenv("MIGRATIONS_PATH"); p != "" {
		return p
	}
	// Dev: resolve relative to source file location
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "..", "migrations")
}
