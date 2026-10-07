-- Revert: make to_status_id NOT NULL again.
-- Note: this will fail if any rows have to_status_id = NULL.
ALTER TABLE status_transitions ALTER COLUMN to_status_id SET NOT NULL;
