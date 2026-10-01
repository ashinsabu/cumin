package version

import "encoding/json"

// Injected at build time via -ldflags.
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
	return Info{
		Version:   Version,
		GitCommit: GitCommit,
		GitBranch: GitBranch,
		Timestamp: BuildTime,
	}
}

func (i Info) JSON() []byte {
	b, _ := json.Marshal(i)
	return b
}
