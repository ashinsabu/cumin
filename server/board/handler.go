package board

import (
	"context"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/go-chi/chi/v5"
)

type UpdateRequest struct {
	Name                    string `json:"name"`
	SprintCadenceDays       int    `json:"sprint_cadence_days"`
	SprintStartDay          int    `json:"sprint_start_day"`
	AvailableHoursPerSprint int    `json:"available_hours_per_sprint"`
}

type CreateStatusRequest struct {
	Name      string `json:"name"`
	Position  int    `json:"position"`
	IsInitial bool   `json:"is_initial"`
	IsDone    bool   `json:"is_done"`
}

type ReorderStatusesRequest struct {
	IDs []string `json:"ids"`
}

type StatusListResponse struct {
	Statuses []Status `json:"statuses"`
}

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/board", api.HandleNoBody(h.Get))
	r.Patch("/api/board", api.Handle(h.Update))
	r.Get("/api/board/statuses", api.HandleNoBody(h.ListStatuses))
	r.Post("/api/board/statuses", api.Handle(h.CreateStatus))
	r.Delete("/api/board/statuses/{id}", api.HandleDelete(h.DeleteStatus))
	r.Put("/api/board/statuses/reorder", api.Handle(h.ReorderStatuses))
}

// Get returns the authenticated user's board configuration.
//
// @Summary      Get board
// @Tags         board
// @Produce      json
// @Success      200  {object}  board.Board
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/board [get]
func (h *Handler) Get(ctx context.Context) (*Board, error) {
	b, err := GetOrFetch(ctx, h.store)
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	return b, nil
}

// Update updates the board configuration.
//
// @Summary      Update board
// @Tags         board
// @Accept       json
// @Produce      json
// @Param        body  body  board.UpdateRequest  true  "Board settings to update"
// @Success      200  {object}  board.Board
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/board [patch]
func (h *Handler) Update(ctx context.Context, req UpdateRequest) (*Board, error) {
	b, err := GetOrFetch(ctx, h.store)
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	if req.Name == "" {
		req.Name = b.Name
	}
	if req.SprintCadenceDays == 0 {
		req.SprintCadenceDays = b.SprintCadenceDays
	}
	if req.SprintStartDay == 0 {
		req.SprintStartDay = b.SprintStartDay
	}
	if req.AvailableHoursPerSprint == 0 {
		req.AvailableHoursPerSprint = b.AvailableHoursPerSprint
	}

	updated, err := h.store.Update(ctx, b.ID, req.Name, req.SprintCadenceDays, req.SprintStartDay, req.AvailableHoursPerSprint)
	if err != nil {
		return nil, api.Internal("update failed")
	}
	return updated, nil
}

// ListStatuses returns all statuses for the board.
//
// @Summary      List board statuses
// @Tags         board
// @Produce      json
// @Success      200  {object}  board.StatusListResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/board/statuses [get]
func (h *Handler) ListStatuses(ctx context.Context) (*StatusListResponse, error) {
	b, err := GetOrFetch(ctx, h.store)
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	statuses, err := h.store.ListStatuses(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("failed to list statuses")
	}
	if statuses == nil {
		statuses = []Status{}
	}
	return &StatusListResponse{Statuses: statuses}, nil
}

// CreateStatus adds a new status column to the board.
//
// @Summary      Create board status
// @Tags         board
// @Accept       json
// @Produce      json
// @Param        body  body  board.CreateStatusRequest  true  "Status to create"
// @Success      200  {object}  board.Status
// @Failure      400  {object}  api.ErrorResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/board/statuses [post]
func (h *Handler) CreateStatus(ctx context.Context, req CreateStatusRequest) (*Status, error) {
	b, err := GetOrFetch(ctx, h.store)
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	if req.Name == "" {
		return nil, api.BadRequest("name required")
	}

	st, err := h.store.CreateStatus(ctx, b.ID, b.UserID, req.Name, req.Position, req.IsInitial, req.IsDone)
	if err != nil {
		return nil, api.Internal("create status failed")
	}
	return st, nil
}

// DeleteStatus removes a status column from the board (fails if items are in it).
//
// @Summary      Delete board status
// @Tags         board
// @Param        id  path  string  true  "Status ID"
// @Success      204  "No Content"
// @Failure      404  {object}  api.ErrorResponse
// @Failure      409  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/board/statuses/{id} [delete]
func (h *Handler) DeleteStatus(ctx context.Context) error {
	b, err := GetOrFetch(ctx, h.store)
	if err != nil {
		return api.NotFound("board not found")
	}

	id := api.URLParam(ctx, "id")

	if err := h.store.DeleteStatusSafe(ctx, id, b.ID); err != nil {
		switch err.(type) {
		case *notFoundErr:
			return api.NotFound(err.Error())
		case *conflictErr:
			return api.Conflict(err.Error())
		default:
			return api.Internal("delete status failed")
		}
	}
	return nil
}

// ReorderStatuses sets the display order of status columns.
//
// @Summary      Reorder board statuses
// @Tags         board
// @Accept       json
// @Produce      json
// @Param        body  body  board.ReorderStatusesRequest  true  "Ordered status IDs"
// @Success      200  {object}  board.StatusListResponse
// @Failure      400  {object}  api.ErrorResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/board/statuses/reorder [put]
func (h *Handler) ReorderStatuses(ctx context.Context, req ReorderStatusesRequest) (*StatusListResponse, error) {
	b, err := GetOrFetch(ctx, h.store)
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	if len(req.IDs) == 0 {
		return nil, api.BadRequest("ids required")
	}

	if err := h.store.ReorderStatuses(ctx, b.ID, req.IDs); err != nil {
		return nil, api.Internal("reorder failed")
	}

	statuses, _ := h.store.ListStatuses(ctx, b.ID)
	if statuses == nil {
		statuses = []Status{}
	}
	return &StatusListResponse{Statuses: statuses}, nil
}
