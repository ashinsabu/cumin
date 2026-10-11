-- Reverse of phase 3 (structural only — data is not restored).
CREATE TABLE IF NOT EXISTS boards (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(id),
    name                     TEXT NOT NULL DEFAULT 'Board',
    sprint_cadence_days      INT  NOT NULL DEFAULT 14,
    sprint_start_day         SMALLINT NOT NULL DEFAULT 3,
    available_hours_per_sprint INT NOT NULL DEFAULT 20,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE statuses    ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES boards(id);
ALTER TABLE epics       ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES boards(id);
ALTER TABLE sprints     ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES boards(id);
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES boards(id);
ALTER TABLE projects    ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES boards(id);
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES boards(id);

DROP INDEX IF EXISTS idx_sprints_active;
CREATE UNIQUE INDEX idx_sprints_active ON sprints (project_id) WHERE state = 'active';
