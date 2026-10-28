package main

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	_ "time/tzdata" // the alpine runtime image has no zoneinfo; queue attention needs IANA zones

	"github.com/ashinsabu/cumin/server/config"
	applogger "github.com/ashinsabu/cumin/server/logger"
	"github.com/ashinsabu/cumin/server/version"
)

const usage = `cumin - sprint board server

Usage:
  cumin             Run migrations and start the HTTP server
  cumin <command>

Commands:
  migrate   Apply pending database migrations and exit
  version   Print build version info as JSON
  help      Show this help
`

// @title           Cumin API
// @version         1.0
// @description     OSS sprint board API
// @host            api.cumin.ashinsabu.com
// @BasePath        /
// @securityDefinitions.apikey BearerAuth
// @in              header
// @name            Authorization
func main() {
	os.Exit(execute(os.Args[1:], os.Stdout, os.Stderr))
}

// execute runs the server when given no arguments (what the container's CMD relies on),
// otherwise dispatches a subcommand. It returns the process exit code.
func execute(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		return runWithConfig("serve", serve)
	}

	switch args[0] {
	case "help", "-h", "--help":
		fmt.Fprint(stdout, usage)
		return 0
	case "version":
		stdout.Write(append(version.Get().JSON(), '\n'))
		return 0
	case "migrate":
		return runWithConfig("migrate", migrate)
	default:
		fmt.Fprintf(stderr, "unknown command %q\n\n%s", args[0], usage)
		return 2
	}
}

// runWithConfig loads config (which exits on invalid env) only for commands that need it.
func runWithConfig(name string, fn func(config.Config) error) int {
	applogger.Setup()
	if err := fn(config.Load()); err != nil {
		slog.Error(name+" failed", "err", err)
		return 1
	}
	return 0
}
