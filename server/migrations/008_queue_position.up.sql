ALTER TABLE queue_items ADD COLUMN position INT NOT NULL DEFAULT 0;

-- Set initial positions based on creation order per board
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY board_id ORDER BY created_at ASC) - 1 AS pos
  FROM queue_items
  WHERE deleted_at IS NULL
)
UPDATE queue_items qi SET position = r.pos
FROM ranked r WHERE r.id = qi.id;
