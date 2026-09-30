#!/usr/bin/env bash
# One-shot local dev: DB (docker) + Go server + Vite frontend
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── DB ──────────────────────────────────────────────────────────────────────
echo "▸ Starting DB..."
docker compose up -d db
# Wait until postgres accepts connections
until docker compose exec -T db pg_isready -U cumin -q 2>/dev/null; do
  sleep 0.5
done
echo "  DB ready"

# ── Backend ─────────────────────────────────────────────────────────────────
echo "▸ Starting Go server (port 8080)..."
cd "$ROOT/server"
go run ./cmd/cumin/main.go &
SERVER_PID=$!

# ── Frontend ────────────────────────────────────────────────────────────────
echo "▸ Starting Vite (port 3000)..."
cd "$ROOT/ui"
npm run dev &
UI_PID=$!

echo ""
echo "  ✓ Board:   http://localhost:3000"
echo "  ✓ API:     http://localhost:8080/healthz"
echo "  Press Ctrl-C to stop all."
echo ""

# Shutdown all on Ctrl-C
trap 'echo ""; echo "Stopping..."; kill $SERVER_PID $UI_PID 2>/dev/null; docker compose stop db; exit 0' INT TERM

wait $SERVER_PID $UI_PID
