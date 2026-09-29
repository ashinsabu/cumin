-- Sprint sequence counter on board (monotonically increasing, never reused)
ALTER TABLE boards ADD COLUMN sprint_seq INT NOT NULL DEFAULT 0;

-- Sprint number stored on each sprint row
ALTER TABLE sprints ADD COLUMN sprint_number INT NOT NULL DEFAULT 0;

-- Prevent double-provisioning: one board per user
ALTER TABLE boards ADD CONSTRAINT boards_user_id_unique UNIQUE (user_id);
