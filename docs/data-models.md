# Cumin — Data Models (LLD)

## Design Principles

- Append-only event log for status transitions (time-in-status is derived, never stored as a mutable field)
- Extensible status system — statuses are rows in a table, not enums
- Item IDs are monotonically increasing via Postgres SEQUENCE, with a configurable prefix
- All estimates stored in minutes (display layer converts to hours/days)
- Soft deletes everywhere — nothing is ever truly lost
- Every entity has `created_at` and `updated_at` timestamps

---

## Entity Relationship Overview

```
User (Google OAuth)
 └── owns Boards
       ├── has Statuses (ordered columns)
       ├── has Epics (recurring / goal / catchall)
       ├── has Sprints (configurable cadence)
       └── has Items (belong to epic + optionally sprint)
              └── has StatusTransitions (append-only log)
```

---

## Tables

### users

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Internal ID |
| google_id | VARCHAR NOT NULL UNIQUE | From OAuth `sub` claim |
| email | VARCHAR NOT NULL UNIQUE | Gmail address |
| display_name | VARCHAR NOT NULL | User-configurable. Seeded from Google profile name on first login. |
| avatar_url | VARCHAR | From Google profile (updatable by user later) |
| id_prefix | VARCHAR(5) NOT NULL | User-configurable. Default: first 3 chars of display_name uppercased. Used for item IDs (e.g., ASH-1). |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | |

---

### boards

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| user_id | UUID FK → users | Owner |
| name | VARCHAR NOT NULL | e.g., "Life", "Work" |
| sprint_cadence_days | INT NOT NULL DEFAULT 7 | Duration of auto-created sprints |
| sprint_start_day | SMALLINT NOT NULL DEFAULT 3 | 0=Mon ... 6=Sun. Default 3=Wednesday |
| item_seq | BIGINT NOT NULL DEFAULT 0 | Current sequence counter (incremented via UPDATE ... RETURNING) |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | |
| deleted_at | TIMESTAMPTZ | Soft delete |

Notes:
- `item_seq` is incremented atomically: `UPDATE boards SET item_seq = item_seq + 1 WHERE id = :id RETURNING item_seq`
- This avoids race conditions — no MAX+1, no separate Postgres SEQUENCE per board

---

### statuses

Ordered columns on a board. Fully user-configurable.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| board_id | UUID FK → boards | |
| name | VARCHAR NOT NULL | e.g., "TODO", "IN PROGRESS", "DONE" |
| position | INT NOT NULL | Display order (0-indexed) |
| is_done | BOOLEAN NOT NULL DEFAULT false | Marks terminal state(s) — items here are "complete" |
| is_initial | BOOLEAN NOT NULL DEFAULT false | New items land here |
| created_at | TIMESTAMPTZ NOT NULL | |

Constraints:
- UNIQUE(board_id, position)
- At least one status with is_done = true per board (app-enforced)
- At least one status with is_initial = true per board (app-enforced)

Default seed for a new board:
```
TODO (position=0, is_initial=true)
BLOCKED / ON HOLD (position=1)
IN PROGRESS (position=2)
DONE (position=3, is_done=true)
```

---

### epics

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| board_id | UUID FK → boards | |
| name | VARCHAR NOT NULL | e.g., "Q2 Interview Prep", "Gym", "Catchall Q2" |
| type | VARCHAR NOT NULL | `recurring` / `goal` / `catchall` |
| description | TEXT | |
| color | VARCHAR(7) NOT NULL | Hex color for label display on cards |
| deadline | DATE | Optional — mostly for goal epics |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | |
| deleted_at | TIMESTAMPTZ | Soft delete |

Epic types:
- **recurring**: Never "done." Each sprint you slot N items (e.g., "Gym x3"). Stays active indefinitely.
- **goal**: Finite. Burns down to zero. Has a deadline usually. Can be marked complete.
- **catchall**: Bucket for one-off tasks. At quarter/period boundaries, create a new catchall and spill remaining items into it.

Computed (query-time):
- `total_estimate_minutes` = SUM(items.estimate_minutes) WHERE item.epic_id = this
- `completed_estimate_minutes` = SUM(items.estimate_minutes) WHERE item is in a done-status

---

### sprints

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| board_id | UUID FK → boards | |
| name | VARCHAR NOT NULL | e.g., "Sprint 12", "Week of May 26" |
| start_date | DATE NOT NULL | |
| end_date | DATE NOT NULL | |
| state | VARCHAR NOT NULL DEFAULT 'planning' | `planning` / `active` / `completed` |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | |

Constraints:
- At most one sprint with state = 'active' per board
- `end_date - start_date` = board's `sprint_cadence_days` (soft, not DB-enforced)
- Sprint completion is user-triggered only. Incomplete items spill to the next sprint (which must exist or be created first).

---

### items

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Internal |
| board_id | UUID FK → boards | |
| display_seq | BIGINT NOT NULL | Monotonically increasing per board |
| epic_id | UUID FK → epics | **Nullable** — can be NULL only while in initial status |
| current_sprint_id | UUID FK → sprints | NULL = backlog. Points to the latest/active sprint this item is in. |
| status_id | UUID FK → statuses | Current status |
| title | VARCHAR NOT NULL | |
| description | TEXT | |
| priority | SMALLINT NOT NULL DEFAULT 4 | 0=P0 (critical) … 4=P4 (lowest) |
| estimate_minutes | INT | Nullable — not everything has an estimate |
| deadline | DATE | Optional — shows as red alert on card when overdue |
| position | INT NOT NULL | Order within a status column. Newest at bottom (MAX + 1 on insert/move). |
| created_at | TIMESTAMPTZ NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL | |
| deleted_at | TIMESTAMPTZ | Soft delete |

Constraints:
- UNIQUE(board_id, display_seq)
- **Business rule (app layer):** Cannot transition out of initial status unless `epic_id IS NOT NULL`. Enforces "everything I work on must be goal-oriented."
- Position: simple append. On insert or status change, position = MAX(position in that column) + 1. No reordering within columns.

Display ID format: `{user.id_prefix}-{display_seq}` → `ASH-1`, `ASH-2`, ...

---

### status_transitions

Append-only event log. **The source of truth for time-in-status.**

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| item_id | UUID FK → items | |
| from_status_id | UUID FK → statuses | NULL for initial creation |
| to_status_id | UUID FK → statuses | |
| transitioned_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

Deriving time-in-status:
```sql
SELECT
  s.name,
  SUM(
    COALESCE(next_t.transitioned_at, NOW()) - t.transitioned_at
  ) AS duration
FROM status_transitions t
JOIN statuses s ON s.id = t.to_status_id
LEFT JOIN LATERAL (
  SELECT transitioned_at
  FROM status_transitions
  WHERE item_id = t.item_id AND transitioned_at > t.transitioned_at
  ORDER BY transitioned_at ASC LIMIT 1
) next_t ON true
WHERE t.item_id = :item_id
GROUP BY s.name;
```

---

### item_sprints

Many-to-many join. An item accumulates sprint entries as it spills over. **This IS the audit trail** — if an item has 3 rows here, it spilled twice.

| Column | Type | Notes |
|--------|------|-------|
| item_id | UUID FK → items | Composite PK |
| sprint_id | UUID FK → sprints | Composite PK |
| added_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | When the item entered this sprint |

An item showing `Sprint 1, Sprint 2, Sprint 3` on its card = been rolling since Sprint 1. The card UI renders these as a sprint trail (like Jira's sprint field).

`items.current_sprint_id` is denormalized for fast board queries (always points to the latest sprint the item is in). The `item_sprints` rows are the full history.

---

## Indexes

```sql
-- Board view: items in a sprint by status and position
CREATE INDEX idx_items_sprint_status ON items(current_sprint_id, status_id, position) WHERE deleted_at IS NULL;

-- Backlog: items without a sprint, sorted by priority
CREATE INDEX idx_items_backlog ON items(board_id, priority, created_at) WHERE current_sprint_id IS NULL AND deleted_at IS NULL;

-- Item sprint history
CREATE INDEX idx_item_sprints ON item_sprints(item_id, added_at);

-- Time-in-status queries
CREATE INDEX idx_transitions_item ON status_transitions(item_id, transitioned_at);

-- Epic aggregate queries
CREATE INDEX idx_items_epic ON items(epic_id) WHERE deleted_at IS NULL;

-- Active sprint lookup
CREATE INDEX idx_sprints_active ON sprints(board_id, state) WHERE state = 'active';
```

---

## Sprint Completion & Spillover

**Not automatic. User-triggered only** via "Complete Sprint" action.

```
1. User clicks "Complete Sprint"
2. Find all items in sprint WHERE status.is_done = false
3. User must have a next sprint ready (state = 'planning') — prompt to create one if not
4. For each incomplete item:
   a. Set current_sprint_id = next_sprint.id
   b. INSERT into item_sprints (item_id, next_sprint.id)
   c. Assign position = MAX(position in target sprint's same status) + 100
5. Mark current sprint state = 'completed'
```

The item_sprints history IS the spillover audit. An item in `Sprint 5` with rows for `[Sprint 3, Sprint 4, Sprint 5]` has spilled twice — visible on the card.

Idempotent: if sprint is already `completed`, operation is a no-op.

No scheduler, no cron, no auto-creation. Sprint lifecycle is fully manual.

---

## Auth Flow (Google OAuth 2.0)

```
1. User clicks "Sign in with Google" → redirect to Google consent screen
2. Google redirects back with auth code → backend exchanges for tokens
3. Backend extracts email, name, avatar from ID token
4. UPSERT into users table (google_id as unique key)
5. If new user: create default board + default statuses
6. Issue JWT (contains user_id, email) → set as httpOnly, Secure, SameSite=Lax cookie
7. Cookie domain = .cumin.ashinsabu.com (covers both frontend and api subdomain)
8. Redirect to app
```

Token refresh: JWT has short expiry (1h). Refresh token stored server-side, cookie refreshed transparently on API calls.

---

## Priority Levels

| Value | Label | Meaning |
|-------|-------|---------|
| 0 | P0 | Critical — do today |
| 1 | P1 | High — this sprint |
| 2 | P2 | Medium — soon |
| 3 | P3 | Low — when possible |
| 4 | P4 | Lowest — someday/maybe |

---

## Dashboards & Analytics

All derived from existing data — no new tables needed.

### Pre-built dashboards (ship with the app):

**Sprint Capacity (the 80/20 rule)**
- Available hours this sprint (configurable — e.g., "I have 20h outside work this week")
- 80% target capacity = available × 0.8
- Planned estimate total vs 80% target (bar: green if under, amber if 80-100%, red if over)
- Buffer remaining: 20% budget minus unplanned items added mid-sprint
- Warning on sprint planning if planned > 80% of available

**Sprint Health**
- Days elapsed since sprint started / total sprint duration (progress bar)
- Items done vs total (count + estimate hours)
- Total planned estimate vs completed estimate for current sprint
- Average spillover rate: % of items that spill per sprint (from item_sprints history)
- Velocity trend: hours completed per sprint over last N sprints

**Accountability**
- Items sitting in non-done status > N days (configurable threshold)
- Spillover frequency per item ("ASH-12 has spilled 4 sprints in a row")
- Hours completed per sprint (bar chart over time)
- Hours planned vs completed per sprint (trend — are you overestimating or underestimating?)

**Epic Progress**
- Per-epic: estimate completed / total estimate (progress bar)
- Days until deadline vs remaining estimate (will you make it? red/green indicator)

### Queryable metrics (API supports, UI can add charts later):
- Time-in-status per item (already modeled via status_transitions)
- Average time-to-done per priority level
- Items completed per sprint (velocity)
- Estimate accuracy: estimated vs actual time (when we add time logging later)

### API endpoints:
```
GET /boards/:id/dashboard/sprint-health   → Current sprint stats
GET /boards/:id/dashboard/accountability  → Stale items, spillover rates
GET /boards/:id/dashboard/epic-progress   → Per-epic completion stats
GET /boards/:id/dashboard/velocity        → Historical sprint completion data
```

---

## Sprint Retro (optional, extensible)

On sprint completion, user can optionally fill a retro. Stored alongside sprint.

### sprint_retros

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| sprint_id | UUID FK → sprints | UNIQUE — one retro per sprint |
| mood | SMALLINT | 1-5 scale, nullable |
| blockers | JSONB | Array of tags: `["overcommitted", "bad_estimates", "unexpected_life", "procrastinated", "dependency"]` |
| highlight | TEXT | Best thing done this sprint |
| regret | TEXT | What should've been done differently |
| next_sprint_intent | TEXT | "What will I do differently?" — shown at top of next sprint planning |
| created_at | TIMESTAMPTZ NOT NULL | |

The schema is intentionally loose (JSONB for blockers, all text fields nullable). Usage will reveal what's needed — extensible by adding columns or JSONB keys without migration pain.

Over time, aggregated blocker tags surface patterns: "you've tagged 'bad_estimates' 6 sprints in a row."

---

## Velocity & Analytics (graph-ready)

All computed from existing tables. No new storage needed.

**Hours completed per sprint** (bar chart):
```sql
SELECT s.name, SUM(i.estimate_minutes) / 60.0 AS hours_done
FROM items i
JOIN item_sprints isp ON isp.item_id = i.id
JOIN sprints s ON s.id = isp.sprint_id
JOIN statuses st ON st.id = i.status_id
WHERE st.is_done = true AND s.board_id = :board_id
GROUP BY s.id, s.name, s.start_date
ORDER BY s.start_date DESC LIMIT 12;
```

**Hours planned vs completed per sprint** (overlaid bars):
- Planned = SUM(estimate_minutes) for all items that were in the sprint
- Completed = SUM(estimate_minutes) for items that reached a done-status during that sprint

**Breakdown by epic** (stacked bars):
- Same as above but GROUP BY epic, giving per-epic hours done per sprint

**Weekly view**:
- Same queries but bucketed by ISO week instead of sprint

No streaks. No gamification beyond the data itself. The graph is the motivator — seeing a declining line is enough.

---

## Spillover Indicator (card UI)

Visual escalation on cards based on `item_sprints` count:
- 0 spillovers: no indicator
- 1: gray left border (3px), small `↻1` chip
- 2: amber left border, `↻2` chip
- 3+: red left border, `↻3` chip

Priority badge is always visually dominant (larger, bolder). Spillover is secondary information — it informs urgency but doesn't override explicit priority.

---

## Future Extension Points (not building now, but schema supports)

- **Attachments**: separate table FK → items (blob storage URL)
- **Comments**: separate table FK → items
- **Custom fields**: JSON column or EAV pattern on items
- **Team/multi-user**: board_members join table, role column
- **Notifications**: event-driven off status_transitions
- **API webhooks**: subscribe to transition events
- **Custom dashboards**: user-defined chart configs stored as JSON
