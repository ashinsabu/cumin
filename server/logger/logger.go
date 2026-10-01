package logger

import (
	"context"
	"log/slog"
	"os"
)

type contextKey struct{}

// Setup initialises the default slog handler. Call once from main.
// Outputs JSON to stdout. Level is INFO unless LOG_LEVEL=debug.
func Setup() {
	level := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		level = slog.LevelDebug
	}
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	slog.SetDefault(slog.New(h))
}

// With returns ctx with the given logger stored in it.
func With(ctx context.Context, l *slog.Logger) context.Context {
	return context.WithValue(ctx, contextKey{}, l)
}

// FromContext returns the logger stored in ctx, or slog.Default().
func FromContext(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(contextKey{}).(*slog.Logger); ok {
		return l
	}
	return slog.Default()
}
