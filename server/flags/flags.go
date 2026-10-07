package flags

import (
	"encoding/json"
	"net/http"

	"github.com/ashinsabu/cumin/server/config"
)

// allFeatures lists every named feature. Add new features here.
var allFeatures = []string{"queue", "realtime"}

type Handler struct {
	cfg config.Config
}

func NewHandler(cfg config.Config) *Handler {
	return &Handler{cfg: cfg}
}

// ServeHTTP returns the enabled state of all known features.
// Features are enabled by default; set FEATURE_DISABLED=true to kill them.
//
// @Summary      Get feature flags
// @Tags         meta
// @Produce      json
// @Success      200  {object}  map[string]bool
// @Router       /api/flags [get]
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	out := make(map[string]bool, len(allFeatures))
	for _, f := range allFeatures {
		out[f] = h.cfg.IsFeatureEnabled(f)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}
