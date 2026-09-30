DROP INDEX IF EXISTS idx_items_deleted_at;
DROP INDEX IF EXISTS idx_epics_deleted_at;
DROP INDEX IF EXISTS idx_items_board_live;
DROP INDEX IF EXISTS idx_epics_board_live;
DROP INDEX IF EXISTS idx_projects_board_live;

ALTER TABLE items    DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE epics    DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE projects DROP COLUMN IF EXISTS deleted_at;
