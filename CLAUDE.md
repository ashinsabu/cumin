# Cumin - Project Instructions

## Overview
Cumin is a lightweight sprint/project management tool. Think Jira's sprint board, minus the bloat.

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

## Conventions
- Backend endpoints: REST, JSON request/response
- Frontend state: keep drag-and-drop state local, sync optimistically
- Database migrations: stored in `backend/migrations/`
- Go code layout: `backend/cmd/` for entrypoints, `backend/internal/` for packages

## Design Principles
- Start simple, single-user. Auth can come later.
- No premature abstraction — build for the features listed, not hypothetical ones.
- Prefer explicit over clever. Boring Go code is good Go code.
