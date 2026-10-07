-- Revert to the original full unique index (pre-migration 009 behaviour).
DROP INDEX IF EXISTS idx_projects_board_prefix;
CREATE UNIQUE INDEX idx_projects_board_prefix ON projects(board_id, prefix);
