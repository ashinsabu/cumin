package board

import (
	"context"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
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

func (h *Handler) Get(ctx context.Context) (*Board, error) {
	b, err := h.store.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}
	return b, nil
}

func (h *Handler) Update(ctx context.Context, req UpdateRequest) (*Board, error) {
	b, err := h.store.GetByUser(ctx, auth.UserIDFromContext(ctx))
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

func (h *Handler) ListStatuses(ctx context.Context) (*StatusListResponse, error) {
	b, err := h.store.GetByUser(ctx, auth.UserIDFromContext(ctx))
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

func (h *Handler) CreateStatus(ctx context.Context, req CreateStatusRequest) (*Status, error) {
	b, err := h.store.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	if req.Name == "" {
		return nil, api.BadRequest("name required")
	}

	st, err := h.store.CreateStatus(ctx, b.ID, req.Name, req.Position, req.IsInitial, req.IsDone)
	if err != nil {
		return nil, api.Internal("create status failed")
	}
	return st, nil
}

func (h *Handler) DeleteStatus(ctx context.Context) error {
	b, err := h.store.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return api.NotFound("board not found")
	}

	id := api.URLParam(ctx, "id")

	// Guard: cannot delete the last done or initial status (spillover and item creation break)
	statuses, err := h.store.ListStatuses(ctx, b.ID)
	if err != nil {
		return api.Internal("failed to check statuses")
	}
	var target *Status
	doneCount, initialCount := 0, 0
	for i := range statuses {
		if statuses[i].ID == id {
			target = &statuses[i]
		}
		if statuses[i].IsDone {
			doneCount++
		}
		if statuses[i].IsInitial {
			initialCount++
		}
	}
	if target == nil {
		return api.NotFound("status not found")
	}
	if target.IsDone && doneCount == 1 {
		return api.Conflict("cannot delete the last done status")
	}
	if target.IsInitial && initialCount == 1 {
		return api.Conflict("cannot delete the last initial status")
	}

	return h.store.DeleteStatusForBoard(ctx, id, b.ID)
}

func (h *Handler) ReorderStatuses(ctx context.Context, req ReorderStatusesRequest) (*StatusListResponse, error) {
	b, err := h.store.GetByUser(ctx, auth.UserIDFromContext(ctx))
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
