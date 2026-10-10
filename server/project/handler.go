package project

import (
	"context"
	"strings"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/go-chi/chi/v5"
)

type CreateRequest struct {
	Name        string `json:"name"`
	Prefix      string `json:"prefix"`
	Color       string `json:"color"`
	Description string `json:"description"`
}

type UpdateRequest struct {
	Name        string `json:"name"`
	Color       string `json:"color"`
	Description string `json:"description"`
}

type ListResponse struct {
	Projects []Project `json:"projects"`
}

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/projects", api.HandleNoBody(h.List))
	r.Post("/api/projects", api.Handle(h.Create))
	r.Patch("/api/projects/{id}", api.Handle(h.Update))
	r.Delete("/api/projects/{id}", api.HandleDelete(h.Delete))
	r.Post("/api/projects/{id}/restore", api.HandleDelete(h.Restore))
}

func (h *Handler) List(ctx context.Context) (*ListResponse, error) {
	userID := auth.UserIDFromContext(ctx)

	projects, err := h.store.List(ctx, userID)
	if err != nil {
		return nil, api.Internal("failed to list projects")
	}
	if projects == nil {
		projects = []Project{}
	}
	return &ListResponse{Projects: projects}, nil
}

func (h *Handler) Create(ctx context.Context, req CreateRequest) (*Project, error) {
	userID := auth.UserIDFromContext(ctx)

	if req.Name == "" || req.Prefix == "" {
		return nil, api.BadRequest("name and prefix required")
	}

	req.Prefix = strings.ToUpper(strings.TrimSpace(req.Prefix))
	if len(req.Prefix) > 5 {
		return nil, api.BadRequest("prefix max 5 chars")
	}
	if req.Color == "" {
		req.Color = "#6b7280"
	}

	// Use the current project's boardID to satisfy the NOT NULL constraint until Phase 3.
	p, err := GetOrFetch(ctx, h.store)
	if err != nil {
		return nil, api.Internal("failed to resolve board context")
	}

	created, err := h.store.Create(ctx, p.BoardID, userID, req.Name, req.Prefix, req.Color, req.Description)
	if err != nil {
		if strings.Contains(err.Error(), "idx_projects_board_prefix") || strings.Contains(err.Error(), "idx_projects_user_prefix") {
			return nil, api.Conflict("prefix already in use")
		}
		return nil, api.Internal("create failed")
	}
	return created, nil
}

func (h *Handler) Update(ctx context.Context, req UpdateRequest) (*Project, error) {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)

	existing, err := h.store.GetByID(ctx, id)
	if err != nil || existing.UserID != userID {
		return nil, api.NotFound("project not found")
	}

	if req.Name == "" {
		req.Name = existing.Name
	}
	if req.Color == "" {
		req.Color = existing.Color
	}
	if req.Description == "" {
		req.Description = existing.Description
	}

	return h.store.Update(ctx, id, req.Name, req.Color, req.Description)
}

func (h *Handler) Delete(ctx context.Context) error {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)

	existing, err := h.store.GetByID(ctx, id)
	if err != nil || existing.UserID != userID {
		return api.NotFound("project not found")
	}

	if err := h.store.SoftDelete(ctx, id, userID); err != nil {
		return api.Internal("failed to delete project")
	}
	return nil
}

func (h *Handler) Restore(ctx context.Context) error {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)

	if err := h.store.RestoreProject(ctx, id, userID); err != nil {
		if msg, ok := IsPrefixConflict(err); ok {
			return api.Conflict(msg)
		}
		return api.Internal("failed to restore project")
	}
	return nil
}
