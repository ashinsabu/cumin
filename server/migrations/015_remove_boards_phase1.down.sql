-- Revert Phase 1: drop all additive columns added in the up migration.

ALTER TABLE projects
  DROP COLUMN IF EXISTS sprint_cadence_days,
  DROP COLUMN IF EXISTS sprint_start_day,
  DROP COLUMN IF EXISTS available_hours_per_sprint;

DROP INDEX IF EXISTS idx_statuses_user;
ALTER TABLE statuses DROP COLUMN IF EXISTS user_id;

DROP INDEX IF EXISTS idx_saved_views_user;
ALTER TABLE saved_views DROP COLUMN IF EXISTS user_id;

UPDATE epics SET project_id = NULL;

ALTER TABLE sprints DROP COLUMN IF EXISTS project_id;

ALTER TABLE queue_items DROP COLUMN IF EXISTS project_id;
