-- Sprint spillover queries filter only sprint_id (no board_id in WHERE)
CREATE INDEX idx_items_sprint ON items(sprint_id) WHERE sprint_id IS NOT NULL;

-- Backlog: covering index for board+live+unassigned rows, includes sort columns
CREATE INDEX idx_items_backlog ON items(board_id, priority, position)
    WHERE sprint_id IS NULL AND deleted_at IS NULL;

-- Trash list and EmptyTrash need board_id-scoped deleted index
CREATE INDEX idx_items_board_deleted ON items(board_id) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_epics_board_deleted  ON epics(board_id)  WHERE deleted_at IS NOT NULL;
