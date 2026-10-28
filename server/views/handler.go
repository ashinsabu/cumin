package views

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/project"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	store        *Store
	projectStore *project.Store
}

func NewHandler(store *Store, projectStore *project.Store) *Handler {
	return &Handler{store: store, projectStore: projectStore}
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
	userID := auth.UserIDFromContext(ctx)
	views, err := h.store.List(ctx, userID)
	if err != nil {
		return nil, api.Internal("failed to list views")
	}
	if views == nil {
		views = []SavedView{}
	}
	return &ListResponse{Views: views}, nil
}

func (h *Handler) Create(ctx context.Context, req CreateRequest) (*SavedView, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, api.BadRequest("name is required")
	}
	userID := auth.UserIDFromContext(ctx)

	filters := req.Filters
	if len(filters) == 0 {
		filters = json.RawMessage("{}")
	}
	v, err := h.store.Create(ctx, userID, name, filters)
	if err != nil {
		if errors.Is(err, errDuplicateName) {
			return nil, api.Conflict("a view with that name already exists")
		}
		return nil, api.Internal("failed to create view")
	}
	return v, nil
}

func (h *Handler) Delete(ctx context.Context) error {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)
	if err := h.store.Delete(ctx, id, userID); err != nil {
		if errors.Is(err, errNotFound) {
			return api.NotFound("view not found")
		}
		return api.Internal("failed to delete view")
	}
	return nil
}
