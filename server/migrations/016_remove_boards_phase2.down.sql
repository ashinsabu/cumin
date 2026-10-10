DROP INDEX IF EXISTS idx_queue_items_user;
ALTER TABLE queue_items DROP COLUMN IF EXISTS user_id;

DROP INDEX IF EXISTS idx_sprints_project;

DROP INDEX IF EXISTS idx_epics_user;
ALTER TABLE epics DROP COLUMN IF EXISTS user_id;

DROP INDEX IF EXISTS idx_projects_user;
ALTER TABLE projects DROP COLUMN IF EXISTS user_id;
ALTER TABLE projects DROP COLUMN IF EXISTS sprint_seq;
