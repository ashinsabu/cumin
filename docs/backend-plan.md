# Backend Implementation Plan

## Migration Order

```
001_initial_schema.sql    → users, boards, statuses
002_epics.sql             → epics
003_sprints.sql           → sprints, item_sprints
004_items.sql             → items, status_transitions, indexes
005_sprint_retros.sql     → sprint_retros
```

---

## Part 1: Config + DB + Migrations Infrastructure

- [ ] Config struct from env: PORT, DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URL, FRONTEND_URL
- [ ] DB connection pool (pgx)
- [ ] Migration runner (golang-migrate), runs on startup
- [ ] Migration 001: users, boards, statuses
- [ ] /healthz pings DB

---

## Part 2: Auth

- [ ] Google OAuth: `/api/auth/google/login` (redirect), `/api/auth/google/callback` (exchange + cookie)
- [ ] JWT issue → httpOnly, Secure, SameSite=Lax cookie
- [ ] Auth middleware: JWT from cookie → userID in context
- [ ] Auto-provision on first login: user + default board + 4 default statuses
- [ ] `/api/auth/me` — returns authenticated user
- [ ] `/api/auth/logout` — clears cookie
- [ ] CORS middleware (FRONTEND_URL origin)
- [ ] Dev bypass: `AUTH_DISABLED=true` → hardcoded test user in context

---

## Part 3: Boards + Statuses

- [ ] `GET /api/boards` — list user's boards
- [ ] `GET /api/boards/:id` — single board with statuses
- [ ] `PATCH /api/boards/:id` — update name, cadence, available_hours
- [ ] `GET /api/boards/:id/statuses`
- [ ] `POST /api/boards/:id/statuses`
- [ ] `PATCH /api/statuses/:id` — rename, toggle is_done/is_initial
- [ ] `DELETE /api/statuses/:id` — only if no items reference it
- [ ] `PUT /api/boards/:id/statuses/reorder` — batch position update
- [ ] Invariants: always ≥1 is_initial, always ≥1 is_done per board

---

## Part 4: Epics

- [ ] Migration 002: epics table
- [ ] `GET /api/boards/:id/epics`
- [ ] `POST /api/boards/:id/epics`
- [ ] `PATCH /api/epics/:id`
- [ ] `DELETE /api/epics/:id` — soft delete
- [ ] Filter by type (recurring/goal/catchall)
- [ ] Computed in response: total_estimate_minutes, completed_estimate_minutes, item count

---

## Part 5: Sprints

- [ ] Migration 003: sprints, item_sprints
- [ ] `GET /api/boards/:id/sprints`
- [ ] `POST /api/boards/:id/sprints` — create next sprint
- [ ] `PATCH /api/sprints/:id` — rename, adjust dates
- [ ] `POST /api/sprints/:id/activate` — planning → active, one-active-per-board
- [ ] `POST /api/sprints/:id/complete` — stub (wired in Part 7)

---

## Part 6: Items

- [ ] Migration 004: items, status_transitions, indexes
- [ ] `POST /api/boards/:id/items` — atomic item_seq, initial transition logged
- [ ] `GET /api/boards/:id/items` — filter by sprint, status
- [ ] `GET /api/items/:id` — with sprint trail + time-in-status
- [ ] `PATCH /api/items/:id` — title, description, priority, estimate, deadline, epic_id
- [ ] `POST /api/items/:id/move` — status change, logs transition, enforces epic rule
- [ ] `DELETE /api/items/:id` — soft delete
- [ ] `POST /api/items/:id/assign-sprint` — pull from backlog into sprint
- [ ] Business rules:
  - Can't leave initial status without epic_id
  - Position = MAX+1 in target column
  - Display ID = {user.id_prefix}-{display_seq}

---

## Part 7: Sprint Completion (Spillover)

- [ ] Wire `POST /api/sprints/:id/complete`:
  1. Find items where status.is_done = false
  2. Require next sprint exists (error if not)
  3. Update current_sprint_id, insert item_sprints row for each
  4. Mark sprint completed
  5. Idempotent — already-completed = no-op

---

## Part 8: Dashboard Queries

- [ ] `GET /api/boards/:id/dashboard/capacity` — 80/20 fill, buffer
- [ ] `GET /api/boards/:id/dashboard/health` — completion %, spillover rate
- [ ] `GET /api/boards/:id/dashboard/epic-progress` — per-epic bars
- [ ] `GET /api/boards/:id/dashboard/stale` — items > N days in non-done status
- [ ] `GET /api/boards/:id/dashboard/velocity` — hours/sprint, last 12

---

## Part 9: Sprint Retros

- [ ] Migration 005: sprint_retros
- [ ] `POST /api/sprints/:id/retro`
- [ ] `GET /api/sprints/:id/retro`

---

## Part 10: Wire UI to Backend

- [ ] Replace mock data with API calls
- [ ] Auth flow in frontend (Google redirect, cookie handling)
- [ ] Optimistic DnD updates (PATCH status, rollback on error)

---

## Key Rules

- Every write is idempotent and retry-safe
- Soft delete everywhere (deleted_at)
- Validate at handler boundary, trust internally
- Accept interfaces, return structs
- Config from env, loaded once at startup
- status_transitions is append-only, time-in-status is derived
- item_sprints join table IS the spillover audit
- item_seq via atomic UPDATE...RETURNING (no MAX+1)
- No auto-spillover — sprint completion is always user-triggered
