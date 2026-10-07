package integration

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/ashinsabu/cumin/server/testutil"
)

// testEnv is the package-level shared environment (one server + DB per test run).
var testEnv *testutil.TestEnv

func TestMain(m *testing.M) {
	env, err := testutil.Setup()
	if err != nil {
		fmt.Fprintf(os.Stderr, "integration test setup failed: %v\n", err)
		os.Exit(1)
	}
	testEnv = env

	// Give all tests a clean slate: hard-delete the two provisioner starter items.
	// The board, statuses, project, and epic are intentionally kept — tests use them.
	ctx := context.Background()
	if _, err := env.DB.Exec(ctx,
		`DELETE FROM items WHERE board_id = $1`, env.BoardID,
	); err != nil {
		fmt.Fprintf(os.Stderr, "failed to clean starter items: %v\n", err)
		os.Exit(1)
	}

	code := m.Run()

	env.Server.Close()
	env.DB.Close()
	os.Exit(code)
}
