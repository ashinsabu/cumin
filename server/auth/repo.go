package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrEmailTaken   = errors.New("email already registered")
	ErrInvalidToken = errors.New("invalid or expired token")
)

type tokenPurpose string

const (
	purposeVerifyEmail   tokenPurpose = "verify_email"
	purposeResetPassword tokenPurpose = "reset_password"
)

type Repo struct {
	db *pgxpool.Pool
}

func NewRepo(db *pgxpool.Pool) *Repo {
	return &Repo{db: db}
}

// userColumns must stay in sync with scanUser. google_id is nullable for password accounts.
const userColumns = `id, COALESCE(google_id, ''), email, display_name, avatar_url, id_prefix,
	COALESCE(password_hash, ''), email_verified_at, created_at, updated_at`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.GoogleID, &u.Email, &u.DisplayName, &u.AvatarURL, &u.IDPrefix,
		&u.PasswordHash, &u.EmailVerifiedAt, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// UpsertGoogleUser resolves a verified Google identity to a user:
//  1. known google_id: refresh profile;
//  2. existing account with the same email (password signup): link google_id and mark the email verified.
//     A password set while the email was still unverified is cleared, so whoever pre-registered the
//     address cannot keep a way in;
//  3. otherwise create a new verified user.
func (r *Repo) UpsertGoogleUser(ctx context.Context, googleID, email, displayName, avatarURL string) (*User, error) {
	email = normalizeEmail(email)
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("upsert google user: %w", err)
	}
	defer tx.Rollback(ctx)

	u, err := scanUser(tx.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE google_id = $1 FOR UPDATE`, googleID))
	switch {
	case err == nil:
		u, err = scanUser(tx.QueryRow(ctx, `
			UPDATE users SET email = $2, display_name = $3, avatar_url = $4, updated_at = NOW()
			WHERE id = $1 RETURNING `+userColumns, u.ID, email, displayName, avatarURL))
	case errors.Is(err, pgx.ErrNoRows):
		u, err = r.linkOrCreateGoogleUser(ctx, tx, googleID, email, displayName, avatarURL)
	}
	if err != nil {
		return nil, fmt.Errorf("upsert google user: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("upsert google user: %w", err)
	}
	return u, nil
}

func (r *Repo) linkOrCreateGoogleUser(ctx context.Context, tx pgx.Tx, googleID, email, displayName, avatarURL string) (*User, error) {
	existing, err := scanUser(tx.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE lower(email) = $1 FOR UPDATE`, email))
	if err == nil {
		// CASE order matters: password_hash is evaluated against the pre-update email_verified_at.
		return scanUser(tx.QueryRow(ctx, `
			UPDATE users SET
				google_id = $2,
				avatar_url = CASE WHEN avatar_url = '' THEN $3 ELSE avatar_url END,
				password_hash = CASE WHEN email_verified_at IS NULL THEN NULL ELSE password_hash END,
				email_verified_at = COALESCE(email_verified_at, NOW()),
				updated_at = NOW()
			WHERE id = $1 RETURNING `+userColumns, existing.ID, googleID, avatarURL))
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	return scanUser(tx.QueryRow(ctx, `
		INSERT INTO users (google_id, email, display_name, avatar_url, id_prefix, email_verified_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		RETURNING `+userColumns, googleID, email, displayName, avatarURL, defaultPrefix(displayName)))
}

func (r *Repo) GetUserByID(ctx context.Context, id string) (*User, error) {
	u, err := scanUser(r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id))
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return u, nil
}

// GetUserByEmail returns pgx.ErrNoRows (wrapped) when no account has the email.
func (r *Repo) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	u, err := scanUser(r.db.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE lower(email) = $1`, normalizeEmail(email)))
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return u, nil
}

// CreatePasswordUser inserts an unverified password account. Returns ErrEmailTaken on conflict.
func (r *Repo) CreatePasswordUser(ctx context.Context, email, passwordHash, displayName string) (*User, error) {
	u, err := scanUser(r.db.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, display_name, id_prefix)
		VALUES ($1, $2, $3, $4)
		RETURNING `+userColumns, normalizeEmail(email), passwordHash, displayName, defaultPrefix(displayName)))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return nil, ErrEmailTaken
	}
	if err != nil {
		return nil, fmt.Errorf("create password user: %w", err)
	}
	return u, nil
}

// OverwriteUnverifiedPassword replaces the credentials of a still-unverified account, so a stranger
// who squatted an address cannot block (or keep access to) its real owner. Returns false if the
// account is already verified (nothing changed).
func (r *Repo) OverwriteUnverifiedPassword(ctx context.Context, userID, passwordHash, displayName string) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE users SET password_hash = $2, display_name = $3, id_prefix = $4, updated_at = NOW()
		WHERE id = $1 AND email_verified_at IS NULL`, userID, passwordHash, displayName, defaultPrefix(displayName))
	if err != nil {
		return false, fmt.Errorf("overwrite unverified password: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

func (r *Repo) MarkEmailVerified(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
		WHERE id = $1`, userID)
	return err
}

// SetPasswordVerified stores a new password after a successful reset. Possessing the reset link
// proves control of the mailbox, so the email counts as verified.
func (r *Repo) SetPasswordVerified(ctx context.Context, userID, passwordHash string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE users SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
		WHERE id = $1`, userID, passwordHash)
	return err
}

// ClaimProvisioning marks the user as provisioned and reports whether this caller won the claim.
// Exactly one caller ever gets true, so default data is created once even under concurrent logins.
func (r *Repo) ClaimProvisioning(ctx context.Context, userID string) (bool, error) {
	tag, err := r.db.Exec(ctx,
		`UPDATE users SET provisioned_at = NOW() WHERE id = $1 AND provisioned_at IS NULL`, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// ReleaseProvisioning undoes a claim after provisioning failed so the next login retries.
func (r *Repo) ReleaseProvisioning(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET provisioned_at = NULL WHERE id = $1`, userID)
	return err
}

// CreateToken issues a single-use token and invalidates earlier unused tokens of the same purpose.
// Only the sha256 of the token is stored; the raw value is returned for the email link.
func (r *Repo) CreateToken(ctx context.Context, userID string, purpose tokenPurpose, ttl time.Duration) (string, error) {
	raw, err := randomToken()
	if err != nil {
		return "", err
	}
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`, userID, string(purpose)); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at)
		VALUES ($1, $2, $3, NOW() + make_interval(secs => $4))`,
		hashToken(raw), userID, string(purpose), ttl.Seconds()); err != nil {
		return "", err
	}
	return raw, tx.Commit(ctx)
}

// ConsumeToken atomically marks a token used and returns its user. A single UPDATE means two
// concurrent requests with the same token cannot both succeed.
func (r *Repo) ConsumeToken(ctx context.Context, raw string, purpose tokenPurpose) (string, error) {
	var userID string
	err := r.db.QueryRow(ctx, `
		UPDATE auth_tokens SET used_at = NOW()
		WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > NOW()
		RETURNING user_id`, hashToken(raw), string(purpose)).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrInvalidToken
	}
	return userID, err
}

// PurgeExpiredTokens deletes tokens that can no longer be used.
func (r *Repo) PurgeExpiredTokens(ctx context.Context) error {
	_, err := r.db.Exec(ctx,
		`DELETE FROM auth_tokens WHERE expires_at < NOW() - INTERVAL '1 day' OR used_at < NOW() - INTERVAL '1 day'`)
	return err
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// defaultPrefix derives the 3-letter item-ID prefix from a display name. It works on runes (a byte
// slice can split a multi-byte character into invalid UTF-8, which Postgres rejects).
func defaultPrefix(displayName string) string {
	prefix := []rune(strings.ToUpper(strings.TrimSpace(displayName)))
	if len(prefix) == 0 {
		return "USR"
	}
	return string(prefix[:min(len(prefix), 3)])
}
