package queue

import (
	"context"
	"time"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/board"
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
	store      *Store
	boardStore *board.Store
}

func NewHandler(store *Store, boardStore *board.Store) *Handler {
	return &Handler{store: store, boardStore: boardStore}
}

type ReorderRequest struct {
	Order []string `json:"order"`
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/queue", api.HandleNoBody(h.List))
	r.Post("/api/queue", api.Handle(h.Create))
	r.Patch("/api/queue/{id}", api.Handle(h.Update))
	r.Delete("/api/queue/{id}", api.HandleDelete(h.Archive))
	r.Post("/api/queue/{id}/promote", api.Handle(h.Promote))
	r.Put("/api/queue/reorder", api.Handle(h.Reorder))
}

func (h *Handler) List(ctx context.Context) (*ListResponse, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	items, err := h.store.List(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("failed to list queue")
	}
	return &ListResponse{Items: items}, nil
}

func (h *Handler) Create(ctx context.Context, req CreateRequest) (*QueueItem, error) {
	if req.Title == "" {
		return nil, api.BadRequest("title required")
	}
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	userID := auth.UserIDFromContext(ctx)
	q, err := h.store.Create(ctx, b.ID, userID, req.Title, req.Notes, req.Deadline, req.Priority, req.EstimateMinutes)
	if err != nil {
		return nil, api.Internal("failed to create queue item")
	}
	return q, nil
}

func (h *Handler) Update(ctx context.Context, req UpdateRequest) (*QueueItem, error) {
	id := api.URLParam(ctx, "id")
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	if req.Title == "" {
		return nil, api.BadRequest("title required")
	}
	q, err := h.store.Update(ctx, id, b.ID, req.Title, req.Notes, req.Deadline, req.Priority, req.EstimateMinutes)
	if err != nil {
		return nil, api.NotFound("queue item not found")
	}
	return q, nil
}

func (h *Handler) Archive(ctx context.Context) error {
	id := api.URLParam(ctx, "id")
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return api.NotFound("board not found")
	}
	if err := h.store.Archive(ctx, id, b.ID); err != nil {
		return api.Internal("failed to archive queue item")
	}
	return nil
}

func (h *Handler) Reorder(ctx context.Context, req ReorderRequest) (*struct{}, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	if err := h.store.Reorder(ctx, b.ID, req.Order); err != nil {
		return nil, api.Internal("failed to reorder queue")
	}
	return nil, nil
}

func (h *Handler) Promote(ctx context.Context, req PromoteRequest) (*PromoteResult, error) {
	id := api.URLParam(ctx, "id")
	if req.ProjectID == "" || req.StatusID == "" {
		return nil, api.BadRequest("project_id and status_id required")
	}
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	result, err := h.store.Promote(ctx, id, b.ID, req.ProjectID, req.StatusID, req.EpicID)
	if err != nil {
		return nil, api.Internal("failed to promote queue item")
	}
	return result, nil
}
