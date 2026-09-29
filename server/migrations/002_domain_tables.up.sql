CREATE TABLE epics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    type VARCHAR NOT NULL DEFAULT 'catchall' CHECK (type IN ('recurring', 'goal', 'catchall')),
    color VARCHAR NOT NULL DEFAULT '#6b7280',
    deadline TIMESTAMPTZ,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_epics_board ON epics(board_id);

CREATE TABLE sprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    state VARCHAR NOT NULL DEFAULT 'planning' CHECK (state IN ('planning', 'active', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sprints_board ON sprints(board_id);
CREATE UNIQUE INDEX idx_sprints_active ON sprints(board_id) WHERE state = 'active';

CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    epic_id UUID REFERENCES epics(id) ON DELETE SET NULL,
    sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
    status_id UUID NOT NULL REFERENCES statuses(id),
    display_id VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority SMALLINT NOT NULL DEFAULT 4 CHECK (priority BETWEEN 0 AND 4),
    estimate_minutes INT,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_items_display_id ON items(board_id, display_id);
CREATE INDEX idx_items_board_sprint ON items(board_id, sprint_id);
CREATE INDEX idx_items_status ON items(status_id);
CREATE INDEX idx_items_epic ON items(epic_id);

CREATE TABLE status_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    from_status_id UUID REFERENCES statuses(id),
    to_status_id UUID NOT NULL REFERENCES statuses(id),
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transitions_item ON status_transitions(item_id);
CREATE INDEX idx_transitions_time ON status_transitions(item_id, transitioned_at DESC);
