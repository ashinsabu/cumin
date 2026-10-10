-- Phase 1 of boards → projects migration: additive only.
-- Adds new columns and backfills from existing board rows.
-- Nothing is dropped — both old and new columns coexist so the running
-- server continues to work unchanged throughout this deploy.

-- 1. Projects inherit sprint config from their board.
ALTER TABLE projects
  ADD COLUMN sprint_cadence_days        INT      NOT NULL DEFAULT 7,
  ADD COLUMN sprint_start_day           SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN available_hours_per_sprint INT      NOT NULL DEFAULT 20;

UPDATE projects p
SET sprint_cadence_days        = b.sprint_cadence_days,
    sprint_start_day           = b.sprint_start_day,
    available_hours_per_sprint = b.available_hours_per_sprint
FROM boards b
WHERE b.id = p.board_id;

-- 2. Statuses become user-scoped (not board-scoped).
--    board_id stays until Phase 3.
ALTER TABLE statuses ADD COLUMN user_id UUID REFERENCES users(id);

UPDATE statuses s
SET user_id = b.user_id
FROM boards b
WHERE b.id = s.board_id;

ALTER TABLE statuses ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX idx_statuses_user ON statuses(user_id);

-- 3. Saved views become user-scoped (not board-scoped).
ALTER TABLE saved_views ADD COLUMN user_id UUID REFERENCES users(id);

UPDATE saved_views sv
SET user_id = b.user_id
FROM boards b
WHERE b.id = sv.board_id;

-- user_id intentionally left nullable here: if no rows exist the backfill
-- is a no-op, and the NOT NULL will be added in Phase 3 after code is flipped.
CREATE INDEX idx_saved_views_user ON saved_views(user_id);

-- 4. Epics: backfill project_id (column already existed, was always NULL).
--    Each epic is assigned to the oldest project on its board (the default project).
UPDATE epics e
SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.board_id = e.board_id
    AND p.deleted_at IS NULL
  ORDER BY p.created_at
  LIMIT 1
)
WHERE e.project_id IS NULL;

-- 5. Sprints: add project_id (replacing board_id in Phase 2).
ALTER TABLE sprints ADD COLUMN project_id UUID REFERENCES projects(id);

UPDATE sprints s
SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.board_id = s.board_id
    AND p.deleted_at IS NULL
  ORDER BY p.created_at
  LIMIT 1
);

-- 6. Queue items: add project_id (replacing board_id in Phase 2).
ALTER TABLE queue_items ADD COLUMN project_id UUID REFERENCES projects(id);

UPDATE queue_items q
SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.board_id = q.board_id
    AND p.deleted_at IS NULL
  ORDER BY p.created_at
  LIMIT 1
);
