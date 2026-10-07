package item

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/board"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type CreateRequest struct {
	Title           string  `json:"title"`
	Description     string  `json:"description"`
	ProjectID       string  `json:"project_id"`
	EpicID          *string `json:"epic_id"`
	SprintID        *string `json:"sprint_id"`
	Priority        int     `json:"priority"`
	EstimateMinutes *int    `json:"estimate_minutes"`
}

type UpdateRequest struct {
	Title           string  `json:"title"`
	Description     string  `json:"description"`
	EpicID          *string `json:"epic_id"`
	SprintID        *string `json:"sprint_id"`
	ClearEpic       bool    `json:"clear_epic"`
	ClearSprint     bool    `json:"clear_sprint"`
	Priority        *int    `json:"priority"`
	EstimateMinutes *int    `json:"estimate_minutes"`
}

type MoveRequest struct {
	StatusID string `json:"status_id"`
}

type ReorderRequest struct {
	StatusID string   `json:"status_id"`
	IDs      []string `json:"ids"`
}

type ListResponse struct {
	Items []Item `json:"items"`
}

type TransitionsResponse struct {
	Transitions []StatusTransition `json:"transitions"`
}

type Handler struct {
	store      *Store
	boardStore *board.Store
}

func NewHandler(store *Store, boardStore *board.Store) *Handler {
	return &Handler{store: store, boardStore: boardStore}
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/items", h.listHTTP) // needs query param access
	r.Post("/api/items", api.Handle(h.Create))
	r.Get("/api/items/backlog", api.HandleNoBody(h.Backlog))
	r.Get("/api/items/{id}", api.HandleNoBody(h.Get))
	r.Patch("/api/items/{id}", api.Handle(h.Update))
	r.Delete("/api/items/{id}", api.HandleDelete(h.Delete))
	r.Post("/api/items/{id}/restore", api.HandleDelete(h.Restore))
	r.Post("/api/items/{id}/move", api.Handle(h.Move))
	r.Put("/api/items/reorder", api.Handle(h.Reorder))
	r.Get("/api/items/{id}/transitions", api.HandleNoBody(h.Transitions))
}

// listHTTP lists items for the authenticated user's board.
//
// @Summary      List items
// @Tags         items
// @Produce      json
// @Param        sprint_id  query   string  false  "Filter by sprint ID"
// @Success      200  {object}  item.ListResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/items [get]
func (h *Handler) listHTTP(w http.ResponseWriter, r *http.Request) {
	b, err := h.boardStore.GetByUser(r.Context(), auth.UserIDFromContext(r.Context()))
	if err != nil {
		api.WriteError(w, api.NotFound("board not found"))
		return
	}

	var sprintID *string
	if sid := r.URL.Query().Get("sprint_id"); sid != "" {
		sprintID = &sid
	}

	items, err := h.store.List(r.Context(), b.ID, sprintID)
	if err != nil {
		api.WriteError(w, api.Internal("failed to list items"))
		return
	}
	if items == nil {
		items = []Item{}
	}
	api.WriteJSON(w, &ListResponse{Items: items})
}

// Backlog returns all backlog items (not assigned to a sprint).
//
// @Summary      List backlog items
// @Tags         items
// @Produce      json
// @Success      200  {object}  item.ListResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/items/backlog [get]
func (h *Handler) Backlog(ctx context.Context) (*ListResponse, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	items, err := h.store.Backlog(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("failed to list backlog")
	}
	if items == nil {
		items = []Item{}
	}
	return &ListResponse{Items: items}, nil
}

// Get returns a single item by ID.
//
// @Summary      Get item
// @Tags         items
// @Produce      json
// @Param        id  path  string  true  "Item ID"
// @Success      200  {object}  item.Item
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/items/{id} [get]
func (h *Handler) Get(ctx context.Context) (*Item, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	it, err := h.store.GetByID(ctx, api.URLParam(ctx, "id"))
	if err != nil || it.BoardID != b.ID {
		return nil, api.NotFound("item not found")
	}
	return it, nil
}

// Create creates a new item on the board.
//
// @Summary      Create item
// @Tags         items
// @Accept       json
// @Produce      json
// @Param        body  body  item.CreateRequest  true  "Item to create"
// @Success      200  {object}  item.Item
// @Failure      400  {object}  api.ErrorResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/items [post]
func (h *Handler) Create(ctx context.Context, req CreateRequest) (*Item, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	if req.Title == "" {
		return nil, api.BadRequest("title required")
	}
	if req.ProjectID == "" {
		return nil, api.BadRequest("project_id required")
	}
	if req.Priority < 0 || req.Priority > 4 {
		req.Priority = 4
	}

	// F02: validate epic and sprint belong to this board
	if req.EpicID != nil && *req.EpicID != "" {
		ok, err := h.store.EpicBelongsToBoard(ctx, *req.EpicID, b.ID)
		if err != nil || !ok {
			return nil, api.BadRequest("epic_id is invalid")
		}
	}
	if req.SprintID != nil && *req.SprintID != "" {
		ok, err := h.store.SprintBelongsToBoard(ctx, *req.SprintID, b.ID)
		if err != nil || !ok {
			return nil, api.BadRequest("sprint_id is invalid")
		}
	}

	statusID, err := h.boardStore.InitialStatusID(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("no statuses configured")
	}

	// F01 + TX-001: CreateForProject atomically validates project ownership and increments seq in same tx
	it, err := h.store.CreateForProject(ctx, b.ID, req.ProjectID, statusID, req.Title, req.Description,
		req.EpicID, req.SprintID, req.Priority, req.EstimateMinutes)
	if err != nil {
		if strings.Contains(err.Error(), "project not found") {
			return nil, api.BadRequest("invalid project_id or project not accessible")
		}
		return nil, api.Internal("failed to create item")
	}
	return it, nil
}

// UpdateRequest uses explicit sentinel fields so callers can clear epic/sprint.
// ClearEpic=true → set epic_id to NULL. ClearSprint=true → set sprint_id to NULL.
// Priority uses -1 as "not provided" sentinel (valid range 0–4).
type updateParsed struct {
	title       string
	description string
	epicID      *string
	sprintID    *string
	priority    int
	estimate    *int
}

// Update updates an existing item.
//
// @Summary      Update item
// @Tags         items
// @Accept       json
// @Produce      json
// @Param        id    path  string            true  "Item ID"
// @Param        body  body  item.UpdateRequest  true  "Fields to update"
// @Success      200  {object}  item.Item
// @Failure      400  {object}  api.ErrorResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/items/{id} [patch]
func (h *Handler) Update(ctx context.Context, req UpdateRequest) (*Item, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	it, err := h.store.GetByID(ctx, api.URLParam(ctx, "id"))
	if err != nil || it.BoardID != b.ID {
		return nil, api.NotFound("item not found")
	}

	p := updateParsed{
		title:       it.Title,
		description: it.Description,
		epicID:      it.EpicID,
		sprintID:    it.SprintID,
		priority:    it.Priority,
		estimate:    it.EstimateMinutes,
	}
	if req.Title != "" {
		p.title = req.Title
	}
	if req.Description != "" {
		p.description = req.Description
	}
	// ClearEpic explicitly sets epic to null; otherwise keep existing or set new value
	if req.ClearEpic {
		p.epicID = nil
	} else if req.EpicID != nil {
		ok, err := h.store.EpicBelongsToBoard(ctx, *req.EpicID, b.ID)
		if err != nil || !ok {
			return nil, api.BadRequest("epic_id is invalid")
		}
		p.epicID = req.EpicID
	}
	if req.ClearSprint {
		p.sprintID = nil
	} else if req.SprintID != nil {
		ok, err := h.store.SprintBelongsToBoard(ctx, *req.SprintID, b.ID)
		if err != nil || !ok {
			return nil, api.BadRequest("sprint_id is invalid")
		}
		p.sprintID = req.SprintID
	}
	if req.Priority != nil && *req.Priority >= 0 && *req.Priority <= 4 {
		p.priority = *req.Priority
	}
	if req.EstimateMinutes != nil {
		p.estimate = req.EstimateMinutes
	}

	return h.store.Update(ctx, it.ID, p.title, p.description, p.epicID, p.sprintID, p.priority, p.estimate)
}

// Delete soft-deletes an item.
//
// @Summary      Delete item
// @Tags         items
// @Param        id  path  string  true  "Item ID"
// @Success      204  "No Content"
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/items/{id} [delete]
func (h *Handler) Delete(ctx context.Context) error {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return api.NotFound("board not found")
	}

	it, err := h.store.GetByID(ctx, api.URLParam(ctx, "id"))
	if err != nil || it.BoardID != b.ID {
		return api.NotFound("item not found")
	}

	return h.store.SoftDelete(ctx, it.ID)
}

// Restore restores a soft-deleted item.
//
// @Summary      Restore item
// @Tags         items
// @Param        id  path  string  true  "Item ID"
// @Success      204  "No Content"
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/items/{id}/restore [post]
func (h *Handler) Restore(ctx context.Context) error {
	id := api.URLParam(ctx, "id")
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return api.NotFound("board not found")
	}
	if err := h.store.Restore(ctx, id, b.ID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return api.NotFound("item not found")
		}
		return api.Internal("failed to restore item")
	}
	return nil
}

// Move moves an item to a different status column.
//
// @Summary      Move item
// @Tags         items
// @Accept       json
// @Produce      json
// @Param        id    path  string          true  "Item ID"
// @Param        body  body  item.MoveRequest  true  "Target status"
// @Success      200  {object}  item.Item
// @Failure      400  {object}  api.ErrorResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/items/{id}/move [post]
func (h *Handler) Move(ctx context.Context, req MoveRequest) (*Item, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	it, err := h.store.GetByID(ctx, api.URLParam(ctx, "id"))
	if err != nil || it.BoardID != b.ID {
		return nil, api.NotFound("item not found")
	}

	if req.StatusID == "" {
		return nil, api.BadRequest("status_id required")
	}

	// Validate target status belongs to same board
	statuses, err := h.boardStore.ListStatuses(ctx, b.ID)
	if err != nil {
		return nil, api.Internal("failed to validate status")
	}
	validStatus := false
	for _, s := range statuses {
		if s.ID == req.StatusID {
			validStatus = true
			break
		}
	}
	if !validStatus {
		return nil, api.BadRequest("status_id does not belong to this board")
	}

	return h.store.Move(ctx, it.ID, req.StatusID)
}

// Reorder reorders items within a status column.
//
// @Summary      Reorder items
// @Tags         items
// @Accept       json
// @Produce      json
// @Param        body  body  item.ReorderRequest  true  "Status and ordered item IDs"
// @Success      200  {object}  item.ListResponse
// @Failure      400  {object}  api.ErrorResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/items/reorder [put]
func (h *Handler) Reorder(ctx context.Context, req ReorderRequest) (*ListResponse, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	if req.StatusID == "" || len(req.IDs) == 0 {
		return nil, api.BadRequest("status_id and ids required")
	}

	if err := h.store.Reorder(ctx, b.ID, req.StatusID, req.IDs); err != nil {
		return nil, api.Internal("reorder failed")
	}

	items, err := h.store.List(ctx, b.ID, nil)
	if err != nil {
		return nil, api.Internal("failed to list items after reorder")
	}
	if items == nil {
		items = []Item{}
	}
	return &ListResponse{Items: items}, nil
}

// Transitions returns available status transitions for an item.
//
// @Summary      List item transitions
// @Tags         items
// @Produce      json
// @Param        id  path  string  true  "Item ID"
// @Success      200  {object}  item.TransitionsResponse
// @Failure      404  {object}  api.ErrorResponse
// @Security     CookieAuth
// @Router       /api/items/{id}/transitions [get]
func (h *Handler) Transitions(ctx context.Context) (*TransitionsResponse, error) {
	b, err := h.boardStore.GetByUser(ctx, auth.UserIDFromContext(ctx))
	if err != nil {
		return nil, api.NotFound("board not found")
	}

	it, err := h.store.GetByID(ctx, api.URLParam(ctx, "id"))
	if err != nil || it.BoardID != b.ID {
		return nil, api.NotFound("item not found")
	}

	transitions, err := h.store.Transitions(ctx, it.ID)
	if err != nil {
		return nil, api.Internal("failed to list transitions")
	}
	if transitions == nil {
		transitions = []StatusTransition{}
	}
	return &TransitionsResponse{Transitions: transitions}, nil
}
