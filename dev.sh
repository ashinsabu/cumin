#!/usr/bin/env bash
# Idempotent local dev: exactly one instance of DB + Go server + Vite.
# Safe to run on any machine with: Go, Node/npm, Docker.
# Logs → tmp/server.log + tmp/ui.log (truncated each run, gitignored).
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

wait_for() {
  local url=$1 label=$2 max_wait=$3
  for i in $(seq 1 $((max_wait * 2))); do
    if curl -sf "$url" > /dev/null 2>&1; then
      echo "  $label ready"
      return 0
    fi
    if [ $((i % 10)) -eq 0 ]; then
      echo "  ($label still starting…)"
    fi
    sleep 0.5
  done
  echo ""
  echo "ERROR: $label didn't become ready in ${max_wait}s"
  return 1
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
echo "▸ Starting Go server (port 8080)…"
cd "$ROOT/server"
go run ./cmd/cumin/main.go >> "$SERVER_LOG" 2>&1 &
SERVER_PID=$!

if ! wait_for "http://localhost:8080/healthz" "Server" 20; then
  echo "Last server log lines:"
  tail -20 "$SERVER_LOG"
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

# ── Frontend ─────────────────────────────────────────────────────────────────
echo "▸ Starting Vite (port 3000)…"
cd "$ROOT/ui"
npm run dev >> "$UI_LOG" 2>&1 &
UI_PID=$!

if ! wait_for "http://localhost:3000" "UI" 30; then
  echo "Last UI log lines:"
  tail -20 "$UI_LOG"
  kill $SERVER_PID $UI_PID 2>/dev/null
  exit 1
fi

echo ""
echo "  ✓ Board:   http://localhost:3000"
echo "  ✓ API:     http://localhost:8080/healthz"
echo "  ✓ Logs:    tmp/server.log  |  tmp/ui.log"
echo "  Press Ctrl-C to stop."
echo ""
echo "━━━ server logs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Cleanup on exit ──────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Stopping..."
  kill $SERVER_PID $UI_PID $TAIL_PID 2>/dev/null || true
  docker compose stop db
  exit 0
}
trap cleanup INT TERM

tail -f "$SERVER_LOG" &
TAIL_PID=$!

wait $SERVER_PID $UI_PID
