# Cumin

Personal sprint board for managing life goals outside of work. Time-boxed sprints, kanban, backlog, and time-in-status tracking — built for one person.

[cumin.ashinsabu.com](https://cumin.ashinsabu.com)

## Features

1. Auth
   - Sign in with Google

2. Board
   - Kanban view of the active sprint
   - Drag and drop between status columns
   - Configurable statuses (add/remove/reorder)

3. Backlog
   - Prioritized list of items not in any sprint
   - Pull items into the active sprint

4. Items
   - Priority levels P0–P4
   - Time estimate (stored in minutes, displayed as min/hr/day)
   - Time-in-status tracking (how long an item has been in each column)
   - Display IDs per project (e.g. LIF-1, LIF-2)

5. Epics
   - Group related items under a goal
   - Aggregated time estimates
   - Optional deadline

6. Sprints
   - Auto-named time-boxed iterations
   - Incomplete items automatically spill to the next sprint on close

## Local development

**Prerequisites:** Go 1.24+, Node 18+, Docker

```sh
# Start DB + API + frontend in one shot
./dev.sh
```

- Frontend: http://localhost:3000
- API: http://localhost:8080/healthz

```sh
# Wipe a user (to test fresh first-login provisioning)
cd server && make wipe-user EMAIL=you@example.com
```

## Deploy

- **Frontend** — Firebase Hosting (`firebase deploy` from `ui/`)
- **Backend** — Railway (push to main, Railway auto-deploys)
- **Database** — PostgreSQL on Railway

Copy `server/.env.production.example` to `.env` on the server and fill in values before deploying.
