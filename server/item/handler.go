package item

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/ashinsabu/cumin/server/api"
	"github.com/ashinsabu/cumin/server/auth"
	"github.com/ashinsabu/cumin/server/board"
	"github.com/ashinsabu/cumin/server/project"
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
	store        *Store
	boardStore   *board.Store
	projectStore *project.Store
}

func NewHandler(store *Store, boardStore *board.Store, projectStore *project.Store) *Handler {
	return &Handler{store: store, boardStore: boardStore, projectStore: projectStore}
}

func (h *Handler) Routes(r chi.Router) {
	r.Get("/api/items", h.listHTTP)
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

func (h *Handler) listHTTP(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		api.WriteError(w, api.NotFound("user not found"))
		return
	}

	q := r.URL.Query()
	f := FilterParams{}

	if sid := q.Get("sprint_id"); sid != "" {
		f.SprintID = &sid
	}
	if pid := q.Get("project_id"); pid != "" {
		f.ProjectID = &pid
	}
	if eid := q.Get("epic_id"); eid != "" {
		f.EpicID = &eid
	}
	if sid := q.Get("status_id"); sid != "" {
		f.StatusID = &sid
	}
	if pr := q.Get("priority"); pr != "" {
		if p, err := strconv.Atoi(pr); err == nil {
			f.Priority = &p
		}
	}
	f.HideDone = q.Get("hide_done") == "true"

	items, err := h.store.List(r.Context(), userID, f)
	if err != nil {
		api.WriteError(w, api.Internal("failed to list items"))
		return
	}
	if items == nil {
		items = []Item{}
	}
	api.WriteJSON(w, &ListResponse{Items: items})
}

func (h *Handler) Backlog(ctx context.Context) (*ListResponse, error) {
	userID := auth.UserIDFromContext(ctx)
	if userID == "" {
		return nil, api.NotFound("user not found")
	}

	items, err := h.store.Backlog(ctx, userID)
	if err != nil {
		return nil, api.Internal("failed to list backlog")
	}
	if items == nil {
		items = []Item{}
	}
	return &ListResponse{Items: items}, nil
}

func (h *Handler) Get(ctx context.Context) (*Item, error) {
	userID := auth.UserIDFromContext(ctx)
	it, err := h.store.GetByIDForUser(ctx, api.URLParam(ctx, "id"), userID)
	if err != nil {
		return nil, api.NotFound("item not found")
	}
	return it, nil
}

func (h *Handler) Create(ctx context.Context, req CreateRequest) (*Item, error) {
	userID := auth.UserIDFromContext(ctx)
	if userID == "" {
		return nil, api.NotFound("user not found")
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

	// Validate project belongs to user before any DB writes.
	proj, err := h.projectStore.GetByID(ctx, req.ProjectID)
	if err != nil || proj.UserID != userID {
		return nil, api.BadRequest("project_id is invalid")
	}

	if req.EpicID != nil && *req.EpicID != "" {
		ok, err := h.store.EpicBelongsToUser(ctx, *req.EpicID, userID)
		if err != nil || !ok {
			return nil, api.BadRequest("epic_id is invalid")
		}
	}
	if req.SprintID != nil && *req.SprintID != "" {
		ok, err := h.store.SprintBelongsToProject(ctx, *req.SprintID, req.ProjectID)
		if err != nil || !ok {
			return nil, api.BadRequest("sprint_id is invalid")
		}
	}

	statusID, err := h.boardStore.InitialStatusID(ctx, userID)
	if err != nil {
		return nil, api.Internal("no statuses configured")
	}

	it, err := h.store.CreateForProject(ctx, proj.BoardID, req.ProjectID, userID, statusID, req.Title, req.Description,
		req.EpicID, req.SprintID, req.Priority, req.EstimateMinutes)
	if err != nil {
		return nil, api.Internal("failed to create item")
	}
	return it, nil
}

type updateParsed struct {
	title       string
	description string
	epicID      *string
	sprintID    *string
	priority    int
	estimate    *int
}

func (h *Handler) Update(ctx context.Context, req UpdateRequest) (*Item, error) {
	userID := auth.UserIDFromContext(ctx)

	it, err := h.store.GetByIDForUser(ctx, api.URLParam(ctx, "id"), userID)
	if err != nil {
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
	if req.ClearEpic {
		p.epicID = nil
	} else if req.EpicID != nil {
		ok, err := h.store.EpicBelongsToUser(ctx, *req.EpicID, userID)
		if err != nil || !ok {
			return nil, api.BadRequest("epic_id is invalid")
		}
		p.epicID = req.EpicID
	}
	if req.ClearSprint {
		p.sprintID = nil
	} else if req.SprintID != nil {
		if it.ProjectID != nil {
			ok, err := h.store.SprintBelongsToProject(ctx, *req.SprintID, *it.ProjectID)
			if err != nil || !ok {
				return nil, api.BadRequest("sprint_id is invalid")
			}
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

func (h *Handler) Delete(ctx context.Context) error {
	userID := auth.UserIDFromContext(ctx)

	it, err := h.store.GetByIDForUser(ctx, api.URLParam(ctx, "id"), userID)
	if err != nil {
		return api.NotFound("item not found")
	}

	return h.store.SoftDelete(ctx, it.ID)
}

func (h *Handler) Restore(ctx context.Context) error {
	id := api.URLParam(ctx, "id")
	userID := auth.UserIDFromContext(ctx)
	if err := h.store.Restore(ctx, id, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return api.NotFound("item not found")
		}
		return api.Internal("failed to restore item")
	}
	return nil
}

func (h *Handler) Move(ctx context.Context, req MoveRequest) (*Item, error) {
	userID := auth.UserIDFromContext(ctx)

	it, err := h.store.GetByIDForUser(ctx, api.URLParam(ctx, "id"), userID)
	if err != nil {
		return nil, api.NotFound("item not found")
	}

	if req.StatusID == "" {
		return nil, api.BadRequest("status_id required")
	}

	statuses, err := h.boardStore.ListStatuses(ctx, userID)
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
		return nil, api.BadRequest("status_id does not belong to this user")
	}

	return h.store.Move(ctx, it.ID, req.StatusID)
}

func (h *Handler) Reorder(ctx context.Context, req ReorderRequest) (*ListResponse, error) {
	userID := auth.UserIDFromContext(ctx)
	if userID == "" {
		return nil, api.NotFound("user not found")
	}

	if req.StatusID == "" || len(req.IDs) == 0 {
		return nil, api.BadRequest("status_id and ids required")
	}

	if err := h.store.Reorder(ctx, userID, req.StatusID, req.IDs); err != nil {
		return nil, api.Internal("reorder failed")
	}

	items, err := h.store.List(ctx, userID, FilterParams{})
	if err != nil {
		return nil, api.Internal("failed to list items after reorder")
	}
	if items == nil {
		items = []Item{}
	}
	return &ListResponse{Items: items}, nil
}

func (h *Handler) Transitions(ctx context.Context) (*TransitionsResponse, error) {
	userID := auth.UserIDFromContext(ctx)

	it, err := h.store.GetByIDForUser(ctx, api.URLParam(ctx, "id"), userID)
	if err != nil {
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
