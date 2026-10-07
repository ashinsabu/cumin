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
	r.Post("/api/queue/{id}/revive", api.HandleNoBody(h.Revive))
	r.Put("/api/queue/reorder", api.Handle(h.Reorder))
}

// List returns all active queue items for the authenticated user's board.
//
// @Summary      List queue items
// @Tags         queue
// @Produce      json
// @Success      200  {object}  queue.ListResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/queue [get]
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

// Create captures a new item into the queue.
//
// @Summary      Create queue item
// @Tags         queue
// @Accept       json
// @Produce      json
// @Param        body  body  queue.CreateRequest  true  "Queue item to capture"
// @Success      200  {object}  queue.QueueItem
// @Failure      400  {object}  api.ErrorResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/queue [post]
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

// Update updates a queue item.
//
// @Summary      Update queue item
// @Tags         queue
// @Accept       json
// @Produce      json
// @Param        id    path  string               true  "Queue item ID"
// @Param        body  body  queue.UpdateRequest  true  "Fields to update"
// @Success      200  {object}  queue.QueueItem
// @Failure      400  {object}  api.ErrorResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/queue/{id} [patch]
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

// Archive archives (soft-deletes) a queue item.
//
// @Summary      Archive queue item
// @Tags         queue
// @Param        id  path  string  true  "Queue item ID"
// @Success      204  "No Content"
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/queue/{id} [delete]
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

// Reorder sets the display order of queue items.
//
// @Summary      Reorder queue items
// @Tags         queue
// @Accept       json
// @Param        body  body  queue.ReorderRequest  true  "Ordered queue item IDs"
// @Success      204  "No Content"
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/queue/reorder [put]
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

// Revive resets a stale queue item's created_at to now, moving it back to the active belt.
//
// @Summary      Revive stale queue item
// @Tags         queue
// @Param        id  path  string  true  "Queue item ID"
// @Produce      json
// @Success      200  {object}  queue.QueueItem
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/queue/{id}/revive [post]
func (h *Handler) Revive(ctx context.Context) (*QueueItem, error) {
	id := api.URLParam(ctx, "id")
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	q, err := h.store.Revive(ctx, id, b.ID)
	if err != nil {
		return nil, api.NotFound("queue item not found")
	}
	return q, nil
}

// Promote converts a queue item into a board item.
//
// @Summary      Promote queue item to board item
// @Tags         queue
// @Accept       json
// @Produce      json
// @Param        id    path  string               true  "Queue item ID"
// @Param        body  body  queue.PromoteRequest  true  "Promotion target"
// @Success      200  {object}  queue.PromoteResult
// @Failure      400  {object}  api.ErrorResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/queue/{id}/promote [post]
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
