package views

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/board"
	"github.com/go-chi/chi/v5"
)


var errNotFound = errors.New("view not found")

type Handler struct {
	store      *Store
	boardStore *board.Store
}

func NewHandler(store *Store, boardStore *board.Store) *Handler {
	return &Handler{store: store, boardStore: boardStore}
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/views", api.HandleNoBody(h.List))
	r.Post("/api/views", api.Handle(h.Create))
	r.Delete("/api/views/{id}", api.HandleDelete(h.Delete))
}

type ListResponse struct {
	Views []SavedView `json:"views"`
}

type CreateRequest struct {
	Name    string          `json:"name"`
	Filters json.RawMessage `json:"filters"`
}

func (h *Handler) List(ctx context.Context) (*ListResponse, error) {
	b, err := board.GetOrFetch(ctx, h.boardStore)
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	views, err := h.store.List(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("failed to list views")
	}
	if views == nil {
		views = []SavedView{}
	}
	return &ListResponse{Views: views}, nil
}

func (h *Handler) Create(ctx context.Context, req CreateRequest) (*SavedView, error) {
	if req.Name == "" {
		return nil, api.BadRequest("name is required")
	}
	b, err := board.GetOrFetch(ctx, h.boardStore)
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	filters := req.Filters
	if len(filters) == 0 {
		filters = json.RawMessage("{}")
	}
	v, err := h.store.Create(ctx, b.ID, req.Name, filters)
	if err != nil {
		return nil, api.Internal("failed to create view")
	}
	return v, nil
}

func (h *Handler) Delete(ctx context.Context) error {
	id := api.URLParam(ctx, "id")
	b, err := board.GetOrFetch(ctx, h.boardStore)
	if err != nil {
		return api.NotFound("board not found")
	}
	if err := h.store.Delete(ctx, id, b.ID); err != nil {
		if errors.Is(err, errNotFound) {
			return api.NotFound("view not found")
		}
		return api.Internal("failed to delete view")
	}
	return nil
}
