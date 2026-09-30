# Cumin — Architecture & Decisions

## What This Is

A personal life sprint board. Jira's core mechanics stripped of bloat, built for one person managing life goals. Mobile-first, fast, opinionated.

---

## System Architecture (v1 — Monolith)

```
┌─────────────────────────────────────────────────┐
│                    Browser                        │
│         React SPA (Vite + React + TailwindCSS)   │
│       Mobile-first responsive, drag-and-drop     │
└────────────────────────┬────────────────────────┘
                         │ HTTPS (JSON REST)
                         │ httpOnly cookie (JWT)
                         ▼
┌─────────────────────────────────────────────────┐
│              Go HTTP Server (monolith)            │
│                                                   │
│  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │  Handlers │  │  Services │  │    Repos     │  │
│  │  (HTTP)   │→ │ (business │→ │  (Postgres)  │  │
│  │           │  │   logic)  │  │              │  │
│  └───────────┘  └───────────┘  └─────────────┘  │
│                                                   │
│  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │   Auth    │  │ Scheduler │  │    CORS      │  │
│  │  (OAuth)  │  │ (spillover│  │  Middleware  │  │
│  └───────────┘  └───────────┘  └─────────────┘  │
└────────────────────────┬────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────┐
│              PostgreSQL (Railway)                 │
└─────────────────────────────────────────────────┘
```

---

## Deployment

| Component | Hosted On | URL |
|-----------|-----------|-----|
| Frontend | Firebase Hosting | cumin.ashinsabu.com |
| Backend | Railway | api.cumin.ashinsabu.com |
| Database | Railway Postgres | Internal (Railway private network) |

CORS config:
- Allowed origin: `https://cumin.ashinsabu.com`
- Credentials: true (cookies)
- Methods: GET, POST, PATCH, DELETE, OPTIONS

Cookie config:
- Domain: `.cumin.ashinsabu.com` (covers both frontend and api subdomain)
- Secure: true
- SameSite: Lax
- HttpOnly: true
- Path: /

---

## Go Backend Layout

```
server/
  cmd/cumin/main.go      → Wire dependencies, start server
  item/                  → Item, Status, StatusTransition — models, service, repo, handlers
  epic/                  → Epic — model, service, repo, handler
  sprint/                → Sprint, Board, spillover (user-triggered) — models, service, repo, handlers
  auth/                  → User model, Google OAuth, JWT, auth middleware, CORS
  migrations/            → SQL migration files (sequential numbered)
  .env.example           → All config vars documented
```

4 domain packages. Related objects live together — statuses and transitions are part of the item domain (they only exist in context of items on the board). Board config (cadence, item_seq) lives with sprints since that's where it's used. Auth owns the user model, middleware, and CORS since every cross-cutting HTTP concern is auth-adjacent.

Cross-domain calls go through interfaces (injected via main.go). No `internal/` — single binary, nothing is imported externally.

---

## Key Decisions

### 1. Statuses are data, not code

Statuses live in a `statuses` table, ordered by `position`. Users add/remove/reorder columns without a migration. Board rendering is just "columns left-to-right by position."

### 2. Time-in-status via append-only event log

Every status change appends to `status_transitions`. Duration = diff consecutive timestamps. Immutable, auditable, replayable. No mutable "time_in_todo" fields.

### 3. Items can exist without an epic (but can't be worked on)

`epic_id` is nullable. Item can sit in TODO/initial status without an epic (quick capture / inbox). Business rule blocks transition to any non-initial status unless epic is assigned. Enforces "everything I work on is goal-oriented."

### 4. Sprint spillover is manual + self-auditing

No scheduler, no cron. User clicks "Complete Sprint" → incomplete items roll to next sprint. The audit trail is the `item_sprints` join table — an item showing `[Sprint 3, Sprint 4, Sprint 5]` has spilled twice. No separate events table needed.

### 5. Monotonically increasing IDs via atomic counter

`boards.item_seq` is incremented with `UPDATE ... SET item_seq = item_seq + 1 RETURNING item_seq`. Single row lock, no gaps, no race conditions. No separate Postgres SEQUENCE needed per board.

### 6. Estimates in minutes, aggregated at query time

Items store `estimate_minutes`. Epic totals and sprint totals are always computed (SUM), never cached. With <1000 items per board, this is trivially fast and always consistent.

### 7. Simple append positioning

Items always land at the bottom of a column. Drag-and-drop moves items between columns (status change), not within them. Position = MAX + 1 on insert or move. No reordering within a column.

### 8. Google OAuth only, JWT in cookie

No passwords. One auth provider. JWT has 1h expiry, refresh token stored server-side. On first login: auto-create user + default board + default statuses. Zero onboarding friction.

### 9. CORS + cookie subdomain strategy

Backend at `api.cumin.ashinsabu.com`, frontend at `cumin.ashinsabu.com`. Same parent domain means cookies with `Domain=.cumin.ashinsabu.com` work. CORS allows credentials. This is mandatory for the JWT-in-cookie approach to work cross-origin.

### 10. Health check endpoint

`GET /healthz` — returns 200 + DB ping. Railway uses this for deploy readiness.

---

## Auth Flow

```
┌────────┐     ┌─────────────┐     ┌────────────┐
│Browser │     │  Go Backend │     │   Google   │
└───┬────┘     └──────┬──────┘     └─────┬──────┘
    │  Click login     │                   │
    │─────────────────>│                   │
    │  302 → Google    │                   │
    │<─────────────────│                   │
    │  Consent screen  │                   │
    │──────────────────────────────────────>│
    │  Auth code redirect                  │
    │──────────────────>│                  │
    │                   │  Exchange code    │
    │                   │─────────────────>│
    │                   │  ID token        │
    │                   │<─────────────────│
    │                   │                  │
    │                   │ UPSERT user      │
    │                   │ Issue JWT cookie  │
    │  302 → app + cookie                  │
    │<──────────────────│                  │
```

---

## API Design

### Auth
```
GET  /auth/google          → Redirect to Google consent
GET  /auth/google/callback → Exchange code, set cookie, redirect to app
GET  /auth/me              → Current user info (validates cookie)
POST /auth/logout          → Clear cookie
```

### Board
```
GET    /boards              → List user's boards
POST   /boards              → Create board
GET    /boards/:id          → Board detail (includes statuses)
PATCH  /boards/:id          → Update board settings (name, cadence)
```

### Statuses
```
GET    /boards/:id/statuses       → Ordered list
POST   /boards/:id/statuses       → Add column
PATCH  /statuses/:id              → Update (rename, reorder)
DELETE /statuses/:id?reassign_to= → Remove column (items moved to reassign_to status)
```

### Epics
```
GET    /boards/:id/epics    → List epics (includes computed estimates)
POST   /boards/:id/epics    → Create epic
GET    /epics/:id           → Epic detail + aggregate stats
PATCH  /epics/:id           → Update
DELETE /epics/:id           → Soft delete (fails if items exist, unless force)
```

### Sprints
```
GET    /boards/:id/sprints        → List (filterable by state)
POST   /boards/:id/sprints        → Create sprint
GET    /sprints/:id               → Sprint detail + total estimates
PATCH  /sprints/:id               → Update (name, dates, activate)
POST   /sprints/:id/complete      → Complete sprint (triggers spillover)
GET    /boards/:id/sprints/active → Get current active sprint
```

### Items
```
GET    /boards/:id/items          → List (filterable: sprint, epic, status, priority)
POST   /boards/:id/items          → Create item (gets next display_seq)
GET    /items/:id                 → Item detail + time-in-status
PATCH  /items/:id                 → Update fields (title, desc, estimate, priority, deadline, epic)
POST   /items/:id/transition      → Move to new status (creates transition event, appends to bottom of target column)
POST   /items/:id/assign-sprint   → Pull into sprint from backlog
```

### Analytics
```
GET /items/:id/time-in-status     → Duration per status for one item
GET /boards/:id/metrics           → Board-level stats (items per status, avg time-in-status, spillover rate)
```

### Health
```
GET /healthz                      → 200 + DB ping
```

---

## What's NOT in v1

- Attachments / file upload
- Comments on items
- Multiple users / team features
- Notifications / email digests
- Custom fields
- Mobile native app (responsive web is the strategy)
- Import/export
- Burndown charts (data supports them — build later)
