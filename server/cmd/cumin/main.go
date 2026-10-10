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
	swaggerDocs "github.com/ashinsabu/cumin/server/docs"
	"github.com/ashinsabu/cumin/server/epic"
	"github.com/ashinsabu/cumin/server/flags"
	"github.com/ashinsabu/cumin/server/hub"
	"github.com/ashinsabu/cumin/server/item"
	applogger "github.com/ashinsabu/cumin/server/logger"
	"github.com/ashinsabu/cumin/server/project"
	"github.com/ashinsabu/cumin/server/queue"
	"github.com/ashinsabu/cumin/server/sprint"
	"github.com/ashinsabu/cumin/server/trash"
	"github.com/ashinsabu/cumin/server/views"
	"github.com/ashinsabu/cumin/server/version"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
)

// @title           Cumin API
// @version         1.0
// @description     OSS sprint board API
// @host            api.cumin.ashinsabu.com
// @BasePath        /
// @securityDefinitions.apikey CookieAuth
// @in              cookie
// @name            token
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

	r.Get("/healthz", healthz(pool))
	r.Get("/api/version", versionHandler)
	r.Get("/api/docs/swagger.json", swaggerJSONHandler)
	oauthHandler := newAuthHandler(cfg, pool)
	r.Get("/api/auth/google/login", oauthHandler.HandleLogin)
	r.Get("/api/auth/google/callback", oauthHandler.HandleCallback)

	r.Group(func(r chi.Router) {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   cfg.AllowedOriginsList(),
			AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"Content-Type", "Authorization", "sentry-trace", "baggage"},
			AllowCredentials: true,
		}))
		r.Options("/*", func(w http.ResponseWriter, r *http.Request) {})

		r.Post("/api/auth/google/mobile", oauthHandler.HandleMobileLogin)

		r.Get("/api/flags", flags.NewHandler(cfg).ServeHTTP)

		r.Group(func(r chi.Router) {
			r.Use(auth.Middleware(cfg.JWTSecret))

			r.Get("/api/auth/me", oauthHandler.HandleMe)
			r.Post("/api/auth/logout", oauthHandler.HandleLogout)

			registerDomainRoutes(r, pool, cfg)
		})
	})

	slog.Info("cumin server starting", "port", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func versionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(version.Get().JSON())
}

func swaggerJSONHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(swaggerDocs.JSON)
}

func registerDomainRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	boardStore := &board.Store{DB: pool}
	projectStore := &project.Store{DB: pool}
	epicStore := &epic.Store{DB: pool}
	sprintStore := &sprint.Store{DB: pool}
	itemStore := &item.Store{DB: pool}
	h := hub.New()

	r.Group(func(r chi.Router) {
		r.Use(project.ContextMiddleware(projectStore))
		r.Use(hub.NotifyMiddleware(h))

		board.NewHandler(boardStore).Routes(r)
		project.NewHandler(projectStore).Routes(r)
		epic.NewHandler(epicStore, projectStore).Routes(r)
		sprint.NewHandler(sprintStore, boardStore, projectStore).Routes(r)
		item.NewHandler(itemStore, boardStore, projectStore).Routes(r)
		trash.NewHandler(projectStore, epicStore).Routes(r)
		queue.NewHandler(&queue.Store{DB: pool}, projectStore).Routes(r)
		views.NewHandler(&views.Store{DB: pool}, projectStore).Routes(r)
		r.Get("/api/events", hub.NewHandler(h, cfg.IsFeatureEnabled("realtime")).Events)
	})
}

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
		AppClientIDs:   cfg.GoogleAppClientIDs,
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
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "..", "migrations")
}
