package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/alexedwards/scs/v2"
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
	"github.com/ashinsabu/cumin/server/version"
	"github.com/ashinsabu/cumin/server/views"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
)

// migrate applies pending migrations and returns.
func migrate(cfg config.Config) error {
	if err := db.RunMigrations(cfg.DatabaseURL, migrationsDir()); err != nil {
		return fmt.Errorf("migrations: %w", err)
	}
	slog.Info("migrations applied")
	return nil
}

// shutdownTimeout bounds how long in-flight requests get to finish after SIGTERM/SIGINT.
const shutdownTimeout = 15 * time.Second

// serve migrates the database, then runs the server until SIGINT/SIGTERM.
func serve(cfg config.Config) error {
	if err := migrate(cfg); err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("db connect: %w", err)
	}
	defer pool.Close()

	return NewServer(cfg, pool).Run(ctx)
}

// Server owns the HTTP server and its dependencies.
type Server struct {
	cfg      config.Config
	pool     *pgxpool.Pool
	authRepo *auth.Repo
	http     *http.Server
	// streamShutdown is closed when shutdown begins, ending long-lived SSE streams that
	// http.Server.Shutdown would otherwise wait on until the timeout. Other in-flight requests keep
	// their contexts and finish normally.
	streamShutdown chan struct{}
}

func NewServer(cfg config.Config, pool *pgxpool.Pool) *Server {
	s := &Server{cfg: cfg, pool: pool, authRepo: auth.NewRepo(pool), streamShutdown: make(chan struct{})}
	s.http = &http.Server{Addr: ":" + cfg.Port, Handler: s.Handler()}
	return s
}

// Run serves until ctx is cancelled, then shuts down gracefully.
func (s *Server) Run(ctx context.Context) error {
	go s.runPurgeWorker(ctx)

	errc := make(chan error, 1)
	go func() {
		slog.Info("cumin server starting", "port", s.cfg.Port)
		errc <- s.http.ListenAndServe()
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}

	slog.Info("cumin server shutting down")
	close(s.streamShutdown)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := s.http.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("shutdown: %w", err)
	}
	return nil
}

// Handler returns the fully wired router (also used by tests).
func (s *Server) Handler() http.Handler {
	cfg := s.cfg
	r := chi.NewRouter()
	r.Use(applogger.RequestLogger)
	r.Use(middleware.Recoverer)

	sm := auth.NewSessionManager(s.pool, cfg.SecureCookies(), cfg.SessionIdleTimeout, cfg.SessionMaxLifetime)
	authHandler := newAuthHandler(cfg, s.authRepo, s.pool, sm)

	r.Get("/healthz", s.healthz)
	r.Get("/api/version", versionHandler)
	r.Get("/api/docs/swagger.json", swaggerJSONHandler)
	r.Get("/api/auth/google/login", authHandler.HandleLogin)
	r.With(sm.LoadAndSave).Get("/api/auth/google/callback", authHandler.HandleCallback)

	r.Group(func(r chi.Router) {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   cfg.AllowedOriginsList(),
			AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"Content-Type", "Authorization", "sentry-trace", "baggage"},
			AllowCredentials: true,
		}))
		r.Options("/*", func(w http.ResponseWriter, r *http.Request) {})

		r.Post("/api/auth/google/mobile", authHandler.HandleMobileLogin)
		r.Get("/api/flags", flags.NewHandler(cfg).ServeHTTP)

		// Password endpoints create sessions, so they need the session middleware too.
		r.Group(func(r chi.Router) {
			r.Use(sm.LoadAndSave)
			authHandler.PasswordRoutes(r)
		})

		r.Group(func(r chi.Router) {
			r.Use(sm.LoadAndSave)
			r.Use(auth.Middleware(cfg.JWTSecret, sm))

			r.Get("/api/auth/me", authHandler.HandleMe)
			r.Post("/api/auth/logout", authHandler.HandleLogout)

			registerDomainRoutes(r, s.pool, cfg, s.streamShutdown)
		})
	})
	return r
}

func (s *Server) healthz(w http.ResponseWriter, r *http.Request) {
	if err := s.pool.Ping(r.Context()); err != nil {
		http.Error(w, `{"status":"unhealthy"}`, http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

func versionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(version.Get().JSON())
}

func swaggerJSONHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(swaggerDocs.JSON)
}

func registerDomainRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config, streamShutdown <-chan struct{}) {
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
		r.Get("/api/events", hub.NewHandler(h, cfg.IsFeatureEnabled("realtime")).WithShutdown(streamShutdown).Events)
	})
}

// runPurgeWorker daily hard-deletes data past its retention window, until ctx is cancelled.
func (s *Server) runPurgeWorker(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		purge := func(query string) {
			ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()
			if _, err := s.pool.Exec(ctx, query); err != nil {
				slog.Error("purge worker failed", "err", err)
			}
		}
		purge(`DELETE FROM items    WHERE deleted_at < NOW() - INTERVAL '30 days'`)
		purge(`DELETE FROM epics    WHERE deleted_at < NOW() - INTERVAL '30 days'`)
		purge(`DELETE FROM projects WHERE deleted_at < NOW() - INTERVAL '30 days'`)

		tokenCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		if err := s.authRepo.PurgeExpiredTokens(tokenCtx); err != nil {
			slog.Error("purge worker failed", "err", err)
		}
		cancel()
	}
}

func newAuthHandler(cfg config.Config, repo *auth.Repo, pool *pgxpool.Pool, sm *scs.SessionManager) *auth.Handler {
	h := auth.NewHandler(auth.OAuthConfig{
		ClientID:       cfg.GoogleClientID,
		ClientSecret:   cfg.GoogleClientSecret,
		RedirectURL:    cfg.GoogleRedirectURL,
		AllowedOrigins: cfg.AllowedOriginsList(),
		JWTSecret:      cfg.JWTSecret,
		AppClientIDs:   cfg.GoogleAppClientIDs,
	}, repo, sm, auth.NewProvisioner(pool).ProvisionNewUser)

	if cfg.PasswordAuthEnabled() {
		if cfg.MailerConfigured() {
			h.EnablePassword(auth.NewResendMailer(cfg.ResendAPIKey, cfg.MailFrom))
		} else {
			h.EnablePassword(auth.LogMailer{}) // local http dev only, see Config.PasswordAuthEnabled
		}
	} else {
		slog.Warn("password auth disabled", "kill_switch", cfg.PasswordAuthDisabled, "mailer_configured", cfg.MailerConfigured())
	}
	return h
}

func migrationsDir() string {
	if p := os.Getenv("MIGRATIONS_PATH"); p != "" {
		return p
	}
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "..", "migrations")
}
