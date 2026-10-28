package queue

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/project"
	"github.com/go-chi/chi/v5"
)

type CreateRequest struct {
	Title           string `json:"title"`
	Notes           string `json:"notes"`
	Priority        int    `json:"priority"`
	EstimateMinutes *int   `json:"estimate_minutes"`
}

type UpdateRequest struct {
	Title           string `json:"title"`
	Notes           string `json:"notes"`
	Priority        int    `json:"priority"`
	EstimateMinutes *int   `json:"estimate_minutes"`
}

type PromoteRequest struct {
	ProjectID string  `json:"project_id"`
	StatusID  string  `json:"status_id"`
	EpicID    *string `json:"epic_id"`
	SprintID  *string `json:"sprint_id"`
}

type ListResponse struct {
	Items   []QueueItem `json:"items"`
	Summary Summary     `json:"summary"`
}

type Handler struct {
	store        *Store
	projectStore *project.Store
}

func NewHandler(store *Store, projectStore *project.Store) *Handler {
	return &Handler{store: store, projectStore: projectStore}
}

type ReorderRequest struct {
	Order []string `json:"order"`
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/queue", h.List)
	r.Get("/api/queue/history", api.HandleNoBody(h.History))
	r.Post("/api/queue", api.Handle(h.Create))
	r.Patch("/api/queue/{id}", api.Handle(h.Update))
	r.Delete("/api/queue/{id}", api.HandleDelete(h.Archive))
	r.Post("/api/queue/{id}/complete", api.HandleNoBody(h.Complete))
	r.Post("/api/queue/{id}/promote", api.Handle(h.Promote))
	r.Post("/api/queue/{id}/restore", api.HandleNoBody(h.Restore))
	r.Post("/api/queue/{id}/revive", api.HandleNoBody(h.Revive))
	r.Put("/api/queue/reorder", api.Handle(h.Reorder))
}

type HistoryResponse struct {
	Items []QueueItem `json:"items"`
}

func (h *Handler) History(ctx context.Context) (*HistoryResponse, error) {
	userID := auth.UserIDFromContext(ctx)
	items, err := h.store.History(ctx, userID)
	if err != nil {
		return nil, api.Internal("failed to list history")
	}
	return &HistoryResponse{Items: items}, nil
}

func (h *Handler) Complete(ctx context.Context) (*QueueItem, error) {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)
	q, err := h.store.Complete(ctx, id, userID)
	if err != nil {
		return nil, api.NotFound("queue item not found")
	}
	return q, nil
}

// List returns the active queue with computed per-item attention and the day summary.
// ?tz=<IANA zone> is the browser's timezone: the day ends at its next midnight (UTC if absent/invalid).
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	items, err := h.store.List(r.Context(), userID)
	if err != nil {
		api.WriteError(w, api.Internal("failed to list queue"))
		return
	}
	loc, err := time.LoadLocation(r.URL.Query().Get("tz"))
	if err != nil {
		loc = time.UTC
	}
	summary := ComputeAttention(items, time.Now(), loc)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ListResponse{Items: items, Summary: summary})
}

func (h *Handler) Create(ctx context.Context, req CreateRequest) (*QueueItem, error) {
	if req.Title == "" {
		return nil, api.BadRequest("title required")
	}
	if req.EstimateMinutes != nil && *req.EstimateMinutes < 0 {
		return nil, api.BadRequest("estimate_minutes must not be negative")
	}
	userID := auth.UserIDFromContext(ctx)

	q, err := h.store.Create(ctx, userID, userID, req.Title, req.Notes, req.Priority, req.EstimateMinutes)
	if err != nil {
		return nil, api.Internal("failed to create queue item")
	}
	return q, nil
}

func (h *Handler) Update(ctx context.Context, req UpdateRequest) (*QueueItem, error) {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)
	if req.Title == "" {
		return nil, api.BadRequest("title required")
	}
	if req.EstimateMinutes != nil && *req.EstimateMinutes < 0 {
		return nil, api.BadRequest("estimate_minutes must not be negative")
	}
	q, err := h.store.Update(ctx, id, userID, req.Title, req.Notes, req.Priority, req.EstimateMinutes)
	if err != nil {
		return nil, api.NotFound("queue item not found")
	}
	return q, nil
}

func (h *Handler) Archive(ctx context.Context) error {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)
	if err := h.store.Archive(ctx, id, userID); err != nil {
		return api.Internal("failed to archive queue item")
	}
	return nil
}

func (h *Handler) Restore(ctx context.Context) (*QueueItem, error) {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)
	q, err := h.store.Restore(ctx, id, userID)
	if err != nil {
		return nil, api.NotFound("queue item not found")
	}
	return q, nil
}

func (h *Handler) Reorder(ctx context.Context, req ReorderRequest) (*struct{}, error) {
	userID := auth.UserIDFromContext(ctx)
	if err := h.store.Reorder(ctx, userID, req.Order); err != nil {
		return nil, api.Internal("failed to reorder queue")
	}
	return nil, nil
}

func (h *Handler) Revive(ctx context.Context) (*QueueItem, error) {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)
	q, err := h.store.Revive(ctx, id, userID)
	if err != nil {
		return nil, api.NotFound("queue item not found")
	}
	return q, nil
}

func (h *Handler) Promote(ctx context.Context, req PromoteRequest) (*PromoteResult, error) {
	id := api.URLParam(ctx, "id")
	if req.ProjectID == "" || req.StatusID == "" {
		return nil, api.BadRequest("project_id and status_id required")
	}
	userID := auth.UserIDFromContext(ctx)

	result, err := h.store.Promote(ctx, id, userID, req.ProjectID, req.StatusID, req.EpicID, req.SprintID)
	if err != nil {
		if errors.Is(err, ErrInvalidSprint) {
			return nil, api.BadRequest("sprint_id is invalid")
		}
		return nil, api.Internal("failed to promote queue item")
	}
	return result, nil
}
