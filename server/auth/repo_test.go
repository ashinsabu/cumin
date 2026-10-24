package auth

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func newRepoEnv(t *testing.T) (*Repo, string, context.Context) {
	t.Helper()
	pool := testPool(t)
	return NewRepo(pool), uniqueEmail(t, pool), context.Background()
}

func TestRepo_UpsertGoogleUser(t *testing.T) {
	t.Run("new identity creates a verified user without a password", func(t *testing.T) {
		repo, email, ctx := newRepoEnv(t)
		u, err := repo.UpsertGoogleUser(ctx, "g-"+email, email, "Grace Hopper", "http://pic")
		if err != nil {
			t.Fatal(err)
		}
		if u.EmailVerifiedAt == nil || u.PasswordHash != "" || u.GoogleID != "g-"+email || u.IDPrefix != "GRA" {
			t.Errorf("user = %+v, want verified, no password, google id set, prefix GRA", u)
		}
	})
	t.Run("known google id refreshes the profile and keeps the account", func(t *testing.T) {
		repo, email, ctx := newRepoEnv(t)
		first, _ := repo.UpsertGoogleUser(ctx, "g-"+email, email, "Old Name", "old")
		again, err := repo.UpsertGoogleUser(ctx, "g-"+email, email, "New Name", "new")
		if err != nil {
			t.Fatal(err)
		}
		if again.ID != first.ID || again.DisplayName != "New Name" || again.AvatarURL != "new" {
			t.Errorf("got %+v, want same id %s with refreshed profile", again, first.ID)
		}
	})
	t.Run("unverified password account is linked and its password cleared", func(t *testing.T) {
		repo, email, ctx := newRepoEnv(t)
		squatted, err := repo.CreatePasswordUser(ctx, email, "hash-set-by-squatter", "Squatter")
		if err != nil {
			t.Fatal(err)
		}
		linked, err := repo.UpsertGoogleUser(ctx, "g-"+email, email, "Real Owner", "pic")
		if err != nil {
			t.Fatal(err)
		}
		if linked.ID != squatted.ID {
			t.Fatalf("created a second account (%s vs %s) instead of linking", linked.ID, squatted.ID)
		}
		if linked.EmailVerifiedAt == nil {
			t.Error("linked account not marked verified")
		}
		if linked.PasswordHash != "" {
			t.Error("squatter's password survived the link: pre-registration takeover")
		}
	})
	t.Run("verified password account keeps its password when linked", func(t *testing.T) {
		repo, email, ctx := newRepoEnv(t)
		u, _ := repo.CreatePasswordUser(ctx, email, "real-hash", "Owner")
		repo.MarkEmailVerified(ctx, u.ID)
		linked, err := repo.UpsertGoogleUser(ctx, "g-"+email, email, "Owner", "pic")
		if err != nil {
			t.Fatal(err)
		}
		if linked.ID != u.ID || linked.PasswordHash != "real-hash" {
			t.Errorf("linked = %+v, want same id and password preserved", linked)
		}
	})
	t.Run("email match ignores case", func(t *testing.T) {
		repo, email, ctx := newRepoEnv(t)
		u, _ := repo.CreatePasswordUser(ctx, email, "h", "N")
		linked, err := repo.UpsertGoogleUser(ctx, "g-"+email, "  "+email+"  ", "N", "")
		if err != nil || linked.ID != u.ID {
			t.Fatalf("err=%v linked=%+v, want link to %s", err, linked, u.ID)
		}
	})
	t.Run("existing avatar is not overwritten on link", func(t *testing.T) {
		repo, email, ctx := newRepoEnv(t)
		u, _ := repo.CreatePasswordUser(ctx, email, "h", "N")
		if _, err := repo.db.Exec(ctx, `UPDATE users SET avatar_url = 'mine' WHERE id = $1`, u.ID); err != nil {
			t.Fatal(err)
		}
		linked, _ := repo.UpsertGoogleUser(ctx, "g-"+email, email, "N", "google-pic")
		if linked.AvatarURL != "mine" {
			t.Errorf("avatar = %q, want the existing one kept", linked.AvatarURL)
		}
	})
}

func TestRepo_CreatePasswordUser(t *testing.T) {
	repo, email, ctx := newRepoEnv(t)
	u, err := repo.CreatePasswordUser(ctx, email, "hash", "Ada Lovelace")
	if err != nil {
		t.Fatal(err)
	}
	if u.EmailVerifiedAt != nil || u.GoogleID != "" || u.PasswordHash != "hash" || u.IDPrefix != "ADA" {
		t.Errorf("user = %+v, want unverified password account with prefix ADA", u)
	}
	// The schema's UNIQUE(email) is case-sensitive, so the code normalizes on write: another casing
	// of the same mailbox must collide instead of creating a second account.
	if _, err := repo.CreatePasswordUser(ctx, "  "+strings.ToUpper(email)+"  ", "h", "x"); !errors.Is(err, ErrEmailTaken) {
		t.Errorf("same address in other casing err = %v, want ErrEmailTaken", err)
	}
	if _, err := repo.CreatePasswordUser(ctx, email, "h2", "Dup"); !errors.Is(err, ErrEmailTaken) {
		t.Errorf("duplicate signup err = %v, want ErrEmailTaken", err)
	}
}

func TestRepo_OverwriteUnverifiedPassword(t *testing.T) {
	repo, email, ctx := newRepoEnv(t)
	u, _ := repo.CreatePasswordUser(ctx, email, "old", "Old")

	replaced, err := repo.OverwriteUnverifiedPassword(ctx, u.ID, "new", "New")
	if err != nil || !replaced {
		t.Fatalf("replaced=%v err=%v, want true", replaced, err)
	}
	repo.MarkEmailVerified(ctx, u.ID)
	replaced, err = repo.OverwriteUnverifiedPassword(ctx, u.ID, "attacker", "Evil")
	if err != nil || replaced {
		t.Fatalf("replaced=%v err=%v, want false once verified", replaced, err)
	}
	got, _ := repo.GetUserByID(ctx, u.ID)
	if got.PasswordHash != "new" || got.DisplayName != "New" {
		t.Errorf("verified account changed: %+v", got)
	}
}

func TestRepo_GetUserByEmail(t *testing.T) {
	repo, email, ctx := newRepoEnv(t)
	u, _ := repo.CreatePasswordUser(ctx, email, "h", "N")
	got, err := repo.GetUserByEmail(ctx, "  "+email+"  ")
	if err != nil || got.ID != u.ID {
		t.Fatalf("lookup with padding: err=%v got=%+v", err, got)
	}
	if _, err := repo.GetUserByEmail(ctx, "nobody-"+email); err == nil {
		t.Error("expected an error for an unknown email")
	}
}

func TestRepo_ClaimProvisioning(t *testing.T) {
	repo, email, ctx := newRepoEnv(t)
	u, _ := repo.CreatePasswordUser(ctx, email, "h", "N")

	// Concurrent first logins: exactly one may provision.
	const n = 10
	var wins atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ok, err := repo.ClaimProvisioning(ctx, u.ID); err == nil && ok {
				wins.Add(1)
			}
		}()
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatalf("%d callers won the claim, want exactly 1", wins.Load())
	}

	// After a failed provision the claim is released so the next login retries.
	if err := repo.ReleaseProvisioning(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	if ok, _ := repo.ClaimProvisioning(ctx, u.ID); !ok {
		t.Error("claim after release was refused")
	}
	if ok, _ := repo.ClaimProvisioning(ctx, u.ID); ok {
		t.Error("claim granted twice in a row")
	}
}

func TestRepo_Tokens(t *testing.T) {
	t.Run("only a hash is stored", func(t *testing.T) {
		repo, email, ctx := newRepoEnv(t)
		u, _ := repo.CreatePasswordUser(ctx, email, "h", "N")
		raw, err := repo.CreateToken(ctx, u.ID, purposeVerifyEmail, time.Hour)
		if err != nil {
			t.Fatal(err)
		}
		var n int
		repo.db.QueryRow(ctx, `SELECT count(*) FROM auth_tokens WHERE token_hash = $1`, raw).Scan(&n)
		if n != 0 {
			t.Error("raw token found in the table")
		}
		repo.db.QueryRow(ctx, `SELECT count(*) FROM auth_tokens WHERE token_hash = $1`, hashToken(raw)).Scan(&n)
		if n != 1 {
			t.Error("hashed token not stored")
		}
	})
	t.Run("a new token supersedes earlier unused ones of the same purpose only", func(t *testing.T) {
		repo, email, ctx := newRepoEnv(t)
		u, _ := repo.CreatePasswordUser(ctx, email, "h", "N")
		oldVerify, _ := repo.CreateToken(ctx, u.ID, purposeVerifyEmail, time.Hour)
		reset, _ := repo.CreateToken(ctx, u.ID, purposeResetPassword, time.Hour)
		newVerify, _ := repo.CreateToken(ctx, u.ID, purposeVerifyEmail, time.Hour)

		if _, err := repo.ConsumeToken(ctx, oldVerify, purposeVerifyEmail); !errors.Is(err, ErrInvalidToken) {
			t.Errorf("superseded token err = %v, want ErrInvalidToken", err)
		}
		if _, err := repo.ConsumeToken(ctx, reset, purposeResetPassword); err != nil {
			t.Errorf("token of another purpose was invalidated: %v", err)
		}
		if id, err := repo.ConsumeToken(ctx, newVerify, purposeVerifyEmail); err != nil || id != u.ID {
			t.Errorf("fresh token: id=%q err=%v", id, err)
		}
	})
	t.Run("purpose must match", func(t *testing.T) {
		repo, email, ctx := newRepoEnv(t)
		u, _ := repo.CreatePasswordUser(ctx, email, "h", "N")
		raw, _ := repo.CreateToken(ctx, u.ID, purposeVerifyEmail, time.Hour)
		if _, err := repo.ConsumeToken(ctx, raw, purposeResetPassword); !errors.Is(err, ErrInvalidToken) {
			t.Errorf("err = %v, want ErrInvalidToken", err)
		}
		// A failed attempt with the wrong purpose must not consume it.
		if _, err := repo.ConsumeToken(ctx, raw, purposeVerifyEmail); err != nil {
			t.Errorf("token burned by a wrong-purpose attempt: %v", err)
		}
	})
	t.Run("purge removes dead tokens and keeps live ones", func(t *testing.T) {
		repo, email, ctx := newRepoEnv(t)
		u, _ := repo.CreatePasswordUser(ctx, email, "h", "N")
		expired, _ := repo.CreateToken(ctx, u.ID, purposeVerifyEmail, time.Hour)
		repo.db.Exec(ctx, `UPDATE auth_tokens SET expires_at = NOW() - INTERVAL '2 days' WHERE token_hash = $1`, hashToken(expired))
		used, _ := repo.CreateToken(ctx, u.ID, purposeResetPassword, time.Hour)
		repo.ConsumeToken(ctx, used, purposeResetPassword)
		repo.db.Exec(ctx, `UPDATE auth_tokens SET used_at = NOW() - INTERVAL '2 days' WHERE token_hash = $1`, hashToken(used))
		// A second user's live token is the one that must survive.
		liveEmail := uniqueEmail(t, repo.db)
		other, _ := repo.CreatePasswordUser(ctx, liveEmail, "h", "N")
		live, _ := repo.CreateToken(ctx, other.ID, purposeVerifyEmail, time.Hour)

		if err := repo.PurgeExpiredTokens(ctx); err != nil {
			t.Fatal(err)
		}
		count := func(raw string) (n int) {
			repo.db.QueryRow(ctx, `SELECT count(*) FROM auth_tokens WHERE token_hash = $1`, hashToken(raw)).Scan(&n)
			return
		}
		if count(expired) != 0 || count(used) != 0 {
			t.Error("dead tokens were not purged")
		}
		if count(live) != 1 {
			t.Error("live token was purged")
		}
	})
}

func TestRepo_SetPasswordVerified(t *testing.T) {
	repo, email, ctx := newRepoEnv(t)
	u, _ := repo.CreatePasswordUser(ctx, email, "old", "N")
	if err := repo.SetPasswordVerified(ctx, u.ID, "new"); err != nil {
		t.Fatal(err)
	}
	got, _ := repo.GetUserByID(ctx, u.ID)
	if got.PasswordHash != "new" || got.EmailVerifiedAt == nil {
		t.Errorf("user = %+v, want new password and verified email", got)
	}
}
