package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var (
	// ErrRefreshInvalid: unknown, expired or revoked refresh token.
	ErrRefreshInvalid = errors.New("invalid refresh token")
	// ErrRefreshReused: an already-rotated token came back outside the grace window, which means
	// two parties hold it (theft). The whole family has been revoked by the time this is returned.
	ErrRefreshReused = errors.New("refresh token reused")
)

// RefreshPolicy bounds a login. Idle slides on every rotation; MaxLifetime is the absolute cap from
// login. Grace is how long a just-rotated token may be presented again without it counting as theft
// (two tabs refreshing at once, or a response lost on the way to the client).
type RefreshPolicy struct {
	Idle        time.Duration
	MaxLifetime time.Duration
	Grace       time.Duration
}

const (
	defaultRefreshIdle     = 7 * 24 * time.Hour
	defaultRefreshLifetime = 30 * 24 * time.Hour
	defaultRefreshGrace    = 10 * time.Second
)

func (p RefreshPolicy) withDefaults() RefreshPolicy {
	if p.Idle <= 0 {
		p.Idle = defaultRefreshIdle
	}
	if p.MaxLifetime <= 0 {
		p.MaxLifetime = defaultRefreshLifetime
	}
	if p.Grace <= 0 {
		p.Grace = defaultRefreshGrace
	}
	return p
}

// CreateRefreshFamily starts a new login (family) for the user and returns its first raw token.
func (r *Repo) CreateRefreshFamily(ctx context.Context, userID string, p RefreshPolicy) (string, error) {
	p = p.withDefaults()
	raw, err := randomToken()
	if err != nil {
		return "", err
	}
	now := time.Now()
	_, err = r.db.Exec(ctx, `
		INSERT INTO refresh_tokens (token_hash, user_id, family_id, expires_at, family_expires_at)
		VALUES ($1, $2, gen_random_uuid(), $3, $4)`,
		hashToken(raw), userID, now.Add(min(p.Idle, p.MaxLifetime)), now.Add(p.MaxLifetime))
	if err != nil {
		return "", fmt.Errorf("create refresh family: %w", err)
	}
	return raw, nil
}

// RotateRefresh exchanges a valid refresh token for a fresh one in the same family. The old token
// is marked rotated, not deleted, so a replay can be told apart from an unknown token.
func (r *Repo) RotateRefresh(ctx context.Context, raw string, p RefreshPolicy) (userID, newRaw string, err error) {
	p = p.withDefaults()
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return "", "", err
	}
	defer tx.Rollback(ctx)

	var (
		familyID                   string
		expiresAt, familyExpiresAt time.Time
		rotatedAt, revokedAt       *time.Time
	)
	err = tx.QueryRow(ctx, `
		SELECT user_id, family_id, expires_at, family_expires_at, rotated_at, revoked_at
		FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`, hashToken(raw)).
		Scan(&userID, &familyID, &expiresAt, &familyExpiresAt, &rotatedAt, &revokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrRefreshInvalid
	}
	if err != nil {
		return "", "", err
	}
	now := time.Now()
	if revokedAt != nil || now.After(expiresAt) || now.After(familyExpiresAt) {
		return "", "", ErrRefreshInvalid
	}
	switch {
	case rotatedAt == nil:
		if _, err = tx.Exec(ctx, `UPDATE refresh_tokens SET rotated_at = $2 WHERE token_hash = $1`, hashToken(raw), now); err != nil {
			return "", "", err
		}
	case now.Sub(*rotatedAt) > p.Grace:
		// Revoke and commit, then report: the revocation must survive the error return.
		if _, err = tx.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL`, familyID, now); err != nil {
			return "", "", err
		}
		if err = tx.Commit(ctx); err != nil {
			return "", "", err
		}
		return "", "", ErrRefreshReused
	}
	// Within grace the sibling token is issued without touching rotated_at, so the window does not
	// slide forward with every retry.

	newRaw, err = randomToken()
	if err != nil {
		return "", "", err
	}
	if _, err = tx.Exec(ctx, `
		INSERT INTO refresh_tokens (token_hash, user_id, family_id, expires_at, family_expires_at)
		VALUES ($1, $2, $3, $4, $5)`,
		hashToken(newRaw), userID, familyID, minTime(now.Add(p.Idle), familyExpiresAt), familyExpiresAt); err != nil {
		return "", "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", "", err
	}
	return userID, newRaw, nil
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

// RevokeRefreshFamily ends the login the token belongs to. Unknown tokens are a no-op, so logout is
// idempotent.
func (r *Repo) RevokeRefreshFamily(ctx context.Context, raw string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = NOW()
		WHERE revoked_at IS NULL AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
		hashToken(raw))
	return err
}

// PurgeExpiredRefresh deletes tokens that can no longer be used, keeping rotated/revoked rows a day
// so reuse detection still works for recently rotated tokens.
func (r *Repo) PurgeExpiredRefresh(ctx context.Context) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM refresh_tokens
		WHERE expires_at < NOW() - INTERVAL '1 day' OR family_expires_at < NOW() - INTERVAL '1 day'`)
	return err
}
