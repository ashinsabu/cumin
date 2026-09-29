package api

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type Error struct {
	Status  int    `json:"-"`
	Message string `json:"error"`
}

func (e *Error) Error() string { return e.Message }

func BadRequest(msg string) *Error  { return &Error{Status: http.StatusBadRequest, Message: msg} }
func NotFound(msg string) *Error    { return &Error{Status: http.StatusNotFound, Message: msg} }
func Conflict(msg string) *Error    { return &Error{Status: http.StatusConflict, Message: msg} }
func Internal(msg string) *Error    { return &Error{Status: http.StatusInternalServerError, Message: msg} }

// Handle wraps a typed handler into an http.HandlerFunc.
// The handler receives a decoded request and returns a response or error.
func Handle[Req any, Res any](fn func(ctx context.Context, req Req) (*Res, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req Req
		if r.Body != nil && r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				WriteError(w, BadRequest("invalid request body"))
				return
			}
		}

		// Inject URL params into context for handlers to access
		ctx := r.Context()
		res, err := fn(ctx, req)
		if err != nil {
			if apiErr, ok := err.(*Error); ok {
				WriteError(w, apiErr)
			} else {
				WriteError(w, Internal("internal error"))
			}
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(res)
	}
}

// HandleNoBody wraps a handler that takes no request body (GET/DELETE).
func HandleNoBody[Res any](fn func(ctx context.Context) (*Res, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		res, err := fn(r.Context())
		if err != nil {
			if apiErr, ok := err.(*Error); ok {
				WriteError(w, apiErr)
			} else {
				WriteError(w, Internal("internal error"))
			}
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(res)
	}
}

// HandleDelete wraps a handler that returns no body (204).
func HandleDelete(fn func(ctx context.Context) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(r.Context()); err != nil {
			if apiErr, ok := err.(*Error); ok {
				WriteError(w, apiErr)
			} else {
				WriteError(w, Internal("internal error"))
			}
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// URLParam extracts a chi URL parameter from context.
func URLParam(ctx context.Context, key string) string {
	// chi stores route params in the request context
	if r := chi.RouteContext(ctx); r != nil {
		return r.URLParam(key)
	}
	return ""
}

// QueryParam extracts a query parameter. Requires http.Request — use from Handle wrapper.
// For now, handlers that need query params use the raw pattern.

func WriteError(w http.ResponseWriter, err *Error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(err.Status)
	json.NewEncoder(w).Encode(err)
}

func WriteJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
