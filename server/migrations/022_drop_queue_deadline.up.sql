-- Quick tasks are all due today; a deadline field on queue items was a design smell and is gone.
ALTER TABLE queue_items DROP COLUMN IF EXISTS deadline;
