# Cumin

A personal sprint board — like Jira, but without the enterprise bloat.

## What it does

- Kanban/sprint board with drag-and-drop
- Backlog management
- Epics for grouping tickets
- Pull tickets from backlog into sprints
- Per-ticket time-in-status tracking (how long something has been sitting in a column)

## Stack

| Layer | Tech | Hosting |
|-------|------|---------|
| Frontend | Vite + React | Firebase (cumin.ashinsabu.com) |
| Backend | Go | Railway |
| Database | PostgreSQL | Railway |

## Project Structure

```
cumin/
├── server/   # Go API server
└── ui/       # Vite + React SPA
```

## Status

Early development. Personal use first, multi-user later.
