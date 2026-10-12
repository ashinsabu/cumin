-- Phase 2: add user_id/sprint_seq to projects; user_id to epics/queue_items; backfill sprints.project_id

-- Projects: direct user ownership + move sprint counter
ALTER TABLE projects ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE projects ADD COLUMN sprint_seq INT NOT NULL DEFAULT 0;
UPDATE projects p SET user_id = b.user_id, sprint_seq = b.sprint_seq
FROM boards b WHERE b.id = p.board_id;
ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX idx_projects_user ON projects (user_id) WHERE deleted_at IS NULL;

-- Epics: direct user ownership
ALTER TABLE epics ADD COLUMN user_id UUID REFERENCES users(id);
UPDATE epics e SET user_id = b.user_id FROM boards b WHERE b.id = e.board_id;
ALTER TABLE epics ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX idx_epics_user ON epics (user_id) WHERE deleted_at IS NULL;

-- Sprints: backfill project_id for any rows inserted before this phase
UPDATE sprints s SET project_id = (
    SELECT p.id FROM projects p
    WHERE p.board_id = s.board_id AND p.deleted_at IS NULL
    ORDER BY p.created_at LIMIT 1
) WHERE s.project_id IS NULL;
CREATE INDEX idx_sprints_project ON sprints (project_id);

-- Queue items: direct user ownership
ALTER TABLE queue_items ADD COLUMN user_id UUID REFERENCES users(id);
UPDATE queue_items qi SET user_id = b.user_id FROM boards b WHERE b.id = qi.board_id;
ALTER TABLE queue_items ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX idx_queue_items_user ON queue_items (user_id) WHERE deleted_at IS NULL;
