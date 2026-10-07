CREATE TABLE saved_views (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    filters    JSONB NOT NULL DEFAULT '{}',
    position   INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_saved_views_board ON saved_views(board_id);

-- Filter performance indexes for multi-dimension queries
CREATE INDEX idx_items_status_filter   ON items(board_id, status_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_items_project_filter  ON items(board_id, project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_items_epic_filter     ON items(board_id, epic_id)    WHERE deleted_at IS NULL AND epic_id IS NOT NULL;
CREATE INDEX idx_items_priority_filter ON items(board_id, priority)   WHERE deleted_at IS NULL;
