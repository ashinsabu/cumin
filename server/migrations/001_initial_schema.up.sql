CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR NOT NULL UNIQUE,
    email VARCHAR NOT NULL UNIQUE,
    display_name VARCHAR NOT NULL,
    avatar_url VARCHAR NOT NULL DEFAULT '',
    id_prefix VARCHAR(5) NOT NULL DEFAULT 'USR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR NOT NULL,
    sprint_cadence_days INT NOT NULL DEFAULT 7,
    sprint_start_day SMALLINT NOT NULL DEFAULT 3,
    available_hours_per_sprint INT NOT NULL DEFAULT 20,
    item_seq BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_boards_user ON boards(user_id) WHERE deleted_at IS NULL;

CREATE TABLE statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    position INT NOT NULL DEFAULT 0,
    is_initial BOOLEAN NOT NULL DEFAULT false,
    is_done BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(board_id, position)
);

CREATE INDEX idx_statuses_board ON statuses(board_id);
