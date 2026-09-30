package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"

	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/board"
	"github.com/ashinsabu/cumin/server/config"
	"github.com/ashinsabu/cumin/server/db"
	"github.com/ashinsabu/cumin/server/epic"
	"github.com/ashinsabu/cumin/server/item"
	"github.com/ashinsabu/cumin/server/project"
	"github.com/ashinsabu/cumin/server/sprint"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	cfg := config.Load()

	migrationsPath := migrationsDir()
	if err := db.RunMigrations(cfg.DatabaseURL, migrationsPath); err != nil {
		log.Fatalf("migrations: %v", err)
	}
	log.Println("migrations applied")

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.FrontendURL},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	r.Get("/healthz", healthz(pool))

	// Public auth routes
	oauthHandler := newAuthHandler(cfg, pool)
	r.Get("/api/auth/google/login", oauthHandler.HandleLogin)
	r.Get("/api/auth/google/callback", oauthHandler.HandleCallback)

	// Protected routes
	r.Group(func(r chi.Router) {
		if cfg.AuthDisabled {
			r.Use(auth.DevBypass("00000000-0000-0000-0000-000000000001"))
		} else {
			r.Use(auth.Middleware(cfg.JWTSecret))
		}

		r.Get("/api/auth/me", oauthHandler.HandleMe)
		r.Post("/api/auth/logout", oauthHandler.HandleLogout)

		registerDomainRoutes(r, pool)
	})

	log.Printf("cumin server starting on :%s (auth_disabled=%v)", cfg.Port, cfg.AuthDisabled)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		log.Fatal(err)
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
}

func newAuthHandler(cfg config.Config, pool *pgxpool.Pool) *auth.Handler {
	repo := auth.NewRepo(pool)
	provisioner := auth.NewProvisioner(pool)
	return auth.NewHandler(auth.OAuthConfig{
		ClientID:     cfg.GoogleClientID,
		ClientSecret: cfg.GoogleClientSecret,
		RedirectURL:  cfg.GoogleRedirectURL,
		FrontendURL:  cfg.FrontendURL,
		JWTSecret:    cfg.JWTSecret,
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
