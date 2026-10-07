-- to_status_id was NOT NULL, which prevented ON DELETE SET NULL from working
-- (migration 010 added that FK behaviour but the NOT NULL constraint blocked it).
-- Make to_status_id nullable so that deleting a status nullifies historical
-- transitions that pointed to it, rather than causing a FK constraint violation.
ALTER TABLE status_transitions ALTER COLUMN to_status_id DROP NOT NULL;
