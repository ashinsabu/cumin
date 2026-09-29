ALTER TABLE boards DROP CONSTRAINT IF EXISTS boards_user_id_unique;
ALTER TABLE sprints DROP COLUMN IF EXISTS sprint_number;
ALTER TABLE boards DROP COLUMN IF EXISTS sprint_seq;
