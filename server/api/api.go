package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	applogger "github.com/ashinsabu/cumin/server/logger"
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
func Handle[Req any, Res any](fn func(ctx context.Context, req Req) (*Res, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req Req
		if r.Body != nil && r.ContentLength != 0 {
			r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				applogger.FromContext(r.Context()).Warn("api: bad request body",
					slog.String("path", r.URL.Path),
					slog.Any("err", err),
				)
				WriteError(w, BadRequest("invalid request body"))
				return
			}
		}

		ctx := r.Context()
		res, err := fn(ctx, req)
		if err != nil {
			if apiErr, ok := err.(*Error); ok {
				if apiErr.Status >= 500 {
					applogger.FromContext(ctx).Error("api: internal error",
						slog.String("path", r.URL.Path),
						slog.String("message", apiErr.Message),
					)
				}
				WriteError(w, apiErr)
			} else {
				applogger.FromContext(ctx).Error("api: unhandled error",
					slog.String("path", r.URL.Path),
					slog.Any("err", err),
				)
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
				if apiErr.Status >= 500 {
					applogger.FromContext(r.Context()).Error("api: internal error",
						slog.String("path", r.URL.Path),
						slog.String("message", apiErr.Message),
					)
				}
				WriteError(w, apiErr)
			} else {
				applogger.FromContext(r.Context()).Error("api: unhandled error",
					slog.String("path", r.URL.Path),
					slog.Any("err", err),
				)
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
				if apiErr.Status >= 500 {
					applogger.FromContext(r.Context()).Error("api: internal error",
						slog.String("path", r.URL.Path),
						slog.String("message", apiErr.Message),
					)
				}
				WriteError(w, apiErr)
			} else {
				applogger.FromContext(r.Context()).Error("api: unhandled error",
					slog.String("path", r.URL.Path),
					slog.Any("err", err),
				)
				WriteError(w, Internal("internal error"))
			}
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// URLParam extracts a chi URL parameter from context.
func URLParam(ctx context.Context, key string) string {
	if r := chi.RouteContext(ctx); r != nil {
		return r.URLParam(key)
	}
	return ""
}

func WriteError(w http.ResponseWriter, err *Error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(err.Status)
	json.NewEncoder(w).Encode(err)
}

func WriteJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
