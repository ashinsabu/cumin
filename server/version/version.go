package version

import (
	"encoding/json"
	"os"
)

// Injected at build time via -ldflags when using Railway's Git integration.
// Falls back to VERSION / GIT_COMMIT / GIT_BRANCH env vars for CLI deploys.
var (
	Version   = "dev"
	GitCommit = "unknown"
	GitBranch = "unknown"
	BuildTime = "unknown"
)

type Info struct {
	Version   string `json:"version"`
	GitCommit string `json:"gitCommit"`
	GitBranch string `json:"gitBranch"`
	Timestamp string `json:"timestamp"`
}

func Get() Info {
	v, gc, gb, bt := Version, GitCommit, GitBranch, BuildTime
	if v == "dev" {
		if ev := os.Getenv("VERSION"); ev != "" {
			v = ev
		}
	}
	if gc == "unknown" {
		if ev := os.Getenv("GIT_COMMIT"); ev != "" {
			gc = ev
		}
	}
	if gb == "unknown" {
		if ev := os.Getenv("GIT_BRANCH"); ev != "" {
			gb = ev
		}
	}
	return Info{Version: v, GitCommit: gc, GitBranch: gb, Timestamp: bt}
}

func (i Info) JSON() []byte {
	b, _ := json.Marshal(i)
	return b
}
