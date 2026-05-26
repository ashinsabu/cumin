# Cumin - Project Instructions

## Overview
Cumin is a lightweight sprint/project management tool. Think Jira's sprint board, minus the bloat.

**This is a public repo.** Never commit secrets, credentials, API keys, or internal URLs. Use environment variables for all configuration.

## Architecture
- **Frontend**: Vite + React, deployed to Firebase Hosting at cumin.ashinsabu.com
- **Backend**: Go REST API, deployed on Railway
- **Database**: PostgreSQL on Railway

## Core Domain Concepts
- **Tickets**: Unit of work. Track time spent in each status (todo, in-progress, review, done).
- **Sprints**: Time-boxed iteration. Tickets move from backlog into sprints.
- **Epics**: Grouping mechanism for related tickets.
- **Backlog**: Unscheduled tickets not yet assigned to a sprint.

## Key Feature: Time-in-Status
Every ticket tracks cumulative time in each status column. This is a first-class concern — store status transitions as events, compute duration from the log.

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
- Go code layout: `server/cmd/` for entrypoints, `server/internal/` for packages
- Every service has a `.env.example` with all config vars documented

## Design Principles
- Start simple, single-user. Auth can come later.
- No premature abstraction — build for the features listed, not hypothetical ones.
- Prefer explicit over clever. Boring Go code is good Go code.
- If it's not tested and it's not trivial, it's not done.
