package auth

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repo struct {
	db *pgxpool.Pool
}

func NewRepo(db *pgxpool.Pool) *Repo {
	return &Repo{db: db}
}

func (r *Repo) UpsertUser(ctx context.Context, googleID, email, displayName, avatarURL string) (*User, error) {
	prefix := defaultPrefix(displayName)

	var u User
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (google_id, email, display_name, avatar_url, id_prefix)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (google_id) DO UPDATE SET
			email = EXCLUDED.email,
			display_name = EXCLUDED.display_name,
			avatar_url = EXCLUDED.avatar_url,
			updated_at = NOW()
		RETURNING id, google_id, email, display_name, avatar_url, id_prefix, created_at, updated_at
	`, googleID, email, displayName, avatarURL, prefix).Scan(
		&u.ID, &u.GoogleID, &u.Email, &u.DisplayName, &u.AvatarURL, &u.IDPrefix, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert user: %w", err)
	}
	return &u, nil
}

func (r *Repo) GetUserByID(ctx context.Context, id string) (*User, error) {
	var u User
	err := r.db.QueryRow(ctx, `
		SELECT id, google_id, email, display_name, avatar_url, id_prefix, created_at, updated_at
		FROM users WHERE id = $1
	`, id).Scan(
		&u.ID, &u.GoogleID, &u.Email, &u.DisplayName, &u.AvatarURL, &u.IDPrefix, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return &u, nil
}

func (r *Repo) IsNewUser(ctx context.Context, googleID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE google_id = $1)`, googleID).Scan(&exists)
	if err != nil {
		return false, err
	}
	return !exists, nil
}

func defaultPrefix(displayName string) string {
	name := strings.TrimSpace(displayName)
	if len(name) >= 3 {
		return strings.ToUpper(name[:3])
	}
	if len(name) > 0 {
		return strings.ToUpper(name)
	}
	return "USR"
}
