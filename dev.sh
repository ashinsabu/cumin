#!/usr/bin/env bash
# Idempotent local dev: exactly one instance of DB + Go server + Vite.
# Logs written to tmp/server.log and tmp/ui.log (truncated each run, gitignored).
# Usage: ./dev.sh  or  make dev  (from server/)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/tmp"
SERVER_LOG="$LOG_DIR/server.log"
UI_LOG="$LOG_DIR/ui.log"

mkdir -p "$LOG_DIR"

# ── Helpers ─────────────────────────────────────────────────────────────────
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null) || true
  if [ -n "$pids" ]; then
    echo "  Killing stale process(es) on :$port (pids: $pids)"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.3
  fi
}

# ── Tear down any stale instances ────────────────────────────────────────────
echo "▸ Cleaning up stale processes..."
pkill -f "go run ./cmd/cumin" 2>/dev/null || true
pkill -f "cmd/cumin/main.go" 2>/dev/null || true
kill_port 8080
kill_port 3000

# ── Truncate logs (fresh run, no accumulation) ───────────────────────────────
: > "$SERVER_LOG"
: > "$UI_LOG"

# ── DB ──────────────────────────────────────────────────────────────────────
echo "▸ Ensuring DB is up..."
docker compose up -d db
until docker compose exec -T db pg_isready -U cumin -q 2>/dev/null; do
  sleep 0.3
done
echo "  DB ready"

# ── Backend ─────────────────────────────────────────────────────────────────
echo "▸ Starting Go server (port 8080) — logs → tmp/server.log"
cd "$ROOT/server"
go run ./cmd/cumin/main.go >> "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

# Wait until healthy before starting UI.
for i in $(seq 1 40); do
  if curl -sf http://localhost:8080/healthz > /dev/null 2>&1; then
    echo "  Server ready (pid $SERVER_PID)"
    break
  fi
  # Surface startup errors early so the user isn't waiting blind.
  if [ $i -eq 10 ]; then
    echo "  (server still starting — last log line: $(tail -1 "$SERVER_LOG" 2>/dev/null || echo 'none'))"
  fi
  sleep 0.5
  if [ $i -eq 40 ]; then
    echo ""
    echo "ERROR: server didn't become healthy after 20s. Last lines:"
    tail -20 "$SERVER_LOG"
    kill $SERVER_PID 2>/dev/null
    exit 1
  fi
done

# ── Frontend ─────────────────────────────────────────────────────────────────
echo "▸ Starting Vite (port 3000) — logs → tmp/ui.log"
cd "$ROOT/ui"
npm run dev >> "$UI_LOG" 2>&1 &
UI_PID=$!

echo ""
echo "  ✓ Board:   http://localhost:3000"
echo "  ✓ API:     http://localhost:8080/healthz"
echo "  ✓ Logs:    tail -f tmp/server.log  |  tail -f tmp/ui.log"
echo "  Press Ctrl-C to stop all."
echo ""
echo "━━━ server logs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Cleanup on exit ──────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Stopping..."
  kill $SERVER_PID $UI_PID 2>/dev/null || true
  docker compose stop db
  exit 0
}
trap cleanup INT TERM

# Stream server logs to the terminal (the interesting ones — filter noise).
tail -f "$SERVER_LOG" &
TAIL_PID=$!
trap "cleanup; kill $TAIL_PID 2>/dev/null" INT TERM

wait $SERVER_PID $UI_PID
