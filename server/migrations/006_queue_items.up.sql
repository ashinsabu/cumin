CREATE TABLE queue_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id          UUID NOT NULL REFERENCES boards(id),
  created_by        UUID NOT NULL REFERENCES users(id),
  title             TEXT NOT NULL,
  notes             TEXT,
  deadline          TIMESTAMPTZ,
  promoted_item_id  UUID REFERENCES items(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX ON queue_items(board_id) WHERE deleted_at IS NULL;
