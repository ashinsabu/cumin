package project

import (
	"context"
	"strings"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/board"
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
	store      *Store
	boardStore *board.Store
}

func NewHandler(store *Store, boardStore *board.Store) *Handler {
	return &Handler{store: store, boardStore: boardStore}
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/projects", api.HandleNoBody(h.List))
	r.Post("/api/projects", api.Handle(h.Create))
	r.Patch("/api/projects/{id}", api.Handle(h.Update))
	r.Delete("/api/projects/{id}", api.HandleDelete(h.Delete))
}

func (h *Handler) List(ctx context.Context) (*ListResponse, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	projects, err := h.store.List(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("failed to list projects")
	}
	if projects == nil {
		projects = []Project{}
	}
	return &ListResponse{Projects: projects}, nil
}

func (h *Handler) Create(ctx context.Context, req CreateRequest) (*Project, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

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

	p, err := h.store.Create(ctx, b.ID, req.Name, req.Prefix, req.Color, req.Description)
	if err != nil {
		if strings.Contains(err.Error(), "idx_projects_board_prefix") {
			return nil, api.Conflict("prefix already in use")
		}
		return nil, api.Internal("create failed")
	}
	return p, nil
}

func (h *Handler) Update(ctx context.Context, req UpdateRequest) (*Project, error) {
	id := api.URLParam(ctx, "id")

	existing, err := h.store.GetByID(ctx, id)
	if err != nil {
		return nil, api.NotFound("project not found")
	}

	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil || existing.BoardID != b.ID {
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

	existing, err := h.store.GetByID(ctx, id)
	if err != nil {
		return api.NotFound("project not found")
	}

	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil || existing.BoardID != b.ID {
		return api.NotFound("project not found")
	}

	return h.store.Delete(ctx, id)
}
