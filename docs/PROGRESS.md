# Cumin — Progress Tracker

## Session 3 — Theme System, UX Polish, Design Phase

### Completed

#### Theme System Overhaul
- `data-preset` attribute on `<html>` — enables CSS targeting of structural elements without component changes
- Cyber preset: monospace font stack, 0px radius everywhere, neon glow on active nav items via `box-shadow` + `color-mix()`
- Glass preset: `backdrop-filter: blur()` on `aside` and `.raised-surface` (modal)
- Dark mode readability: boosted `--c-ghost` from `#3f3f46` (2.4:1) to `#71717a`, `--c-dim` to `#a1a1aa`
- `[data-preset="cyber"] .nav-item-active` — neon glow sidebar indicator
- `[data-preset="glass"] aside` — actual backdrop blur (was no-op before)

#### UX Polish
- Sidebar nav groups: Board/Backlog/All Items, then "Organize" (Epics/Projects), then "Insights" (Dashboards)
- `FilterSelect` component — themed custom dropdown replacing all native `<select>` elements (6 total across 3 views)
- `SearchInput` component — styled with SVG magnifying glass icon, `focus-within:border-ghost`
- Status column added to Backlog table
- Page subtitles removed (were ugly)

#### Backend: Project Delete Guard
- `project/store.go`: `ItemCount(ctx, id)` method
- `project/handler.go`: returns 409 Conflict if project has items — "project has N item(s) — reassign or delete them first"
- Existing orphaned items from pre-fix "Life" deletion remain in DB (need reassignment UI or manual fix)

#### Security
- gitleaks pre-commit hook (blocks secrets at commit time)
- OAuth CSRF protection via random state cookie
- JWT secret validation at startup (rejects weak/default secrets in non-dev)

---

### Built (session 3, uncommitted)

| Change | Files |
|--------|-------|
| `+ New item` button on Backlog + All Items | `BacklogView.tsx`, `AllItemsView.tsx` |
| Mobile filter bar wraps on small screens | `BacklogView.tsx`, `AllItemsView.tsx` |
| `createItem` + `projects` in BoardContext | `BoardContext.tsx` |
| `CreateItemModal` component | `components/CreateItemModal.tsx` |
| `Project` type added | `types/index.ts` |
| `SearchInput` accepts `className` prop | `components/SearchInput.tsx` |
| Item creation error masking bug fixed | `item/handler.go` |
| 17 realistic test items seeded (4 epics, varied statuses) | DB only |

### Design Phase

Designs in `docs/designs/`:

| Feature | Status | Doc |
|---------|--------|-----|
| Item Edit + Create | **LOCKED** | `docs/designs/item-edit-create.md` |
| Soft Delete | **LOCKED** | `docs/designs/soft-delete.md` |
| Sprint Management | **IN PROGRESS** — auto-start mode, reconciler, metrics being finalized | `docs/designs/sprint-management.md` |
| Epics (sizes) | **LOCKED** | `docs/designs/epics.md` |
| Pagination + Column Sort | **NOT DESIGNED** | — |

---

### QA Audit Findings (session 3)

14 findings from static code analysis. Sorted by severity:

| # | Severity | Endpoint | Issue |
|---|----------|----------|-------|
| 1 | **CRITICAL** | `DELETE /api/board/statuses/{id}` | TOCTOU race → can delete all done/initial statuses concurrently |
| 2 | **HIGH** | `DELETE /api/board/statuses/{id}` | Items in deleted status silently orphaned (no item count guard) |
| 3 | **HIGH** | `DELETE /api/epics/{id}` | No item count guard before delete (inconsistent with project delete) |
| 4 | **HIGH** | All routes | `AUTH_DISABLED=true` has no production environment guard |
| 5 | **HIGH** | `DELETE /api/projects/{id}` | TOCTOU between count check and delete (concurrent create can sneak in) |
| 6 | **MEDIUM** | All create/update | No max length validation on string inputs (title, description, name) |
| 7 | **MEDIUM** | All PATCH | Cannot clear description fields — `""` silently treated as "not provided" |
| 8 | **MEDIUM** | `POST /api/projects` | Prefix allows internal whitespace, unicode, emoji (bypass 5-char length check) |
| 9 | **MEDIUM** | `POST /api/items/{id}/move` | All statuses fetched + linear scanned for single-ID validation |
| 10 | **MEDIUM** | `POST /api/sprints/{id}/close` | Race with concurrent item move during sprint close window |
| 11 | **MEDIUM** | `POST /api/sprints` | No guard against creating multiple planning sprints |
| 12 | **LOW** | OAuth callback | JWT cookie `Secure: false` behind TLS-terminating proxy (`r.TLS` always nil on Railway) |
| 13 | **LOW** | `PATCH /api/board` | Cannot zero out `SprintStartDay` or `SprintCadenceDays` (0 = sentinel, not value) |
| 14 | **LOW** | `POST /api/sprints` | Sprint seq increment not transactional (crash between steps leaks seq number) |

State machine audit in progress — deeper findings pending.

---

### In Progress

- [ ] State machine audit (agent running)
- [ ] Sprint Management UI decision: sidebar vs. inline
- [ ] Write backend unit tests
- [ ] Set up E2E test infrastructure

---

### Next Implementation Queue (in order, after designs signed off)

1. **Fix QA findings #1–5** (critical + high severity bugs, no design needed)
2. **Item Edit + Create** — modal modes + BoardContext mutations
3. **Soft Delete** — migration + API + Trash UI + purge worker
4. **Sprint Management UI** — pending UX decision
5. **Wire Board view to real API** (replace mock data)
6. **Drag-and-drop** — status transitions + reorder
7. **Dashboard** — time-in-status charts, velocity
8. **Optimistic updates + error rollback** across all mutations
9. **E2E test infrastructure** — Playwright + ephemeral DB

---

### Known Data Issues

- Orphaned items from deleted "Life" project: `project_id = NULL` on LIF-1, LIF-2. Blocked from new "Life" project (different UUID). Need reassignment UI or `UPDATE items SET project_id = <new-life-id> WHERE display_id IN ('LIF-1','LIF-2')`.

---

## Session 2 — Sprint System + Backend Criticals

### Completed

#### Frontend Crash Fixes (session 1)
- **CRIT-A**: ItemCard/ItemModal/DashboardView null-dereference on `item.sprints`, `item.epic_color`, `item.priority` — fixed with `?? []` guards
- **CRIT-B**: ItemModal hardcoded initials `'AS'` — fixed by deriving from `user.display_name` via `useAuth()`
- **CRIT-C**: DashboardView crash on mount reading `board.available_hours_per_sprint` before board loaded — fixed with loading + null guard
- **CRIT-D**: No top-level ErrorBoundary — added `ErrorBoundary` class component, wrapped `main.tsx` and per-route in `App.tsx`
- **CRIT-E**: ProjectsView missing `credentials: 'include'`, wrong response destructuring — fixed all three fetch calls
- **HIGH-B**: StatusDurationBar crash on `undefined` minutes — typed prop, added early return
- **BoardContext URL**: Was `http://localhost:8080` (bypassed Vite proxy) — changed to `const API = ''`

#### Sprint System Redesign
- Migration 004: `sprint_seq` on boards, `sprint_number` on sprints, `UNIQUE(user_id)` on boards
- `sprint/store.go`: `CreateNext`, `Close` (atomic tx: complete + next sprint + spill), `ComputeName`
- `sprint/handler.go`: state machine enforced planning → active → completed; `Close` auto-creates next sprint

#### Backend Criticals Fixed
| ID | Issue | Fix |
|----|-------|-----|
| F01 / TX-001 | project_id not validated; seq incremented outside tx | `CreateForProject` atomic tx |
| F02 | epic_id and sprint_id not validated against board | `EpicBelongsToBoard` / `SprintBelongsToBoard` |
| F03 | `DoneStatusIDs` nil slice → SQL matches everything | `ids := []string{}` in board/store.go |
| SM-003 | Deleting last done/initial status breaks spillover | Guard in DeleteStatus |
| RACE-001 | Concurrent OAuth double-provision | `ON CONFLICT (user_id) DO NOTHING` |
| P0-BUG | Priority 0 unwritable (zero-value guard) | `Priority *int` in UpdateRequest |
| CLEAR-BUG | Epic/sprint can't be cleared via Update | `ClearEpic`, `ClearSprint` bool fields |
| BACKLOG | Backlog includes done-status items | Added `status_id NOT IN (done statuses)` |
