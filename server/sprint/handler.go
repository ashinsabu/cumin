package sprint

import (
	"context"
	"time"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/board"
	"github.com/go-chi/chi/v5"
)

type CreateRequest struct {
	// StartDate is optional; defaults to today if omitted.
	StartDate *time.Time `json:"start_date"`
}

type CloseResponse struct {
	SpilledCount int     `json:"spilled_count"`
	NextSprint   *Sprint `json:"next_sprint"`
}

type SpilloverPreviewResponse struct {
	Count int `json:"count"`
}

type ListResponse struct {
	Sprints []Sprint `json:"sprints"`
}

// State machine: planning → active → completed (no skipping, no reversal)
var validTransitions = map[string]string{
	"planning": "active",
	"active":   "completed",
}

type Handler struct {
	store      *Store
	boardStore *board.Store
}

func NewHandler(store *Store, boardStore *board.Store) *Handler {
	return &Handler{store: store, boardStore: boardStore}
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/sprints", api.HandleNoBody(h.List))
	r.Post("/api/sprints", api.Handle(h.Create))
	r.Get("/api/sprints/active", api.HandleNoBody(h.GetActive))
	r.Post("/api/sprints/{id}/activate", api.HandleNoBody(h.Activate))
	r.Post("/api/sprints/{id}/close", api.HandleNoBody(h.Close))
	r.Get("/api/sprints/{id}/spillover-preview", api.HandleNoBody(h.SpilloverPreview))
}

func (h *Handler) List(ctx context.Context) (*ListResponse, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	sprints, err := h.store.List(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("failed to list sprints")
	}
	if sprints == nil {
		sprints = []Sprint{}
	}
	return &ListResponse{Sprints: sprints}, nil
}

func (h *Handler) GetActive(ctx context.Context) (*Sprint, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	sp, err := h.store.GetActive(ctx, b.ID)
	if err != nil {
		return nil, api.NotFound("no active sprint")
	}
	return sp, nil
}

func (h *Handler) Create(ctx context.Context, req CreateRequest) (*Sprint, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	startDate := time.Now().UTC().Truncate(24 * time.Hour)
	if req.StartDate != nil && !req.StartDate.IsZero() {
		startDate = req.StartDate.UTC().Truncate(24 * time.Hour)
	}

	cadence := b.SprintCadenceDays
	if cadence <= 0 {
		cadence = 14
	}

	sp, err := h.store.CreateNext(ctx, b.ID, startDate, cadence)
	if err != nil {
		return nil, api.Internal("failed to create sprint")
	}
	return sp, nil
}

func (h *Handler) Activate(ctx context.Context) (*Sprint, error) {
	id := api.URLParam(ctx, "id")

	sp, err := h.store.GetByID(ctx, id)
	if err != nil {
		return nil, api.NotFound("sprint not found")
	}

	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil || sp.BoardID != b.ID {
		return nil, api.NotFound("sprint not found")
	}

	if validTransitions[sp.State] != "active" {
		return nil, api.Conflict("sprint must be in 'planning' state to activate (current: " + sp.State + ")")
	}

	activated, err := h.store.Activate(ctx, id)
	if err != nil {
		return nil, api.Conflict("activation failed — another sprint may already be active")
	}
	return activated, nil
}

func (h *Handler) Close(ctx context.Context) (*CloseResponse, error) {
	id := api.URLParam(ctx, "id")

	sp, err := h.store.GetByID(ctx, id)
	if err != nil {
		return nil, api.NotFound("sprint not found")
	}

	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil || sp.BoardID != b.ID {
		return nil, api.NotFound("sprint not found")
	}

	if validTransitions[sp.State] != "completed" {
		return nil, api.Conflict("sprint must be 'active' to close (current: " + sp.State + ")")
	}

	doneIDs, err := h.boardStore.DoneStatusIDs(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("failed to resolve done statuses")
	}

	cadence := b.SprintCadenceDays
	if cadence <= 0 {
		cadence = 14
	}

	result, err := h.store.Close(ctx, id, b.ID, cadence, doneIDs)
	if err != nil {
		return nil, api.Conflict("close failed — check sprint state and try again")
	}
	return &CloseResponse{SpilledCount: result.SpilledCount, NextSprint: result.NextSprint}, nil
}

func (h *Handler) SpilloverPreview(ctx context.Context) (*SpilloverPreviewResponse, error) {
	id := api.URLParam(ctx, "id")

	sp, err := h.store.GetByID(ctx, id)
	if err != nil {
		return nil, api.NotFound("sprint not found")
	}

	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil || sp.BoardID != b.ID {
		return nil, api.NotFound("sprint not found")
	}

	doneIDs, err := h.boardStore.DoneStatusIDs(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("failed to resolve done statuses")
	}

	count, err := h.store.SpilloverPreview(ctx, id, doneIDs)
	if err != nil {
		return nil, api.Internal("preview failed")
	}
	return &SpilloverPreviewResponse{Count: count}, nil
}
