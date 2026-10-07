-- The status_transitions table references statuses(id) without ON DELETE SET NULL,
-- which causes DELETE FROM statuses to fail with a FK violation even after all items
-- have been moved off the status (but transitions still reference the old status).
-- Fix: change both FK constraints to SET NULL on delete so that deleting a status
-- nullifies historical transition records that referenced it, rather than blocking.
ALTER TABLE status_transitions
  DROP CONSTRAINT status_transitions_from_status_id_fkey,
  DROP CONSTRAINT status_transitions_to_status_id_fkey;

ALTER TABLE status_transitions
  ADD CONSTRAINT status_transitions_from_status_id_fkey
    FOREIGN KEY (from_status_id) REFERENCES statuses(id) ON DELETE SET NULL,
  ADD CONSTRAINT status_transitions_to_status_id_fkey
    FOREIGN KEY (to_status_id) REFERENCES statuses(id) ON DELETE SET NULL;
