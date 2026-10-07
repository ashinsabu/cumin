package flags

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/ashinsabu/cumin/server/config"
)

type Handler struct {
	cfg config.Config
}

func NewHandler(cfg config.Config) *Handler {
	return &Handler{cfg: cfg}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	out := map[string]bool{}
	for _, f := range strings.Split(h.cfg.FeatureFlags, ",") {
		f = strings.TrimSpace(f)
		if f != "" {
			out[f] = true
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}
