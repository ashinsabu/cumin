-- Revert to the original FK constraints without ON DELETE SET NULL.
ALTER TABLE status_transitions
  DROP CONSTRAINT status_transitions_from_status_id_fkey,
  DROP CONSTRAINT status_transitions_to_status_id_fkey;

ALTER TABLE status_transitions
  ADD CONSTRAINT status_transitions_from_status_id_fkey
    FOREIGN KEY (from_status_id) REFERENCES statuses(id),
  ADD CONSTRAINT status_transitions_to_status_id_fkey
    FOREIGN KEY (to_status_id) REFERENCES statuses(id);
