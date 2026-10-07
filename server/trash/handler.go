package trash

import (
	"context"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/board"
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
	boardStore   *board.Store
}

func NewHandler(projectStore *project.Store, epicStore *epic.Store, boardStore *board.Store) *Handler {
	return &Handler{projectStore: projectStore, epicStore: epicStore, boardStore: boardStore}
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/trash", api.HandleNoBody(h.List))
	r.Delete("/api/trash", api.HandleDelete(h.Empty))
}

// List returns all soft-deleted projects and epics in the board's trash.
//
// @Summary      List trash
// @Tags         trash
// @Produce      json
// @Success      200  {object}  trash.TrashResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/trash [get]
func (h *Handler) List(ctx context.Context) (*TrashResponse, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	projects, err := h.projectStore.ListTrash(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("failed to list trash")
	}
	if projects == nil {
		projects = []project.TrashProject{}
	}

	epics, err := h.epicStore.ListTrashEpics(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("failed to list trash")
	}
	if epics == nil {
		epics = []epic.TrashEpic{}
	}

	return &TrashResponse{Projects: projects, Epics: epics}, nil
}

// Empty permanently deletes all items in the board's trash.
//
// @Summary      Empty trash
// @Tags         trash
// @Success      204  "No Content"
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/trash [delete]
func (h *Handler) Empty(ctx context.Context) error {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return api.NotFound("board not found")
	}

	if err := h.projectStore.EmptyTrash(ctx, b.ID); err != nil {
		return api.Internal("failed to empty trash")
	}
	return nil
}
