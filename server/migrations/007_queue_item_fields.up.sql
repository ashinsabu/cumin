ALTER TABLE queue_items
  ADD COLUMN priority INT NOT NULL DEFAULT 2,
  ADD COLUMN estimate_minutes INT;
