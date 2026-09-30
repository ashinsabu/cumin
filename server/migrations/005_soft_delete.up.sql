ALTER TABLE projects ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE epics    ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE items    ADD COLUMN deleted_at TIMESTAMPTZ;

-- Live queries never scan trash
CREATE INDEX idx_projects_board_live ON projects(board_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_epics_board_live    ON epics(board_id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_items_board_live    ON items(board_id)    WHERE deleted_at IS NULL;

-- Trash queries: find children by cascade batch
CREATE INDEX idx_items_deleted_at ON items(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_epics_deleted_at  ON epics(deleted_at) WHERE deleted_at IS NOT NULL;
