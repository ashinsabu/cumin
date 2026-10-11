-- Phase 3: drop all board_id columns and the boards table.
-- All code now uses project_id / user_id. board_id columns are vestigial.

ALTER TABLE statuses     DROP COLUMN IF EXISTS board_id;
ALTER TABLE epics        DROP COLUMN IF EXISTS board_id;
ALTER TABLE sprints      DROP COLUMN IF EXISTS board_id;
ALTER TABLE queue_items  DROP COLUMN IF EXISTS board_id;
ALTER TABLE projects     DROP COLUMN IF EXISTS board_id;
ALTER TABLE saved_views  DROP COLUMN IF EXISTS board_id;
ALTER TABLE items        DROP COLUMN IF EXISTS board_id;

-- saved_views.user_id was left nullable in phase 1 — enforce it now.
ALTER TABLE saved_views  ALTER COLUMN user_id SET NOT NULL;

-- Drop boards table itself (CASCADE drops remaining FK constraints on items, etc.).
DROP TABLE IF EXISTS boards CASCADE;

-- Active-sprint uniqueness is now per-project (replaces the old per-board index).
DROP INDEX IF EXISTS idx_sprints_active;
CREATE UNIQUE INDEX idx_sprints_active ON sprints (project_id) WHERE state = 'active';

-- Project prefix uniqueness is now per-user (was per-board).
DROP INDEX IF EXISTS idx_projects_board_prefix;
DROP INDEX IF EXISTS idx_projects_user_prefix;
CREATE UNIQUE INDEX idx_projects_user_prefix ON projects (user_id, prefix) WHERE deleted_at IS NULL;
