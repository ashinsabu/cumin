# Cumin - Project Instructions

## Overview
Cumin is a personal life sprint board. Jira's core mechanics (epics, sprints, kanban, time tracking) stripped of bloat, built for one person managing life goals — not a dev tool. docs/ contains all architecture.

## Philosophy
The org's sprint system works — work gets done fast and consistently because it's structured, estimated, and time-boxed. Cumin brings that same discipline to life outside work. The 80/20 rule: fill 80% of available sprint capacity with planned items, keep 20% as buffer for the unexpected. This prevents overcommitment while maintaining momentum.

**This is a public repo.** Never commit secrets, credentials, API keys, or internal URLs. Use environment variables for all configuration.

## Architecture
- **Frontend**: Vite + React, deployed to Firebase Hosting at cumin.ashinsabu.com
- **Backend**: Go REST API (monolith), deployed on Railway
- **Database**: PostgreSQL on Railway

## Core Domain Concepts
- **Item**: Unit of work on the board. Has title, description, priority (P0–P4), time estimate, and a monotonically increasing display ID (e.g., `ASH-42`). Must belong to an epic before it can move to an active status.
- **Epic**: Goal container. Items must be assigned to an epic to be worked on. Epics show aggregated estimates. Can have deadlines. Types: recurring (gym, shower — put N items per sprint), goal-oriented (Q2 interview prep with sub-items), catchall (for one-off tasks).
- **Sprint**: Time-boxed iteration with configurable cadence. Items are pulled from backlog into sprints. On sprint end, all incomplete items automatically spill over to the next sprint. No item is ever lost.
- **Status**: User-configurable board columns. Default: TODO → BLOCKED → IN PROGRESS → DONE. Fully extensible — users can add/remove/reorder. Statuses are data (DB rows), not code (enums).
- **Backlog**: Items not assigned to any sprint. Prioritized list.

## Key Feature: Time-in-Status
Every status change creates an immutable `status_transitions` event. Duration in any status is computed from this log. "Pending days" / "sitting idle" insights are derived, never stored as mutable state.

## Key Feature: Sprint Spillover
On sprint completion (auto on end_date or manual trigger), items not in a done-status roll to the next sprint. Catchall epics accumulate undone items quarter-to-quarter (Catchall Q1 → Catchall Q2).

## Auth
- Google OAuth 2.0 + Gmail sign-in (required feature)
- JWT in httpOnly cookie
- On first login: auto-provision user, default board, default statuses

## Item IDs
- Monotonically increasing per board, never reused
- Configurable prefix (default: first 3 letters of username uppercased)
- Format: `{PREFIX}-{SEQ}` → `ASH-1`, `ASH-2`, ...

## Estimates
- Stored in minutes. Display in minutes/hours/days.
- Minute-level granularity, day is the max unit.
- Epics compute total_estimate = sum of child item estimates.
- Sprints show total planned estimate for all assigned items.

## Priority
- P0 (critical) through P4 (lowest) — explicit, filterable, first-class field
- Separate from board position (drag order is visual arrangement only)

## Engineering Standards

### Reliability is non-negotiable
- Every operation must be safe to retry. Idempotent writes, idempotent deletes.
- Never lose user data. Prefer soft deletes. Log state transitions as append-only events.
- Validate at boundaries (HTTP handlers, DB layer). Trust nothing from outside, trust everything inside.
- Fail loud and early. No silent swallowing of errors. If something breaks, the caller knows immediately.
- Graceful degradation over crashes — but if you must crash, crash cleanly with context.

### Object-oriented design everywhere
- Model the domain with proper types/structs. No god objects, no bags of fields.
- Interfaces define contracts. Implementations are swappable.
- Encapsulate state. Expose behavior, not data. Methods over raw field access for anything with invariants.
- Composition over inheritance. Small, focused interfaces over fat ones.
- In Go: accept interfaces, return structs. In React: components are small, single-responsibility, composable.

### Everything is configurable via environment
- Zero hardcoded URLs, ports, timeouts, limits, feature flags, or connection strings.
- All config flows through env vars. Provide sane defaults so the app runs with zero config in dev.
- Document every env var in a `.env.example` at the root of each service.
- Config is loaded once at startup and injected — never read from env mid-request.

### Pluggable and removable
- Design every integration (database, email, notifications, storage) behind an interface.
- Swapping Postgres for SQLite, or Railway for a VPS, should be a config change + one new implementation.
- No service should assume it knows what's on the other side of an interface.
- If removing a feature requires touching more than its own package, it's too coupled.

### Pragmatic cleanliness
- Code reads top-to-bottom like a story. No treasure hunts to understand a flow.
- Name things for what they ARE, not what they DO to something else.
- One file, one concern. If a file needs a table of contents, split it.
- Delete dead code. Don't comment it out, don't hide it behind flags. Git remembers.
- Tests exist to prevent regressions and enable fearless refactoring, not to hit coverage numbers.

## Conventions
- Backend endpoints: REST, JSON request/response
- Frontend state: keep drag-and-drop state local, sync optimistically
- Database migrations: stored in `server/migrations/`
- Go code layout: `server/cmd/cumin/` for entrypoint, 4 domain packages flat at `server/`: `item/` (+ statuses, transitions), `epic/`, `sprint/` (+ board config, spillover), `auth/` (+ user, middleware, CORS)
- Every service has a `.env.example` with all config vars documented

## Git & Commits
- **Author**: All commits must use `ashinsabu <ashin.sabu3@gmail.com>`. Never add a Co-Authored-By line for Claude or any AI. No AI attribution in commits whatsoever.

## UI Structure
- Two tabs only: **Board** (kanban, active sprint) and **Backlog** (prioritized list)
- Mobile-first. Bottom tab bar on mobile, sidebar on desktop.
- Board on mobile: vertical stacked/swipeable statuses. Desktop: horizontal columns.
- Cards show: priority badge, display ID, title, epic label (colored), estimate, time-in-current-status, deadline
- Login: single "Sign in with Google" button. New users land on board with default setup.
- Dark mode from day one (system preference).
- FAB for creating items on mobile.
- Drag-and-drop for status transitions and reordering.

## Design Principles
- **KISS above all.** Fewer dirs, fewer files, fewer abstractions. If it feels like too many folders, it is. Related objects live together. Don't split until splitting solves a real problem.
- Mobile-first, desktop-enhanced. Every feature must work on 375px.
- No premature abstraction — build for the features listed, not hypothetical ones.
- Prefer explicit over clever. Boring Go code is good Go code.
- If it's not tested and it's not trivial, it's not done.
