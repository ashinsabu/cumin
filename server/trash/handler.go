package trash

import (
	"context"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/epic"
	"github.com/ashinsabu/cumin/server/project"
	"github.com/go-chi/chi/v5"
)

type TrashResponse struct {
	Projects []project.TrashProject `json:"projects"`
	Epics    []epic.TrashEpic       `json:"epics"`
}

type Handler struct {
	projectStore *project.Store
	epicStore    *epic.Store
}

func NewHandler(projectStore *project.Store, epicStore *epic.Store) *Handler {
	return &Handler{projectStore: projectStore, epicStore: epicStore}
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/trash", api.HandleNoBody(h.List))
	r.Delete("/api/trash", api.HandleDelete(h.Empty))
}

func (h *Handler) List(ctx context.Context) (*TrashResponse, error) {
	userID := auth.UserIDFromContext(ctx)

	projects, err := h.projectStore.ListTrash(ctx, userID)
	if err != nil {
		return nil, api.Internal("failed to list trash")
	}
	if projects == nil {
		projects = []project.TrashProject{}
	}

	epics, err := h.epicStore.ListTrashEpics(ctx, userID)
	if err != nil {
		return nil, api.Internal("failed to list trash")
	}
	if epics == nil {
		epics = []epic.TrashEpic{}
	}

	return &TrashResponse{Projects: projects, Epics: epics}, nil
}

func (h *Handler) Empty(ctx context.Context) error {
	userID := auth.UserIDFromContext(ctx)

	if err := h.projectStore.EmptyTrash(ctx, userID); err != nil {
		return api.Internal("failed to empty trash")
	}
	return nil
}
