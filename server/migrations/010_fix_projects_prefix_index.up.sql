-- Fix idx_projects_board_prefix to be a partial unique index that only enforces
-- uniqueness among non-deleted (active) projects. The original full unique index
-- blocked re-creation of a prefix after soft-delete, breaking the
-- delete-then-recreate-with-same-prefix flow required by TestProjects_CoreFlow.
DROP INDEX IF EXISTS idx_projects_board_prefix;
CREATE UNIQUE INDEX idx_projects_board_prefix ON projects(board_id, prefix) WHERE deleted_at IS NULL;
