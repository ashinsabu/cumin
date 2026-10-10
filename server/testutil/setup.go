// Package testutil provides shared integration test infrastructure.
// It wires up a real Postgres-backed HTTP server using the same route
// registration as main.go, with a DevBypass auth middleware in place of JWT.
package testutil

import (
	"context"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"

	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/board"
	"github.com/ashinsabu/cumin/server/db"
	"github.com/ashinsabu/cumin/server/epic"
	"github.com/ashinsabu/cumin/server/hub"
	"github.com/ashinsabu/cumin/server/item"
	"github.com/ashinsabu/cumin/server/project"
	"github.com/ashinsabu/cumin/server/queue"
	"github.com/ashinsabu/cumin/server/sprint"
	"github.com/ashinsabu/cumin/server/trash"
	"github.com/ashinsabu/cumin/server/views"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	TestUserID   = "00000000-0000-0000-0000-000000000001"
	defaultDBURL = "postgres://cumin:cumin@localhost:5432/cumin?sslmode=disable"
)

// TestEnv holds the live server, DB pool, and pre-provisioned resource IDs.
type TestEnv struct {
	Server       *httptest.Server
	DB           *pgxpool.Pool
	Hub          *hub.InMemoryHub
	BoardID      string // kept for backward compat; boards table still exists in Phase 2
	ProjectID    string
	EpicID       string
	TodoStatusID string
	DoneStatusID string
}

// Setup runs migrations, provisions the test user, and starts an httptest.Server.
// The caller is responsible for calling env.Server.Close() and env.DB.Close().
func Setup() (*TestEnv, error) {
	ctx := context.Background()

	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = defaultDBURL
	}

	_, filename, _, _ := runtime.Caller(0)
	migrationsPath := filepath.Join(filepath.Dir(filename), "..", "migrations")

	if err := db.RunMigrations(dbURL, migrationsPath); err != nil {
		return nil, fmt.Errorf("migrations: %w", err)
	}

	pool, err := db.Connect(ctx, dbURL)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO users (id, google_id, email, display_name)
		VALUES ($1, 'test-google-id-integ', 'test-integ@cumin.example', 'Test User')
		ON CONFLICT (id) DO NOTHING
	`, TestUserID)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("create test user: %w", err)
	}

	// Full teardown before each test run. boards table still exists in Phase 2 so teardown
	// can still use board_id for items/epics/sprints/queue_items.
	var testBoardID string
	_ = pool.QueryRow(ctx, `SELECT id FROM boards WHERE user_id = $1 LIMIT 1`, TestUserID).Scan(&testBoardID)
	if testBoardID != "" {
		for _, q := range []string{
			`DELETE FROM queue_items        WHERE board_id = $1`,
			`DELETE FROM status_transitions WHERE item_id IN (SELECT id FROM items WHERE board_id = $1)`,
			`DELETE FROM items              WHERE board_id = $1`,
			`DELETE FROM epics              WHERE board_id = $1`,
			`DELETE FROM sprints            WHERE board_id = $1`,
			`DELETE FROM projects           WHERE board_id = $1`,
			`DELETE FROM boards             WHERE id = $1`, // cascades to statuses
		} {
			if _, err = pool.Exec(ctx, q, testBoardID); err != nil {
				pool.Close()
				return nil, fmt.Errorf("clean test data: %w", err)
			}
		}
	}

	prov := auth.NewProvisioner(pool)
	if err := prov.ProvisionNewUser(ctx, TestUserID, "Test User"); err != nil {
		pool.Close()
		return nil, fmt.Errorf("provision: %w", err)
	}

	// Read back the IDs we need in tests.
	var boardID string
	if err := pool.QueryRow(ctx,
		`SELECT id FROM boards WHERE user_id = $1 AND deleted_at IS NULL`, TestUserID,
	).Scan(&boardID); err != nil {
		pool.Close()
		return nil, fmt.Errorf("get board: %w", err)
	}

	var todoStatusID string
	if err := pool.QueryRow(ctx,
		`SELECT id FROM statuses WHERE user_id = $1 AND is_initial = true LIMIT 1`, TestUserID,
	).Scan(&todoStatusID); err != nil {
		pool.Close()
		return nil, fmt.Errorf("get todo status: %w", err)
	}

	var doneStatusID string
	if err := pool.QueryRow(ctx,
		`SELECT id FROM statuses WHERE user_id = $1 AND is_done = true LIMIT 1`, TestUserID,
	).Scan(&doneStatusID); err != nil {
		pool.Close()
		return nil, fmt.Errorf("get done status: %w", err)
	}

	var projectID string
	if err := pool.QueryRow(ctx,
		`SELECT id FROM projects WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1`, TestUserID,
	).Scan(&projectID); err != nil {
		pool.Close()
		return nil, fmt.Errorf("get project: %w", err)
	}

	var epicID string
	if err := pool.QueryRow(ctx,
		`SELECT id FROM epics WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1`, TestUserID,
	).Scan(&epicID); err != nil {
		pool.Close()
		return nil, fmt.Errorf("get epic: %w", err)
	}

	// Build the chi router — same wiring as main.go, minus CORS.
	r := chi.NewRouter()
	r.Use(auth.DevBypass(TestUserID))

	boardStore := &board.Store{DB: pool}
	projectStore := &project.Store{DB: pool}
	epicStore := &epic.Store{DB: pool}
	sprintStore := &sprint.Store{DB: pool}
	itemStore := &item.Store{DB: pool}

	h := hub.New()
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
	// SSE enabled=true in tests
	r.Get("/api/events", hub.NewHandler(h, true).Events)

	server := httptest.NewServer(r)

	return &TestEnv{
		Server:       server,
		DB:           pool,
		Hub:          h,
		BoardID:      boardID,
		ProjectID:    projectID,
		EpicID:       epicID,
		TodoStatusID: todoStatusID,
		DoneStatusID: doneStatusID,
	}, nil
}
