-- Saved view names are unique per user (case-insensitive). Rename existing duplicates first
-- (keep the oldest, suffix the rest with a short id so a generated name can't collide with an existing one) so the unique index can be created on live data.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id, lower(btrim(name)) ORDER BY created_at, id) AS rn
  FROM saved_views
)
UPDATE saved_views v
SET name = btrim(v.name) || ' (' || left(v.id::text, 8) || ')'
FROM ranked r
WHERE v.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX idx_saved_views_user_name ON saved_views (user_id, lower(btrim(name)));
