package epic

import (
	"context"
	"time"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/project"
	"github.com/go-chi/chi/v5"
)

type CreateRequest struct {
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	Color       string     `json:"color"`
	Deadline    *time.Time `json:"deadline"`
	Description string     `json:"description"`
}

type UpdateRequest struct {
	Name        string     `json:"name"`
	Type        string     `json:"type"`
	Color       string     `json:"color"`
	Deadline    *time.Time `json:"deadline"`
	Description string     `json:"description"`
}

type ListResponse struct {
	Epics []Epic `json:"epics"`
}

var validTypes = map[string]bool{"recurring": true, "goal": true, "catchall": true}

type Handler struct {
	store        *Store
	projectStore *project.Store
}

func NewHandler(store *Store, projectStore *project.Store) *Handler {
	return &Handler{store: store, projectStore: projectStore}
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/epics", api.HandleNoBody(h.List))
	r.Post("/api/epics", api.Handle(h.Create))
	r.Patch("/api/epics/{id}", api.Handle(h.Update))
	r.Delete("/api/epics/{id}", api.HandleDelete(h.Delete))
	r.Post("/api/epics/{id}/restore", api.HandleDelete(h.Restore))
}

func (h *Handler) List(ctx context.Context) (*ListResponse, error) {
	userID := auth.UserIDFromContext(ctx)
	if userID == "" {
		return nil, api.NotFound("user not found")
	}

	epics, err := h.store.List(ctx, userID)
	if err != nil {
		return nil, api.Internal("failed to list epics")
	}
	if epics == nil {
		epics = []Epic{}
	}
	return &ListResponse{Epics: epics}, nil
}

func (h *Handler) Create(ctx context.Context, req CreateRequest) (*Epic, error) {
	userID := auth.UserIDFromContext(ctx)
	if userID == "" {
		return nil, api.NotFound("user not found")
	}

	if req.Name == "" {
		return nil, api.BadRequest("name required")
	}
	if req.Type == "" {
		req.Type = "catchall"
	}
	if !validTypes[req.Type] {
		return nil, api.BadRequest("type must be: recurring, goal, or catchall")
	}
	if req.Color == "" {
		req.Color = "#6b7280"
	}

	// boardID is still required until Phase 3 drops the column.
	p, err := project.GetOrFetch(ctx, h.projectStore)
	if err != nil {
		return nil, api.Internal("failed to resolve project context")
	}

	return h.store.Create(ctx, p.BoardID, userID, req.Name, req.Type, req.Color, req.Description, req.Deadline)
}

func (h *Handler) Update(ctx context.Context, req UpdateRequest) (*Epic, error) {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)

	existing, err := h.store.GetByID(ctx, id)
	if err != nil || existing.UserID != userID {
		return nil, api.NotFound("epic not found")
	}

	if req.Name == "" {
		req.Name = existing.Name
	}
	if req.Type == "" {
		req.Type = existing.Type
	}
	if req.Type != "" && !validTypes[req.Type] {
		return nil, api.BadRequest("type must be: recurring, goal, or catchall")
	}
	if req.Color == "" {
		req.Color = existing.Color
	}
	if req.Description == "" {
		req.Description = existing.Description
	}
	if req.Deadline == nil {
		req.Deadline = existing.Deadline
	}

	return h.store.Update(ctx, id, req.Name, req.Type, req.Color, req.Description, req.Deadline)
}

func (h *Handler) Delete(ctx context.Context) error {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)

	existing, err := h.store.GetByID(ctx, id)
	if err != nil || existing.UserID != userID {
		return api.NotFound("epic not found")
	}

	if err := h.store.SoftDelete(ctx, id, userID); err != nil {
		return api.Internal("failed to delete epic")
	}
	return nil
}

func (h *Handler) Restore(ctx context.Context) error {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)

	if err := h.store.RestoreEpic(ctx, id, userID); err != nil {
		return api.Internal("failed to restore epic")
	}
	return nil
}
