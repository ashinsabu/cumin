package queue

import (
	"context"
	"time"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/project"
	"github.com/go-chi/chi/v5"
)

type CreateRequest struct {
	Title           string     `json:"title"`
	Notes           string     `json:"notes"`
	Deadline        *time.Time `json:"deadline"`
	Priority        int        `json:"priority"`
	EstimateMinutes *int       `json:"estimate_minutes"`
}

type UpdateRequest struct {
	Title           string     `json:"title"`
	Notes           string     `json:"notes"`
	Deadline        *time.Time `json:"deadline"`
	Priority        int        `json:"priority"`
	EstimateMinutes *int       `json:"estimate_minutes"`
}

type PromoteRequest struct {
	ProjectID string  `json:"project_id"`
	StatusID  string  `json:"status_id"`
	EpicID    *string `json:"epic_id"`
}

type ListResponse struct {
	Items []QueueItem `json:"items"`
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
	r.Get("/api/queue", api.HandleNoBody(h.List))
	r.Get("/api/queue/history", api.HandleNoBody(h.History))
	r.Post("/api/queue", api.Handle(h.Create))
	r.Patch("/api/queue/{id}", api.Handle(h.Update))
	r.Delete("/api/queue/{id}", api.HandleDelete(h.Archive))
	r.Post("/api/queue/{id}/complete", api.HandleNoBody(h.Complete))
	r.Post("/api/queue/{id}/promote", api.Handle(h.Promote))
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

func (h *Handler) List(ctx context.Context) (*ListResponse, error) {
	userID := auth.UserIDFromContext(ctx)
	items, err := h.store.List(ctx, userID)
	if err != nil {
		return nil, api.Internal("failed to list queue")
	}
	return &ListResponse{Items: items}, nil
}

func (h *Handler) Create(ctx context.Context, req CreateRequest) (*QueueItem, error) {
	if req.Title == "" {
		return nil, api.BadRequest("title required")
	}
	userID := auth.UserIDFromContext(ctx)

	// boardID required until Phase 3 drops the column.
	p, err := project.GetOrFetch(ctx, h.projectStore)
	if err != nil {
		return nil, api.Internal("failed to resolve project context")
	}

	q, err := h.store.Create(ctx, p.BoardID, userID, userID, req.Title, req.Notes, req.Deadline, req.Priority, req.EstimateMinutes)
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
	q, err := h.store.Update(ctx, id, userID, req.Title, req.Notes, req.Deadline, req.Priority, req.EstimateMinutes)
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

	// boardID required until Phase 3 drops the column.
	p, err := project.GetOrFetch(ctx, h.projectStore)
	if err != nil {
		return nil, api.Internal("failed to resolve project context")
	}

	result, err := h.store.Promote(ctx, id, p.BoardID, userID, req.ProjectID, req.StatusID, req.EpicID)
	if err != nil {
		return nil, api.Internal("failed to promote queue item")
	}
	return result, nil
}
