CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    prefix VARCHAR(5) NOT NULL,
    item_seq BIGINT NOT NULL DEFAULT 0,
    color VARCHAR NOT NULL DEFAULT '#6b7280',
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_projects_board_prefix ON projects(board_id, prefix);
CREATE INDEX idx_projects_board ON projects(board_id);

-- Items now belong to a project (determines prefix + seq)
ALTER TABLE items ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_items_project ON items(project_id);

-- Epics optionally belong to a project
ALTER TABLE epics ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_epics_project ON epics(project_id);
