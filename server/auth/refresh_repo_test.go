package auth

import (
	"context"
	"errors"
	"testing"
	"time"
)

var testPolicy = RefreshPolicy{Idle: time.Hour, MaxLifetime: 3 * time.Hour, Grace: 5 * time.Second}

func refreshUser(t *testing.T) (*Repo, *User, context.Context) {
	t.Helper()
	repo, email, ctx := newRepoEnv(t)
	u, err := repo.CreatePasswordUser(ctx, email, "h", "Refresh Tester")
	if err != nil {
		t.Fatal(err)
	}
	return repo, u, ctx
}

// backdate shifts a column of the token's row into the past to simulate elapsed time.
func backdate(t *testing.T, repo *Repo, raw, column string, ago time.Duration) {
	t.Helper()
	if _, err := repo.db.Exec(context.Background(),
		`UPDATE refresh_tokens SET `+column+` = NOW() - $2::interval WHERE token_hash = $1`,
		hashToken(raw), ago.String()); err != nil {
		t.Fatal(err)
	}
}

func TestRefresh_RotationIssuesNewTokenAndKeepsFamily(t *testing.T) {
	repo, u, ctx := refreshUser(t)
	first, err := repo.CreateRefreshFamily(ctx, u.ID, testPolicy)
	if err != nil {
		t.Fatal(err)
	}
	uid, second, err := repo.RotateRefresh(ctx, first, testPolicy)
	if err != nil || uid != u.ID || second == "" || second == first {
		t.Fatalf("rotate = %q %q %v, want same user and a new token", uid, second, err)
	}
	if _, _, err := repo.RotateRefresh(ctx, second, testPolicy); err != nil {
		t.Errorf("rotating the new token: %v", err)
	}
	var families int
	repo.db.QueryRow(ctx, `SELECT count(DISTINCT family_id) FROM refresh_tokens WHERE user_id = $1`, u.ID).Scan(&families)
	if families != 1 {
		t.Errorf("families = %d, want 1 (rotation must stay in one family)", families)
	}
}

func TestRefresh_UnknownToken(t *testing.T) {
	repo, _, ctx := refreshUser(t)
	if _, _, err := repo.RotateRefresh(ctx, "nope", testPolicy); !errors.Is(err, ErrRefreshInvalid) {
		t.Fatalf("err = %v, want ErrRefreshInvalid", err)
	}
}

// A rotated token presented again after the grace window means it was copied: the whole family,
// including the newest token the thief or the owner holds, must die.
func TestRefresh_ReuseAfterGraceRevokesFamily(t *testing.T) {
	repo, u, ctx := refreshUser(t)
	first, _ := repo.CreateRefreshFamily(ctx, u.ID, testPolicy)
	_, second, _ := repo.RotateRefresh(ctx, first, testPolicy)
	backdate(t, repo, first, "rotated_at", time.Minute)

	if _, _, err := repo.RotateRefresh(ctx, first, testPolicy); !errors.Is(err, ErrRefreshReused) {
		t.Fatalf("replay err = %v, want ErrRefreshReused", err)
	}
	if _, _, err := repo.RotateRefresh(ctx, second, testPolicy); !errors.Is(err, ErrRefreshInvalid) {
		t.Errorf("newest token after theft = %v, want ErrRefreshInvalid (family revoked and the revocation committed)", err)
	}
}

// Two tabs (or a retry after a lost response) present the same token within seconds. That must
// succeed without revoking anything.
func TestRefresh_ReuseWithinGraceIsTolerated(t *testing.T) {
	repo, u, ctx := refreshUser(t)
	first, _ := repo.CreateRefreshFamily(ctx, u.ID, testPolicy)
	_, a, err := repo.RotateRefresh(ctx, first, testPolicy)
	if err != nil {
		t.Fatal(err)
	}
	_, b, err := repo.RotateRefresh(ctx, first, testPolicy)
	if err != nil || b == a {
		t.Fatalf("second rotate within grace = %q, %v; want a distinct sibling token", b, err)
	}
	for name, tok := range map[string]string{"a": a, "b": b} {
		if _, _, err := repo.RotateRefresh(ctx, tok, testPolicy); err != nil {
			t.Errorf("token %s unusable after grace retry: %v", name, err)
		}
	}
}

func TestRefresh_Expiry(t *testing.T) {
	t.Run("idle deadline", func(t *testing.T) {
		repo, u, ctx := refreshUser(t)
		tok, _ := repo.CreateRefreshFamily(ctx, u.ID, testPolicy)
		backdate(t, repo, tok, "expires_at", time.Minute)
		if _, _, err := repo.RotateRefresh(ctx, tok, testPolicy); !errors.Is(err, ErrRefreshInvalid) {
			t.Fatalf("err = %v, want ErrRefreshInvalid", err)
		}
	})
	t.Run("absolute lifetime", func(t *testing.T) {
		repo, u, ctx := refreshUser(t)
		tok, _ := repo.CreateRefreshFamily(ctx, u.ID, testPolicy)
		backdate(t, repo, tok, "family_expires_at", time.Minute)
		if _, _, err := repo.RotateRefresh(ctx, tok, testPolicy); !errors.Is(err, ErrRefreshInvalid) {
			t.Fatalf("err = %v, want ErrRefreshInvalid", err)
		}
	})
	t.Run("rotation slides idle but never past the absolute cap", func(t *testing.T) {
		repo, u, ctx := refreshUser(t)
		p := RefreshPolicy{Idle: 2 * time.Hour, MaxLifetime: time.Hour}
		tok, _ := repo.CreateRefreshFamily(ctx, u.ID, p)
		_, next, err := repo.RotateRefresh(ctx, tok, p)
		if err != nil {
			t.Fatal(err)
		}
		var exp, famExp time.Time
		repo.db.QueryRow(ctx, `SELECT expires_at, family_expires_at FROM refresh_tokens WHERE token_hash = $1`, hashToken(next)).Scan(&exp, &famExp)
		if exp.After(famExp) {
			t.Errorf("idle expiry %v is past the family cap %v", exp, famExp)
		}
	})
}

func TestRefresh_RevokeFamily(t *testing.T) {
	repo, u, ctx := refreshUser(t)
	a, _ := repo.CreateRefreshFamily(ctx, u.ID, testPolicy)
	other, _ := repo.CreateRefreshFamily(ctx, u.ID, testPolicy) // a second device
	_, a2, _ := repo.RotateRefresh(ctx, a, testPolicy)

	if err := repo.RevokeRefreshFamily(ctx, a2); err != nil {
		t.Fatal(err)
	}
	if _, _, err := repo.RotateRefresh(ctx, a2, testPolicy); !errors.Is(err, ErrRefreshInvalid) {
		t.Errorf("revoked token = %v, want ErrRefreshInvalid", err)
	}
	if _, _, err := repo.RotateRefresh(ctx, other, testPolicy); err != nil {
		t.Errorf("logging out one device ended another: %v", err)
	}
	if err := repo.RevokeRefreshFamily(ctx, "never-existed"); err != nil {
		t.Errorf("revoking an unknown token = %v, want no-op", err)
	}
}

func TestRefresh_Purge(t *testing.T) {
	repo, u, ctx := refreshUser(t)
	dead, _ := repo.CreateRefreshFamily(ctx, u.ID, testPolicy)
	live, _ := repo.CreateRefreshFamily(ctx, u.ID, testPolicy)
	backdate(t, repo, dead, "expires_at", 48*time.Hour)
	if err := repo.PurgeExpiredRefresh(ctx); err != nil {
		t.Fatal(err)
	}
	count := func(raw string) (n int) {
		repo.db.QueryRow(ctx, `SELECT count(*) FROM refresh_tokens WHERE token_hash = $1`, hashToken(raw)).Scan(&n)
		return
	}
	if count(dead) != 0 || count(live) != 1 {
		t.Errorf("dead=%d live=%d, want 0 and 1", count(dead), count(live))
	}
}

// Regression guard for the atomic reset: the token, the new password and the revocation of every
// login commit together.
func TestRepo_ResetPassword(t *testing.T) {
	t.Run("sets password, verifies email, revokes all logins, burns the token", func(t *testing.T) {
		repo, u, ctx := refreshUser(t)
		login, _ := repo.CreateRefreshFamily(ctx, u.ID, testPolicy)
		resetTok, _ := repo.CreateToken(ctx, u.ID, purposeResetPassword, time.Hour)

		uid, err := repo.ResetPassword(ctx, resetTok, "new-hash")
		if err != nil || uid != u.ID {
			t.Fatalf("reset = %q, %v", uid, err)
		}
		got, _ := repo.GetUserByID(ctx, u.ID)
		if got.PasswordHash != "new-hash" || got.EmailVerifiedAt == nil {
			t.Errorf("user = %+v, want new password and verified email", got)
		}
		if _, _, err := repo.RotateRefresh(ctx, login, testPolicy); !errors.Is(err, ErrRefreshInvalid) {
			t.Errorf("old login survived the reset: %v", err)
		}
		if _, err := repo.ResetPassword(ctx, resetTok, "again"); !errors.Is(err, ErrInvalidToken) {
			t.Errorf("reusing the reset link = %v, want ErrInvalidToken", err)
		}
	})
	t.Run("wrong purpose or unknown token changes nothing", func(t *testing.T) {
		repo, u, ctx := refreshUser(t)
		login, _ := repo.CreateRefreshFamily(ctx, u.ID, testPolicy)
		verifyTok, _ := repo.CreateToken(ctx, u.ID, purposeVerifyEmail, time.Hour)
		if _, err := repo.ResetPassword(ctx, verifyTok, "x"); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("verify token used as reset = %v, want ErrInvalidToken", err)
		}
		if _, _, err := repo.RotateRefresh(ctx, login, testPolicy); err != nil {
			t.Errorf("a rejected reset revoked logins: %v", err)
		}
	})
}
